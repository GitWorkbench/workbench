// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  const settings: Record<string, any> = {};
  return {
    app, settings,
    useApp: Object.assign((selector: (state: any) => any) => selector(app), { setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    useSettings: (selector: (state: any) => any) => selector(settings)
  };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: mocks.useSettings }));
import { ConflictBanner } from '../../src/renderer/components/ConflictResolver/ConflictBanner';
import { ToastContainer } from '../../src/renderer/components/Common/ToastContainer';
import { AppLoadingScreen } from '../../src/renderer/components/Loading/AppLoadingScreen';
import { RepoOpeningAnimation } from '../../src/renderer/components/Loading/RepoOpeningAnimation';
import { ShortcutsModal } from '../../src/renderer/components/Help/ShortcutsModal';

beforeEach(() => {
  for (const key of Object.keys(mocks.app)) delete mocks.app[key];
  Object.assign(mocks.app, { operationState: null, toasts: [], isOpeningRepo: false, openingRepoName: '', shortcutsModalOpen: false,
    openConflictResolver: vi.fn(), abortRepoOperation: vi.fn(), continueRepoOperation: vi.fn(), dismissToast: vi.fn() });
  mocks.settings.toastPosition = 'top-center';
  mocks.useApp.setState.mockClear();
});

describe('ConflictBanner', () => {
  it('stays hidden without an operation', () => {
    const { container, rerender } = render(<ConflictBanner />);
    expect(container).toBeEmptyDOMElement();
    mocks.app.operationState = { inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: [] };
    rerender(<ConflictBanner />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each(['Merge', 'Rebase', 'Cherry-Pick'])('renders resolved %s and explicitly continues or aborts', name => {
    mocks.app.operationState = { inMerge: name === 'Merge', inRebase: name === 'Rebase', inCherryPick: name === 'Cherry-Pick', conflictedFiles: [] };
    render(<ConflictBanner />);
    const proceed = screen.getByRole('button', { name: `Continue ${name}` });
    expect(proceed).toHaveClass('btn-primary');
    fireEvent.click(proceed);
    expect(mocks.app.continueRepoOperation).toHaveBeenCalledOnce();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }));
    expect(confirm).toHaveBeenCalledWith(`Abort this ${name.toLowerCase()}? Working directory will be restored.`);
    expect(mocks.app.abortRepoOperation).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }));
    expect(mocks.app.abortRepoOperation).toHaveBeenCalledOnce();
  });
  it('opens each conflicted path, handles singular/plural and withholds continue', () => {
    mocks.app.operationState = { inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: ['src/a.ts'] };
    const { rerender } = render(<ConflictBanner />);
    expect(screen.getByText('1 conflicted file')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'a.ts' }));
    expect(mocks.app.openConflictResolver).toHaveBeenCalledWith('src/a.ts');
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument();
    mocks.app.operationState.conflictedFiles.push('src/b.ts');
    rerender(<ConflictBanner />);
    expect(screen.getByText('2 conflicted files')).toBeVisible();
  });
});

