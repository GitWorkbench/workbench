import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestCredential, PullRequestProvider, PullReviewSubmission, RemoteInfo } from '../../src/shared/types';
import { matchHostingServer } from '../../src/shared/hosting-provider';

const mock = vi.hoisted(() => ({ raw: vi.fn(), remotes: vi.fn() }));
vi.mock('../../src/main/git/core', () => ({ gitFor: () => ({ raw: mock.raw }) }));
vi.mock('../../src/main/git/objects-navigation', () => ({ getRemotes: mock.remotes }));
vi.mock('../../src/main/git/github-auth', () => ({ githubRequestCredential: vi.fn(), githubSessionRejected: vi.fn() }));
import { createHostedPullRequest, getPullRequestContext, giteaPages, hostedReviewClient, requestJson, testGiteaConnection } from '../../src/main/git/pull-requests';
import { getPullReview, submitPullReview } from '../../src/main/git/pull-request-review';

const server = 'https://code.example:8443/forge';
const credential: PullRequestCredential = { serverUrl: server, token: 'gitea-test-token' };
const config = { provider: 'gitea' as const, host: 'code.example', path: 'team/repo', serverUrl: server, webUrl: `${server}/team/repo`, apiBase: `${server}/api/v1` };
const root = '/repos/team/repo';
const prPath = `${root}/pulls/12`;
const head = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = { number: 12, title: 'Review changes', head: { sha: head, ref: 'feature' }, base: { sha: base, ref: 'main' }, merge_base: 'c'.repeat(40), body: 'Review description', state: 'open', merged: false, draft: true, user: { login: 'alice' }, html_url: `${server}/team/repo/pulls/12` };
const resolver = vi.fn((provider: PullRequestProvider, remoteUrl?: string) => provider === 'gitea' && remoteUrl && matchHostingServer(remoteUrl, [server]) ? credential : null);
const responses = new Map<string, { body: unknown; status?: number }>();
const fetched = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const remote = (url: string): RemoteInfo => ({ name: 'origin', fetchUrl: url, pushUrl: url });
const submission = (patch: Partial<PullReviewSubmission> = {}): PullReviewSubmission => ({ provider: 'gitea', remoteName: 'origin', requestId: '12', head, action: 'comment', body: '  Please revise this  ', ...patch });
const patch = 'diff --git a/new.ts b/new.ts\n--- a/new.ts\n+++ b/new.ts\n@@ -1,2 +1,2 @@\n same\n-old\n+new\n';

beforeEach(() => {
  vi.resetAllMocks(); responses.clear();
  mock.raw.mockImplementation(async (args: string[]) => args[0] === 'branch' ? 'feature' : args[0] === 'rev-parse' ? 'origin/feature' : '');
  mock.remotes.mockResolvedValue([remote('ssh://git@code.example:2222/forge/team/repo.git')]);
  resolver.mockImplementation((provider, remoteUrl) => provider === 'gitea' && remoteUrl && matchHostingServer(remoteUrl, [server]) ? credential : null);
  responses.set(root, { body: { default_branch: 'main', html_url: config.webUrl } });
  responses.set(`${root}/pulls`, { body: [pr] });
  responses.set(prPath, { body: pr });
  responses.set(`${prPath}/files`, { body: [{ filename: 'new.ts', previous_filename: 'old.ts', status: 'renamed' }, { filename: 'image.png', status: 'modified' }] });
  responses.set(`${prPath}.diff`, { body: patch });
  fetched.mockImplementation(async (input, options) => {
    const url = new URL(String(input));
    expect(url.origin + url.pathname.slice(0, '/forge/api/v1'.length)).toBe(config.apiBase);
    const endpoint = url.pathname.slice('/forge/api/v1'.length);
    if (options?.method !== 'GET') return reply(pr);
    const value = responses.get(endpoint) || { body: [] };
    return reply(value.body, value.status, { 'x-hasmore': 'false' });
  });
  vi.stubGlobal('fetch', fetched);
});
afterEach(() => vi.unstubAllGlobals());

