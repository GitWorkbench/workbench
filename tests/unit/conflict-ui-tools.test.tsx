// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>, listeners: new Set<() => void>(), close: vi.fn(), run: vi.fn(),
  api: { simulateMerge: vi.fn(), mergeBranch: vi.fn(), getResolutionMemory: vi.fn(), setResolutionMemory: vi.fn() }
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/store', async () => {
  const React = await import('react');
  const useApp = Object.assign((selector: (state: Record<string, any>) => unknown) => React.useSyncExternalStore(
    callback => { mocks.listeners.add(callback); return () => mocks.listeners.delete(callback); }, () => selector(mocks.state)
  ), { setState: (update: Record<string, unknown>) => {
    mocks.state = { ...mocks.state, ...update }; for (const listener of mocks.listeners) listener();
  } });
  return { useApp };
});
import { MergeSimulationModal } from '../../src/renderer/components/ConflictResolver/MergeSimulationModal';
import { ResolutionMemoryModal } from '../../src/renderer/components/ConflictResolver/ResolutionMemoryModal';

function update(values: Record<string, unknown>) { mocks.state = { ...mocks.state, ...values }; for (const listener of mocks.listeners) listener(); }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.listeners.clear();
  mocks.state = { activeTab: '/repo', simulateMergeBranch: null, closeSimulateMerge: mocks.close, status: { currentBranch: 'main' }, runAndRefresh: mocks.run, resolutionMemoryOpen: false };
  mocks.close.mockImplementation(() => update({ simulateMergeBranch: null }));
  mocks.run.mockImplementation(async action => { await action(); return true; });
  mocks.api.simulateMerge.mockResolvedValue({ clean: true, conflicts: [], message: '' });
  mocks.api.mergeBranch.mockResolvedValue(undefined);
  mocks.api.getResolutionMemory.mockResolvedValue({ enabled: false, gitAutomatic: false, remembered: 3 });
  mocks.api.setResolutionMemory.mockResolvedValue({ enabled: true, gitAutomatic: false, remembered: 3 });
});
afterEach(cleanup);

