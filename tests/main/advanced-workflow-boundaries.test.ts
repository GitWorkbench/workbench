import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ git: vi.fn(), resolve: vi.fn(), clean: vi.fn(), restore: vi.fn(), record: vi.fn(), operation: vi.fn(), client: vi.fn(), request: vi.fn() }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitCommand: mock.git, resolveCommit: mock.resolve, cleanBranch: mock.clean }));
vi.mock('../../src/main/git/restore-points', () => ({ createRestorePoint: mock.restore }));
vi.mock('../../src/main/git/rewrite-comparison', () => ({ recordCompletedRewrite: mock.record }));
vi.mock('../../src/main/git/conflicts-rebase', () => ({ getRepoOperationState: mock.operation }));
vi.mock('../../src/main/git/pull-requests', () => ({ apiPath: () => '/api/repo', hostedReviewClient: mock.client, requestJson: mock.request }));
import { retargetPullRequest, resumeStackRestack, applyStackRestack, discardStackRestack, getBranchStack, setStackParent, previewStackRestack } from '../../src/main/git/branch-stacks';
import { applyCommitSplit, getCommitSplit, previewCommitSplit, listCommitSplitPreviews } from '../../src/main/git/commit-split';
import { getSparseCheckout, previewSparseCheckout } from '../../src/main/git/sparse-checkout';
let root: string;
const old = 'a'.repeat(40), next = 'b'.repeat(40), base = 'c'.repeat(40), id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', stepId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-advanced-boundary-'));
  mock.git.mockReset().mockImplementation(async (_repo, args) => { if (args[0] === 'rev-parse') return args.at(-1).endsWith('^{tree}') ? 'tree' : root; if (args[0] === '--version') return 'git version 2.45.0'; if (args[0] === 'config') return 'true'; if (args[0] === 'show') return args.includes('--format=%P') ? base : 'Subject'; return ''; }); mock.resolve.mockReset().mockResolvedValue(next); mock.clean.mockReset().mockResolvedValue({ branch: 'main', head: old }); mock.restore.mockReset().mockResolvedValue({ id: 'restore' }); mock.record.mockReset().mockResolvedValue('rewrite'); mock.operation.mockReset().mockResolvedValue({ conflictedFiles: [] }); mock.client.mockReset().mockResolvedValue({ config: {}, credential: {} }); mock.request.mockReset();
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
const retarget = (provider = 'github') => retargetPullRequest(root, { provider: provider as any, remoteName: 'origin', requestId: '12', head: next, previousTarget: 'feature', newTarget: 'main' }, () => null);
async function savedStack(patch: Record<string, any> = {}) {
  const directory = path.join(root, 'git-workbench-stacks'); await fs.mkdir(directory, { recursive: true }); const preview = path.join(root, 'preview'); await fs.mkdir(preview, { recursive: true });
  const value = { id, revision: 'revision', state: 'ready', root: 'main', rootHead: base, path: preview, index: 0, steps: [{ id: stepId, branch: 'feature', parent: 'main', oldHead: old, base, onto: base, newHead: next, commits: 2 }], ...patch };
  await fs.writeFile(path.join(directory, 'branches.json'), JSON.stringify({ revision: 'revision', links: [{ id: stepId, branch: 'feature', parent: 'main', base }, { id: 'unrelated', branch: 'elsewhere', parent: 'trunk', base }] })); await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(value)); return value;
}
describe('hosted retarget preconditions', () => {
  it.each(['github', 'gitlab', 'bitbucket', 'gitea'])('compares provider head/state/base before retargeting on %s', async provider => {
    mock.request.mockResolvedValue((provider === 'github' || provider === 'gitea') ? { state: 'open', head: { sha: next }, base: { ref: 'feature' } } : provider === 'gitlab' ? { state: 'opened', sha: next, target_branch: 'feature' } : { state: 'OPEN', source: { commit: { hash: next } }, destination: { branch: { name: 'feature' } } }); expect(await retarget(provider)).toEqual({ ok: true }); expect(mock.request).toHaveBeenLastCalledWith({}, {}, `/api/repo/${(provider === 'github' || provider === 'gitea') ? 'pulls' : provider === 'gitlab' ? 'merge_requests' : 'pullrequests'}/12`, (provider === 'github' || provider === 'gitea') ? 'PATCH' : 'PUT', (provider === 'github' || provider === 'gitea') ? { base: 'main' } : provider === 'gitlab' ? { target_branch: 'main' } : { destination: { branch: { name: 'main' } } });
  });
  it.each([{ state: 'closed', head: { sha: next }, base: { ref: 'feature' } }, { state: 'open', head: { sha: old }, base: { ref: 'feature' } }, { state: 'open', head: { sha: next }, base: { ref: 'changed' } }, {}])('refuses stale or closed requests %#', async response => { mock.request.mockResolvedValue(response); await expect(retarget()).rejects.toThrow('changed or closed'); expect(mock.request).toHaveBeenCalledTimes(1); });
});
describe('stack preview resumption and apply failures', () => {
  it('resumes a completed external preview rebase and pins the resulting tip', async () => { await savedStack({ inFlight: true, state: 'paused' }); const result = await resumeStackRestack(root, id); expect(result).toMatchObject({ state: 'ready', index: 1, inFlight: false, steps: [{ newHead: next }] }); expect(mock.git).toHaveBeenCalledWith(root, ['update-ref', `refs/git-workbench/restacks/${id}/${stepId}`, next]); });
  it.each(['rebase', 'merge', 'cherry-pick', 'conflicted', 'dirty', 'aborted'])('refuses resuming incomplete external preview state: %s', async reason => { await savedStack({ inFlight: true, state: 'paused' }); if (reason === 'rebase') mock.operation.mockResolvedValue({ inRebase: true, conflictedFiles: [] }); if (reason === 'merge') mock.operation.mockResolvedValue({ inMerge: true, conflictedFiles: [] }); if (reason === 'cherry-pick') mock.operation.mockResolvedValue({ inCherryPick: true, conflictedFiles: [] }); if (reason === 'conflicted') mock.operation.mockResolvedValue({ conflictedFiles: ['file'] }); if (reason === 'dirty') { const original = mock.git.getMockImplementation()!; mock.git.mockImplementation(async (repo, args) => args[0] === 'status' ? ' M file' : original(repo, args)); } if (reason === 'aborted') mock.resolve.mockResolvedValue(old); expect(await resumeStackRestack(root, id)).toMatchObject({ state: 'paused', error: expect.stringMatching(/Resolve conflicts|did not finish/) }); });
  it.each(['saved-status', 'comparison', 'parent-metadata'])('reports an already-applied stack when %s persistence fails', async failure => { await savedStack(); if (failure === 'comparison') mock.record.mockRejectedValue(new Error('record failed')); else { const original = fs.rename.bind(fs); vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { if (String(to).endsWith(failure === 'saved-status' ? `${id}.json` : 'branches.json')) throw new Error('disk failure'); return original(from, to); }); } const result = await applyStackRestack(root, id); expect(result.ok).toBe(true); expect(result.warning).toMatch(/could not be saved|could not be updated/); expect(mock.git).toHaveBeenCalledWith(root, ['update-ref', '-m', 'Git Workbench: apply stack restack', '--stdin'], expect.stringContaining('prepare\ncommit\n')); });
  it('verifies an unaffected current branch in the atomic ref transaction', async () => { await savedStack(); mock.clean.mockResolvedValue({ branch: 'unaffected', head: old }); await applyStackRestack(root, id); expect(mock.git).toHaveBeenCalledWith(root, ['update-ref', '-m', 'Git Workbench: apply stack restack', '--stdin'], expect.stringContaining(`verify "refs/heads/unaffected" ${old}`)); });
  it('aborts an active preview rebase before removing its worktree and refs', async () => { await savedStack(); mock.operation.mockResolvedValue({ inRebase: true }); expect(await discardStackRestack(root, id)).toEqual({ ok: true }); expect(mock.git).toHaveBeenCalledWith(path.join(root, 'preview'), ['rebase', '--abort']); });
});
describe('split apply protection and error reporting', () => {
  async function savedSplit() { const directory = path.join(root, 'git-workbench-splits'); await fs.mkdir(directory); await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify({ id, worktree: await fs.realpath(root), branch: 'main', oldHead: old, newHead: next, source: old, parent: base })); }
  it('keeps a completed split successful when comparison recording fails', async () => { await savedSplit(); mock.record.mockRejectedValue(new Error('record failed')); expect(await applyCommitSplit(root, id)).toMatchObject({ ok: true, warning: 'Split completed. Comparison recording failed; the restore point is available.' }); });
  it('refuses applying a split if the checkout changes while saving a restore point', async () => { await savedSplit(); mock.clean.mockResolvedValueOnce({ branch: 'main', head: old }).mockResolvedValueOnce({ branch: 'other', head: old }); await expect(applyCommitSplit(root, id)).rejects.toThrow('changed during snapshot'); expect(mock.git.mock.calls.some(([, args]) => args[0] === 'update-ref')).toBe(false); });
  it('refuses a split with fewer than two independent pieces before creating a shadow index', async () => { await expect(getCommitSplit(root, 'HEAD')).rejects.toThrow('fewer than two'); await expect(previewCommitSplit(root, { hash: 'HEAD', head: old, groups: [] })).rejects.toThrow('fewer than two'); });
});
describe('sparse rules output boundaries', () => {
  it('decodes quoted Git paths including UTF-8 octal and control escapes', async () => { const original = mock.git.getMockImplementation()!; mock.git.mockImplementation(async (repo, args) => args.includes('sparse-checkout') ? '"caf\\303\\251"\n"line\\nfeed"\n"slash\\\\quote\\\""\nplain\n' : original(repo, args)); expect((await getSparseCheckout(root)).directories).toEqual(['café', 'line\nfeed', 'slash\\quote"', 'plain']); });
  it('reports failed cone enumeration and refuses applying new folders until the layout is recovered', async () => { const original = mock.git.getMockImplementation()!; mock.git.mockImplementation(async (repo, args) => { if (args.includes('sparse-checkout')) throw new Error('bad patterns'); return original(repo, args); }); const state = await getSparseCheckout(root); expect(state.warning).toMatch(/could not list/); await expect(previewSparseCheckout(root, { head: state.head, fingerprint: state.fingerprint, directories: [], disable: false })).rejects.toThrow('could not list'); });
});


