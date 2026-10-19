// @vitest-environment jsdom
import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '../../src/renderer/store/settings';

const storageKey = 'git-workbench:settings:v1';
async function load(saved?: unknown) {
  vi.resetModules();
  if (saved !== undefined) localStorage.setItem(storageKey, typeof saved === 'string' ? saved : JSON.stringify(saved));
  return import('../../src/renderer/store/settings');
}
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  document.documentElement.className = '';
});

describe('settings persistence and normalization', () => {
  it('loads defaults and writes normalized storage without exposing store methods', async () => {
    const { useSettings } = await load();
    expect(useSettings.getState()).toMatchObject({ theme: 'git-workbench-dark', uiFontSize: 13, codeFontSize: 12, homeFontSize: 13, guideFontSize: 13, graphRowHeight: 26 });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).not.toHaveProperty('openSettings');
    expect(document.documentElement).toHaveAttribute('data-theme', 'git-workbench-dark');
  });
  it.each(['broken json', '[]', 'null', 'false', '4'])('recovers from invalid persisted root %s', async saved => {
    const { useSettings } = await load(saved);
    expect(useSettings.getState().uiFontSize).toBe(13);
    expect(useSettings.getState().theme).toBe('git-workbench-dark');
  });
  it('normalizes independent text sizes while merging partial column preferences', async () => {
    const { useSettings } = await load({ theme: 'git-workbench-dark', uiFontSize: 15, commitColumns: { date: true }, commitColumnWidths: { author: 230 }, openSettings: 'injected', isSettingsOpen: true });
    expect(useSettings.getState()).toMatchObject({ theme: 'git-workbench-dark', uiFontSize: 15, homeFontSize: 15, guideFontSize: 15, isSettingsOpen: false,
      commitColumns: { author: true, date: true, sha: true }, commitColumnWidths: { author: 230, date: 200, sha: 100 } });
    expect(useSettings.getState().openSettings).toBeTypeOf('function');
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
  it('normalizes invalid theme, fonts, density and nested objects', async () => {
    const { useSettings } = await load({ theme: 'unknown', uiFontSize: -20, codeFontSize: 100, homeFontSize: null, guideFontSize: 19.7,
      graphRowHeight: 'giant', uiFontFamily: 3, codeFontFamily: false, customUiFont: [], customCodeFont: {}, commitColumns: [], commitColumnWidths: null });
    expect(useSettings.getState()).toMatchObject({ theme: 'git-workbench-dark', uiFontSize: 11, codeFontSize: 18, homeFontSize: 13, guideFontSize: 20,
      graphRowHeight: 26, uiFontFamily: 'Inter', codeFontFamily: 'JetBrains Mono', customUiFont: '', customCodeFont: '',
      commitColumns: { author: true, date: false, sha: true }, commitColumnWidths: { author: 150, date: 200, sha: 100 } });
  });
  it('continues without local storage access or quota', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { useSettings } = await load();
    expect(() => useSettings.getState().setTheme('light')).not.toThrow();
    expect(useSettings.getState().theme).toBe('light');
  });
});

