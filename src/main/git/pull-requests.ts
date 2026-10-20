import type {
  HostedPullRequest,
  PullRequestContext,
  PullRequestCredential,
  PullRequestProvider,
  RemoteInfo
} from '../../shared/types';
import { gitFor } from './core';
import { getRemotes } from './objects-navigation';
import { githubRequestCredential, githubSessionRejected } from './github-auth';
import { normalizeGitLabServer } from '../../shared/gitlab-server';
import { matchHostingServer, normalizeHostingServer } from '../../shared/hosting-provider';

interface HostedRepository {
  provider: PullRequestProvider;
  host: string;
  path: string;
  webUrl: string;
  serverUrl?: string;
}

interface PullRequestApiConfig extends HostedRepository {
  apiBase: string;
}

function normalizeRemoteUrl(rawUrl: string): URL | null {
  const value = rawUrl.trim();
  if (!value) return null;
  try {
    const match = value.match(/^[^@:/\s]+@([^:\s]+):(.+)$/);
    if (match) {
      return new URL(`https://${match[1]}/${match[2]}`);
    }
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ssh:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseHostedRepository(remote: RemoteInfo, providerOverride?: PullRequestProvider,
  getCredential?: (provider: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null): HostedRepository | null {
  const parsed = normalizeRemoteUrl(remote.fetchUrl || remote.pushUrl);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  const rawUrl = remote.fetchUrl || remote.pushUrl;
  const connections = (host === 'github.com' || host === 'bitbucket.org' ? [] : (['gitlab', 'gitea'] as const)).flatMap(provider => {
    const credential = getCredential?.(provider, rawUrl);
    if (!credential?.serverUrl || !matchHostingServer(rawUrl, [credential.serverUrl])) return [];
    return [{ provider, serverUrl: credential.serverUrl }];
  }).sort((a, b) => new URL(b.serverUrl).pathname.length - new URL(a.serverUrl).pathname.length);
  const ambiguous = connections.length > 1 && new URL(connections[0].serverUrl).pathname.length === new URL(connections[1].serverUrl).pathname.length;
  const provider = providerOverride || (host === 'github.com' ? 'github' : host === 'bitbucket.org' ? 'bitbucket' :
    host === 'gitlab.com' ? 'gitlab' : !ambiguous ? connections[0]?.provider : null);
  if (!provider) return null;
  if (provider === 'github' && host !== 'github.com') return null;
  if (provider === 'bitbucket' && host !== 'bitbucket.org') return null;
  if ((provider === 'gitlab' || provider === 'gitea') && (host === 'github.com' || host === 'bitbucket.org')) return null;
  const connection = connections.find(item => item.provider === provider);
  const instance = provider === 'gitlab' || provider === 'gitea'
    ? connection?.serverUrl || `https://${parsed.protocol === 'ssh:' ? host : parsed.host}` : undefined;
  let repositoryPath: string;
  try {
    repositoryPath = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, ''));
    if (connection) {
      const prefix = decodeURIComponent(new URL(connection.serverUrl).pathname).replace(/^\/+|\/+$/g, '');
      if (prefix) repositoryPath = repositoryPath.slice(prefix.length + 1);
    }
  } catch { return null; }
  const parts = repositoryPath.split('/');
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || /[\\\0\r\n]/.test(part))) return null;
  if (provider !== 'gitlab' && parts.length !== 2) return null;
  const path = parts.join('/');
  const webUrl = `${instance || `https://${host}`}/${parts.map(encodeURIComponent).join('/')}`;
  return { provider, host, path, webUrl, ...(instance ? { serverUrl: instance } : {}) };
}

function apiConfig(repository: HostedRepository): PullRequestApiConfig {
  switch (repository.provider) {
    case 'github':
      return { ...repository, apiBase: 'https://api.github.com' };
    case 'gitlab':
      return { ...repository, apiBase: `${repository.serverUrl}/api/v4` };
    case 'gitea':
      return { ...repository, apiBase: `${repository.serverUrl}/api/v1` };
    case 'bitbucket':
      return { ...repository, apiBase: 'https://api.bitbucket.org/2.0' };
  }
}