describe('stack registry and preview safety limits', () => {
  it('rejects invalid session IDs and malformed registries', async () => {
    await expect(resumeStackRestack(root, '../outside')).rejects.toThrow('Invalid stack session');
    await savedStack();
    await fs.writeFile(path.join(root, 'git-workbench-stacks', 'branches.json'), '{bad');
    await expect(getBranchStack(root)).rejects.toThrow();
  });
  it('reports missing branches and skips corrupt saved sessions', async () => {
    await savedStack();
    await fs.writeFile(path.join(root, 'git-workbench-stacks', `${id}.json`), '{bad');
    mock.resolve.mockRejectedValue(new Error('branch removed'));
    const state = await getBranchStack(root);
    expect(state.links[0].error).toContain('branch removed');
    expect(state.sessions).toEqual([]);
  });
  it('preserves an existing parent boundary when it is not explicitly reset', async () => {
    await savedStack();
    await setStackParent(root, 'feature', 'main');
    expect(mock.git.mock.calls.some(([, args]) => args[0] === 'merge-base' && args[1] !== '--is-ancestor')).toBe(false);
    expect(mock.git).toHaveBeenCalledWith(root, ['update-ref', `refs/git-workbench/stacks/${stepId}/base`, base]);
  });
  it('uses the reviewed parent preview as the child rebase destination', async () => {
    await savedStack({ steps: [
      { id: stepId, branch: 'feature', parent: 'main', oldHead: old, base, commits: 1 },
      { id, branch: 'child', parent: 'feature', oldHead: old, base, commits: 1 }
    ] });
    const state = await resumeStackRestack(root, id);
    expect(state.state).toBe('ready');
    expect(state.steps[1].onto).toBe(old);
  });
  it.each(['cycle', 'too-many', 'long-history', 'merge-history'])('refuses an unsafe saved stack: %s', async reason => {
    await savedStack();
    const links = reason === 'cycle'
      ? [{ id: stepId, branch: 'feature', parent: 'main', base }, { id, branch: 'main', parent: 'feature', base }]
      : reason === 'too-many'
        ? Array.from({ length: 11 }, (_, index) => ({ id: stepId, branch: `child-${index}`, parent: index ? `child-${index - 1}` : 'main', base }))
        : [{ id: stepId, branch: 'feature', parent: 'main', base }];
    await fs.writeFile(path.join(root, 'git-workbench-stacks', 'branches.json'), JSON.stringify({ revision: 'revision', links }));
    const original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => args.includes('--count') && reason === 'long-history' ? '101' : args.includes('--min-parents=2') && reason === 'merge-history' ? old : original(repo, args));
    await expect(previewStackRestack(root, 'main')).rejects.toThrow(reason === 'cycle' ? 'cyclic stack' : reason === 'too-many' ? '10 dependent' : 'linear stack');
    expect(mock.git.mock.calls.some(([, args]) => args.includes('add') && args.includes('worktree'))).toBe(false);
  });
  it('protects the currently open preview from removal', async () => {
    await savedStack({ path: root });
    await expect(discardStackRestack(root, id)).rejects.toThrow('Switch away');
    expect(mock.git.mock.calls.some(([, args]) => args.includes('remove'))).toBe(false);
  });
  it('retargets GitLab using diff_refs when a separate sha field is absent', async () => {
    mock.request.mockResolvedValue({ state: 'opened', diff_refs: { head_sha: next }, target_branch: 'feature' });
    expect(await retarget('gitlab')).toEqual({ ok: true });
  });
});

