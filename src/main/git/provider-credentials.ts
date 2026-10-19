import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
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
type CredentialMap = Partial<Record<PullRequestProvider, StoredProviderCredential>>;

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
    gitlab: !!saved.gitlab?.token,
    bitbucket: !!saved.bitbucket?.token && !!saved.bitbucket?.username
  };
}

export function getPullRequestCredential(provider: PullRequestProvider): StoredProviderCredential | null {
  return readCredentials()[provider] ?? null;
}

/** Only main-process OAuth code can write this metadata; manual tokens replace it. */
export function saveGitHubOAuthCredential(credential: StoredProviderCredential): void {
  if (!credential.token || !credential.githubOAuth?.account?.login) throw new Error('GitHub did not return a valid account.');
  const credentials = readCredentials();
  credentials.github = credential;
  writeCredentials(credentials);
}

export function savePullRequestCredential(provider: PullRequestProvider, credential: PullRequestCredential): void {
  const token = credential.token.trim();
  const username = credential.username?.trim();
  if (!token) throw new Error('Enter an access token before saving.');
  if (provider === 'bitbucket' && !username) throw new Error('Enter the Atlassian account email used to create this Bitbucket API token.');
  const credentials = readCredentials();
  credentials[provider] = { token, ...(provider === 'bitbucket' ? { username } : {}) };
  writeCredentials(credentials);
}

export function removePullRequestCredential(provider: PullRequestProvider): void {
  const credentials = readCredentials();
  delete credentials[provider];
  if (Object.keys(credentials).length === 0) {
    try { fs.unlinkSync(credentialFile()); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  writeCredentials(credentials);
}
