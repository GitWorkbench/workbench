import { create } from 'zustand';
import { CommitProfile, AiCommitConfig } from '../../shared/types';
import { readAppStorage } from '../lib/appStorage';

export type ThemeId =
  | 'git-workbench-dark'
  | 'catppuccin-mocha'
  | 'tokyo-night'
  | 'midnight-obsidian'
  | 'rose-pine'
  | 'emerald-matrix'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'cyberpunk'
  | 'monokai'
  | 'one-dark'
  | 'solarized-dark'
  | 'light';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  isLight?: boolean;
  colors: {
    base: string;
    panel: string;
    panel2: string;
    panel3: string;
    edge: string;
    fg: string;
    dim: string;
    faint: string;
    accent: string;
    accentHover: string;
    add: string;
    addBg: string;
    del: string;
    delBg: string;
    warn: string;
  };
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'git-workbench-dark': {
    id: 'git-workbench-dark',
    name: 'Git Workbench Dark',
    description: 'Sleek onyx & electric cyan theme inspired by modern dev tools',
    colors: {
      base: '#14171d',
      panel: '#1a1d24',
      panel2: '#222630',
      panel3: '#2a303d',
      edge: '#2d3340',
      fg: '#e2e8f0',
      dim: '#94a3b8',
      faint: '#64748b',
      accent: '#38bdf8',
      accentHover: '#0ea5e9',
      add: '#34d399',
      addBg: '#064e3b4d',
      del: '#f87171',
      delBg: '#7f1d1d4d',
      warn: '#fbbf24'
    }
  },
  'catppuccin-mocha': {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Soothing dark pastel palette with warm lavender and mauve accents',
    colors: {
      base: '#1e1e2e',
      panel: '#181825',
      panel2: '#24273a',
      panel3: '#313244',
      edge: '#45475a',
      fg: '#cdd6f4',
      dim: '#a6adc8',
      faint: '#6c7086',
      accent: '#cba6f7',
      accentHover: '#b4befe',
      add: '#a6e3a1',
      addBg: '#1b3a27',
      del: '#f38ba8',
      delBg: '#4d1d28',
      warn: '#f9e2af'
    }
  },
  'tokyo-night': {
    id: 'tokyo-night',
    name: 'Tokyo Night Storm',
    description: 'Deep navy night palette celebrating the neon lights of downtown Tokyo',
    colors: {
      base: '#1a1b26',
      panel: '#1f2335',
      panel2: '#24283b',
      panel3: '#2f3549',
      edge: '#3b4261',
      fg: '#c0caf5',
      dim: '#9aa5ce',
      faint: '#565f89',
      accent: '#7aa2f7',
      accentHover: '#bb9af7',
      add: '#9ece6a',
      addBg: '#1c3822',
      del: '#f7768e',
      delBg: '#4a1824',
      warn: '#e0af68'
    }
  },
  'midnight-obsidian': {
    id: 'midnight-obsidian',
    name: 'Midnight Obsidian',
    description: 'Deep OLED true-black dark mode with luminous indigo & emerald accents',
    colors: {
      base: '#08090c',
      panel: '#0e1117',
      panel2: '#161b24',
      panel3: '#1f2633',
      edge: '#2d3545',
      fg: '#f1f5f9',
      dim: '#94a3b8',
      faint: '#475569',
      accent: '#6366f1',
      accentHover: '#818cf8',
      add: '#10b981',
      addBg: '#064e3b',
      del: '#f43f5e',
      delBg: '#641322',
      warn: '#f59e0b'
    }
  },
  'rose-pine': {
    id: 'rose-pine',
    name: 'Rosé Pine',
    description: 'Soho dark minimalist palette with dreamy pine, gold and rose hues',
    colors: {
      base: '#191724',
      panel: '#1f1d2e',
      panel2: '#26233a',
      panel3: '#312f44',
      edge: '#403d52',
      fg: '#e0def4',
      dim: '#908caa',
      faint: '#6e6a86',
      accent: '#ebbcba',
      accentHover: '#f6c177',
      add: '#9ccfd8',
      addBg: '#1b3438',
      del: '#eb6f92',
      delBg: '#471827',
      warn: '#f6c177'
    }
  },
  'emerald-matrix': {
    id: 'emerald-matrix',
    name: 'Emerald Matrix',
    description: 'Deep forest carbon with vibrant phosphor green terminal aesthetics',
    colors: {
      base: '#0c1310',
      panel: '#121c17',
      panel2: '#192821',
      panel3: '#22382e',
      edge: '#2d4b3d',
      fg: '#d1fae5',
      dim: '#6ee7b7',
      faint: '#396b54',
      accent: '#10b981',
      accentHover: '#34d399',
      add: '#22c55e',
      addBg: '#0f381e',
      del: '#f87171',
      delBg: '#4a1919',
      warn: '#fbbf24'
    }
  },
  'github-dark': {
    id: 'github-dark',
    name: 'GitHub Dark Dimmed',
    description: 'Subtle slate & blue theme familiar to GitHub users',
    colors: {
      base: '#1c2128',
      panel: '#22272e',
      panel2: '#2d333b',
      panel3: '#373e47',
      edge: '#444c56',
      fg: '#adbac7',
      dim: '#768390',
      faint: '#545d68',
      accent: '#539bf5',
      accentHover: '#4184e4',
      add: '#57ab5a',
      addBg: '#1f3d2b',
      del: '#e5534b',
      delBg: '#461c19',
      warn: '#c69026'
    }
  },
  dracula: {
    id: 'dracula',
    name: 'Dracula',
    description: 'Classic dark vampire theme with vibrant pink & purple accents',
    colors: {
      base: '#1e1f29',
      panel: '#282a36',
      panel2: '#343746',
      panel3: '#44475a',
      edge: '#4d5166',
      fg: '#f8f8f2',
      dim: '#b0b4c8',
      faint: '#6272a4',
      accent: '#bd93f9',
      accentHover: '#a77bee',
      add: '#50fa7b',
      addBg: '#183b26',
      del: '#ff5555',
      delBg: '#4d1c24',
      warn: '#f1fa8c'
    }
  },
  nord: {
    id: 'nord',
    name: 'Nord Arctic',
    description: 'Arctic, north-bluish clean dark palette',
    colors: {
      base: '#242933',
      panel: '#2e3440',
      panel2: '#3b4252',
      panel3: '#434c5e',
      edge: '#4c566a',
      fg: '#eceff4',
      dim: '#d8dee9',
      faint: '#7b88a1',
      accent: '#88c0d0',
      accentHover: '#81a1c1',
      add: '#a3be8c',
      addBg: '#25382b',
      del: '#bf616a',
      delBg: '#42242b',
      warn: '#ebcb8b'
    }
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'High-contrast retro-future dark with glowing neon cyan & hot pink',
    colors: {
      base: '#120e24',
      panel: '#1a1433',
      panel2: '#261c4a',
      panel3: '#362768',
      edge: '#4a358c',
      fg: '#f5eeff',
      dim: '#b8a3e0',
      faint: '#7f66ad',
      accent: '#00f0ff',
      accentHover: '#00cce0',
      add: '#05ffa1',
      addBg: '#053d26',
      del: '#ff2a85',
      delBg: '#4d0b28',
      warn: '#ffe600'
    }
  },
  monokai: {
    id: 'monokai',
    name: 'Monokai Pro',
    description: 'Warm charcoal with cheerful yellow, green, and red highlights',
    colors: {
      base: '#19181a',
      panel: '#221f22',
      panel2: '#2d2a2e',
      panel3: '#3d373f',
      edge: '#49434c',
      fg: '#fcfcfa',
      dim: '#939293',
      faint: '#727072',
      accent: '#ffd866',
      accentHover: '#e6c152',
      add: '#a9dc76',
      addBg: '#23381a',
      del: '#ff6188',
      delBg: '#421822',
      warn: '#fc9867'
    }
  },
  'one-dark': {
    id: 'one-dark',
    name: 'One Dark Pro',
    description: 'Beloved Atom & VS Code dark theme with balanced contrast',
    colors: {
      base: '#1e2227',
      panel: '#21252b',
      panel2: '#282c34',
      panel3: '#323842',
      edge: '#3e4451',
      fg: '#abb2bf',
      dim: '#828997',
      faint: '#5c6370',
      accent: '#61afef',
      accentHover: '#4d98d8',
      add: '#98c379',
      addBg: '#23381e',
      del: '#e06c75',
      delBg: '#3d1f23',
      warn: '#e5c07b'
    }
  },
  'solarized-dark': {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Scientifically crafted teal-tinted low contrast dark palette',
    colors: {
      base: '#00212b',
      panel: '#073642',
      panel2: '#0b4250',
      panel3: '#0f5263',
      edge: '#166276',
      fg: '#93a1a1',
      dim: '#839496',
      faint: '#586e75',
      accent: '#268bd2',
      accentHover: '#1d76b5',
      add: '#859900',
      addBg: '#1b360b',
      del: '#dc322f',
      delBg: '#421616',
      warn: '#b58900'
    }
  },
  light: {
    id: 'light',
    name: 'Clean Studio Light',
    description: 'Crisp, high-readability daylight theme with sharp typography',
    isLight: true,
    colors: {
      base: '#f6f8fa',
      panel: '#ffffff',
      panel2: '#f0f2f5',
      panel3: '#e4e7eb',
      edge: '#d0d7de',
      fg: '#1f2328',
      dim: '#57606a',
      faint: '#8c959f',
      accent: '#0969da',
      accentHover: '#0854ad',
      add: '#1a7f37',
      addBg: '#dafbe1',
      del: '#cf222e',
      delBg: '#ffebe9',
      warn: '#9a6700'
    }
  }
};

