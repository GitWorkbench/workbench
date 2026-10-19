// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LfsState, LfsTransfer, SparseCheckoutState, SparsePreview } from '../../src/shared/types';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  return { app, listener: null as null | ((state: any) => void), off: vi.fn(), useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn((patch: any) => Object.assign(app, patch)) }),
    api: Object.fromEntries(['getLfsState', 'getLfsTransfer', 'onLfsTransfer', 'configureLfs', 'setLfsTracking', 'runLfsTransfer', 'cancelLfsTransfer', 'openExternal', 'getSparseCheckout', 'getSparseDirectories', 'previewSparseCheckout', 'applySparseCheckout', 'restoreSparseLayout'].map(name => [name, vi.fn()])) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { LfsManagerModal } from '../../src/renderer/components/Repository/LfsManagerModal';
import { SparseCheckoutModal } from '../../src/renderer/components/Repository/SparseCheckoutModal';

const lfs = (patch: Partial<LfsState> = {}): LfsState => ({ repo: '/repo', installed: true, version: 'git-lfs/3.7.0', configured: false, head: 'abcdef1234567890', remotes: ['origin', 'backup'], patterns: [], files: [], totalFiles: 0, ...patch });
const transfer = (patch: Partial<LfsTransfer> = {}): LfsTransfer => ({ id: 'transfer-1', repo: '/repo', kind: 'fetch', state: 'running', current: 1, totalFiles: 2, bytes: 512, totalBytes: 2048, file: 'assets/a.psd', message: 'Downloading assets', ...patch });
const sparse = (patch: Partial<SparseCheckoutState> = {}): SparseCheckoutState => ({ repo: '/repo', version: 'git version 2.50', supported: true, head: 'head-hash', fingerprint: 'fp', enabled: true, cone: true, ignoreCase: false, directories: [], rawPatterns: '', backups: [], ...patch });
const preview = (patch: Partial<SparsePreview> = {}): SparsePreview => ({ head: 'head-hash', fingerprint: 'fp', directories: ['src'], disable: false, total: 10, included: 6, excluded: 4, removed: 4, added: 1, removedExamples: ['docs/a.md'], addedExamples: ['src/a.ts'], blockers: [], ...patch });
beforeEach(() => {
  Object.assign(mocks.app, { lfsManagerOpen: true, sparseCheckoutOpen: true, activeTab: '/repo', refresh: vi.fn().mockResolvedValue(undefined) });
  mocks.useApp.setState.mockClear(); mocks.off.mockReset(); mocks.listener = null;
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.getLfsState.mockResolvedValue(lfs()); mocks.api.getLfsTransfer.mockResolvedValue(null);
  mocks.api.onLfsTransfer.mockImplementation(listener => { mocks.listener = listener; return mocks.off; });
  mocks.api.runLfsTransfer.mockResolvedValue(transfer({ state: 'completed' })); mocks.api.cancelLfsTransfer.mockResolvedValue({ ok: true });
  mocks.api.configureLfs.mockResolvedValue(lfs({ configured: true })); mocks.api.setLfsTracking.mockResolvedValue(lfs()); mocks.api.openExternal.mockResolvedValue(undefined);
  mocks.api.getSparseCheckout.mockResolvedValue(sparse());
  mocks.api.getSparseDirectories.mockImplementation(async prefix => prefix ? [] : ['src', 'docs']);
  mocks.api.previewSparseCheckout.mockImplementation(async input => preview(input)); mocks.api.applySparseCheckout.mockResolvedValue(sparse()); mocks.api.restoreSparseLayout.mockResolvedValue(sparse());
});
const lfsReady = async () => screen.findByRole('heading', { name: /Repository setup/ });
const sparseReady = async () => screen.findByText('Sparse folders enabled');

