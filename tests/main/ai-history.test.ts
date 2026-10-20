import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCommitConfig } from '../../src/shared/types';

const mock = vi.hoisted(() => ({ clean: vi.fn(), resolve: vi.fn(), command: vi.fn(), generate: vi.fn(), explain: vi.fn() }));
vi.mock('../../src/main/git/advanced-process', () => ({ cleanBranch: mock.clean, resolveCommit: mock.resolve, gitCommand: mock.command }));
vi.mock('../../src/main/ai', () => ({ generateCommitMessage: mock.generate, explainCodeChanges: mock.explain }));
import { applyAiReword, explainBranchChanges, recomposeCommitMessage, validateAiReword } from '../../src/main/git/ai-history';

const head = 'a'.repeat(40), commit = 'b'.repeat(40), base = 'c'.repeat(40), tree = 'd'.repeat(40), rewritten = 'e'.repeat(40);
const snapshot = { head, branch: 'feature' };
const diff = 'diff --git a/file.ts b/file.ts\n-old\n+new\n';
const cloud: Partial<AiCommitConfig> = { provider: 'ollama', model: 'review-model' };
const metadata = (parent = base) => [tree, parent, 'Original Author', 'author@example.invalid', '2026-01-01T10:00:00+06:00', 'Original message\n\nOriginal body\n'].join('\0');
function command(_repo: string, args: string[]) {
  if (args[0] === 'merge-base') return Promise.resolve(args.includes('--is-ancestor') ? '' : base);
  if (args.includes('--format=%P')) return Promise.resolve(base);
  if (args.includes('--merges')) return Promise.resolve('');
  if (args.includes('--count')) return Promise.resolve('2');
  if (args.includes('--reverse')) return Promise.resolve(`${head}\n`);
  if (args.includes('--format=%B')) return Promise.resolve('Original message\n\nOriginal body\n');
  if (args.some(arg => arg.startsWith('--format=format:%T'))) return Promise.resolve(metadata());
  if (args.includes('commit-tree')) return Promise.resolve(rewritten);
  if (args[0] === 'rev-parse') return Promise.resolve(tree);
  if (args.includes('--name-only')) return Promise.resolve('file.ts\0other.ts\0');
  if (args[0] === 'diff' || args[0] === 'show') return Promise.resolve(diff);
  return Promise.resolve('');
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.clean.mockResolvedValue(snapshot);
  mock.resolve.mockImplementation(async (_repo, revision) => revision === 'base' ? base : commit);
  mock.command.mockImplementation(command);
  mock.generate.mockResolvedValue({ ok: true, message: ' feat: revised message ' });
  mock.explain.mockResolvedValue({ ok: true, explanation: 'Two files changed.' });
});
const writes = () => mock.command.mock.calls.filter(([, args]) => args.includes('commit-tree') || args[0] === 'update-ref');