export function apiPath(config: PullRequestApiConfig): string {
  if (config.provider === 'github' || config.provider === 'gitea') return `/repos/${config.path.split('/').map(encodeURIComponent).join('/')}`;
  if (config.provider === 'gitlab') return `/projects/${encodeURIComponent(config.path)}`;
  const [workspace, repository] = config.path.split('/');
  return `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;
}

function authHeaders(provider: PullRequestProvider, credential: PullRequestCredential): Record<string, string> {
  const common = { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Git Workbench' };
  if (provider === 'github') {
    return { ...common, Accept: 'application/vnd.github+json', Authorization: `Bearer ${credential.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  }
  if (provider === 'gitlab') return { ...common, 'PRIVATE-TOKEN': credential.token };
  if (provider === 'gitea') return { ...common, Authorization: `token ${credential.token}` };
  const basic = Buffer.from(`${credential.username}:${credential.token}`).toString('base64');
  return { ...common, Authorization: `Basic ${basic}` };
}

function errorForResponse(provider: PullRequestProvider, status: number, body: string): Error {
  if (status === 401) return new Error('The saved access token is invalid or expired. Update the provider credential and try again.');
  if (status === 403) return new Error('The provider denied this request. Check the token permissions and your access to this repository.');
  if (status === 404) return new Error('The repository was not found or the token cannot access it. Check the selected remote and token permissions.');
  if (status === 409 || status === 422) {
    let detail = '';
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      detail = typeof parsed.message === 'string' ? parsed.message : '';
      if (!detail && typeof parsed.error === 'string') detail = parsed.error;
    } catch { /* Provider returned a non-JSON error. */ }
    return new Error(detail ? `${providerLabel(provider)}: ${detail.slice(0, 240)}` : 'The provider rejected this request. An open request may already exist for these branches.');
  }
  if (status === 429) return new Error('The provider API rate limit was reached. Wait a little and try again.');
  return new Error(`${providerLabel(provider)} API returned HTTP ${status}. Try again later.`);
}

function providerLabel(provider: PullRequestProvider): string {
  return provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : provider === 'gitea' ? 'Gitea' : 'Bitbucket';
}

export async function requestJson<T>(
  config: PullRequestApiConfig,
  credential: PullRequestCredential,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  payload?: unknown,
  asText = false,
  onHeaders?: (headers: Headers) => void
): Promise<T> {
  if (config.provider === 'gitlab') {
    const server = normalizeGitLabServer(credential.serverUrl ?? 'https://gitlab.com');
    if (config.apiBase !== `${server}/api/v4` && !(config.apiBase === server && path === '/api/graphql')) {
      throw new Error('Connect this GitLab server in Settings → Pull Request Providers. Tokens are only sent to their configured server.');
    }
  }
  if (config.provider === 'gitea') {
    const server = normalizeHostingServer(credential.serverUrl ?? '', 'Gitea');
    if (config.apiBase !== `${server}/api/v1`) throw new Error('Connect this Gitea server in Settings → Pull Request Providers. Tokens are only sent to their configured server.');
  }
  const activeCredential = config.provider === 'github' ? await githubRequestCredential(credential) : credential;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const readResponse = async (): Promise<T> => {
    let url = `${config.apiBase}${path}`;
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(url, {
        method, headers: { ...authHeaders(config.provider, activeCredential), ...(asText ? { Accept: 'text/plain' } : {}) },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal, redirect: 'manual'
      });
      if (![301, 302, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      const next = location && new URL(location, url);
      if (method !== 'GET' || redirects >= 3 || !next || next.username || next.password || next.origin !== new URL(config.apiBase).origin || !next.pathname.startsWith(new URL(config.apiBase).pathname.replace(/\/$/, '') + apiPath(config) + '/')) {
        throw new Error('The provider returned an unsupported redirect. Open the request on the provider.');
      }
      await response.body?.cancel();
      url = next.href;
    }
    const body = await response.text();
    if (!response.ok) {
      if (config.provider === 'github' && response.status === 401) {
        githubSessionRejected(activeCredential);
        throw new Error('The GitHub session is invalid or expired. Reconnect in Settings → Pull Request Providers.');
      }
      if (config.provider === 'github' && response.status === 404) throw new Error('This repository was not found or GitHub cannot grant access. In Settings → Pull Request Providers, choose repositories on GitHub (or check your token permissions), then refresh.');
      if ((config.provider === 'gitlab' || config.provider === 'gitea') && path === '/user' && response.status === 404) throw new Error(`The ${providerLabel(config.provider)} API was not found at this server URL. Enter the instance URL, including its port or base path if required.`);
      if (config.provider === 'gitea' && /\/comments\/\d+\/replies$/.test(path) && response.status === 404) throw new Error('This Gitea server could not accept the inline reply. Older versions do not provide this API; reply on the provider instead.');
      throw errorForResponse(config.provider, response.status, body);
    }
    if (body.length > 12_000_000) throw new Error('The provider response is too large. Review this request on the provider.');
    onHeaders?.(response.headers);
    return (asText ? body : body ? JSON.parse(body) : null) as T;
  };
  return readResponse().catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The provider API did not respond within 20 seconds. Check your connection and try again.');
    if (error instanceof SyntaxError) throw new Error('The server did not return a valid API response. Check the provider URL and any proxy or SSO requirements.');
    if (error instanceof TypeError) throw new Error('Could not connect to the provider API. Check the server URL, network or VPN, and that its HTTPS certificate is trusted.');
    throw error;
  }).finally(() => {
    clearTimeout(timer);
  });
}

