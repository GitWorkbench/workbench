import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ raw: vi.fn(), status: vi.fn(), apply: vi.fn() }));
vi.mock('../../src/main/git/core', () => ({ gitFor: () => ({ raw: mock.raw, status: mock.status }) }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitWithEnvironment: () => ({ raw: mock.apply }) }));
import { restorePoint } from '../../src/main/git/restore-points';
let root: string;
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', head = 'b'.repeat(40), hash = 'c'.repeat(40);
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-restore-boundary-')); mock.status.mockReset().mockResolvedValue({ isClean: () => true }); mock.apply.mockReset().mockResolvedValue(''); mock.raw.mockReset().mockImplementation(async args => { if (args[0] === 'for-each-ref') return `Git Workbench restore point: ${JSON.stringify({ id, worktree: await fs.realpath(root), head })}\n`; if (args.includes('--absolute-git-dir')) return root; if (args[0] === 'rev-parse') return hash; return ''; }); });
afterEach(async () => fs.rm(root, { recursive: true, force: true }));
describe('restore point apply failure', () => {
  it('uses exit-status-aware stash apply and keeps a failed recovery available on its safety branch', async () => { mock.apply.mockRejectedValue(new Error('stash exited with conflict on stdout')); await expect(restorePoint(root, id)).rejects.toThrow('Recovery stopped on recovered/restore-'); expect(mock.apply).toHaveBeenCalledWith(['-c', 'submodule.recurse=false', 'stash', 'apply', '--index', hash]); expect(mock.raw.mock.calls.some(([args]) => args[0] === 'update-ref' && args.includes('-d'))).toBe(false); });
  it('acknowledges a successful apply with its recovery branch', async () => { const result = await restorePoint(root, id); expect(result).toMatchObject({ ok: true, branch: expect.stringMatching(/^recovered\/restore-.*-aaaaaaaa$/) }); expect(mock.raw).toHaveBeenCalledWith(['-c', 'submodule.recurse=false', 'checkout', '--no-overwrite-ignore', '-b', result.branch, head]); });
});

it('labels snapshots made from a detached HEAD', async () => {
  const { createRestorePoint } = await import('../../src/main/git/restore-points');
  const point = await createRestorePoint(root);
  expect(point).toMatchObject({ branch: '(detached HEAD)', head: hash, unborn: false });
  expect(mock.raw).toHaveBeenCalledWith(['update-ref', `refs/git-workbench/restore-points/${point.id}`, '', '']);
});
it('refuses to publish a snapshot if HEAD becomes unreadable after its index was captured', async () => {
  const { createRestorePoint } = await import('../../src/main/git/restore-points');
  const original = mock.raw.getMockImplementation()!; let reads = 0;
  mock.raw.mockImplementation(async args => {
    if (args[0] === 'rev-parse' && args.includes('HEAD') && ++reads === 2) throw new Error('HEAD changed');
    return original(args);
  });
  await expect(createRestorePoint(root)).rejects.toThrow('HEAD or the index changed');
  expect(mock.raw.mock.calls.some(([args]) => args[0] === 'update-ref')).toBe(false);
  expect((await fs.readdir(root)).some(name => name.startsWith('git-workbench-snapshot-'))).toBe(false);
});
it('ignores malformed metadata on restore-point refs', async () => {
  const { listRestorePoints } = await import('../../src/main/git/restore-points');
  mock.raw.mockResolvedValue('Git Workbench restore point: {invalid\n');
  expect(await listRestorePoints(root)).toEqual([]);
});
