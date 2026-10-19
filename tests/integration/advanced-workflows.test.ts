import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitFixture, createMergeConflict, type GitFixture } from './git-fixture';
import { getBisectState, resetBisect, startBisect, stepBisect } from '../../src/main/git/bisect';
import { createRecoveryBranch, getReflog, restoreHeadFromReflog } from '../../src/main/git/reflog';
import { applyCommitSplit, discardCommitSplit, getCommitSplit, listCommitSplitPreviews, previewCommitSplit } from '../../src/main/git/commit-split';
import { beginRewrite, compareCommitRanges, deleteRewriteSession, finishRewrite, listRewriteSessions, recordCompletedRewrite } from '../../src/main/git/rewrite-comparison';
import { applyStackRestack, discardStackRestack, getBranchStack, previewStackRestack, resumeStackRestack, setStackParent } from '../../src/main/git/branch-stacks';
import { listRestorePoints } from '../../src/main/git/restore-points';

describe('bisect and reflog recovery', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('finds the first bad commit and restores the original branch on reset', async () => {
    const commits = [fixture.initialHash];
    for (let index = 1; index <= 5; index++) { await fixture.write('readme.txt', `${index}\n`); commits.push(await fixture.commitAll(`Step ${index}`)); }
    expect(await getBisectState(fixture.repo)).toEqual({ active: false });
    const started = await startBisect(fixture.repo, commits[5], commits[0]);
    expect(started).toMatchObject({ ok: true, state: { active: true, needsGood: false, needsBad: false } });
    let state = started.state!;
    for (let attempt = 0; !state.culpritCommit && attempt < 10; attempt++) {
      const index = commits.indexOf(state.currentCommit!.hash);
      expect(index).toBeGreaterThanOrEqual(0);
      const result = await stepBisect(fixture.repo, index >= 3 ? 'bad' : 'good');
      expect(result.ok).toBe(true); state = result.state!;
    }
    expect(state.culpritCommit).toMatchObject({ hash: commits[3], message: 'Step 3', authorName: 'Git Workbench Test' });
    expect((await getBisectState(fixture.repo)).culpritCommit?.hash).toBe(commits[3]);
    expect(await resetBisect(fixture.repo)).toEqual({ ok: true });
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(commits[5]);
    expect(await getBisectState(fixture.repo)).toEqual({ active: false });
  });

  it('supports incremental bisect bounds and refuses starting another active session', async () => {
    await fixture.write('next.txt', 'next\n'); const next = await fixture.commitAll('Next');
    const start = await startBisect(fixture.repo);
    expect(start).toMatchObject({ ok: true, state: { active: true, needsBad: true, needsGood: true } });
    expect(await startBisect(fixture.repo, next)).toMatchObject({ ok: true, state: { needsBad: false, needsGood: true } });
    expect(await startBisect(fixture.repo, next, fixture.initialHash)).toMatchObject({ ok: false, error: expect.stringContaining('already active') });
    expect(await startBisect(fixture.repo, undefined, fixture.initialHash)).toMatchObject({ ok: true });
    await resetBisect(fixture.repo);
  });

  it('rejects dirty checkout, invalid bounds and verdicts without a session', async () => {
    expect(await stepBisect(fixture.repo, 'good')).toMatchObject({ ok: false, error: 'No bisect session is active.' });
    expect(await startBisect(fixture.repo, 'not-a-ref', fixture.initialHash)).toMatchObject({ ok: false });
    expect(await getBisectState(fixture.repo)).toEqual({ active: false });
    await fixture.write('readme.txt', 'unsaved\n');
    expect(await startBisect(fixture.repo)).toMatchObject({ ok: false, error: 'Commit or stash your changes before starting bisect.' });
    expect(await fixture.read('readme.txt')).toBe('unsaved\n');
  });

  it('lists reflog entries and creates uniquely named branches without checkout', async () => {
    await fixture.write('next.txt', 'next\n'); const next = await fixture.commitAll('Next');
    await fixture.git('reset', '--hard', fixture.initialHash);
    expect(await getReflog(fixture.repo)).toEqual(expect.arrayContaining([expect.objectContaining({ hash: next, subject: 'Next', action: expect.stringContaining('commit'), ref: expect.any(String), date: expect.any(String) })]));
    const first = await createRecoveryBranch(fixture.repo, next);
    const second = await createRecoveryBranch(fixture.repo, next);
    expect(second.branchName).toBe(`${first.branchName}-2`);
    expect((await fixture.git('rev-parse', first.branchName)).trim()).toBe(next);
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
    expect(await createRecoveryBranch(fixture.repo, next, ' rescue/next ')).toEqual({ branchName: 'rescue/next' });
    await expect(createRecoveryBranch(fixture.repo, next, 'rescue/next')).rejects.toThrow('already exists');
    await expect(createRecoveryBranch(fixture.repo, next, '-unsafe')).rejects.toThrow('hyphen');
    await expect(createRecoveryBranch(fixture.repo, 'HEAD')).rejects.toThrow('valid commit');
  });

  it('restores HEAD with a backup branch and protects dirty or detached checkouts', async () => {
    await fixture.write('next.txt', 'next\n'); const next = await fixture.commitAll('Next');
    await fixture.write('readme.txt', 'unsaved\n');
    await expect(restoreHeadFromReflog(fixture.repo, fixture.initialHash)).rejects.toThrow('working tree changes');
    expect(await fixture.read('readme.txt')).toBe('unsaved\n');
    await fixture.git('restore', 'readme.txt');
    await expect(restoreHeadFromReflog(fixture.repo, next)).rejects.toThrow('already the current commit');
    const restored = await restoreHeadFromReflog(fixture.repo, fixture.initialHash);
    expect(restored.branchName).toBe('main');
    expect((await fixture.git('rev-parse', restored.backupBranch)).trim()).toBe(next);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
    await fixture.git('checkout', '--detach', next);
    await expect(restoreHeadFromReflog(fixture.repo, fixture.initialHash)).rejects.toThrow('Check out a local branch');
  });

  it('blocks reflog restore during a merge', async () => {
    await createMergeConflict(fixture);
    await expect(restoreHeadFromReflog(fixture.repo, fixture.initialHash)).rejects.toThrow('active merge');
  });
});

