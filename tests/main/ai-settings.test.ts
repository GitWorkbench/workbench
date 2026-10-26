import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OFFLINE_AI, validateAiPreferences } from '../../src/shared/ai-preferences';
const native = vi.hoisted(() => ({ directory: '', available: true }));
vi.mock('electron', () => ({ app: { getPath: () => native.directory }, safeStorage: {
  isEncryptionAvailable: () => native.available, getSelectedStorageBackend: () => 'keychain',
  encryptString: (value: string) => Buffer.from(value).map(byte => byte ^ 117),
  decryptString: (value: Buffer) => Buffer.from(value).map(byte => byte ^ 117).toString()
} }));
import * as settings from '../../src/main/ai-settings';
import * as ai from '../../src/main/ai';
import { getPullRequestCredential, savePullRequestCredential } from '../../src/main/git/provider-credentials';
const cloud = { ...OFFLINE_AI, provider: 'groq' as const, model: 'example-model' };
const custom = { ...cloud, provider: 'custom' as const, endpoint: 'https://models.example.test/team/v1' };
const metadata = () => path.join(native.directory, 'ai-settings.json');
beforeEach(() => { native.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-ai-settings-')); native.available = true; });
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(native.directory, { recursive: true, force: true }); });

describe('durable encrypted AI preferences', () => {
  it('starts without a key or setup marker and can configure offline mode without a keyring', () => {
    expect(settings.getAiSettings()).toEqual({ config: null, hasApiKey: false });
    expect(settings.getSetupComplete()).toBe(false);
    native.available = false;
    expect(settings.resolveAiSettings()).toEqual({ ...OFFLINE_AI, apiKey: '' });
    expect(settings.saveAiSettings(OFFLINE_AI)).toEqual({ config: OFFLINE_AI, hasApiKey: false });
    settings.completeSetup(); settings.completeSetup(); expect(settings.getSetupComplete()).toBe(true);
  });
  it('keeps keys across module restarts, updates, blank-key saves, and provider switching', async () => {
    savePullRequestCredential('github', { token: 'fake-github-credential' });
    settings.saveAiSettings(cloud, ' fake-first-ai-key ');
    expect(fs.readFileSync(metadata(), 'utf8')).not.toContain('fake-first-ai-key');
    expect(fs.readFileSync(path.join(native.directory, 'hosted-git-credentials.enc'), 'utf8')).not.toContain('fake-first-ai-key');
    settings.saveAiSettings(custom, 'fake-custom-key');
    settings.saveAiSettings({ ...cloud, model: 'new-model' });
    expect(settings.resolveAiSettings(cloud).apiKey).toBe('fake-first-ai-key');
    expect(settings.resolveAiSettings(custom).apiKey).toBe('fake-custom-key');
    expect(settings.getAiSettings(cloud).hasApiKey).toBe(true);
    expect(getPullRequestCredential('github')?.token).toBe('fake-github-credential');
    vi.resetModules(); const updatedApp = await import('../../src/main/ai-settings');
    expect(updatedApp.getAiSettings()).toEqual({ config: { ...cloud, model: 'new-model' }, hasApiKey: true });
    updatedApp.saveAiSettings(cloud, ''); expect(updatedApp.getAiSettings().hasApiKey).toBe(false);
    expect(updatedApp.resolveAiSettings(custom).apiKey).toBe('fake-custom-key');
  });
  it('scopes keys to the exact provider and endpoint, including paths and ports', () => {
    settings.saveAiSettings(custom, 'scoped-key');
    for (const config of [{ ...custom, endpoint: 'https://other.example.test/team/v1' }, { ...custom, endpoint: 'https://models.example.test/other/v1' }, { ...custom, endpoint: 'https://models.example.test:8443/team/v1' }, { ...custom, provider: 'ollama' as const }, cloud]) expect(settings.resolveAiSettings(config).apiKey).toBe('');
    expect(settings.resolveAiSettings({ ...custom, endpoint: custom.endpoint + '/' }).apiKey).toBe('scoped-key');
    expect(settings.resolveAiSettings({ ...custom, apiKey: ' temporary-key ' }).apiKey).toBe('temporary-key');
    expect(settings.resolveAiSettings(OFFLINE_AI).apiKey).toBe('');
  });
  it('imports older credentials once, preserves newer keys and current provider selection', () => {
    settings.saveAiSettings(custom, 'current-custom-key');
    settings.saveAiSettings(cloud, 'old-browser-key', true);
    expect(settings.getAiSettings().config).toEqual(custom);
    expect(settings.resolveAiSettings(cloud).apiKey).toBe('old-browser-key');
    settings.saveAiSettings(cloud, 'obsolete-browser-key', true);
    expect(settings.resolveAiSettings(cloud).apiKey).toBe('old-browser-key');
    fs.unlinkSync(metadata()); settings.saveAiSettings(cloud, 'old-browser-key', true);
    expect(settings.getAiSettings().config).toEqual(cloud);
  });
  it('does not remove keys or overwrite preferences when the keyring or stored metadata fails', () => {
    settings.saveAiSettings(cloud, 'keep-me'); const before = fs.readFileSync(metadata(), 'utf8');
    native.available = false; expect(() => settings.saveAiSettings(custom, 'new-key')).toThrow(/keychain|keyring/);
    expect(fs.readFileSync(metadata(), 'utf8')).toBe(before);
    native.available = true; fs.writeFileSync(metadata(), '{broken'); expect(() => settings.getAiSettings()).toThrow('Your encrypted keys have not been removed');
    expect(settings.resolveAiSettings(cloud).apiKey).toBe('keep-me');
  });
  it.each([null, 5, '\nsecret', 'a\0b', 'x'.repeat(8193)])('rejects invalid secret input without writing: %s', key => {
    expect(() => settings.saveAiSettings(cloud, key)).toThrow('valid API key'); expect(fs.existsSync(metadata())).toBe(false);
  });
  it('rejects keys for offline mode and never passes them to a hosted request', () => {
    expect(() => settings.saveAiSettings(OFFLINE_AI, 'unused')).toThrow('do not use an API key');
    expect(settings.resolveAiSettings({ ...OFFLINE_AI, apiKey: 'unused' }).apiKey).toBe('');
  });
});

