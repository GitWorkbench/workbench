import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { abortOperation, cherryPick, continueOperation, executeInteractiveRebase, getCommitsForRebase, getRepoOperationState, simulateMerge } from '../../src/main/git/conflicts-rebase';
import { getConflictFile, resolveConflictFile } from '../../src/main/git/conflict-files';
import { applyPatchCommit, checkoutCommit, createBranchAt, dropCommit, editCommitMessage, moveCommitDown, resetBranchTo, revertCommit } from '../../src/main/git/history';
import { getStatus } from '../../src/main/git/status-diff';
import { createGitFixture, createMergeConflict, type GitFixture } from './git-fixture';

describe('conflict resolution and history editing with isolated Git repositories', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); vi.restoreAllMocks(); });

  it('reports ordinary operation state and safely no-ops continue/abort', async () => {
    expect(await getRepoOperationState(fixture.repo)).toEqual({ inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: [] });
    await continueOperation(fixture.repo);
    await abortOperation(fixture.repo);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
  });

  it('simulates clean and conflicting merges without touching the index or files', async () => {
    await fixture.git('checkout', '-b', 'clean-feature');
    await fixture.write('feature.txt', 'feature\n'); await fixture.commitAll('Feature');
    await fixture.git('checkout', 'main');
    const before = await fixture.git('status', '--porcelain');
    expect(await simulateMerge(fixture.repo, 'clean-feature')).toMatchObject({ clean: true, conflicts: [] });
    expect(await fixture.git('status', '--porcelain')).toBe(before);
    await createMergeConflict(fixture);
    await abortOperation(fixture.repo);
    const current = await fixture.read('readme.txt');
    expect(await simulateMerge(fixture.repo, 'incoming')).toMatchObject({ clean: false, conflicts: ['readme.txt'] });
    expect(await fixture.read('readme.txt')).toBe(current);
    expect((await getRepoOperationState(fixture.repo)).inMerge).toBe(false);
  });

  it('reads base, current and incoming versions and applies a reviewed text result', async () => {
    await createMergeConflict(fixture);
    expect(await getRepoOperationState(fixture.repo)).toMatchObject({ inMerge: true, conflictedFiles: ['readme.txt'] });
    const status = await getStatus(fixture.repo);
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toEqual([{ path: 'readme.txt', status: 'conflicted', staged: false, unstaged: true }]);
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict).toMatchObject({ baseContent: 'baseline\n', currentContent: 'current change\n', incomingContent: 'incoming change\n', kind: 'text', totalConflicts: 1, workingTreeExists: true, lineEnding: '\n' });
    expect(conflict.sections.some(section => section.type === 'conflict')).toBe(true);
    await resolveConflictFile(fixture.repo, 'readme.txt', 'combined result\n', { expectedSnapshot: conflict.snapshot, action: 'result' });
    expect(await fixture.read('readme.txt')).toBe('combined result\n');
    expect(await fixture.git('show', ':readme.txt')).toBe('combined result\n');
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual([]);
    await continueOperation(fixture.repo);
    expect((await getRepoOperationState(fixture.repo)).inMerge).toBe(false);
    expect((await fixture.git('show', '-s', '--format=%P', 'HEAD')).trim().split(' ')).toHaveLength(2);
    await expect(getConflictFile(fixture.repo, 'readme.txt')).rejects.toThrow('no longer conflicted');
  });

  it.each(['current', 'incoming'] as const)('chooses a complete %s version and stages it', async action => {
    await createMergeConflict(fixture);
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    await resolveConflictFile(fixture.repo, 'readme.txt', '', { expectedSnapshot: conflict.snapshot, action });
    expect(await fixture.read('readme.txt')).toBe(`${action} change\n`);
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual([]);
  });

  it('rejects unresolved markers without changing the conflicted file or index', async () => {
    await createMergeConflict(fixture);
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    await expect(resolveConflictFile(fixture.repo, 'readme.txt', conflict.rawContent, { expectedSnapshot: conflict.snapshot, action: 'result' })).rejects.toThrow('Remove all conflict markers');
    expect(await fixture.read('readme.txt')).toBe(conflict.rawContent);
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual(['readme.txt']);
  });

  it('protects external edits from a stale merge editor snapshot', async () => {
    await createMergeConflict(fixture);
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    await fixture.write('readme.txt', 'external edit\n');
    await expect(resolveConflictFile(fixture.repo, 'readme.txt', 'stale editor\n', { expectedSnapshot: conflict.snapshot, action: 'result' })).rejects.toThrow('changed outside');
    expect(await fixture.read('readme.txt')).toBe('external edit\n');
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual(['readme.txt']);
  });

  it('provides an actionable parse warning for incomplete external conflict markers', async () => {
    await createMergeConflict(fixture);
    await fixture.write('readme.txt', '<<<<<<< HEAD\nunfinished external edit\n');
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict).toMatchObject({ kind: 'text', totalConflicts: 0, parseWarning: expect.stringContaining('markers are incomplete') });
    expect(conflict.sections).toEqual([{ type: 'text', lines: ['<<<<<<< HEAD', 'unfinished external edit', ''] }]);
    await resolveConflictFile(fixture.repo, 'readme.txt', '', { expectedSnapshot: conflict.snapshot, action: 'incoming' });
    expect(await fixture.read('readme.txt')).toBe('incoming change\n');
  });

  it('detects CRLF content and preserves reviewed line endings when saving the result', async () => {
    await fixture.write('readme.txt', 'base\r\n'); await fixture.commitAll('CRLF baseline');
    await fixture.git('checkout', '-b', 'incoming'); await fixture.write('readme.txt', 'incoming\r\n'); await fixture.commitAll('CRLF incoming');
    await fixture.git('checkout', 'main'); await fixture.write('readme.txt', 'current\r\n'); await fixture.commitAll('CRLF current');
    await fixture.git('merge', 'incoming').catch(() => {});
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict.lineEnding).toBe('\r\n');
    expect(conflict.currentContent).toBe('current\r\n');
    await resolveConflictFile(fixture.repo, 'readme.txt', 'combined\r\n', { expectedSnapshot: conflict.snapshot, action: 'result' });
    expect(await fixture.read('readme.txt')).toBe('combined\r\n');
  });

  it('requires complete-side choices for conflicting symbolic links without reading their targets', async () => {
    const { unlink, readlink } = await import('node:fs/promises');
    await fixture.git('config', '--local', 'core.symlinks', 'true');
    await unlink(path.join(fixture.repo, 'readme.txt')); await symlink('base-target', path.join(fixture.repo, 'readme.txt')); await fixture.commitAll('Symlink baseline');
    await fixture.git('checkout', '-b', 'incoming'); await unlink(path.join(fixture.repo, 'readme.txt')); await symlink('incoming-target', path.join(fixture.repo, 'readme.txt')); await fixture.commitAll('Incoming link');
    await fixture.git('checkout', 'main'); await unlink(path.join(fixture.repo, 'readme.txt')); await symlink('current-target', path.join(fixture.repo, 'readme.txt')); await fixture.commitAll('Current link');
    await fixture.git('merge', 'incoming').catch(() => {});
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict).toMatchObject({ kind: 'symlink', currentContent: 'current-target', incomingContent: 'incoming-target' });
    await expect(resolveConflictFile(fixture.repo, 'readme.txt', 'unreviewed-target', { expectedSnapshot: conflict.snapshot, action: 'result' })).rejects.toThrow('complete side');
    await resolveConflictFile(fixture.repo, 'readme.txt', '', { expectedSnapshot: conflict.snapshot, action: 'incoming' });
    expect(await readlink(path.join(fixture.repo, 'readme.txt'))).toBe('incoming-target');
  });

  it('refuses paths outside the repository and symlinked parent escapes', async () => {
    await expect(getConflictFile(fixture.repo, '../outside.txt')).rejects.toThrow('inside the open repository');
    await expect(resolveConflictFile(fixture.repo, '', 'text')).rejects.toThrow('inside the open repository');
    const outside = path.join(fixture.root, 'outside'); await mkdir(outside);
    await writeFile(path.join(outside, 'target.txt'), 'keep safe\n');
    await symlink(outside, path.join(fixture.repo, 'escape'));
    await expect(getConflictFile(fixture.repo, 'escape/target.txt')).rejects.toThrow('outside the repository');
    expect(await readFile(path.join(outside, 'target.txt'), 'utf8')).toBe('keep safe\n');
  });

  it('can resolve delete/modify conflicts by accepting the deleted side', async () => {
    await fixture.git('checkout', '-b', 'incoming');
    await fixture.write('readme.txt', 'incoming modified\n'); await fixture.commitAll('Modify incoming');
    await fixture.git('checkout', 'main'); await fixture.git('rm', 'readme.txt'); await fixture.commitAll('Delete current');
    await fixture.git('merge', 'incoming').catch(() => {});
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict.currentContent).toBeNull();
    expect(conflict.incomingContent).toBe('incoming modified\n');
    await resolveConflictFile(fixture.repo, 'readme.txt', '', { expectedSnapshot: conflict.snapshot, action: 'current' });
    await expect(fixture.read('readme.txt')).rejects.toThrow();
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual([]);
  });

  it('reads add/add conflicts with no base and supports an explicit delete result', async () => {
    await fixture.git('checkout', '-b', 'incoming'); await fixture.write('added.txt', 'incoming\n'); await fixture.commitAll('Incoming addition');
    await fixture.git('checkout', 'main'); await fixture.write('added.txt', 'current\n'); await fixture.commitAll('Current addition');
    await fixture.git('merge', 'incoming').catch(() => {});
    const conflict = await getConflictFile(fixture.repo, 'added.txt');
    expect(conflict.baseContent).toBeNull();
    await resolveConflictFile(fixture.repo, 'added.txt', '', { expectedSnapshot: conflict.snapshot, action: 'delete' });
    await expect(fixture.read('added.txt')).rejects.toThrow();
    expect((await getRepoOperationState(fixture.repo)).conflictedFiles).toEqual([]);
  });

  it('requires complete-side choices for binary conflicts', async () => {
    await fixture.write('readme.txt', Buffer.from([0, 1])); await fixture.commitAll('Binary base');
    await fixture.git('checkout', '-b', 'incoming'); await fixture.write('readme.txt', Buffer.from([0, 2])); await fixture.commitAll('Binary incoming');
    await fixture.git('checkout', 'main'); await fixture.write('readme.txt', Buffer.from([0, 3])); await fixture.commitAll('Binary current');
    await fixture.git('merge', 'incoming').catch(() => {});
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    expect(conflict.kind).toBe('binary');
    await expect(resolveConflictFile(fixture.repo, 'readme.txt', 'text', { expectedSnapshot: conflict.snapshot, action: 'result' })).rejects.toThrow('complete side');
    await resolveConflictFile(fixture.repo, 'readme.txt', '', { expectedSnapshot: conflict.snapshot, action: 'incoming' });
    expect(await readFile(path.join(fixture.repo, 'readme.txt'))).toEqual(Buffer.from([0, 2]));
  });

  it('aborts an active merge and restores the premerge state', async () => {
    await createMergeConflict(fixture);
    const hash = (await fixture.git('rev-parse', 'HEAD')).trim();
    await abortOperation(fixture.repo);
    expect(await fixture.read('readme.txt')).toBe('current change\n');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(hash);
    expect((await getRepoOperationState(fixture.repo)).inMerge).toBe(false);
    await expect(resolveConflictFile(fixture.repo, 'readme.txt', 'result')).rejects.toThrow('no longer conflicted');
  });

  it('cherry-picks a clean commit, reports invalid revisions and preserves conflicts for resolution', async () => {
    await fixture.git('checkout', '-b', 'incoming'); await fixture.write('picked.txt', 'picked\n');
    const hash = await fixture.commitAll('Pick me'); await fixture.git('checkout', 'main');
    expect(await cherryPick(fixture.repo, hash)).toEqual({ ok: true });
    expect(await fixture.read('picked.txt')).toBe('picked\n');
    expect(await cherryPick(fixture.repo, 'not-a-revision')).toMatchObject({ ok: false, error: expect.any(String) });
    await fixture.git('checkout', 'incoming'); await fixture.write('readme.txt', 'incoming\n');
    const conflicting = await fixture.commitAll('Conflicting pick'); await fixture.git('checkout', 'main');
    await fixture.write('readme.txt', 'current\n'); await fixture.commitAll('Current version');
    expect(await cherryPick(fixture.repo, conflicting)).toMatchObject({ ok: false, hasConflicts: true });
    expect((await getRepoOperationState(fixture.repo)).inCherryPick).toBe(true);
    await abortOperation(fixture.repo);
    expect((await getRepoOperationState(fixture.repo)).inCherryPick).toBe(false);
    expect(await fixture.read('readme.txt')).toBe('current\n');
  });

  it('checks out detached commit, creates a branch at history and applies/reverts commits', async () => {
    await fixture.write('next.txt', 'next\n'); const next = await fixture.commitAll('Next');
    await createBranchAt(fixture.repo, 'from-base', fixture.initialHash);
    await checkoutCommit(fixture.repo, next);
    expect((await fixture.git('rev-parse', '--abbrev-ref', 'HEAD')).trim()).toBe('HEAD');
    await fixture.git('checkout', 'from-base');
    await applyPatchCommit(fixture.repo, next);
    expect(await fixture.read('next.txt')).toBe('next\n');
    await revertCommit(fixture.repo, 'HEAD');
    await expect(fixture.read('next.txt')).rejects.toThrow();
    expect((await fixture.git('show', '-s', '--format=%s', 'HEAD')).trim()).toContain('Revert');
  });

  it.each(['soft', 'mixed', 'hard'] as const)('resets history in %s mode with the expected index and worktree', async mode => {
    await fixture.write('readme.txt', 'new\n'); await fixture.commitAll('New content');
    await resetBranchTo(fixture.repo, fixture.initialHash, mode);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
    expect(await fixture.read('readme.txt')).toBe(mode === 'hard' ? 'baseline\n' : 'new\n');
    const status = await getStatus(fixture.repo);
    expect(status.staged).toHaveLength(mode === 'soft' ? 1 : 0);
    expect(status.unstaged).toHaveLength(mode === 'mixed' ? 1 : 0);
  });

  it('amends HEAD message without including staged changes', async () => {
    await fixture.write('staged.txt', 'do not commit\n'); await fixture.git('add', 'staged.txt');
    await editCommitMessage(fixture.repo, fixture.initialHash, 'Revised subject\n\nRevised body');
    expect((await fixture.git('show', '-s', '--format=%B', 'HEAD')).trim()).toBe('Revised subject\n\nRevised body');
    expect((await getStatus(fixture.repo)).staged.map(file => file.path)).toEqual(['staged.txt']);
    await expect(fixture.git('show', 'HEAD:staged.txt')).rejects.toThrow();
  });

  it('rewords an older commit including a root commit through rebase', async () => {
    await fixture.write('later.txt', 'later\n'); await fixture.commitAll('Later');
    await editCommitMessage(fixture.repo, fixture.initialHash, 'Reworded root');
    expect((await fixture.git('log', '--format=%s', '--reverse')).trim().split('\n')).toEqual(['Reworded root', 'Later']);
    expect(await fixture.read('later.txt')).toBe('later\n');
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(false);
  });

  it('drops an independent commit without losing later changes', async () => {
    await fixture.write('drop.txt', 'drop\n'); const dropped = await fixture.commitAll('Drop me');
    await fixture.write('keep.txt', 'keep\n'); await fixture.commitAll('Keep me');
    await dropCommit(fixture.repo, dropped);
    expect((await fixture.git('log', '--format=%s')).trim().split('\n')).toEqual(['Keep me', 'Initial fixture']);
    await expect(fixture.read('drop.txt')).rejects.toThrow();
    expect(await fixture.read('keep.txt')).toBe('keep\n');
  });

  it('moves an independent commit toward older history and refuses moving the root', async () => {
    await expect(moveCommitDown(fixture.repo, fixture.initialHash)).rejects.toThrow('root commit');
    await fixture.write('first.txt', 'first\n'); await fixture.commitAll('First');
    await fixture.write('second.txt', 'second\n'); const second = await fixture.commitAll('Second');
    await moveCommitDown(fixture.repo, second);
    expect((await fixture.git('log', '--format=%s', '--reverse')).trim().split('\n')).toEqual(['Initial fixture', 'Second', 'First']);
    expect(await fixture.read('first.txt')).toBe('first\n'); expect(await fixture.read('second.txt')).toBe('second\n');
  });

  it('lists and executes a custom interactive rebase plan with reword and drop', async () => {
    await fixture.write('first.txt', 'first\n'); await fixture.commitAll('First');
    await fixture.write('second.txt', 'second\n'); await fixture.commitAll('Second');
    const steps = await getCommitsForRebase(fixture.repo, fixture.initialHash);
    expect(steps.map(step => step.message)).toEqual(['First', 'Second']);
    expect(await executeInteractiveRebase(fixture.repo, fixture.initialHash, [
      { ...steps[0], action: 'reword', message: 'First revised\n\nDetailed message' }, { ...steps[1], action: 'drop' }
    ])).toEqual({ ok: true });
    expect((await fixture.git('log', '--format=%s', '--reverse')).trim().split('\n')).toEqual(['Initial fixture', 'First revised']);
    expect((await fixture.git('show', '-s', '--format=%B', 'HEAD')).trim()).toBe('First revised\n\nDetailed message');
    await expect(fixture.read('second.txt')).rejects.toThrow();
  });

  it('rejects invalid rebase plans and active operations before changing history', async () => {
    expect(await executeInteractiveRebase(fixture.repo, fixture.initialHash, [])).toMatchObject({ ok: false, error: 'Invalid or empty rebase plan.' });
    expect(await executeInteractiveRebase(fixture.repo, fixture.initialHash, [{ hash: 'invalid', shortHash: 'invalid', author: 'Test', action: 'pick', message: 'Bad' }])).toMatchObject({ ok: false });
    expect(await getCommitsForRebase(fixture.repo, 'invalid')).toEqual([]);
    await createMergeConflict(fixture);
    expect(await executeInteractiveRebase(fixture.repo, fixture.initialHash, [])).toMatchObject({ ok: false, error: expect.stringContaining('current Git operation') });
    expect((await getRepoOperationState(fixture.repo)).inMerge).toBe(true);
  });

  it('aborts failed history rewrites to preserve the original branch and dependent changes', async () => {
    await fixture.write('readme.txt', 'first version\n'); const first = await fixture.commitAll('First dependent change');
    await fixture.write('readme.txt', 'second version\n'); const original = await fixture.commitAll('Second dependent change');
    await expect(dropCommit(fixture.repo, first)).rejects.toThrow();
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(original);
    expect(await fixture.read('readme.txt')).toBe('second version\n');
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(false);
    await expect(moveCommitDown(fixture.repo, original)).rejects.toThrow();
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(original);
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(false);
  });

  it('reports invalid rebase bases and leaves no editor or operation state behind', async () => {
    await fixture.write('new.txt', 'new\n'); await fixture.commitAll('One change');
    const steps = await getCommitsForRebase(fixture.repo, fixture.initialHash);
    expect(await executeInteractiveRebase(fixture.repo, 'missing-base', steps)).toMatchObject({ ok: false, error: expect.any(String) });
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(false);
    const { readdir } = await import('node:fs/promises');
    await expect(readdir(path.join(fixture.repo, '.git', 'git-workbench-rebase-editor'))).rejects.toThrow();
  });

  it('preserves conflicting custom rebases for manual resolution and cleans editor scripts on abort', async () => {
    await fixture.write('readme.txt', 'first\n'); await fixture.commitAll('First');
    await fixture.write('readme.txt', 'second\n'); const head = await fixture.commitAll('Second');
    const steps = await getCommitsForRebase(fixture.repo, fixture.initialHash);
    expect(await executeInteractiveRebase(fixture.repo, fixture.initialHash, [...steps].reverse())).toMatchObject({ ok: false, hasConflicts: true });
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(true);
    await abortOperation(fixture.repo);
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(head);
    expect(await fixture.read('readme.txt')).toBe('second\n');
    expect((await getRepoOperationState(fixture.repo)).inRebase).toBe(false);
  });

  it('continues a cherry-pick after the conflict result has been reviewed and staged', async () => {
    await fixture.git('checkout', '-b', 'incoming'); await fixture.write('readme.txt', 'incoming\n'); const incoming = await fixture.commitAll('Cherry-picked subject');
    await fixture.git('checkout', 'main'); await fixture.write('readme.txt', 'current\n'); await fixture.commitAll('Current change');
    expect(await cherryPick(fixture.repo, incoming)).toMatchObject({ hasConflicts: true });
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    await resolveConflictFile(fixture.repo, 'readme.txt', 'combined\n', { expectedSnapshot: conflict.snapshot, action: 'result' });
    await continueOperation(fixture.repo);
    expect((await getRepoOperationState(fixture.repo)).inCherryPick).toBe(false);
    expect((await fixture.git('log', '-1', '--format=%s')).trim()).toBe('Cherry-picked subject');
    expect(await fixture.read('readme.txt')).toBe('combined\n');
  });
});