export async function testGitLabConnection(serverUrl: string, credential: PullRequestCredential): Promise<string> {
  const server = normalizeGitLabServer(serverUrl);
  if (!credential || typeof credential.token !== 'string' || !credential.token.trim() || /[\r\n\0]/.test(credential.token)) throw new Error('Enter a valid GitLab access token.');
  const user = await requestJson<{ username?: unknown }>({
    provider: 'gitlab', host: new URL(server).hostname, serverUrl: server, path: '', webUrl: server, apiBase: `${server}/api/v4`
  }, { token: credential.token.trim(), serverUrl: server }, '/user', 'GET');
  if (!user || typeof user.username !== 'string' || !user.username) throw new Error('The server did not return a GitLab account. Check the instance URL and token.');
  return user.username;
}

export async function testGiteaConnection(serverUrl: string, credential: PullRequestCredential): Promise<string> {
  const server = normalizeHostingServer(serverUrl, 'Gitea');
  if (!credential || typeof credential.token !== 'string' || !credential.token.trim() || /[\r\n\0]/.test(credential.token)) throw new Error('Enter a valid Gitea access token.');
  const user = await requestJson<{ login?: unknown }>({
    provider: 'gitea', host: new URL(server).hostname, serverUrl: server, path: '', webUrl: server, apiBase: `${server}/api/v1`
  }, { token: credential.token.trim(), serverUrl: server }, '/user', 'GET');
  if (!user || typeof user.login !== 'string' || !user.login) throw new Error('The server did not return a Gitea account. Check the instance URL and token.');
  return user.login;
}

/** Servers can cap page sizes below the requested limit. Follow their pagination metadata. */
export async function giteaPages<T>(config: PullRequestApiConfig, credential: PullRequestCredential, path: string, maxItems = 1000): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL(path, 'https://pagination.invalid');
    // Keep the page size fixed: changing it changes Gitea's page offset.
    url.searchParams.set('limit', String(Math.min(100, maxItems)));
    url.searchParams.set('page', String(page));
    let hasMore: boolean | undefined;
    const data = await requestJson<T[]>(config, credential, url.pathname + url.search, 'GET', undefined, false, headers => {
      const more = headers.get('x-hasmore');
      if (more !== null) hasMore = more === 'true';
      else if (headers.has('x-pagecount')) hasMore = page < Number(headers.get('x-pagecount'));
      else if (headers.has('link')) hasMore = /rel="?next"?/.test(headers.get('link') || '');
    });
    if (!Array.isArray(data)) throw new Error('Gitea returned an unreadable list. Open the provider to inspect this request.');
    const remaining = maxItems - rows.length;
    rows.push(...data.slice(0, remaining));
    if (data.length > remaining) return { rows, truncated: true };
    if (!data.length || hasMore === false) return { rows, truncated: false };
    if (rows.length >= maxItems) return { rows, truncated: true };
  }
  return { rows, truncated: true };
}

