// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ app: {} as Record<string, any>, settings: {} as Record<string, any>, fetch: vi.fn(), setState: vi.fn() }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: any) => any) => select(mock.app), { getState: () => mock.app, setState: mock.setState }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: Object.assign((select: (state: any) => any) => select(mock.settings), { getState: () => mock.settings }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { fetch: mock.fetch } }));

// App tests exercise orchestration. Each child has its own interaction suite.
const children = [
  ['TabBar', 'TabBar'], ['Toolbar', 'Toolbar'], ['Sidebar', 'Sidebar'], ['CommitGraph', 'CommitGraph'],
  ['CommitDetailPanel', 'CommitDetailPanel'], ['DiffViewer', 'DiffViewer'], ['StatusBar', 'StatusBar'], ['Home', 'Home'],
  ['Repository', 'LfsManagerModal'], ['Repository', 'SparseCheckoutModal'], ['Settings', 'SettingsPage'],
  ['Loading', 'AppLoadingScreen'], ['Loading', 'RepoOpeningAnimation'],
  ['ConflictResolver', 'ConflictBanner'], ['ConflictResolver', 'ConflictResolverModal'], ['ConflictResolver', 'ResolutionMemoryModal'],
  ['ConflictResolver', 'MergeSimulationModal'], ['Rebase', 'InteractiveRebaseModal'], ['Rebase', 'RangeComparisonModal'],
  ['Rebase', 'CommitSplitModal'], ['Rebase', 'BranchStackModal'], ['Sidebar', 'CreateTagModal'], ['Sidebar', 'AddRemoteModal'],
  ['Repository', 'CreateRepoModal'], ['CommandPalette', 'CommandPalette'], ['TerminalDrawer', 'TerminalDrawer'],
  ['Help', 'ShortcutsModal'], ['Help', 'UsageGuideModal'], ['GitFlow', 'GitFlowModal'], ['Bisect', 'BisectModal'],
  ['Reflog', 'ReflogModal'], ['Reflog', 'RestorePointsModal'], ['Changelog', 'ChangelogModal'], ['Worktrees', 'WorktreesModal'],
  ['PullRequests', 'PullRequestsModal'], ['Common', 'ToastContainer'], ['Updates', 'AppUpdateNotice']
];
let App: typeof import('../../src/renderer/App').App;
beforeAll(async () => {
  for (const [directory, name] of children) {
    vi.doMock(`../../src/renderer/components/${directory}/${name}`, () => ({ [name]: ({ isReady, ready, onClose }: any) => <div data-testid={name} data-ready={String(ready ?? isReady)}>
      {name === 'Home' && <input aria-label="Search repositories" />}
      {name === 'CommitGraph' && <input placeholder="Filter commits" />}
      {onClose && <button onClick={onClose}>Close {name}</button>}
    </div> }));
  }
  App = (await import('../../src/renderer/App')).App;
});
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  Object.keys(mock.app).forEach(key => delete mock.app[key]); Object.keys(mock.settings).forEach(key => delete mock.settings[key]);
  Object.assign(mock.app, { activeTab: '/repo', homeOpen: false, usageGuideOpen: false, gitFlowModalOpen: false });
  for (const name of ['init', 'openUsageGuide', 'closeUsageGuide', 'closeGitFlowModal', 'refresh', 'openHome', 'toggleCommandPalette', 'toggleTerminalDrawer', 'toggleSidebar', 'toggleShortcutsModal', 'closeCommandPalette', 'closeDiff']) mock.app[name] = vi.fn().mockResolvedValue(undefined);
  Object.assign(mock.settings, { isSettingsOpen: false, autoFetch: false, autoFetchInterval: 60, closeSettings: vi.fn(), openSettings: vi.fn() });
  mock.fetch.mockReset().mockResolvedValue({ ok: true }); mock.setState.mockReset().mockImplementation(patch => Object.assign(mock.app, patch));
});
afterEach(() => vi.clearAllTimers());
const settle = () => act(async () => { await Promise.resolve(); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const finishStartup = async () => { await advance(2400); await advance(450); };
const key = (value: string, patch: Record<string, unknown> = {}) => fireEvent.keyDown(window, { key: value, ...patch });

describe('application composition and startup', () => {
  it('keeps the update notice available on Settings after startup, deferring it for active dialogs', async () => {
    mock.settings.isSettingsOpen = true; const { rerender } = render(<App />); await finishStartup();
    expect(screen.getByTestId('AppUpdateNotice')).toHaveAttribute('data-ready', 'true');
    mock.app.conflictedFileToResolve = 'conflict.txt'; rerender(<App />); expect(screen.getByTestId('AppUpdateNotice')).toHaveAttribute('data-ready', 'false');
    mock.app.conflictedFileToResolve = null; rerender(<App />); expect(screen.getByTestId('AppUpdateNotice')).toHaveAttribute('data-ready', 'true');
  });
  it('initializes once, shows the repository workspace, and waits for minimum startup time', async () => {
    const { rerender } = render(<App />); await settle(); expect(mock.app.init).toHaveBeenCalledOnce();
    for (const name of ['TabBar', 'Toolbar', 'Sidebar', 'CommitGraph', 'CommitDetailPanel', 'DiffViewer', 'StatusBar', 'TerminalDrawer']) expect(screen.getByTestId(name)).toBeInTheDocument();
    expect(screen.queryByTestId('Home')).not.toBeInTheDocument(); expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'false');
    await advance(2399); expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'false');
    await advance(1); expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'true');
    rerender(<App />); expect(mock.app.init).toHaveBeenCalledOnce();
  });
  it.each(['home', 'no repository', 'settings'])('chooses the %s view without mounting a repository workspace', async mode => {
    if (mode === 'home') mock.app.homeOpen = true;
    if (mode === 'no repository') mock.app.activeTab = null;
    if (mode === 'settings') mock.settings.isSettingsOpen = true;
    render(<App />); await settle();
    expect(screen.getByTestId(mode === 'settings' ? 'SettingsPage' : 'Home')).toBeInTheDocument(); expect(screen.queryByTestId('Sidebar')).not.toBeInTheDocument();
  });
  it('shows optional guide and Git Flow dialogs and delegates close actions', async () => {
    mock.app.usageGuideOpen = true; mock.app.gitFlowModalOpen = true; render(<App />); await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Close UsageGuideModal' })); expect(mock.app.closeUsageGuide).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close GitFlowModal' })); expect(mock.app.closeGitFlowModal).toHaveBeenCalledOnce();
  });
  it('finishes promptly when initialization itself takes longer than the animation', async () => {
    let done!: () => void; mock.app.init.mockReturnValue(new Promise<void>(resolve => { done = resolve; }));
    render(<App />); await advance(3000); expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'false');
    await act(async () => done()); await advance(0); expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'true');
  });
  it('cancels readiness timers on unmount, including a still-pending initialization', async () => {
    const first = render(<App />); await settle(); first.unmount(); expect(vi.getTimerCount()).toBe(0);
    let done!: () => void; mock.app.init.mockReturnValue(new Promise<void>(resolve => { done = resolve; }));
    const second = render(<App />); second.unmount(); await act(async () => done()); expect(vi.getTimerCount()).toBe(0);
  });
  it('lets the loading screen finish if store initialization rejects', async () => {
    mock.app.init.mockRejectedValue(new Error('initialization already reported by store'));
    render(<App />); await settle(); await advance(2400);
    expect(screen.getByTestId('AppLoadingScreen')).toHaveAttribute('data-ready', 'true');
  });
});