export const UI_FONT_PRESETS = [
  { id: 'system', label: 'System Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'Inter', label: 'Inter', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'Outfit', label: 'Outfit', value: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'Roboto', label: 'Roboto', value: '"Roboto", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'Segoe UI', label: 'Segoe UI', value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
  { id: 'Ubuntu', label: 'Ubuntu', value: '"Ubuntu", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'custom', label: 'Custom…', value: 'custom' }
];

export const CODE_FONT_PRESETS = [
  { id: 'JetBrains Mono', label: 'JetBrains Mono', value: '"JetBrains Mono", Menlo, Consolas, monospace' },
  { id: 'Fira Code', label: 'Fira Code', value: '"Fira Code", monospace' },
  { id: 'Menlo', label: 'Menlo', value: 'Menlo, Monaco, Consolas, monospace' },
  { id: 'Consolas', label: 'Consolas', value: 'Consolas, "Liberation Mono", Courier, monospace' },
  { id: 'Source Code Pro', label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { id: 'Inconsolata', label: 'Inconsolata', value: '"Inconsolata", monospace' },
  { id: 'custom', label: 'Custom…', value: 'custom' }
];

export type ToastPosition = 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right';
export type SettingsSection = 'themes' | 'typography' | 'profiles' | 'ai' | 'git' | 'providers' | 'shortcuts' | 'about';

export interface CommitColumnVisibility {
  author: boolean;
  date: boolean;
  sha: boolean;
}

export interface CommitColumnWidths {
  author: number;
  date: number;
  sha: number;
}

export const DEFAULT_COMMIT_COLUMN_WIDTHS: CommitColumnWidths = {
  author: 150,
  date: 200,
  sha: 100
};

export const FONT_SIZE_LIMITS = {
  ui: { min: 11, max: 16, default: 13 },
  code: { min: 10, max: 18, default: 12 },
  home: { min: 11, max: 18, default: 13 },
  guide: { min: 11, max: 20, default: 13 }
} as const;

export type FontSizeScope = keyof typeof FONT_SIZE_LIMITS;

/** Keep persisted values and callers inside the same supported range as the controls. */
export function normalizeFontSize(scope: FontSizeScope, value: unknown): number {
  const limits = FONT_SIZE_LIMITS[scope];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, Math.round(value)))
    : limits.default;
}

function normalizeGraphRowHeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(30, Math.max(22, Math.round(value)))
    : 26;
}

