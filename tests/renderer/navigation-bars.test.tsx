// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {}, settings: Record<string, any> = {};
  const api = Object.fromEntries(['getAppUpdateState', 'checkoutBranch', 'push', 'pull', 'isWindowMaximized', 'onMaximizeChange', 'maximizeWindow', 'minimizeWindow', 'closeWindow'].map(name => [name, vi.fn()]));
  return { app, settings, api, maximizeListener: null as null | ((max: boolean) => void), unsubscribe: vi.fn(),
    useApp: Object.assign((selector?: (state: any) => any) => selector ? selector(app) : app, { getState: () => app }),
    useSettings: (selector: (state: any) => any) => selector(settings) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: mocks.useSettings }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { StatusBar } from '../../src/renderer/components/StatusBar/StatusBar';
import { TabBar } from '../../src/renderer/components/TabBar/TabBar';
import { APP_VERSION } from '../../src/renderer/lib/appVersion';

beforeEach(() => {
  Object.assign(mocks.app, { tabs: [], activeTab: null, homeOpen: true, status: null, stashes: [], log: null, isLoadingMoreCommits: false, terminalDrawerOpen: false,
    branches: { local: [{ fullName: 'main', name: 'main', isCurrent: true }, { fullName: 'feature', name: 'feature', isCurrent: false }], remote: [] },
    runAndRefresh: vi.fn(async (callback: () => any) => callback()), toggleTerminalDrawer: vi.fn(), openCommandPalette: vi.fn(), setActiveTab: vi.fn(), closeTab: vi.fn(), openHome: vi.fn() });
  Object.assign(mocks.settings, { isSettingsOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() });
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.api.getAppUpdateState.mockResolvedValue({ currentVersion: '1.2.3' });
  mocks.api.isWindowMaximized.mockResolvedValue(false);
  mocks.api.onMaximizeChange.mockImplementation(listener => { mocks.maximizeListener = listener; return mocks.unsubscribe; });
});

describe('StatusBar', () => {
  it('shows Home with singular/plural repository counts and the installed version', async () => {
    const { rerender } = render(<StatusBar />);
    expect(screen.getByText('Home')).toBeVisible(); expect(screen.getByText('· 0 repositories open')).toBeVisible();
    await screen.findByText('Git Workbench v1.2.3');
    expect(screen.queryByRole('button', { name: 'Terminal' })).not.toBeInTheDocument();
    mocks.app.tabs = [{ path: '/a' }]; rerender(<StatusBar />);
    expect(screen.getByText('· 1 repository open')).toBeVisible();
    fireEvent.click(screen.getByTitle('Command Palette (Ctrl+K)'));
    expect(mocks.app.openCommandPalette).toHaveBeenCalledOnce();
  });
  it('shows local changes, history count, ahead/behind and explicitly runs push, pull or checkout', async () => {
    Object.assign(mocks.app, { activeTab: '/repo', homeOpen: false, status: { currentBranch: 'main', ahead: 2, behind: 1, staged: [1, 2], unstaged: [1] },
      stashes: [{ index: 0 }], log: { commits: [{}, {}], totalCommits: 1500 }, isLoadingMoreCommits: true, terminalDrawerOpen: true });
    const { container } = render(<StatusBar />);
    expect(screen.getByText('3 changed')).toBeVisible(); expect(screen.getByText('2 of 1,500 commits')).toBeVisible();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Push 2 commit(s)')); fireEvent.click(screen.getByTitle('Pull 1 commit(s)'));
    expect(mocks.api.push).toHaveBeenCalledOnce(); expect(mocks.api.pull).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'main' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'main' })[1]); expect(mocks.api.checkoutBranch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'main' })); fireEvent.click(screen.getByRole('button', { name: 'feature' }));
    expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('feature');
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' })); expect(mocks.app.toggleTerminalDrawer).toHaveBeenCalledOnce();
  });
  it('uses safe empty status fallbacks, disables idle sync and survives unavailable version lookup', async () => {
    Object.assign(mocks.app, { activeTab: '/repo', homeOpen: false });
    mocks.api.getAppUpdateState.mockRejectedValue(new Error('Offline'));
    render(<StatusBar />);
    expect(screen.getByRole('button', { name: '—' })).toBeVisible();
    expect(screen.getByTitle('Push 0 commit(s)')).toBeDisabled(); expect(screen.getByTitle('Pull 0 commit(s)')).toBeDisabled();
    expect(screen.getByText(`Git Workbench v${APP_VERSION}`)).toBeVisible();
    await waitFor(() => expect(mocks.api.getAppUpdateState).toHaveBeenCalledOnce());
  });
  it('ignores an installed-version response after unmount', async () => {
    let resolve!: (value: any) => void;
    mocks.api.getAppUpdateState.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { unmount } = render(<StatusBar />); unmount();
    await act(async () => resolve({ currentVersion: '9.9.9' }));
    expect(screen.queryByText('Git Workbench v9.9.9')).not.toBeInTheDocument();
  });
});