/** Resolve credentials only against a configured remote, never a renderer-provided API URL. */
export async function hostedReviewClient(repoPath: string, remoteName: string, provider: PullRequestProvider,
  getCredential: (provider: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null) {
  const remote = (await getRemotes(repoPath)).find(item => item.name === remoteName);
  if (!remote) throw new Error('Select a supported remote for this review.');
  const hosted = parseHostedRepository(remote, provider, getCredential);
  if (!hosted) throw new Error('Select a supported remote for this review.');
  const credential = getCredential(provider, remote.fetchUrl || remote.pushUrl);
  if (!credential?.token) throw new Error('Connect this provider in Settings → Pull Request Providers.');
  return { config: apiConfig(hosted), credential };
}

function mapPullRequests(provider: PullRequestProvider, payload: unknown): HostedPullRequest[] {
  const values = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { values?: unknown[] }).values)
      ? (payload as { values: unknown[] }).values
      : [];

  return values.map((value: unknown): HostedPullRequest => {
    const pr = value as Record<string, any>;
    if (provider === 'github' || provider === 'gitea') {
      return {
        id: String(pr.number), title: String(pr.title || 'Untitled pull request'),
        state: (provider === 'gitea' ? pr.merged : pr.merged_at) ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
        draft: !!pr.draft, author: String(pr.user?.login || 'Unknown'),
        sourceBranch: String(pr.head?.ref || ''), targetBranch: String(pr.base?.ref || ''),
        url: String(pr.html_url || ''), createdAt: pr.created_at, updatedAt: pr.updated_at
      };
    }
    if (provider === 'gitlab') {
      return {
        id: String(pr.iid), title: String(pr.title || 'Untitled merge request'),
        state: pr.state === 'merged' ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
        draft: !!pr.draft || !!pr.work_in_progress || /^draft:/i.test(String(pr.title || '')),
        author: String(pr.author?.username || pr.author?.name || 'Unknown'),
        sourceBranch: String(pr.source_branch || ''), targetBranch: String(pr.target_branch || ''),
        url: String(pr.web_url || ''), createdAt: pr.created_at, updatedAt: pr.updated_at
      };
    }
    return {
      id: String(pr.id), title: String(pr.title || 'Untitled pull request'),
      state: String(pr.state).toUpperCase() === 'MERGED' ? 'merged' : String(pr.state).toUpperCase() === 'DECLINED' ? 'closed' : 'open',
      draft: !!pr.draft, author: String(pr.author?.display_name || pr.author?.nickname || 'Unknown'),
      sourceBranch: String(pr.source?.branch?.name || ''), targetBranch: String(pr.destination?.branch?.name || ''),
      url: String(pr.links?.html?.href || ''), createdAt: pr.created_on, updatedAt: pr.updated_on
    };
  }).filter((pr) => pr.id && pr.url);
}

async function repositoryMetadata(config: PullRequestApiConfig, credential: PullRequestCredential) {
  const result = await requestJson<Record<string, any>>(config, credential, apiPath(config), 'GET');
  if (config.provider === 'github' || config.provider === 'gitea') {
    return { defaultBranch: String(result.default_branch || ''), repositoryUrl: String(result.html_url || config.webUrl) };
  }
  if (config.provider === 'gitlab') {
    return { defaultBranch: String(result.default_branch || ''), repositoryUrl: String(result.web_url || config.webUrl) };
  }
  return {
    defaultBranch: String(result.mainbranch?.name || ''),
    repositoryUrl: String(result.links?.html?.href || config.webUrl)
  };
}

function listPath(config: PullRequestApiConfig): string {
  const root = apiPath(config);
  if (config.provider === 'github') return `${root}/pulls?state=open&per_page=100`;
  if (config.provider === 'gitea') return `${root}/pulls?state=open&sort=recentupdate`;
  if (config.provider === 'gitlab') return `${root}/merge_requests?state=opened&per_page=100&order_by=updated_at&sort=desc`;
  return `${root}/pullrequests?state=OPEN&pagelen=50&sort=-updated_on`;
}

function createPath(config: PullRequestApiConfig): string {
  const root = apiPath(config);
  return config.provider === 'github' || config.provider === 'gitea' ? `${root}/pulls` : config.provider === 'gitlab' ? `${root}/merge_requests` : `${root}/pullrequests`;
}

function createPayload(config: PullRequestApiConfig, sourceBranch: string, targetBranch: string, title: string, description: string) {
  if (config.provider === 'github' || config.provider === 'gitea') return { title, body: description, head: sourceBranch, base: targetBranch };
  if (config.provider === 'gitlab') return { title, description, source_branch: sourceBranch, target_branch: targetBranch };
  return {
    title,
    description,
    source: { branch: { name: sourceBranch } },
    destination: { branch: { name: targetBranch } },
    close_source_branch: false
  };
}

type ResolvedPullRequestContext =
  | { ok: false; context: PullRequestContext & { error: string } }
  | { ok: true; hosted: HostedRepository; context: PullRequestContext };

