// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RangeComparison, RestorePoint, RewriteSession } from '../../src/shared/types';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  return { app, useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    api: Object.fromEntries(['listRestorePoints', 'createRestorePoint', 'restorePoint', 'deleteRestorePoint', 'getResolutionMemory', 'setResolutionMemory', 'listRewriteSessions', 'compareCommitRanges', 'deleteRewriteSession'].map(name => [name, vi.fn()])) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { RestorePointsModal } from '../../src/renderer/components/Reflog/RestorePointsModal';
import { ResolutionMemoryModal } from '../../src/renderer/components/ConflictResolver/ResolutionMemoryModal';
import { RangeComparisonModal } from '../../src/renderer/components/Rebase/RangeComparisonModal';

const point = (patch: Partial<RestorePoint> = {}): RestorePoint => ({ id: 'p1', label: 'Before rewrite', branch: 'main', head: 'abcdef1234567890', createdAt: '2026-10-19T10:00:00Z', worktree: '/repo', status: ' M file.ts', untrackedCount: 1, unborn: false, ...patch });
const session = (patch: Partial<RewriteSession> = {}): RewriteSession => ({ id: 'rewrite-1', branch: 'feature', worktree: '/repo', operation: 'rebase', status: 'completed', createdAt: '2026-10-19T10:00:00Z', oldBase: 'old-base', oldTip: 'old-tip', newBase: 'new-base', newTip: 'new-tip', ...patch });
const comparison = (patch: Partial<RangeComparison> = {}): RangeComparison => ({ oldBase: 'old-base', oldTip: 'old-tip', newBase: 'new-base', newTip: 'new-tip', beforeCount: 3, afterCount: 3, warning: 'Patch matching is heuristic', raw: 'raw git output', entries: [
  { before: 1, after: 1, kind: 'unchanged', oldHash: 'old-1', newHash: 'new-1', subject: 'Same patch', patch: '' },
  { before: 2, after: 2, kind: 'changed', oldHash: 'old-2', newHash: 'new-2', subject: 'Updated patch', patch: '-before\n+after' },
  { before: 3, after: null, kind: 'removed', oldHash: 'old-3', subject: 'Removed patch', patch: '' },
  { before: null, after: 3, kind: 'added', newHash: 'new-3', subject: 'Added patch', patch: '' }
], ...patch });
beforeEach(() => {
  Object.assign(mocks.app, { activeTab: '/repo', restorePointsOpen: true, resolutionMemoryOpen: true, rangeComparisonOpen: true, rangeComparisonId: null, refresh: vi.fn().mockResolvedValue(undefined), notify: vi.fn(), selectCommit: vi.fn() });
  mocks.useApp.setState.mockClear();
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.listRestorePoints.mockResolvedValue([point()]); mocks.api.createRestorePoint.mockResolvedValue(point({ id: 'new' })); mocks.api.restorePoint.mockResolvedValue({ branch: 'recovery/main' }); mocks.api.deleteRestorePoint.mockResolvedValue({ ok: true });
  mocks.api.getResolutionMemory.mockResolvedValue({ enabled: true, gitAutomatic: false, remembered: 2 }); mocks.api.setResolutionMemory.mockImplementation(async enabled => ({ enabled, gitAutomatic: false, remembered: 2 }));
  mocks.api.listRewriteSessions.mockResolvedValue([session()]); mocks.api.compareCommitRanges.mockResolvedValue(comparison()); mocks.api.deleteRewriteSession.mockResolvedValue({ ok: true });
});

