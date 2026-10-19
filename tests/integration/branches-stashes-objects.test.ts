import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { addRemote, createTag, deleteTag, getRemotes, getSubmodules, getTags, getWorktrees, pruneRemote, pushTag, removeRemote, removeWorktree, renameRemote, setRemoteUrl, updateSubmodules } from '../../src/main/git/objects-navigation';
import { applyStashFile, checkoutBranch, createBranch, deleteBranch, getBranches, getStashDetail, getStashes, getStashFileDiff, mergeBranch, renameBranch, stash, stashApply, stashDrop, stashPop } from '../../src/main/git/branch-stash';
import { createWorktree, deleteBranchEx, pushSetUpstream, setUpstream } from '../../src/main/git/history';
import { isValidRepo } from '../../src/main/git/core';
import { getStatus } from '../../src/main/git/status-diff';
import { createGitFixture, type GitFixture } from './git-fixture';

describe('branch, stash and repository object workflows', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); vi.restoreAllMocks(); });

  it('creates branches without switching, checks out, renames and deletes merged branches', async () => {
    await createBranch(fixture.repo, 'feature/topic');
    expect((await getBranches(fixture.repo)).local.map(branch => branch.name)).toEqual(['main', 'feature/topic']);
    await checkoutBranch(fixture.repo, 'feature/topic');
    await renameBranch(fixture.repo, 'feature/topic', 'feature/renamed');
    expect((await getBranches(fixture.repo)).local[0]).toMatchObject({ name: 'feature/renamed', isCurrent: true, isRemote: false });
    await checkoutBranch(fixture.repo, 'main');
    await deleteBranch(fixture.repo, 'feature/renamed');
    expect((await getBranches(fixture.repo)).local.map(branch => branch.name)).toEqual(['main']);
  });

  it('merges a branch and protects unmerged commits from ordinary deletion', async () => {
    await fixture.git('checkout', '-b', 'feature');
    await fixture.write('feature.txt', 'keep this work\n');
    await fixture.commitAll('Feature work');
    await checkoutBranch(fixture.repo, 'main');
    await expect(deleteBranchEx(fixture.repo, 'feature', { local: true })).rejects.toThrow('not fully merged');
    expect((await getBranches(fixture.repo)).local.some(branch => branch.name === 'feature')).toBe(true);
    await mergeBranch(fixture.repo, 'feature');
    expect(await fixture.read('feature.txt')).toBe('keep this work\n');
    await deleteBranchEx(fixture.repo, 'feature', { local: true });
    expect((await getBranches(fixture.repo)).local.some(branch => branch.name === 'feature')).toBe(false);
  });

  it('allows explicitly forced deletion and rejects deleting the checked-out branch', async () => {
    await fixture.git('checkout', '-b', 'unmerged');
    await fixture.write('branch-only.txt', 'branch\n');
    await fixture.commitAll('Unmerged branch');
    await checkoutBranch(fixture.repo, 'main');
    await deleteBranchEx(fixture.repo, 'unmerged', { local: true, force: true });
    await expect(deleteBranch(fixture.repo, 'main')).rejects.toThrow();
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
  });

  it('saves stash metadata and diffs, applies without dropping, then pops explicitly', async () => {
    await fixture.write('readme.txt', 'stashed content\n');
    await stash(fixture.repo, 'Review work');
    expect(await fixture.read('readme.txt')).toBe('baseline\n');
    expect(await getStashes(fixture.repo)).toEqual([expect.objectContaining({ index: 0, message: expect.stringContaining('Review work'), date: expect.any(String) })]);
    expect(await getStashDetail(fixture.repo, 0)).toMatchObject({ index: 0, files: [expect.objectContaining({ path: 'readme.txt', status: 'modified' })], insertions: 1, deletions: 1 });
    expect(await getStashFileDiff(fixture.repo, 0, 'readme.txt')).toMatchObject({ insertions: 1, deletions: 1 });
    await stashApply(fixture.repo);
    expect(await fixture.read('readme.txt')).toBe('stashed content\n');
    expect(await getStashes(fixture.repo)).toHaveLength(1);
    await fixture.git('restore', 'readme.txt');
    await stashPop(fixture.repo, 0);
    expect(await fixture.read('readme.txt')).toBe('stashed content\n');
    expect(await getStashes(fixture.repo)).toEqual([]);
  });

  it('supports default stash messages, explicitly selected stash indexes and dropping', async () => {
    await fixture.write('readme.txt', 'first\n'); await stash(fixture.repo);
    await fixture.write('readme.txt', 'second\n'); await stash(fixture.repo, 'Second');
    expect((await getStashes(fixture.repo)).map(entry => entry.index)).toEqual([0, 1]);
    await stashApply(fixture.repo, 1);
    expect(await fixture.read('readme.txt')).toBe('first\n');
    await fixture.git('restore', 'readme.txt');
    await stashDrop(fixture.repo, 1);
    expect(await getStashes(fixture.repo)).toHaveLength(1);
    await stashDrop(fixture.repo);
    expect(await getStashes(fixture.repo)).toEqual([]);
    expect(await getStashDetail(fixture.repo, 4)).toBeNull();
    expect(await getStashFileDiff(fixture.repo, 4, 'readme.txt')).toBeNull();
  });

  it('restores one stash file without dropping the stash or overwriting local work', async () => {
    await fixture.write('readme.txt', 'saved\n');
    await fixture.write('other.txt', 'other baseline\n'); await fixture.commitAll('Other baseline');
    await fixture.write('readme.txt', 'stash readme\n'); await fixture.write('other.txt', 'stash other\n');
    await stash(fixture.repo, 'Two files');
    await applyStashFile(fixture.repo, 0, 'readme.txt');
    expect(await fixture.read('readme.txt')).toBe('stash readme\n');
    expect(await fixture.read('other.txt')).toBe('other baseline\n');
    await expect(applyStashFile(fixture.repo, 0, 'readme.txt')).rejects.toThrow('Commit or stash local changes');
    expect(await getStashes(fixture.repo)).toHaveLength(1);
  });

  it('creates lightweight and annotated tags, lists metadata, and deletes locally', async () => {
    await createTag(fixture.repo, 'v1.0.0');
    await createTag(fixture.repo, 'v1.1.0', fixture.initialHash, ' Release notes ');
    expect(await getTags(fixture.repo)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'v1.0.0', hash: fixture.initialHash, message: 'Initial fixture' }),
      expect.objectContaining({ name: 'v1.1.0', message: 'Release notes' })
    ]));
    expect((await fixture.git('cat-file', '-t', 'v1.1.0')).trim()).toBe('tag');
    await deleteTag(fixture.repo, 'v1.0.0');
    expect((await getTags(fixture.repo)).map(tag => tag.name)).toEqual(['v1.1.0']);
  });

  it('adds, edits, renames, lists and removes remotes without contacting a host', async () => {
    await addRemote(fixture.repo, 'origin', 'https://example.invalid/project.git');
    expect(await getRemotes(fixture.repo)).toEqual([{ name: 'origin', fetchUrl: 'https://example.invalid/project.git', pushUrl: 'https://example.invalid/project.git' }]);
    await setRemoteUrl(fixture.repo, 'origin', 'git@example.invalid:team/project.git');
    await renameRemote(fixture.repo, 'origin', 'upstream');
    expect(await getRemotes(fixture.repo)).toEqual([{ name: 'upstream', fetchUrl: 'git@example.invalid:team/project.git', pushUrl: 'git@example.invalid:team/project.git' }]);
    await removeRemote(fixture.repo, 'upstream');
    expect(await getRemotes(fixture.repo)).toEqual([]);
  });

  it('pushes tags and branches to an isolated bare local remote, and sets tracking', async () => {
    const bare = path.join(fixture.root, 'remote.git');
    await fixture.git('init', '--bare', bare);
    await addRemote(fixture.repo, 'origin', bare);
    await pushSetUpstream(fixture.repo, 'main');
    await createBranch(fixture.repo, 'local-copy');
    await setUpstream(fixture.repo, 'local-copy', 'origin/main');
    const branches = await getBranches(fixture.repo);
    expect(branches.remote).toContainEqual(expect.objectContaining({ name: 'main', fullName: 'origin/main', isRemote: true }));
    expect(branches.local.find(branch => branch.name === 'local-copy')?.tracking).toBe('origin/main');
    await createTag(fixture.repo, 'local-release');
    await pushTag(fixture.repo, 'local-release');
    expect((await fixture.git('--git-dir', bare, 'rev-parse', 'refs/tags/local-release')).trim()).toBe(fixture.initialHash);
    await deleteTag(fixture.repo, 'local-release', true);
    await expect(fixture.git('--git-dir', bare, 'rev-parse', '--verify', 'refs/tags/local-release')).rejects.toThrow();
    await pruneRemote(fixture.repo, 'origin');
    await deleteBranchEx(fixture.repo, 'main', { remote: true });
    await expect(fixture.git('--git-dir', bare, 'rev-parse', '--verify', 'refs/heads/main')).rejects.toThrow();
  });

  it('lists distinct push/fetch URLs', async () => {
    await addRemote(fixture.repo, 'origin', 'https://example.invalid/fetch.git');
    await fixture.git('remote', 'set-url', '--push', 'origin', 'ssh://example.invalid/push.git');
    expect(await getRemotes(fixture.repo)).toEqual([{ name: 'origin', fetchUrl: 'https://example.invalid/fetch.git', pushUrl: 'ssh://example.invalid/push.git' }]);
  });

  it('creates valid linked worktrees, lists detached and locked state, and removes them safely', async () => {
    const worktree = path.join(fixture.root, 'linked-worktree');
    await createWorktree(fixture.repo, worktree, fixture.initialHash);
    expect(isValidRepo(worktree)).toBe(true);
    await fixture.git('worktree', 'lock', '--reason', 'test lock', worktree);
    const worktrees = (await getWorktrees(fixture.repo)).map(worktree => ({ ...worktree, path: path.normalize(worktree.path) }));
    expect(worktrees).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: fixture.repo, branch: 'main', isBare: false, isLocked: false }),
      expect.objectContaining({ path: worktree, branch: '(detached)', hash: fixture.initialHash, isLocked: true })
    ]));
    await fixture.git('worktree', 'unlock', worktree);
    await removeWorktree(fixture.repo, worktree);
    expect(await getWorktrees(fixture.repo)).toHaveLength(1);
  });

  it('protects dirty worktrees until force removal is explicitly requested', async () => {
    const worktree = path.join(fixture.root, 'dirty-worktree');
    await createWorktree(fixture.repo, worktree, fixture.initialHash);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(worktree, 'readme.txt'), 'uncommitted\n');
    await expect(removeWorktree(fixture.repo, worktree)).rejects.toThrow();
    expect(isValidRepo(worktree)).toBe(true);
    await removeWorktree(fixture.repo, worktree, true);
    expect(isValidRepo(worktree)).toBe(false);
  });

  it('lists empty submodules and returns empty data for nonrepositories', async () => {
    expect(await getSubmodules(fixture.repo)).toEqual([]);
    await updateSubmodules(fixture.repo);
    const notRepo = path.join(fixture.root, 'not-repo'); await mkdir(notRepo);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getBranches(notRepo)).toEqual({ local: [], remote: [] });
    expect(await getStashes(notRepo)).toEqual([]);
    expect(await getTags(notRepo)).toEqual([]);
    expect(await getRemotes(notRepo)).toEqual([]);
    expect(await getSubmodules(notRepo)).toEqual([]);
    expect(await getWorktrees(notRepo)).toEqual([]);
  });

  it('lists initialized, out-of-sync and deinitialized local submodules and restores cached checkout', async () => {
    const source = await createGitFixture({ 'module.txt': 'module baseline\n' });
    try {
      await fixture.git('-c', 'protocol.file.allow=always', 'submodule', 'add', source.repo, 'vendor/module');
      await fixture.commitAll('Add local submodule');
      expect(await getSubmodules(fixture.repo)).toEqual([expect.objectContaining({ name: 'module', path: 'vendor/module', hash: source.initialHash, isInitialized: true, isDirty: false, isOutOfSync: false })]);
      const module = path.join(fixture.repo, 'vendor/module');
      await fixture.git('-C', module, 'checkout', '--detach', source.initialHash);
      await fixture.git('-C', module, '-c', 'user.name=Git Workbench Test', '-c', 'user.email=tests@git-workbench.invalid', 'commit', '--allow-empty', '-m', 'Submodule-only commit');
      expect((await getSubmodules(fixture.repo))[0]).toMatchObject({ isInitialized: true, isOutOfSync: true });
      await updateSubmodules(fixture.repo, 'vendor/module');
      expect((await getSubmodules(fixture.repo))[0].hash).toBe(source.initialHash);
      await fixture.git('submodule', 'deinit', '-f', '--', 'vendor/module');
      expect((await getSubmodules(fixture.repo))[0].isInitialized).toBe(false);
      await updateSubmodules(fixture.repo);
      expect((await getSubmodules(fixture.repo))[0]).toMatchObject({ isInitialized: true, isOutOfSync: false });
    } finally { await source.cleanup(); }
  });

  it.each(['pop', 'apply'] as const)('reports a failed stash %s and retains saved work when conflicts occur', async action => {
    await fixture.write('readme.txt', 'saved stash content\n'); await stash(fixture.repo, 'Saved work');
    await fixture.write('readme.txt', 'new committed work\n'); await fixture.commitAll('Diverged content');
    await expect(action === 'pop' ? stashPop(fixture.repo) : stashApply(fixture.repo)).rejects.toThrow();
    expect(await getStashes(fixture.repo)).toHaveLength(1);
    expect((await getStatus(fixture.repo)).unstaged).toContainEqual(expect.objectContaining({ path: 'readme.txt', status: 'conflicted' }));
  });

  it('removes local tags even when the explicitly requested local-remote deletion fails', async () => {
    await createTag(fixture.repo, 'delete-local');
    await deleteTag(fixture.repo, 'delete-local', true, 'missing-local-remote');
    expect(await getTags(fixture.repo)).toEqual([]);
  });
});