describe('first-launch guide', () => {
  it('opens after readiness but respects completion saved before the delayed prompt', async () => {
    const first = render(<App />); await settle(); await finishStartup(); expect(mock.app.openUsageGuide).toHaveBeenCalledOnce(); first.unmount();
    mock.app.openUsageGuide.mockClear(); const second = render(<App />); await settle(); await advance(2400);
    localStorage.setItem('git-workbench:guide_completed', 'true'); await advance(450); expect(mock.app.openUsageGuide).not.toHaveBeenCalled(); second.unmount();
    render(<App />); await settle(); await finishStartup(); expect(mock.app.openUsageGuide).not.toHaveBeenCalled();
  });
  it.each(['usageGuideOpen', 'conflictedFileToResolve', 'rebaseModalBaseCommit', 'createRepoModalOpen', 'commandPaletteOpen', 'pullRequestsModalOpen', 'commitSplitOpen', 'branchStackOpen', 'restorePointsOpen',
    'resolutionMemoryOpen', 'rangeComparisonOpen', 'lfsManagerOpen', 'sparseCheckoutOpen', 'gitFlowModalOpen', 'bisectModalOpen', 'reflogModalOpen', 'changelogModalOpen', 'worktreesModalOpen', 'simulateMergeBranch', 'tagModalCommit', 'addRemoteModalOpen', 'shortcutsModalOpen', 'isOpeningRepo'])('does not cover the active %s workflow', async field => {
    mock.app[field] = true; render(<App />); await settle(); await finishStartup(); expect(mock.app.openUsageGuide).not.toHaveBeenCalled();
  });
  it('leaves active settings alone and survives unavailable storage', async () => {
    mock.settings.isSettingsOpen = true; const first = render(<App />); await settle(); await finishStartup(); expect(mock.app.openUsageGuide).not.toHaveBeenCalled(); first.unmount();
    mock.settings.isSettingsOpen = false; vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    render(<App />); await settle(); await finishStartup(); expect(mock.app.openUsageGuide).not.toHaveBeenCalled();
  });
  it('does not crash if storage becomes unavailable only after the prompt is scheduled', async () => {
    render(<App />); await settle(); await advance(2400);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    await advance(450); expect(mock.app.openUsageGuide).not.toHaveBeenCalled();
  });
});

