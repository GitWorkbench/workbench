import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ raw: vi.fn(), client: vi.fn(), request: vi.fn(), remotes: vi.fn() }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitWithEnvironment: () => ({ raw: mock.raw }) }));
vi.mock('../../src/main/git/pull-requests', () => ({ apiPath: () => '/repositories/team/repo', hostedReviewClient: mock.client, requestJson: mock.request }));
vi.mock('../../src/main/git/objects-navigation', () => ({ getRemotes: mock.remotes }));
import { openPullRequestWorktree } from '../../src/main/git/pull-request-worktree';
let root: string, repo: string, directory: string;
const head = 'a'.repeat(40), credentials = vi.fn(() => null);
const input = (provider = 'github') => ({ provider: provider as 'github', remoteName: 'origin', requestId: '12', head, branch: 'review/pr-12', directory });
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-review-worktree-test-'))); repo = path.join(root, 'repo'); directory = path.join(root, 'review'); await fs.mkdir(repo);
  mock.raw.mockReset().mockImplementation(async (args: string[]) => { if (args[0] === 'show-ref') throw new Error('missing ref'); if (args[0] === 'rev-parse') return head + '\n'; return ''; });
  mock.client.mockReset().mockResolvedValue({ config: {}, credential: {} }); mock.request.mockReset().mockResolvedValue({ head: { sha: head }, diff_refs: { head_sha: head }, source: { commit: { hash: head }, repository: { full_name: 'fork/repo' }, branch: { name: 'feature/nested' } } }); mock.remotes.mockReset().mockResolvedValue([{ name: 'origin', fetchUrl: 'git@github.com:team/repo.git' }]); credentials.mockClear();
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
const run = (patch: Record<string, any> = {}) => openPullRequestWorktree(repo, { ...input(), ...patch }, credentials);
const calledWithCommand = (name: string) => mock.raw.mock.calls.filter(([args]) => (args as string[]).includes(name)).map(([args]) => args as string[]);

