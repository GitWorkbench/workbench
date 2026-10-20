import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestCredential, PullRequestProvider, RemoteInfo } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ raw: vi.fn(), remotes: vi.fn(), credential: vi.fn(), rejected: vi.fn() }));
vi.mock('../../src/main/git/core', () => ({ gitFor: () => ({ raw: mocks.raw }) }));
vi.mock('../../src/main/git/objects-navigation', () => ({ getRemotes: mocks.remotes }));
vi.mock('../../src/main/git/github-auth', () => ({ githubRequestCredential: mocks.credential, githubSessionRejected: mocks.rejected }));
import { apiPath, createHostedPullRequest, getPullRequestContext, hostedReviewClient, requestJson, testGitLabConnection } from '../../src/main/git/pull-requests';

const credential: PullRequestCredential = { token: 'secret', username: 'developer@example.com' };
const credentials = vi.fn(() => credential as PullRequestCredential | null);
const remote = (url: string, name = 'origin', pushUrl = url): RemoteInfo => ({ name, fetchUrl: url, pushUrl });
const configs = {
  gitea: { provider: 'gitea', host: 'code.example', path: 'owner/repo', serverUrl: 'https://code.example', webUrl: 'https://code.example/owner/repo', apiBase: 'https://code.example/api/v1' },
  github: { provider: 'github', host: 'github.com', path: 'owner/repo', webUrl: 'https://github.com/owner/repo', apiBase: 'https://api.github.com' },
  gitlab: { provider: 'gitlab', host: 'gitlab.com', path: 'group/sub/repo', webUrl: 'https://gitlab.com/group/sub/repo', apiBase: 'https://gitlab.com/api/v4' },
  bitbucket: { provider: 'bitbucket', host: 'bitbucket.org', path: 'workspace/repo', webUrl: 'https://bitbucket.org/workspace/repo', apiBase: 'https://api.bitbucket.org/2.0' }
} satisfies Record<PullRequestProvider, Parameters<typeof requestJson>[0]>;
function response(body: unknown = {}, status = 200, location?: string) {
  return {
    ok: status >= 200 && status < 300, status, text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(location ? { location } : {}), body: { cancel: vi.fn().mockResolvedValue(undefined) }
  };
}
function fakeFetch(...responses: ReturnType<typeof response>[]) {
  const fetch = vi.fn();
  for (const value of responses) fetch.mockResolvedValueOnce(value);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
beforeEach(() => {
  vi.resetAllMocks();
  credentials.mockReturnValue(credential);
  mocks.raw.mockImplementation(async (args: string[]) => args[0] === 'branch' ? 'feature\n' : args[0] === 'rev-parse' ? 'origin/feature\n' : '');
  mocks.remotes.mockResolvedValue([remote('git@github.com:owner/repo.git')]);
  mocks.credential.mockImplementation(async value => value);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('hosted provider detection and remote selection', () => {
  it.each([
    ['git@github.com:owner/repo.git', undefined, 'github', 'owner/repo', 'https://api.github.com'],
    ['https://GITHUB.com/owner/repo.GIT/', undefined, 'github', 'owner/repo', 'https://api.github.com'],
    ['ssh://git@gitlab.com/group/sub/repo.git', undefined, 'gitlab', 'group/sub/repo', 'https://gitlab.com/api/v4'],
    ['https://gitlab.company.example/team/repo.git', 'gitlab', 'gitlab', 'team/repo', 'https://gitlab.company.example/api/v4'],
    ['git@bitbucket.org:workspace/repo.git', undefined, 'bitbucket', 'workspace/repo', 'https://api.bitbucket.org/2.0'],
    ['https://code.company.example/team/repo.git', 'gitlab', 'gitlab', 'team/repo', 'https://code.company.example/api/v4'],
    ['https://github.com/owner/repo%20name.git', undefined, 'github', 'owner/repo name', 'https://api.github.com']
  ] as const)('resolves %s', async (url, override, provider, repository, apiBase) => {
    mocks.remotes.mockResolvedValue([remote(` ${url} `)]);
    const context = await getPullRequestContext('/repo', undefined, override);
    expect(context).toMatchObject({ provider, repository, currentBranch: 'feature', credentialConfigured: false, pullRequests: [] });
    const client = await hostedReviewClient('/repo', 'origin', provider, credentials);
    expect(client.config.apiBase).toBe(apiBase);
    expect(client.config.path).toBe(repository);
    expect(client.credential).toEqual(credential);
  });
  it.each([
    ['', undefined], ['file:///tmp/repo', undefined], ['not a url', undefined],
    ['https://github.com/only-owner', undefined], ['https://github.com/owner/repo/sub', undefined],
    ['https://bitbucket.org/workspace/repo/sub', undefined], ['https://unknown.example/owner/repo', undefined],
    ['https://github.com/owner/repo%ZZ', undefined],
    ['https://enterprise.example/owner/repo', 'github'], ['https://enterprise.example/owner/repo', 'bitbucket']
  ] as const)('explains unsupported remote %s', async (url, override) => {
    mocks.remotes.mockResolvedValue([remote(url)]);
    const context = await getPullRequestContext('/repo', undefined, override);
    expect(context.provider).toBeNull();
    expect(context.error).toContain('not a recognized provider');
  });
  it('uses push URL when fetch URL is missing', async () => {
    mocks.remotes.mockResolvedValue([remote('', 'origin', 'https://github.com/owner/repo.git')]);
    expect((await getPullRequestContext('/repo')).provider).toBe('github');
  });
  it('explains repositories without remotes', async () => {
    mocks.remotes.mockResolvedValue([]);
    expect(await getPullRequestContext('/repo')).toMatchObject({ provider: null, remoteName: null, currentBranch: 'feature', error: expect.stringContaining('no Git remote') });
  });
  it('prefers explicit remote, tracking remote, origin, then first remote', async () => {
    mocks.remotes.mockResolvedValue([remote('https://github.com/first/repo', 'first'), remote('https://github.com/tracked/repo', 'tracked'), remote('https://github.com/origin/repo')]);
    mocks.raw.mockImplementation(async args => args[0] === 'branch' ? 'feature' : 'tracked/feature');
    expect((await getPullRequestContext('/repo', 'first')).remoteName).toBe('first');
    expect((await getPullRequestContext('/repo', 'missing')).remoteName).toBe('tracked');
    mocks.raw.mockImplementation(async args => { if (args[0] === 'branch') return 'feature'; throw new Error('no upstream'); });
    expect((await getPullRequestContext('/repo')).remoteName).toBe('origin');
    mocks.remotes.mockResolvedValue([remote('https://github.com/first/repo', 'first')]);
    expect((await getPullRequestContext('/repo')).remoteName).toBe('first');
  });
  it('requires a known remote and a configured credential for a review client', async () => {
    await expect(hostedReviewClient('/repo', 'missing', 'github', credentials)).rejects.toThrow('Select a supported remote');
    credentials.mockReturnValueOnce(null);
    await expect(hostedReviewClient('/repo', 'origin', 'github', credentials)).rejects.toThrow('Connect this provider');
    credentials.mockReturnValueOnce({ token: '' });
    await expect(hostedReviewClient('/repo', 'origin', 'github', credentials)).rejects.toThrow('Connect this provider');
  });
  it('encodes provider paths without changing nested project identity', () => {
    expect(apiPath({ ...configs.github, path: 'my org/repo name' })).toBe('/repos/my%20org/repo%20name');
    expect(apiPath(configs.gitlab)).toBe('/projects/group%2Fsub%2Frepo');
    expect(apiPath(configs.bitbucket)).toBe('/repositories/workspace/repo');
  });
});

describe('requestJson transport and credential boundaries', () => {
  it.each(['github', 'gitlab', 'bitbucket'] as const)('uses %s authentication without leaking tokens to payloads', async provider => {
    const fetch = fakeFetch(response({ value: 7 }));
    expect(await requestJson(configs[provider], credential, '/test', 'POST', { title: 'Change' })).toEqual({ value: 7 });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`${configs[provider].apiBase}/test`);
    expect(options).toMatchObject({ method: 'POST', body: '{"title":"Change"}', redirect: 'manual', signal: expect.any(AbortSignal) });
    expect(options.headers['User-Agent']).toBe('Git Workbench');
    if (provider === 'github') {
      expect(options.headers.Authorization).toBe('Bearer secret');
      expect(options.headers.Accept).toBe('application/vnd.github+json');
      expect(options.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
      expect(mocks.credential).toHaveBeenCalledExactlyOnceWith(credential);
    } else if (provider === 'gitlab') expect(options.headers['PRIVATE-TOKEN']).toBe('secret');
    else expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('developer@example.com:secret').toString('base64')}`);
  });
  it('uses refreshed GitHub credentials and invalidates a rejected session', async () => {
    const active = { token: 'fresh' };
    mocks.credential.mockResolvedValue(active);
    const fetch = fakeFetch(response({}, 401));
    await expect(requestJson(configs.github, credential, '/test', 'GET')).rejects.toThrow('Reconnect in Settings');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fresh');
    expect(mocks.rejected).toHaveBeenCalledExactlyOnceWith(active);
  });
  it('does not issue a request when GitHub credential refresh is rejected', async () => {
    mocks.credential.mockRejectedValueOnce(new Error('session expired'));
    const fetch = fakeFetch();
    await expect(requestJson(configs.github, credential, '/test', 'GET')).rejects.toThrow('session expired');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('explains GitHub installation repository access on 404', async () => {
    fakeFetch(response({}, 404));
    await expect(requestJson(configs.github, credential, '/test', 'GET')).rejects.toThrow('choose repositories on GitHub');
  });
  it.each([
    [401, {}, 'invalid or expired'], [403, {}, 'token permissions'], [404, {}, 'repository was not found'],
    [409, { message: 'Already open' }, 'GitLab: Already open'], [422, { error: 'No changes' }, 'GitLab: No changes'],
    [422, { message: 3, error: false }, 'open request may already exist'], [409, 'bad JSON', 'open request may already exist'],
    [429, {}, 'rate limit'], [503, {}, 'GitLab API returned HTTP 503']
  ])('explains HTTP %s responses', async (status, body, message) => {
    fakeFetch(response(body, status));
    await expect(requestJson(configs.gitlab, credential, '/test', 'GET')).rejects.toThrow(message);
  });
  it('bounds provider rejection details and labels Bitbucket errors', async () => {
    fakeFetch(response({ message: 'x'.repeat(300) }, 422));
    await expect(requestJson(configs.bitbucket, credential, '/test', 'POST')).rejects.toThrow(`Bitbucket: ${'x'.repeat(240)}`);
  });
  it('returns text, JSON, and null for successful empty bodies', async () => {
    const fetch = fakeFetch(response('raw diff'), response(''), response({ x: 1 }));
    expect(await requestJson(configs.gitlab, credential, '/text', 'GET', undefined, true)).toBe('raw diff');
    expect(await requestJson(configs.gitlab, credential, '/empty', 'GET')).toBeNull();
    expect(await requestJson(configs.gitlab, credential, '/json', 'PATCH')).toEqual({ x: 1 });
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it('rejects oversized bodies and malformed JSON', async () => {
    fakeFetch(response('x'.repeat(12_000_001)), response('not JSON'));
    await expect(requestJson(configs.gitlab, credential, '/large', 'GET')).rejects.toThrow('response is too large');
    await expect(requestJson(configs.gitlab, credential, '/invalid', 'GET')).rejects.toThrow('valid API response');
  });
  it('converts network failures and preserves unexpected errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new Error('unexpected')));
    await expect(requestJson(configs.bitbucket, credential, '/test', 'GET')).rejects.toThrow('Check the server URL, network or VPN');
    await expect(requestJson(configs.bitbucket, credential, '/test', 'GET')).rejects.toThrow('unexpected');
  });
  it('aborts after 20 seconds and clears its timeout', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetch);
    const request = requestJson(configs.gitlab, credential, '/test', 'GET');
    const assertion = expect(request).rejects.toThrow('did not respond within 20 seconds');
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([301, 302, 307, 308])('follows safe GET redirect status %s and cancels old response bodies', async status => {
    const first = response('', status, '/api/v4/projects/group%2Fsub%2Frepo/merge_requests/2');
    const fetch = fakeFetch(first, response({ moved: true }));
    expect(await requestJson(configs.gitlab, credential, '/projects/group%2Fsub%2Frepo/merge_requests/1', 'GET')).toEqual({ moved: true });
    expect(fetch.mock.calls[1][0]).toBe('https://gitlab.com/api/v4/projects/group%2Fsub%2Frepo/merge_requests/2');
    expect(first.body.cancel).toHaveBeenCalledOnce();
  });
  it('follows safe GitHub repository redirects without a double-slash boundary', async () => {
    const fetch = fakeFetch(response('', 302, '/repos/owner/repo/pulls/2'), response({ id: 2 }));
    expect(await requestJson(configs.github, credential, '/repos/owner/repo/pulls/1', 'GET')).toEqual({ id: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['https://attacker.example/api/v4/projects/group%2Fsub%2Frepo/x', 'GET'],
    ['/api/v4/projects/other/merge_requests/1', 'GET'],
    ['/api/v4/projects/group%2Fsub%2Frepo/merge_requests/1', 'POST'],
    [undefined, 'GET']
  ] as const)('rejects unsafe or unsupported redirect %s %s', async (location, method) => {
    const fetch = fakeFetch(response('', 302, location));
    await expect(requestJson(configs.gitlab, credential, '/test', method)).rejects.toThrow('unsupported redirect');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('caps redirect chains at three hops', async () => {
    const fetch = fakeFetch(...Array.from({ length: 4 }, () => response('', 302, '/api/v4/projects/group%2Fsub%2Frepo/merge_requests/2')));
    await expect(requestJson(configs.gitlab, credential, '/test', 'GET')).rejects.toThrow('unsupported redirect');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('pull request contexts and normalized provider data', () => {
  it('does not contact the API before credentials exist', async () => {
    const fetch = fakeFetch();
    credentials.mockReturnValue(null);
    expect(await getPullRequestContext('/repo', 'origin', undefined, credentials)).toMatchObject({ credentialConfigured: false, provider: 'github' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('maps GitHub metadata and open, closed, merged, draft and fallback fields', async () => {
    const fetch = fakeFetch(response({ default_branch: 'main', html_url: 'https://github.com/owner/repo' }), response([
      { number: 1, title: 'Change', state: 'open', draft: true, user: { login: 'dev' }, head: { ref: 'feature' }, base: { ref: 'main' }, html_url: 'https://github.com/owner/repo/pull/1', created_at: 'created', updated_at: 'updated' },
      { number: 2, state: 'closed', html_url: '/2' }, { number: 3, merged_at: 'yesterday', html_url: '/3' }, { number: 4 }
    ]));
    const context = await getPullRequestContext('/repo', 'origin', undefined, credentials);
    expect(context.defaultBranch).toBe('main');
    expect(context.pullRequests).toEqual([
      { id: '1', title: 'Change', state: 'open', draft: true, author: 'dev', sourceBranch: 'feature', targetBranch: 'main', url: 'https://github.com/owner/repo/pull/1', createdAt: 'created', updatedAt: 'updated' },
      { id: '2', title: 'Untitled pull request', state: 'closed', draft: false, author: 'Unknown', sourceBranch: '', targetBranch: '', url: '/2', createdAt: undefined, updatedAt: undefined },
      { id: '3', title: 'Untitled pull request', state: 'merged', draft: false, author: 'Unknown', sourceBranch: '', targetBranch: '', url: '/3', createdAt: undefined, updatedAt: undefined }
    ]);
    expect(fetch.mock.calls[1][0]).toContain('/pulls?state=open&per_page=100');
  });
  it('maps GitLab merge states, author alternatives and draft detection', async () => {
    mocks.remotes.mockResolvedValue([remote('https://gitlab.com/group/sub/repo')]);
    fakeFetch(response({}), response([
      { iid: 1, title: 'Draft: Work', state: 'opened', author: { username: 'user' }, source_branch: 'feature', target_branch: 'main', web_url: '/1' },
      { iid: 2, state: 'merged', work_in_progress: true, author: { name: 'Name' }, web_url: '/2' },
      { iid: 3, state: 'closed', draft: true, web_url: '/3' }, { iid: 4, web_url: '/4' }, { iid: 5 }
    ]));
    const context = await getPullRequestContext('/repo', undefined, undefined, credentials);
    expect(context.repositoryUrl).toBe('https://gitlab.com/group/sub/repo');
    expect(context.defaultBranch).toBe('');
    expect(context.pullRequests.map(p => [p.state, p.draft, p.author])).toEqual([['open', true, 'user'], ['merged', true, 'Name'], ['closed', true, 'Unknown'], ['open', false, 'Unknown']]);
    expect(context.pullRequests[3].title).toBe('Untitled merge request');
  });
  it('maps Bitbucket wrapped values, branch metadata and participant fallbacks', async () => {
    mocks.remotes.mockResolvedValue([remote('https://bitbucket.org/workspace/repo')]);
    const fetch = fakeFetch(response({ mainbranch: { name: 'main' }, links: { html: { href: '/repo' } } }), response({ values: [
      { id: 1, title: 'Work', state: 'MERGED', draft: true, author: { display_name: 'Full name' }, source: { branch: { name: 'feature' } }, destination: { branch: { name: 'main' } }, links: { html: { href: '/1' } } },
      { id: 2, state: 'DECLINED', author: { nickname: 'Nick' }, links: { html: { href: '/2' } } },
      { id: 3, links: { html: { href: '/3' } } }, { id: 4 }
    ] }));
    const context = await getPullRequestContext('/repo', undefined, undefined, credentials);
    expect(context.defaultBranch).toBe('main'); expect(context.repositoryUrl).toBe('/repo');
    expect(context.pullRequests.map(p => [p.state, p.author])).toEqual([['merged', 'Full name'], ['closed', 'Nick'], ['open', 'Unknown']]);
    expect(fetch.mock.calls[1][0]).toContain('/pullrequests?state=OPEN&pagelen=50');
  });
  it.each([null, {}, { values: 'invalid' }])('ignores invalid list payloads %j', async payload => {
    fakeFetch(response({}), response(payload));
    expect((await getPullRequestContext('/repo', undefined, undefined, credentials)).pullRequests).toEqual([]);
  });
  it.each([new Error('denied'), 'unexpected failure'])('returns API context failures without hiding local branch data', async failure => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));
    expect(await getPullRequestContext('/repo', 'origin', undefined, credentials)).toMatchObject({ currentBranch: 'feature', credentialConfigured: true, error: failure instanceof Error ? failure.message : failure });
  });
});

describe('createHostedPullRequest validation and submission', () => {
  function contextResponses(provider: PullRequestProvider = 'github') {
    fakeFetch(response({ default_branch: 'main' }), response(provider === 'bitbucket' ? { values: [] } : []));
  }
  it.each([
    ['', 'main', 'Title', 'Check out a local source branch'], ['HEAD', 'main', 'Title', 'Check out a local source branch'],
    ['feature', ' ', 'Title', 'Choose a target branch'], ['feature', 'feature', 'Title', 'must be different'], ['feature', 'main', ' ', 'Enter a title']
  ])('validates source=%j target=%j title=%j before pushing', async (branch, target, title, message) => {
    mocks.raw.mockImplementation(async args => args[0] === 'branch' ? branch : 'origin/feature');
    contextResponses();
    await expect(createHostedPullRequest('/repo', 'origin', title, 'Body', target, undefined, credentials)).rejects.toThrow(message);
    expect(mocks.raw.mock.calls.some(([args]) => args[0] === 'push')).toBe(false);
  });
  it('rejects unsupported remotes and missing or revoked credentials', async () => {
    mocks.remotes.mockResolvedValueOnce([]);
    await expect(createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).rejects.toThrow('no Git remote');
    credentials.mockReturnValueOnce(null);
    await expect(createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).rejects.toThrow('Connect your GitHub account');
    contextResponses(); credentials.mockReturnValueOnce(credential).mockReturnValueOnce(null);
    await expect(createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).rejects.toThrow('Connect your GitHub account');
  });
  it.each(['github', 'gitlab', 'bitbucket'] as const)('pushes before creating a %s request with a provider-specific payload', async provider => {
    const config = configs[provider];
    mocks.remotes.mockResolvedValue([remote(config.webUrl)]);
    const created = provider === 'github' ? { number: 7, title: 'Title', html_url: '/7' } : provider === 'gitlab' ? { iid: 7, title: 'Title', web_url: '/7' } : { id: 7, title: 'Title', links: { html: { href: '/7' } } };
    const fetch = fakeFetch(response({}), response([]), response(created));
    const result = await createHostedPullRequest('/repo', 'origin', ' Title ', ' Body ', ' main ', undefined, credentials);
    expect(result).toMatchObject({ id: '7', title: 'Title', url: '/7' });
    const pushOrder = mocks.raw.mock.invocationCallOrder[mocks.raw.mock.calls.findIndex(([args]) => args[0] === 'push')];
    expect(pushOrder).toBeLessThan(fetch.mock.invocationCallOrder[2]);
    expect(mocks.raw).toHaveBeenCalledWith(['push', '--set-upstream', 'origin', 'feature']);
    const [url, options] = fetch.mock.calls[2];
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    if (provider === 'github') {
      expect(url).toBe(`${config.apiBase}/repos/owner/repo/pulls`);
      expect(payload).toEqual({ title: 'Title', body: 'Body', head: 'feature', base: 'main' });
    } else if (provider === 'gitlab') {
      expect(url).toBe(`${config.apiBase}/projects/group%2Fsub%2Frepo/merge_requests`);
      expect(payload).toEqual({ title: 'Title', description: 'Body', source_branch: 'feature', target_branch: 'main' });
    } else expect(payload).toEqual({ title: 'Title', description: 'Body', source: { branch: { name: 'feature' } }, destination: { branch: { name: 'main' } }, close_source_branch: false });
  });
  it('does not contact create endpoint when push fails', async () => {
    const fetch = fakeFetch(response({}), response([]));
    mocks.raw.mockImplementation(async args => { if (args[0] === 'push') throw new Error('push denied'); return args[0] === 'branch' ? 'feature' : 'origin/feature'; });
    await expect(createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).rejects.toThrow('push denied');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports unreadable provider creation responses without trying a second push', async () => {
    fakeFetch(response({}), response([]), response({}));
    await expect(createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).rejects.toThrow('unreadable response');
    expect(mocks.raw.mock.calls.filter(([args]) => args[0] === 'push')).toHaveLength(1);
  });
  it('creates requests for configured push-only remotes', async () => {
    mocks.remotes.mockResolvedValue([remote('', 'origin', 'https://github.com/owner/repo.git')]);
    fakeFetch(response({}), response([]), response({ number: 8, html_url: '/8' }));
    expect(await createHostedPullRequest('/repo', 'origin', 'Title', '', 'main', undefined, credentials)).toMatchObject({ id: '8', url: '/8' });
  });
});


describe('self-hosted connection verification and boundaries', () => {
  it('verifies a GitLab instance using only its normalized API and token', async () => {
    const fetch = fakeFetch(response({ username: 'alice' }));
    expect(await testGitLabConnection('https://code.example:8443/gitlab/', { token: ' test-token ' })).toBe('alice');
    expect(fetch.mock.calls[0][0]).toBe('https://code.example:8443/gitlab/api/v4/user');
    expect(fetch.mock.calls[0][1].headers['PRIVATE-TOKEN']).toBe('test-token');
  });
  it.each(['', 'bad\rheader', 'bad\nheader', 'bad\0header'])('rejects malformed GitLab account tokens %# without network access', async token => {
    const fetch = fakeFetch();
    await expect(testGitLabConnection('https://gitlab.com', { token })).rejects.toThrow('valid GitLab access token');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{}, { username: 42 }, { username: '' }])('rejects unreadable GitLab user responses %#', async account => {
    fakeFetch(response(account));
    await expect(testGitLabConnection('https://gitlab.com', { token: 'test-token' })).rejects.toThrow('did not return a GitLab account');
  });
  it('rejects a missing GitLab API and mismatched credential origins without sending a foreign token', async () => {
    const fetch = fakeFetch(response({}, 404));
    await expect(testGitLabConnection('https://gitlab.com', { token: 'test-token' })).rejects.toThrow('API was not found');
    fetch.mockClear();
    await expect(requestJson({ ...configs.gitlab, apiBase: 'https://other.example/api/v4' }, credential, '/user', 'GET')).rejects.toThrow('configured server');
    expect(fetch).not.toHaveBeenCalled();
    await expect(requestJson({ ...configs.gitlab, apiBase: 'https://gitlab.com' }, credential, '/api/not-graphql', 'POST')).rejects.toThrow('configured server');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves the exact GitLab base path for GraphQL requests', async () => {
    const fetch = fakeFetch(response({ data: {} }));
    await requestJson({ ...configs.gitlab, serverUrl: 'https://code.example/gitlab', apiBase: 'https://code.example/gitlab' }, { token: 'scoped-token', serverUrl: 'https://code.example/gitlab' }, '/api/graphql', 'POST', { query: '{ currentUser { username } }' });
    expect(fetch.mock.calls[0][0]).toBe('https://code.example/gitlab/api/graphql');
  });
  it('detects configured providers and rejects ambiguous cross-provider instances and public-host overrides', async () => {
    mocks.remotes.mockResolvedValue([remote('https://code.example/forge/team/repo.git')]);
    const lookup = (provider: PullRequestProvider) => ({ token: 'test-token', serverUrl: provider === 'gitlab' ? 'https://code.example' : 'https://code.example/forge' });
    const fetch = fakeFetch(response({}), response([], 200));
    expect((await getPullRequestContext('/repo', undefined, undefined, lookup)).provider).toBe('gitea');
    fetch.mockClear();
    const ambiguous = () => ({ token: 'test-token', serverUrl: 'https://code.example/forge' });
    expect((await getPullRequestContext('/repo', undefined, undefined, ambiguous)).provider).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    mocks.remotes.mockResolvedValue([remote('https://github.com/team/repo.git')]);
    expect((await getPullRequestContext('/repo', undefined, 'gitlab', credentials)).provider).toBeNull();
    expect((await getPullRequestContext('/repo', undefined, 'gitea', credentials)).provider).toBeNull();
    await expect(hostedReviewClient('/repo', 'origin', 'gitea', credentials)).rejects.toThrow('Select a supported remote');
  });
  it('uses the push URL when a supported review remote has no fetch URL', async () => {
    mocks.remotes.mockResolvedValue([remote('', 'origin', 'https://github.com/owner/repo.git')]);
    expect((await hostedReviewClient('/repo', 'origin', 'github', credentials)).config.provider).toBe('github');
    expect(credentials).toHaveBeenCalledWith('github', 'https://github.com/owner/repo.git');
  });
});
