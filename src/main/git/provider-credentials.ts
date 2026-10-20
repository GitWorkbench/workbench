import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { matchGitLabServer, normalizeGitLabServer } from '../../shared/gitlab-server';
import { matchHostingServer, normalizeHostingServer } from '../../shared/hosting-provider';
import type {
  PullRequestCredential,
  PullRequestCredentialStatus,
  PullRequestProvider,
  GitHubAccount
} from '../../shared/types';

export interface StoredProviderCredential extends PullRequestCredential {
  githubOAuth?: {
    clientId: string;
    account: GitHubAccount;
    refreshToken?: string;
    expiresAt?: string;
    refreshExpiresAt?: string;
    reauthRequired?: boolean;
  };
}
type CredentialMap = Partial<Record<PullRequestProvider, StoredProviderCredential>> & {
  gitlabServers?: Record<string, StoredProviderCredential>;
  giteaServers?: Record<string, StoredProviderCredential>;
};

const credentialFile = () => path.join(app.getPath('userData'), 'hosted-git-credentials.enc');

export function assertSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable. Enable your operating system keychain or desktop keyring, then try again.');
  }
  const storageWithBackend = safeStorage as typeof safeStorage & { getSelectedStorageBackend?: () => string };
  if (storageWithBackend.getSelectedStorageBackend?.call(safeStorage) === 'basic_text') {
    throw new Error('Your Linux desktop has no secure keyring configured. Set up GNOME Keyring or KWallet before saving a provider token.');
  }
}

function readCredentials(): CredentialMap {
  const file = credentialFile();
  if (!fs.existsSync(file)) return {};
  assertSecureStorageAvailable();
  try {
    const decoded = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as CredentialMap;
    return decoded && typeof decoded === 'object' ? decoded : {};
  } catch {
    throw new Error('Saved provider credentials could not be read. Remove the encrypted credential file and connect the provider again.');
  }
}

function writeCredentials(credentials: CredentialMap) {
  assertSecureStorageAvailable();
  const file = credentialFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  fs.writeFileSync(tempFile, safeStorage.encryptString(JSON.stringify(credentials)), { mode: 0o600 });
  fs.renameSync(tempFile, file);
  try { fs.chmodSync(file, 0o600); } catch { /* Windows permissions are managed by the OS. */ }
}

export function getPullRequestCredentialStatus(): PullRequestCredentialStatus {
  const saved = readCredentials();
  return {
    github: !!saved.github?.token,
    gitea: Object.values(saved.giteaServers || {}).some(credential => !!credential.token),
    giteaServers: Object.keys(saved.giteaServers || {}).filter(server => !!saved.giteaServers?.[server]?.token).sort(),
    gitlab: !!saved.gitlab?.token || Object.values(saved.gitlabServers || {}).some(credential => !!credential.token),
    gitlabServers: [...new Set([
      ...(saved.gitlab?.token ? ['https://gitlab.com'] : []),
      ...Object.keys(saved.gitlabServers || {}).filter(server => !!saved.gitlabServers?.[server]?.token)
    ])].sort(),
    bitbucket: !!saved.bitbucket?.token && !!saved.bitbucket?.username
  };
}

export function getPullRequestCredential(provider: PullRequestProvider, remoteUrl?: string): StoredProviderCredential | null {
  const saved = readCredentials();
  if (provider === 'gitea') {
    const server = remoteUrl ? matchHostingServer(remoteUrl, Object.keys(saved.giteaServers || {})) : null;
    return server ? saved.giteaServers?.[server] ?? null : null;
  }
  if (provider !== 'gitlab') return saved[provider] ?? null;
  const connections = { ...saved.gitlabServers };
  if (saved.gitlab?.token) connections['https://gitlab.com'] = { ...saved.gitlab, serverUrl: 'https://gitlab.com' };
  const server = remoteUrl
    ? matchGitLabServer(remoteUrl, Object.keys(connections))
    : 'https://gitlab.com';
  return server ? connections[server] ?? null : null;
}

/** Only main-process OAuth code can write this metadata; manual tokens replace it. */
export function saveGitHubOAuthCredential(credential: StoredProviderCredential): void {
  if (!credential.token || !credential.githubOAuth?.account?.login) throw new Error('GitHub did not return a valid account.');
  const credentials = readCredentials();
  credentials.github = credential;
  writeCredentials(credentials);
}

export function savePullRequestCredential(provider: PullRequestProvider, credential: PullRequestCredential): void {
  if (!credential || typeof credential.token !== 'string' || (credential.username !== undefined && typeof credential.username !== 'string')) throw new Error('Enter a valid provider credential.');
  const token = credential.token.trim();
  const username = credential.username?.trim();
  if (!token) throw new Error('Enter an access token before saving.');
  if (/[\r\n\0]/.test(token)) throw new Error('The access token contains invalid characters.');
  if (provider === 'bitbucket' && !username) throw new Error('Enter the Atlassian account email used to create this Bitbucket API token.');
  const credentials = readCredentials();
  if (provider === 'gitlab') {
    const serverUrl = normalizeGitLabServer(credential.serverUrl ?? 'https://gitlab.com');
    if (credentials.giteaServers?.[serverUrl]) throw new Error('This instance is already connected as Gitea. Remove that connection before changing its provider.');
    credentials.gitlabServers = { ...credentials.gitlabServers, [serverUrl]: { token, serverUrl } };
    if (serverUrl === 'https://gitlab.com') delete credentials.gitlab;
  } else if (provider === 'gitea') {
    const serverUrl = normalizeHostingServer(credential.serverUrl ?? '', 'Gitea');
    if (credentials.gitlabServers?.[serverUrl] || (serverUrl === 'https://gitlab.com' && credentials.gitlab?.token)) throw new Error('This instance is already connected as GitLab. Remove that connection before changing its provider.');
    credentials.giteaServers = { ...credentials.giteaServers, [serverUrl]: { token, serverUrl } };
  } else credentials[provider] = { token, ...(provider === 'bitbucket' ? { username } : {}) };
  writeCredentials(credentials);
}

export function removePullRequestCredential(provider: PullRequestProvider, serverUrl?: string): void {
  const credentials = readCredentials();
  if (provider === 'gitlab') {
    const server = normalizeGitLabServer(serverUrl ?? 'https://gitlab.com');
    if (server === 'https://gitlab.com') delete credentials.gitlab;
    if (credentials.gitlabServers) {
      delete credentials.gitlabServers[server];
      if (!Object.keys(credentials.gitlabServers).length) delete credentials.gitlabServers;
    }
  } else if (provider === 'gitea') {
    const server = normalizeHostingServer(serverUrl ?? '', 'Gitea');
    if (credentials.giteaServers) {
      delete credentials.giteaServers[server];
      if (!Object.keys(credentials.giteaServers).length) delete credentials.giteaServers;
    }
  } else delete credentials[provider];
  if (Object.keys(credentials).length === 0) {
    try { fs.unlinkSync(credentialFile()); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  writeCredentials(credentials);
}
