import type { PullRequestProvider } from './types';

export const pullRequestProviders: readonly PullRequestProvider[] = ['github', 'gitlab', 'bitbucket', 'gitea'];

export function requestLabel(provider: PullRequestProvider | null | undefined, plural = true): string {
  const name = provider === 'gitlab' ? 'Merge Request' : provider ? 'Pull Request' : 'Request';
  return plural ? `${name}s` : name;
}

/** Scope self-hosted credentials to an HTTPS origin and optional instance base path. */
export function normalizeHostingServer(value: string, name: 'GitLab' | 'Gitea'): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter your ${name} server URL.`);
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error(`Enter a full ${name} server URL, such as https://code.example.com.`); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error(`Use an HTTPS ${name} server URL without credentials, a query, or a fragment.`);
  }
  if (/%(?:2f|5c|00)/i.test(url.pathname) || /\/api(?:\/|$)|\/-\//i.test(url.pathname)) {
    throw new Error(`Enter the ${name} instance URL, including its base path if needed, without an API or project settings path.`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** SSH ports do not identify the HTTPS API port. Reject equally specific matches. */
export function matchHostingServer(remote: string, servers: string[]): string | null {
  let url: URL;
  try {
    const value = remote.trim();
    const scp = value.match(/^[^@:/\s]+@([^:\s]+):(.+)$/);
    url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : value);
    if (url.protocol !== 'ssh:' && url.protocol !== 'https:') return null;
  } catch { return null; }
  const matches = servers.filter(server => {
    const instance = new URL(server);
    return (url.protocol === 'ssh:' ? url.hostname === instance.hostname : url.origin === instance.origin) &&
      url.pathname.startsWith(`${instance.pathname.replace(/\/$/, '')}/`);
  }).sort((a, b) => new URL(b).pathname.length - new URL(a).pathname.length);
  const best = matches[0];
  if (!best || (matches[1] && new URL(matches[1]).pathname.length === new URL(best).pathname.length)) return null;
  return best;
}
