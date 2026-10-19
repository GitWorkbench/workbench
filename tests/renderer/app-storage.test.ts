// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppStorage } from '../../src/renderer/lib/appStorage';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Git Workbench browser storage', () => {
  it('reads saved preferences from the application namespace', () => {
    for (const suffix of ['settings:v1', 'guide_completed', 'explore-progress:v1', 'diffViewMode']) {
      const value = JSON.stringify({ fixture: suffix });
      localStorage.setItem(`git-workbench:${suffix}`, value);
      expect(readAppStorage(suffix)).toBe(value);
    }
  });

  it('distinguishes an empty value from an absent key', () => {
    localStorage.setItem('git-workbench:guide_completed', '');
    expect(readAppStorage('guide_completed')).toBe('');
    expect(readAppStorage('missing')).toBeNull();
  });

  it('reads preferences without requiring write access', () => {
    localStorage.setItem('git-workbench:diffViewMode', 'split');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(readAppStorage('diffViewMode')).toBe('split');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('continues when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(readAppStorage('settings:v1')).toBeUndefined();
    vi.stubGlobal('localStorage', undefined);
    expect(readAppStorage('settings:v1')).toBeUndefined();
  });

  it('loads saved preferences through the real settings store', async () => {
    vi.resetModules();
    localStorage.setItem('git-workbench:settings:v1', JSON.stringify({ theme: 'git-workbench-dark', uiFontSize: 15, codeFontSize: 17 }));
    const { useSettings } = await import('../../src/renderer/store/settings');
    expect(useSettings.getState()).toMatchObject({ theme: 'git-workbench-dark', uiFontSize: 15, codeFontSize: 17 });
    expect(JSON.parse(localStorage.getItem('git-workbench:settings:v1')!)).toMatchObject({ theme: 'git-workbench-dark', uiFontSize: 15 });
  });
});