export interface SettingsState {
  isSettingsOpen: boolean;
  settingsSection: SettingsSection;
  theme: ThemeId;
  uiFontSize: number;
  codeFontSize: number;
  homeFontSize: number;
  guideFontSize: number;
  uiFontFamily: string;
  customUiFont: string;
  codeFontFamily: string;
  customCodeFont: string;
  graphRowHeight: number;
  commitColumns: CommitColumnVisibility;
  commitColumnWidths: CommitColumnWidths;
  autoFetch: boolean;
  autoFetchInterval: number; // in seconds
  toastPosition: ToastPosition;

  // Commit Profile
  defaultAuthorName: string;
  defaultAuthorEmail: string;
  signingKey: string;
  commitProfiles: CommitProfile[];
  activeProfileId: string;

  // AI Commit Assistant
  aiCommit: AiCommitConfig;

  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setTheme: (theme: ThemeId) => void;
  setUiFontSize: (size: number) => void;
  setCodeFontSize: (size: number) => void;
  setHomeFontSize: (size: number) => void;
  setGuideFontSize: (size: number) => void;
  setUiFontFamily: (font: string) => void;
  setCustomUiFont: (font: string) => void;
  setCodeFontFamily: (font: string) => void;
  setCustomCodeFont: (font: string) => void;
  setGraphRowHeight: (height: number) => void;
  setCommitColumns: (columns: Partial<CommitColumnVisibility>) => void;
  setCommitColumnWidths: (widths: Partial<CommitColumnWidths>) => void;
  setAutoFetch: (enabled: boolean) => void;
  setAutoFetchInterval: (seconds: number) => void;
  setToastPosition: (pos: 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right') => void;
  setDefaultAuthorName: (name: string) => void;
  setDefaultAuthorEmail: (email: string) => void;
  setSigningKey: (key: string) => void;
  setCommitProfiles: (profiles: CommitProfile[]) => void;
  setActiveProfileId: (id: string) => void;
  setAiCommit: (config: Partial<AiCommitConfig>) => void;
  resetTypography: () => void;
  resetDefaults: () => void;
}

const STORAGE_KEY = 'git-workbench:settings:v1';

const DEFAULT_SETTINGS = {
  theme: 'git-workbench-dark' as ThemeId,
  uiFontSize: FONT_SIZE_LIMITS.ui.default as number,
  codeFontSize: FONT_SIZE_LIMITS.code.default as number,
  homeFontSize: FONT_SIZE_LIMITS.home.default as number,
  guideFontSize: FONT_SIZE_LIMITS.guide.default as number,
  uiFontFamily: 'Inter',
  customUiFont: '',
  codeFontFamily: 'JetBrains Mono',
  customCodeFont: '',
  graphRowHeight: 26,
  commitColumns: { author: true, date: false, sha: true } as CommitColumnVisibility,
  commitColumnWidths: DEFAULT_COMMIT_COLUMN_WIDTHS,
  autoFetch: true,
  autoFetchInterval: 60,
  toastPosition: 'top-center' as 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right',

  defaultAuthorName: '',
  defaultAuthorEmail: '',
  signingKey: '',
  commitProfiles: [
    { id: 'default', name: 'Personal / Default', authorName: '', authorEmail: '', signingKey: '' },
    { id: 'work', name: 'Work', authorName: '', authorEmail: '', signingKey: '' }
  ] as CommitProfile[],
  activeProfileId: 'default',

  aiCommit: {
    provider: 'pollinations' as const,
    model: 'openai',
    apiKey: '',
    endpoint: '',
    promptStyle: 'conventional' as const
  } as AiCommitConfig
};

function isSettingsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStoredSettings(value: unknown): typeof DEFAULT_SETTINGS {
  if (!isSettingsRecord(value)) return DEFAULT_SETTINGS;

  // Persist data fields only: stored JSON must never replace store actions or UI state.
  const parsed = Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS)
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => [key, value[key]])
  ) as Partial<typeof DEFAULT_SETTINGS>;
  const uiFontSize = normalizeFontSize('ui', parsed.uiFontSize);
  const theme = parsed.theme;
  const stringSetting = (key: 'uiFontFamily' | 'customUiFont' | 'codeFontFamily' | 'customCodeFont') =>
    typeof parsed[key] === 'string' ? parsed[key] : DEFAULT_SETTINGS[key];

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    theme: typeof theme === 'string' && Object.prototype.hasOwnProperty.call(THEMES, theme)
      ? theme as ThemeId
      : DEFAULT_SETTINGS.theme,
    uiFontSize,
    codeFontSize: normalizeFontSize('code', parsed.codeFontSize),
    // Existing versions used the UI size for both surfaces. Preserve that appearance
    // once, then keep all four preferences independent after migration.
    homeFontSize: normalizeFontSize('home', Object.prototype.hasOwnProperty.call(value, 'homeFontSize') ? parsed.homeFontSize : uiFontSize),
    guideFontSize: normalizeFontSize('guide', Object.prototype.hasOwnProperty.call(value, 'guideFontSize') ? parsed.guideFontSize : uiFontSize),
    uiFontFamily: stringSetting('uiFontFamily'),
    customUiFont: stringSetting('customUiFont'),
    codeFontFamily: stringSetting('codeFontFamily'),
    customCodeFont: stringSetting('customCodeFont'),
    graphRowHeight: normalizeGraphRowHeight(parsed.graphRowHeight),
    commitColumns: {
      ...DEFAULT_SETTINGS.commitColumns,
      ...(isSettingsRecord(parsed.commitColumns) ? parsed.commitColumns : {})
    },
    commitColumnWidths: {
      ...DEFAULT_COMMIT_COLUMN_WIDTHS,
      ...(isSettingsRecord(parsed.commitColumnWidths) ? parsed.commitColumnWidths : {})
    }
  };
}