/** Retain the validated repository for mutations instead of reparsing display fields. */
async function resolvePullRequestContext(
  repoPath: string,
  remoteName?: string,
  providerOverride?: PullRequestProvider,
  getCredential?: (provider: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null
): Promise<ResolvedPullRequestContext> {
  const git = gitFor(repoPath);
  const currentBranch = (await git.raw(['branch', '--show-current'])).trim();
  const remotes = await getRemotes(repoPath);
  const trackingRemote = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).then((value) => value.trim().split('/')[0]).catch(() => '');
  const selected = (remoteName && remotes.find((remote) => remote.name === remoteName)) ||
    remotes.find((remote) => remote.name === trackingRemote) ||
    remotes.find((remote) => remote.name === 'origin') || remotes[0];
  if (!selected) {
    return { ok: false, context: { provider: null, remoteName: null, currentBranch, defaultBranch: '', credentialConfigured: false, pullRequests: [], error: 'This repository has no Git remote. Add a GitHub, GitLab, Bitbucket, or Gitea remote first.' } };
  }

  const hosted = parseHostedRepository(selected, providerOverride, getCredential);
  if (!hosted) {
    return { ok: false, context: {
      provider: null, remoteName: selected.name, remoteUrl: selected.fetchUrl || selected.pushUrl, currentBranch,
      defaultBranch: '', credentialConfigured: false, pullRequests: [],
      error: 'This remote is not a recognized provider. For GitLab or Gitea, add its server URL and token in Settings → Pull Request Providers.'
    } };
  }

  const credential = getCredential?.(hosted.provider, selected.fetchUrl || selected.pushUrl) ?? null;
  const context: PullRequestContext = {
    provider: hosted.provider,
    remoteName: selected.name,
    remoteUrl: selected.fetchUrl || selected.pushUrl,
    repository: hosted.path,
    repositoryUrl: hosted.webUrl,
    currentBranch,
    defaultBranch: '',
    credentialConfigured: !!credential?.token,
    pullRequests: []
  };
  if (!credential?.token) return { ok: true, hosted, context };

  const config = apiConfig(hosted);
  try {
    const [metadata, requestList] = await Promise.all([
      repositoryMetadata(config, credential),
      hosted.provider === 'gitea' ? giteaPages<unknown>(config, credential, listPath(config), 100).then(result => result.rows) : requestJson<unknown>(config, credential, listPath(config), 'GET')
    ]);
    return { ok: true, hosted, context: {
      ...context,
      ...metadata,
      pullRequests: mapPullRequests(hosted.provider, requestList)
    } };
  } catch (error) {
    return { ok: true, hosted, context: { ...context, error: error instanceof Error ? error.message : String(error) } };
  }
}

export async function getPullRequestContext(
  repoPath: string,
  remoteName?: string,
  providerOverride?: PullRequestProvider,
  getCredential?: (provider: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null
): Promise<PullRequestContext> {
  return (await resolvePullRequestContext(repoPath, remoteName, providerOverride, getCredential)).context;
}

export async function createHostedPullRequest(
  repoPath: string,
  remoteName: string,
  title: string,
  description: string,
  targetBranch: string,
  providerOverride: PullRequestProvider | undefined,
  getCredential: (provider: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null
): Promise<HostedPullRequest> {
  const resolved = await resolvePullRequestContext(repoPath, remoteName, providerOverride, getCredential);
  if (!resolved.ok) throw new Error(resolved.context.error);
  const { context, hosted } = resolved;
  if (!context.credentialConfigured) throw new Error(`Connect your ${providerLabel(hosted.provider)} account before creating a request.`);
  const sourceBranch = context.currentBranch.trim();
  const destination = targetBranch.trim();
  if (!sourceBranch || sourceBranch === 'HEAD') throw new Error('Check out a local source branch before creating a request.');
  if (!destination) throw new Error('Choose a target branch.');
  if (sourceBranch === destination) throw new Error('The source and target branches must be different.');
  if (!title.trim()) throw new Error('Enter a title for the request.');
  const credential = getCredential(hosted.provider, context.remoteUrl);
  if (!credential) throw new Error(`Connect your ${providerLabel(hosted.provider)} account before creating a request.`);

  // Push first so the hosted provider can resolve the source branch. If API creation
  // fails, the branch remains safely published and can be retried from this panel.
  const git = gitFor(repoPath);
  await git.raw(['push', '--set-upstream', remoteName, sourceBranch]);

  const config = apiConfig(hosted);
  const result = await requestJson<Record<string, any>>(
    config,
    credential,
    createPath(config),
    'POST',
    createPayload(config, sourceBranch, destination, title.trim(), description.trim())
  );
  const created = mapPullRequests(hosted.provider, hosted.provider === 'bitbucket' ? { values: [result] } : [result])[0];
  if (!created) throw new Error('The provider accepted the request but returned an unreadable response. Refresh the request list.');
  return created;
}
