// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  return { app, clipboard: vi.fn(), checkout: null as null | { onClose: () => void; onConfirmCheckout: () => void; onMoreActions?: () => void }, useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    api: Object.fromEntries(['checkoutBranch', 'createBranch', 'renameBranch', 'mergeBranch', 'rebaseBranch', 'pushSetUpstream', 'setUpstream', 'deleteBranch', 'pull', 'pushTag', 'deleteTag', 'fetch', 'pruneRemote', 'setRemoteUrl', 'renameRemote', 'removeRemote', 'updateSubmodules', 'removeWorktree', 'stashPop', 'stashApply', 'stashDrop', 'stash', 'getPullRequestContext'].map(name => [name, vi.fn()])) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/components/Sidebar/CheckoutBranchModal', async original => {
  const module = await original<typeof import('../../src/renderer/components/Sidebar/CheckoutBranchModal')>();
  return { ...module, CheckoutBranchModal: (props: React.ComponentProps<typeof module.CheckoutBranchModal>) => {
    mocks.checkout = props; return <module.CheckoutBranchModal {...props} />;
  } };
});
import { Sidebar } from '../../src/renderer/components/Sidebar/Sidebar';

const local = (name: string, current = false) => ({ name, fullName: name, isCurrent: current, tracking: current ? 'origin/main' : undefined });
beforeEach(() => {
  Object.assign(mocks.app, { sidebarVisible: true, sidebarWidth: 288, activeTab: '/repo', filter: '', status: { currentBranch: 'main' },
    branches: { local: [local('main', true), local('feature')], remote: [{ name: 'origin/remote-feature', fullName: 'origin/remote-feature', isCurrent: false }] },
    tags: [{ name: 'v1.0.0', hash: 'tag-hash', shortHash: 'tag-sha', message: 'Release' }], remotes: [{ name: 'origin', fetchUrl: 'git@example.test:org/repo.git', pushUrl: 'git@example.test:org/repo.git' }],
    submodules: [{ name: 'engine', path: 'vendor/engine', hash: '123456789', isInitialized: false, isDirty: true, isOutOfSync: true }],
    worktrees: [{ path: '/repo', branch: 'main', hash: 'main-hash' }, { path: '/review', branch: '', hash: 'review-hash' }],
    stashes: [{ index: 0, message: 'Pending changes' }], selectedStashIndex: null,
    log: { commits: [{ hash: 'main-tip', refs: [{ label: 'main' }] }, { hash: 'feature-tip', refs: [{ label: 'feature' }] }, { hash: 'remote-tip', refs: [{ label: 'origin/remote-feature' }] }] } });
  for (const name of ['notify', 'setFilter', 'setSidebarWidth', 'openCreateTagModal', 'openAddRemoteModal', 'openWorktreesModal', 'openSimulateMerge', 'openRepo', 'selectCommit', 'inspectStash', 'openPullRequestsModal', 'celebrateMilestone']) mocks.app[name] = vi.fn();
  mocks.app.runAndRefresh = vi.fn(async (operation: () => any) => operation());
  mocks.useApp.setState.mockClear(); mocks.clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } });
  for (const method of Object.values(mocks.api)) method.mockReset().mockResolvedValue({ ok: true });
  mocks.api.getPullRequestContext.mockResolvedValue({ provider: 'gitea', remoteName: 'origin', currentBranch: 'main', defaultBranch: 'main', credentialConfigured: true, pullRequests: [{ id: '12', title: 'Improve request navigation', author: 'Alice', sourceBranch: 'feature', targetBranch: 'main', draft: true, state: 'open' }] });
});
const branchButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*✓)?$`) });
function context(kind: 'local' | 'remoteBranch' | 'tag' | 'remote' | 'submodule' | 'worktree' | 'stash') {
  const element = kind === 'local' ? branchButton('feature') : kind === 'remoteBranch' ? branchButton('origin/remote-feature') : kind === 'tag' ? screen.getByTitle('v1.0.0 (tag-sha) Release') : kind === 'remote' ? screen.getByTitle('origin → git@example.test:org/repo.git') : kind === 'submodule' ? screen.getByTitle('vendor/engine (1234567)') : kind === 'worktree' ? screen.getByTitle('/review (detached)') : screen.getByTitle('Pending changes (Click to inspect files, right click for options)');
  fireEvent.contextMenu(element, { clientX: 200, clientY: 200 });
}

describe('Sidebar navigation, sizing and selection', () => {
  it('celebrates a completed rebase from the branch actions and skips failed rebases', async () => {
    render(<Sidebar />); fireEvent.contextMenu(branchButton('feature'));
    fireEvent.click(screen.getByRole('button', { name: 'Rebase "main" onto "feature"' }));
    await waitFor(() => expect(mocks.app.celebrateMilestone).toHaveBeenCalledWith('rebase'));
    mocks.app.celebrateMilestone.mockClear(); mocks.app.runAndRefresh.mockResolvedValue(false);
    fireEvent.contextMenu(branchButton('feature')); fireEvent.click(screen.getByRole('button', { name: 'Rebase "main" onto "feature"' }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.app.celebrateMilestone).not.toHaveBeenCalled();
  });
  it.each(['onConfirmCheckout', 'onMoreActions'] as const)('ignores a queued %s after the checkout dialog closes', callback => {
    render(<Sidebar />); fireEvent.click(branchButton('feature'));
    const child = mocks.checkout; if (!child) throw new Error('Checkout dialog missing');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => child[callback]?.());
    expect(mocks.api.checkoutBranch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Merge "feature" into "main"' })).not.toBeInTheDocument();
  });
  it('renders detached root paths and remote URL fallbacks with no repository selection', () => {
    mocks.app.activeTab = null; mocks.app.status = null;
    mocks.app.tags[0].message = ''; mocks.app.worktrees = [{ path: '/', branch: '', hash: 'root' }];
    mocks.app.remotes[0].fetchUrl = '';
    render(<Sidebar />);
    expect(screen.getByTitle(/^v1\.0\.0 \(tag-sha\)\s*$/)).toBeVisible(); expect(screen.getByTitle('/ (detached)')).toHaveTextContent('/');
    const remote = screen.getByTitle('origin → git@example.test:org/repo.git');
    expect(remote).toHaveTextContent('git@example.test:org/repo.git');
    fireEvent.contextMenu(remote);
    expect(screen.getByPlaceholderText('New remote URL')).toHaveValue('git@example.test:org/repo.git');
    fireEvent.click(screen.getByRole('button', { name: 'Copy Remote URL' }));
    expect(mocks.clipboard).toHaveBeenCalledWith('git@example.test:org/repo.git');
    fireEvent.click(screen.getByTitle('vendor/engine (1234567)'));
    expect(mocks.app.openRepo).toHaveBeenLastCalledWith('vendor/engine');
    context('submodule'); fireEvent.click(screen.getByRole('button', { name: 'Open Submodule in New Tab' }));
    expect(mocks.app.openRepo).toHaveBeenLastCalledWith('vendor/engine');
  });
  it.each(['standalone', '/topic'])('uses a remote branch name without assuming a nonempty remote prefix: %s', name => {
    mocks.app.branches.remote = [{ name, fullName: name, isCurrent: false }];
    render(<Sidebar />); fireEvent.contextMenu(branchButton(name));
    fireEvent.click(screen.getByRole('button', { name: `Delete Remote Branch "${name}"` }));
    expect(mocks.api.deleteBranch).toHaveBeenCalledWith(name === 'standalone' ? 'standalone' : 'topic', { local: false, remote: true, remoteName: name === 'standalone' ? 'standalone' : 'origin', force: true });
  });
  it('suggests origin for a tag when no remote has been configured', () => {
    mocks.app.remotes = []; render(<Sidebar />); context('tag');
    expect(screen.getAllByPlaceholderText('Remote name (e.g. origin)').map(input => (input as HTMLInputElement).value)).toEqual(['origin', 'origin']);
  });
  it('shows the tracking reference of a non-current local branch', () => { mocks.app.branches.local[1].tracking = 'upstream/feature'; render(<Sidebar />); expect(screen.getByTitle('feature → upstream/feature (Double-click to checkout, right-click for actions)')).toBeVisible(); });
  it('collapses, expands, resizes without leaving listeners and omits the Agents tab', () => {
    const { container, rerender } = render(<Sidebar />);
    expect(container.firstChild).toHaveStyle({ width: '288px' });
    expect(screen.queryByRole('button', { name: 'Agents' })).not.toBeInTheDocument();
    const handle = container.querySelector('.cursor-col-resize')!;
    fireEvent.mouseDown(handle, { clientX: 100 }); fireEvent.mouseMove(window, { clientX: 140 });
    expect(mocks.app.setSidebarWidth).toHaveBeenCalledWith(328); fireEvent.mouseUp(window); fireEvent.mouseMove(window, { clientX: 180 }); expect(mocks.app.setSidebarWidth).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Hide sidebar')); expect(mocks.useApp.setState).toHaveBeenCalledWith({ sidebarVisible: false });
    rerender(<Sidebar />); expect(screen.getByTitle('Show sidebar')).toBeVisible(); fireEvent.click(screen.getByTitle('Show sidebar')); expect(mocks.useApp.setState).toHaveBeenCalledWith({ sidebarVisible: true });
  });
  it('deduplicates branch lists, filters repository objects and expands empty sections', () => {
    mocks.app.branches.local.push(local('feature')); mocks.app.branches.remote.push(mocks.app.branches.remote[0]);
    const { rerender } = render(<Sidebar />);
    expect(screen.getAllByRole('button', { name: 'feature' })).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Filter branches, tags, remotes…'), { target: { value: 'feature' } }); expect(mocks.app.setFilter).toHaveBeenCalledWith('feature');
    mocks.app.filter = 'absent'; mocks.app.stashes = []; rerender(<Sidebar />);
    for (const title of ['No tags', 'No remotes', 'No submodules', 'No worktrees']) expect(screen.getByText(title)).toBeVisible();
    expect(screen.getByText('No stashes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^STASHES/ })); expect(screen.queryByText('No stashes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^STASHES/ })); expect(screen.getByText('No stashes')).toBeVisible();
    fireEvent.click(screen.getByTitle('Clear filter')); expect(mocks.app.setFilter).toHaveBeenCalledWith('');
  });
  it('inspects an active branch without a checkout modal and confirms inactive local/remote checkout', () => {
    render(<Sidebar />);
    fireEvent.click(branchButton('main')); expect(mocks.app.selectCommit).toHaveBeenCalledWith('main-tip'); expect(screen.queryByRole('heading', { name: 'Checkout Branch' })).not.toBeInTheDocument();
    fireEvent.doubleClick(branchButton('main')); expect(mocks.api.checkoutBranch).not.toHaveBeenCalled();
    fireEvent.click(branchButton('feature')); expect(mocks.app.selectCommit).toHaveBeenCalledWith('feature-tip'); expect(screen.getByRole('heading', { name: 'Checkout Branch' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout Branch' })); expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('feature');
    fireEvent.click(branchButton('origin/remote-feature')); expect(mocks.app.selectCommit).toHaveBeenCalledWith('remote-tip');
    fireEvent.click(screen.getByRole('button', { name: 'Checkout Branch' })); expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('origin/remote-feature');
  });
  it('checks out local/remote branches on double-click and exposes More Options from either checkout modal', () => {
    render(<Sidebar />);
    fireEvent.doubleClick(branchButton('feature')); expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('feature');
    fireEvent.doubleClick(branchButton('origin/remote-feature')); expect(mocks.api.checkoutBranch).toHaveBeenCalledWith('origin/remote-feature');
    fireEvent.click(branchButton('feature')); fireEvent.click(screen.getByRole('button', { name: 'More Options…' })); expect(screen.getByRole('button', { name: 'Merge "feature" into "main"' })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.click(branchButton('origin/remote-feature')); fireEvent.click(screen.getByRole('button', { name: 'More Options…' })); expect(screen.getByRole('button', { name: 'Checkout as Local "remote-feature"' })).toBeVisible();
  });
  it('selects tags and opens submodules/worktrees at their local paths', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTitle('v1.0.0 (tag-sha) Release')); expect(mocks.app.selectCommit).toHaveBeenCalledWith('tag-hash');
    fireEvent.click(screen.getByTitle('vendor/engine (1234567)')); expect(mocks.app.openRepo).toHaveBeenCalledWith('/repo/vendor/engine');
    expect(screen.getByText('dirty')).toBeVisible(); expect(screen.getByText('uninit')).toBeVisible(); expect(screen.getByText('sync')).toBeVisible();
    fireEvent.click(screen.getByTitle('/review (detached)')); expect(mocks.app.openRepo).toHaveBeenCalledWith('/review');
  });
  it('opens section controls without collapsing their contents', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTitle('Create tag')); expect(mocks.app.openCreateTagModal).toHaveBeenCalledWith('HEAD');
    fireEvent.click(screen.getByTitle('Add remote')); expect(mocks.app.openAddRemoteModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Manage worktrees dashboard')); expect(mocks.app.openWorktreesModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Fetch all remotes')); expect(mocks.api.fetch).toHaveBeenCalledWith();
    fireEvent.click(screen.getByTitle('Update all submodules')); expect(mocks.api.updateSubmodules).toHaveBeenCalledWith();
    fireEvent.click(screen.getByTitle('Stash changes')); expect(mocks.api.stash).toHaveBeenCalledWith();
    fireEvent.click(screen.getByTitle('Create branch')); fireEvent.change(screen.getByPlaceholderText('Branch name'), { target: { value: 'new-branch' } }); fireEvent.click(screen.getByRole('button', { name: 'Create Branch' })); expect(mocks.api.createBranch).toHaveBeenCalledWith('new-branch');
    fireEvent.contextMenu(screen.getByRole('button', { name: /^LOCAL/ })); expect(screen.getByPlaceholderText('Branch name')).toBeVisible();
  });
  it('keeps stash row geometry stable and isolates inline actions from selection', () => {
    const { rerender } = render(<Sidebar />); const row = screen.getByTitle('Pending changes (Click to inspect files, right click for options)');
    expect(row).toHaveClass('transition-colors'); expect(row.querySelector('.w-16')).toBeInTheDocument(); expect(row).not.toHaveClass('transition-all');
    fireEvent.click(row); expect(mocks.app.inspectStash).toHaveBeenCalledWith(0); mocks.app.inspectStash.mockClear();
    fireEvent.click(screen.getByTitle('Pop stash')); fireEvent.click(screen.getByTitle('Apply stash (keep entry)')); fireEvent.click(screen.getByTitle('Drop stash'));
    expect(mocks.api.stashPop).toHaveBeenCalledWith(0); expect(mocks.api.stashApply).toHaveBeenCalledWith(0); expect(mocks.api.stashDrop).toHaveBeenCalledWith(0); expect(mocks.app.inspectStash).not.toHaveBeenCalled();
    mocks.app.selectedStashIndex = 0; rerender(<Sidebar />); expect(row).toHaveClass('bg-purple-500/20');
  });
});

describe('local branch context actions', () => {
  it.each([
    ['Checkout "feature"', 'checkoutBranch', ['feature']], ['Merge "feature" into "main"', 'mergeBranch', ['feature']],
    ['Rebase "main" onto "feature"', 'rebaseBranch', ['feature']], ['Push "feature" to Origin', 'pushSetUpstream', ['feature']],
    ['Delete "feature"', 'deleteBranch', ['feature', { local: true }]], ['Force Delete "feature"', 'deleteBranch', ['feature', { local: true, force: true }]]
  ])('executes %s with the selected branch', (label, method, args) => {
    render(<Sidebar />); context('local'); fireEvent.click(screen.getByRole('button', { name: label })); expect(mocks.api[method as string]).toHaveBeenCalledWith(...args);
  });
  it('prevents modifying the active branch while allowing its name to be copied', () => {
    render(<Sidebar />); fireEvent.contextMenu(branchButton('main'));
    expect(screen.getByRole('button', { name: 'Checkout "main" (Active)' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Delete "main"' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Branch Name' })); expect(mocks.clipboard).toHaveBeenCalledWith('main'); expect(mocks.app.notify).toHaveBeenCalledWith('info', 'Copied "main" to clipboard');
  });
  it('creates, renames and configures upstream through trimmed prompt values and starts a merge simulation', () => {
    render(<Sidebar />); context('local');
    const prompts = screen.getAllByPlaceholderText('New branch name'); fireEvent.change(prompts[0], { target: { value: 'new-feature' } }); fireEvent.click(screen.getByRole('button', { name: 'Create Branch' })); expect(mocks.api.createBranch).toHaveBeenCalledWith('new-feature', 'feature');
    context('local'); fireEvent.change(screen.getAllByPlaceholderText('New branch name')[1], { target: { value: 'renamed-feature' } }); fireEvent.click(screen.getByRole('button', { name: 'Rename', exact: true })); expect(mocks.api.renameBranch).toHaveBeenCalledWith('feature', 'renamed-feature');
    context('local'); fireEvent.change(screen.getByPlaceholderText('Upstream (e.g. origin/feature)'), { target: { value: 'backup/feature' } }); fireEvent.click(screen.getByRole('button', { name: 'Set Upstream' })); expect(mocks.api.setUpstream).toHaveBeenCalledWith('feature', 'backup/feature');
    context('local'); fireEvent.click(screen.getByRole('button', { name: 'Simulate Merge (Pre-Flight Conflict Check)' })); expect(mocks.app.openSimulateMerge).toHaveBeenCalledWith('feature');
  });
});

describe('remote branch and tag context actions', () => {
  it.each([
    ['Checkout as Local "remote-feature"', 'checkoutBranch', ['origin/remote-feature']], ['Pull "origin/remote-feature" into "main"', 'pull', []],
    ['Delete Remote Branch "origin/remote-feature"', 'deleteBranch', ['remote-feature', { local: false, remote: true, remoteName: 'origin', force: true }]]
  ])('executes remote action %s', (label, method, args) => { render(<Sidebar />); context('remoteBranch'); fireEvent.click(screen.getByRole('button', { name: label })); expect(mocks.api[method as string]).toHaveBeenCalledWith(...args); });
  it('copies a remote full branch name', () => { render(<Sidebar />); context('remoteBranch'); fireEvent.click(screen.getByRole('button', { name: 'Copy Branch Name' })); expect(mocks.clipboard).toHaveBeenCalledWith('origin/remote-feature'); });
  it('deletes a nested branch from its selected non-origin remote', () => {
    mocks.app.branches.remote = [{ name: 'backup/feature/topic', fullName: 'backup/feature/topic', isCurrent: false }];
    render(<Sidebar />); fireEvent.contextMenu(branchButton('backup/feature/topic'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Remote Branch "backup/feature/topic"' }));
    expect(mocks.api.deleteBranch).toHaveBeenCalledWith('feature/topic', { local: false, remote: true, remoteName: 'backup', force: true });
  });
  it.each([
    ['Checkout Tag "v1.0.0"', 'checkoutBranch', ['v1.0.0']], ['Delete Tag "v1.0.0" (Local)', 'deleteTag', ['v1.0.0', false]]
  ])('executes tag action %s', (label, method, args) => { render(<Sidebar />); context('tag'); fireEvent.click(screen.getByRole('button', { name: label })); expect(mocks.api[method as string]).toHaveBeenCalledWith(...args); });
  it('selects the tag commit, copies the tag name and explicitly chooses push/delete remotes', () => {
    render(<Sidebar />); context('tag'); fireEvent.click(screen.getByRole('button', { name: 'Select in Commit Graph' })); expect(mocks.app.selectCommit).toHaveBeenCalledWith('tag-hash');
    context('tag'); fireEvent.click(screen.getByRole('button', { name: 'Copy Tag Name' })); expect(mocks.clipboard).toHaveBeenCalledWith('v1.0.0');
    context('tag'); fireEvent.change(screen.getAllByPlaceholderText('Remote name (e.g. origin)')[0], { target: { value: 'backup' } }); fireEvent.click(screen.getByRole('button', { name: 'Push Tag' })); expect(mocks.api.pushTag).toHaveBeenCalledWith('v1.0.0', 'backup');
    context('tag'); fireEvent.change(screen.getAllByPlaceholderText('Remote name (e.g. origin)')[1], { target: { value: 'backup' } }); fireEvent.click(screen.getByRole('button', { name: 'Delete Remote Tag' })); expect(mocks.api.deleteTag).toHaveBeenCalledWith('v1.0.0', true, 'backup');
  });
});

describe('remote, worktree, submodule and stash context actions', () => {
  it.each([
    ['Fetch from "origin"', 'fetch', ['origin']], ['Prune Stale Branches on "origin"', 'pruneRemote', ['origin']], ['Remove Remote "origin"', 'removeRemote', ['origin']]
  ])('executes remote configuration %s', (label, method, args) => { render(<Sidebar />); context('remote'); fireEvent.click(screen.getByRole('button', { name: label })); expect(mocks.api[method as string]).toHaveBeenCalledWith(...args); });
  it('edits remote URLs and names with compact readable prompt buttons and copies URLs', () => {
    render(<Sidebar />); context('remote');
    expect(screen.getByRole('button', { name: 'Save URL' })).toHaveClass('context-menu-prompt-submit', 'btn-primary');
    fireEvent.change(screen.getByPlaceholderText('New remote URL'), { target: { value: 'ssh://git@example.test/new' } }); fireEvent.click(screen.getByRole('button', { name: 'Save URL' })); expect(mocks.api.setRemoteUrl).toHaveBeenCalledWith('origin', 'ssh://git@example.test/new');
    context('remote'); fireEvent.change(screen.getByPlaceholderText('New remote name'), { target: { value: 'upstream' } }); fireEvent.click(screen.getByRole('button', { name: 'Rename' })); expect(mocks.api.renameRemote).toHaveBeenCalledWith('origin', 'upstream');
    context('remote'); fireEvent.click(screen.getByRole('button', { name: 'Copy Remote URL' })); expect(mocks.clipboard).toHaveBeenCalledWith('git@example.test:org/repo.git');
  });
  it('opens and syncs submodules, opens/removes worktrees and copies their paths', () => {
    render(<Sidebar />); context('submodule'); fireEvent.click(screen.getByRole('button', { name: 'Open Submodule in New Tab' })); expect(mocks.app.openRepo).toHaveBeenCalledWith('/repo/vendor/engine');
    context('submodule'); fireEvent.click(screen.getByRole('button', { name: 'Update / Sync "engine"' })); expect(mocks.api.updateSubmodules).toHaveBeenCalledWith('vendor/engine');
    context('submodule'); fireEvent.click(screen.getByRole('button', { name: 'Copy Submodule Path' })); expect(mocks.clipboard).toHaveBeenCalledWith('vendor/engine');
    context('worktree'); fireEvent.click(screen.getByRole('button', { name: 'Open Worktree in New Tab' })); expect(mocks.app.openRepo).toHaveBeenCalledWith('/review');
    context('worktree'); fireEvent.click(screen.getByRole('button', { name: 'Remove Worktree' })); expect(mocks.api.removeWorktree).toHaveBeenCalledWith('/review');
    context('worktree'); fireEvent.click(screen.getByRole('button', { name: 'Copy Worktree Path' })); expect(mocks.clipboard).toHaveBeenCalledWith('/review');
    fireEvent.contextMenu(screen.getByTitle('/repo (main)')); expect(screen.getByRole('button', { name: 'Remove Worktree' })).toBeDisabled();
  });
  it.each([['Pop Stash #0', 'stashPop'], ['Apply Stash #0', 'stashApply'], ['Drop Stash #0', 'stashDrop']])('executes stash action %s', (label, method) => { render(<Sidebar />); context('stash'); fireEvent.click(screen.getByRole('button', { name: label })); expect(mocks.api[method]).toHaveBeenCalledWith(0); });
  it('copies stash messages', () => { render(<Sidebar />); context('stash'); fireEvent.click(screen.getByRole('button', { name: 'Copy Stash Message' })); expect(mocks.clipboard).toHaveBeenCalledWith('Pending changes'); });
});


describe('dedicated request sidebar view', () => {
  beforeEach(() => vi.useFakeTimers());
  it('keeps requests separate from repository objects and removes Agents', async () => {
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: /^LOCAL/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agents' })).not.toBeInTheDocument();
    expect(mocks.api.getPullRequestContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByRole('button', { name: 'Requests', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^LOCAL/ })).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Improve request navigation/ });
    fireEvent.click(row);
    expect(mocks.app.openPullRequestsModal).toHaveBeenCalledWith({ remoteName: 'origin', requestId: '12', mode: 'review' });
    expect(mocks.app.runAndRefresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }));
    expect(mocks.app.openPullRequestsModal).toHaveBeenLastCalledWith({ remoteName: 'origin', mode: 'create' });
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
    expect(screen.getByRole('button', { name: /^LOCAL/ })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Pull Requests' })).not.toBeInTheDocument();
  });
  it.each(['github', 'gitlab', 'bitbucket', 'gitea'])('uses %s terminology in its request section', async provider => {
    mocks.api.getPullRequestContext.mockResolvedValue({ provider, remoteName: 'origin', credentialConfigured: true, currentBranch: 'main', pullRequests: [] });
    render(<Sidebar />); fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const region = screen.getByRole('region', { name: provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests' });
    expect(within(region).getByText(`No open ${provider === 'gitlab' ? 'merge' : 'pull'} requests.`)).toBeVisible();
  });
  it('keeps repository and request filters independent', async () => {
    mocks.app.filter = 'feature';
    render(<Sidebar />); expect(screen.getByRole('textbox', { name: 'Filter repository' })).toHaveValue('feature');
    fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    screen.getByRole('button', { name: /Improve request navigation/ });
    const filter = screen.getByRole('textbox', { name: 'Filter requests' }); expect(filter).toHaveValue('');
    fireEvent.change(filter, { target: { value: 'unmatched' } }); expect(screen.getByText('No matching pull requests.')).toBeVisible();
    fireEvent.click(screen.getByTitle('Clear filter')); expect(filter).toHaveValue('');
    expect(mocks.app.setFilter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Filter repository' })).toHaveValue('feature');
  });
  it('shows inline offline errors and retries without startup notifications', async () => {
    mocks.api.getPullRequestContext.mockRejectedValueOnce(new Error('Provider offline'));
    render(<Sidebar />); fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByRole('status')).toHaveTextContent('Provider offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByRole('button', { name: /Improve request navigation/ })).toBeVisible();
    expect(mocks.app.notify).not.toHaveBeenCalled();
  });
  it('rejects stale repository responses after switching repositories', async () => {
    let finish: ((value: unknown) => void) | undefined;
    mocks.api.getPullRequestContext.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<Sidebar />); fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(mocks.api.getPullRequestContext).toHaveBeenCalledTimes(1);
    mocks.app.activeTab = '/other';
    mocks.api.getPullRequestContext.mockResolvedValue({ provider: 'gitlab', remoteName: 'origin', credentialConfigured: true, pullRequests: [] });
    rerender(<Sidebar />);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    screen.getByRole('region', { name: 'Merge Requests' });
    await act(async () => { finish?.({ provider: 'github', credentialConfigured: true, pullRequests: [{ id: '99', state: 'open', title: 'STALE request' }] }); });
    expect(screen.queryByText('STALE request')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Merge Requests' })).toBeVisible();
  });
});

it('preserves repository expansion and pauses request checks while List is selected', async () => {
  vi.useFakeTimers();
  const { rerender } = render(<Sidebar />);
  fireEvent.click(screen.getByRole('button', { name: /^LOCAL/ }));
  expect(screen.queryByRole('button', { name: /^main/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Requests', exact: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  screen.getByRole('button', { name: /Improve request navigation/ });
  fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
  mocks.api.getPullRequestContext.mockClear();
  mocks.app.status = { currentBranch: 'feature' }; rerender(<Sidebar />);
  await act(async () => { await vi.advanceTimersByTimeAsync(220); });
  expect(mocks.api.getPullRequestContext).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /^main/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^LOCAL/ }));
  expect(screen.getByRole('button', { name: /^main/ })).toBeVisible();
});