describe('Gitea detection, authentication, and creation', () => {
  it.each(['https://code.example:8443/forge/team/repo.git', 'git@code.example:forge/team/repo.git', 'ssh://git@code.example:2222/forge/team/repo.git'])('detects the configured instance from %s', async url => {
    mock.remotes.mockResolvedValue([remote(url)]);
    expect(await getPullRequestContext('/repo', 'origin', undefined, resolver)).toMatchObject({ provider: 'gitea', repository: 'team/repo', repositoryUrl: config.webUrl, credentialConfigured: true, defaultBranch: 'main', pullRequests: [{ id: '12', draft: true, sourceBranch: 'feature', targetBranch: 'main' }] });
    expect(resolver).toHaveBeenCalledWith('gitea', url);
    expect((await hostedReviewClient('/repo', 'origin', 'gitea', resolver)).config).toMatchObject(config);
    expect(fetched.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'token gitea-test-token' });
  });
  it.each(['https://other.example/forge/team/repo.git', 'https://code.example:9443/forge/team/repo.git', 'https://code.example:8443/forgery/team/repo.git', 'http://code.example:8443/forge/team/repo.git'])('never sends an instance token to %s', async url => {
    mock.remotes.mockResolvedValue([remote(url)]);
    expect((await getPullRequestContext('/repo', undefined, undefined, resolver)).provider).toBeNull();
    expect(fetched).not.toHaveBeenCalled();
  });
  it('verifies the account and explains a missing API or insufficient permission', async () => {
    responses.set('/user', { body: { login: 'alice' } });
    expect(await testGiteaConnection(`${server}/`, credential)).toBe('alice');
    responses.set('/user', { body: {}, status: 404 });
    await expect(testGiteaConnection(server, credential)).rejects.toThrow('Gitea API was not found');
    responses.set('/user', { body: {}, status: 403 });
    await expect(testGiteaConnection(server, credential)).rejects.toThrow('token permissions');
    responses.set('/user', { body: {} });
    await expect(testGiteaConnection(server, credential)).rejects.toThrow('did not return a Gitea account');
    await expect(testGiteaConnection(server, { token: 'bad\nvalue' })).rejects.toThrow('valid Gitea access token');
  });
  it('pushes only on explicit creation and sends Gitea head/base fields', async () => {
    fetched.mockClear();
    expect(await createHostedPullRequest('/repo', 'origin', ' New feature ', ' Context ', 'develop', undefined, resolver)).toMatchObject({ id: '12', url: pr.html_url });
    expect(mock.raw).toHaveBeenCalledWith(['push', '--set-upstream', 'origin', 'feature']);
    const post = fetched.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post?.[0]).toBe(`${config.apiBase}${root}/pulls`);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ title: 'New feature', body: 'Context', head: 'feature', base: 'develop' });
  });
  it('keeps rejected API creation distinct from the completed Git push', async () => {
    fetched.mockImplementation(async (_input, options) => options?.method === 'POST' ? reply({ message: 'Already exists' }, 422) : reply(options?.method === 'GET' ? [] : {}));
    await expect(createHostedPullRequest('/repo', 'origin', 'Feature', '', 'main', undefined, resolver)).rejects.toThrow('Gitea: Already exists');
    expect(mock.raw).toHaveBeenCalledWith(['push', '--set-upstream', 'origin', 'feature']);
  });
  it('blocks credential/base mismatches and unsafe redirects before leaking authentication', async () => {
    await expect(requestJson({ ...config, apiBase: 'https://evil.example/api/v1' }, credential, root, 'GET')).rejects.toThrow('configured server');
    expect(fetched).not.toHaveBeenCalled();
    fetched.mockResolvedValue(reply('', 302, { location: 'https://evil.example/api/v1/repos/team/repo/pulls' }));
    await expect(requestJson(config, credential, root, 'GET')).rejects.toThrow('unsupported redirect');
    expect(fetched).toHaveBeenCalledTimes(1);
  });
  it.each([401, 429, 503])('returns a useful HTTP %s error', async status => {
    fetched.mockResolvedValue(reply({}, status));
    await expect(requestJson(config, credential, root, 'GET')).rejects.toThrow(status === 401 ? 'invalid or expired' : status === 429 ? 'rate limit' : 'Gitea API returned HTTP 503');
  });
});