function loadStoredSettings(): typeof DEFAULT_SETTINGS {
  try {
    const raw = readAppStorage('settings:v1');
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeStoredSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Partial<typeof DEFAULT_SETTINGS>) {
  try {
    const current = loadStoredSettings();
    const updated = normalizeStoredSettings({ ...current, ...settings });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
}

export function applySettingsToDOM(settings: {
  theme: ThemeId;
  uiFontSize: number;
  codeFontSize: number;
  homeFontSize?: number;
  guideFontSize?: number;
  graphRowHeight?: number;
  uiFontFamily: string;
  customUiFont: string;
  codeFontFamily: string;
  customCodeFont: string;
}) {
  const root = document.documentElement;
  const theme = THEMES[settings.theme] || THEMES['git-workbench-dark'];

  // Apply colors
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--color-${key}`, value);
  }

  // Handle color scheme class
  if (theme.isLight) {
    root.classList.add('light');
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  }

  root.setAttribute('data-theme', theme.id);

  // Typography changes text only. Keep rem-based layout geometry at its CSS base.
  const uiPx = normalizeFontSize('ui', settings.uiFontSize);
  const codePx = normalizeFontSize('code', settings.codeFontSize);
  const homePx = normalizeFontSize('home', settings.homeFontSize ?? uiPx);
  const guidePx = normalizeFontSize('guide', settings.guideFontSize ?? uiPx);

  root.style.setProperty('--font-size-ui', `${uiPx}px`);
  root.style.setProperty('--font-size-base', `${uiPx}px`);
  root.style.setProperty('--font-size-sm', `${Math.max(10, uiPx - 1)}px`);
  root.style.setProperty('--font-size-xs', `${Math.max(9, uiPx - 2)}px`);
  root.style.setProperty('--font-size-code', `${codePx}px`);
  root.style.setProperty('--font-size-home', `${homePx}px`);
  root.style.setProperty('--font-size-guide', `${guidePx}px`);
  root.style.setProperty('--graph-row-height', `${normalizeGraphRowHeight(settings.graphRowHeight)}px`);
  root.style.removeProperty('font-size');

  // UI Font resolution
  let sansFont = settings.uiFontFamily;
  if (sansFont === 'custom' && settings.customUiFont.trim()) {
    sansFont = `"${settings.customUiFont.trim()}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  } else {
    const preset = UI_FONT_PRESETS.find((p) => p.id === sansFont || p.label === sansFont || p.value === sansFont);
    sansFont = preset ? preset.value : (sansFont ? `"${sansFont}", sans-serif` : UI_FONT_PRESETS[1].value);
  }
  root.style.setProperty('--font-sans', sansFont);
  root.style.fontFamily = sansFont;

  // Code Font resolution
  let monoFont = settings.codeFontFamily;
  if (monoFont === 'custom' && settings.customCodeFont.trim()) {
    monoFont = `"${settings.customCodeFont.trim()}", monospace`;
  } else {
    const preset = CODE_FONT_PRESETS.find((p) => p.id === monoFont || p.label === monoFont || p.value === monoFont);
    monoFont = preset ? preset.value : (monoFont ? `"${monoFont}", monospace` : CODE_FONT_PRESETS[0].value);
  }
  root.style.setProperty('--font-mono', monoFont);

  if (typeof document !== 'undefined' && document.body) {
    document.body.style.fontFamily = sansFont;
  }
}

// Initial application on file load
const initial = loadStoredSettings();
// Save normalized v1 data, including legacy settings and independent size migration.
saveSettings(initial);
if (typeof document !== 'undefined') {
  applySettingsToDOM(initial);
}

export const useSettings = create<SettingsState>((set, get) => ({
  isSettingsOpen: false,
  settingsSection: 'themes',
  ...initial,

  openSettings: (section = 'themes') => set({ isSettingsOpen: true, settingsSection: section }),
  closeSettings: () => set({ isSettingsOpen: false }),

  setTheme: (theme: ThemeId) => {
    set({ theme });
    saveSettings({ theme });
    applySettingsToDOM({ ...get(), theme });
  },

  setUiFontSize: (uiFontSize: number) => {
    uiFontSize = normalizeFontSize('ui', uiFontSize);
    set({ uiFontSize });
    saveSettings({ uiFontSize });
    applySettingsToDOM({ ...get(), uiFontSize });
  },

  setCodeFontSize: (codeFontSize: number) => {
    codeFontSize = normalizeFontSize('code', codeFontSize);
    set({ codeFontSize });
    saveSettings({ codeFontSize });
    applySettingsToDOM({ ...get(), codeFontSize });
  },

  setHomeFontSize: (homeFontSize: number) => {
    homeFontSize = normalizeFontSize('home', homeFontSize);
    set({ homeFontSize });
    saveSettings({ homeFontSize });
    applySettingsToDOM({ ...get(), homeFontSize });
  },

  setGuideFontSize: (guideFontSize: number) => {
    guideFontSize = normalizeFontSize('guide', guideFontSize);
    set({ guideFontSize });
    saveSettings({ guideFontSize });
    applySettingsToDOM({ ...get(), guideFontSize });
  },

  setUiFontFamily: (uiFontFamily: string) => {
    set({ uiFontFamily });
    saveSettings({ uiFontFamily });
    applySettingsToDOM({ ...get(), uiFontFamily });
  },

  setCustomUiFont: (customUiFont: string) => {
    set({ customUiFont });
    saveSettings({ customUiFont });
    applySettingsToDOM({ ...get(), customUiFont });
  },

  setCodeFontFamily: (codeFontFamily: string) => {
    set({ codeFontFamily });
    saveSettings({ codeFontFamily });
    applySettingsToDOM({ ...get(), codeFontFamily });
  },

  setCustomCodeFont: (customCodeFont: string) => {
    set({ customCodeFont });
    saveSettings({ customCodeFont });
    applySettingsToDOM({ ...get(), customCodeFont });
  },

  setGraphRowHeight: (graphRowHeight: number) => {
    graphRowHeight = normalizeGraphRowHeight(graphRowHeight);
    set({ graphRowHeight });
    saveSettings({ graphRowHeight });
    applySettingsToDOM({ ...get(), graphRowHeight });
  },

  setCommitColumns: (columns: Partial<CommitColumnVisibility>) => {
    const commitColumns = { ...get().commitColumns, ...columns };
    set({ commitColumns });
    saveSettings({ commitColumns });
  },

  setCommitColumnWidths: (widths: Partial<CommitColumnWidths>) => {
    const commitColumnWidths = { ...get().commitColumnWidths, ...widths };
    set({ commitColumnWidths });
    saveSettings({ commitColumnWidths });
  },

  setAutoFetch: (autoFetch: boolean) => {
    set({ autoFetch });
    saveSettings({ autoFetch });
  },

  setAutoFetchInterval: (autoFetchInterval: number) => {
    set({ autoFetchInterval });
    saveSettings({ autoFetchInterval });
  },

  setToastPosition: (toastPosition: 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right') => {
    set({ toastPosition });
    saveSettings({ toastPosition });
  },

  setDefaultAuthorName: (defaultAuthorName: string) => {
    set({ defaultAuthorName });
    saveSettings({ defaultAuthorName });
  },

  setDefaultAuthorEmail: (defaultAuthorEmail: string) => {
    set({ defaultAuthorEmail });
    saveSettings({ defaultAuthorEmail });
  },

  setSigningKey: (signingKey: string) => {
    set({ signingKey });
    saveSettings({ signingKey });
  },

  setCommitProfiles: (commitProfiles: CommitProfile[]) => {
    set({ commitProfiles });
    saveSettings({ commitProfiles });
  },

  setActiveProfileId: (activeProfileId: string) => {
    set({ activeProfileId });
    saveSettings({ activeProfileId });
  },

  setAiCommit: (patch: Partial<AiCommitConfig>) => {
    const aiCommit = { ...get().aiCommit, ...patch };
    set({ aiCommit });
    saveSettings({ aiCommit });
  },

  resetTypography: () => {
    const typography = {
      uiFontSize: DEFAULT_SETTINGS.uiFontSize,
      codeFontSize: DEFAULT_SETTINGS.codeFontSize,
      homeFontSize: DEFAULT_SETTINGS.homeFontSize,
      guideFontSize: DEFAULT_SETTINGS.guideFontSize,
      uiFontFamily: DEFAULT_SETTINGS.uiFontFamily,
      customUiFont: DEFAULT_SETTINGS.customUiFont,
      codeFontFamily: DEFAULT_SETTINGS.codeFontFamily,
      customCodeFont: DEFAULT_SETTINGS.customCodeFont,
      graphRowHeight: DEFAULT_SETTINGS.graphRowHeight
    };
    set(typography);
    saveSettings(typography);
    applySettingsToDOM(get());
  },

  resetDefaults: () => {
    set(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    applySettingsToDOM(DEFAULT_SETTINGS);
  }
}));