describe('toast notifications', () => {
  it('renders no empty overlay', () => {
    const { container, rerender } = render(<ToastContainer />);
    expect(container).toBeEmptyDOMElement();
    mocks.app.toasts = undefined; rerender(<ToastContainer />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([
    ['top-center', 'top-[84px]', 'left-1/2'], ['top-right', 'top-[84px]', 'right-6'], ['bottom-center', 'bottom-10', 'left-1/2'],
    ['bottom-right', 'bottom-10', 'right-6'], ['unknown', 'top-[84px]', 'left-1/2'], ['', 'top-[84px]', 'left-1/2']
  ])('places toasts at %s', (position, vertical, horizontal) => {
    mocks.settings.toastPosition = position;
    mocks.app.toasts = [{ id: '1', kind: 'info', text: 'Fetched', duration: -1 }];
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toHaveClass(vertical, horizontal);
    expect(container.querySelector('[style*="toast-progress"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(mocks.app.dismissToast).toHaveBeenCalledWith('1');
  });
  it.each(['success', 'warn', 'info', 'error'])('renders %s status, optional title and progress', kind => {
    mocks.app.toasts = [{ id: '1', kind, text: 'Operation message', title: 'Repository', duration: 1400 }];
    const { container } = render(<ToastContainer />);
    expect(screen.getByText('Repository')).toBeVisible();
    expect(screen.getByText('Operation message')).toBeVisible();
    expect(container.querySelector('[style*="toast-progress"]')).toHaveStyle({ animation: 'toast-progress 1400ms linear forwards' });
    expect(screen.queryByRole('button', { name: 'Copy error message' }) !== null).toBe(kind === 'error');
  });
  it('copies full error text and returns to the copy state after two seconds', () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mocks.app.toasts = [{ id: 'err', kind: 'error', text: 'Network unavailable' }];
    const { container } = render(<ToastContainer />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy error message' }));
    expect(writeText).toHaveBeenCalledWith('Network unavailable');
    expect(container.querySelector('.lucide-check-check')).toBeInTheDocument();
    expect(mocks.app.dismissToast).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector('.lucide-copy')).toBeInTheDocument();
    expect(container.querySelector('[style*="toast-progress"]')).toHaveStyle({ animation: 'toast-progress 3800ms linear forwards' });
  });
});

describe('startup and repository loading displays', () => {
  it('uses a compact square logo and one plain progress indicator at startup', () => {
    vi.useFakeTimers(); const { container, rerender } = render(<AppLoadingScreen isReady={false} />);
    const logo = screen.getByLabelText('Git Workbench Logo'); expect(logo).toHaveAttribute('width', '64'); expect(logo).toHaveAttribute('height', '64'); expect(logo).toHaveStyle({ width: '64px', height: '64px', aspectRatio: '1 / 1' }); expect(logo).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(container.querySelectorAll('svg')).toHaveLength(1); expect(screen.getAllByRole('progressbar')).toHaveLength(1); expect(screen.getByRole('progressbar', { name: 'Starting Git Workbench' })).toHaveAttribute('aria-valuenow', '15');
    expect(container.querySelector('.animate-branch-draw, .animate-shimmer, .animate-pulse')).toBeNull(); rerender(<AppLoadingScreen isReady />); expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  it('keeps repository opening consistent with a square logo and one indeterminate bar', () => {
    vi.useFakeTimers(); mocks.app.isOpeningRepo = true; const { container } = render(<RepoOpeningAnimation />);
    expect(screen.getByLabelText('Git Workbench Logo')).toHaveStyle({ width: '48px', height: '48px', aspectRatio: '1 / 1' }); expect(screen.getAllByRole('progressbar')).toHaveLength(1); expect(screen.getByRole('progressbar', { name: 'Opening repository' })).not.toHaveAttribute('aria-valuenow');
    expect(container.querySelector('.loading-progress-fill.is-indeterminate')).toBeInTheDocument(); expect(container.querySelector('.animate-branch-draw, .animate-shimmer, .animate-pulse')).toBeNull();
  });
  it('keeps the ready phase complete while the startup timers would still be pending', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AppLoadingScreen isReady={false} />);
    act(() => vi.advanceTimersByTime(450));
    rerender(<AppLoadingScreen isReady />);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Welcome to Git Workbench')).toBeInTheDocument();
    expect(container.querySelector('[style*="width: 100%"]')).toBeInTheDocument();
  });
  it('advances startup phases then fades out once ready', () => {
    vi.useFakeTimers();
    const { container, rerender, unmount } = render(<AppLoadingScreen isReady={false} />);
    expect(screen.getByText('Initializing Git Workbench…')).toBeVisible();
    for (const [milliseconds, message] of [[500, 'Loading repositories and branch hierarchy…'], [600, 'Indexing commit strata & visual graph…'], [600, 'Configuring diff engine & Git Flow workflow…'], [500, 'Synchronizing workspace and tools…']] as const) {
      act(() => vi.advanceTimersByTime(milliseconds)); expect(screen.getByText(message)).toBeVisible();
    }
    rerender(<AppLoadingScreen isReady />);
    expect(screen.getByText('Welcome to Git Workbench')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('opacity-0', 'pointer-events-none');
    act(() => vi.advanceTimersByTime(550));
    expect(container).toBeEmptyDOMElement();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans startup timers if unmounted before completion', () => {
    vi.useFakeTimers();
    const { unmount } = render(<AppLoadingScreen isReady />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('shows repository opening phases, handles a second opening and dismisses after close animation', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<RepoOpeningAnimation />);
    expect(container).toBeEmptyDOMElement();
    mocks.app.isOpeningRepo = true; mocks.app.openingRepoName = 'repo'; rerender(<RepoOpeningAnimation />);
    expect(screen.getByRole('heading', { name: 'repo' })).toBeVisible();
    expect(screen.getByText('Opening repository…')).toBeVisible();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText('Reading branch hierarchy & commit strata…')).toBeVisible();
    act(() => vi.advanceTimersByTime(220));
    expect(screen.getByText('Rendering workspace…')).toBeVisible();
    mocks.app.isOpeningRepo = false; rerender(<RepoOpeningAnimation />);
    expect(container.firstChild).toHaveClass('opacity-0');
    act(() => vi.advanceTimersByTime(100));
    mocks.app.isOpeningRepo = true; mocks.app.openingRepoName = ''; rerender(<RepoOpeningAnimation />);
    expect(screen.getByRole('heading', { name: 'Repository' })).toBeVisible();
    expect(container.firstChild).toHaveClass('opacity-100');
    mocks.app.isOpeningRepo = false; rerender(<RepoOpeningAnimation />);
    act(() => vi.advanceTimersByTime(350));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ShortcutsModal', () => {
  it('only renders when open, displays keyboard references and closes by button or backdrop', () => {
    const { container, rerender } = render(<ShortcutsModal />);
    expect(container).toBeEmptyDOMElement();
    mocks.app.shortcutsModalOpen = true; rerender(<ShortcutsModal />);
    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts & Cheatsheet' })).toBeVisible();
    expect(screen.getByText('Ctrl+K')).toBeVisible();
    fireEvent.click(screen.getByText('Ctrl+K'));
    expect(mocks.useApp.setState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.useApp.setState).toHaveBeenCalledWith({ shortcutsModalOpen: false });
    fireEvent.click(container.firstChild!);
    expect(mocks.useApp.setState).toHaveBeenCalledTimes(2);
  });
});