describe('AI configuration validation', () => {
  it.each([null, 1, 'bad', {}, { ...cloud, provider: 'unknown' }, { ...cloud, model: 42 }, { ...cloud, model: 'x'.repeat(201) }, { ...cloud, endpoint: 4 }, { ...cloud, endpoint: 'x'.repeat(2049) }, { ...cloud, promptStyle: 'invented' }])('rejects malformed config %j', value => {
    expect(() => validateAiPreferences(value)).toThrow('valid AI settings');
  });
  it('normalizes strings and supports local endpoints while ignoring hosted endpoint overrides', () => {
    expect(validateAiPreferences({ ...cloud, model: ' model ', endpoint: 'https://attacker.example' })).toEqual({ ...cloud, model: 'model' });
    expect(validateAiPreferences({ ...cloud, provider: 'ollama', endpoint: '' }).endpoint).toBe('http://127.0.0.1:11434/v1');
    for (const endpoint of ['http://localhost:11434/v1', 'http://127.0.0.1:9999', 'http://[::1]:9999/v1', 'https://private.example/base/v1/']) expect(validateAiPreferences({ ...custom, endpoint }).endpoint).toBe(endpoint.replace(/\/$/, ''));
  });
  it.each(['', 'invalid', 'file:///etc/passwd', 'http://remote.example/v1', 'https://user:password@example.test/v1', 'https://example.test/v1?token=secret', 'https://example.test/v1#token'])('rejects unsafe endpoint %s', endpoint => {
    expect(() => validateAiPreferences({ ...custom, endpoint })).toThrow(/endpoint|credentials/);
  });
});

describe('main-process AI credential injection', () => {
  it('uses the stored key for commit generation and code explanations without exposing it to the renderer', async () => {
    settings.saveAiSettings(custom, 'only-in-main');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'feat: example output' } }] }) });
    vi.stubGlobal('fetch', fetch);
    expect(await ai.generateCommitMessage({ ...custom, diff: '+example' })).toMatchObject({ ok: true, message: 'feat: example output' });
    expect(await ai.explainCodeChanges('+example')).toMatchObject({ ok: true, explanation: 'feat: example output' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer only-in-main');
    expect(fetch.mock.calls[1][0]).toBe(custom.endpoint + '/chat/completions');
    expect(JSON.stringify(settings.getAiSettings())).not.toContain('only-in-main');
  });
  it('turns credential errors into useful errors and preserves offline generation', async () => {
    settings.saveAiSettings(cloud, 'keep-me'); native.available = false;
    expect(await ai.generateCommitMessage({ ...cloud, diff: '+example' })).toMatchObject({ ok: false, error: expect.stringContaining('keyring') });
    expect(await ai.explainCodeChanges('+example', cloud)).toMatchObject({ ok: false, error: expect.stringContaining('keyring') });
    expect(await ai.generateCommitMessage({ provider: 'local', diff: '+example' })).toMatchObject({ ok: true });
    vi.spyOn(settings, 'resolveAiSettings').mockImplementation(() => { throw 'failure'; });
    expect(await ai.generateCommitMessage({})).toEqual({ ok: false, error: 'Could not load AI credentials.' });
    expect(await ai.explainCodeChanges('example')).toEqual({ ok: false, error: 'Could not load AI credentials.' });
  });
});
