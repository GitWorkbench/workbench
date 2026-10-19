import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRestorePoint, deleteRestorePoint, listRestorePoints, restorePoint } from '../../src/main/git/restore-points';
import { applySparseCheckout, getSparseCheckout, getSparseDirectories, previewSparseCheckout, restoreSparseLayout } from '../../src/main/git/sparse-checkout';
import { createGitFixture, createMergeConflict, type GitFixture } from './git-fixture';
import { captureResolutionMemory, setResolutionMemory } from '../../src/main/git/resolution-memory';

describe('restore points preserve and recover repository state', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); vi.unstubAllEnvs(); });

  it('snapshots index, worktree and literal untracked paths without touching HEAD, status or stashes', async () => {
    await fixture.write('readme.txt', 'staged version\n'); await fixture.git('add', 'readme.txt');
    await fixture.write('readme.txt', 'working version\n');
    await fixture.write('[untracked] notes.txt', 'untracked contents\n');
    const before = await fixture.git('status', '--porcelain=v1', '-z');
    const point = await createRestorePoint(fixture.repo, ' Before important action ');
    expect(point).toMatchObject({ label: 'Before important action', head: fixture.initialHash, unborn: false, branch: 'main', untrackedCount: 1, worktree: fixture.repo });
    expect(await fixture.git('status', '--porcelain=v1', '-z')).toBe(before);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
    expect(await fixture.git('stash', 'list')).toBe('');
    expect(await fixture.git('show', ':readme.txt')).toBe('staged version\n');
    expect(await listRestorePoints(fixture.repo)).toEqual([point]);
    await fixture.git('reset', '--hard', 'HEAD'); await fixture.git('clean', '-fd');
    const recovery = await restorePoint(fixture.repo, point.id);
    expect(recovery).toMatchObject({ ok: true, branch: expect.stringMatching(/^recovered\/restore-/) });
    expect((await fixture.git('branch', '--show-current')).trim()).toBe(recovery.branch);
    expect(await fixture.git('show', ':readme.txt')).toBe('staged version\n');
    expect(await fixture.read('readme.txt')).toBe('working version\n');
    expect(await fixture.read('[untracked] notes.txt')).toBe('untracked contents\n');
    expect(await listRestorePoints(fixture.repo)).toEqual([point]);
  });

  it('recovers a saved untracked file even if a later commit started tracking that path', async () => {
    await fixture.write('later-tracked.txt', 'saved untracked content\n'); const point = await createRestorePoint(fixture.repo);
    await fixture.write('later-tracked.txt', 'later committed content\n'); await fixture.commitAll('Track the saved path later');
    expect(await restorePoint(fixture.repo, point.id)).toMatchObject({ ok: true }); expect(await fixture.read('later-tracked.txt')).toBe('saved untracked content\n');
    expect(await fixture.git('status', '--porcelain')).toContain('?? later-tracked.txt');
  });

  it('blocks recovery over dirty changes without changing branches or files', async () => {
    const point = await createRestorePoint(fixture.repo);
    await fixture.write('readme.txt', 'valuable current work\n');
    await expect(restorePoint(fixture.repo, point.id)).rejects.toThrow('Commit or stash');
    expect(await fixture.read('readme.txt')).toBe('valuable current work\n');
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
  });

  it('blocks recovery during active Git operations and snapshotting an unmerged index', async () => {
    const point = await createRestorePoint(fixture.repo);
    await createMergeConflict(fixture);
    await expect(createRestorePoint(fixture.repo)).rejects.toThrow('unmerged index');
    await expect(restorePoint(fixture.repo, point.id)).rejects.toThrow('active Git operation');
  });

  it('does not overwrite an ignored file colliding with saved untracked data', async () => {
    await fixture.write('saved.txt', 'saved untracked\n');
    const point = await createRestorePoint(fixture.repo);
    await fixture.git('clean', '-fd');
    await fixture.write('.gitignore', 'saved.txt\n'); await fixture.commitAll('Ignore saved path');
    await fixture.write('saved.txt', 'new ignored work\n');
    await expect(restorePoint(fixture.repo, point.id)).rejects.toThrow('already exists');
    expect(await fixture.read('saved.txt')).toBe('new ignored work\n');
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
  });

  it('scopes saved points to a worktree and rejects malformed or missing ids', async () => {
    const point = await createRestorePoint(fixture.repo, 'A'.repeat(200));
    expect(point.label).toHaveLength(180);
    const linked = path.join(fixture.root, 'linked');
    await fixture.git('worktree', 'add', '--detach', linked, 'HEAD');
    expect(await listRestorePoints(linked)).toEqual([]);
    await expect(restorePoint(linked, point.id)).rejects.toThrow('not found for this worktree');
    await expect(deleteRestorePoint(fixture.repo, '../invalid')).rejects.toThrow('Invalid restore point');
    await deleteRestorePoint(fixture.repo, point.id);
    expect(await listRestorePoints(fixture.repo)).toEqual([]);
    await expect(restorePoint(fixture.repo, point.id)).rejects.toThrow('not found');
  });

  it('preserves initial staged and untracked files in repositories with no first commit', async () => {
    const unborn = await createGitFixture({ 'first.txt': 'staged\n' }, false);
    try {
      await unborn.git('add', 'first.txt'); await unborn.write('first.txt', 'working\n');
      await unborn.write('second.txt', 'untracked\n');
      const point = await createRestorePoint(unborn.repo, '');
      expect(point).toMatchObject({ unborn: true, label: 'Manual restore point', untrackedCount: 1 });
      await expect(unborn.git('rev-parse', '--verify', 'HEAD')).rejects.toThrow();
      expect(await unborn.git('show', ':first.txt')).toBe('staged\n');
      expect(await unborn.read('first.txt')).toBe('working\n');
      expect(await listRestorePoints(unborn.repo)).toEqual([point]);
    } finally { await unborn.cleanup(); }
  });

  it('ignores malformed custom refs while listing valid restore points', async () => {
    const point = await createRestorePoint(fixture.repo);
    await fixture.git('update-ref', 'refs/git-workbench/restore-points/invalid-record', fixture.initialHash);
    expect(await listRestorePoints(fixture.repo)).toEqual([point]);
  });

  it('refuses untracked nested repositories rather than creating an incomplete backup', async () => {
    const nested = path.join(fixture.repo, 'nested-repo');
    await mkdir(nested);
    await fixture.git('-C', nested, 'init', '--initial-branch=main');
    await expect(createRestorePoint(fixture.repo)).rejects.toThrow('nested repository');
    expect(await listRestorePoints(fixture.repo)).toEqual([]);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
  });

  it('supports inherited editor, pager and isolated Git config variables when preparing snapshots and shadow indexes', async () => {
    vi.stubEnv('PAGER', 'git-workbench-test-command-must-not-run');
    vi.stubEnv('GIT_PAGER', 'git-workbench-test-command-must-not-run');
    vi.stubEnv('EDITOR', 'git-workbench-test-command-must-not-run');
    vi.stubEnv('GIT_EDITOR', 'git-workbench-test-command-must-not-run');
    const count = Number(process.env.GIT_CONFIG_COUNT || '0');
    vi.stubEnv('GIT_CONFIG_COUNT', String(count + 1));
    vi.stubEnv(`GIT_CONFIG_KEY_${count}`, 'git-workbench.fixture');
    vi.stubEnv(`GIT_CONFIG_VALUE_${count}`, 'environment remains isolated');
    expect((await fixture.git('config', '--get', 'git-workbench.fixture')).trim()).toBe('environment remains isolated');
    await fixture.write('readme.txt', 'snapshot contents\n');
    const point = await createRestorePoint(fixture.repo, 'Inherited environment regression');
    expect(point.head).toBe(fixture.initialHash);
    expect(await fixture.read('readme.txt')).toBe('snapshot contents\n');
    await fixture.git('restore', 'readme.txt');
    await setResolutionMemory(fixture.repo, true);
    await createMergeConflict(fixture);
    const before = await fixture.read('readme.txt'); const index = await fixture.git('ls-files', '--unmerged');
    expect(await captureResolutionMemory(fixture.repo)).toEqual(new Map());
    expect(await fixture.read('readme.txt')).toBe(before);
    expect(await fixture.git('ls-files', '--unmerged')).toBe(index);
  });
});

