import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  git: { raw: vi.fn(), branch: vi.fn(), status: vi.fn() },
  summary: vi.fn(), base: vi.fn(), context: vi.fn()
}));
vi.mock('../../src/main/git/core', () => ({
  withGit: async (_repo: string, run: (git: typeof mock.git) => unknown) => run(mock.git),
  errorMessage: String
}));
vi.mock('../../src/main/git/diff-summary', () => ({ getDiffSummary: mock.summary, getCommitBase: mock.base }));
vi.mock('../../src/main/git/pull-requests', () => ({ getPullRequestContext: mock.context }));
import { getBranches, getStashes, getStashDetail, getStashFileDiff } from '../../src/main/git/branch-stash';
import { getCommitDetail, compareCommits } from '../../src/main/git/commit-detail';
import { generateChangelog } from '../../src/main/git/changelog';
import { repositoryOverview } from '../../src/main/git/repository-dashboard';

beforeEach(() => {
  mock.git.raw.mockReset().mockResolvedValue('');
  mock.git.branch.mockReset().mockResolvedValue({ branches: {} });
  mock.git.status.mockReset().mockResolvedValue({ current: null, files: [], staged: [], conflicted: [], ahead: 0, behind: 0 });
  mock.summary.mockReset().mockResolvedValue({ files: [], insertions: 0, deletions: 0 });
  mock.base.mockReset().mockResolvedValue('base');
  mock.context.mockReset().mockResolvedValue({ provider: 'github', credentialConfigured: true, pullRequests: [] });
});

describe('Git metadata fallbacks', () => {
  it('omits symbolic remote HEAD and sorts same-priority local branches', async () => {
    mock.git.branch.mockResolvedValue({ branches: {
      zebra: { current: false }, alpha: { current: false }, main: { current: true },
      'remotes/origin/HEAD': {}, 'remotes/origin': {}, 'remotes/origin/topic': {}
    } });
    const result = await getBranches('/repo');
    expect(result.local.map(branch => branch.name)).toEqual(['main', 'alpha', 'zebra']);
    expect(result.remote.map(branch => branch.name)).toEqual(['origin', 'topic']);
  });
  it('keeps truncated stash rows readable with safe index and date defaults', async () => {
    mock.git.raw.mockResolvedValue('\tmessage\nunknown\n');
    expect(await getStashes('/repo')).toEqual([
      { index: 0, message: 'message', date: '' }, { index: 0, message: '', date: '' }
    ]);
  });
  it('rejects missing stash hashes and uses a relative date when an absolute date is absent', async () => {
    expect(await getStashDetail('/repo', 1)).toBeNull();
    mock.git.raw.mockResolvedValue('subject\0one hour ago\0\0hash');
    expect(await getStashDetail('/repo', 1)).toMatchObject({ date: 'one hour ago', hash: 'hash' });
  });
  it('limits missing stash-file patches to the requested path', async () => {
    expect(await getStashFileDiff('/repo', 0, 'missing')).toMatchObject({ hunks: [] });
    expect(mock.git.raw).toHaveBeenCalledWith(['diff', '-M', 'stash@{0}^1', 'stash@{0}', '--', 'missing']);
  });
  it('handles commits with no author email and comparisons with incomplete subjects', async () => {
    mock.git.raw.mockResolvedValueOnce('hash\nshort\nAuthor\n\ndate\nSubject\n\nparent');
    expect(await getCommitDetail('/repo', 'hash')).toMatchObject({ avatarHash: undefined, authorName: 'Author' });
    mock.git.raw.mockResolvedValueOnce('base-short').mockResolvedValueOnce('target-short');
    expect(await compareCommits('/repo', 'base-hash', 'target-hash')).toMatchObject({ baseSubject: 'base-short', targetSubject: 'target-short' });
    mock.git.raw.mockResolvedValue('');
    expect(await compareCommits('/repo', 'base-hash', 'target-hash')).toMatchObject({ baseSubject: 'base-ha', targetSubject: 'target-' });
  });
  it('ignores malformed changelog records while retaining valid commits', async () => {
    mock.git.raw.mockResolvedValue('truncated\nhash\0short\0fix: repair\0Author\ndiscard-me');
    const result = await generateChangelog('/repo', 'previous');
    expect(result?.categories).toEqual([{ title: '🐛 Bug Fixes', items: [{ hash: 'hash', shortHash: 'short', message: 'fix: repair', author: 'Author' }] }]);
  });
});

describe('dashboard hosted and detached states', () => {
  it('shows a detached checkout and available hosted requests', async () => {
    mock.context.mockResolvedValue({ provider: 'github', credentialConfigured: true, pullRequests: [{ id: '1', title: 'Review', url: 'https://github.com/example/repo/pull/1' }] });
    expect(await repositoryOverview('/repo', true, () => null)).toMatchObject({ branch: 'Detached HEAD', requests: [{ id: '1', title: 'Review', url: 'https://github.com/example/repo/pull/1' }], hostedMessage: 'Loaded requests from the provider (up to 100).' });
  });
  it.each([
    { provider: null, credentialConfigured: true, error: '' },
    { provider: 'github', credentialConfigured: true, error: 'Provider offline' }
  ])('does not show requests when provider context is unavailable: %j', async context => {
    mock.context.mockResolvedValue({ ...context, pullRequests: [] });
    const result = await repositoryOverview('/repo', true, () => null);
    expect(result.requests).toBeUndefined();
    expect(result.hostedMessage).toBe(context.error || 'Loaded requests from the provider (up to 100).');
  });
  it('reports non-Error failures without losing the repository identity', async () => {
    mock.git.status.mockRejectedValue('Repository unavailable');
    expect(await repositoryOverview('/repo', false, () => null)).toMatchObject({ path: '/repo', error: 'Repository unavailable' });
  });
});

it('requests only the current path when a stash file has no rename source', async () => {
  mock.summary.mockResolvedValue({ files: [{ path: 'file.txt', status: 'modified' }], insertions: 1, deletions: 1 });
  expect(await getStashFileDiff('/repo', 0, 'file.txt')).toMatchObject({ path: 'file.txt', hunks: [] });
  expect(mock.git.raw).toHaveBeenCalledWith(['diff', '-M', 'stash@{0}^1', 'stash@{0}', '--', 'file.txt']);
});

it('includes both paths when requesting the patch for a renamed stash file', async () => {
  mock.summary.mockResolvedValue({ files: [{ path: 'new.txt', renamedFrom: 'old.txt', status: 'renamed' }], insertions: 1, deletions: 1 });
  expect(await getStashFileDiff('/repo', 0, 'new.txt')).toMatchObject({ path: 'new.txt' });
  expect(mock.git.raw).toHaveBeenCalledWith(['diff', '-M', 'stash@{0}^1', 'stash@{0}', '--', 'old.txt', 'new.txt']);
});