describe('pull request worktree orchestration', () => {
  it.each([null, { provider: 'unsupported' }, { requestId: 'x' }, { head: 'invalid' }])('rejects invalid review identity %#', async patch => { await expect(patch === null ? openPullRequestWorktree(repo, null as any, credentials) : run(patch)).rejects.toThrow('current PR revision'); expect(mock.raw).not.toHaveBeenCalled(); });
  it.each(['', '-unsafe'])('rejects branch %j before running Git', async branch => { await expect(run({ branch })).rejects.toThrow('local review branch'); expect(mock.raw).not.toHaveBeenCalled(); });
  it('checks branch syntax and rejects an existing review branch', async () => { mock.raw.mockResolvedValue('existing'); await expect(run()).rejects.toThrow('already exists'); expect(mock.raw).toHaveBeenCalledWith(['check-ref-format', 'refs/heads/review/pr-12']); });
  it('rejects relative, occupied, nested and symlinked destinations', async () => {
    await expect(run({ directory: 'relative' })).rejects.toThrow('absolute worktree'); await expect(run({ directory: repo })).rejects.toThrow('already exists'); await expect(run({ directory: path.join(repo, 'nested') })).rejects.toThrow('outside the current repository');
    if (process.platform !== 'win32') { const alias = path.join(root, 'repo-link'); await fs.symlink(repo, alias); await expect(run({ directory: path.join(alias, 'nested') })).rejects.toThrow('outside the current repository'); }
    expect(mock.client).not.toHaveBeenCalled();
  });
  it.each(['github', 'gitlab'])('opens a %s review at the verified head with hooks and submodules disabled', async provider => {
    expect(await run({ provider })).toEqual({ ok: true, path: directory, branch: 'review/pr-12' });
    const fetch = calledWithCommand('fetch')[0]; expect(fetch).toEqual(expect.arrayContaining(['--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', 'origin'])); expect(fetch.at(-1)).toMatch(new RegExp(`^refs/${provider === 'github' ? 'pull' : 'merge-requests'}/12/head:refs/git-workbench/reviews/`));
    const add = calledWithCommand('worktree')[0]; expect(add).toEqual(expect.arrayContaining(['-c', 'submodule.recurse=false', 'add', '-b', 'review/pr-12', '--', directory, head])); const hookDirectory = add.find(arg => arg.startsWith('core.hooksPath='))!.slice('core.hooksPath='.length); await expect(fs.access(hookDirectory)).rejects.toThrow(); expect(calledWithCommand('update-ref').at(-1)!.slice(0, 2)).toEqual(['update-ref', '-d']);
    expect(mock.request.mock.calls[0][2]).toBe(`/repositories/team/repo/${provider === 'github' ? 'pulls' : 'merge_requests'}/12`);
  });
  it('uses GitLab sha when diff_refs are unavailable', async () => { mock.request.mockResolvedValue({ sha: head }); await expect(run({ provider: 'gitlab' })).resolves.toMatchObject({ ok: true }); });
  it.each(['git@bitbucket.org:team/repo.git', 'ssh://git@bitbucket.org/team/repo.git', 'https://bitbucket.org/team/repo.git'])('fetches Bitbucket fork branches with the remote transport: %s', async fetchUrl => {
    mock.remotes.mockResolvedValue([{ name: 'origin', fetchUrl }]); await run({ provider: 'bitbucket' }); expect(calledWithCommand('fetch')[0]).toContain(fetchUrl.startsWith('https') ? 'https://bitbucket.org/fork/repo.git' : 'git@bitbucket.org:fork/repo.git'); expect(calledWithCommand('fetch')[0].at(-1)).toMatch(/^refs\/heads\/feature\/nested:/); expect(mock.raw).toHaveBeenCalledWith(['check-ref-format', 'refs/heads/feature/nested']);
  });
  it.each([{ source: { commit: { hash: head } } }, { source: { commit: { hash: head }, repository: { full_name: '../unsafe' }, branch: { name: 'branch' } } }, { source: { commit: { hash: head }, repository: { full_name: 'fork/repo' }, branch: { name: 12 } } }])('rejects incomplete or unsafe Bitbucket source %#', async response => { mock.request.mockResolvedValue(response); await expect(run({ provider: 'bitbucket' })).rejects.toThrow('source repository or branch is unavailable'); expect(calledWithCommand('fetch')).toHaveLength(0); });
  it('refuses a removed remote or changed provider head before fetching', async () => {
    mock.remotes.mockResolvedValueOnce([]); await expect(run()).rejects.toThrow('remote no longer exists'); mock.request.mockResolvedValue({ head: { sha: 'b'.repeat(40) } }); await expect(run()).rejects.toThrow('new commits'); expect(calledWithCommand('fetch')).toHaveLength(0);
  });
  it('refuses a head that changes during fetch and always removes the temporary ref', async () => { mock.raw.mockImplementation(async args => { if (args[0] === 'show-ref') throw new Error('missing'); if (args[0] === 'rev-parse') return 'b'.repeat(40); return ''; }); await expect(run()).rejects.toThrow('changed during fetch'); expect(calledWithCommand('update-ref')).toHaveLength(1); expect(calledWithCommand('worktree')).toHaveLength(0); });
  it.each(['registered', 'files', 'clean', 'list-failure', 'empty-error', 'empty-string'])('preserves partial checkout data and cleans only safe refs after %s failures', async condition => {
    mock.raw.mockImplementation(async args => {
      if (args[0] === 'show-ref') throw new Error('missing'); if (args[0] === 'rev-parse') return head;
      if (args.includes('add')) { if (condition === 'files') await fs.mkdir(directory); if (condition === 'empty-string') throw ''; throw new Error(condition === 'empty-error' ? '' : 'checkout failed\nfilter failed'); }
      if (args[0] === 'worktree') { if (condition === 'list-failure') throw new Error('cannot list'); return condition === 'registered' ? `worktree ${directory}\0HEAD ${head}\0` : ''; }
      return '';
    });
    await expect(run()).rejects.toThrow(condition === 'registered' || condition === 'files' ? 'partial checkout may remain' : 'original checkout is unchanged');
    const branchCleanup = calledWithCommand('update-ref').find(args => args[2] === 'refs/heads/review/pr-12'); expect(Boolean(branchCleanup)).toBe(!['registered', 'files'].includes(condition)); if (condition === 'files') expect((await fs.stat(directory)).isDirectory()).toBe(true);
  });
  it('keeps the original error when best-effort ref cleanup fails', async () => { mock.raw.mockImplementation(async args => { if (args[0] === 'show-ref') throw new Error('missing'); if (args[0] === 'rev-parse') return head; if (args.includes('add')) throw new Error('checkout refused'); if (args[0] === 'update-ref') throw new Error('ref cleanup failed'); return ''; }); await expect(run()).rejects.toThrow('checkout refused'); expect(calledWithCommand('update-ref')).toHaveLength(2); });
});