describe('silent background fetching', () => {
  it('runs an initial and periodic fetch and refreshes only successful responses', async () => {
    mock.settings.autoFetch = true; mock.settings.autoFetchInterval = 1;
    render(<App />); await settle(); await advance(2499); expect(mock.fetch).not.toHaveBeenCalled();
    await advance(1); expect(mock.fetch).toHaveBeenCalledOnce(); expect(mock.app.refresh).toHaveBeenCalledOnce();
    mock.fetch.mockResolvedValueOnce({ ok: false }); await advance(7500); expect(mock.fetch).toHaveBeenCalledTimes(2); expect(mock.app.refresh).toHaveBeenCalledOnce();
    mock.fetch.mockResolvedValueOnce(null); await advance(10000); expect(mock.app.refresh).toHaveBeenCalledOnce();
    mock.fetch.mockRejectedValueOnce(new Error('offline')); await advance(10000); expect(mock.app.refresh).toHaveBeenCalledOnce();
  });
  it('deduplicates in-flight focus fetches and cleans up every timer/listener on unmount', async () => {
    mock.settings.autoFetch = true; let done!: (result: unknown) => void;
    mock.fetch.mockReturnValue(new Promise(resolve => { done = resolve; }));
    const { unmount } = render(<App />); await settle(); fireEvent.focus(window); fireEvent.focus(window); expect(mock.fetch).toHaveBeenCalledOnce();
    await act(async () => done({ ok: true })); expect(mock.app.refresh).toHaveBeenCalledOnce();
    unmount(); await advance(100000); fireEvent.focus(window); expect(mock.fetch).toHaveBeenCalledOnce();
  });
  it('skips hidden windows and missing active repos, and uses the default interval', async () => {
    mock.settings.autoFetch = true; mock.settings.autoFetchInterval = 0;
    localStorage.setItem('git-workbench:guide_completed', 'true');
    render(<App />); await settle(); await advance(2500); mock.fetch.mockClear(); mock.app.refresh.mockClear();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); fireEvent.focus(window); fireEvent(document, new Event('visibilitychange')); expect(mock.fetch).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible'); mock.app.activeTab = null; fireEvent.focus(window); expect(mock.fetch).not.toHaveBeenCalled();
    mock.app.activeTab = '/repo'; fireEvent(document, new Event('visibilitychange')); await settle(); expect(mock.fetch).toHaveBeenCalledOnce();
    await advance(57499); expect(mock.fetch).toHaveBeenCalledOnce(); await advance(1); expect(mock.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not register background fetches in Home without a repo or when disabled', async () => {
    mock.app.activeTab = null; mock.settings.autoFetch = true; const first = render(<App />); await settle(); await advance(60000); fireEvent.focus(window); expect(mock.fetch).not.toHaveBeenCalled(); first.unmount();
    mock.app.activeTab = '/repo'; mock.settings.autoFetch = false; render(<App />); await settle(); await advance(60000); expect(mock.fetch).not.toHaveBeenCalled();
  });
});

