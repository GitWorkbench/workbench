// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../src/shared/types';
const mock = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), release: vi.fn(), listener: null as null | ((state: AppUpdateState) => void) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { getAppUpdateState: mock.get, onAppUpdateState: mock.subscribe, checkForAppUpdates: mock.check, downloadAppUpdate: mock.download, installAppUpdate: mock.install, openAppReleasePage: mock.release } }));
import { connectAppUpdates, useAppUpdates } from '../../src/renderer/store/appUpdates';
import { AppUpdateNotice } from '../../src/renderer/components/Updates/AppUpdateNotice';
const initial: AppUpdateState = { status: 'idle', currentVersion: '1.1.0', canInstallInApp: true };
const available: AppUpdateState = { ...initial, status: 'available', availableVersion: '1.2.0', releaseNotes: '<p>Improved terminal</p><script>bad()</script>' };
const receive = (state: AppUpdateState) => act(() => useAppUpdates.getState().receive(state));
beforeEach(() => {
  vi.clearAllMocks();
  useAppUpdates.setState({ update: null, dialogOpen: false, busy: false, dismissedVersion: null, actionError: null });
  mock.get.mockReset().mockResolvedValue(initial); mock.download.mockReset().mockResolvedValue({ ...available, status: 'downloaded' }); mock.check.mockReset().mockResolvedValue(available);
  mock.install.mockReset().mockResolvedValue(true); mock.release.mockReset().mockResolvedValue(undefined);
  mock.subscribe.mockImplementation(listener => { mock.listener = listener; return mock.unsubscribe; });
});

