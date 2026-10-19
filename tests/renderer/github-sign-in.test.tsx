// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSignInState } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(), unsubscribe: vi.fn(), listener: null as null | ((state: any) => void),
  api: Object.fromEntries(['onGitHubSignInState', 'getGitHubSignInState', 'startGitHubSignIn', 'openGitHubSignInPage', 'cancelGitHubSignIn', 'copyGitHubSignInCode', 'removePullRequestCredential', 'savePullRequestCredential', 'refreshGitHubAccount'].map(name => [name, vi.fn()]))
}));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: any) => any) => selector({ notify: mocks.notify }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { GitHubSignInPanel } from '../../src/renderer/components/Settings/GitHubSignInPanel';

const idle: GitHubSignInState = { phase: 'idle', configured: true, secureStorageAvailable: true, connected: false };
const waiting = (): GitHubSignInState => ({ ...idle, phase: 'waiting', flowId: 'flow-1', userCode: 'ABCD-EFGH', expiresAt: new Date(Date.now() + 61000).toISOString(), message: 'Waiting for approval' });
const connected: GitHubSignInState = { ...idle, phase: 'success', connected: true, method: 'device', account: { login: 'alice', name: 'Alice', installations: 0 }, installationUrl: 'https://github.com/apps/git-workbench-desktop/installations/new' };
beforeEach(() => {
  mocks.notify.mockReset(); mocks.unsubscribe.mockReset(); mocks.listener = null;
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.onGitHubSignInState.mockImplementation(listener => { mocks.listener = listener; return mocks.unsubscribe; });
  mocks.api.getGitHubSignInState.mockResolvedValue(idle);
  mocks.api.startGitHubSignIn.mockImplementation(async () => waiting());
  mocks.api.openGitHubSignInPage.mockResolvedValue(undefined);
  mocks.api.copyGitHubSignInCode.mockResolvedValue(undefined);
  mocks.api.cancelGitHubSignIn.mockResolvedValue(idle);
  mocks.api.savePullRequestCredential.mockResolvedValue({ ok: true });
  mocks.api.removePullRequestCredential.mockResolvedValue({ ok: true });
  mocks.api.refreshGitHubAccount.mockResolvedValue(connected);
});
async function ready() { await waitFor(() => expect(screen.queryByText('Checking')).not.toBeInTheDocument()); }
async function emit(state: GitHubSignInState) { await act(async () => mocks.listener!(state)); }

describe('GitHubSignInPanel connection lifecycle', () => {
  it('checks state once, subscribes to events and unsubscribes after unmount', async () => {
    const { unmount } = render(<GitHubSignInPanel />);
    expect(screen.getByText('Checking')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeDisabled();
    await ready();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    expect(mocks.api.getGitHubSignInState).toHaveBeenCalledOnce();
    unmount(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    await emit(connected);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('preserves the newest event when the initial response arrives later', async () => {
    let resolve!: (value: GitHubSignInState) => void;
    mocks.api.getGitHubSignInState.mockImplementation(() => new Promise<GitHubSignInState>(done => { resolve = done; }));
    render(<GitHubSignInPanel />);
    await emit(connected);
    await act(async () => resolve(idle));
    expect(screen.getByText('@alice')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('ignores an initial response delivered after unmount', async () => {
    let resolve!: (value: GitHubSignInState) => void;
    mocks.api.getGitHubSignInState.mockImplementation(() => new Promise<GitHubSignInState>(done => { resolve = done; }));
    const { unmount } = render(<GitHubSignInPanel />); unmount();
    await act(async () => resolve(connected));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('supports device sign-in, copying, opening, countdown and cancellation', async () => {
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    await screen.findByText('ABCD-EFGH');
    await waitFor(() => expect(mocks.api.openGitHubSignInPage).toHaveBeenCalledWith('flow-1'));
    expect(screen.getByText(/Code expires in 1:01/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(mocks.api.copyGitHubSignInCode).toHaveBeenCalledWith('flow-1'));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitHub sign-in code copied'));
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub' }));
    await waitFor(() => expect(mocks.api.openGitHubSignInPage).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(mocks.api.cancelGitHubSignIn).toHaveBeenCalledWith('flow-1'));
    await screen.findByText('Not connected');
  });
  it('handles pending requests without a code and only announces a completed interactive sign-in once', async () => {
    render(<GitHubSignInPanel />); await ready();
    await emit({ ...idle, phase: 'requesting' });
    expect(screen.getByText('Requesting sign-in code…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await emit(connected);
    expect(mocks.notify).toHaveBeenCalledWith('success', 'Signed in to GitHub as @alice');
    await emit(connected);
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Choose repositories on GitHub' })).toHaveAttribute('href', connected.installationUrl);
    expect(screen.getByText(/Sign-in alone does not grant repository access/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitHub account access refreshed'));
  });
  it('announces success without an account and disables expired verification codes', async () => {
    render(<GitHubSignInPanel />); await ready();
    await emit({ ...waiting(), expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open GitHub' })).toBeDisabled();
    expect(screen.getByText('This code has expired. Cancel and start again for a new code.')).toBeVisible();
    await emit({ ...connected, account: undefined });
    expect(mocks.notify).toHaveBeenCalledWith('success', 'Signed in to GitHub');
  });
  it('updates code expiry once per second and removes the interval when waiting ends', async () => {
    render(<GitHubSignInPanel />); await ready();
    vi.useFakeTimers();
    await emit({ ...waiting(), expiresAt: new Date(Date.now() + 1000).toISOString() });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('This code has expired. Cancel and start again for a new code.')).toBeVisible();
    await emit(idle);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disables browser sign-in for unsupported and insecure installations with useful status', async () => {
    mocks.api.getGitHubSignInState.mockResolvedValue({ ...idle, configured: false, secureStorageAvailable: false });
    render(<GitHubSignInPanel />); await ready();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeDisabled();
    expect(screen.getByText('Browser sign-in is unavailable in this build. You can connect with an access token below.')).toBeVisible();
    await emit({ ...connected, needsSignIn: true, message: 'Reconnect required', phase: 'expired' });
    expect(screen.getByText('Sign in again')).toBeVisible();
    expect(screen.getByText(/Session needs reconnection/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Reconnect required');
    expect(screen.getByRole('button', { name: 'Sign in again with GitHub' })).toBeEnabled();
  });
  it('shows initial errors and reloads the connection', async () => {
    mocks.api.getGitHubSignInState.mockRejectedValueOnce(new Error('Service unavailable'));
    render(<GitHubSignInPanel />); await ready();
    expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reload connection' }));
    await screen.findByText('Not connected');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows operation errors and permits retry without leaking error prefixes', async () => {
    mocks.api.startGitHubSignIn.mockRejectedValueOnce(new Error('Offline'));
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    mocks.api.startGitHubSignIn.mockResolvedValue({ ...idle, phase: 'error', message: 'Cannot authorize' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    await screen.findByText('Cannot authorize');
    expect(mocks.api.openGitHubSignInPage).not.toHaveBeenCalled();
  });
});

describe('GitHub manual credentials and disconnect', () => {
  it('hides tokens by default, supports reveal, clears on collapse and securely saves trimmed tokens', async () => {
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Use an access token instead' }));
    const token = screen.getByPlaceholderText('Paste your access token');
    expect(token).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save token' })).toBeDisabled();
    fireEvent.change(token, { target: { value: ' token-value ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show token' }));
    expect(token).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide token' }));
    expect(token).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
    await waitFor(() => expect(mocks.api.savePullRequestCredential).toHaveBeenCalledWith('github', { token: 'token-value' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitHub token saved securely'));
    expect(screen.queryByPlaceholderText('Paste your access token')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use an access token instead' }));
    expect(screen.getByPlaceholderText('Paste your access token')).toHaveValue('');
  });
  it.each([{ ok: false, error: 'Permission denied' }, { ok: false }])('shows a failed token save without clearing the token', async result => {
    mocks.api.savePullRequestCredential.mockResolvedValue(result);
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Use an access token instead' }));
    fireEvent.change(screen.getByPlaceholderText('Paste your access token'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(result.error || 'Could not save the GitHub token.');
    expect(screen.getByPlaceholderText('Paste your access token')).toHaveValue('secret');
  });
  it('rejects a whitespace-only token even on direct form submit', async () => {
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Use an access token instead' }));
    const input = screen.getByPlaceholderText('Paste your access token');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
  });
  it('shows token connections and disconnects locally', async () => {
    mocks.api.getGitHubSignInState.mockResolvedValueOnce({ ...idle, connected: true, phase: 'success', method: 'token' });
    render(<GitHubSignInPanel />); await ready();
    expect(screen.getByText('Token saved')).toBeVisible();
    expect(screen.getByText('Personal access token saved')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Replace access token' }));
    expect(screen.getByRole('button', { name: 'Replace connection with token' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace access token' }));
    expect(screen.queryByPlaceholderText('Paste your access token')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(mocks.api.removePullRequestCredential).toHaveBeenCalledWith('github'));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitHub disconnected on this device'));
  });
  it.each([{ ok: false, error: 'Cannot remove credential' }, { ok: false }])('reports disconnect failures', async result => {
    mocks.api.getGitHubSignInState.mockResolvedValue(connected);
    mocks.api.removePullRequestCredential.mockResolvedValue(result);
    render(<GitHubSignInPanel />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(result.error || 'Could not disconnect GitHub.');
  });
  it('shows repository management instructions for an installed account', async () => {
    mocks.api.getGitHubSignInState.mockResolvedValue({ ...connected, account: { login: 'alice', installations: 3 } });
    render(<GitHubSignInPanel />); await ready();
    expect(screen.getByText(/Organization repositories may need an owner’s approval/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Switch GitHub account' })).toBeEnabled();
  });
});

it('shows an expired sign-in message as an error and supports connected accounts without an installation URL', async () => {
  mocks.api.getGitHubSignInState.mockResolvedValue({ ...idle, phase: 'expired', message: 'Request a fresh code' });
  render(<GitHubSignInPanel />); await ready();
  expect(screen.getByRole('status')).toHaveClass('text-del');
  await emit({ ...connected, installationUrl: undefined });
  expect(screen.queryByRole('link', { name: 'Choose repositories on GitHub' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh access' })).toBeEnabled();
});