describe('commit splitting and rewrite comparisons', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  async function splitPlan() {
    await fixture.write('one.txt', 'one\n'); await fixture.write('two.txt', 'two\n');
    const hash = await fixture.commitAll('Combined work');
    return getCommitSplit(fixture.repo, hash);
  }

  it('previews then applies a split preserving the exact end tree and later commits', async () => {
    const plan = await splitPlan();
    await fixture.write('later.txt', 'later\n'); const oldHead = await fixture.commitAll('Later work');
    const current = await getCommitSplit(fixture.repo, plan.hash);
    expect(current.descendantCount).toBe(1);
    const oldTree = (await fixture.git('rev-parse', 'HEAD^{tree}')).trim();
    const preview = await previewCommitSplit(fixture.repo, { hash: plan.hash, head: oldHead, groups: current.units.map((unit, index) => ({ message: `Split ${index + 1}`, units: [unit.id] })) });
    expect(preview.commits).toHaveLength(2);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(oldHead);
    expect(await fixture.git('status', '--porcelain')).toBe('');
    expect(await listCommitSplitPreviews(fixture.repo)).toHaveLength(1);
    expect(await applyCommitSplit(fixture.repo, preview.id)).toMatchObject({ ok: true, warning: '', rewriteId: expect.any(String) });
    expect((await fixture.git('rev-parse', 'HEAD^{tree}')).trim()).toBe(oldTree);
    expect((await fixture.git('log', '--format=%s', '--reverse')).trim().split('\n')).toEqual(['Initial fixture', 'Split 1', 'Split 2', 'Later work']);
    expect(await listCommitSplitPreviews(fixture.repo)).toEqual([]);
    expect(await listRestorePoints(fixture.repo)).toHaveLength(1);
    expect((await listRewriteSessions(fixture.repo))[0]).toMatchObject({ operation: 'split-commit', status: 'completed', oldTip: oldHead });
  });

  it('rejects insufficient units, duplicate assignments, empty groups and stale previews', async () => {
    await expect(getCommitSplit(fixture.repo, 'HEAD')).rejects.toThrow('fewer than two');
    const plan = await splitPlan();
    const input = { hash: plan.hash, head: plan.head, groups: [{ message: 'One', units: [plan.units[0].id] }, { message: 'Two', units: [plan.units[1].id] }] };
    await expect(previewCommitSplit(fixture.repo, { ...input, groups: input.groups.slice(0, 1) })).rejects.toThrow('between 2 and 20');
    await expect(previewCommitSplit(fixture.repo, { ...input, groups: [{ message: 'One', units: [plan.units[0].id] }, { message: 'Two', units: [plan.units[0].id] }] })).rejects.toThrow('exactly one');
    await expect(previewCommitSplit(fixture.repo, { ...input, groups: [{ message: '', units: [plan.units[0].id] }, input.groups[1]] })).rejects.toThrow('needs a message');
    const preview = await previewCommitSplit(fixture.repo, input);
    await fixture.write('later.txt', 'later\n'); await fixture.commitAll('Change head');
    await expect(applyCommitSplit(fixture.repo, preview.id)).rejects.toThrow('checkout changed');
    await expect(previewCommitSplit(fixture.repo, input)).rejects.toThrow('HEAD changed');
    expect(await discardCommitSplit(fixture.repo, preview.id)).toEqual({ ok: true });
    expect(await listCommitSplitPreviews(fixture.repo)).toEqual([]);
    await expect(discardCommitSplit(fixture.repo, '../invalid')).rejects.toThrow('Invalid split preview');
  });

  it('compares rewritten commits and retains original commits through explicit pinned refs', async () => {
    await fixture.write('new.txt', 'new\n'); const oldTip = await fixture.commitAll('Original message');
    const session = await beginRewrite(fixture.repo, 'git:edit-commit-message', [oldTip]);
    expect(session).toMatchObject({ status: 'running', branch: 'main', oldBase: fixture.initialHash, oldTip });
    await fixture.git('commit', '--amend', '-m', 'Revised message');
    const newTip = (await fixture.git('rev-parse', 'HEAD')).trim();
    const completed = await finishRewrite(fixture.repo, {});
    expect(completed).toMatchObject({ status: 'completed', newTip });
    const comparison = await compareCommitRanges(fixture.repo, { oldBase: fixture.initialHash, oldTip, newBase: fixture.initialHash, newTip });
    expect(comparison).toMatchObject({ beforeCount: 1, afterCount: 1, entries: [expect.objectContaining({ kind: 'changed', oldHash: oldTip, newHash: newTip })] });
    expect((await fixture.git('rev-parse', `refs/git-workbench/rewrites/${session!.id}/old-tip`)).trim()).toBe(oldTip);
    await deleteRewriteSession(fixture.repo, session!.id);
    expect(await listRewriteSessions(fixture.repo)).toEqual([]);
    await expect(deleteRewriteSession(fixture.repo, session!.id)).rejects.toThrow('not found');
    await expect(deleteRewriteSession(fixture.repo, '../invalid')).rejects.toThrow('Invalid rewrite record');
    expect(await beginRewrite(fixture.repo, 'git:status', [])).toBeNull();
    expect(await finishRewrite(fixture.repo)).toBeNull();
  });

  it('records completed root rewrites with an empty comparison baseline', async () => {
    const id = await recordCompletedRewrite(fixture.repo, { operation: 'manual', branch: 'main', oldTip: fixture.initialHash, newTip: fixture.initialHash });
    const [record] = await listRewriteSessions(fixture.repo);
    expect(record).toMatchObject({ id, status: 'completed', operation: 'manual' });
    expect((await fixture.git('ls-tree', record.oldBase)).trim()).toBe('');
    await expect(compareCommitRanges(fixture.repo, { oldBase: '', oldTip: fixture.initialHash, newBase: fixture.initialHash, newTip: fixture.initialHash })).rejects.toThrow('valid commit revision');
  });

  it('splits a root commit into independent commits without introducing an artificial parent', async () => {
    const root = await createGitFixture({ 'one.txt': 'one\n', 'two.txt': 'two\n' });
    try {
      const plan = await getCommitSplit(root.repo, root.initialHash);
      expect(plan.parent).toBe('');
      const preview = await previewCommitSplit(root.repo, { hash: plan.hash, head: plan.head, groups: plan.units.map((unit, index) => ({ message: `Root part ${index}`, units: [unit.id] })) });
      expect(await applyCommitSplit(root.repo, preview.id)).toMatchObject({ ok: true });
      expect((await root.git('rev-list', '--count', 'HEAD')).trim()).toBe('2');
      expect((await root.git('show', '-s', '--format=%P', 'HEAD~1')).trim()).toBe('');
      expect(await root.read('one.txt')).toBe('one\n'); expect(await root.read('two.txt')).toBe('two\n');
    } finally { await root.cleanup(); }
  });

  it('refuses splitting merge commits or rewriting through later merge topology', async () => {
    const plan = await splitPlan();
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('feature.txt', 'feature\n'); await fixture.commitAll('Feature');
    await fixture.git('checkout', 'main'); await fixture.write('main.txt', 'main\n'); await fixture.commitAll('Main');
    await fixture.git('merge', '--no-ff', 'feature', '-m', 'Merge');
    await expect(getCommitSplit(fixture.repo, 'HEAD')).rejects.toThrow('non-merge commit');
    await expect(getCommitSplit(fixture.repo, plan.hash)).rejects.toThrow('linear history');
    expect(await fixture.git('status', '--porcelain')).toBe('');
  });

  it('protects a split preview whose pinned ref no longer matches its reviewed result', async () => {
    const plan = await splitPlan();
    const preview = await previewCommitSplit(fixture.repo, { hash: plan.hash, head: plan.head, groups: plan.units.map((unit, index) => ({ message: `Part ${index}`, units: [unit.id] })) });
    await fixture.git('update-ref', `refs/git-workbench/splits/${preview.id}`, fixture.initialHash);
    await expect(applyCommitSplit(fixture.repo, preview.id)).rejects.toThrow('no longer available');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(plan.head);
    expect(await fixture.read('one.txt')).toBe('one\n');
    await discardCommitSplit(fixture.repo, preview.id);
  });
});

