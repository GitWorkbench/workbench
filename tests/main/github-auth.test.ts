import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  saved: null as any, secure: vi.fn(), get: vi.fn(), save: vi.fn(),
  open: vi.fn(), copy: vi.fn(), emit: vi.fn(), fetch: vi.fn()
}));
vi.mock('electron', () => ({ shell: { openExternal: mock.open }, clipboard: { writeText: mock.copy } }));
vi.mock('../../src/main/git/provider-credentials', () => ({
  assertSecureStorageAvailable: mock.secure, getPullRequestCredential: mock.get, saveGitHubOAuthCredential: mock.save
}));
const token = 'ghu_test_access_token_1234567890';
const refreshToken = 'ghr_test_refresh_token_1234567890';
const code = () => ({ device_code: 'a'.repeat(40), user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
const user = () => ({ id: 42, login: 'test-user', name: 'Test User', avatar_url: 'https://avatars.githubusercontent.com/u/42' });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let auth: typeof import('../../src/main/git/github-auth');
function oauth(overrides: Record<string, unknown> = {}) {
  return { token, githubOAuth: { clientId: 'public_client_id', account: { id: 42, login: 'test-user' },
    expiresAt: new Date(Date.now() - 1000).toISOString(), refreshToken,
    refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(), ...overrides } };
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  mock.saved = null; mock.secure.mockReset(); mock.emit.mockReset(); mock.open.mockReset(); mock.copy.mockReset();
  mock.get.mockReset().mockImplementation(() => mock.saved);
  mock.save.mockReset().mockImplementation(value => { mock.saved = value; });
  mock.fetch.mockReset().mockRejectedValue(new Error('Unmocked GitHub request'));
  vi.stubGlobal('fetch', mock.fetch);
  auth = await import('../../src/main/git/github-auth'); auth.registerGitHubSignIn(mock.emit);
});
afterEach(() => { auth.stopGitHubSignIn(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('GitHub connection state', () => {
  it('exposes public configuration without credentials', () => {
    expect(auth.getGitHubSignInState()).toMatchObject({ configured: true, connected: false, method: null, phase: 'idle', secureStorageAvailable: true });
    mock.saved = { token };
    expect(auth.getGitHubSignInState()).toMatchObject({ connected: true, method: 'token' });
    expect(JSON.stringify(auth.getGitHubSignInState())).not.toContain(token);
  });
  it.each([
    [{}, false], [{ expiresAt: undefined }, false], [{ reauthRequired: true }, true],
    [{ refreshToken: undefined }, true], [{ refreshExpiresAt: new Date(0).toISOString() }, true],
    [{ expiresAt: '2099-01-01', refreshToken: undefined }, false]
  ])('identifies an expired/revoked device session %#', (overrides, needsSignIn) => {
    mock.saved = oauth(overrides);
    expect(auth.getGitHubSignInState()).toMatchObject({ method: 'device', needsSignIn, connected: !needsSignIn });
  });
  it('rejects invalid public configuration and omits invalid installation links', async () => {
    vi.stubEnv('GIT_WORKBENCH_GITHUB_CLIENT_ID', 'bad id!'); vi.stubEnv('GIT_WORKBENCH_GITHUB_APP_SLUG', '../bad');
    expect(auth.getGitHubSignInState()).toMatchObject({ configured: false, installationUrl: undefined });
    await expect(auth.startGitHubSignIn()).rejects.toThrow(/not been configured/);
  });
  it.each([new Error('keychain locked'), 'unknown'])('explains unavailable secure storage %#', error => {
    mock.secure.mockImplementation(() => { throw error; });
    expect(auth.getGitHubSignInState()).toMatchObject({ secureStorageAvailable: false, connected: false, message: expect.stringMatching(/keyring|locked/) });
  });
});

describe('device authorization', () => {
  it('requests a code once, opens/copies only public details, and completes sign-in', async () => {
    mock.fetch.mockResolvedValueOnce(response(code()));
    const state = await auth.startGitHubSignIn();
    expect(state).toMatchObject({ phase: 'waiting', userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device' });
    expect(JSON.stringify(state)).not.toContain('a'.repeat(40));
    await auth.startGitHubSignIn(); expect(mock.fetch).toHaveBeenCalledTimes(1);
    await auth.openGitHubSignInPage(state.flowId!); auth.copyGitHubSignInCode(state.flowId!);
    expect(mock.open).toHaveBeenCalledWith('https://github.com/login/device'); expect(mock.copy).toHaveBeenCalledWith('ABCD-EFGH');
    mock.fetch.mockResolvedValueOnce(response({ access_token: token, expires_in: 3600, refresh_token: refreshToken, refresh_token_expires_in: 86400 }));
    mock.fetch.mockResolvedValueOnce(response(user())); mock.fetch.mockResolvedValueOnce(response({ total_count: 0 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState()).toMatchObject({ connected: true, phase: 'success', account: { id: 42, installations: 0 }, message: expect.stringContaining('Choose repositories') });
    expect(mock.saved).toMatchObject({ token, githubOAuth: { refreshToken, account: { login: 'test-user' }, expiresAt: '2026-10-19T01:00:05.000Z' } });
    expect(JSON.stringify(mock.emit.mock.calls)).not.toContain(token);
    expect(JSON.stringify(mock.emit.mock.calls)).not.toContain(refreshToken);
    expect(mock.fetch.mock.calls[0][1].redirect).toBe('error');
  });
  it('cancels without removing an existing manual connection and rejects stale flow IDs', async () => {
    mock.saved = { token }; mock.fetch.mockResolvedValueOnce(response(code()));
    const state = await auth.startGitHubSignIn();
    auth.cancelGitHubSignIn('wrong-id'); expect(auth.getGitHubSignInState().phase).toBe('waiting');
    auth.cancelGitHubSignIn(state.flowId);
    expect(auth.getGitHubSignInState()).toMatchObject({ phase: 'cancelled', connected: true });
    await expect(auth.openGitHubSignInPage(state.flowId!)).rejects.toThrow(/no longer active/);
    expect(() => auth.copyGitHubSignInCode(state.flowId!)).toThrow(/no longer active/);
    await vi.advanceTimersByTimeAsync(5000); expect(mock.fetch).toHaveBeenCalledTimes(1);
    auth.githubCredentialsChanged(); expect(auth.getGitHubSignInState().phase).toBe('idle');
  });
  it('ignores a code response arriving after cancellation', async () => {
    let done!: (value: Response) => void;
    mock.fetch.mockReturnValue(new Promise(resolve => { done = resolve; }));
    const pending = auth.startGitHubSignIn(); auth.cancelGitHubSignIn(); done(response(code()));
    expect((await pending).phase).toBe('cancelled'); expect(mock.save).not.toHaveBeenCalled();
  });
  it.each([
    { device_code: 'short' }, { device_code: 42 }, { user_code: 'invalid' }, { user_code: undefined },
    { verification_uri: 'https://evil.invalid/device' }, { expires_in: 0 }, { expires_in: 1801 },
    { expires_in: '900' }, { interval: 0 }, { interval: 121 }, { interval: '5' }
  ])('rejects malformed public device responses %#', async change => {
    mock.fetch.mockResolvedValue(response({ ...code(), ...change }));
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'error', message: expect.stringContaining('unexpected sign-in code') });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it.each(['access_denied', 'expired_token', 'token_expired', 'device_flow_disabled', 'incorrect_client_credentials', 'incorrect_device_code', 'bad_verification_code', 'bad_refresh_token', 'unverified_user_email', 'unknown'])('explains OAuth error %s', async error => {
    mock.fetch.mockResolvedValue(response({ error }));
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'error', message: expect.any(String) });
  });
  it.each([
    [() => new Response('bad JSON'), /unreadable/],
    [() => response([]), /unexpected/], [() => response(null), /unexpected/],
    [() => response('text'), /unexpected/], [() => new Response('x'.repeat(256001)), /unexpected/],
    [() => response({}, 500), /temporarily unavailable/], [() => response({}, 429), /rate limited/],
    [() => response({}, 403), /HTTP 403/], [() => response({}, 401), /rejected this session/]
  ])('handles an invalid HTTP response %#', async (makeResponse, message) => {
    mock.fetch.mockResolvedValue(makeResponse());
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'error', message: expect.stringMatching(message) });
  });
  it('translates network failures and bounds request timeouts', async () => {
    mock.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await auth.startGitHubSignIn()).message).toMatch(/Could not connect/);
    mock.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = auth.startGitHubSignIn(); await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).message).toMatch(/20 seconds/);
  });
  it('waits on pending authorization and respects server slow-down requests', async () => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ error: 'authorization_pending' }));
    await vi.advanceTimersByTimeAsync(5000); expect(auth.getGitHubSignInState().phase).toBe('waiting');
    mock.fetch.mockResolvedValueOnce(response({ error: 'slow_down', interval: 12 }));
    await vi.advanceTimersByTimeAsync(5000);
    const calls = mock.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(11999); expect(mock.fetch).toHaveBeenCalledTimes(calls);
    mock.fetch.mockResolvedValueOnce(response({ error: 'access_denied' }));
    await vi.advanceTimersByTimeAsync(1); expect(auth.getGitHubSignInState().phase).toBe('error');
  });
  it('expires a code and never sends another request after its deadline', async () => {
    mock.fetch.mockResolvedValueOnce(response({ ...code(), expires_in: 5 })); await auth.startGitHubSignIn();
    await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState().phase).toBe('expired'); expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it('retries transient poll failures while the code is valid', async () => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockRejectedValueOnce(new TypeError('offline')); await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState()).toMatchObject({ phase: 'waiting', message: expect.stringContaining('Retrying') });
    mock.fetch.mockResolvedValueOnce(response({ error: 'expired_token' })); await vi.advanceTimersByTimeAsync(10_000);
    expect(auth.getGitHubSignInState().phase).toBe('expired');
  });
  it.each(['bad', 42, undefined])('does not store malformed access tokens %#', async access_token => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ access_token })); await vi.advanceTimersByTimeAsync(5000);
    expect(mock.save).not.toHaveBeenCalled(); expect(auth.getGitHubSignInState().phase).toBe('waiting');
  });
  it.each([{ id: 0 }, { login: '../bad' }, { id: '42' }, { login: undefined }])('does not save invalid user identities %#', async change => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ access_token: token })); mock.fetch.mockResolvedValueOnce(response({ ...user(), ...change }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock.save).not.toHaveBeenCalled(); expect(auth.getGitHubSignInState()).toMatchObject({ phase: 'error', message: expect.stringContaining('could not verify') });
  });
  it('allows sign-in when installation count is unavailable and ignores untrusted avatars', async () => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ access_token: token }));
    mock.fetch.mockResolvedValueOnce(response({ id: 42, login: 'test-user', avatar_url: 'http://evil.invalid/avatar' }));
    mock.fetch.mockRejectedValueOnce(new Error('installations unavailable'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock.saved.githubOAuth.account).toEqual({ id: 42, login: 'test-user', installations: undefined });
    expect(auth.getGitHubSignInState()).toMatchObject({ phase: 'success', message: 'Signed in as @test-user.' });
  });
});

