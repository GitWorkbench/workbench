import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mock = vi.hoisted(() => ({
  directory: '', available: vi.fn(() => true), backend: vi.fn(() => 'gnome_libsecret'),
  encrypt: vi.fn((text: string) => Buffer.from(`encrypted:${text}`)),
  decrypt: vi.fn((data: Buffer) => data.toString().replace(/^encrypted:/, ''))
}));
vi.mock('electron', () => ({
  app: { getPath: () => mock.directory },
  safeStorage: { isEncryptionAvailable: mock.available, getSelectedStorageBackend: mock.backend, encryptString: mock.encrypt, decryptString: mock.decrypt }
}));
import * as credentials from '../../src/main/git/provider-credentials';
const filename = () => path.join(mock.directory, 'hosted-git-credentials.enc');
beforeEach(() => {
  mock.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-credentials-test-'));
  mock.available.mockReset().mockReturnValue(true);
  mock.backend.mockReset().mockReturnValue('gnome_libsecret');
  mock.encrypt.mockClear(); mock.decrypt.mockReset().mockImplementation(data => data.toString().replace(/^encrypted:/, ''));
});
afterEach(() => fs.rmSync(mock.directory, { recursive: true, force: true }));

describe('encrypted provider credentials', () => {
  it('returns an empty status without creating a file', () => {
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: false, gitlab: false, bitbucket: false, gitea: false, gitlabServers: [], giteaServers: [] });
    expect(credentials.getPullRequestCredential('github')).toBeNull();
    expect(fs.existsSync(filename())).toBe(false);
  });
  it('trims a token, encrypts before writing and atomically stores only provider fields', () => {
    credentials.savePullRequestCredential('github', { token: ' test-token ', username: 'ignored' });
    expect(mock.encrypt).toHaveBeenCalledWith(JSON.stringify({ github: { token: 'test-token' } }));
    expect(fs.readFileSync(filename(), 'utf8')).toMatch(/^encrypted:/);
    expect(fs.existsSync(`${filename()}.tmp`)).toBe(false);
    expect(credentials.getPullRequestCredential('github')).toEqual({ token: 'test-token' });
    if (process.platform !== 'win32') expect(fs.statSync(filename()).mode & 0o777).toBe(0o600);
  });
  it('stores all providers independently and requires Bitbucket username', () => {
    credentials.savePullRequestCredential('github', { token: 'github' });
    credentials.savePullRequestCredential('gitlab', { token: 'gitlab' });
    credentials.savePullRequestCredential('bitbucket', { token: ' bb ', username: ' user@example.invalid ' });
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: true, gitlab: true, bitbucket: true, gitea: false, gitlabServers: ['https://gitlab.com'], giteaServers: [] });
    expect(credentials.getPullRequestCredential('bitbucket')).toEqual({ token: 'bb', username: 'user@example.invalid' });
    credentials.removePullRequestCredential('gitlab');
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: true, gitlab: false, bitbucket: true, gitea: false, gitlabServers: [], giteaServers: [] });
    credentials.removePullRequestCredential('github'); credentials.removePullRequestCredential('bitbucket');
    expect(fs.existsSync(filename())).toBe(false);
    expect(() => credentials.removePullRequestCredential('github')).not.toThrow();
  });
  it.each([
    ['github', { token: '  ' }, /access token/],
    ['bitbucket', { token: 'token' }, /Atlassian account email/],
    ['bitbucket', { token: 'token', username: '  ' }, /Atlassian account email/]
  ] as const)('rejects incomplete %s credentials', (provider, value, error) => {
    expect(() => credentials.savePullRequestCredential(provider, value)).toThrow(error);
    expect(mock.encrypt).not.toHaveBeenCalled();
  });
  it('does not write when keychain encryption is unavailable or plaintext fallback is selected', () => {
    mock.available.mockReturnValue(false);
    expect(() => credentials.assertSecureStorageAvailable()).toThrow(/keychain|keyring/);
    expect(() => credentials.savePullRequestCredential('github', { token: 'token' })).toThrow(/keychain|keyring/);
    mock.available.mockReturnValue(true); mock.backend.mockReturnValue('basic_text');
    expect(() => credentials.assertSecureStorageAvailable()).toThrow(/secure keyring/);
    expect(fs.existsSync(filename())).toBe(false);
  });
  it('preserves main-process OAuth metadata but replaces it for a manual token', () => {
    const saved = { token: 'oauth-token', githubOAuth: { clientId: 'public-id', account: { id: 12, login: 'developer' }, refreshToken: 'refresh-token' } };
    credentials.saveGitHubOAuthCredential(saved);
    expect(credentials.getPullRequestCredential('github')).toEqual(saved);
    credentials.savePullRequestCredential('github', { token: 'manual' });
    expect(credentials.getPullRequestCredential('github')).toEqual({ token: 'manual' });
    expect(() => credentials.saveGitHubOAuthCredential({ token: '' })).toThrow(/valid account/);
    expect(() => credentials.saveGitHubOAuthCredential({ token: 'token' })).toThrow(/valid account/);
  });
  it('fails usefully when encrypted storage is corrupt or decryption fails', () => {
    fs.writeFileSync(filename(), 'invalid-json');
    expect(() => credentials.getPullRequestCredentialStatus()).toThrow(/could not be read/);
    mock.decrypt.mockImplementation(() => { throw new Error('keychain locked'); });
    expect(() => credentials.getPullRequestCredential('github')).toThrow(/could not be read/);
  });
  it.each(['null', 'false', '1', '"string"'])('treats decoded non-object data %s as empty', decoded => {
    fs.writeFileSync(filename(), `encrypted:${decoded}`);
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: false, gitlab: false, bitbucket: false, gitea: false, gitlabServers: [], giteaServers: [] });
  });
  it('does not report Bitbucket connected without a username', () => {
    fs.writeFileSync(filename(), 'encrypted:{"bitbucket":{"token":"token"}}');
    expect(credentials.getPullRequestCredentialStatus().bitbucket).toBe(false);
  });
  it('continues when a platform does not support chmod, but surfaces unlink failures', () => {
    const chmod = vi.spyOn(fs, 'chmodSync').mockImplementation(() => { throw new Error('unsupported'); });
    credentials.savePullRequestCredential('github', { token: 'token' });
    chmod.mockRestore();
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); });
    expect(() => credentials.removePullRequestCredential('github')).toThrow('permission denied');
  });
});


