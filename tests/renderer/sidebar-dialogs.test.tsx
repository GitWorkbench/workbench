// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: Record<string, any> = {};
  return { state, useApp: Object.assign((selector: (state: any) => any) => selector(state), { setState: vi.fn((patch: any) => Object.assign(state, patch)) }), api: { addRemote: vi.fn(), createTag: vi.fn(), pushTag: vi.fn() } };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { AddRemoteModal } from '../../src/renderer/components/Sidebar/AddRemoteModal';
import { CreateTagModal } from '../../src/renderer/components/Sidebar/CreateTagModal';
import { CheckoutBranchModal } from '../../src/renderer/components/Sidebar/CheckoutBranchModal';

beforeEach(() => {
  Object.assign(mocks.state, { addRemoteModalOpen: true, tagModalCommit: 'HEAD', remotes: [], notify: vi.fn(), runAndRefresh: vi.fn(async (operation: () => Promise<unknown>) => { await operation(); return true; }) });
  mocks.useApp.setState.mockClear();
  for (const method of Object.values(mocks.api)) method.mockReset().mockResolvedValue({ ok: true });
});

describe('AddRemoteModal', () => {
  it('stays hidden when closed and uses origin only for the first remote', () => {
    mocks.state.addRemoteModalOpen = false;
    const { container, rerender } = render(<AddRemoteModal />);
    expect(container).toBeEmptyDOMElement();
    mocks.state.addRemoteModalOpen = true; rerender(<AddRemoteModal />);
    expect(screen.getByPlaceholderText('e.g. origin, upstream, fork')).toHaveValue('origin');
    expect(screen.getByRole('button', { name: 'Add Remote' })).toBeDisabled();
  });
  it('requires both name and URL, trims inputs and refreshes after adding', async () => {
    mocks.state.remotes = [{ name: 'origin' }];
    const { container } = render(<AddRemoteModal />);
    const name = screen.getByPlaceholderText('e.g. origin, upstream, fork'), url = screen.getByPlaceholderText('https://github.com/owner/repo.git or git@...');
    expect(name).toHaveValue('');
    fireEvent.submit(container.querySelector('form')!);
    expect(mocks.state.notify).toHaveBeenLastCalledWith('error', 'Remote name is required');
    fireEvent.change(name, { target: { value: ' upstream ' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(mocks.state.notify).toHaveBeenLastCalledWith('error', 'Remote URL is required');
    fireEvent.change(url, { target: { value: ' git@github.com:org/repo.git ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Remote' }));
    await waitFor(() => expect(mocks.api.addRemote).toHaveBeenCalledWith('upstream', 'git@github.com:org/repo.git'));
    await waitFor(() => expect(mocks.useApp.setState).toHaveBeenCalledWith({ addRemoteModalOpen: false }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mocks.state.runAndRefresh).toHaveBeenCalledWith(expect.any(Function), "Remote 'upstream' added successfully");
  });
  it('disables all controls during submission and preserves input on failure', async () => {
    let finish!: (result: boolean) => void;
    mocks.state.runAndRefresh.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<AddRemoteModal />);
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo.git or git@...'), { target: { value: 'url' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Remote' }));
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    for (const input of screen.getAllByRole('textbox')) expect(input).toBeDisabled();
    await act(async () => finish(false));
    expect(screen.getByRole('button', { name: 'Add Remote' })).toBeEnabled();
    expect(screen.getByPlaceholderText('https://github.com/owner/repo.git or git@...')).toHaveValue('url');
    expect(mocks.useApp.setState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.useApp.setState).toHaveBeenCalledWith({ addRemoteModalOpen: false });
  });
});