describe('sparse checkout previews, safety checks and restoration', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture({ 'README.md': 'root\n', 'app/main.ts': 'app\n', 'app/nested/file.ts': 'nested\n', 'docs/guide.md': 'docs\n', 'docs/assets/logo.txt': 'logo\n', 'unicode café/file.txt': 'unicode\n', '.gitignore': '*.cache\n' }); });
  afterEach(async () => { await fixture.cleanup(); });
  const selection = (state: Awaited<ReturnType<typeof getSparseCheckout>>, directories: string[], disable = false) => ({ head: state.head, fingerprint: state.fingerprint, directories, disable });

  it('lists directory trees, previews counts and leaves files unchanged until apply', async () => {
    const state = await getSparseCheckout(fixture.repo);
    expect(state).toMatchObject({ enabled: false, supported: true, directories: [], head: fixture.initialHash });
    expect(await getSparseDirectories(fixture.repo, '', state.head)).toEqual(['app', 'docs', 'unicode café']);
    expect(await getSparseDirectories(fixture.repo, 'app', state.head)).toEqual(['app/nested']);
    const preview = await previewSparseCheckout(fixture.repo, selection(state, ['app', 'app']));
    expect(preview).toMatchObject({ directories: ['app'], total: 7, included: 4, excluded: 3, removed: 3, added: 0, blockers: [] });
    expect(preview.removedExamples).toContain('docs/guide.md');
    expect(await fixture.read('docs/guide.md')).toBe('docs\n');
    expect((await getSparseCheckout(fixture.repo)).enabled).toBe(false);
  });

  it('applies a folder layout, keeps root files, and restores the original full layout', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    const sparse = await applySparseCheckout(fixture.repo, selection(initial, ['app']));
    expect(sparse).toMatchObject({ enabled: true, cone: true, directories: ['app'] });
    expect(await fixture.read('README.md')).toBe('root\n'); expect(await fixture.read('app/main.ts')).toBe('app\n');
    await expect(fixture.read('docs/guide.md')).rejects.toThrow();
    expect(sparse.backups).toHaveLength(1);
    expect(await listRestorePoints(fixture.repo)).toHaveLength(1);
    const restored = await restoreSparseLayout(fixture.repo, sparse.backups[0].id, sparse.head, sparse.fingerprint);
    expect(restored.enabled).toBe(false);
    expect(await fixture.read('docs/guide.md')).toBe('docs\n');
    expect(await fixture.git('status', '--porcelain')).toBe('');
  });

  it('disables sparse checkout using the normal preview/apply flow', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    const sparse = await applySparseCheckout(fixture.repo, selection(initial, []));
    expect(sparse.directories).toEqual([]);
    await expect(fixture.read('app/main.ts')).rejects.toThrow();
    const preview = await previewSparseCheckout(fixture.repo, selection(sparse, [], true));
    expect(preview.added).toBe(5); expect(preview.excluded).toBe(0);
    const full = await applySparseCheckout(fixture.repo, selection(sparse, [], true));
    expect(full.enabled).toBe(false);
    expect(await fixture.read('app/main.ts')).toBe('app\n');
  });

  it('round-trips directories with spaces and unicode through Git cone quoting', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    const sparse = await applySparseCheckout(fixture.repo, selection(initial, ['unicode café']));
    expect(sparse.directories).toEqual(['unicode café']);
    expect(await fixture.read('unicode café/file.txt')).toBe('unicode\n');
    await expect(fixture.read('app/main.ts')).rejects.toThrow();
  });

  it.each(['../outside', '.git', 'app/../docs', 'app\\nested', 'app//nested', 'app\nother'])('rejects unsafe directory selection %j', async directory => {
    const state = await getSparseCheckout(fixture.repo);
    await expect(previewSparseCheckout(fixture.repo, selection(state, [directory]))).rejects.toThrow('Choose repository directories');
    expect((await getSparseCheckout(fixture.repo)).enabled).toBe(false);
  });

  it('rejects stale previews after HEAD or index changes', async () => {
    const state = await getSparseCheckout(fixture.repo);
    await fixture.write('app/main.ts', 'new commit\n'); await fixture.commitAll('Changed head');
    await expect(getSparseDirectories(fixture.repo, '', state.head)).rejects.toThrow('HEAD changed');
    await expect(applySparseCheckout(fixture.repo, selection(state, ['app']))).rejects.toThrow('changed');
    const current = await getSparseCheckout(fixture.repo);
    await fixture.write('staged.txt', 'new\n'); await fixture.git('add', 'staged.txt');
    await expect(previewSparseCheckout(fixture.repo, selection(current, ['app']))).rejects.toThrow('changed');
  });

  it('blocks local modifications and active conflicts before changing the checkout', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    await fixture.write('docs/guide.md', 'unsaved\n');
    await expect(previewSparseCheckout(fixture.repo, selection(initial, ['app']))).rejects.toThrow('Commit or stash all changes');
    expect(await fixture.read('docs/guide.md')).toBe('unsaved\n');
    await fixture.git('restore', 'docs/guide.md');
    await createMergeConflict(fixture, 'app/main.ts');
    const conflictState = await getSparseCheckout(fixture.repo);
    await expect(previewSparseCheckout(fixture.repo, selection(conflictState, ['app']))).rejects.toThrow('active Git operation');
  });

  it('blocks ignored files in pruned directories and protects them on apply', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    await fixture.write('docs/valuable.cache', 'keep this ignored data\n');
    const preview = await previewSparseCheckout(fixture.repo, selection(initial, ['app']));
    expect(preview.blockers).toContain('Move ignored file out of a directory that may be pruned: docs/valuable.cache');
    await expect(applySparseCheckout(fixture.repo, selection(initial, ['app']))).rejects.toThrow('ignored file');
    expect(await fixture.read('docs/valuable.cache')).toBe('keep this ignored data\n');
    expect((await getSparseCheckout(fixture.repo)).enabled).toBe(false);
  });

  it('protects locally populated files outside a sparse layout before reintroducing files', async () => {
    const initial = await getSparseCheckout(fixture.repo);
    const sparse = await applySparseCheckout(fixture.repo, selection(initial, ['app']));
    await fixture.write('.git/info/exclude', 'docs/guide.md\n');
    await fixture.write('docs/guide.md', 'local ignored content\n');
    // Git may clear skip-worktree on an externally populated path; refresh its fingerprint.
    const current = await getSparseCheckout(fixture.repo);
    await expect(previewSparseCheckout(fixture.repo, selection(current, [], true))).rejects.toThrow('Commit or stash all changes');
    await expect(applySparseCheckout(fixture.repo, selection(current, [], true))).rejects.toThrow(/changed|Commit or stash all changes/);
    expect(await fixture.read('docs/guide.md')).toBe('local ignored content\n');
  });

  it('refuses editing existing non-cone patterns until full checkout is restored', async () => {
    await fixture.git('sparse-checkout', 'set', '--no-cone', 'app/');
    const state = await getSparseCheckout(fixture.repo);
    expect(state).toMatchObject({ enabled: true, cone: false });
    await expect(previewSparseCheckout(fixture.repo, selection(state, ['app']))).rejects.toThrow('non-cone patterns');
    const full = await applySparseCheckout(fixture.repo, selection(state, [], true));
    const backup = full.backups.find(entry => entry.enabled && !entry.cone)!;
    expect(backup).toBeDefined();
    const restored = await restoreSparseLayout(fixture.repo, backup.id, full.head, full.fingerprint);
    expect(restored).toMatchObject({ enabled: true, cone: false, rawPatterns: state.rawPatterns });
  });

  it('validates saved layout ids and current fingerprint when restoring', async () => {
    const state = await getSparseCheckout(fixture.repo);
    await expect(restoreSparseLayout(fixture.repo, '../outside', state.head, state.fingerprint)).rejects.toThrow('Invalid saved layout');
    const sparse = await applySparseCheckout(fixture.repo, selection(state, ['app']));
    await expect(restoreSparseLayout(fixture.repo, sparse.backups[0].id, state.head, state.fingerprint)).rejects.toThrow('Checkout changed');
  });
});