describe('RestorePointsModal', () => {
  it('only renders for the active repository and closes on request', async () => {
    mocks.app.activeTab = null; const { container, rerender } = render(<RestorePointsModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.activeTab = '/repo'; mocks.app.restorePointsOpen = false; rerender(<RestorePointsModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.restorePointsOpen = true; rerender(<RestorePointsModal />); await screen.findByRole('heading', { name: 'Before rewrite' });
    expect(screen.getByText('main · abcdef123456')).toBeVisible(); expect(screen.getByText('1 untracked files included')).toBeVisible();
    fireEvent.click(screen.getByTitle('Close')); expect(mocks.useApp.setState).toHaveBeenCalledWith({ restorePointsOpen: false });
  });
  it('handles an empty list and saves named manual restore points then refreshes repository state', async () => {
    mocks.api.listRestorePoints.mockResolvedValueOnce([]).mockResolvedValueOnce([point({ id: 'new', label: 'Manual' })]);
    render(<RestorePointsModal />); await screen.findByText('No restore points yet.');
    fireEvent.change(screen.getByPlaceholderText('Optional name for a manual restore point'), { target: { value: 'Manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save point' })); await screen.findByText('Restore point saved.');
    expect(mocks.api.createRestorePoint).toHaveBeenCalledWith('Manual'); expect(mocks.app.refresh).toHaveBeenCalledOnce(); expect(screen.getByPlaceholderText('Optional name for a manual restore point')).toHaveValue('');
  });
  it('requires explicit restore/delete confirmation and shows clean/unborn point details', async () => {
    mocks.api.listRestorePoints.mockResolvedValue([point(), point({ id: 'p2', label: 'Before first commit', unborn: true, status: '' })]);
    render(<RestorePointsModal />); await screen.findByRole('heading', { name: 'Before rewrite' });
    fireEvent.click(screen.getByRole('button', { name: /Before first commit/ }));
    expect(screen.getByText('main · Before the first commit')).toBeVisible(); expect(screen.getByText('Clean working tree — HEAD is preserved.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restore into new branch' }));
    expect(mocks.api.restorePoint).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm restore' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore into new branch' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await screen.findByText('Restored. The saved point is still available.'); expect(mocks.api.restorePoint).toHaveBeenCalledWith('p2'); expect(mocks.app.notify).toHaveBeenCalledWith('success', 'Restored into recovery/main');
    fireEvent.click(screen.getByRole('button', { name: 'Delete point' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await screen.findByText('Restore point deleted.'); expect(mocks.api.deleteRestorePoint).toHaveBeenCalledWith('p2');
  });
  it('reports load or restore errors and refreshes after a failed operation', async () => {
    mocks.api.listRestorePoints.mockRejectedValueOnce(new Error('Cannot list snapshots')).mockResolvedValue([point()]);
    render(<RestorePointsModal />); expect(await screen.findByRole('status')).toHaveTextContent('Error: Cannot list snapshots');
    fireEvent.click(screen.getByTitle('Refresh points')); await screen.findByRole('heading', { name: 'Before rewrite' });
    mocks.api.restorePoint.mockRejectedValue(new Error('Checkout is dirty'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore into new branch' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await screen.findByText('Error: Checkout is dirty'); expect(mocks.app.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('ResolutionMemoryModal', () => {
  it('loads current settings, explains Git automatic rerere and toggles opt-in memory', async () => {
    mocks.api.getResolutionMemory.mockResolvedValue({ enabled: true, gitAutomatic: true, remembered: 7 });
    render(<ResolutionMemoryModal />);
    expect(screen.getByRole('checkbox', { name: 'Remember and suggest resolutions' })).toBeDisabled();
    await screen.findByText(/7 remembered conflict patterns/);
    expect(screen.getByText(/Git’s own automatic rerere is also enabled/)).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember and suggest resolutions' }));
    await waitFor(() => expect(mocks.api.setResolutionMemory).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    fireEvent.click(screen.getByTitle('Close')); expect(mocks.useApp.setState).toHaveBeenCalledWith({ resolutionMemoryOpen: false });
  });
  it('shows initial and save errors while restoring enabled controls', async () => {
    mocks.api.getResolutionMemory.mockRejectedValueOnce(new Error('Memory unavailable'));
    const { unmount } = render(<ResolutionMemoryModal />); expect(await screen.findByRole('alert')).toHaveTextContent('Error: Memory unavailable'); unmount();
    mocks.api.getResolutionMemory.mockResolvedValue({ enabled: false, remembered: 0, gitAutomatic: false }); mocks.api.setResolutionMemory.mockRejectedValue(new Error('Config read-only'));
    render(<ResolutionMemoryModal />); await screen.findByText(/0 remembered conflict patterns/); fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: Config read-only'); expect(screen.getByRole('checkbox')).toBeEnabled();
  });
  it('does not render without a repository or when closed', () => {
    mocks.app.activeTab = null; const { container, rerender } = render(<ResolutionMemoryModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.activeTab = '/repo'; mocks.app.resolutionMemoryOpen = false; rerender(<ResolutionMemoryModal />); expect(container).toBeEmptyDOMElement();
  });
});

describe('RangeComparisonModal', () => {
  it('loads a saved completed rewrite automatically and filters patch matches', async () => {
    render(<RangeComparisonModal />);
    await screen.findByText('3 → 3 commits'); expect(mocks.api.compareCommitRanges).toHaveBeenCalledWith({ oldBase: 'old-base', oldTip: 'old-tip', newBase: 'new-base', newTip: 'new-tip' });
    expect(screen.getByText('The patch, message, and author match. Commit hashes or positions may differ.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'changed (1)' })); expect(screen.getByRole('heading', { name: 'changed: Updated patch' })).toBeVisible();
    expect(screen.getByText(/-before.*\+after/s)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'removed (1)' })); expect(screen.getByText('This commit has no paired patch to compare. Inspect its full commit below.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'all (4)' })); fireEvent.click(screen.getByRole('button', { name: /added.*Added patch/ }));
    expect(screen.getByRole('heading', { name: 'added: Added patch' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect new commit' })); expect(mocks.app.selectCommit).toHaveBeenCalledWith('new-3');
    expect(mocks.useApp.setState).toHaveBeenCalledWith({ rangeComparisonOpen: false, rangeComparisonId: null });
  });
  it('inspects old commits and copies complete raw comparison output with error feedback', async () => {
    render(<RangeComparisonModal />); await screen.findByText('3 → 3 commits');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect old commit' })); expect(mocks.app.selectCommit).toHaveBeenCalledWith('old-1');
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy raw output' })); await screen.findByText('Raw comparison copied.'); expect(writeText).toHaveBeenCalledWith('raw git output');
    writeText.mockRejectedValue(new Error('Clipboard unavailable')); fireEvent.click(screen.getByRole('button', { name: 'Copy raw output' })); await screen.findByText('Error: Clipboard unavailable');
  });
  it('accepts custom ranges and reports compare failures', async () => {
    mocks.api.listRewriteSessions.mockResolvedValue([]); render(<RangeComparisonModal />);
    await waitFor(() => expect(mocks.api.listRewriteSessions).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Compare ranges' })).toBeDisabled();
    for (const [name, value] of [['Before base', 'a'], ['Before tip', 'b'], ['After base', 'c'], ['After tip', 'd']]) fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
    mocks.api.compareCommitRanges.mockRejectedValueOnce(new Error('Unknown revision')); fireEvent.click(screen.getByRole('button', { name: 'Compare ranges' }));
    await screen.findByText('Error: Unknown revision');
    fireEvent.click(screen.getByRole('button', { name: 'Compare ranges' })); await screen.findByText('3 → 3 commits');
    expect(mocks.api.compareCommitRanges).toHaveBeenCalledWith({ oldBase: 'a', oldTip: 'b', newBase: 'c', newTip: 'd' });
  });
  it('renders unfinished or externally ended records and requires confirmation before deleting a record', async () => {
    mocks.api.listRewriteSessions.mockResolvedValue([session({ id: 'paused', status: 'paused', newTip: undefined, error: 'Conflicts' }), session({ id: 'ended', status: 'ended' })]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<RangeComparisonModal />); await screen.findByText('This rebase is still in progress. Finish or abort it, then refresh this view.');
    expect(screen.getByText('paused: Conflicts')).toBeVisible(); expect(screen.getByTitle('Delete comparison record')).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Saved rewrite' }), { target: { value: 'ended' } });
    await screen.findByText('3 → 3 commits'); expect(screen.getByText(/This session ended outside Git Workbench/)).toBeVisible();
    fireEvent.click(screen.getByTitle('Delete comparison record')); expect(mocks.api.deleteRewriteSession).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByTitle('Delete comparison record'));
    await waitFor(() => expect(mocks.api.deleteRewriteSession).toHaveBeenCalledWith('ended'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Saved rewrite' })).toHaveValue(''));
  });
  it('handles empty/unrecognized comparison formats and unmatched filters', async () => {
    mocks.api.compareCommitRanges.mockResolvedValue(comparison({ entries: [], raw: '' }));
    render(<RangeComparisonModal />); await screen.findByText('No commits match this filter.');
    expect(screen.getByText('Select a commit pair to inspect changes.')).toBeVisible();
    const raw = screen.getByText('Raw Git output').closest('details')!; raw.open = true; expect(screen.getByText('(Both ranges are empty.)')).toBeVisible();
    mocks.api.compareCommitRanges.mockResolvedValue(comparison({ entries: [], raw: 'unsupported output' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare ranges' }));
    await screen.findByText('This Git version returned a different output format. Expand raw output below.');
  });
  it('reports record load/refresh/delete errors and supports closing without a repository', async () => {
    mocks.api.listRewriteSessions.mockRejectedValueOnce(new Error('Records unavailable')).mockResolvedValue([session()]);
    const { unmount } = render(<RangeComparisonModal />); await screen.findByText('Error: Records unavailable');
    fireEvent.click(screen.getByTitle('Refresh rewrite records')); await waitFor(() => expect(screen.getByRole('combobox', { name: 'Saved rewrite' }).querySelectorAll('option')).toHaveLength(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Saved rewrite' }), { target: { value: 'rewrite-1' } }); await screen.findByText('3 → 3 commits');
    mocks.api.deleteRewriteSession.mockRejectedValue(new Error('Cannot delete record')); vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTitle('Delete comparison record')); await screen.findByText('Error: Cannot delete record');
    mocks.api.listRewriteSessions.mockRejectedValueOnce(new Error('Refresh unavailable')); fireEvent.click(screen.getByTitle('Refresh rewrite records')); await screen.findByText('Error: Refresh unavailable');
    fireEvent.click(screen.getByTitle('Close')); expect(mocks.useApp.setState).toHaveBeenCalledWith({ rangeComparisonOpen: false, rangeComparisonId: null }); unmount();
    mocks.app.activeTab = null; const { container } = render(<RangeComparisonModal />); expect(container).toBeEmptyDOMElement();
  });
});