describe('CreateTagModal', () => {
  it('stays hidden without a target and validates tag names', () => {
    mocks.state.tagModalCommit = null;
    const { container, rerender } = render(<CreateTagModal />);
    expect(container).toBeEmptyDOMElement();
    mocks.state.tagModalCommit = 'HEAD'; rerender(<CreateTagModal />);
    expect(screen.getByText('HEAD')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Tag' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(mocks.state.notify).toHaveBeenCalledWith('error', 'Tag name is required');
  });
  it('creates a lightweight tag at HEAD without a network push', async () => {
    render(<CreateTagModal />);
    fireEvent.change(screen.getByPlaceholderText('e.g. v1.0.0, release-2026-09'), { target: { value: ' v1.0.0 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    await waitFor(() => expect(mocks.api.createTag).toHaveBeenCalledWith('v1.0.0', undefined, undefined));
    await waitFor(() => expect(mocks.useApp.setState).toHaveBeenCalledWith({ tagModalCommit: null }));
    expect(mocks.api.pushTag).not.toHaveBeenCalled();
  });
  it('creates an annotated tag at the selected revision then pushes to the chosen remote', async () => {
    mocks.state.tagModalCommit = 'abcdef1234567890';
    mocks.state.remotes = [{ name: 'origin', fetchUrl: 'origin-url' }, { name: 'backup', fetchUrl: 'backup-url' }];
    render(<CreateTagModal />);
    expect(screen.getByText('abcdef1')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('e.g. v1.0.0, release-2026-09'), { target: { value: 'release' } });
    fireEvent.change(screen.getByPlaceholderText('Leave empty for a lightweight tag...'), { target: { value: ' Release notes ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Push tag to remote immediately' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'backup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    await waitFor(() => expect(mocks.api.pushTag).toHaveBeenCalledWith('release', 'backup'));
    expect(mocks.api.createTag).toHaveBeenCalledWith('release', 'abcdef1234567890', 'Release notes');
    expect(mocks.api.createTag.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.pushTag.mock.invocationCallOrder[0]);
    expect(mocks.state.runAndRefresh).toHaveBeenCalledWith(expect.any(Function), "Tag 'release' created and pushed to backup");
  });
  it('retains the dialog after failed submission and restores controls', async () => {
    let finish!: (ok: boolean) => void;
    mocks.state.runAndRefresh.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    mocks.state.remotes = [{ name: 'origin' }];
    render(<CreateTagModal />);
    fireEvent.change(screen.getByPlaceholderText('e.g. v1.0.0, release-2026-09'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Tag' }));
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    await act(async () => finish(false));
    expect(screen.getByRole('button', { name: 'Create Tag' })).toBeEnabled();
    expect(mocks.useApp.setState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.useApp.setState).toHaveBeenCalledWith({ tagModalCommit: null });
  });
});

describe('CheckoutBranchModal', () => {
  const target = { name: 'feature', fullName: 'feature' };
  it.each([
    { name: 'main', fullName: 'main' },
    { name: 'other', fullName: 'other', branchObj: { isCurrent: true } }
  ])('does not display a checkout dialog for the current branch', target => {
    const close = vi.fn();
    const { container } = render(<CheckoutBranchModal target={target as any} currentBranch="main" onClose={close} onConfirmCheckout={vi.fn()} />);
    expect(container).toBeEmptyDOMElement(); expect(close).toHaveBeenCalledOnce();
  });
  it('describes local checkout and responds to confirm, more options, cancel, Escape and backdrop', () => {
    const close = vi.fn(), confirm = vi.fn(), more = vi.fn();
    const { container, unmount } = render(<CheckoutBranchModal target={target} currentBranch="main" onClose={close} onConfirmCheckout={confirm} onMoreActions={more} />);
    expect(screen.getByText('Local Branch')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Checkout Branch' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout Branch' }));
    fireEvent.click(screen.getByRole('button', { name: 'More Options…' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(confirm).toHaveBeenCalledTimes(2); expect(more).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Local Branch'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTitle('Close (Esc)'));
    fireEvent.click(container.firstChild!);
    expect(close).toHaveBeenCalledTimes(4);
    unmount(); fireEvent.keyDown(window, { key: 'Enter' });
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  it('describes a remote-tracking branch even if its short name matches the current local branch', () => {
    render(<CheckoutBranchModal target={{ name: 'main', fullName: 'origin/main', isRemote: true, tracking: 'origin/main' }} currentBranch="main" onClose={vi.fn()} onConfirmCheckout={vi.fn()} />);
    expect(screen.getByText('Remote Tracking')).toBeVisible();
    expect(screen.getByText('Tracks:')).toBeVisible();
    expect(screen.getByText('Checkout remote branch "origin/main" as a local tracking branch?')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More Options…' })).not.toBeInTheDocument();
  });
});