describe('expiring GitHub sessions', () => {
  it('passes manual tokens and still-valid sessions through without fetching', async () => {
    const manual = { token }; expect(await auth.githubRequestCredential(manual)).toBe(manual);
    for (const expiresAt of [undefined, '2099-01-01']) {
      const saved = oauth({ expiresAt }); expect(await auth.githubRequestCredential(saved)).toBe(saved);
    }
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it.each([{ reauthRequired: true }, { refreshToken: undefined }, { refreshExpiresAt: '2000-01-01' }])('requires fresh sign-in for unrecoverable sessions %#', async change => {
    mock.saved = oauth(change); await expect(auth.githubRequestCredential(mock.saved)).rejects.toThrow(/Sign in again/);
  });
  it('refreshes a session exactly once for concurrent API calls', async () => {
    mock.saved = oauth(); const old = mock.saved;
    let resolve!: (value: Response) => void; mock.fetch.mockReturnValue(new Promise(done => { resolve = done; }));
    const first = auth.githubRequestCredential(old), second = auth.githubRequestCredential(old);
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    resolve(response({ access_token: `${token}_new`, expires_in: 3600, refresh_token: `${refreshToken}_new`, refresh_token_expires_in: 86400 }));
    expect(await first).toEqual(await second);
    expect(mock.saved.token).toBe(`${token}_new`); expect(mock.save).toHaveBeenCalledTimes(1);
  });
  it('keeps existing refresh metadata when GitHub omits replacements', async () => {
    mock.saved = oauth(); const previousExpiry = mock.saved.githubOAuth.refreshExpiresAt;
    mock.fetch.mockResolvedValue(response({ access_token: `${token}_new` }));
    expect(await auth.githubRequestCredential(mock.saved)).toMatchObject({ githubOAuth: { refreshToken, refreshExpiresAt: previousExpiry, expiresAt: undefined } });
  });
  it('returns a valid replacement for the same account but rejects account switches', async () => {
    const previous = oauth(); mock.saved = oauth({ expiresAt: '2099-01-01' }); mock.saved.token = `${token}_new`;
    expect(await auth.githubRequestCredential(previous)).toBe(mock.saved);
    mock.saved.githubOAuth.account.id = 99;
    await expect(auth.githubRequestCredential(previous)).rejects.toThrow(/connection changed/);
  });
  it('never overwrites a credential replaced during an asynchronous refresh', async () => {
    mock.saved = oauth(); const old = mock.saved;
    mock.fetch.mockImplementation(async () => { mock.saved = { token: 'replacement-manual-token' }; return response({ access_token: `${token}_new` }); });
    await expect(auth.githubRequestCredential(old)).rejects.toThrow(/connection changed/);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it.each(['bad_refresh_token', 'incorrect_client_credentials', 'unknown'])('handles rejected refresh %s', async error => {
    mock.saved = oauth(); mock.fetch.mockResolvedValue(response({ error }));
    await expect(auth.githubRequestCredential(mock.saved)).rejects.toThrow();
    expect(!!mock.saved.githubOAuth.reauthRequired).toBe(error !== 'unknown');
  });
  it('invalidates only the currently rejected device session', () => {
    const old = oauth(); mock.saved = { token: 'manual' }; auth.githubSessionRejected(old);
    expect(mock.save).not.toHaveBeenCalled();
    mock.saved = oauth(); auth.githubSessionRejected({ token }); expect(mock.save).not.toHaveBeenCalled();
    auth.githubSessionRejected(mock.saved);
    expect(mock.saved.githubOAuth.reauthRequired).toBe(true); expect(auth.getGitHubSignInState().phase).toBe('error');
  });
  it('refreshes account details and installation count without exposing a token', async () => {
    expect((await auth.refreshGitHubAccount()).connected).toBe(false);
    mock.saved = oauth({ expiresAt: '2099-01-01' });
    mock.fetch.mockResolvedValueOnce(response(user())).mockResolvedValueOnce(response({ total_count: 3 }));
    expect(await auth.refreshGitHubAccount()).toMatchObject({ connected: true, account: { login: 'test-user', installations: 3 } });
    expect(JSON.stringify(await auth.getGitHubSignInState())).not.toContain(token);
  });
  it('marks rejected account sessions for sign-in and preserves asynchronous replacements', async () => {
    mock.saved = oauth({ expiresAt: '2099-01-01' }); mock.fetch.mockResolvedValueOnce(response({}, 401));
    await expect(auth.refreshGitHubAccount()).rejects.toThrow(/rejected this session/);
    expect(mock.saved.githubOAuth.reauthRequired).toBe(true);
    mock.saved = oauth({ expiresAt: '2099-01-01' });
    mock.fetch.mockResolvedValueOnce(response(user())).mockImplementationOnce(async () => { mock.saved = { token: 'replacement' }; return response({ total_count: 1 }); });
    await expect(auth.refreshGitHubAccount()).rejects.toThrow(/connection changed/);
    expect(mock.saved.token).toBe('replacement');
  });
});

describe('device flow cancellation and delayed responses', () => {
  it('handles a cancellation from a subscriber before the first HTTP request starts', async () => {
    auth.registerGitHubSignIn(state => { if (state.phase === 'requesting') auth.cancelGitHubSignIn(); });
    mock.fetch.mockImplementation(async (_url, init) => {
      expect(init.signal.aborted).toBe(true);
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'cancelled' });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('stops scheduling when the subscriber cancels after receiving a code', async () => {
    auth.registerGitHubSignIn(state => { if (state.phase === 'waiting') auth.cancelGitHubSignIn(); });
    mock.fetch.mockResolvedValueOnce(response(code()));
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'cancelled' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mock.fetch).toHaveBeenCalledOnce();
  });
  it('expires a code whose deadline passes while subscribers process its state', async () => {
    auth.registerGitHubSignIn(state => { if (state.phase === 'waiting') vi.setSystemTime(Date.now() + 901_000); });
    mock.fetch.mockResolvedValueOnce(response(code()));
    expect(await auth.startGitHubSignIn()).toMatchObject({ phase: 'expired' });
    expect(mock.fetch).toHaveBeenCalledOnce();
  });
  it('ignores an already-queued poll callback after cancellation', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    const scheduled = timers.mock.calls.find(([, delay]) => delay === 5000)?.[0];
    expect(typeof scheduled).toBe('function');
    auth.cancelGitHubSignIn();
    if (typeof scheduled === 'function') scheduled();
    await Promise.resolve();
    expect(mock.fetch).toHaveBeenCalledOnce(); expect(mock.save).not.toHaveBeenCalled();
  });
  it.each(['response', 'rejection'])('ignores a poll %s delivered after cancellation', async outcome => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockImplementationOnce(async () => {
      auth.cancelGitHubSignIn();
      if (outcome === 'rejection') throw new Error('late request failure');
      return response({ access_token: token });
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState().phase).toBe('cancelled'); expect(mock.save).not.toHaveBeenCalled();
    expect(mock.fetch).toHaveBeenCalledTimes(2);
  });
  it('discards an approved session cancelled while installation details are arriving', async () => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ access_token: token })).mockResolvedValueOnce(response(user()));
    mock.fetch.mockImplementationOnce(async () => { auth.cancelGitHubSignIn(); return response({ total_count: 1 }); });
    await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState().phase).toBe('cancelled'); expect(mock.save).not.toHaveBeenCalled();
  });
  it('treats a malformed installation count as unknown', async () => {
    mock.saved = oauth({ expiresAt: '2099-01-01' });
    mock.fetch.mockResolvedValueOnce(response(user())).mockResolvedValueOnce(response({ total_count: -1 }));
    expect(await auth.refreshGitHubAccount()).toMatchObject({ connected: true, account: { installations: undefined } });
  });
  it('uses the default slow-down interval when GitHub does not supply one', async () => {
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockResolvedValueOnce(response({ error: 'slow_down' })); await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(9999); expect(mock.fetch).toHaveBeenCalledTimes(2);
    mock.fetch.mockResolvedValueOnce(response({ error: 'access_denied' })); await vi.advanceTimersByTimeAsync(1);
    expect(auth.getGitHubSignInState().phase).toBe('error');
  });
  it('reports non-Error failures while starting, polling and saving an approved session', async () => {
    mock.fetch.mockRejectedValueOnce('connection failed');
    expect((await auth.startGitHubSignIn()).message).toBe('Could not start GitHub sign-in.');
    mock.fetch.mockResolvedValueOnce(response(code())); await auth.startGitHubSignIn();
    mock.fetch.mockRejectedValueOnce('connection failed'); await vi.advanceTimersByTimeAsync(5000);
    expect(auth.getGitHubSignInState().message).toContain('GitHub could not be reached. Retrying');
    mock.fetch.mockResolvedValueOnce(response({ access_token: token })).mockResolvedValueOnce(response(user())).mockResolvedValueOnce(response({ total_count: 1 }));
    mock.save.mockImplementationOnce(() => { throw 'keychain locked'; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(auth.getGitHubSignInState()).toMatchObject({ phase: 'error', message: expect.stringContaining('Unlock the system keyring') });
    expect(mock.saved).toBeNull();
  });
  it('can update connection state before an event subscriber is registered', async () => {
    vi.resetModules(); const withoutSubscriber = await import('../../src/main/git/github-auth');
    mock.fetch.mockResolvedValueOnce(response({ error: 'access_denied' }));
    expect(await withoutSubscriber.startGitHubSignIn()).toMatchObject({ phase: 'error' });
    withoutSubscriber.stopGitHubSignIn();
  });
});