describe('startup update notification', () => {
  it('subscribes before reading the snapshot and ignores stale snapshots and late callbacks', async () => {
    let resolve!: (state: AppUpdateState) => void; mock.get.mockReturnValue(new Promise<AppUpdateState>(done => { resolve = done; }));
    const disconnect = connectAppUpdates(); expect(mock.subscribe.mock.invocationCallOrder[0]).toBeLessThan(mock.get.mock.invocationCallOrder[0]);
    mock.listener!(available); resolve(initial); await Promise.resolve(); expect(useAppUpdates.getState().update).toEqual(available);
    disconnect(); mock.listener!(initial); expect(useAppUpdates.getState().update).toEqual(available); expect(mock.unsubscribe).toHaveBeenCalledOnce();
    const second = connectAppUpdates(); second(); await Promise.resolve(); expect(useAppUpdates.getState().update).toEqual(available);
  });
  it('stays quiet for up-to-date, unsupported and offline startup results', async () => {
    const { rerender } = render(<AppUpdateNotice ready />); await act(async () => {});
    for (const update of [{ ...initial, status: 'not-available' }, { ...initial, status: 'unsupported' }, { ...initial, status: 'error', error: 'Offline' }] as AppUpdateState[]) {
      receive(update); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
    mock.get.mockRejectedValueOnce(new Error('bridge unavailable')); rerender(<AppUpdateNotice ready={false} />);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('defers the prompt until ready, skips this version for the session and can reopen it', async () => {
    mock.get.mockResolvedValue(available); const { rerender } = render(<AppUpdateNotice ready={false} />); await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); rerender(<AppUpdateNotice ready />);
    expect(screen.getByRole('dialog')).toHaveFocus(); expect(screen.getByText('Git Workbench v1.2.0 · Installed v1.1.0')).toBeVisible();
    expect(screen.getByText('Improved terminal')).toBeInTheDocument(); expect(screen.queryByText('bad()')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Skip for now')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    receive(available); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); act(() => useAppUpdates.getState().show()); expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    receive({ ...available, availableVersion: '1.3.0' }); expect(screen.getByRole('dialog')).toBeVisible();
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('downloads only on click, reports progress, and requires an explicit restart', async () => {
    render(<AppUpdateNotice ready />); await act(async () => {}); receive(available);
    fireEvent.click(screen.getByText('Download update')); await screen.findByText('Restart and install'); expect(mock.download).toHaveBeenCalledOnce(); expect(mock.install).not.toHaveBeenCalled();
    receive({ ...available, status: 'downloading', progress: 42.9 }); expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42'); expect(screen.getByText('Downloading 42%')).toBeDisabled();
    receive({ ...available, status: 'downloading' }); expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    receive({ ...available, status: 'installing' }); expect(screen.getByText('Installing…')).toBeDisabled();
    receive({ ...available, status: 'downloaded' }); fireEvent.click(screen.getByText('Restart and install')); await waitFor(() => expect(mock.install).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByText('Later')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('uses a manual macOS download and handles release-page failures inline', async () => {
    render(<AppUpdateNotice ready />); await act(async () => {}); receive({ ...available, canInstallInApp: false, releaseNotes: undefined });
    fireEvent.click(screen.getByText('Download for macOS')); await waitFor(() => expect(mock.release).toHaveBeenCalledOnce()); expect(mock.download).not.toHaveBeenCalled();
    mock.release.mockRejectedValueOnce(new Error('browser blocked')); fireEvent.click(screen.getByText('Release page')); expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the release page');
    fireEvent.click(screen.getByLabelText('Close update notification')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps keyboard focus inside the prompt and restores focus on dismissal', async () => {
    const button = document.createElement('button'); document.body.append(button); button.focus();
    render(<AppUpdateNotice ready />); await act(async () => {}); receive(available);
    const dialog = screen.getByRole('dialog'); const first = screen.getByLabelText('Close update notification'), last = screen.getByText('Download update');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus(); fireEvent.keyDown(first, { key: 'Tab' }); fireEvent.keyDown(dialog, { key: 'x' });
    fireEvent.click(first); expect(button).toHaveFocus(); button.remove();
  });
  it('shows checking, update errors and a changed up-to-date result without starting a second action', async () => {
    render(<AppUpdateNotice ready />); await act(async () => {}); receive(available);
    receive({ ...available, status: 'checking' }); expect(screen.getByText('Checking…')).toBeDisabled();
    receive({ ...available, status: 'error', error: 'Network down', errorStage: 'download' }); expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    receive({ ...initial, status: 'not-available' }); expect(screen.getByText('You’re up to date.')).toBeVisible(); expect(screen.getByText('Download update')).toBeDisabled();
  });
});

describe('explicit update actions', () => {
  it('does nothing without an update or during an existing action', async () => {
    await useAppUpdates.getState().act(); useAppUpdates.setState({ update: available, busy: true }); await useAppUpdates.getState().act(); expect(mock.download).not.toHaveBeenCalled();
    useAppUpdates.setState({ update: null }); useAppUpdates.getState().dismiss(); expect(useAppUpdates.getState().dismissedVersion).toBeNull();
  });
  it('rechecks a failed download and preserves a failed installation for retry', async () => {
    receive({ ...available, status: 'error', errorStage: 'download' }); await useAppUpdates.getState().act(); expect(mock.check).toHaveBeenCalledOnce(); expect(mock.download).toHaveBeenCalledOnce();
    mock.install.mockResolvedValueOnce(false); receive({ ...available, status: 'error', errorStage: 'install' }); await useAppUpdates.getState().act(); expect(useAppUpdates.getState().actionError).toContain('Installation could not start');
    mock.install.mockRejectedValueOnce(new Error('permission denied')); await useAppUpdates.getState().act(); expect(useAppUpdates.getState().actionError).toBe('permission denied');
    mock.install.mockRejectedValueOnce(null); await useAppUpdates.getState().act(); expect(useAppUpdates.getState().actionError).toContain('action failed');
    mock.check.mockResolvedValueOnce({ ...initial, status: 'not-available' }); receive({ ...available, status: 'error', errorStage: 'download' }); await useAppUpdates.getState().act(); expect(mock.download).toHaveBeenCalledOnce();
  });
  it('keeps connection failures quiet and cancels unresolved snapshots on unmount', async () => {
    mock.get.mockRejectedValueOnce(new Error('IPC unavailable')); const first = connectAppUpdates(); await Promise.resolve(); first(); expect(useAppUpdates.getState().dialogOpen).toBe(false);
    let resolve!: (state: AppUpdateState) => void; mock.get.mockReturnValueOnce(new Promise<AppUpdateState>(done => { resolve = done; })); const second = connectAppUpdates(); second(); resolve(available); await Promise.resolve(); expect(useAppUpdates.getState().update).toBeNull();
  });
});
