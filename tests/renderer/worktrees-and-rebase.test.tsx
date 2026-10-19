// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  return { app, useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    api: Object.fromEntries(['createWorktree', 'removeWorktree', 'getCommitsForRebase', 'executeInteractiveRebase', 'getRepoOperationState'].map(name => [name, vi.fn()])) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { WorktreesModal } from '../../src/renderer/components/Worktrees/WorktreesModal';
import { InteractiveRebaseModal } from '../../src/renderer/components/Rebase/InteractiveRebaseModal';

const steps = [{ hash: 'commit-1', shortHash: 'c1', author: 'Alice', message: 'First', action: 'pick' }, { hash: 'commit-2', shortHash: 'c2', author: 'Bob', message: 'Second', action: 'pick' }, { hash: 'commit-3', shortHash: 'c3', author: 'Carol', message: 'Third', action: 'pick' }];
beforeEach(() => {
  Object.assign(mocks.app, { worktreesModalOpen: true, activeTab: '/repo', worktrees: [{ path: '/repo', branch: 'main', hash: 'main-hash' }, { path: '/review', branch: '', hash: 'review-hash' }, { path: '/locked', branch: 'locked', hash: 'locked-hash', isLocked: true }],
    closeWorktreesModal: vi.fn(), openRepo: vi.fn(), notify: vi.fn(), rebaseModalBaseCommit: 'base-commit', closeRebaseModal: vi.fn(), openConflictResolver: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) });
  mocks.app.runAndRefresh = vi.fn(async (fn: () => any) => { try { await fn(); return true; } catch (error) { mocks.app.notify('error', String(error)); return false; } });
  mocks.useApp.setState.mockClear(); for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.createWorktree.mockResolvedValue({ ok: true }); mocks.api.removeWorktree.mockResolvedValue({ ok: true });
  mocks.api.getCommitsForRebase.mockResolvedValue(steps); mocks.api.executeInteractiveRebase.mockResolvedValue({ ok: true }); mocks.api.getRepoOperationState.mockResolvedValue({ conflictedFiles: ['file.ts'] });
});