describe('Gitea bounded pagination', () => {
  it('retains a fixed page size when the server caps results below the requested size', async () => {
    fetched.mockImplementation(async input => {
      const url = new URL(String(input)), page = Number(url.searchParams.get('page'));
      expect(url.searchParams.get('limit')).toBe('100');
      return reply(Array.from({ length: 75 }, (_, i) => (page - 1) * 75 + i), 200, { 'x-hasmore': 'true' });
    });
    expect(await giteaPages(config, credential, `${root}/pulls?state=open`, 100)).toEqual({ rows: Array.from({ length: 100 }, (_, i) => i), truncated: true });
    expect(fetched).toHaveBeenCalledTimes(2);
  });
  it.each([{ 'x-pagecount': '2' }, { link: '<https://code.example/next>; rel="next"' }, {}])('handles pagination headers %j without trusting returned URLs', async headers => {
    fetched.mockResolvedValueOnce(reply([1], 200, headers)).mockResolvedValueOnce(reply([2], 200, { 'x-hasmore': 'false' }));
    expect(await giteaPages(config, credential, `${root}/pulls`)).toEqual({ rows: [1, 2], truncated: false });
    expect(String(fetched.mock.calls[1][0])).toContain(`${config.apiBase}${root}/pulls`);
  });
  it('stops an endless server, stops on empty responses, and rejects non-lists', async () => {
    fetched.mockImplementation(async () => reply([1], 200, { 'x-hasmore': 'true' }));
    expect(await giteaPages(config, credential, root)).toEqual({ rows: Array(20).fill(1), truncated: true });
    fetched.mockResolvedValue(reply([])); expect(await giteaPages(config, credential, root)).toEqual({ rows: [], truncated: false });
    fetched.mockResolvedValue(reply({ values: [] })); await expect(giteaPages(config, credential, root)).rejects.toThrow('unreadable list');
  });
});

