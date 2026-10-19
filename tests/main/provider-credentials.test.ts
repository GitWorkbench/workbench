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
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: false, gitlab: false, bitbucket: false });
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
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: true, gitlab: true, bitbucket: true });
    expect(credentials.getPullRequestCredential('bitbucket')).toEqual({ token: 'bb', username: 'user@example.invalid' });
    credentials.removePullRequestCredential('gitlab');
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: true, gitlab: false, bitbucket: true });
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
    expect(credentials.getPullRequestCredentialStatus()).toEqual({ github: false, gitlab: false, bitbucket: false });
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