describe('branch stack dependency management and safe preview restacks', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('creates parent links, detects cycles and removes links', async () => {
    await fixture.git('branch', 'feature/one'); await fixture.git('branch', 'feature/two');
    expect(await getBranchStack(fixture.repo)).toMatchObject({ links: [], branches: ['feature/one', 'feature/two', 'main'], sessions: [] });
    await setStackParent(fixture.repo, 'feature/one', 'main');
    const linked = await setStackParent(fixture.repo, 'feature/two', 'feature/one');
    expect(linked.links).toHaveLength(2);
    expect(linked.links[0]).toMatchObject({ branch: 'feature/one', parent: 'main', base: fixture.initialHash, commits: 0 });
    await expect(setStackParent(fixture.repo, 'main', 'feature/two')).rejects.toThrow('cycle');
    await expect(setStackParent(fixture.repo, 'main', 'main')).rejects.toThrow('itself');
    await expect(setStackParent(fixture.repo, '-bad', 'main')).rejects.toThrow('valid local branch');
    expect((await setStackParent(fixture.repo, 'feature/two', null)).links).toHaveLength(1);
  });

  it('previews descendants in an isolated worktree and atomically applies them with recovery records', async () => {
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('feature.txt', 'feature\n'); const oldFeature = await fixture.commitAll('Feature');
    await setStackParent(fixture.repo, 'feature', 'main');
    await fixture.git('checkout', 'main'); await fixture.write('main.txt', 'main update\n'); const root = await fixture.commitAll('Main update');
    const preview = await previewStackRestack(fixture.repo, 'main');
    try {
      expect(preview).toMatchObject({ root: 'main', rootHead: root, state: 'ready', index: 1, steps: [expect.objectContaining({ branch: 'feature', oldHead: oldFeature, onto: root, newHead: expect.any(String) })] });
      expect((await fixture.git('rev-parse', 'feature')).trim()).toBe(oldFeature);
      expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(root);
      expect(await applyStackRestack(fixture.repo, preview.id)).toEqual({ ok: true, warning: '' });
      const feature = (await fixture.git('rev-parse', 'feature')).trim();
      expect(feature).toBe(preview.steps[0].newHead);
      expect((await fixture.git('show', 'feature:main.txt'))).toBe('main update\n');
      expect((await getBranchStack(fixture.repo)).links[0].base).toBe(root);
      expect(await listRestorePoints(fixture.repo)).toHaveLength(1);
      await expect(resumeStackRestack(fixture.repo, preview.id)).rejects.toThrow('already been applied');
    } finally { await discardStackRestack(fixture.repo, preview.id); }
    expect((await getBranchStack(fixture.repo)).sessions).toEqual([]);
  });

  it('rejects empty descendant previews and stale parent registries before apply', async () => {
    await expect(previewStackRestack(fixture.repo, 'main')).rejects.toThrow('no linked descendants');
    await fixture.git('branch', 'feature'); await setStackParent(fixture.repo, 'feature', 'main');
    const preview = await previewStackRestack(fixture.repo, 'main');
    try {
      await setStackParent(fixture.repo, 'feature', 'main', true);
      await expect(applyStackRestack(fixture.repo, preview.id)).rejects.toThrow('current stack');
      expect(await resumeStackRestack(fixture.repo, preview.id)).toMatchObject({ state: 'paused', error: expect.stringContaining('Stack links changed') });
      expect((await fixture.git('rev-parse', 'feature')).trim()).toBe(fixture.initialHash);
    } finally { await discardStackRestack(fixture.repo, preview.id); }
  });

  it('refuses applying stack changes while an affected branch is checked out', async () => {
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('feature.txt', 'feature\n'); await fixture.commitAll('Feature');
    await setStackParent(fixture.repo, 'feature', 'main');
    await fixture.git('checkout', 'main'); await fixture.write('main.txt', 'main\n'); await fixture.commitAll('New base');
    const preview = await previewStackRestack(fixture.repo, 'main');
    try {
      await fixture.git('checkout', 'feature');
      await expect(applyStackRestack(fixture.repo, preview.id)).rejects.toThrow('Affected branches must not be checked out');
      expect((await fixture.git('rev-parse', 'feature')).trim()).toBe(preview.steps[0].oldHead);
    } finally { await fixture.git('checkout', 'main'); await discardStackRestack(fixture.repo, preview.id); }
  });

  it('pauses conflicting restacks in the preview while preserving the original checkout and tips', async () => {
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('readme.txt', 'feature version\n'); const feature = await fixture.commitAll('Feature');
    await setStackParent(fixture.repo, 'feature', 'main');
    await fixture.git('checkout', 'main'); await fixture.write('readme.txt', 'main version\n'); const main = await fixture.commitAll('New base');
    const preview = await previewStackRestack(fixture.repo, 'main');
    try {
      expect(preview).toMatchObject({ state: 'paused', index: 0, error: expect.any(String) });
      expect((await fixture.git('rev-parse', 'main')).trim()).toBe(main);
      expect((await fixture.git('rev-parse', 'feature')).trim()).toBe(feature);
      expect(await fixture.read('readme.txt')).toBe('main version\n');
      expect(await fixture.git('status', '--porcelain')).toBe('');
      expect(await resumeStackRestack(fixture.repo, preview.id)).toMatchObject({ state: 'paused', error: expect.stringContaining('Resolve conflicts in the preview worktree') });
      await expect(applyStackRestack(fixture.repo, preview.id)).rejects.toThrow('complete preview');
    } finally { await discardStackRestack(fixture.repo, preview.id); }
  });
});