describe('Gitea instance credentials', () => {
  it('isolates multiple instances, web ports, and providers without returning secrets in status', () => {
    credentials.savePullRequestCredential('gitea', { serverUrl: 'https://code.example:8443/forge/', token: ' gitea-token ' });
    credentials.savePullRequestCredential('gitea', { serverUrl: 'https://second.example', token: 'second-token' });
    credentials.savePullRequestCredential('gitlab', { serverUrl: 'https://gitlab.example', token: 'gitlab-token' });
    expect(credentials.getPullRequestCredential('gitea', 'ssh://git@code.example:2222/forge/team/repo.git')).toEqual({ token: 'gitea-token', serverUrl: 'https://code.example:8443/forge' });
    expect(credentials.getPullRequestCredential('gitea', 'https://second.example/team/repo.git')?.token).toBe('second-token');
    expect(credentials.getPullRequestCredential('gitea', 'https://code.example/forge/team/repo.git')).toBeNull();
    expect(credentials.getPullRequestCredential('gitea', 'https://gitlab.example/team/repo.git')).toBeNull();
    expect(credentials.getPullRequestCredential('gitlab', 'https://second.example/team/repo.git')).toBeNull();
    expect(credentials.getPullRequestCredential('gitea')).toBeNull();
    const status = credentials.getPullRequestCredentialStatus();
    expect(status.gitea).toBe(true);
    expect(status.giteaServers).toEqual(['https://code.example:8443/forge', 'https://second.example']);
    expect(JSON.stringify(status)).not.toContain('token');
    credentials.removePullRequestCredential('gitea', 'https://second.example');
    expect(credentials.getPullRequestCredentialStatus().giteaServers).toEqual(['https://code.example:8443/forge']);
    expect(credentials.getPullRequestCredentialStatus().gitlab).toBe(true);
    credentials.removePullRequestCredential('gitea', 'https://code.example:8443/forge');
    expect(credentials.getPullRequestCredentialStatus().gitea).toBe(false);
    expect(credentials.getPullRequestCredential('gitlab', 'git@gitlab.example:team/repo.git')?.token).toBe('gitlab-token');
  });
  it('rejects cross-provider instance collisions and invalid token/URL values without overwriting credentials', () => {
    credentials.savePullRequestCredential('gitea', { serverUrl: 'https://code.example', token: 'original' });
    expect(() => credentials.savePullRequestCredential('gitlab', { serverUrl: 'https://code.example', token: 'wrong' })).toThrow('already connected as Gitea');
    credentials.savePullRequestCredential('gitlab', { serverUrl: 'https://gitlab.example', token: 'gitlab' });
    expect(() => credentials.savePullRequestCredential('gitea', { serverUrl: 'https://gitlab.example', token: 'wrong' })).toThrow('already connected as GitLab');
    expect(() => credentials.savePullRequestCredential('gitea', { token: 'secret' })).toThrow('server URL');
    expect(() => credentials.savePullRequestCredential('gitea', { serverUrl: 'http://code.example', token: 'secret' })).toThrow('HTTPS');
    expect(() => credentials.savePullRequestCredential('gitea', { serverUrl: 'https://code.example', token: 'bad\r\nvalue' })).toThrow('invalid characters');
    expect(credentials.getPullRequestCredential('gitea', 'git@code.example:owner/repo.git')?.token).toBe('original');
  });
  it('removes the credential file when the final Gitea server is disconnected', () => {
    credentials.savePullRequestCredential('gitea', { serverUrl: 'https://code.example', token: 'secret' });
    credentials.removePullRequestCredential('gitea', 'https://code.example/');
    expect(fs.existsSync(filename())).toBe(false);
  });
});


