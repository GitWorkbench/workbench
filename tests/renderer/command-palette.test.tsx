// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ state: {} as Record<string, any>, settings: { openSettings: vi.fn(), closeSettings: vi.fn() }, setState: vi.fn(), api: Object.fromEntries(['fetch', 'pull', 'push', 'stash', 'stashPop', 'updateSubmodules', 'openTerminal', 'checkoutBranch'].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: any) => any) => select(mock.state), { getState: () => mock.state, setState: mock.setState }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => mock.settings } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
import { CommandPalette } from '../../src/renderer/components/CommandPalette/CommandPalette';
beforeEach(() => {
  Object.keys(mock.state).forEach(key => delete mock.state[key]);
  Object.assign(mock.state, { commandPaletteOpen: true, activeTab: '/repo', status: { currentBranch: 'main', staged: [{ path: 'file.ts', status: 'added' }], unstaged: [{ path: 'file.ts', status: 'modified' }, { path: 'other.ts', status: 'deleted' }] },
    branches: { local: [{ name: 'main', fullName: 'main', isCurrent: true }, { name: 'feature', fullName: 'feature', isCurrent: false, tracking: 'origin/feature' }], remote: [] },
    tags: [{ name: 'v1', hash: 'tag-commit', shortHash: 'tag1234', message: 'Release tag' }, { name: 'lightweight', hash: 'light-commit', shortHash: 'light12' }],
    log: { commits: [{ hash: 'abc123', shortHash: 'abc123', message: 'Improve routing', authorName: 'Alice', date: '2026-10-19T00:00:00Z' }] } });
  for (const name of ['selectCommit', 'openFileDiff', 'toggleSidebar', 'toggleTerminalDrawer', 'openCreateTagModal', 'openAddRemoteModal', 'openCreateRepoModal', 'openRepoDialog', 'toggleShortcutsModal', 'refresh', 'openPullRequestsModal', 'openGitFlowModal', 'openUsageGuide', 'openBisectModal', 'openReflogModal', 'openHome', 'openChangelogModal', 'openWorktreesModal', 'notify']) mock.state[name] = vi.fn();
  mock.state.runAndRefresh = vi.fn(async (run: () => any) => { await run(); return true; });
  mock.settings.openSettings.mockClear(); mock.settings.closeSettings.mockClear(); mock.setState.mockReset();
  for (const fn of Object.values(mock.api)) fn.mockReset().mockResolvedValue({ ok: true });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
const input = () => screen.getByPlaceholderText(/Type a command/);
const search = (query: string) => fireEvent.change(input(), { target: { value: query } });
const selectText = (text: string) => fireEvent.click(screen.getByText(text));

describe('palette navigation and filtering', () => {
  it('stays hidden while closed, focuses on open, and closes only on backdrop/Escape', async () => {
    vi.useFakeTimers(); mock.state.commandPaletteOpen = false; const { container, rerender } = render(<CommandPalette />); expect(container).toBeEmptyDOMElement();
    mock.state.commandPaletteOpen = true; rerender(<CommandPalette />); await act(async () => vi.advanceTimersByTime(50)); expect(input()).toHaveFocus();
    fireEvent.click(input()); expect(mock.setState).not.toHaveBeenCalled(); fireEvent.click(container.firstChild!); expect(mock.setState).toHaveBeenCalledWith({ commandPaletteOpen: false });
    fireEvent.keyDown(window, { key: 'Escape' }); expect(mock.setState).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['>', 'Fetch All Remotes'], ['cmd:', 'Fetch All Remotes'], ['@', 'Checkout "feature"'], ['branch:', 'Checkout "feature"'],
    ['#', 'Tag: v1'], ['tag:', 'Tag: v1'], ['commit:', 'Improve routing'], ['c:', 'Improve routing'], ['file:', 'file.ts'], ['f:', 'file.ts']
  ])('scopes %s to its feature results', (query, expected) => {
    render(<CommandPalette />); search(query); expect(screen.getByText(expected)).toBeVisible();
    if (query !== '>' && query !== 'cmd:') expect(screen.queryByText('Fetch All Remotes')).not.toBeInTheDocument();
  });
  it.each(['c: routing', 'f: file.ts', ' @feature', 'branch: origin/feature', '#tag1234', 'Alice'])('supports text searches and scope shorthands: %s', query => {
    render(<CommandPalette />); search(query); expect(screen.queryByText(/No matching/)).not.toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeVisible();
  });
  it('escapes regex characters, shows an empty result, clears text and switches categories', () => {
    render(<CommandPalette />); search('['); expect(screen.getByText(/No matching items/)).toBeVisible();
    fireEvent.keyDown(window, { key: 'Enter' }); expect(mock.setState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Clear search')); expect(input()).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Files' })); expect(screen.getByText('2 results')).toBeVisible();
    expect(screen.getAllByText('file.ts')).toHaveLength(1); expect(screen.queryByText('Fetch All Remotes')).not.toBeInTheDocument();
    search('missing'); expect(screen.getByText(/No matching files/)).toBeVisible();
  });
  it('wraps keyboard selection, follows hover selection and executes the selected item', () => {
    render(<CommandPalette />); fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    fireEvent.keyDown(window, { key: 'ArrowUp' }); fireEvent.keyDown(window, { key: 'Enter' }); expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'other.ts', status: 'deleted' });
    fireEvent.keyDown(window, { key: 'ArrowDown' }); fireEvent.keyDown(window, { key: 'ArrowDown' }); fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.mouseEnter(screen.getByText('file.ts').closest('.cursor-pointer')!); fireEvent.keyDown(window, { key: 'Enter' }); expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'file.ts', status: 'added' });
    fireEvent.keyDown(window, { key: 'x' }); expect(mock.state.openFileDiff).toHaveBeenCalledTimes(2);
  });
  it('handles empty history/status and can select local branches, tags and commits', () => {
    const { rerender } = render(<CommandPalette />);
    selectText('Checkout "main"'); expect(mock.api.checkoutBranch).not.toHaveBeenCalled();
    selectText('Checkout "feature"'); expect(mock.api.checkoutBranch).toHaveBeenCalledWith('feature');
    selectText('Tag: v1'); expect(mock.state.selectCommit).toHaveBeenCalledWith('tag-commit');
    selectText('Tag: lightweight'); expect(mock.state.selectCommit).toHaveBeenCalledWith('light-commit');
    selectText('Improve routing'); expect(mock.state.selectCommit).toHaveBeenCalledWith('abc123');
    mock.state.status = null; mock.state.log = null; rerender(<CommandPalette />); expect(screen.queryByText('Improve routing')).not.toBeInTheDocument();
  });
});