describe('typography normalization and DOM application', () => {
  it('clamps, rounds and defaults each font scope', async () => {
    const { FONT_SIZE_LIMITS, normalizeFontSize } = await load();
    for (const [scope, limits] of Object.entries(FONT_SIZE_LIMITS)) {
      const name = scope as keyof typeof FONT_SIZE_LIMITS;
      expect(normalizeFontSize(name, -100)).toBe(limits.min);
      expect(normalizeFontSize(name, 100)).toBe(limits.max);
      expect(normalizeFontSize(name, limits.min + 0.6)).toBe(limits.min + 1);
      for (const invalid of [undefined, null, '16', NaN, Infinity, -Infinity]) expect(normalizeFontSize(name, invalid)).toBe(limits.default);
    }
  });
  it('applies every palette color and toggles light/dark without scaling root geometry', async () => {
    const { useSettings, THEMES, applySettingsToDOM } = await load();
    for (const theme of Object.values(THEMES)) {
      document.documentElement.style.fontSize = '20px';
      applySettingsToDOM({ ...useSettings.getState(), theme: theme.id });
      for (const [name, color] of Object.entries(theme.colors)) expect(document.documentElement.style.getPropertyValue(`--color-${name}`)).toBe(color);
      expect(document.documentElement).toHaveAttribute('data-theme', theme.id);
      expect(document.documentElement).toHaveClass(theme.isLight ? 'light' : 'dark');
      expect(document.documentElement).not.toHaveClass(theme.isLight ? 'dark' : 'light');
      expect(document.documentElement.style.colorScheme).toBe(theme.isLight ? 'light' : 'dark');
      expect(document.documentElement.style.fontSize).toBe('');
    }
    applySettingsToDOM({ ...useSettings.getState(), theme: 'invalid' as any });
    expect(document.documentElement).toHaveAttribute('data-theme', 'git-workbench-dark');
  });
  it('resolves font presets by identifier, label and full stack, plus custom and unknown fonts', async () => {
    const { useSettings, applySettingsToDOM, UI_FONT_PRESETS, CODE_FONT_PRESETS } = await load();
    for (const preset of UI_FONT_PRESETS.filter(p => p.id !== 'custom')) {
      for (const value of [preset.id, preset.label, preset.value]) {
        applySettingsToDOM({ ...useSettings.getState(), uiFontFamily: value });
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe(preset.value);
      }
    }
    for (const preset of CODE_FONT_PRESETS.filter(p => p.id !== 'custom')) {
      for (const value of [preset.id, preset.label, preset.value]) {
        applySettingsToDOM({ ...useSettings.getState(), codeFontFamily: value });
        expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe(preset.value);
      }
    }
    applySettingsToDOM({ ...useSettings.getState(), uiFontFamily: 'custom', customUiFont: ' My UI ', codeFontFamily: 'custom', customCodeFont: ' My Code ' });
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('"My UI"');
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe('"My Code", monospace');
    applySettingsToDOM({ ...useSettings.getState(), uiFontFamily: 'Unknown', codeFontFamily: 'UnknownCode' });
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Unknown", sans-serif');
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe('"UnknownCode", monospace');
    applySettingsToDOM({ ...useSettings.getState(), uiFontFamily: '', codeFontFamily: '' });
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe(UI_FONT_PRESETS[1].value);
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe(CODE_FONT_PRESETS[0].value);
    expect(document.body.style.fontFamily).toBe(document.documentElement.style.fontFamily);
  });
  it('uses independent font variables and falls back to the UI size for older callers', async () => {
    const { useSettings, applySettingsToDOM } = await load();
    applySettingsToDOM({ ...useSettings.getState(), uiFontSize: 11, codeFontSize: 18, homeFontSize: 17, guideFontSize: 20, graphRowHeight: 500 });
    for (const [key, value] of Object.entries({ ui: '11px', base: '11px', sm: '10px', xs: '9px', code: '18px', home: '17px', guide: '20px' })) expect(document.documentElement.style.getPropertyValue(`--font-size-${key}`)).toBe(value);
    expect(document.documentElement.style.getPropertyValue('--graph-row-height')).toBe('30px');
    applySettingsToDOM({ ...useSettings.getState(), uiFontSize: 16, homeFontSize: undefined, guideFontSize: undefined, graphRowHeight: -5 });
    expect(document.documentElement.style.getPropertyValue('--font-size-home')).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--font-size-guide')).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--graph-row-height')).toBe('22px');
  });
});