describe('split shadow-index failure boundaries', () => {
  const input = () => ({ hash: 'HEAD', head: old, groups: [{ message: 'One', units: ['0'] }, { message: 'Two', units: ['1'] }] });
  function splitData(trees: string[]) {
    const original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => {
      if (args[0] === 'diff') return args.includes('--name-only') ? 'one.txt\0two.txt\0' : `diff --git a/file b/file\nnew file mode 100644\n--- /dev/null\n+++ b/file\n@@ -0,0 +1 @@\n+content\n`;
      if (args[0] === 'write-tree') return trees.shift() || 'final-tree';
      if (args.includes('^{tree}') || (args[0] === 'rev-parse' && args.at(-1).endsWith('^{tree}'))) return 'expected-tree';
      if (args.includes('commit-tree')) return next;
      return original(repo, args);
    });
  }
  it('refuses empty split commits and deletes only the temporary preview ref', async () => {
    splitData(['same', 'same']);
    await expect(previewCommitSplit(root, input())).rejects.toThrow('would be empty');
    expect(mock.git).toHaveBeenCalledWith(root, ['update-ref', '-d', expect.stringContaining('refs/git-workbench/splits/')]);
    expect(mock.git.mock.calls.some(([, args]) => args.includes(`refs/heads/main`))).toBe(false);
  });
  it('refuses a preview whose final tree does not reproduce the source commit', async () => {
    splitData(['base-tree', 'one-tree', 'wrong-tree']);
    await expect(previewCommitSplit(root, input())).rejects.toThrow('did not reproduce');
    expect(mock.restore).not.toHaveBeenCalled();
  });
  it('filters corrupt and foreign split records', async () => {
    const directory = path.join(root, 'git-workbench-splits'); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, `${id}.json`), '{bad');
    await fs.writeFile(path.join(directory, `${stepId}.json`), JSON.stringify({ worktree: '/other' }));
    expect(await listCommitSplitPreviews(root)).toEqual([]);
  });
  it('rejects mismatched trees before saving a restore point or updating a branch', async () => {
    const directory = path.join(root, 'git-workbench-splits'); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify({ id, worktree: await fs.realpath(root), branch: 'main', oldHead: old, newHead: next }));
    const original = mock.git.getMockImplementation()!;
    mock.git.mockImplementation(async (repo, args) => args[0] === 'rev-parse' && args.at(-1).endsWith('^{tree}') ? args.at(-1) : original(repo, args));
    await expect(applyCommitSplit(root, id)).rejects.toThrow('preview tree differs');
    expect(mock.restore).not.toHaveBeenCalled();
  });
});