describe('AI message generation and history guards', () => {
  it('generates from the selected committed patch without staging or rewriting', async () => {
    expect(await recomposeCommitMessage('/repo', commit, cloud)).toEqual({ ...snapshot, commitHash: commit, originalMessage: 'Original message\n\nOriginal body', message: 'feat: revised message', inputTruncated: false });
    expect(mock.generate).toHaveBeenCalledExactlyOnceWith({ ...cloud, diff });
    expect(mock.command).toHaveBeenCalledWith('/repo', ['show', '--format=', '--no-ext-diff', '--no-textconv', '--find-renames', commit, '--']);
    expect(writes()).toEqual([]);
  });
  it.each([undefined, { provider: 'local' }, cloud] as const)('discloses truncation only for configured remote generation (%j)', async config => {
    mock.command.mockImplementation(async (repo, args) => args.includes('--no-ext-diff') ? 'x'.repeat(8001) : command(repo, args));
    expect((await recomposeCommitMessage('/repo', commit, config)).inputTruncated).toBe(config?.provider === 'ollama');
  });
  it('refuses an unrelated commit and never contacts the model', async () => {
    mock.command.mockImplementation(async (repo, args) => { if (args.includes('--is-ancestor')) throw new Error('not ancestor'); return command(repo, args); });
    await expect(recomposeCommitMessage('/repo', commit)).rejects.toThrow('checked-out branch');
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it.each(['selected merge', 'descendant merge', 'too old'])('refuses %s before generation', async condition => {
    mock.command.mockImplementation(async (repo, args) => {
      if (condition === 'selected merge' && args.includes('--format=%P')) return `${head} ${base}`;
      if (condition === 'descendant merge' && args.includes('--merges')) return head;
      if (condition === 'too old' && args.includes('--count')) return '500';
      return command(repo, args);
    });
    await expect(recomposeCommitMessage('/repo', commit)).rejects.toThrow(condition === 'too old' ? 'latest 500' : 'linear history');
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it('refuses an empty patch without model calls or writes', async () => {
    mock.command.mockImplementation(async (repo, args) => args.includes('--no-ext-diff') ? '  ' : command(repo, args));
    await expect(recomposeCommitMessage('/repo', commit)).rejects.toThrow('no file changes');
    expect(mock.generate).not.toHaveBeenCalled(); expect(writes()).toEqual([]);
  });
  it.each([{ ok: false, error: 'Model offline' }, { ok: false }, { ok: true, message: '  ' }])('rejects failed or empty generated messages %#', async result => {
    mock.generate.mockResolvedValue(result);
    await expect(recomposeCommitMessage('/repo', commit)).rejects.toThrow(result.error || 'empty commit message');
  });
  it.each([null, {}, { head: 1, branch: 'feature' }, { head, branch: 1 }, { head: 'bad', branch: 'feature' }, { head, branch: '' }])('rejects invalid snapshot %# at runtime', async expected => {
    await expect(Reflect.apply(validateAiReword, undefined, ['/repo', commit, 'Message', expected])).rejects.toThrow('fresh message draft');
    expect(mock.clean).not.toHaveBeenCalled();
  });
  it.each([null, '', ' ', 'x'.repeat(100001), 'bad\0message'])('rejects invalid message %# without Git work', async message => {
    await expect(Reflect.apply(validateAiReword, undefined, ['/repo', commit, message, snapshot])).rejects.toThrow('nonempty commit message');
    expect(mock.clean).not.toHaveBeenCalled();
  });
  it.each([{ ...snapshot, head: base }, { ...snapshot, branch: 'other' }])('rejects a changed checkout %#', async current => {
    mock.clean.mockResolvedValue(current);
    await expect(validateAiReword('/repo', commit, 'Message', snapshot)).rejects.toThrow('branch or HEAD changed');
    expect(writes()).toEqual([]);
  });
});

describe('safe AI message application', () => {
  it('rebuilds descendant parents, preserves author/body metadata, and atomically updates only the expected branch', async () => {
    await applyAiReword('/repo', commit, '  New message  ', snapshot);
    const objects = writes().filter(([, args]) => args.includes('commit-tree'));
    expect(objects).toHaveLength(2);
    expect(objects[0]).toEqual(['/repo', ['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-p', base, '-F', '-'], 'New message\n', { GIT_AUTHOR_NAME: 'Original Author', GIT_AUTHOR_EMAIL: 'author@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T10:00:00+06:00' }]);
    expect(objects[1][1]).toContain(rewritten);
    expect(objects[1][2]).toBe('Original message\n\nOriginal body\n');
    expect(mock.command).toHaveBeenLastCalledWith('/repo', ['update-ref', '-m', 'Git Workbench: reword commit message', 'refs/heads/feature', rewritten, head]);
  });
  it('supports rewriting a root commit without a parent argument', async () => {
    mock.command.mockImplementation(async (repo, args) => args.includes('--reverse') ? '' : args.includes('--format=%P') ? '' : args.some(arg => arg.startsWith('--format=format:%T')) ? metadata('') : command(repo, args));
    await applyAiReword('/repo', commit, 'Root message', snapshot);
    const object = writes().find(([, args]) => args.includes('commit-tree'));
    expect(object?.[1]).not.toContain('-p');
  });
  it.each(['invalid-tree', 'missing-name', 'missing-email', 'missing-date'])('stops on incomplete Git metadata: %s', async condition => {
    const fields = [tree, base, 'Author', 'author@example.invalid', '2026-01-01', 'Body'];
    fields[condition === 'invalid-tree' ? 0 : condition === 'missing-name' ? 2 : condition === 'missing-email' ? 3 : 4] = '';
    mock.command.mockImplementation(async (repo, args) => args.some(arg => arg.startsWith('--format=format:%T')) ? fields.join('\0') : command(repo, args));
    await expect(applyAiReword('/repo', commit, 'Message', snapshot)).rejects.toThrow('incomplete commit metadata');
    expect(writes()).toEqual([]);
  });
  it('refuses changed trees before moving any branch', async () => {
    mock.command.mockImplementation(async (repo, args) => args[0] === 'rev-parse' && args[1] === `${rewritten}^{tree}` ? base : command(repo, args));
    await expect(applyAiReword('/repo', commit, 'Message', snapshot)).rejects.toThrow('rewritten tree differs');
    expect(writes().some(([, args]) => args[0] === 'update-ref')).toBe(false);
  });
  it('rechecks branch/HEAD after creating objects and rejects races', async () => {
    mock.clean.mockResolvedValueOnce(snapshot).mockResolvedValue({ ...snapshot, head: base });
    await expect(applyAiReword('/repo', commit, 'Message', snapshot)).rejects.toThrow('branch or HEAD changed');
    expect(writes().some(([, args]) => args[0] === 'update-ref')).toBe(false);
  });
  it('preserves a failed compare-and-swap rather than retrying or resetting', async () => {
    mock.command.mockImplementation(async (repo, args) => { if (args[0] === 'update-ref') throw new Error('HEAD moved during update'); return command(repo, args); });
    await expect(applyAiReword('/repo', commit, 'Message', snapshot)).rejects.toThrow('HEAD moved during update');
    expect(writes().filter(([, args]) => args[0] === 'update-ref')).toHaveLength(1);
  });
});

describe('committed branch explanations', () => {
  it('compares the common ancestor and selected tip with literal argument boundaries', async () => {
    expect(await explainBranchChanges('/repo', 'base', 'feature', cloud)).toEqual({ baseHash: base, tipHash: commit, mergeBase: base, commitCount: 2, filesChanged: 2, explanation: 'Two files changed.' });
    expect(mock.command).toHaveBeenCalledWith('/repo', ['diff', '--name-only', '-z', base, commit, '--']);
    expect(mock.explain).toHaveBeenCalledWith(diff, cloud);
    expect(writes()).toEqual([]);
  });
  it.each(['failure', 'empty'])('explains an unavailable common ancestor: %s', async condition => {
    mock.command.mockImplementation(async (repo, args) => { if (args[0] === 'merge-base') { if (condition === 'failure') throw new Error('unrelated'); return ''; } return command(repo, args); });
    await expect(explainBranchChanges('/repo', 'base', 'tip')).rejects.toThrow('no common ancestor');
    expect(mock.explain).not.toHaveBeenCalled();
  });
  it('returns an empty comparison without contacting a model', async () => {
    mock.command.mockImplementation(async (repo, args) => args[0] === 'diff' ? '' : command(repo, args));
    expect(await explainBranchChanges('/repo', 'base', 'tip')).toMatchObject({ filesChanged: 0, explanation: expect.stringContaining('no file changes') });
    expect(mock.explain).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, error: 'Model unavailable' }, { ok: false }, { ok: true, explanation: '  ' }])('rejects empty or failed explanations %#', async result => {
    mock.explain.mockResolvedValue(result);
    await expect(explainBranchChanges('/repo', 'base', 'tip')).rejects.toThrow(result.error || 'empty explanation');
  });
});