describe('settings actions', () => {
  it('opens a requested settings section and closes without persisting transient state', async () => {
    const { useSettings } = await load();
    useSettings.getState().openSettings('providers');
    expect(useSettings.getState()).toMatchObject({ isSettingsOpen: true, settingsSection: 'providers' });
    useSettings.getState().closeSettings();
    expect(useSettings.getState().isSettingsOpen).toBe(false);
    useSettings.getState().openSettings();
    expect(useSettings.getState().settingsSection).toBe('themes');
    expect(JSON.parse(localStorage.getItem(storageKey)!)).not.toHaveProperty('isSettingsOpen');
  });
  it('normalizes independent font and density setters and persists the same values', async () => {
    const { useSettings } = await load();
    const actions = useSettings.getState();
    actions.setUiFontSize(100); actions.setCodeFontSize(-1); actions.setHomeFontSize(17.8); actions.setGuideFontSize(NaN); actions.setGraphRowHeight(22.7);
    expect(useSettings.getState()).toMatchObject({ uiFontSize: 16, codeFontSize: 10, homeFontSize: 18, guideFontSize: 13, graphRowHeight: 23 });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ uiFontSize: 16, codeFontSize: 10, homeFontSize: 18, guideFontSize: 13, graphRowHeight: 23 });
    actions.setGraphRowHeight(Infinity);
    expect(useSettings.getState().graphRowHeight).toBe(26);
  });
  it('persists themes, font families, Git preferences, identity, profiles and AI patches', async () => {
    const { useSettings } = await load();
    const state = useSettings.getState();
    const patches: Array<[keyof SettingsState, unknown]> = [
      ['setTheme', 'light'], ['setUiFontFamily', 'custom'], ['setCustomUiFont', 'Readable'], ['setCodeFontFamily', 'custom'], ['setCustomCodeFont', 'Code'],
      ['setAutoFetch', false], ['setAutoFetchInterval', 120], ['setToastPosition', 'bottom-right'], ['setDefaultAuthorName', 'Alice'], ['setDefaultAuthorEmail', 'alice@example.test'],
      ['setSigningKey', 'ABCDEF'], ['setCommitProfiles', [{ id: 'work', name: 'Work', authorName: 'Alice', authorEmail: 'alice@example.test', signingKey: 'key' }]], ['setActiveProfileId', 'work']
    ];
    for (const [action, value] of patches) (state[action] as (value: unknown) => void)(value);
    state.setAiCommit({ provider: 'ollama', endpoint: 'http://localhost:11434' });
    state.setAiCommit({ promptStyle: 'brief' as any });
    const persisted = JSON.parse(localStorage.getItem(storageKey)!);
    for (const [action, value] of patches) {
      const key = action.slice(3, 4).toLowerCase() + action.slice(4);
      expect(persisted[key]).toEqual(value);
      expect(useSettings.getState()[key as keyof SettingsState]).toEqual(value);
    }
    expect(persisted.aiCommit).toMatchObject({ provider: 'ollama', endpoint: 'http://localhost:11434', promptStyle: 'brief', model: 'openai' });
  });
  it('merges column preferences without discarding other columns', async () => {
    const { useSettings } = await load();
    useSettings.getState().setCommitColumns({ date: true });
    useSettings.getState().setCommitColumnWidths({ sha: 140 });
    expect(useSettings.getState().commitColumns).toEqual({ author: true, date: true, sha: true });
    expect(JSON.parse(localStorage.getItem(storageKey)!).commitColumnWidths).toEqual({ author: 150, date: 200, sha: 140 });
  });
  it('resets typography independently and resets all saved preferences on request', async () => {
    const { useSettings } = await load();
    const state = useSettings.getState();
    state.setTheme('light'); state.setDefaultAuthorName('Alice'); state.setAutoFetch(false);
    state.setUiFontSize(16); state.setCodeFontSize(18); state.setHomeFontSize(18); state.setGuideFontSize(20); state.setGraphRowHeight(30);
    state.setUiFontFamily('custom'); state.setCustomUiFont('One'); state.setCodeFontFamily('custom'); state.setCustomCodeFont('Two');
    state.resetTypography();
    expect(useSettings.getState()).toMatchObject({ theme: 'light', defaultAuthorName: 'Alice', autoFetch: false, uiFontSize: 13, codeFontSize: 12, homeFontSize: 13, guideFontSize: 13, graphRowHeight: 26, uiFontFamily: 'Inter', codeFontFamily: 'JetBrains Mono', customUiFont: '', customCodeFont: '' });
    state.resetDefaults();
    expect(useSettings.getState()).toMatchObject({ theme: 'git-workbench-dark', defaultAuthorName: '', autoFetch: true });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ theme: 'git-workbench-dark', defaultAuthorName: '' });
  });
});
