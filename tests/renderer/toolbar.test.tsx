// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {}, settings = { openSettings: vi.fn() };
  return { app, settings, useApp: Object.assign((selector?: (state: any) => any) => selector ? selector(app) : app, { getState: () => app, setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    api: Object.fromEntries(['fetch', 'pull', 'push', 'checkoutBranch', 'createBranch', 'stash', 'stashPop'].map(name => [name, vi.fn()])) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp, WIP_HASH: 'WIP' }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => mocks.settings } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { Toolbar } from '../../src/renderer/components/Toolbar/Toolbar';

beforeEach(() => {
  for (const key of Object.keys(mocks.app)) delete mocks.app[key];
  Object.assign(mocks.app, { activeTab: '/repo', tabs: [{ path: '/repo', name: 'Repo' }], status: { currentBranch: 'main', ahead: 2, behind: 3, staged: [], unstaged: [] },
    recentRepos: ['/work/recent', '/'], branches: { local: [{ name: 'main', fullName: 'main', isCurrent: true, tracking: 'origin/main' }, { name: 'feature', fullName: 'feature', isCurrent: false }], remote: [] },
    stashes: [{ index: 0 }], filter: '', log: { commits: [
      { hash: 'abc123', message: 'feat: add feature', authorName: 'Alice', refs: [{ label: 'main' }] },
      { hash: 'def456', message: 'fix: resolve bug', authorName: 'Bob', refs: [{ label: 'feature' }] }
    ] } });
  for (const name of ['notify', 'openRepoDialog', 'openCreateRepoModal', 'openRepo', 'toggleTerminalDrawer', 'openCommandPalette', 'openGitFlowModal', 'openPullRequestsModal', 'openReflogModal', 'openUsageGuide', 'refresh']) mocks.app[name] = vi.fn();
  mocks.app.runAndRefresh = vi.fn(async (fn: () => any) => { await fn(); return true; });
  mocks.app.setFilter = vi.fn((filter: string) => { mocks.app.filter = filter; });
  mocks.settings.openSettings.mockReset(); mocks.useApp.setState.mockClear();
  for (const method of Object.values(mocks.api)) method.mockReset().mockResolvedValue({ ok: true });
});
function action(label: string) { fireEvent.click(screen.getByTitle('Actions')); fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) })); }

describe('Toolbar repository and branch controls', () => {
  it('switches repositories, opens the picker and creates repositories from its menu', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('Switch repository')); fireEvent.click(screen.getByRole('button', { name: 'Open Repository…' })); expect(mocks.app.openRepoDialog).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Switch repository')); fireEvent.click(screen.getByRole('button', { name: 'Create New Repository…' })); expect(mocks.app.openCreateRepoModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Switch repository')); fireEvent.click(screen.getByText('recent').closest('button')!); expect(mocks.app.openRepo).toHaveBeenCalledWith('/work/recent');
    fireEvent.click(screen.getByTitle('Switch repository')); fireEvent.click(screen.getAllByText('/')[0].closest('button')!); expect(mocks.app.openRepo).toHaveBeenCalledWith('/');
  });
  it('filters local branches, ignores current checkout and switches an inactive branch', async () => {
    render(<Toolbar />); fireEvent.click(screen.getByTitle('Switch branch'));
    const query = screen.getByPlaceholderText('Filter branches…');
    fireEvent.change(query, { target: { value: 'FEATURE' } }); expect(screen.queryByRole('button', { name: /main.*origin/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'feature' })); expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('feature');
    fireEvent.click(screen.getByTitle('Switch branch')); fireEvent.change(screen.getByPlaceholderText('Filter branches…'), { target: { value: '' } });
    mocks.api.checkoutBranch.mockClear(); fireEvent.click(screen.getByRole('button', { name: /main.*origin/ })); expect(mocks.api.checkoutBranch).not.toHaveBeenCalled();
  });
  it('creates a trimmed branch name, rejects an empty form and clears the draft afterward', async () => {
    render(<Toolbar />); fireEvent.click(screen.getByTitle('Create branch'));
    const input = screen.getByPlaceholderText('Branch name');
    fireEvent.submit(input.closest('form')!); expect(mocks.api.createBranch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: ' feature/new ' } }); fireEvent.submit(input.closest('form')!);
    expect(mocks.api.createBranch).toHaveBeenCalledWith('feature/new'); expect(screen.queryByPlaceholderText('Branch name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Create branch')); expect(screen.getByPlaceholderText('Branch name')).toHaveValue('');
  });
  it('disables repository actions without a repository and shows HEAD when creating an initial branch', () => {
    mocks.app.activeTab = null; mocks.app.status = null; mocks.app.stashes = [];
    render(<Toolbar />); expect(screen.getByText('No repo')).toBeVisible(); expect(screen.getByTitle('Switch branch')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Pop' })).toBeDisabled();
    fireEvent.click(screen.getByTitle('Create branch')); expect(screen.getByText('Create new branch from HEAD')).toBeVisible();
  });
});