describe('built-in command actions', () => {
  it.each([
    ['Fetch All Remotes', 'fetch', []], ['Pull from Upstream', 'pull', []], ['Push to Remote', 'push', []], ['Stash Working Changes', 'stash', []],
    ['Pop Latest Stash', 'stashPop', [0]], ['Update / Sync Submodules', 'updateSubmodules', []], ['Open External Terminal', 'openTerminal', []]
  ])('%s delegates to the desktop API', async (title, name, args) => {
    render(<CommandPalette />); selectText(title); await act(async () => {}); expect(mock.api[name]).toHaveBeenCalledWith(...args); expect(mock.setState).toHaveBeenCalledWith({ commandPaletteOpen: false });
  });
  it.each([
    ['Open Pull Request Context…', 'openPullRequestsModal', []], ['Create / Initialize Repository…', 'openCreateRepoModal', []], ['Open Repository…', 'openRepoDialog', []],
    ['Create Tag…', 'openCreateTagModal', ['HEAD']], ['Add Remote…', 'openAddRemoteModal', []], ['Toggle Terminal Drawer', 'toggleTerminalDrawer', []], ['Toggle Sidebar', 'toggleSidebar', []],
    ['Keyboard Shortcuts Cheatsheet…', 'toggleShortcutsModal', []], ['Refresh Repository', 'refresh', []], ['Git Flow Operations…', 'openGitFlowModal', []], ['Explore Git Workbench…', 'openUsageGuide', []],
    ['Git Bisect Wizard…', 'openBisectModal', []], ['Reflog & Recovery…', 'openReflogModal', []], ['Generate Release Changelog…', 'openChangelogModal', []], ['Manage Git Worktrees…', 'openWorktreesModal', []]
  ])('%s opens its workspace tool', (title, name, args) => {
    render(<CommandPalette />); selectText(title); expect(mock.state[name]).toHaveBeenCalledWith(...args);
  });
  it.each([
    ['Split Commit…', { commitSplitOpen: true }], ['Stacked Branches & PRs…', { branchStackOpen: true }], ['Git LFS Manager…', { lfsManagerOpen: true }], ['Sparse Checkout…', { sparseCheckoutOpen: true }],
    ['Restore Points…', { restorePointsOpen: true }], ['Conflict Resolution Memory…', { resolutionMemoryOpen: true }], ['Rebase & Rewrite Comparison…', { rangeComparisonOpen: true, rangeComparisonId: null }]
  ])('%s opens the corresponding panel state', (title, state) => {
    render(<CommandPalette />); selectText(title); expect(mock.setState).toHaveBeenCalledWith(state);
  });
  it('opens settings, resumes Home and explains how to select comparison commits', () => {
    render(<CommandPalette />); selectText('Open Settings…'); expect(mock.settings.openSettings).toHaveBeenCalledOnce();
    selectText('Go Home — Repositories & Dashboard'); expect(mock.settings.closeSettings).toHaveBeenCalledOnce(); expect(mock.state.openHome).toHaveBeenCalledOnce();
    selectText('Compare Two Commits…'); expect(mock.state.notify).toHaveBeenCalledWith('info', expect.stringContaining('Ctrl+Click'), 'Commit Comparison');
  });
});