describe('Gitea reviews through the shared provider workflow', () => {
  it('loads patches, binary omissions, conversation, reviews, and deduplicated head CI statuses', async () => {
    responses.set(`${root}/issues/12/comments`, { body: [{ id: 2, user: { login: 'bob' }, body: 'Context', created_at: '2026-01-01' }] });
    responses.set(`${prPath}/reviews`, { body: [{ id: 3, state: 'APPROVED', user: { login: 'carol' }, body: 'Looks good', comments_count: 2, dismissed: true }] });
    responses.set(`${prPath}/reviews/3/comments`, { body: [{ id: 4, user: { login: 'alice' }, path: 'new.ts', position: 2, commit_id: head, body: 'New line', resolver: { login: 'carol' } }, { id: 5, path: 'old.ts', original_position: 2, commit_id: base }] });
    responses.set(`${root}/statuses/${head}`, { body: [{ context: 'build', status: 'success', target_url: `${server}/build/2` }, { context: 'build', status: 'failure' }] });
    const result = await getPullReview('/repo', submission(), resolver);
    expect(result).toMatchObject({ head, base: pr.merge_base, start: base, description: pr.body, changeRequestMode: 'native', checks: [{ name: 'build', state: 'success' }] });
    expect(result.files).toEqual([{ path: 'new.ts', oldPath: 'old.ts', status: 'renamed', patch, unavailable: false }, { path: 'image.png', oldPath: 'image.png', status: 'modified', patch: '', unavailable: true }]);
    expect(result.comments).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'issue-2', body: 'Context' }), expect.objectContaining({ id: 'review-3', state: 'APPROVED · Dismissed' }), expect.objectContaining({ id: '4', side: 'new', line: 2, resolved: true }), expect.objectContaining({ id: '5', side: 'old', state: 'Outdated' })]));
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('no text patch')]));
    expect(result.comments.find(comment => comment.id === '4')?.author).toBe('alice');
    expect(fetched.mock.calls.find(([url]) => String(url).includes('.diff'))?.[1]?.headers).toMatchObject({ Accept: 'text/plain' });
  });
  it('decodes quoted UTF-8 paths and ignores fake file headers inside a hunk', async () => {
    const diff = 'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"\n--- "a/caf\\303\\251.ts"\n+++ "b/caf\\303\\251.ts"\n@@ -1 +1 @@\n-old\n+++ b/other.ts\n';
    responses.set(`${prPath}.diff`, { body: diff });
    responses.set(`${prPath}/files`, { body: [{ filename: 'café.ts', status: 'modified' }, { filename: 'other.ts', status: 'modified' }] });
    const result = await getPullReview('/repo', submission(), resolver);
    expect(result.files[0]).toMatchObject({ patch: diff, unavailable: false });
    expect(result.files[1]).toMatchObject({ patch: '', unavailable: true });
  });
  it('keeps files available when optional CI permissions are denied', async () => {
    responses.set(`${root}/statuses/${head}`, { body: {}, status: 403 });
    const result = await getPullReview('/repo', submission(), resolver);
    expect(result.files[0].patch).toBe(patch);
    expect(result.warnings).toContainEqual(expect.stringContaining('CI statuses:'));
  });
  it('rejects a mixed revision after an asynchronous head change', async () => {
    let reads = 0;
    const original = fetched.getMockImplementation();
    fetched.mockImplementation(async (url, options) => String(url).endsWith(prPath) && ++reads > 1 ? reply({ ...pr, head: { sha: base } }) : original!(url, options));
    await expect(getPullReview('/repo', submission(), resolver)).rejects.toThrow('changed while loading');
  });
  it.each(['comment', 'approve', 'request-changes'] as const)('submits native %s events for the reviewed commit', async action => {
    await submitPullReview('/repo', submission({ action }), resolver);
    const call = fetched.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(call?.[0]).toBe(`${config.apiBase}${prPath}/reviews`);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ body: 'Please revise this', commit_id: head, event: action === 'approve' ? 'APPROVED' : action === 'request-changes' ? 'REQUEST_CHANGES' : 'COMMENT' });
  });
  it.each(['old', 'new'] as const)('posts a validated %s-side inline comment with native line fields', async side => {
    await submitPullReview('/repo', submission({ inline: { path: 'new.ts', line: 2, side } }), resolver);
    const call = fetched.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ body: '', event: 'COMMENT', comments: [{ path: 'new.ts', body: 'Please revise this', old_position: side === 'old' ? 2 : 0, new_position: side === 'new' ? 2 : 0 }] });
  });
  it('rejects stale heads and absent diff lines without posting', async () => {
    await expect(submitPullReview('/repo', submission({ head: base }), resolver)).rejects.toThrow('changed while you were reviewing');
    await expect(submitPullReview('/repo', submission({ inline: { path: 'missing.ts', line: 99, side: 'new' } }), resolver)).rejects.toThrow('displayed line');
    expect(fetched.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
  it('posts inline replies and explains unsupported older reply APIs', async () => {
    await submitPullReview('/repo', submission({ replyTo: { id: '4' } }), resolver);
    const call = fetched.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(call?.[0]).toBe(`${config.apiBase}${prPath}/comments/4/replies`);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ body: 'Please revise this' });
    fetched.mockImplementation(async (_url, options) => options?.method === 'POST' ? reply({}, 404) : reply(pr));
    await expect(submitPullReview('/repo', submission({ replyTo: { id: '4' } }), resolver)).rejects.toThrow('Older versions');
    await expect(submitPullReview('/repo', submission({ replyTo: { id: 'review-3' } }), resolver)).rejects.toThrow('Only inline review comments');
  });
});