it('reveals sparse folder choices in bounded batches', async () => {
  mocks.api.getSparseDirectories.mockImplementation(async prefix => prefix ? [] : Array.from({ length: 205 }, (_, i) => `folder-${i}`)); render(<SparseCheckoutModal />); await sparseReady(); await screen.findByRole('button', { name: 'Show 100 more (105 remaining)' }); expect(screen.queryByLabelText('Include folder-204')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (105 remaining)' })); fireEvent.click(screen.getByRole('button', { name: 'Show 100 more (5 remaining)' })); expect(screen.queryByRole('button', { name: /Show 100 more/ })).not.toBeInTheDocument();
});

describe('Git LFS manager', () => {
  it('is hidden without an open repository, subscribes to progress and cleans up after closing', async () => {
    mocks.app.activeTab = null; const { container, rerender, unmount } = render(<LfsManagerModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.activeTab = '/repo'; mocks.app.lfsManagerOpen = false; rerender(<LfsManagerModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.lfsManagerOpen = true; rerender(<LfsManagerModal />); await lfsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true })); expect(mocks.useApp.setState).toHaveBeenCalledWith({ lfsManagerOpen: false });
    unmount(); expect(mocks.off).toHaveBeenCalledOnce();
  });
  it('reports loading errors, displays installation guidance and retries on refresh', async () => {
    mocks.api.getLfsState.mockRejectedValueOnce(new Error('LFS unavailable')).mockResolvedValueOnce(lfs({ installed: false, warning: 'Install Git LFS' }));
    render(<LfsManagerModal />); expect(await screen.findByRole('status')).toHaveTextContent('Error: LFS unavailable');
    fireEvent.click(screen.getByTitle('Refresh LFS details'));
    await screen.findByText('Install Git LFS');
    fireEvent.click(screen.getByRole('button', { name: 'Git LFS installation instructions' })); expect(mocks.api.openExternal).toHaveBeenCalledWith('https://git-lfs.com/');
  });
  it('configures smudge behavior and tracks literal filenames without altering old history', async () => {
    render(<LfsManagerModal />); await lfsReady();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Download assets manually (skip automatic smudge)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Configure local LFS' }));
    await waitFor(() => expect(mocks.api.configureLfs).toHaveBeenCalledWith(false));
    await screen.findByText('Local LFS configuration updated.');
    expect(screen.getByRole('button', { name: 'Track', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'LFS tracking pattern' }), { target: { value: 'assets/file[1].psd' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Literal filename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track', exact: true }));
    await waitFor(() => expect(mocks.api.setLfsTracking).toHaveBeenCalledWith('assets/file[1].psd', true, true));
    await screen.findByText('Tracking rule added. Review and commit .gitattributes.');
    expect(screen.getByRole('textbox', { name: 'LFS tracking pattern' })).toHaveValue('');
    expect(mocks.app.refresh).toHaveBeenCalledTimes(2);
  });
  it('only untracks eligible root rules after explicit confirmation', async () => {
    mocks.api.getLfsState.mockResolvedValue(lfs({ configured: true, patterns: [{ pattern: '*.psd', source: '.gitattributes', tracked: true, lockable: true }, { pattern: '*.png', source: 'nested/.gitattributes', tracked: true, lockable: false }, { pattern: '*.jpg', source: '.gitattributes', tracked: false, lockable: false }] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LfsManagerModal />); await lfsReady();
    expect(screen.getAllByRole('button', { name: 'Untrack' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Untrack' })); await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(mocks.api.setLfsTracking).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Untrack' })).toBeEnabled());
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Untrack' }));
    await waitFor(() => expect(mocks.api.setLfsTracking).toHaveBeenCalledWith('*.psd', false));
  });
  it.each([['Fetch to cache', 'fetch'], ['Pull assets', 'pull'], ['Checkout cached', 'checkout'], ['Upload current revision', 'push']])('starts explicit %s against the chosen remote and reviewed revision', async (label, kind) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LfsManagerModal />); await lfsReady();
    fireEvent.change(screen.getByRole('combobox', { name: 'LFS remote' }), { target: { value: 'backup' } });
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(mocks.api.runLfsTransfer).toHaveBeenCalledWith({ kind, remote: 'backup', head: lfs().head }));
  });
  it('does not upload after declined confirmation and disables remote transfers without a remote', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LfsManagerModal />); await lfsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Upload current revision' })); await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce());
    expect(mocks.api.runLfsTransfer).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload current revision' })).toBeEnabled());
    fireEvent.change(screen.getByRole('combobox', { name: 'LFS remote' }), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Fetch to cache' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Checkout cached' })).toBeEnabled();
  });
  it('shows progress only for the current repository and supports transfer cancellation with error feedback', async () => {
    render(<LfsManagerModal />); await lfsReady();
    await act(async () => mocks.listener!(transfer({ repo: '/other' })));
    expect(screen.queryByRole('button', { name: 'Cancel transfer' })).not.toBeInTheDocument();
    await act(async () => mocks.listener!(transfer()));
    expect(screen.getByText('fetch · running')).toBeVisible(); expect(screen.getByText('512 B / 2.0 KB for this file')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '512'); expect(screen.getByTitle('Refresh LFS details')).toBeDisabled();
    mocks.api.cancelLfsTransfer.mockRejectedValue(new Error('Cannot cancel'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel transfer' })); await screen.findByText('Error: Cannot cancel');
    expect(mocks.api.cancelLfsTransfer).toHaveBeenCalledWith('transfer-1');
    await act(async () => mocks.listener!(transfer({ state: 'completed', totalFiles: 0 })));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('filters and sorts assets by size with cache/pointer status and all size units', async () => {
    mocks.api.getLfsState.mockResolvedValue(lfs({ totalFiles: 4, files: [
      { name: 'tiny.psd', oid: '1', size: 1, downloaded: false, checkout: false }, { name: 'small.psd', oid: '2', size: 2048, downloaded: true, checkout: true },
      { name: 'medium.psd', oid: '3', size: 2 * 1024 ** 2, downloaded: true, checkout: false }, { name: 'big.psd', oid: '4', size: 2 * 1024 ** 3, downloaded: false, checkout: true }
    ] }));
    render(<LfsManagerModal />); await lfsReady();
    expect(screen.getByText('2.00 GB')).toBeVisible(); expect(screen.getByText('2.0 MB')).toBeVisible(); expect(screen.getByText('2.0 KB')).toBeVisible(); expect(screen.getByText('1 B')).toBeVisible();
    expect(screen.getAllByRole('row').slice(1).map(row => row.querySelector('td')?.textContent)).toEqual(['big.psd4', 'medium.psd3', 'small.psd2', 'tiny.psd1']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter LFS assets' }), { target: { value: 'MISSING' } });
    expect(screen.getByText('No matching LFS files in this revision.')).toBeVisible();
  });
  it('reports operation failures without leaving the manager busy', async () => {
    mocks.api.configureLfs.mockRejectedValue(new Error('Custom hook exists'));
    render(<LfsManagerModal />); await lfsReady();
    fireEvent.click(screen.getByRole('button', { name: 'Configure local LFS' })); await screen.findByText('Error: Custom hook exists');
    expect(screen.getByRole('button', { name: 'Configure local LFS' })).toBeEnabled();
  });
});

describe('Sparse checkout folder editor', () => {
  it('only opens for an active repository, closes on request and loads an empty revision safely', async () => {
    mocks.app.activeTab = null; const { container, rerender } = render(<SparseCheckoutModal />); expect(container).toBeEmptyDOMElement();
    mocks.app.activeTab = '/repo'; mocks.app.sparseCheckoutOpen = false; rerender(<SparseCheckoutModal />); expect(container).toBeEmptyDOMElement();
    mocks.api.getSparseCheckout.mockResolvedValue(sparse({ head: '', enabled: false })); mocks.app.sparseCheckoutOpen = true; rerender(<SparseCheckoutModal />);
    await screen.findByText('Full checkout'); expect(screen.getByText('No tracked subfolders in this revision.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview selected folders' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true })); expect(mocks.useApp.setState).toHaveBeenCalledWith({ sparseCheckoutOpen: false });
  });
  it('supports tree expansion, inherited selections and manually added paths', async () => {
    mocks.api.getSparseCheckout.mockResolvedValue(sparse({ directories: ['src/nested'] }));
    mocks.api.getSparseDirectories.mockImplementation(async prefix => prefix === 'src' ? ['src/nested', 'src/other'] : prefix ? [] : ['src', 'docs']);
    render(<SparseCheckoutModal />); await sparseReady();
    expect(screen.getByRole('checkbox', { name: 'Include src' })).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(screen.getByTitle('Expand src')); await screen.findByRole('checkbox', { name: 'Include src/nested' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include src' }));
    expect(screen.getByRole('checkbox', { name: 'Include src/nested' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Include src/other' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Remove src/nested' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove src' }));
    expect(screen.getByText('Root files only when applied.')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Repository directory path' }), { target: { value: ' docs/api ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    expect(screen.getByRole('button', { name: 'Remove docs/api' })).toBeVisible(); expect(screen.getByRole('textbox', { name: 'Repository directory path' })).toHaveValue('');
    fireEvent.click(screen.getByTitle('Expand docs')); await screen.findByText('No subfolders');
    fireEvent.click(screen.getByTitle('Expand docs'));
    fireEvent.click(screen.getByTitle('Expand docs')); expect(mocks.api.getSparseDirectories.mock.calls.filter(call => call[0] === 'docs')).toHaveLength(1);
  });
  it('previews selected folders, blocks unsafe paths and applies only after confirmation', async () => {
    mocks.api.previewSparseCheckout.mockResolvedValueOnce(preview({ blockers: ['untracked.txt'] })).mockResolvedValue(preview());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SparseCheckoutModal />); await sparseReady();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include src' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview selected folders' })); await screen.findByText('Selected folder preview');
    expect(mocks.api.previewSparseCheckout).toHaveBeenCalledWith({ head: 'head-hash', fingerprint: 'fp', directories: ['src'], disable: false });
    expect(screen.getByRole('alert')).toHaveTextContent('untracked.txt'); expect(screen.getByRole('button', { name: 'Apply preview' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview selected folders' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Apply preview' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Apply preview' })); await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(mocks.api.applySparseCheckout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply preview' })).toBeEnabled());
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Apply preview' }));
    await screen.findByText('Checkout layout updated. Git history is unchanged.'); expect(mocks.api.applySparseCheckout).toHaveBeenCalledWith(preview()); expect(mocks.app.refresh).toHaveBeenCalledOnce();
  });
  it('previews full checkout and restores saved layouts with confirmation', async () => {
    mocks.api.getSparseCheckout.mockResolvedValue(sparse({ rawPatterns: '/*\n/src/', backups: [{ id: 'old', createdAt: '2026-10-19T10:00:00Z', head: 'old-head', enabled: true, cone: true, directories: ['docs'] }] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SparseCheckoutModal />); await sparseReady();
    fireEvent.click(screen.getByRole('button', { name: 'Preview full checkout' })); await screen.findByText('Full checkout preview');
    expect(mocks.api.previewSparseCheckout).toHaveBeenCalledWith(expect.objectContaining({ disable: true }));
    const details = screen.getByText('Saved layouts · 1').closest('details')!; details.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Restore layout' })); await waitFor(() => expect(confirm).toHaveBeenCalledOnce()); expect(mocks.api.restoreSparseLayout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore layout' })).toBeEnabled());
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Restore layout' }));
    await screen.findByText('Saved checkout layout restored.'); expect(mocks.api.restoreSparseLayout).toHaveBeenCalledWith('old', 'head-hash', 'fp');
    expect(screen.getByText('Current Git sparse patterns')).toBeVisible();
  });
  it('disables unsupported and non-cone folder editing while explaining the existing rules', async () => {
    mocks.api.getSparseCheckout.mockResolvedValue(sparse({ supported: false, cone: false, warning: 'Custom layout detected' }));
    render(<SparseCheckoutModal />); await screen.findByText('Non-cone rules enabled');
    expect(screen.getByText('The folder editor requires Git 2.37 or newer.')).toBeVisible(); expect(screen.getByText('Custom layout detected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview selected folders' })).toBeDisabled(); expect(screen.getByRole('textbox', { name: 'Repository directory path' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Include src' })).toBeDisabled();
  });
  it('reports load, expansion and preview errors and allows refreshing', async () => {
    mocks.api.getSparseCheckout.mockRejectedValueOnce(new Error('Cannot inspect sparse layout')).mockResolvedValue(sparse());
    render(<SparseCheckoutModal />); expect(await screen.findByRole('status')).toHaveTextContent('Error: Cannot inspect sparse layout');
    fireEvent.click(screen.getByTitle('Refresh layout')); await sparseReady();
    mocks.api.getSparseDirectories.mockRejectedValueOnce(new Error('Tree unavailable'));
    fireEvent.click(screen.getByTitle('Expand src')); await screen.findByText('Error: Tree unavailable');
    mocks.api.previewSparseCheckout.mockRejectedValue(new Error('Worktree is dirty'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview selected folders' })); await screen.findByText('Error: Worktree is dirty');
    expect(screen.getByRole('button', { name: 'Preview selected folders' })).toBeEnabled();
  });
});