describe('TabBar', () => {
  it('navigates Home and repositories, closes tabs without selecting them and toggles preferences', async () => {
    Object.assign(mocks.app, { tabs: [{ path: '/a', name: 'Repo A' }, { path: '/b', name: 'Repo B' }], activeTab: '/a', homeOpen: false });
    const { rerender, unmount } = render(<TabBar />);
    await waitFor(() => expect(mocks.api.isWindowMaximized).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTitle('/b')); expect(mocks.app.setActiveTab).toHaveBeenCalledWith('/b');
    mocks.app.setActiveTab.mockClear(); fireEvent.click(screen.getByTitle('/a').querySelector('button')!);
    expect(mocks.app.closeTab).toHaveBeenCalledWith('/a'); expect(mocks.app.setActiveTab).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Home', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Open another repository' }));
    expect(mocks.app.openHome).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTitle('Preferences (Ctrl+,)')); expect(mocks.settings.openSettings).toHaveBeenCalledOnce();
    mocks.settings.isSettingsOpen = true; rerender(<TabBar />);
    expect(screen.getByText('Settings')).toBeVisible();
    fireEvent.click(screen.getByTitle('Close settings (Esc)')); fireEvent.click(screen.getByTitle('Preferences (Ctrl+,)'));
    expect(mocks.settings.closeSettings).toHaveBeenCalledTimes(5);
    unmount(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it('responds to window state events and native controls', async () => {
    const { container } = render(<TabBar />);
    await waitFor(() => expect(screen.getByTitle('Maximize')).toBeVisible());
    await act(async () => mocks.maximizeListener!(true));
    fireEvent.click(screen.getByTitle('Restore')); fireEvent.click(screen.getByTitle('Minimize')); fireEvent.click(screen.getByTitle('Close'));
    expect(mocks.api.maximizeWindow).toHaveBeenCalledOnce(); expect(mocks.api.minimizeWindow).toHaveBeenCalledOnce(); expect(mocks.api.closeWindow).toHaveBeenCalledOnce();
    fireEvent.doubleClick(container.firstChild!); expect(mocks.api.maximizeWindow).toHaveBeenCalledTimes(2);
  });
  it('toggles maximize once when the central draggable area is double-clicked', () => {
    const { container } = render(<TabBar />);
    fireEvent.doubleClick(container.querySelector('.min-w-\\[30px\\]')!);
    expect(mocks.api.maximizeWindow).toHaveBeenCalledOnce();
  });
  it('handles unavailable native window methods and unknown maximized state', async () => {
    mocks.api.isWindowMaximized.mockResolvedValue(undefined);
    const maximize = mocks.api.maximizeWindow, subscribe = mocks.api.onMaximizeChange;
    (mocks.api as any).maximizeWindow = undefined; (mocks.api as any).onMaximizeChange = undefined;
    const { container, unmount } = render(<TabBar />);
    fireEvent.doubleClick(container.firstChild!); fireEvent.click(screen.getByTitle('Maximize'));
    await waitFor(() => expect(mocks.api.isWindowMaximized).toHaveBeenCalledOnce()); unmount();
    (mocks.api as any).maximizeWindow = maximize; (mocks.api as any).onMaximizeChange = subscribe;
  });
});
