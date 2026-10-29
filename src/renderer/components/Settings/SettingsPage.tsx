import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Palette,
  Type,
  Check,
  RotateCcw,
  Sparkles,
  Sliders,
  Info,
  ChevronRight,
  RefreshCw,
  User,
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ArrowLeft,
  Command,
  FileCode2,
  SlidersHorizontal,
  Bot,
  Download,
  ExternalLink,
  GitPullRequest
} from 'lucide-react';
import {
  useSettings,
  THEMES,
  ThemeId,
  UI_FONT_PRESETS,
  CODE_FONT_PRESETS,
  FONT_SIZE_LIMITS,
  ToastPosition,
  SettingsSection
} from '../../store/settings';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { AppUpdateState, CommitProfile } from '../../../shared/types';
import { AppLogo } from '../Common/AppLogo';
import { APP_VERSION } from '../../lib/appVersion';
import { PullRequestProvidersSettings } from './PullRequestProvidersSettings';
import { TypographySizeControl } from './TypographySizeControl';
import { AboutPage } from './AboutPage';
import { AiSetupForm } from './AiSetupForm';
import { formatReleaseNotes } from '../../lib/releaseNotes';
import './preferences.css';

type SettingsTab = SettingsSection;


export function SettingsPage() {
  const {
    closeSettings,
    settingsSection,
    theme,
    setTheme,
    uiFontSize,
    setUiFontSize,
    codeFontSize,
    setCodeFontSize,
    homeFontSize,
    setHomeFontSize,
    guideFontSize,
    setGuideFontSize,
    uiFontFamily,
    setUiFontFamily,
    customUiFont,
    setCustomUiFont,
    codeFontFamily,
    setCodeFontFamily,
    customCodeFont,
    setCustomCodeFont,
    graphRowHeight,
    setGraphRowHeight,
    autoFetch,
    setAutoFetch,
    autoFetchInterval,
    setAutoFetchInterval,
    defaultAuthorName,
    setDefaultAuthorName,
    defaultAuthorEmail,
    setDefaultAuthorEmail,
    signingKey,
    setSigningKey,
    commitProfiles,
    setCommitProfiles,
    activeProfileId,
    setActiveProfileId,
    resetDefaults,
    resetTypography,
    toastPosition,
    setToastPosition,
    milestoneAnimations,
    setMilestoneAnimations
  } = useSettings();

  const notify = useApp((s) => s.notify);
  const activeRepoPath = useApp((s) => s.activeTab);
  const activeRepoTab = useApp((s) => s.tabs.find((t) => t.path === s.activeTab));

  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsSection);
  const [searchQuery, setSearchQuery] = useState('');

  // Commit profile tab state
  const [configBanner, setConfigBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newProfileModalOpen, setNewProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileAuthor, setNewProfileAuthor] = useState('');
  const [newProfileEmail, setNewProfileEmail] = useState('');
  const [newProfileKey, setNewProfileKey] = useState('');

  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const [updateActionBusy, setUpdateActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = typeof api.onAppUpdateState === 'function'
      ? api.onAppUpdateState((next) => {
          if (active) setUpdateState(next);
        })
      : () => {};

    void api.getAppUpdateState().then((current) => {
      if (active) setUpdateState(current);
    }).catch(() => {});

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Keyboard shortcut listener to close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !newProfileModalOpen) {
        closeSettings();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSettings, newProfileModalOpen]);

  const handleDetectGitConfig = async () => {
    try {
      const res = await api.getGitConfig('global');
      if (res && (res.name || res.email)) {
        if (res.name) setDefaultAuthorName(res.name);
        if (res.email) setDefaultAuthorEmail(res.email);
        setConfigBanner({
          type: 'success',
          message: `Detected git config: ${res.name || 'unnamed'} <${res.email || 'no-email'}>`
        });
      } else {
        setConfigBanner({
          type: 'error',
          message: 'No global user.name or user.email found in Git config'
        });
      }
    } catch (err: any) {
      setConfigBanner({ type: 'error', message: err.message || 'Failed to detect git config' });
    }
  };

  const handleApplyGlobalConfig = async () => {
    try {
      await api.setGitConfig({
        name: defaultAuthorName || undefined,
        email: defaultAuthorEmail || undefined,
        scope: 'global'
      });
      setConfigBanner({ type: 'success', message: 'Applied to ~/.gitconfig (global configuration)' });
    } catch (err: any) {
      setConfigBanner({ type: 'error', message: err.message || 'Failed to save global git config' });
    }
  };

  const handleApplyLocalConfig = async () => {
    const currentRepo = useApp.getState().activeTab;
    if (!currentRepo || currentRepo !== activeRepoPath) return;
    try {
      await api.setGitConfig({
        name: defaultAuthorName || undefined,
        email: defaultAuthorEmail || undefined,
        scope: 'local'
      });
      setConfigBanner({ type: 'success', message: `Applied to local repository: ${activeRepoTab?.name || activeRepoPath}` });
    } catch (err: any) {
      setConfigBanner({ type: 'error', message: err.message || 'Failed to save local git config' });
    }
  };

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    const newId = 'profile-' + Date.now();
    const created: CommitProfile = {
      id: newId,
      name: newProfileName.trim(),
      authorName: newProfileAuthor.trim() || defaultAuthorName,
      authorEmail: newProfileEmail.trim() || defaultAuthorEmail,
      signingKey: newProfileKey.trim() || undefined
    };
    setCommitProfiles([...commitProfiles, created]);
    setActiveProfileId(newId);
    setNewProfileName('');
    setNewProfileAuthor('');
    setNewProfileEmail('');
    setNewProfileKey('');
    setNewProfileModalOpen(false);
  };

  const handleDeleteProfile = (id: string) => {
    const current = useSettings.getState();
    if (current.commitProfiles.length <= 1) return;
    const remaining = current.commitProfiles.filter((p) => p.id !== id);
    setCommitProfiles(remaining);
    if (current.activeProfileId === id) {
      setActiveProfileId(remaining[0].id);
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdateActionBusy(true);
    try {
      setUpdateState(await api.checkForAppUpdates());
    } catch (err: any) {
      setUpdateState((current) => ({
        status: 'error',
        currentVersion: current?.currentVersion || APP_VERSION,
        canInstallInApp: current?.canInstallInApp || false,
        errorStage: 'check',
        error: err?.message || 'Could not check for updates. Check your internet connection and try again.'
      }));
    } finally {
      setUpdateActionBusy(false);
    }
  };

  const handleUpdateAction = async () => {
    if (!updateState) return handleCheckForUpdates();
    setUpdateActionBusy(true);
    try {
      if (updateState.status === 'downloaded' || (updateState.status === 'error' && updateState.errorStage === 'install')) {
        const started = await api.installAppUpdate();
        if (!started) {
          const current = await api.getAppUpdateState();
          setUpdateState(current.status === 'error'
            ? current
            : { ...updateState, status: 'error', errorStage: 'install', error: 'The update could not be started. Retry installation or use View releases to install manually.' });
        }
      } else if (updateState.status === 'available' && updateState.canInstallInApp) {
        setUpdateState(await api.downloadAppUpdate());
      } else if (updateState.status === 'available') {
        await api.openAppReleasePage();
      } else {
        await handleCheckForUpdates();
      }
    } catch (err: any) {
      setUpdateState({
        ...updateState,
        status: 'error',
        errorStage: updateState.status === 'downloaded' || updateState.errorStage === 'install' ? 'install' : 'download',
        error: err?.message || 'The update action failed. Please try again.'
      });
    } finally {
      setUpdateActionBusy(false);
    }
  };

  const handleOpenReleasePage = async () => {
    try {
      await api.openAppReleasePage();
    } catch (err: any) {
      notify('error', err?.message || 'Could not open the Git Workbench release page.');
    }
  };

  const updateStatusText = !updateState
    ? 'Getting update status…'
    : updateState.status === 'checking'
      ? 'Checking for updates…'
      : updateState.status === 'not-available'
        ? `You’re up to date${updateState.currentVersion ? ` (v${updateState.currentVersion})` : ''}.`
        : updateState.status === 'available'
          ? `Version ${updateState.availableVersion || 'new'} is available.`
          : updateState.status === 'downloading'
            ? `Downloading update${typeof updateState.progress === 'number' ? ` · ${Math.floor(updateState.progress)}%` : '…'}`
            : updateState.status === 'downloaded'
              ? `Version ${updateState.availableVersion || ''} is ready to install. Restart Git Workbench to finish.`
              : updateState.status === 'installing'
                ? 'Installing update… Git Workbench will restart when installation succeeds.'
                : updateState.status === 'error'
                  ? updateState.errorStage === 'install'
                    ? 'The update was downloaded, but installation could not finish.'
                    : 'Couldn’t check or download the update. Try again or open the release page.'
                  : updateState.status === 'unsupported'
                    ? updateState.error || 'Update checks are available in an installed build.'
                    : `Current version: v${updateState.currentVersion}`;

  const updateButtonLabel = updateState?.status === 'checking'
    ? 'Checking…'
    : updateState?.status === 'downloading'
      ? `Downloading ${Math.floor(updateState.progress || 0)}%`
      : updateState?.status === 'installing'
        ? 'Installing…'
        : updateActionBusy
          ? 'Please wait…'
          : updateState?.status === 'available'
            ? updateState.canInstallInApp ? 'Download update' : 'View release'
            : updateState?.status === 'downloaded'
              ? 'Restart & install'
              : updateState?.status === 'error' && updateState.errorStage === 'install'
                ? 'Retry installation'
                : 'Check for updates';

  const installedVersion = updateState?.currentVersion || APP_VERSION;
  const formattedReleaseNotes = updateState?.releaseNotes
    ? formatReleaseNotes(updateState.releaseNotes)
    : '';

  const categories = [
    { id: 'themes' as const, label: 'Appearance & Themes', icon: <Palette size={16} />, desc: 'Color palettes, UI accents, celebrations & toast position' },
    { id: 'typography' as const, label: 'Typography & Density', icon: <Type size={16} />, desc: 'Independent text sizes, fonts & graph row density' },
    { id: 'profiles' as const, label: 'Commit Profiles & GPG', icon: <User size={16} />, desc: 'Git credentials, signing keys & identities' },
    { id: 'ai' as const, label: 'AI Assistant', icon: <Sparkles size={16} />, desc: 'Code reviews, commit messages & providers' },
    { id: 'git' as const, label: 'Git & Synchronization', icon: <RefreshCw size={16} />, desc: 'Auto-fetch, focus sync & remotes' },
    { id: 'providers' as const, label: 'Pull Request Providers', icon: <GitPullRequest size={16} />, desc: 'GitHub, GitLab, Bitbucket & Gitea accounts' },
    { id: 'shortcuts' as const, label: 'Keyboard Shortcuts', icon: <Command size={16} />, desc: 'Hotkeys, quick actions & navigation' },
    { id: 'about' as const, label: 'About & Information', icon: <Info size={16} />, desc: 'Version, updates & feature guides' },
  ];

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter(
      (c) => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="preferences-page flex-1 flex flex-col min-h-0 min-w-0 bg-base text-fg overflow-hidden animate-in fade-in duration-200">
      {/* 1. Header Toolbar */}
      <div className="preferences-header border-b border-edge bg-panel2/40 shrink-0 select-none">
        <div className="preferences-heading">
          <button
            onClick={closeSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-dim hover:text-fg hover:bg-panel3 transition-colors border border-edge/60"
            title="Return to Workspace (Esc)"
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
            <kbd className="ml-1 text-[10px] px-1 rounded bg-panel font-mono text-faint">Esc</kbd>
          </button>

          <div className="h-4 w-[1px] bg-edge mx-1" />

          <div className="preferences-breadcrumb flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <SlidersHorizontal size={15} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-fg leading-snug flex flex-wrap items-center gap-1.5">
                Preferences
                <span className="text-dim font-normal text-xs">/</span>
                <span className="text-accent text-xs font-semibold">
                  {categories.find((c) => c.id === activeTab)?.label}
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="preferences-search">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          <input
            type="text"
            placeholder="Search settings..."
            aria-label="Search settings categories"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-panel border border-edge rounded-lg text-fg focus:border-accent focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear settings search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-fg"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Right Actions */}
        <div className="preferences-header-actions flex items-center gap-2">
          <button
            onClick={resetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dim hover:text-del hover:bg-del-bg/20 rounded-lg transition-colors border border-transparent hover:border-del/30"
            title="Reset all settings to initial defaults"
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* 2. Main Body: Left Sidebar + Right Content */}
      <div className="preferences-layout flex-1 flex min-h-0 min-w-0">
        {/* Navigation Sidebar */}
        <nav aria-label="Preferences categories" className="preferences-sidebar border-r border-edge bg-panel2/20 flex flex-col gap-1.5 overflow-y-auto">
          <div className="text-[11px] font-bold uppercase tracking-wider text-dim px-3 py-1 font-mono">
            Categories
          </div>

          {filteredCategories.map((cat) => {
            const isSelected = activeTab === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                aria-current={isSelected ? 'page' : undefined}
                className={`preferences-category group flex items-start gap-3 rounded-xl text-left transition-colors ${
                  isSelected
                    ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
                    : 'text-dim hover:text-fg hover:bg-panel2/70 border border-transparent'
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${isSelected ? 'text-accent' : 'text-dim group-hover:text-fg'}`}>
                  {cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold leading-tight ${isSelected ? 'text-accent' : 'text-fg'}`}>
                    {cat.label}
                  </div>
                  <div className="preferences-category-description text-faint mt-1">
                    {cat.desc}
                  </div>
                </div>
                <ChevronRight size={13} aria-hidden="true" className={`shrink-0 mt-1 text-accent ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
              </button>
            );
          })}

          {!filteredCategories.length && <p className="px-3 py-4 text-xs text-dim leading-relaxed">No matching categories. Try a different search.</p>}

          {/* Bottom Info in Sidebar */}
          <div className="mt-auto pt-4 border-t border-edge/60 px-2 space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-dim font-mono">
              <AppLogo size={14} />
              <span>Git Workbench v{installedVersion}</span>
            </div>
            <p className="text-[10px] text-faint leading-relaxed">
              Preferences are saved automatically.
            </p>
          </div>
        </nav>

        {/* Content Pane */}
        <div className="preferences-content flex-1 overflow-y-auto min-w-0 min-h-0 bg-base">
          <div className="preferences-content-inner space-y-8">
            {/* TAB 1: THEMES & APPEARANCE */}
            {activeTab === 'themes' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-bold text-fg">Appearance &amp; Themes</h2>
                  <p className="text-xs text-dim mt-0.5">
                    Customize color aesthetics, high-contrast modes, and toast notification floating positions.
                  </p>
                </div>

                {/* Theme Cards Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg uppercase tracking-wider font-mono">
                      Color Palettes ({Object.keys(THEMES).length})
                    </span>
                    <span className="text-xs text-faint">Instant switch without reloading</span>
                  </div>

                  <div className="preferences-choice-grid">
                    {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                      const t = THEMES[id];
                      const isSelected = theme === id;
                      return (
                        <div
                          key={id}
                          onClick={() => setTheme(id)}
                          className={`group relative flex flex-col p-3.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-accent bg-panel2 shadow-md ring-1 ring-accent/40'
                              : 'border-edge bg-panel2/60 hover:bg-panel2 hover:border-edge/90'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
                              {t.name}
                              {t.isLight && (
                                <span className="rounded bg-panel3 px-1 py-0.2 text-[9px] text-faint">LIGHT</span>
                              )}
                            </span>
                            {isSelected && (
                              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-dim line-clamp-1 mb-3">{t.description}</p>

                          {/* Theme color preview dots */}
                          <div className="flex items-center gap-1.5 mt-auto pt-1">
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: t.colors.base }}
                              title="Base"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: t.colors.panel }}
                              title="Panel"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: t.colors.accent }}
                              title="Accent"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: t.colors.add }}
                              title="Added / Success"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: t.colors.del }}
                              title="Deleted / Danger"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Toast Notification Position */}
                <div className="pt-6 border-t border-edge space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-fg uppercase tracking-wider font-mono mb-1">
                      Toast Notification Position
                    </h3>
                    <p className="text-xs text-dim">
                      Choose where status messages and action confirmation pills float across your workspace.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        id: 'top-center' as ToastPosition,
                        label: 'Top Center (Recommended)',
                        desc: 'Dynamic Island / Raycast style floating below toolbar'
                      },
                      {
                        id: 'top-right' as ToastPosition,
                        label: 'Top Right',
                        desc: 'Classic desktop notification corner (macOS / GitHub style)'
                      },
                      {
                        id: 'bottom-center' as ToastPosition,
                        label: 'Bottom Center',
                        desc: 'Floating pill centered above the status bar (Linear style)'
                      },
                      {
                        id: 'bottom-right' as ToastPosition,
                        label: 'Bottom Right',
                        desc: 'Docked in bottom-right corner above status bar'
                      }
                    ].map((pos) => {
                      const isSel = (toastPosition || 'top-center') === pos.id;
                      return (
                        <div
                          key={pos.id}
                          onClick={() => {
                            setToastPosition(pos.id);
                            notify('success', `Toast position set to ${pos.label}`);
                          }}
                          className={`group relative flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                            isSel
                              ? 'border-accent bg-panel2 ring-1 ring-accent/30 shadow-xs'
                              : 'border-edge bg-panel2/60 hover:bg-panel2 hover:border-edge/90'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                              isSel ? 'border-accent bg-accent text-white' : 'border-edge bg-panel3'
                            }`}
                          >
                            {isSel && <Check size={10} strokeWidth={3} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-fg mb-0.5">{pos.label}</div>
                            <div className="text-[11px] text-dim leading-snug">{pos.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-edge bg-panel2/50 p-4 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-sky-500" checked={milestoneAnimations} onChange={(event) => setMilestoneAnimations(event.target.checked)} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-fg">Subtle milestone animations</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-dim">Show a brief, low-key animation after a rebase completes or the last conflict is resolved.</span>
                  </span>
                </label>
              </div>
            )}

            {/* TAB 2: TYPOGRAPHY & DENSITY */}
            {activeTab === 'typography' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-fg">Typography &amp; Density</h2>
                    <p className="text-xs text-dim mt-1 leading-relaxed">
                      Adjust each area independently. Text size changes are saved automatically; panel widths and spacing stay the same.
                    </p>
                  </div>
                  <button type="button" onClick={resetTypography} className="btn-secondary text-xs">
                    <RotateCcw size={13} aria-hidden="true" /> Reset typography
                  </button>
                </div>

                {/* UI Font Family */}
                <div className="space-y-3 rounded-xl border border-edge bg-panel2/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-fg block">Interface Font Family</label>
                      <span className="text-xs text-dim">Used by interface, Home, and guide text</span>
                    </div>
                    <select
                      value={(() => {
                        const p = UI_FONT_PRESETS.find(
                          (x) => x.id === uiFontFamily || x.label === uiFontFamily || x.value === uiFontFamily
                        );
                        return p ? p.id : 'Inter';
                      })()}
                      onChange={(e) => setUiFontFamily(e.target.value)}
                      className="text-xs px-3 py-1.5 min-w-48 bg-panel border border-edge rounded-lg text-fg focus:border-accent focus:outline-none"
                    >
                      {UI_FONT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {uiFontFamily === 'custom' && (
                    <div className="pt-2">
                      <input
                        placeholder="Enter custom font name (e.g. Segoe UI, Cantarell, SF Pro)"
                        value={customUiFont}
                        onChange={(e) => setCustomUiFont(e.target.value)}
                        className="w-full text-xs bg-panel border border-edge rounded-lg px-3 py-1.5"
                      />
                    </div>
                  )}
                </div>

                {/* Code / Monospace Font Family */}
                <div className="space-y-3 rounded-xl border border-edge bg-panel2/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-fg block">Code &amp; Monospace Font</label>
                      <span className="text-xs text-dim">Used by code, output, hashes, and branch labels. Text sizes are separate below.</span>
                    </div>
                    <select
                      value={(() => {
                        const p = CODE_FONT_PRESETS.find(
                          (x) => x.id === codeFontFamily || x.label === codeFontFamily || x.value === codeFontFamily
                        );
                        return p ? p.id : 'JetBrains Mono';
                      })()}
                      onChange={(e) => setCodeFontFamily(e.target.value)}
                      className="text-xs px-3 py-1.5 min-w-48 bg-panel border border-edge rounded-lg text-fg focus:border-accent focus:outline-none"
                    >
                      {CODE_FONT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {codeFontFamily === 'custom' && (
                    <div className="pt-2">
                      <input
                        placeholder="Enter custom monospace font name (e.g. Cascadia Code, Menlo, Fira Code)"
                        value={customCodeFont}
                        onChange={(e) => setCustomCodeFont(e.target.value)}
                        className="w-full text-xs bg-panel border border-edge rounded-lg px-3 py-1.5"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <TypographySizeControl
                    id="ui-font-size"
                    label="Interface text"
                    description="Navigation, buttons, tabs, branch names, and commit labels. This changes text size, not layout zoom."
                    value={uiFontSize}
                    onChange={setUiFontSize}
                    min={FONT_SIZE_LIMITS.ui.min}
                    max={FONT_SIZE_LIMITS.ui.max}
                    defaultValue={FONT_SIZE_LIMITS.ui.default}
                    presets={[11, 12, 13, 14, 15, 16]}
                    previewFontVariable="--font-size-ui"
                    preview={(
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="font-medium">Changes</span>
                        <span className="rounded border border-edge bg-panel3 px-2 py-0.5">feature/login</span>
                        <span className="text-dim">3 files staged</span>
                      </div>
                    )}
                  />
                  <TypographySizeControl
                    id="code-font-size"
                    label="Diff & code text"
                    description="Diff lines, code editors, terminal output, and file contents. Branch names and commit hashes keep the interface text size."
                    value={codeFontSize}
                    onChange={setCodeFontSize}
                    min={FONT_SIZE_LIMITS.code.min}
                    max={FONT_SIZE_LIMITS.code.max}
                    defaultValue={FONT_SIZE_LIMITS.code.default}
                    presets={[10, 12, 14, 16, 18]}
                    previewFontVariable="--font-size-code"
                    monospace
                    preview={(
                      <div className="space-y-1 overflow-x-auto whitespace-pre">
                        <div className="text-dim">@@ -1 +1 @@</div>
                        <div className="rounded bg-del-bg text-del px-2">- const ready = false;</div>
                        <div className="rounded bg-add-bg text-add px-2">+ const ready = true;</div>
                      </div>
                    )}
                  />
                  <TypographySizeControl
                    id="home-font-size"
                    label="Home text"
                    description="Repository cards, recent activity, and actions on Home. Repository workspace text uses the interface setting."
                    value={homeFontSize}
                    onChange={setHomeFontSize}
                    min={FONT_SIZE_LIMITS.home.min}
                    max={FONT_SIZE_LIMITS.home.max}
                    defaultValue={FONT_SIZE_LIMITS.home.default}
                    presets={[11, 13, 14, 16, 18]}
                    previewFontVariable="--font-size-home"
                    preview={(
                      <div>
                        <div className="font-semibold">Your repositories</div>
                        <p className="text-dim mt-1">Continue working in Git Workbench or open a recent repository.</p>
                      </div>
                    )}
                  />
                  <TypographySizeControl
                    id="guide-font-size"
                    label="Guide text"
                    description="Explore Git Workbench instructions, guide cards, and reading content. Adjust this separately for comfortable reading."
                    value={guideFontSize}
                    onChange={setGuideFontSize}
                    min={FONT_SIZE_LIMITS.guide.min}
                    max={FONT_SIZE_LIMITS.guide.max}
                    defaultValue={FONT_SIZE_LIMITS.guide.default}
                    presets={[11, 13, 14, 16, 18, 20]}
                    previewFontVariable="--font-size-guide"
                    preview={(
                      <div>
                        <div className="font-semibold">Review your changes</div>
                        <p className="text-dim mt-1">Select a file to review its diff, then stage the changes you want to commit.</p>
                      </div>
                    )}
                  />
                </div>

                {/* Graph Row Height Density */}
                <div className="rounded-xl border border-edge bg-panel2/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold text-fg block">Commit Graph Row Density</span>
                      <span className="text-[11px] text-dim">Adjust vertical row height for commit graph lines</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 bg-panel3 p-1 rounded-lg">
                      {[
                        { label: 'Compact (22px)', val: 22 },
                        { label: 'Normal (26px)', val: 26 },
                        { label: 'Spacious (30px)', val: 30 }
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => setGraphRowHeight(item.val)}
                          aria-pressed={graphRowHeight === item.val}
                          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                            graphRowHeight === item.val
                              ? 'btn-primary font-medium shadow-xs'
                              : 'btn text-dim hover:text-fg'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-edge bg-panel2/50 p-4 text-xs text-dim leading-relaxed">
                  Each preview uses its selected text size. Reset typography restores text sizes, font families, and graph density. Your theme and repository preferences are kept.
                </div>
              </div>
            )}

            {/* TAB 3: PROFILES & GPG */}
            {activeTab === 'profiles' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-bold text-fg">Commit Identity &amp; Profiles</h2>
                  <p className="text-xs text-dim mt-0.5">
                    Configure your default Git author credentials, switchable profiles, and GPG commit signing.
                  </p>
                </div>

                {configBanner && (
                  <div
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs ${
                      configBanner.type === 'success'
                        ? 'bg-add-bg/40 border-add/40 text-add'
                        : 'bg-del-bg/40 border-del/40 text-del'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {configBanner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                      <span>{configBanner.message}</span>
                    </div>
                    <button
                      className="p-1 hover:bg-black/20 rounded"
                      onClick={() => setConfigBanner(null)}
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Default Git Identity */}
                <div className="rounded-xl border border-edge bg-panel2/50 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-fg block">Default Author Identity</span>
                      <span className="text-[11px] text-dim">
                        Used as the default author for new commits when no custom profile is selected
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary !text-xs !py-1.5 flex items-center gap-1.5"
                      onClick={handleDetectGitConfig}
                      title="Read user.name and user.email from your system Git configuration"
                    >
                      <RefreshCw size={12} />
                      <span>Detect from Git</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-[11px] font-medium text-dim block mb-1">Author Name (user.name)</label>
                      <input
                        type="text"
                        value={defaultAuthorName}
                        onChange={(e) => setDefaultAuthorName(e.target.value)}
                        placeholder="e.g. Jane Developer"
                        className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-dim block mb-1">Author Email (user.email)</label>
                      <input
                        type="email"
                        value={defaultAuthorEmail}
                        onChange={(e) => setDefaultAuthorEmail(e.target.value)}
                        placeholder="e.g. jane@example.com"
                        className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-3 py-1.5"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2 border-t border-edge/60">
                    <button
                      type="button"
                      className="btn-secondary !text-xs !py-1.5"
                      onClick={handleApplyGlobalConfig}
                      title="Run git config --global user.name and user.email"
                    >
                      Save to Global (~/.gitconfig)
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !text-xs !py-1.5 disabled:opacity-40"
                      disabled={!activeRepoPath}
                      onClick={handleApplyLocalConfig}
                      title={activeRepoPath ? `Save to ${activeRepoTab?.name || activeRepoPath}/.git/config` : 'Open a repository first'}
                    >
                      Save to Current Repo
                    </button>
                  </div>
                </div>

                {/* Commit Signing Key */}
                <div className="rounded-xl border border-edge bg-panel2/50 p-5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Shield size={15} className="text-accent" />
                    <span className="text-xs font-semibold text-fg">GPG / SSH Commit Signing Key</span>
                  </div>
                  <p className="text-[11px] text-dim">
                    Optional signing key ID or SSH public key file path (e.g. 3AA5C34371567BD2 or ~/.ssh/id_ed25519.pub)
                  </p>
                  <div className="pt-1">
                    <input
                      type="text"
                      value={signingKey}
                      onChange={(e) => setSigningKey(e.target.value)}
                      placeholder="Optional GPG Key ID or ~/.ssh/id_ed25519.pub"
                      className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-3 py-1.5"
                    />
                  </div>
                </div>

                {/* Switchable Commit Profiles */}
                <div className="rounded-xl border border-edge bg-panel2/50 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-fg block">Switchable Commit Profiles</span>
                      <span className="text-[11px] text-dim">
                        Quickly toggle identities (Personal vs Work) right in the commit dock
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary !text-xs !py-1.5 flex items-center gap-1.5"
                      onClick={() => setNewProfileModalOpen(true)}
                    >
                      <Plus size={13} />
                      <span>Add Profile</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {commitProfiles.map((p) => {
                      const isActive = p.id === activeProfileId;
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                            isActive
                              ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                              : 'border-edge/70 bg-panel2/60 hover:bg-panel2'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-fg">{p.name}</span>
                              {isActive && (
                                <span className="rounded bg-accent text-white px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase font-mono">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-dim font-mono">
                              {p.authorName || defaultAuthorName || 'Unnamed'}{' '}
                              &lt;{p.authorEmail || defaultAuthorEmail || 'no-email'}&gt;
                              {p.signingKey && (
                                <span className="ml-2 text-accent text-[10px]">🔑 Signed</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {!isActive && (
                              <button
                                type="button"
                                className="btn-secondary !text-xs !py-1"
                                onClick={() => setActiveProfileId(p.id)}
                              >
                                Set as Active
                              </button>
                            )}
                            {commitProfiles.length > 1 && (
                              <button
                                type="button"
                                className="btn-icon !w-7 !h-7 text-dim hover:text-del hover:bg-del-bg/30 rounded"
                                onClick={() => handleDeleteProfile(p.id)}
                                title="Delete profile"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {newProfileModalOpen && (
                    <form
                      onSubmit={handleAddProfile}
                      className="p-4 rounded-xl border border-accent/40 bg-panel3/70 space-y-3 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg">New Commit Profile</span>
                        <button
                          type="button"
                          className="btn-icon !w-6 !h-6"
                          onClick={() => setNewProfileModalOpen(false)}
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="preferences-choice-grid">
                        <div>
                          <label className="text-[10px] text-dim block mb-1">Profile Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Work / Client"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-2.5 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-dim block mb-1">Author Name</label>
                          <input
                            type="text"
                            placeholder={defaultAuthorName || 'Author Name'}
                            value={newProfileAuthor}
                            onChange={(e) => setNewProfileAuthor(e.target.value)}
                            className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-2.5 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-dim block mb-1">Author Email</label>
                          <input
                            type="email"
                            placeholder={defaultAuthorEmail || 'email@company.com'}
                            value={newProfileEmail}
                            onChange={(e) => setNewProfileEmail(e.target.value)}
                            className="w-full text-xs font-mono bg-panel border border-edge rounded-lg px-2.5 py-1.5"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          className="btn-secondary !text-xs !py-1.5"
                          onClick={() => setNewProfileModalOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn-primary !text-xs !py-1.5"
                        >
                          Save Profile
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* AI credentials are saved by the main process, outside renderer preferences. */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div><h2 className="text-base font-bold text-fg">AI Assistant</h2><p className="text-xs text-dim mt-1">Configure the provider used for commit messages and code reviews.</p></div>
                <AiSetupForm variant="settings" />
              </div>
            )}

            {/* TAB 5: GIT & SYNCHRONIZATION */}
            {activeTab === 'git' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-bold text-fg">Git Remote &amp; Synchronization</h2>
                  <p className="text-xs text-dim mt-0.5">
                    Configure background fetch polling, remote tracking, and window focus synchronization behavior.
                  </p>
                </div>

                {/* Auto Fetch Toggle */}
                <div className="rounded-xl border border-edge bg-panel2/50 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-fg block">Periodic Background Fetch</span>
                      <span className="text-[11px] text-dim">
                        Automatically run git fetch in the background to update incoming/outgoing commits and branch tracking
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoFetch}
                        onChange={(e) => setAutoFetch(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-panel3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                    </label>
                  </div>
                </div>

                {/* Fetch Interval */}
                {autoFetch && (
                  <div className="rounded-xl border border-edge bg-panel2/50 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-fg block">Auto-Fetch Interval</span>
                        <span className="text-[11px] text-dim">How frequently Git Workbench checks remotes for new changes</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-panel3 p-1 rounded-lg">
                        {[
                          { label: '30s', val: 30 },
                          { label: '1m', val: 60 },
                          { label: '2m', val: 120 },
                          { label: '5m', val: 300 },
                          { label: '10m', val: 600 }
                        ].map((item) => (
                          <button
                            key={item.val}
                            onClick={() => setAutoFetchInterval(item.val)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                              autoFetchInterval === item.val
                                ? 'bg-accent text-white font-medium shadow-xs'
                                : 'text-dim hover:text-fg'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Window Focus Sync Information */}
                <div className="rounded-xl border border-edge/80 bg-panel2/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-fg">
                    <Check size={14} className="text-accent" />
                    <span>Focus-Triggered Sync Active</span>
                  </div>
                  <p className="text-[11px] text-dim pl-5 leading-relaxed">
                    Whenever you switch back to Git Workbench from your code editor or browser, a silent fetch runs automatically to ensure your commit graph and ahead/behind badges match remote state.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'providers' && <PullRequestProvidersSettings />}

            {/* TAB 6: KEYBOARD SHORTCUTS */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-bold text-fg">Keyboard Shortcuts &amp; Keymap</h2>
                  <p className="text-xs text-dim mt-0.5">
                    Speed up your Git workflow with built-in desktop hotkeys and command palette launchers.
                  </p>
                </div>

                <div className="rounded-xl border border-edge bg-panel2/40 divide-y divide-edge/60 text-xs overflow-hidden">
                  {[
                    { action: 'Command Palette', desc: 'Fuzzy search commands, branches, tags & commits', keys: 'Ctrl / Cmd + K' },
                    { action: 'Quick Open / Palette', desc: 'Alternate command palette shortcut', keys: 'Ctrl / Cmd + P' },
                    { action: 'Embedded Terminal', desc: 'Toggle bottom terminal runner drawer', keys: 'Ctrl / Cmd + `' },
                    { action: 'Toggle Sidebar', desc: 'Show or hide the repository sidebar', keys: 'Ctrl / Cmd + B' },
                    { action: 'Filter Commits', desc: 'Focus commit graph filter input', keys: 'Ctrl / Cmd + F' },
                    { action: 'Open Preferences / Settings', desc: 'Navigate to this settings page', keys: 'Ctrl / Cmd + ,' },
                    { action: 'Refresh Workspace', desc: 'Reload git status, branches and commit strata', keys: 'Ctrl / Cmd + R' },
                    { action: 'Keyboard Shortcuts Help', desc: 'Open shortcuts cheat sheet modal', keys: '?' },
                    { action: 'Escape / Back', desc: 'Close dialogs, diff viewer or return to repo', keys: 'Esc' },
                  ].map((row, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 hover:bg-panel2/60 transition-colors">
                      <div>
                        <div className="font-semibold text-fg">{row.action}</div>
                        <div className="text-[11px] text-dim mt-0.5">{row.desc}</div>
                      </div>
                      <kbd className="px-2.5 py-1 bg-panel border border-edge rounded-lg font-mono text-[11px] text-accent shadow-xs font-semibold">
                        {row.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 7: ABOUT */}
            {activeTab === 'about' && (
              <AboutPage
                installedVersion={installedVersion}
                onExplore={() => {
                  closeSettings();
                  useApp.getState().openUsageGuide();
                }}
              >
                <div className="about-card space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">Software updates</h3>
                      <p className="text-xs text-dim mt-1">Git Workbench checks for updates at startup. You can also check manually.</p>
                    </div>
                    {updateState?.status === 'available' && (
                      <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold bg-accent/15 text-accent border border-accent/30">
                        Update available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-dim" aria-live="polite">
                    {updateState?.status === 'checking' || updateState?.status === 'downloading' || updateState?.status === 'installing'
                      ? <Loader2 size={13} className="shrink-0 animate-spin text-accent" />
                      : updateState?.status === 'error'
                        ? <AlertCircle size={13} className="shrink-0 text-warn" />
                        : updateState?.status === 'not-available'
                          ? <CheckCircle2 size={13} className="shrink-0 text-accent" />
                          : <Info size={13} className="shrink-0 text-dim" />}
                    <span>{updateStatusText}</span>
                  </div>

                  {updateState?.status === 'error' && updateState.error && (
                    <p className="text-[11px] text-warn break-words">{updateState.error}</p>
                  )}

                  {updateState?.status === 'downloading' && (
                    <div className="h-1.5 rounded-full bg-panel overflow-hidden" role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(updateState.progress || 0)}>
                      <div
                        className="h-full bg-accent transition-all duration-200"
                        style={{ width: `${Math.max(0, Math.min(100, updateState.progress || 0))}%` }}
                      />
                    </div>
                  )}

                  {updateState?.releaseNotes && (
                    <div className="rounded-lg border border-edge/60 bg-base/50 p-3">
                      <div className="text-[11px] font-semibold text-fg mb-1">
                        {updateState.releaseName || `Release ${updateState.availableVersion || ''}`} notes
                      </div>
                      <pre className="text-[11px] text-dim leading-relaxed whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">{formattedReleaseNotes}</pre>
                    </div>
                  )}

                  {updateState?.status === 'downloaded' && updateState.canInstallInApp && (
                    <p className="text-[11px] text-dim">Git Workbench will close and restart. Your repository files are not changed by the update.</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleUpdateAction()}
                      disabled={updateActionBusy || updateState?.status === 'checking' || updateState?.status === 'downloading' || updateState?.status === 'installing'}
                      className="btn btn-primary text-xs font-medium px-3 py-1.5 shadow-xs flex items-center gap-2 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updateState?.status === 'available' && updateState.canInstallInApp
                        ? <Download size={13} />
                        : updateState?.status === 'available'
                          ? <ExternalLink size={13} />
                          : <RefreshCw size={13} />}
                      <span>{updateButtonLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenReleasePage()}
                      className="px-3 py-1.5 rounded-lg border border-edge text-xs text-dim hover:text-fg hover:bg-panel3 transition-colors flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />
                      View releases
                    </button>
                    {updateState?.status === 'downloaded' && updateState.canInstallInApp && (
                      <span className="text-[10px] text-faint">Your system may ask for permission to install this update.</span>
                    )}
                  </div>
                </div>
              </AboutPage>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
