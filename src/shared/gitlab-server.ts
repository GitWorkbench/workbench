/** A GitLab connection is scoped to one HTTPS instance, including its base path. */
export function normalizeGitLabServer(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter your GitLab server URL.');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a full GitLab server URL, such as https://code.example.com.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTPS GitLab server URL without credentials, a query, or a fragment.');
  }
  if (/%(?:2f|5c|00)/i.test(url.pathname) || /\/api(?:\/|$)|\/-\//i.test(url.pathname)) {
    throw new Error('Enter the GitLab instance URL, including its base path if needed, without an API or project settings path.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** SSH transport ports do not identify the HTTPS API port. Ambiguous matches are rejected. */
export function matchGitLabServer(remote: string, servers: string[]): string | null {
  let url: URL;
  let ssh = false;
  try {
    const value = remote.trim();
    const scp = value.match(/^[^@:/\s]+@([^:\s]+):(.+)$/);
    url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : value);
    ssh = url.protocol === 'ssh:';
    if (!ssh && url.protocol !== 'https:') return null;
  } catch { return null; }
  const matches = servers.filter(server => {
    const instance = new URL(server);
    return (ssh ? url.hostname === instance.hostname : url.origin === instance.origin) &&
      url.pathname.startsWith(`${instance.pathname.replace(/\/$/, '')}/`);
  }).sort((a, b) => new URL(b).pathname.length - new URL(a).pathname.length);
  if (!matches.length) return null;
  const best = matches[0];
  if (matches[1] && new URL(matches[1]).pathname.length === new URL(best).pathname.length) return null;
  return best;
}
