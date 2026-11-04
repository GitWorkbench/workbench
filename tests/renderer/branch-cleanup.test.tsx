// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchInfo, BranchList, WorktreeInfo } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({
  api: { getBranches: vi.fn(), deleteBranch: vi.fn() },
  state: { activeTab: '/repo', status: { currentBranch: 'current' }, worktrees: [] as WorktreeInfo[], refresh: vi.fn(), notify: vi.fn() }
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((selector: (state: typeof mocks.state) => unknown) => selector(mocks.state), { getState: () => mocks.state }) }));
import { BranchCleanupDialog } from '../../src/renderer/components/Sidebar/BranchCleanupDialog';

const branch = (name: string, patch: Partial<BranchInfo> = {}): BranchInfo => ({ name, fullName: name, isCurrent: false, isRemote: false, isMerged: true, ...patch });
const branches = (local: BranchInfo[]): BranchList => ({ local, remote: [], cleanupTarget: 'origin/main' });
const tree = (branchName: string): WorktreeInfo => ({ path: `/work/${branchName}`, hash: 'abc', branch: branchName });
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.activeTab = '/repo'; mocks.state.status = { currentBranch: 'current' }; mocks.state.worktrees = [tree('main'), tree('current'), tree('linked')];
  mocks.api.getBranches.mockResolvedValue(branches([
    branch('main', { isDefault: true }), branch('current', { isCurrent: true }), branch('linked'),
    branch('not-merged', { isMerged: false }), branch('feature/merged')
  ]));
  mocks.api.deleteBranch.mockResolvedValue({ ok: true });
  mocks.state.refresh.mockResolvedValue(undefined);
  onClose.mockReset();
});

