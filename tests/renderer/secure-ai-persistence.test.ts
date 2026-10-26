// @vitest-environment jsdom
import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPreferences } from '../../src/shared/types';
const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), import: vi.fn(), complete: vi.fn() }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { getAiSettings: mock.get, saveAiSettings: mock.save, importAiSettings: mock.import, completeSetup: mock.complete } }));
const storage = 'git-workbench:settings:v1';
const cloud: AiPreferences = { provider: 'groq', model: 'example-model', endpoint: '', promptStyle: 'conventional' };
beforeEach(() => {
  vi.resetModules(); localStorage.clear();
  mock.get.mockReset().mockResolvedValue({ config: null, hasApiKey: false });
  mock.save.mockReset().mockImplementation(async config => ({ config, hasApiKey: true }));
  mock.import.mockReset().mockImplementation(async config => ({ config: { ...config, apiKey: undefined }, hasApiKey: true }));
  mock.complete.mockReset().mockResolvedValue(undefined);
});
const load = () => import('../../src/renderer/store/settings');
describe('credential migration and update recovery', () => {
  it('imports an existing key before deleting the old copy, never placing it in Zustand', async () => {
    localStorage.setItem(storage, JSON.stringify({ theme: 'light', aiCommit: { ...cloud, apiKey: 'old-test-key' } }));
    const { useSettings } = await load();
    expect(useSettings.getState().aiCommit.apiKey).toBe('');
    expect(localStorage.getItem(storage)).toContain('old-test-key');
    await useSettings.getState().initializeAiSettings();
    expect(mock.import).toHaveBeenCalledWith(expect.objectContaining(cloud), 'old-test-key');
    expect(localStorage.getItem(storage)).not.toContain('old-test-key');
    expect(useSettings.getState()).toMatchObject({ aiHasApiKey: true, theme: 'light', aiCommit: { ...cloud, apiKey: '' } });
  });
  it('preserves the old key on failed import and persists pending preferences when retry succeeds', async () => {
    localStorage.setItem(storage, JSON.stringify({ aiCommit: { ...cloud, apiKey: 'preserve-me' } }));
    mock.import.mockRejectedValueOnce(new Error('keyring locked')).mockRejectedValueOnce(new Error('still locked'));
    const { useSettings } = await load(); const state = useSettings.getState();
    await state.initializeAiSettings(); expect(useSettings.getState().aiSettingsError).toContain('previous key is preserved');
    state.setTheme('light'); expect(localStorage.getItem(storage)).toContain('preserve-me');
    await expect(state.saveAiPreferences(cloud, 'replacement')).rejects.toThrow('Unlock your system keyring');
    expect(mock.save).not.toHaveBeenCalled();
    await state.initializeAiSettings(); expect(useSettings.getState().aiSettingsError).toBeNull();
    expect(JSON.parse(localStorage.getItem(storage)!)).toMatchObject({ theme: 'light', aiCommit: { apiKey: '' } });
  });
  it('restores the provider and saved-key indicator after renderer preferences are lost during an update', async () => {
    mock.get.mockResolvedValue({ config: cloud, hasApiKey: true });
    const { useSettings } = await load(); await useSettings.getState().initializeAiSettings();
    expect(useSettings.getState()).toMatchObject({ aiCommit: { ...cloud, apiKey: '' }, aiHasApiKey: true });
    useSettings.getState().resetDefaults(); expect(useSettings.getState().aiCommit.provider).toBe('groq');
    localStorage.clear(); vi.resetModules(); const upgraded = await load(); await upgraded.useSettings.getState().initializeAiSettings();
    expect(upgraded.useSettings.getState()).toMatchObject({ aiHasApiKey: true, aiCommit: { ...cloud, apiKey: '' } });
    expect(mock.import).not.toHaveBeenCalled();
  });
  it('keeps the key when saving nonsecret preferences and clears the draft key after explicit saving', async () => {
    const { useSettings } = await load();
    useSettings.getState().setAiCommit({ provider: 'groq', apiKey: 'never-persist-this' });
    expect(localStorage.getItem(storage)).not.toContain('never-persist-this');
    await useSettings.getState().saveAiPreferences(cloud);
    expect(mock.save).toHaveBeenCalledWith(cloud, undefined);
    expect(useSettings.getState().aiHasApiKey).toBe(true);
    await useSettings.getState().saveAiPreferences(cloud, 'new-secret');
    expect(mock.save).toHaveBeenLastCalledWith(cloud, 'new-secret');
    expect(localStorage.getItem(storage)).not.toContain('new-secret');
    mock.save.mockRejectedValueOnce(new Error('disk full'));
    await expect(useSettings.getState().saveAiPreferences({ ...cloud, model: 'different' })).rejects.toThrow('disk full');
    expect(useSettings.getState().aiCommit.model).toBe('example-model');
  });
  it('imports legacy state before an explicit save and does not wipe it when secure storage is unavailable', async () => {
    localStorage.setItem(storage, JSON.stringify({ aiCommit: { ...cloud, apiKey: 'original' } }));
    const { useSettings } = await load(); await useSettings.getState().saveAiPreferences(cloud, 'replacement');
    expect(mock.import).toHaveBeenCalledOnce(); expect(mock.save).toHaveBeenCalledWith(cloud, 'replacement');
  });
  it('marks existing installations complete and persists fresh completion without resetting it with preferences', async () => {
    localStorage.setItem(storage, JSON.stringify({ theme: 'light' })); const existing = await load(); expect(existing.useSettings.getState().setupCompleted).toBe(true);
    localStorage.clear(); vi.resetModules(); const fresh = await load(); expect(fresh.useSettings.getState().setupCompleted).toBe(false);
    mock.complete.mockRejectedValueOnce(new Error('read only')); await expect(fresh.useSettings.getState().finishSetup()).rejects.toThrow('read only'); expect(fresh.useSettings.getState().setupCompleted).toBe(false);
    await fresh.useSettings.getState().finishSetup(); fresh.useSettings.getState().resetDefaults();
    expect(fresh.useSettings.getState().setupCompleted).toBe(true); expect(JSON.parse(localStorage.getItem(storage)!).setupCompleted).toBe(true);
  });
});
