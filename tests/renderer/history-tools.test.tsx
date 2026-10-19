// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ state: {} as Record<string, any>, api: Object.fromEntries(['getBisectState', 'startBisect', 'stepBisect', 'resetBisect', 'getReflog', 'createRecoveryBranch', 'restoreHeadFromReflog'].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/store', () => ({ WIP_HASH: 'WIP', useApp: Object.assign((select: (state: any) => any) => select(mock.state), { getState: () => mock.state }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
import { BisectModal } from '../../src/renderer/components/Bisect/BisectModal';
import { ReflogModal } from '../../src/renderer/components/Reflog/ReflogModal';
const commit = { hash: 'abc123full', shortHash: 'abc123', message: 'Regression commit', authorName: 'Alice', authorEmail: 'alice@example.invalid', date: '2026-10-19', body: 'Detailed commit body' };
const entries = () => [
  { hash: 'abc123full', shortHash: 'abc123', ref: 'HEAD', date: '2026-10-19T12:00:00Z', action: 'checkout: moving from deleted-feature to main', subject: 'Feature tip' },
  { hash: 'def456full', shortHash: 'def456', ref: 'refs/heads/main', date: '', action: 'commit: old subject', subject: 'Older commit' },
  { hash: 'fed321full', shortHash: 'fed321', ref: 'refs/remotes/origin/main', date: 'invalid', action: 'checkout: moving from abc12345 to main', subject: 'Another entry' }
];
beforeEach(() => {
  Object.assign(mock.state, { bisectModalOpen: true, reflogModalOpen: true, selectedCommit: 'abc123full', status: { currentBranch: 'main', staged: [], unstaged: [] }, operationState: null, branches: { local: [{ name: 'main' }] }, notify: vi.fn(), closeBisectModal: vi.fn(), closeReflogModal: vi.fn() });
  mock.state.runAndRefresh = vi.fn(async (run: () => any) => { try { await run(); return true; } catch (error) { mock.state.notify('error', String(error)); return false; } });
  Object.values(mock.api).forEach(fn => fn.mockReset());
  mock.api.getBisectState.mockResolvedValue({ active: false }); mock.api.startBisect.mockResolvedValue({ ok: true, state: { active: true, currentCommit: commit, stepInfo: 'Bisecting 3 revisions', log: ['good old', 'bad new'] } });
  mock.api.stepBisect.mockResolvedValue({ ok: true, state: { active: true, currentCommit: commit } }); mock.api.resetBisect.mockResolvedValue({ ok: true });
  mock.api.getReflog.mockResolvedValue(entries()); mock.api.createRecoveryBranch.mockResolvedValue({ ok: true, branchName: 'recovered/feature' }); mock.api.restoreHeadFromReflog.mockResolvedValue({ ok: true, backupBranch: 'backup/tip' });
});
async function startBisect() {
  render(<BisectModal />); await screen.findByDisplayValue('abc123full');
  fireEvent.change(screen.getByPlaceholderText(/e.g. v1.0.0/), { target: { value: ' good-old ' } }); fireEvent.click(screen.getByRole('button', { name: 'Start Bisect' }));
  await screen.findByRole('button', { name: 'Good (No Bug)' });
}

