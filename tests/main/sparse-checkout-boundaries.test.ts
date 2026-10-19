import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SparseCheckoutState } from '../../src/shared/types';
const mock = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn(), restore: vi.fn(), operation: vi.fn() }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitCommand: mock.git, resolveCommit: mock.resolve }));
vi.mock('../../src/main/git/restore-points', () => ({ createRestorePoint: mock.restore }));
vi.mock('../../src/main/git/conflicts-rebase', () => ({ getRepoOperationState: mock.operation }));
import { applySparseCheckout, getSparseCheckout, previewSparseCheckout, restoreSparseLayout } from '../../src/main/git/sparse-checkout';

let root: string, rows: string, ignored: string;
const head = 'a'.repeat(40), id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const selection = (state: SparseCheckoutState, directories = ['app'], disable = false) => ({ head: state.head, fingerprint: state.fingerprint, directories, disable });
async function saveBackup(enabled = true, cone = true, directories: string[] = []) {
  const folder = path.join(root, 'git-workbench-sparse-layouts'); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `${id}.json`), JSON.stringify({ id, worktree: await fs.realpath(root), createdAt: '2026-01-01', head, enabled, cone, directories, rawPatterns: '/app/\n' }));
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-sparse-boundary-'));
  rows = 'H app/main.ts\0H docs/guide.md\0'; ignored = '';
  mock.resolve.mockReset().mockResolvedValue(head); mock.restore.mockReset().mockResolvedValue({ id: 'restore' });
  mock.operation.mockReset().mockResolvedValue({ conflictedFiles: [] });
  mock.git.mockReset().mockImplementation(async (_repo: string, args: string[]) => {
    if (args[0] === '--version') return 'git version 2.45.0';
    if (args[0] === 'config') return 'false';
    if (args[0] === 'rev-parse') return args.includes('--absolute-git-dir') ? root : 'info/sparse-checkout';
    if (args[0] === 'ls-files') return args.includes('--others') ? ignored : rows;
    if (args[0] === 'cat-file') return 'tree';
    return '';
  });
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('sparse checkout filesystem and concurrency boundaries', () => {
  it('ignores corrupt and foreign saved layouts', async () => {
    await saveBackup();
    const folder = path.join(root, 'git-workbench-sparse-layouts');
    await fs.writeFile(path.join(folder, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json'), '{bad');
    await fs.writeFile(path.join(folder, 'cccccccc-cccc-cccc-cccc-cccccccccccc.json'), JSON.stringify({ worktree: '/elsewhere' }));
    expect((await getSparseCheckout(root)).backups.map(value => value.id)).toEqual([id]);
  });
  it('rejects oversized existing rules before reading or mutating the layout', async () => {
    await fs.mkdir(path.join(root, 'info')); await fs.writeFile(path.join(root, 'info/sparse-checkout'), 'x'.repeat(1_000_001));
    await expect(getSparseCheckout(root)).rejects.toThrow('Sparse rules exceed 1 MB');
    expect(mock.restore).not.toHaveBeenCalled();
  });
  it('rejects unsupported Git before previewing a change', async () => {
    const original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => args[0] === '--version' ? 'git version 2.36.5' : original(repo, args));
    const state = await getSparseCheckout(root);
    await expect(previewSparseCheckout(root, selection(state))).rejects.toThrow('Git 2.37 or newer');
  });
  it.each([null, Array(1001).fill('app')])('rejects an invalid directory collection %#', async directories => {
    const state = await getSparseCheckout(root);
    await expect(previewSparseCheckout(root, { ...selection(state), directories })).rejects.toThrow('up to 1,000 directories');
  });
  it('rejects a selected blob before saving a restore point', async () => {
    const state = await getSparseCheckout(root), original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => args[0] === 'cat-file' ? 'blob' : original(repo, args));
    await expect(applySparseCheckout(root, selection(state))).rejects.toThrow('Not a directory');
    expect(mock.restore).not.toHaveBeenCalled();
  });
  it('uses ignoreCase and keeps ignored files in retained folders', async () => {
    rows = 'H APP/main.ts\0H docs/guide.md\0'; ignored = 'APP/local.cache\0docs/deep/local.cache\0root.cache\0';
    const original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => args.at(-1) === 'core.ignoreCase' ? 'true' : original(repo, args));
    const preview = await previewSparseCheckout(root, selection(await getSparseCheckout(root)));
    expect(preview.included).toBe(1);
    expect(preview.blockers).toEqual(['Move ignored file out of a directory that may be pruned: docs/deep/local.cache']);
  });
  it('caps collision reports while checking all files that would be populated', async () => {
    const files = Array.from({ length: 22 }, (_, i) => `app/${i}.txt`); rows = files.map(file => `S ${file}\0`).join('');
    await fs.mkdir(path.join(root, 'app')); await Promise.all(files.map(file => fs.writeFile(path.join(root, file), 'valuable')));
    const preview = await previewSparseCheckout(root, selection(await getSparseCheckout(root)));
    expect(preview.added).toBe(22); expect(preview.blockers).toHaveLength(20);
    expect(preview.blockers.every(message => message.includes('already exists'))).toBe(true);
    expect(await fs.readFile(path.join(root, files[21]), 'utf8')).toBe('valuable');
  });
  it('rejects index changes between preview and apply without saving a snapshot', async () => {
    const state = await getSparseCheckout(root), original = mock.git.getMockImplementation()!; let reads = 0;
    mock.git.mockImplementation(async (repo, args) => {
      if (args[0] === 'ls-files' && args.includes('-t') && ++reads >= 3) return 'H changed.txt\0';
      return original(repo, args);
    });
    await expect(applySparseCheckout(root, selection(state))).rejects.toThrow('Checkout changed. Preview again.');
    expect(mock.restore).not.toHaveBeenCalled();
  });
  it('revalidates the checkout after the restore point is saved', async () => {
    const state = await getSparseCheckout(root);
    mock.restore.mockImplementation(async () => { rows = 'H changed.txt\0'; return { id: 'restore' }; });
    await expect(applySparseCheckout(root, selection(state))).rejects.toThrow('changed while saving its restore point');
    expect(mock.git.mock.calls.some(([, args]) => args.includes('submodule.recurse=false'))).toBe(false);
  });
  it('retains the saved layout and reports a failed Git apply', async () => {
    const state = await getSparseCheckout(root), original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => { if (args.includes('submodule.recurse=false')) throw new Error('checkout failed'); return original(repo, args); });
    await expect(applySparseCheckout(root, selection(state))).rejects.toThrow('previous layout is saved as');
    expect((await getSparseCheckout(root)).backups).toHaveLength(1);
    expect(mock.restore).toHaveBeenCalledOnce();
  });
  it('restores an empty cone with skip-checks and empty stdin', async () => {
    await saveBackup(); const state = await getSparseCheckout(root);
    await restoreSparseLayout(root, id, state.head, state.fingerprint);
    expect(mock.git).toHaveBeenCalledWith(root, ['-c', 'submodule.recurse=false', 'sparse-checkout', 'set', '--cone', '--no-sparse-index', '--skip-checks', '--stdin'], '', { GIT_LFS_SKIP_SMUDGE: '1' }, 120_000);
  });
  it('blocks ignored files before restoring arbitrary non-cone rules', async () => {
    await saveBackup(true, false); ignored = 'local.cache\0'; const state = await getSparseCheckout(root);
    await expect(restoreSparseLayout(root, id, state.head, state.fingerprint)).rejects.toThrow('Move ignored files aside');
    expect(mock.restore).not.toHaveBeenCalled();
  });
  it.each([true, false])('protects files outside the current layout when restoring cone=%s', async cone => {
    await saveBackup(true, cone, ['docs']); rows = 'S docs/guide.md\0';
    await fs.mkdir(path.join(root, 'docs')); await fs.writeFile(path.join(root, 'docs/guide.md'), 'valuable local file');
    const state = await getSparseCheckout(root);
    await expect(restoreSparseLayout(root, id, state.head, state.fingerprint)).rejects.toThrow('already exists');
    expect(await fs.readFile(path.join(root, 'docs/guide.md'), 'utf8')).toBe('valuable local file');
    expect(mock.restore).not.toHaveBeenCalled();
  });
});