it.each(['bytes', 'pieces'])('bounds a split by %s even when all hunks belong to one file', async limit => {
  const original = mock.git.getMockImplementation()!;
  mock.git.mockImplementation(async (repo, args) => args[0] === 'diff'
    ? args.includes('--name-only') ? 'file.txt\0' : limit === 'bytes' ? 'x'.repeat(8_000_001) : 'diff --git a/file b/file\n' + '@@ -1 +1 @@\n-old\n+new\n'.repeat(1001)
    : original(repo, args));
  await expect(getCommitSplit(root, 'HEAD')).rejects.toThrow('too large for visual splitting');
  expect(mock.restore).not.toHaveBeenCalled();
});

it('keeps submodule changes indivisible in split plans', async () => {
  const original = mock.git.getMockImplementation()!;
  mock.git.mockImplementation(async (repo, args) => args[0] === 'diff'
    ? args.includes('--name-only') ? 'module\0file.txt\0' : 'diff --git a/module b/module\nindex old..new 160000\n@@ -1 +1 @@\n-old\n+new\n'
    : original(repo, args));
  const plan = await getCommitSplit(root, 'HEAD');
  expect(plan.units).toHaveLength(2);
  expect(plan.units.every(unit => unit.label.includes('Whole file'))).toBe(true);
});


it('preserves the original split failure if temporary ref cleanup also fails', async () => {
  const original = mock.git.getMockImplementation()!;
  mock.git.mockImplementation(async (repo, args) => {
    if (args[0] === 'diff') return args.includes('--name-only') ? 'one\0two\0' : 'diff --git a/file b/file\nnew file mode 100644\n';
    if (args[0] === 'write-tree') return 'same-tree';
    if (args[0] === 'update-ref' && args[1] === '-d') throw new Error('cleanup refused');
    return original(repo, args);
  });
  await expect(previewCommitSplit(root, { hash: 'HEAD', head: old, groups: [{ message: 'One', units: ['0'] }, { message: 'Two', units: ['1'] }] })).rejects.toThrow('would be empty');
});