describe('global keyboard shortcuts', () => {
  it.each([['t', 'openHome'], ['k', 'toggleCommandPalette'], ['p', 'toggleCommandPalette'], ['`', 'toggleTerminalDrawer'], ['~', 'toggleTerminalDrawer'], ['b', 'toggleSidebar']])('routes Ctrl/Cmd+%s to %s', async (value, action) => {
    render(<App />); await settle(); key(value, { ctrlKey: true }); key(value, { metaKey: true }); expect(mock.app[action]).toHaveBeenCalledTimes(2);
  });
  it('opens/closes settings, focuses the appropriate search, and handles absent search inputs', async () => {
    const { rerender } = render(<App />); await settle(); key(',', { ctrlKey: true }); expect(mock.settings.openSettings).toHaveBeenCalledOnce();
    mock.settings.isSettingsOpen = true; key(',', { metaKey: true }); expect(mock.settings.closeSettings).toHaveBeenCalledOnce();
    mock.settings.isSettingsOpen = false; key('f', { ctrlKey: true }); expect(screen.getByPlaceholderText('Filter commits')).toHaveFocus();
    mock.app.homeOpen = true; rerender(<App />); key('f', { metaKey: true }); expect(screen.getByLabelText('Search repositories')).toHaveFocus();
    mock.app.homeOpen = false; mock.app.activeTab = null; rerender(<App />); key('f', { ctrlKey: true }); expect(screen.getByLabelText('Search repositories')).toHaveFocus();
    mock.settings.isSettingsOpen = true; rerender(<App />); expect(() => key('f', { ctrlKey: true })).not.toThrow();
  });
  it('leaves prevented events, the guide, and the merge editor in control of their own shortcuts', async () => {
    render(<App />); await settle(); const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }); event.preventDefault(); window.dispatchEvent(event);
    mock.app.usageGuideOpen = true; key('k', { ctrlKey: true }); mock.app.usageGuideOpen = false; mock.app.conflictedFileToResolve = 'file'; key('k', { ctrlKey: true });
    expect(mock.app.toggleCommandPalette).not.toHaveBeenCalled();
  });
  it('opens shortcut help outside text inputs and closes the highest-priority Escape target', async () => {
    render(<App />); await settle(); key('?'); expect(mock.app.toggleShortcutsModal).toHaveBeenCalledOnce();
    const input = screen.getByPlaceholderText('Filter commits'); fireEvent.keyDown(input, { key: '?' }); expect(mock.app.toggleShortcutsModal).toHaveBeenCalledOnce();
    mock.settings.isSettingsOpen = true; key('Escape'); expect(mock.settings.closeSettings).toHaveBeenCalledOnce();
    mock.settings.isSettingsOpen = false; mock.app.shortcutsModalOpen = true; key('Escape'); expect(mock.setState).toHaveBeenCalledWith({ shortcutsModalOpen: false });
    mock.app.commandPaletteOpen = true; key('Escape'); expect(mock.app.closeCommandPalette).toHaveBeenCalledOnce();
    mock.app.commandPaletteOpen = false; mock.app.openDiff = {}; key('Escape'); expect(mock.app.closeDiff).toHaveBeenCalledOnce();
    mock.app.openDiff = null; key('Escape'); key('x'); expect(mock.app.closeDiff).toHaveBeenCalledOnce();
  });
});