describe('merge simulation interactions', () => {
  it('renders nothing without a selected branch', () => {
    const result = render(<MergeSimulationModal />); expect(result.container).toBeEmptyDOMElement(); expect(mocks.api.simulateMerge).not.toHaveBeenCalled();
  });
  it('disables merge until simulation finishes, then explicitly performs and refreshes', async () => {
    const simulation = deferred<{ clean: boolean; conflicts: string[] }>(); mocks.api.simulateMerge.mockReturnValueOnce(simulation.promise);
    update({ simulateMergeBranch: 'feature' }); render(<MergeSimulationModal />);
    expect(screen.getByText(/Computing 3-way tree merge/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perform Merge' })).toBeDisabled();
    await act(async () => simulation.resolve({ clean: true, conflicts: [] }));
    expect(screen.getByText('Clean Merge Guaranteed')).toBeInTheDocument();
    expect(mocks.api.mergeBranch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Perform Merge' }));
    await waitFor(() => expect(mocks.api.mergeBranch).toHaveBeenCalledExactlyOnceWith('feature'));
    expect(mocks.close).toHaveBeenCalledOnce(); expect(mocks.run).toHaveBeenCalledWith(expect.any(Function), 'Merged feature into main');
  });
  it('lists conflicts and provider explanation before allowing an explicit merge', async () => {
    mocks.api.simulateMerge.mockResolvedValue({ clean: false, conflicts: ['one.ts', 'two.ts'], message: 'Both branches changed these lines.' });
    update({ simulateMergeBranch: 'feature' }); render(<MergeSimulationModal />);
    expect(await screen.findByText('Potential Conflicts Detected')).toBeInTheDocument();
    expect(screen.getByText('Both branches changed these lines.')).toBeInTheDocument();
    expect(screen.getByText('Conflicting Files (2):')).toBeInTheDocument(); expect(screen.getByText('one.ts')).toBeInTheDocument(); expect(screen.getByText('two.ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perform Merge' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(mocks.api.mergeBranch).not.toHaveBeenCalled();
  });
  it('shows default conflict guidance and uses HEAD if no current branch is available', async () => {
    mocks.api.simulateMerge.mockResolvedValue({ clean: false, conflicts: [] });
    update({ simulateMergeBranch: 'feature', status: null }); render(<MergeSimulationModal />);
    expect(await screen.findByText('Merging these branches will require conflict resolution.')).toBeInTheDocument();
    expect(screen.getByText('HEAD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Perform Merge' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith(expect.any(Function), 'Merged feature into HEAD'));
  });
  it('reports simulation errors without changing the repository', async () => {
    mocks.api.simulateMerge.mockRejectedValueOnce(new Error('missing merge base'));
    update({ simulateMergeBranch: 'feature' }); render(<MergeSimulationModal />);
    expect(await screen.findByText('Simulation error: Error: missing merge base')).toBeInTheDocument();
    expect(mocks.api.mergeBranch).not.toHaveBeenCalled();
  });
  it.each(['resolve', 'reject'] as const)('ignores an old branch simulation that later %ss', async completion => {
    const stale = deferred<{ clean: boolean; conflicts: string[] }>();
    mocks.api.simulateMerge.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ clean: false, conflicts: ['current.ts'], message: 'Current branch conflict' });
    update({ simulateMergeBranch: 'old' }); render(<MergeSimulationModal />);
    act(() => update({ simulateMergeBranch: 'new' }));
    await screen.findByText('Current branch conflict');
    await act(async () => { if (completion === 'resolve') stale.resolve({ clean: true, conflicts: [] }); else stale.reject(new Error('stale error')); });
    expect(screen.getByText('Current branch conflict')).toBeInTheDocument();
    expect(screen.queryByText('Clean Merge Guaranteed')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button')[0]); expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('resolution memory settings', () => {
  it('opens only for an active repository and an explicit settings request', () => {
    const rendered = render(<ResolutionMemoryModal />); expect(rendered.container).toBeEmptyDOMElement();
    act(() => update({ resolutionMemoryOpen: true, activeTab: null })); expect(rendered.container).toBeEmptyDOMElement();
    expect(mocks.api.getResolutionMemory).not.toHaveBeenCalled();
  });
  it('loads repository state, reports pattern count, and toggles memory with disabled busy controls', async () => {
    const setting = deferred<{ enabled: boolean; gitAutomatic: boolean; remembered: number }>(); mocks.api.setResolutionMemory.mockReturnValueOnce(setting.promise);
    update({ resolutionMemoryOpen: true }); render(<ResolutionMemoryModal />);
    const checkbox = screen.getByRole('checkbox', { name: /Remember and suggest/ }); expect(checkbox).toBeDisabled();
    await waitFor(() => expect(checkbox).toBeEnabled()); expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/3 remembered conflict patterns/)).toBeInTheDocument();
    fireEvent.click(checkbox); expect(mocks.api.setResolutionMemory).toHaveBeenCalledExactlyOnceWith(true);
    expect(checkbox).toBeDisabled(); expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await act(async () => setting.resolve({ enabled: true, gitAutomatic: true, remembered: 4 }));
    expect(checkbox).toBeChecked(); expect(checkbox).toBeEnabled();
    expect(screen.getByText(/Git’s own automatic rerere is also enabled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(mocks.state.resolutionMemoryOpen).toBe(false);
  });
  it('disables memory while preserving saved patterns', async () => {
    mocks.api.getResolutionMemory.mockResolvedValue({ enabled: true, gitAutomatic: false, remembered: 3 });
    mocks.api.setResolutionMemory.mockResolvedValue({ enabled: false, gitAutomatic: false, remembered: 3 });
    update({ resolutionMemoryOpen: true }); render(<ResolutionMemoryModal />);
    const checkbox = screen.getByRole('checkbox'); await waitFor(() => expect(checkbox).toBeChecked());
    fireEvent.click(checkbox); await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(mocks.api.setResolutionMemory).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByText(/3 remembered conflict patterns/)).toBeInTheDocument();
  });
  it('shows initial-load and update errors without changing the checkbox state', async () => {
    mocks.api.getResolutionMemory.mockRejectedValueOnce(new Error('load denied'));
    update({ resolutionMemoryOpen: true }); const result = render(<ResolutionMemoryModal />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: load denied'); expect(screen.getByRole('checkbox')).toBeDisabled();
    result.unmount(); render(<ResolutionMemoryModal />);
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    mocks.api.setResolutionMemory.mockRejectedValueOnce(new Error('write denied'));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: write denied');
    expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(screen.getByRole('checkbox')).toBeEnabled();
  });
  it.each(['resolve', 'reject'] as const)('discards state for a previous repository that later %ss', async completion => {
    const stale = deferred<{ enabled: boolean; gitAutomatic: boolean; remembered: number }>();
    mocks.api.getResolutionMemory.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ enabled: true, gitAutomatic: false, remembered: 9 });
    update({ resolutionMemoryOpen: true }); render(<ResolutionMemoryModal />);
    act(() => update({ activeTab: '/new-repo' })); await screen.findByText(/9 remembered conflict patterns/);
    await act(async () => { if (completion === 'resolve') stale.resolve({ enabled: false, gitAutomatic: false, remembered: 1 }); else stale.reject(new Error('old error')); });
    expect(screen.getByText(/9 remembered conflict patterns/)).toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