describe('WorktreesModal', () => {
  it('renders main/current/locked worktrees and only exposes safe removal options', () => {
    render(<WorktreesModal />);
    expect(screen.getByText('Main Checkout')).toBeVisible(); expect(screen.getByText('Current')).toBeVisible(); expect(screen.getByText('Locked')).toBeVisible();
    expect(screen.getAllByTitle('Remove worktree')).toHaveLength(1);
    fireEvent.click(screen.getAllByTitle('Open worktree in tab')[1]); expect(mocks.app.openRepo).toHaveBeenCalledWith('/review'); expect(mocks.app.closeWorktreesModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Done' })); expect(mocks.app.closeWorktreesModal).toHaveBeenCalledTimes(2);
  });
  it('validates new worktree paths, trims input and uses HEAD when no branch is entered', async () => {
    const { container } = render(<WorktreesModal />);
    fireEvent.submit(container.querySelector('form')!); expect(mocks.app.notify).toHaveBeenCalledWith('warn', 'Please specify a worktree directory path');
    fireEvent.change(screen.getByPlaceholderText('../project-worktree-name'), { target: { value: ' /new-review ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Worktree' }));
    await waitFor(() => expect(mocks.api.createWorktree).toHaveBeenCalledWith('HEAD', '/new-review'));
    await waitFor(() => expect(screen.getByPlaceholderText('../project-worktree-name')).toHaveValue(''));
    fireEvent.change(screen.getByPlaceholderText('../project-worktree-name'), { target: { value: '/other' } }); fireEvent.change(screen.getByPlaceholderText('branch-name or commit hash'), { target: { value: ' feature ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Worktree' })); await waitFor(() => expect(mocks.api.createWorktree).toHaveBeenCalledWith('feature', '/other'));
  });
  it.each([{ ok: false, error: 'Branch already checked out' }, { ok: false }])('preserves the creation draft on Git failure %s', async result => {
    mocks.api.createWorktree.mockResolvedValue(result); render(<WorktreesModal />);
    fireEvent.change(screen.getByPlaceholderText('../project-worktree-name'), { target: { value: '/new' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Worktree' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', `Error: ${result.error || 'Failed to create worktree'}`));
    expect(screen.getByPlaceholderText('../project-worktree-name')).toHaveValue('/new');
  });
  it('reports unexpected wrapper errors and restores the add button', async () => {
    mocks.app.runAndRefresh.mockRejectedValue(new Error('Operation unavailable')); render(<WorktreesModal />);
    fireEvent.change(screen.getByPlaceholderText('../project-worktree-name'), { target: { value: '/new' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Worktree' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Error: Operation unavailable')); expect(screen.getByRole('button', { name: 'Add Worktree' })).toBeEnabled();
  });
  it('removes an eligible worktree only after explicit confirmation and reports refusal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); render(<WorktreesModal />);
    fireEvent.click(screen.getByTitle('Remove worktree')); expect(mocks.api.removeWorktree).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByTitle('Remove worktree')); expect(mocks.api.removeWorktree).toHaveBeenCalledWith('/review');
    mocks.api.removeWorktree.mockResolvedValue({ ok: false, error: 'Dirty worktree' }); fireEvent.click(screen.getByTitle('Remove worktree')); await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Error: Dirty worktree'));
    mocks.api.removeWorktree.mockResolvedValue({ ok: false }); fireEvent.click(screen.getByTitle('Remove worktree')); await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Error: Failed to remove worktree'));
  });
  it('shows no-worktrees state and stays hidden when closed', () => {
    mocks.app.worktrees = []; const { container, rerender } = render(<WorktreesModal />); expect(screen.getByText('No linked worktrees found.')).toBeVisible();
    fireEvent.click(container.querySelector('button')!); expect(mocks.app.closeWorktreesModal).toHaveBeenCalledOnce();
    mocks.app.worktreesModalOpen = false; rerender(<WorktreesModal />); expect(container).toBeEmptyDOMElement();
  });
});

describe('InteractiveRebaseModal', () => {
  it('loads commits, reorders, rewords, squashes/fixups and restores a dropped commit before executing', async () => {
    render(<InteractiveRebaseModal />); expect(screen.getByText('Fetching commits in range...')).toBeVisible();
    await screen.findByText('First'); expect(mocks.api.getCommitsForRebase).toHaveBeenCalledWith('base-commit');
    expect(screen.getAllByTitle('Move commit earlier (older)')[0]).toBeDisabled(); expect(screen.getAllByTitle('Move commit later (newer)')[2]).toBeDisabled();
    fireEvent.click(screen.getAllByTitle('Move commit later (newer)')[0]); fireEvent.click(screen.getAllByTitle('Move commit earlier (older)')[1]);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'reword' } }); fireEvent.change(screen.getByPlaceholderText('Enter new commit message...'), { target: { value: 'New first message' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'squash' } }); fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'fixup' } });
    expect(screen.getByText('• 2 squashed')).toBeVisible();
    fireEvent.click(screen.getAllByTitle('Drop this commit')[2]); expect(screen.getByText('• 1 dropped')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' })); expect(screen.queryByText('• 1 dropped')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Execute Rebase' }));
    await waitFor(() => expect(mocks.api.executeInteractiveRebase).toHaveBeenCalledWith('base-commit', [{ ...steps[0], action: 'reword', message: 'New first message' }, { ...steps[1], action: 'squash' }, steps[2]]));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('success', 'Interactive rebase completed successfully')); expect(mocks.app.closeRebaseModal).toHaveBeenCalledOnce();
  });
  it('opens the recorded rewrite comparison after a successful history change', async () => {
    mocks.api.executeInteractiveRebase.mockResolvedValue({ ok: true, rewriteId: 'rewrite' }); render(<InteractiveRebaseModal />); await screen.findByText('First'); fireEvent.click(screen.getByRole('button', { name: 'Execute Rebase' }));
    await waitFor(() => expect(mocks.useApp.setState).toHaveBeenCalledWith({ rangeComparisonOpen: true, rangeComparisonId: 'rewrite' })); expect(mocks.app.refresh).toHaveBeenCalledOnce();
  });
  it.each([[[]], [['conflict.ts']]])('pauses a conflicted rebase and opens the first conflict if present (%s)', async files => {
    mocks.api.executeInteractiveRebase.mockResolvedValue({ ok: false, hasConflicts: true }); mocks.api.getRepoOperationState.mockResolvedValue({ conflictedFiles: files });
    render(<InteractiveRebaseModal />); await screen.findByText('First'); fireEvent.click(screen.getByRole('button', { name: 'Execute Rebase' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Rebase paused due to merge conflicts. Please resolve conflicts.'));
    if (files.length) expect(mocks.app.openConflictResolver).toHaveBeenCalledWith('conflict.ts'); else expect(mocks.app.openConflictResolver).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, error: 'Unsafe rebase' }, { ok: false }, new Error('Git unavailable'), 'unexpected failure'])('reports unsuccessful rebase %s', async result => {
    if (result instanceof Error || typeof result === 'string') mocks.api.executeInteractiveRebase.mockRejectedValue(result); else mocks.api.executeInteractiveRebase.mockResolvedValue(result);
    render(<InteractiveRebaseModal />); await screen.findByText('First'); fireEvent.click(screen.getByRole('button', { name: 'Execute Rebase' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', result instanceof Error ? 'Rebase failed: Git unavailable' : typeof result === 'string' ? 'Rebase failed: unexpected failure' : result.error || 'Rebase failed'));
    expect(mocks.app.closeRebaseModal).not.toHaveBeenCalled();
  });
  it('handles an empty/loading-error range, cancellation and a closed modal', async () => {
    mocks.app.rebaseModalBaseCommit = null; const { container, rerender, unmount } = render(<InteractiveRebaseModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.rebaseModalBaseCommit = 'base-commit'; mocks.api.getCommitsForRebase.mockResolvedValue([]); rerender(<InteractiveRebaseModal />);
    await screen.findByText('No commits found between base-co and HEAD.'); expect(screen.getByRole('button', { name: 'Execute Rebase' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(mocks.app.closeRebaseModal).toHaveBeenCalledOnce(); unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {}); mocks.api.getCommitsForRebase.mockRejectedValue(new Error('Invalid base')); render(<InteractiveRebaseModal />);
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Failed to load commits: Error: Invalid base'));
  });
  it('disables executing controls while a rebase is in flight', async () => {
    let resolve!: (result: any) => void; mocks.api.executeInteractiveRebase.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<InteractiveRebaseModal />); await screen.findByText('First'); fireEvent.click(screen.getByRole('button', { name: 'Execute Rebase' }));
    expect(screen.getByRole('button', { name: 'Rebasing...' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => resolve({ ok: true }));
  });
});