describe('Toolbar synchronization', () => {
  it('ignores fetch while a pull is still running', async () => {
    let finish!: (ok: boolean) => void;
    mocks.app.runAndRefresh.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: /^Pull/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(mocks.app.runAndRefresh).toHaveBeenCalledOnce();
    await act(async () => finish(true));
  });
  it.each([1, 2])('announces newly fetched incoming commits (%s)', async count => {
    mocks.app.status.behind = 0;
    mocks.app.runAndRefresh.mockImplementation(async (fn: () => any) => { await fn(); mocks.app.status = { ...mocks.app.status, behind: count }; return true; });
    render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('info', `Fetched remote updates: ${count} incoming commit${count > 1 ? 's' : ''} available to pull`));
  });
  it('announces a fetch with no new incoming changes and tolerates a missing status after refresh', async () => {
    mocks.app.runAndRefresh.mockImplementation(async (fn: () => any) => { await fn(); mocks.app.status = null; return true; });
    render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('success', 'Fetched all remotes (repository up to date)'));
  });
  it.each([0, 1, 2])('announces pulled count (%s)', async count => {
    mocks.app.status.behind = count; render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: /^Pull/ }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith(count ? 'success' : 'info', count ? `Pulled ${count} commit${count > 1 ? 's' : ''} from remote` : 'Already up to date. No new incoming changes from remote.'));
  });
  it.each([1, 2])('announces pushed count (%s)', async count => {
    mocks.app.status.ahead = count; render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: /^Push/ }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('success', `Pushed ${count} commit${count > 1 ? 's' : ''} to remote`));
  });
  it.each([0, 1, 2])('explains why a branch with0 outgoing commits cannot push (%s dirty files)', count => {
    mocks.app.status.ahead = 0; mocks.app.status.unstaged = Array(count).fill({ path: 'file' });
    render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(mocks.api.push).not.toHaveBeenCalled();
    expect(mocks.app.notify).toHaveBeenCalledWith(count ? 'error' : 'info', count ? `Cannot push: you have ${count} uncommitted file${count > 1 ? 's' : ''}. Commit them first before pushing.` : 'Branch is up to date with remote (0 local commits to push).');
  });
  it('does not announce successful sync when the Git operation failed and releases the busy state', async () => {
    mocks.app.runAndRefresh.mockResolvedValue(false); render(<Toolbar />);
    for (const name of ['Fetch', 'Pull', 'Push']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeEnabled());
    }
    expect(mocks.app.notify).not.toHaveBeenCalled();
  });
  it('ignores overlapping sync attempts while a fetch is pending', async () => {
    let finish!: (ok: boolean) => void; mocks.app.runAndRefresh.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<Toolbar />); fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Pull/ })); fireEvent.click(screen.getByRole('button', { name: /^Push/ }));
    expect(mocks.app.runAndRefresh).toHaveBeenCalledOnce();
    await act(async () => finish(true)); expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled();
  });
});

describe('Toolbar tools, menus and search', () => {
  it('stashes, pops, toggles terminal and opens Git Flow', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Stash' })); expect(mocks.api.stash).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Pop' })); expect(mocks.api.stashPop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' })); expect(mocks.app.toggleTerminalDrawer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Git Flow' })); expect(mocks.app.openGitFlowModal).toHaveBeenCalledOnce();
  });
  it.each([
    ['Command Palette…', 'openCommandPalette'], ['Toggle Terminal Drawer', 'toggleTerminalDrawer'], ['Pull Requests / Merge Requests…', 'openPullRequestsModal'],
    ['Reflog & Recovery…', 'openReflogModal'], ['Refresh', 'refresh'], ['Git Flow Operations…', 'openGitFlowModal'], ['Explore Git Workbench…', 'openUsageGuide']
  ])('opens %s using the selected repository context', (label, method) => {
    render(<Toolbar />); action(label); expect(mocks.app[method]).toHaveBeenCalledOnce();
  });
  it.each([
    ['Split Commit…', { commitSplitOpen: true }], ['Stacked Branches & PRs…', { branchStackOpen: true }], ['Git LFS Manager…', { lfsManagerOpen: true }],
    ['Sparse Checkout…', { sparseCheckoutOpen: true }], ['Restore Points…', { restorePointsOpen: true }], ['Conflict Resolution Memory…', { resolutionMemoryOpen: true }],
    ['Rebase & Rewrite Comparison…', { rangeComparisonOpen: true, rangeComparisonId: null }]
  ])('opens advanced tool %s', (label, patch) => {
    render(<Toolbar />); action(label); expect(mocks.useApp.setState).toHaveBeenCalledWith(patch);
  });
  it('fetches from the action menu, opens preferences and explains branch merge controls', () => {
    render(<Toolbar />); action('Fetch All Remotes'); expect(mocks.api.fetch).toHaveBeenCalledOnce();
    action('Settings…'); expect(mocks.settings.openSettings).toHaveBeenCalledOnce();
    action('Merge into current branch…'); expect(mocks.app.notify).toHaveBeenCalledWith('info', 'Use a branch context menu to merge into the current branch');
  });
  it.each(['feat', 'abc', 'bob', 'feature', 'absent'])('counts commit matches for %s across message/hash/author/refs', filter => {
    mocks.app.filter = filter; const { rerender } = render(<Toolbar />);
    expect(screen.getByText(`${filter === 'absent' ? 0 : filter === 'feature' || filter === 'feat' ? 2 : 1}/2`)).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Filter commits…'), { target: { value: 'next' } }); expect(mocks.app.setFilter).toHaveBeenCalledWith('next');
    rerender(<Toolbar />); fireEvent.click(screen.getByTitle('Clear filter')); expect(mocks.app.setFilter).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByTitle('Command Palette (Ctrl+K / Cmd+K)')); expect(mocks.app.openCommandPalette).toHaveBeenCalledOnce();
  });
  it('handles missing history while filtering and hides counts for whitespace', () => {
    mocks.app.log = null; mocks.app.filter = 'query'; const { rerender } = render(<Toolbar />); expect(screen.getByText('0/0')).toBeVisible();
    mocks.app.filter = ' '; rerender(<Toolbar />); expect(screen.queryByText('0/0')).not.toBeInTheDocument();
  });
});