describe('bisect wizard', () => {
  it('stays hidden while closed and prefills real selected commits but not WIP', async () => {
    mock.state.bisectModalOpen = false; const { container, rerender } = render(<BisectModal />); expect(container).toBeEmptyDOMElement();
    mock.state.bisectModalOpen = true; mock.state.selectedCommit = 'WIP'; rerender(<BisectModal />); await act(async () => {}); expect(screen.getByPlaceholderText('HEAD, branch, or commit hash')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(mock.state.closeBisectModal).toHaveBeenCalledOnce();
  });
  it('requires both boundaries, trims input, then displays test revision and history', async () => {
    await startBisect(); expect(mock.api.startBisect).toHaveBeenCalledWith('abc123full', 'good-old'); expect(screen.getByText('Bisecting 3 revisions')).toBeVisible();
    expect(screen.getByText('good old')).toBeVisible(); expect(screen.getByText('Regression commit')).toBeVisible(); expect(mock.state.runAndRefresh).toHaveBeenCalled();
  });
  it.each([['good', 'Good (No Bug)'], ['bad', 'Bad (Bug Present)'], ['skip', 'Skip Commit']])('submits a %s verdict', async (verdict, label) => {
    await startBisect(); fireEvent.click(screen.getByRole('button', { name: label })); await waitFor(() => expect(mock.api.stepBisect).toHaveBeenCalledWith(verdict));
    await waitFor(() => expect(mock.state.runAndRefresh).toHaveBeenLastCalledWith(expect.any(Function), `Marked commit as ${verdict}`));
  });
  it.each(['needsGood', 'needsBad'])('sets only the missing %s boundary in an existing session', async missing => {
    mock.api.getBisectState.mockResolvedValue({ active: true, [missing]: true }); render(<BisectModal />); await screen.findByRole('button', { name: 'Set Boundary' });
    if (missing === 'needsGood') fireEvent.change(screen.getByPlaceholderText(/e.g. v1.0.0/), { target: { value: 'good' } });
    else fireEvent.change(screen.getByPlaceholderText('HEAD, branch, or commit hash'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set Boundary' })); await waitFor(() => expect(mock.api.startBisect).toHaveBeenCalledWith(...(missing === 'needsGood' ? [undefined, 'good'] : ['bad', undefined])));
  });
  it('displays culprit details and resets the session only on explicit action', async () => {
    mock.api.getBisectState.mockResolvedValue({ active: true, culpritCommit: commit }); render(<BisectModal />); await screen.findByText('Culprit Found');
    expect(screen.getByText('Detailed commit body')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Finish & Reset HEAD' }));
    await waitFor(() => expect(mock.api.resetBisect).toHaveBeenCalledOnce()); expect(mock.state.closeBisectModal).toHaveBeenCalledOnce();
  });
  it('explains ambiguous skipped revisions and offers reset', async () => {
    mock.api.getBisectState.mockResolvedValue({ active: true, ambiguousCommits: ['one', 'two'] }); render(<BisectModal />); await screen.findByText('Skipped commits prevent identifying a single culprit.');
    expect(screen.getByText('one')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Abort & Reset Bisect' })); await waitFor(() => expect(mock.state.closeBisectModal).toHaveBeenCalledOnce());
  });
  it.each([{ ok: false, error: 'dirty worktree' }, { ok: false }, new Error('offline')])('shows start errors and re-enables the controls %#', async result => {
    if (result instanceof Error) mock.api.startBisect.mockRejectedValue(result); else mock.api.startBisect.mockResolvedValue(result);
    render(<BisectModal />); fireEvent.change(screen.getByPlaceholderText(/e.g. v1.0.0/), { target: { value: 'old' } }); fireEvent.click(screen.getByRole('button', { name: 'Start Bisect' }));
    await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', expect.stringMatching(/dirty worktree|Failed to start|offline/))); expect(screen.getByRole('button', { name: 'Start Bisect' })).toBeEnabled();
  });
  it.each(['good', 'bad', 'skip'])('reports failed %s verdicts and preserves the active session', async verdict => {
    await startBisect(); mock.api.stepBisect.mockResolvedValueOnce({ ok: false }); fireEvent.click(screen.getByRole('button', { name: verdict === 'good' ? 'Good (No Bug)' : verdict === 'bad' ? 'Bad (Bug Present)' : 'Skip Commit' }));
    await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', expect.stringContaining(`Failed to mark ${verdict}`))); expect(mock.state.closeBisectModal).not.toHaveBeenCalled();
  });
  it('handles failed state refresh and reset without closing the active session', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}); mock.api.getBisectState.mockRejectedValueOnce(new Error('state failure'));
    const first = render(<BisectModal />); await waitFor(() => expect(error).toHaveBeenCalled()); first.unmount();
    mock.api.getBisectState.mockResolvedValue({ active: true }); render(<BisectModal />); await screen.findByRole('button', { name: 'Abort & Reset Bisect' });
    mock.api.resetBisect.mockResolvedValueOnce({ ok: false }); fireEvent.click(screen.getByRole('button', { name: 'Abort & Reset Bisect' })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', expect.stringContaining('Failed to reset'))); expect(mock.state.closeBisectModal).not.toHaveBeenCalled();
    mock.api.resetBisect.mockRejectedValueOnce(new Error('reset failure')); fireEvent.click(screen.getByRole('button', { name: 'Abort & Reset Bisect' })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', 'Error: reset failure'));
  });
});

describe('reflog recovery workspace', () => {
  it('stays hidden when closed and lists local history with safe date/branch fallbacks', async () => {
    mock.state.reflogModalOpen = false; const { container, rerender } = render(<ReflogModal />); expect(container).toBeEmptyDOMElement();
    mock.state.reflogModalOpen = true; rerender(<ReflogModal />); expect(screen.getByText('Reading local reflog…')).toBeVisible(); await screen.findByText('3 entries shown');
    expect(screen.getAllByText('Date unavailable')).toHaveLength(2); await waitFor(() => expect(screen.getByLabelText('Branch name')).toHaveValue('deleted-feature'));
    fireEvent.click(screen.getByTitle('Another entry')); expect(screen.getByLabelText('Branch name')).toHaveValue('recovered/fed321-invalid');
  });
  it('searches branch, action, subject or hash, and handles empty filters/history', async () => {
    render(<ReflogModal />); await screen.findByText('3 entries shown'); const input = screen.getByPlaceholderText(/Filter by branch/);
    for (const query of ['deleted-feature', 'Feature tip', 'abc123full']) { fireEvent.change(input, { target: { value: query } }); expect(screen.getByText('1 entry shown')).toBeVisible(); }
    fireEvent.change(input, { target: { value: 'missing' } }); expect(screen.getByText('No reflog entries match that filter.')).toBeVisible();
    fireEvent.change(input, { target: { value: '' } }); mock.api.getReflog.mockResolvedValue([]); fireEvent.click(screen.getByTitle('Refresh reflog')); await screen.findByText('No reflog entries are available for this repository yet.');
  });
  it('updates the suggested recovery name between distinct reflog entries at the same commit', async () => {
    mock.api.getReflog.mockResolvedValue([entries()[0], { ...entries()[0], action: 'checkout: moving from other-feature to main', subject: 'Same commit, another branch movement' }]);
    render(<ReflogModal />); await waitFor(() => expect(screen.getByLabelText('Branch name')).toHaveValue('deleted-feature'));
    fireEvent.click(screen.getByTitle('Same commit, another branch movement'));
    expect(screen.getByLabelText('Branch name')).toHaveValue('other-feature');
  });
  it('preserves selected entries when refreshing and ignores stale responses after closing', async () => {
    const { unmount } = render(<ReflogModal />); await screen.findByText('3 entries shown'); fireEvent.click(screen.getByTitle('Older commit'));
    fireEvent.click(screen.getByTitle('Refresh reflog')); await waitFor(() => expect(screen.getByLabelText('Branch name')).toHaveValue('recovered/def456-commit'));
    let resolve!: (value: unknown) => void; mock.api.getReflog.mockReturnValueOnce(new Promise(done => { resolve = done; })); fireEvent.click(screen.getByTitle('Refresh reflog')); unmount();
    await act(async () => resolve(entries())); expect(screen.queryByText('Reflog & Recovery')).not.toBeInTheDocument();
  });
  it('creates an explicitly named recovery branch and reports provider errors', async () => {
    render(<ReflogModal />);
    await waitFor(() => expect(screen.getByLabelText('Branch name')).toHaveValue('deleted-feature'));
    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'saved-work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create recovery branch' })); await waitFor(() => expect(mock.api.createRecoveryBranch).toHaveBeenCalledWith('abc123full', 'saved-work'));
    await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('success', 'Saved as recovered/feature'));
    mock.api.createRecoveryBranch.mockResolvedValueOnce({ ok: false }); fireEvent.click(screen.getByRole('button', { name: 'Create recovery branch' })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', expect.stringContaining('Could not create a recovery branch')));
    mock.api.createRecoveryBranch.mockResolvedValueOnce({ ok: true }); fireEvent.click(screen.getByRole('button', { name: 'Create recovery branch' })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('success', 'Saved abc123 as a recovery branch'));
  });
  it('requires confirmation, creates a backup and closes after successfully restoring', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); render(<ReflogModal />); await screen.findByLabelText('Branch name');
    fireEvent.click(screen.getByRole('button', { name: 'Restore current branch' })); expect(mock.api.restoreHeadFromReflog).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Restore current branch' })); await waitFor(() => expect(mock.api.restoreHeadFromReflog).toHaveBeenCalledWith('abc123full'));
    expect(mock.state.notify).toHaveBeenCalledWith('info', 'Previous tip saved as backup/tip'); expect(mock.state.closeReflogModal).toHaveBeenCalledOnce();
  });
  it.each(['detached', 'staged', 'unstaged', 'merge', 'rebase', 'cherry-pick', 'loading'])('blocks unsafe restore while %s', async condition => {
    if (condition === 'detached') mock.state.status.currentBranch = 'detached HEAD';
    if (condition === 'staged') mock.state.status.staged = [{ path: 'file' }];
    if (condition === 'unstaged') mock.state.status.unstaged = [{ path: 'file' }];
    if (condition === 'loading') mock.state.status = null;
    if (['merge', 'rebase', 'cherry-pick'].includes(condition)) mock.state.operationState = { [condition === 'merge' ? 'inMerge' : condition === 'rebase' ? 'inRebase' : 'inCherryPick']: true };
    render(<ReflogModal />); await screen.findByLabelText('Branch name'); expect(screen.getByRole('button', { name: 'Restore current branch' })).toBeDisabled();
    if (condition === 'loading') expect(screen.getByText('Repository status is still loading.')).toBeVisible();
  });
  it('reports refresh/restore errors and closes through header or backdrop only', async () => {
    const { container } = render(<ReflogModal />); await screen.findByLabelText('Branch name');
    mock.api.getReflog.mockRejectedValueOnce(new Error('read error')); fireEvent.click(screen.getByTitle('Refresh reflog')); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', "Couldn't load the reflog: read error"));
    vi.spyOn(window, 'confirm').mockReturnValue(true); mock.api.restoreHeadFromReflog.mockResolvedValueOnce({ ok: false, error: 'restore denied' }); fireEvent.click(screen.getByRole('button', { name: 'Restore current branch' }));
    await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', 'Error: restore denied')); expect(mock.state.closeReflogModal).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('Reflog & Recovery')); expect(mock.state.closeReflogModal).not.toHaveBeenCalled(); fireEvent.mouseDown(container.firstChild!); fireEvent.click(screen.getByTitle('Close')); expect(mock.state.closeReflogModal).toHaveBeenCalledTimes(2);
  });
});