it('reads the cloud GitLab credential format, replaces it per instance, and refuses a provider collision', () => {
  fs.writeFileSync(filename(), 'encrypted:{"gitlab":{"token":"cloud-token"}}');
  expect(credentials.getPullRequestCredentialStatus()).toMatchObject({ gitlab: true, gitlabServers: ['https://gitlab.com'] });
  expect(credentials.getPullRequestCredential('gitlab')).toEqual({ token: 'cloud-token', serverUrl: 'https://gitlab.com' });
  expect(() => credentials.savePullRequestCredential('gitea', { serverUrl: 'https://gitlab.com', token: 'wrong' })).toThrow('already connected as GitLab');
  credentials.savePullRequestCredential('gitlab', { token: 'replacement' });
  expect(credentials.getPullRequestCredential('gitlab', 'git@gitlab.com:org/repo.git')?.token).toBe('replacement');
  credentials.removePullRequestCredential('gitlab');
  expect(credentials.getPullRequestCredential('gitlab')).toBeNull();
});
it('does not invent a Gitea token before configuration and rejects malformed credential objects', () => {
  expect(credentials.getPullRequestCredential('gitea', 'https://unknown.example/team/repo.git')).toBeNull();
  for (const value of [null, { token: 3 }, { token: 'test', username: 3 }]) {
    expect(() => Reflect.apply(credentials.savePullRequestCredential, undefined, ['gitea', value])).toThrow('valid provider credential');
  }
  expect(() => credentials.removePullRequestCredential('gitea')).toThrow('server URL');
});

it('returns no credential for an empty entry in the encrypted Gitea server map', () => {
  fs.writeFileSync(filename(), 'encrypted:' + JSON.stringify({ giteaServers: { 'https://code.example': null } }));
  expect(credentials.getPullRequestCredential('gitea', 'https://code.example/team/repo.git')).toBeNull();
});