it('rejects a Gitea credential without an instance before fetching', async () => {
  await expect(requestJson(config, { token: 'unscoped' }, root, 'GET')).rejects.toThrow('URL');
  expect(fetched).not.toHaveBeenCalled();
});
it('reports an exact pagination cap and respects an empty Link header', async () => {
  fetched.mockImplementation(async () => reply(Array.from({ length: 100 }, (_, id) => id), 200, { 'x-hasmore': 'true' }));
  expect(await giteaPages(config, credential, root, 100)).toMatchObject({ truncated: true, rows: expect.any(Array) });
  expect(fetched).toHaveBeenCalledOnce();
  fetched.mockImplementation(async () => reply([1], 200, { link: '' }));
  expect(await giteaPages(config, credential, root)).toEqual({ rows: [1], truncated: false });
});
it.each([{ head: undefined }, { head: {}, base: {} }, { base: undefined }])('rejects missing review revisions %j', async missing => {
  responses.set(prPath, { body: { ...pr, ...missing } });
  await expect(getPullReview('/repo', submission(), resolver)).rejects.toThrow('did not return the request revisions');
});
it('uses safe defaults for incomplete conversation and review metadata', async () => {
  responses.set(prPath, { body: { ...pr, merge_base: '', body: undefined } });
  responses.set(`${root}/issues/12/comments`, { body: [{ id: 1 }] });
  responses.set(`${prPath}/reviews`, { body: [{ id: 2, stale: true, comments_count: 1 }] });
  responses.set(`${prPath}/reviews/2/comments`, { body: [{ id: 3, original_position: 1 }] });
  const detail = await getPullReview('/repo', submission(), resolver);
  expect(detail).toMatchObject({ base, description: '' });
  expect(detail.comments).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'issue-1', author: 'Unknown', body: '' }),
    expect.objectContaining({ id: 'review-2', author: 'Unknown', body: '', state: 'COMMENT · Outdated' }),
    expect.objectContaining({ id: '3', author: 'Unknown', body: '', line: 1, side: 'old' })
  ]));
});
it('decodes escaped characters and supplementary Unicode in quoted file names', async () => {
  const filename = 'emoji😀\n"\\q.ts';
  const quoted = 'emoji😀\\n\\"\\\\\\q.ts';
  const diff = `diff --git "a/${quoted}" "b/${quoted}"\n--- "a/${quoted}"\n+++ "b/${quoted}"\n@@ -1 +1 @@\n-old\n+new\n`;
  responses.set(`${prPath}.diff`, { body: diff });
  responses.set(`${prPath}/files`, { body: [{ filename, status: 'modified' }] });
  expect((await getPullReview('/repo', submission(), resolver)).files).toEqual([expect.objectContaining({ path: filename, patch: diff, unavailable: false })]);
});
it('bounds reviews and inline comments and reports both truncation limits', async () => {
  responses.set(`${prPath}/reviews`, { body: Array.from({ length: 101 }, (_, id) => ({ id, comments_count: id < 5 ? 1 : 0 })) });
  responses.set(`${prPath}/reviews/0/comments`, { body: Array.from({ length: 1001 }, (_, id) => ({ id, body: `Comment ${id}` })) });
  const detail = await getPullReview('/repo', submission(), resolver);
  expect(detail.comments.filter(comment => comment.threadId)).toHaveLength(1000);
  expect(detail.warnings).toEqual(expect.arrayContaining([expect.stringContaining('reviews list reached its display limit'), expect.stringContaining('first 1,000 inline review comments')]));
  expect(fetched.mock.calls.some(([url]) => String(url).includes('/reviews/4/comments'))).toBe(false);
});
it('keeps review files when an optional endpoint rejects with a non-Error reason', async () => {
  const original = fetched.getMockImplementation();
  fetched.mockImplementation((input, options) => String(input).includes('/issues/12/comments') ? Promise.reject('offline') : original!(input, options));
  const detail = await getPullReview('/repo', submission(), resolver);
  expect(detail.files[0].patch).toBe(patch);
  expect(detail.warnings).toContain('Conversation: Could not load this section.');
});