describe('safe branch cleanup dialog', () => {
  it('loads only safe merged candidates and deletes them without force before refreshing', async () => {
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    expect(await within(dialog).findByRole('checkbox', { name: 'Select feature/merged' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Delete 1 selected' })).toBeEnabled();
    fireEvent.click(within(dialog).getByText('4 branches kept safe'));
    expect(within(dialog).getByText('Default branch')).toBeVisible();
    expect(within(dialog).getByText('Current branch')).toBeVisible();
    expect(within(dialog).getByText('Checked out in a worktree')).toBeVisible();
    expect(within(dialog).getByText('Not merged into origin/main')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.api.deleteBranch).toHaveBeenCalledExactlyOnceWith('feature/merged', { local: true });
    expect(mocks.state.refresh).toHaveBeenCalledOnce();
    expect(mocks.state.notify).toHaveBeenCalledWith('success', 'Safely deleted 1 merged branch');
  });

  it('supports select all and cancel without deleting', async () => {
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    const selectAll = within(dialog).getByRole('checkbox', { name: 'Select all safe branches' });
    fireEvent.click(selectAll);
    expect(within(dialog).getByRole('button', { name: 'Delete 0 selected' })).toBeDisabled();
    fireEvent.click(selectAll);
    expect(within(dialog).getByRole('button', { name: 'Delete 1 selected' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce(); expect(mocks.api.deleteBranch).not.toHaveBeenCalled();
  });

  it('shows tracking refs, supports partial selection, and blocks closing while deleting', async () => {
    let resolveDelete: ((value: { ok: boolean }) => void) | undefined;
    mocks.api.getBranches.mockResolvedValueOnce(branches([
      branch('feature/one', { tracking: 'origin/feature/one' }), branch('feature/two')
    ]));
    mocks.api.deleteBranch.mockImplementation(() => new Promise(resolve => { resolveDelete = resolve; }));
    const result = render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    expect(within(dialog).getByTitle('Tracks origin/feature/one')).toBeVisible();
    const first = within(dialog).getByRole('checkbox', { name: 'Select feature/one' });
    fireEvent.click(first);
    const selectAll = within(dialog).getByRole('checkbox', { name: 'Select all safe branches' }) as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(true);
    fireEvent.click(first);
    fireEvent.click(first);
    expect(selectAll.indeterminate).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    const deleting = within(dialog).getByRole('button', { name: 'Deleting safely…' });
    expect(deleting).toBeDisabled();
    // A second event can arrive before the disabled button is painted; the handler must still guard it.
    deleting.disabled = false;
    fireEvent.click(deleting);
    expect(mocks.api.deleteBranch).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(result.container.firstElementChild!);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolveDelete?.({ ok: true }); });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('shows Git refusal and keeps the dialog open when safe deletion fails', async () => {
    mocks.api.deleteBranch.mockRejectedValue(new Error('branch is not fully merged'));
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('feature/merged: branch is not fully merged');
    expect(mocks.state.refresh).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a changed repository before mutation and refreshes after partial deletion', async () => {
    const first = render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    mocks.state.activeTab = '/another-repo';
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('active repository changed');
    expect(mocks.api.deleteBranch).not.toHaveBeenCalled();
    first.unmount();

    mocks.state.activeTab = '/repo';
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two')])).mockResolvedValueOnce(branches([branch('two', { isMerged: false })]));
    mocks.api.deleteBranch.mockImplementationOnce(async () => ({ ok: true })).mockImplementationOnce(async () => { throw new Error('became unmerged'); });
    onClose.mockReset();
    const secondRender = render(<BranchCleanupDialog onClose={onClose} />);
    const secondDialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(secondDialog).getByRole('button', { name: 'Delete 2 selected' }));
    expect(await within(secondDialog).findByRole('alert')).toHaveTextContent('Deleted 1 branch. Git refused');
    expect(mocks.state.refresh).toHaveBeenCalledOnce(); expect(mocks.api.getBranches).toHaveBeenCalledTimes(3);
    secondRender.unmount();
  });

  it('handles empty branch data, failed initial loads, escape and overlay closing', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('current', { isCurrent: true })]));
    const first = render(<BranchCleanupDialog onClose={onClose} />);
    expect(await screen.findByText('No safe merged branches found')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete 0 selected' })).toBeDisabled();
    expect(screen.getByText('1 branch kept safe')).toBeVisible();
    const disabledDelete = screen.getByRole('button', { name: 'Delete 0 selected' }) as HTMLButtonElement;
    disabledDelete.disabled = false;
    fireEvent.click(disabledDelete);
    expect(mocks.api.deleteBranch).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Safe branch cleanup' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Safe branch cleanup' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    first.unmount();

    onClose.mockReset(); mocks.api.getBranches.mockRejectedValueOnce(new Error('offline'));
    const result = render(<BranchCleanupDialog onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    fireEvent.mouseDown(result.container.firstElementChild!);
    expect(onClose).toHaveBeenCalledOnce();
    result.unmount();
  });

  it('ignores an initial load that settles after the dialog unmounts and uses HEAD as a fallback', async () => {
    let resolveLoad: ((value: BranchList) => void) | undefined;
    mocks.state.status = null;
    mocks.api.getBranches.mockReturnValueOnce(new Promise(resolve => { resolveLoad = resolve; }));
    const first = render(<BranchCleanupDialog onClose={onClose} />);
    first.unmount();
    await act(async () => { resolveLoad?.({ local: [], remote: [] }); });

    mocks.state.activeTab = null;
    mocks.api.getBranches.mockResolvedValueOnce({ local: [branch('feature')], remote: [] });
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    expect(within(dialog).getByText('the current branch')).toBeVisible();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Delete 1 selected' }));
    expect(mocks.api.deleteBranch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces unsuccessful API results and stops when the active repository changes mid-run', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two')]));
    mocks.api.deleteBranch.mockResolvedValue({ ok: false, error: 'Git refused' });
    const first = render(<BranchCleanupDialog onClose={onClose} />);
    let dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('one: Git refused');
    expect(mocks.state.refresh).not.toHaveBeenCalled();
    first.unmount();

    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two')]));
    mocks.api.deleteBranch.mockReset().mockImplementationOnce(async () => { mocks.state.activeTab = '/switched'; return { ok: true }; });
    mocks.state.activeTab = '/repo';
    const second = render(<BranchCleanupDialog onClose={onClose} />);
    dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stopped because the active repository changed');
    expect(mocks.api.deleteBranch).toHaveBeenCalledOnce();
    expect(mocks.state.refresh).not.toHaveBeenCalled();
    second.unmount();
  });

  it('uses a safe-delete fallback error and reports a failed refresh after deletion', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one')]));
    mocks.api.deleteBranch.mockResolvedValueOnce({ ok: false });
    const first = render(<BranchCleanupDialog onClose={onClose} />);
    let dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('one: Git did not delete this branch.');
    first.unmount();

    onClose.mockReset(); mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one')]));
    mocks.api.deleteBranch.mockResolvedValueOnce({ ok: true });
    mocks.state.refresh.mockRejectedValueOnce(new Error('refresh failed'));
    const second = render(<BranchCleanupDialog onClose={onClose} />);
    dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deleted 1 branch. Could not refresh branch state: refresh failed');
    expect(onClose).not.toHaveBeenCalled();
    second.unmount();
  });

  it('deletes several merged branches and reports the plural result', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two')]));
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 selected' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.api.deleteBranch).toHaveBeenCalledTimes(2);
    expect(mocks.state.notify).toHaveBeenCalledWith('success', 'Safely deleted 2 merged branches');
  });

  it('summarizes multiple successful removals when a later branch fails and uses the fresh HEAD fallback', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two'), branch('three')]))
      .mockResolvedValueOnce({ local: [], remote: [] });
    mocks.api.deleteBranch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('became unmerged'));
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 3 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deleted 2 branches. Git refused');
    expect(within(dialog).getByText('the current branch')).toBeVisible();
    expect(mocks.api.deleteBranch).toHaveBeenCalledTimes(3);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('summarizes several removed branches if refreshing after deletion fails', async () => {
    mocks.api.getBranches.mockResolvedValueOnce(branches([branch('one'), branch('two')]));
    mocks.state.refresh.mockRejectedValueOnce(new Error('refresh failed'));
    render(<BranchCleanupDialog onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Safe branch cleanup' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 selected' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deleted 2 branches. Could not refresh branch state: refresh failed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores an initial load rejection after unmount', async () => {
    let rejectLoad: ((reason: Error) => void) | undefined;
    mocks.api.getBranches.mockReturnValueOnce(new Promise((_, reject) => { rejectLoad = reject; }));
    const result = render(<BranchCleanupDialog onClose={onClose} />);
    result.unmount();
    await act(async () => { rejectLoad?.(new Error('late offline')); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
