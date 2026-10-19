import { clipboard, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import type { GitHubAccount, GitHubSignInState, PullRequestCredential } from '../../shared/types';
import githubApp from '../../shared/github-app.json';
import { assertSecureStorageAvailable, getPullRequestCredential, saveGitHubOAuthCredential } from './provider-credentials';
import type { StoredProviderCredential } from './provider-credentials';

const verificationUri = 'https://github.com/login/device';
const apiHeaders = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Git Workbench' };
type Json = Record<string, any>;
class GitHubSessionRejected extends Error {}
type Flow = { id: string; clientId: string; controller: AbortController; deviceCode?: string; userCode?: string; deadline: number; interval: number; retries: number; timer?: ReturnType<typeof setTimeout> };
let flow: Flow | null = null;
let progress: Pick<GitHubSignInState, 'phase' | 'message'> = { phase: 'idle' };
let emit: (state: GitHubSignInState) => void = () => {};
let refreshing: { token: string; promise: Promise<StoredProviderCredential> } | null = null;

function configuration() {
  const clientId = (process.env.GIT_WORKBENCH_GITHUB_CLIENT_ID || githubApp.clientId).trim();
  const slug = (process.env.GIT_WORKBENCH_GITHUB_APP_SLUG || githubApp.slug).trim();
  return { clientId: /^[A-Za-z0-9_.-]{6,128}$/.test(clientId) ? clientId : '', slug: /^[a-z0-9-]+$/.test(slug) ? slug : '' };
}
function publish() { emit(getGitHubSignInState()); }
export function registerGitHubSignIn(callback: typeof emit) { emit = callback; }

export function getGitHubSignInState(): GitHubSignInState {
  const config = configuration();
  let secureStorageAvailable = true, storageMessage: string | undefined, credential: StoredProviderCredential | null = null;
  try { assertSecureStorageAvailable(); credential = getPullRequestCredential('github'); }
  catch (error) { secureStorageAvailable = false; storageMessage = error instanceof Error ? error.message : 'Unlock your system keyring to connect GitHub.'; }
  const session = credential?.githubOAuth;
  const needsSignIn = !!session && (!!session.reauthRequired || (!!session.expiresAt && Date.parse(session.expiresAt) <= Date.now() && (!session.refreshToken || (!!session.refreshExpiresAt && Date.parse(session.refreshExpiresAt) <= Date.now()))));
  return {
    configured: !!config.clientId, connected: !!credential?.token && !needsSignIn, secureStorageAvailable,
    method: credential?.token ? session ? 'device' : 'token' : null, account: session?.account, needsSignIn,
    installationUrl: config.slug ? `https://github.com/apps/${config.slug}/installations/new` : undefined,
    ...progress, message: storageMessage || progress.message,
    ...(flow ? { flowId: flow.id, ...(flow.userCode ? { userCode: flow.userCode, verificationUri, expiresAt: new Date(flow.deadline).toISOString() } : {}) } : {})
  };
}

async function jsonRequest(url: string, init: RequestInit, signal?: AbortSignal): Promise<Json> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  const readResponse = async (): Promise<Json> => {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
    if (response.status === 429 || response.status >= 500) throw new Error('GitHub is temporarily unavailable or rate limited. Try again shortly.');
    const text = await response.text();
    if (text.length > 256_000) throw new Error('GitHub returned an unexpected sign-in response.');
    let data: Json;
    try { data = JSON.parse(text); } catch { throw new Error('GitHub returned an unreadable sign-in response.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('GitHub returned an unexpected sign-in response.');
    if (!response.ok && !data.error) {
      if (response.status === 401) throw new GitHubSessionRejected('GitHub rejected this session. Sign in again.');
      throw new Error(`GitHub returned HTTP ${response.status}. Check your connection and account access.`);
    }
    return data;
  };
  return readResponse().catch((error: unknown) => {
    if (signal?.aborted) throw new Error('GitHub sign-in was cancelled.');
    if (controller.signal.aborted) throw new Error('GitHub did not respond within 20 seconds. Check your connection and try again.');
    if (error instanceof TypeError) throw new Error('Could not connect to GitHub. Check your connection and try again.');
    throw error;
  }).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
}
async function form(endpoint: 'device/code' | 'oauth/access_token', values: Record<string, string>, signal?: AbortSignal) {
  return jsonRequest(`https://github.com/login/${endpoint}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Git Workbench' }, body: new URLSearchParams(values).toString() }, signal);
}
const errors: Record<string, string> = {
  access_denied: 'GitHub authorization was declined. You can start again when ready.',
  expired_token: 'The sign-in code expired. Start again for a new code.', token_expired: 'The sign-in code expired. Start again for a new code.',
  device_flow_disabled: 'GitHub sign-in is not enabled for this app. The release owner must enable Device Flow in its GitHub App settings.',
  incorrect_client_credentials: 'This build has an invalid GitHub App client ID. Contact the release owner.',
  incorrect_device_code: 'GitHub could not verify this sign-in code. Start sign-in again.', bad_verification_code: 'GitHub could not verify this sign-in code. Start sign-in again.',
  bad_refresh_token: 'Your GitHub session expired or was revoked. Sign in again.', unverified_user_email: 'Verify your primary email address on GitHub, then sign in again.'
};
const oauthError = (code: string) => new Error(errors[code] || 'GitHub could not complete sign-in. Start again or use an access token.');
function expiry(seconds: unknown) { return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 && seconds <= 365 * 86400 ? new Date(Date.now() + seconds * 1000).toISOString() : undefined; }
function tokenValue(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9_]{20,512}$/.test(value)) throw new Error('GitHub did not return a valid access token. Start sign-in again.'); return value; }

async function identity(token: string, signal?: AbortSignal): Promise<GitHubAccount> {
  const user = await jsonRequest('https://api.github.com/user', { headers: { ...apiHeaders, Authorization: `Bearer ${token}` } }, signal);
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== 'string' || !/^[a-z0-9-]+$/i.test(user.login)) throw new Error('GitHub did not return a valid account identity.');
  return { id: user.id, login: user.login, ...(typeof user.name === 'string' ? { name: user.name.slice(0, 200) } : {}), ...(typeof user.avatar_url === 'string' && /^https:\/\/avatars\.githubusercontent\.com\//.test(user.avatar_url) ? { avatarUrl: user.avatar_url } : {}) };
}
async function installations(token: string, signal?: AbortSignal): Promise<number | undefined> {
  try {
    const result = await jsonRequest('https://api.github.com/user/installations?per_page=100', { headers: { ...apiHeaders, Authorization: `Bearer ${token}` } }, signal);
    return Number.isSafeInteger(result.total_count) && result.total_count >= 0 ? result.total_count : undefined;
  } catch { return undefined; }
}
function end(session: Flow, phase: GitHubSignInState['phase'], message: string) {
  if (flow !== session) return;
  if (session.timer) clearTimeout(session.timer);
  session.controller.abort(); flow = null; progress = { phase, message }; publish();
}
function schedule(session: Flow) {
  if (flow !== session) return;
  const remaining = session.deadline - Date.now();
  if (remaining <= 0) { end(session, 'expired', errors.expired_token); return; }
  session.timer = setTimeout(() => void poll(session), Math.min(remaining, session.interval + session.retries * 5000));
}
async function poll(session: Flow) {
  if (flow !== session) return;
  if (Date.now() >= session.deadline) { end(session, 'expired', errors.expired_token); return; }
  let receivedToken = false;
  try {
    const data = await form('oauth/access_token', { client_id: session.clientId, device_code: session.deviceCode!, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, session.controller.signal);
    if (flow !== session) return;
    if (data.error === 'authorization_pending') { session.retries = 0; progress = { phase: 'waiting', message: 'Enter the code on GitHub and approve Git Workbench Desktop, the registered GitHub App for Git Workbench. Waiting for authorization…' }; publish(); schedule(session); return; }
    if (data.error === 'slow_down') {
      const serverInterval = typeof data.interval === 'number' && Number.isFinite(data.interval) && data.interval > 0 ? Math.min(data.interval, 1800) * 1000 : 0;
      session.interval = Math.max(session.interval + 5000, serverInterval);
      schedule(session); return;
    }
    if (data.error) { end(session, data.error === 'expired_token' || data.error === 'token_expired' ? 'expired' : 'error', oauthError(String(data.error)).message); return; }
    const token = tokenValue(data.access_token);
    receivedToken = true;
    const account = await identity(token, session.controller.signal);
    account.installations = await installations(token, session.controller.signal);
    if (flow !== session || session.controller.signal.aborted) return;
    saveGitHubOAuthCredential({ token, githubOAuth: { clientId: session.clientId, account, expiresAt: expiry(data.expires_in), refreshToken: data.refresh_token ? tokenValue(data.refresh_token) : undefined, refreshExpiresAt: expiry(data.refresh_token_expires_in) } });
    end(session, 'success', account.installations === 0 ? `Signed in as @${account.login}. Choose repositories on GitHub to enable pull request access.` : `Signed in as @${account.login}.`);
  } catch (error) {
    if (flow !== session) return;
    if (receivedToken) { end(session, 'error', `GitHub approved sign-in, but this device could not verify or securely save the session. ${error instanceof Error ? error.message : 'Unlock the system keyring and try again.'}`); return; }
    session.retries = Math.min(session.retries + 1, 6);
    progress = { phase: 'waiting', message: `${error instanceof Error ? error.message : 'GitHub could not be reached.'} Retrying while this code is valid.` }; publish(); schedule(session);
  }
}

export async function startGitHubSignIn() {
  if (flow) return getGitHubSignInState();
  assertSecureStorageAvailable();
  const config = configuration();
  if (!config.clientId) throw new Error('GitHub sign-in has not been configured in this build. Use an access token or contact the release owner.');
  const session: Flow = { id: randomUUID(), clientId: config.clientId, controller: new AbortController(), deadline: Date.now() + 900_000, interval: 5000, retries: 0 };
  flow = session; progress = { phase: 'requesting', message: 'Requesting a secure sign-in code from GitHub…' }; publish();
  try {
    const data = await form('device/code', { client_id: config.clientId, scope: 'offline_access' }, session.controller.signal);
    if (flow !== session) return getGitHubSignInState();
    if (data.error) throw oauthError(String(data.error));
    if (typeof data.device_code !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(data.device_code) || typeof data.user_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.user_code) || data.verification_uri !== verificationUri || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 1800 || !Number.isFinite(data.interval) || data.interval <= 0 || data.interval > 120) throw new Error('GitHub returned an unexpected sign-in code. Try again.');
    session.deviceCode = data.device_code; session.userCode = data.user_code; session.deadline = Date.now() + data.expires_in * 1000; session.interval = Math.max(5000, data.interval * 1000);
    progress = { phase: 'waiting', message: 'Copy this code and continue in your browser. Approve Git Workbench Desktop, the registered GitHub App for Git Workbench, to finish.' }; publish(); schedule(session);
  } catch (error) { end(session, 'error', error instanceof Error ? error.message : 'Could not start GitHub sign-in.'); }
  return getGitHubSignInState();
}
export function cancelGitHubSignIn(id?: string) {
  if (flow && (!id || id === flow.id)) end(flow, 'cancelled', 'GitHub sign-in cancelled. Your existing connection was kept.');
  return getGitHubSignInState();
}
function activeFlow(id: string) {
  if (!flow || flow.id !== id || !flow.userCode || flow.deadline <= Date.now()) throw new Error('This sign-in code is no longer active. Start sign-in again.');
  return flow;
}
export async function openGitHubSignInPage(id: string) { activeFlow(id); await shell.openExternal(verificationUri); }
export function copyGitHubSignInCode(id: string) { clipboard.writeText(activeFlow(id).userCode!); }
export function githubCredentialsChanged() { cancelGitHubSignIn(); progress = { phase: 'idle' }; publish(); }
export function stopGitHubSignIn() { if (flow) { flow.controller.abort(); if (flow.timer) clearTimeout(flow.timer); flow = null; } }

/** Only invalidate the rejected session, never a replacement saved during an API call. */
export function githubSessionRejected(input: PullRequestCredential) {
  const credential = input as StoredProviderCredential;
  const current = getPullRequestCredential('github');
  if (!credential.githubOAuth || current?.token !== credential.token || !current.githubOAuth) return;
  saveGitHubOAuthCredential({ ...current, githubOAuth: { ...current.githubOAuth, reauthRequired: true } });
  if (!flow) progress = { phase: 'error', message: errors.bad_refresh_token };
  publish();
}

/** Refresh only main-process device credentials; token values never cross IPC. */
export async function githubRequestCredential(input: PullRequestCredential): Promise<PullRequestCredential> {
  const credential = input as StoredProviderCredential, oauth = credential.githubOAuth;
  if (!oauth) return credential;
  if (oauth.reauthRequired) throw oauthError('bad_refresh_token');
  if (!oauth.expiresAt || Date.parse(oauth.expiresAt) > Date.now() + 60_000) return credential;
  const current = getPullRequestCredential('github');
  if (current?.token !== credential.token) {
    if (current?.githubOAuth?.account.id === oauth.account.id && current.githubOAuth.clientId === oauth.clientId && !current.githubOAuth.reauthRequired && (!current.githubOAuth.expiresAt || Date.parse(current.githubOAuth.expiresAt) > Date.now() + 60_000)) return current;
    throw new Error('The GitHub connection changed. Retry the request.');
  }
  if (!oauth.refreshToken || (oauth.refreshExpiresAt && Date.parse(oauth.refreshExpiresAt) <= Date.now())) throw oauthError('bad_refresh_token');
  if (refreshing?.token === credential.token) return refreshing.promise;
  const promise = (async () => {
    const data = await form('oauth/access_token', { client_id: oauth.clientId, grant_type: 'refresh_token', refresh_token: oauth.refreshToken! });
    const latest = getPullRequestCredential('github');
    if (latest?.token !== credential.token || latest.githubOAuth?.refreshToken !== oauth.refreshToken) throw new Error('The GitHub connection changed. Retry the request.');
    if (data.error) {
      if (data.error === 'bad_refresh_token' || data.error === 'incorrect_client_credentials') githubSessionRejected(credential);
      throw oauthError(String(data.error));
    }
    const updated: StoredProviderCredential = { token: tokenValue(data.access_token), githubOAuth: { ...oauth, expiresAt: expiry(data.expires_in), refreshToken: data.refresh_token ? tokenValue(data.refresh_token) : oauth.refreshToken, refreshExpiresAt: expiry(data.refresh_token_expires_in) || oauth.refreshExpiresAt, reauthRequired: false } };
    saveGitHubOAuthCredential(updated); publish(); return updated;
  })();
  refreshing = { token: credential.token, promise };
  try { return await promise; } finally { if (refreshing?.promise === promise) refreshing = null; }
}

export async function refreshGitHubAccount() {
  const saved = getPullRequestCredential('github');
  if (!saved?.githubOAuth) return getGitHubSignInState();
  const active = await githubRequestCredential(saved) as StoredProviderCredential;
  let account: GitHubAccount;
  try { account = await identity(active.token); }
  catch (error) { if (error instanceof GitHubSessionRejected) githubSessionRejected(active); throw error; }
  account.installations = await installations(active.token);
  const current = getPullRequestCredential('github');
  if (current?.token !== active.token || !current.githubOAuth) throw new Error('The GitHub connection changed. Refresh settings again.');
  saveGitHubOAuthCredential({ ...current, githubOAuth: { ...current.githubOAuth, account } }); publish();
  return getGitHubSignInState();
}
