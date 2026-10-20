import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanBranch, gitCommand, resolveCommit } from '../../src/main/git/advanced-process';
import { cancelLfsTransfer, getLfsTransfer, runLfsTransfer, setLfsTracking, stopLfsTransfers } from '../../src/main/git/lfs-manager';
import { openPullRequestWorktree } from '../../src/main/git/pull-request-worktree';
import { retargetPullRequest } from '../../src/main/git/branch-stacks';
import { createGitFixture, createMergeConflict, type GitFixture } from './git-fixture';
import type { LfsTransfer, PullReviewTarget } from '../../src/shared/types';

describe('external workflow preconditions do not mutate repositories or contact providers', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('runs bounded argument-only Git processes and resolves revisions without option injection', async () => {
    expect((await gitCommand(fixture.repo, ['rev-parse', 'HEAD'])).trim()).toBe(fixture.initialHash);
    expect(await resolveCommit(fixture.repo, 'HEAD')).toBe(fixture.initialHash);
    await expect(resolveCommit(fixture.repo, '')).rejects.toThrow('Choose a commit revision');
    await expect(resolveCommit(fixture.repo, '--help')).rejects.toThrow();
    await expect(gitCommand(fixture.repo, ['not-a-command'])).rejects.toThrow();
    expect(await cleanBranch(fixture.repo)).toEqual({ branch: 'main', head: fixture.initialHash });
    await fixture.write('new.txt', 'untracked\n');
    await expect(cleanBranch(fixture.repo)).rejects.toThrow('including untracked files');
  });

  it('refuses advanced destructive workflows while a merge is active', async () => {
    await createMergeConflict(fixture);
    await expect(cleanBranch(fixture.repo)).rejects.toThrow('active Git operation');
    expect(await fixture.read('readme.txt')).toContain('<<<<<<<');
  });

  it.each(['', ' ', '-option', '!negated', '*.psd\nother', 'bad\0pattern'])('rejects invalid LFS patterns %j before saving snapshots or invoking LFS', async pattern => {
    await expect(setLfsTracking(fixture.repo, pattern, true)).rejects.toThrow('one non-empty file pattern');
    expect(await fixture.git('for-each-ref', 'refs/git-workbench/restore-points/')).toBe('');
    expect(await fixture.git('status', '--porcelain')).toBe('');
  });

  it('protects symlinked .gitattributes from LFS tracking changes', async () => {
    const external = path.join(fixture.root, 'external-attributes');
    await writeFile(external, 'private attributes\n');
    await symlink(external, path.join(fixture.repo, '.gitattributes'));
    await expect(setLfsTracking(fixture.repo, '*.psd', true)).rejects.toThrow('regular file');
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(external, 'utf8')).toBe('private attributes\n');
  });

  it('rejects invalid transfer types and stale cancellation handles without starting a process', async () => {
    expect(await getLfsTransfer(fixture.repo)).toBeNull();
    await expect(runLfsTransfer(fixture.repo, { kind: 'invalid' as LfsTransfer['kind'], remote: 'origin', head: fixture.initialHash }, vi.fn())).rejects.toThrow('Choose an LFS action');
    await expect(cancelLfsTransfer(fixture.repo, 'unknown')).rejects.toThrow('no longer running');
    stopLfsTransfers();
    expect(await getLfsTransfer(fixture.repo)).toBeNull();
  });

  const reviewInput = (fixture: GitFixture) => ({ provider: 'github' as const, remoteName: 'origin', requestId: '12', head: fixture.initialHash, branch: 'review/pr-12', directory: path.join(fixture.root, 'review-worktree') });

  it('validates review identity and branch names before provider access', async () => {
    const credentials = vi.fn(() => null);
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), requestId: 'invalid' }, credentials)).rejects.toThrow('current request revision');
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), head: 'invalid' }, credentials)).rejects.toThrow('current request revision');
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), branch: '-unsafe' }, credentials)).rejects.toThrow('local review branch');
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), branch: 'main' }, credentials)).rejects.toThrow('already exists');
    expect(credentials).not.toHaveBeenCalled();
  });

  it('requires review destinations to be new absolute paths outside the working repository', async () => {
    const credentials = vi.fn(() => null);
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), directory: 'relative/path' }, credentials)).rejects.toThrow('absolute worktree');
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), directory: fixture.repo }, credentials)).rejects.toThrow('already exists');
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), directory: path.join(fixture.repo, 'nested') }, credentials)).rejects.toThrow('outside the current repository');
    const destination = path.join(fixture.root, 'existing'); await mkdir(destination);
    await expect(openPullRequestWorktree(fixture.repo, { ...reviewInput(fixture), directory: destination }, credentials)).rejects.toThrow('already exists');
    expect(credentials).not.toHaveBeenCalled();
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
  });

  it('rejects invalid retarget requests and nonlocal branch targets before calling a provider', async () => {
    const credentials = vi.fn(() => null);
    const input = { provider: 'github' as const, remoteName: 'origin', requestId: '12', head: fixture.initialHash, previousTarget: 'main', newTarget: 'main' };
    await expect(retargetPullRequest(fixture.repo, { ...input, provider: 'unsupported' as PullReviewTarget['provider'] }, credentials)).rejects.toThrow('current request revision');
    await expect(retargetPullRequest(fixture.repo, { ...input, requestId: 'bad' }, credentials)).rejects.toThrow('current request revision');
    await expect(retargetPullRequest(fixture.repo, { ...input, newTarget: '-option' }, credentials)).rejects.toThrow('valid local branch');
    await expect(retargetPullRequest(fixture.repo, { ...input, newTarget: 'missing' }, credentials)).rejects.toThrow();
    expect(credentials).not.toHaveBeenCalled();
  });
});
