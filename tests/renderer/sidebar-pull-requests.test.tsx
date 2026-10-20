// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PullRequestContext, RemoteInfo } from '../../src/shared/types';

const mock = vi.hoisted(() => ({ app: { activeTab: '/repo', pullRequestsModalOpen: false, status: undefined as undefined | { currentBranch: string }, openPullRequestsModal: vi.fn() }, load: vi.fn(), settings: vi.fn() }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: typeof mock.app) => unknown) => select(mock.app), { getState: () => mock.app }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => ({ openSettings: mock.settings }) } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { getPullRequestContext: mock.load } }));
import { SidebarPullRequests } from '../../src/renderer/components/Sidebar/SidebarPullRequests';
const remotes: RemoteInfo[] = ['origin', 'upstream'].map(name => ({ name, fetchUrl: `git@github.com:org/${name}.git`, pushUrl: '' }));
const context: PullRequestContext = { provider: 'github', remoteName: 'origin', credentialConfigured: true, currentBranch: 'main', defaultBranch: 'main', pullRequests: [{ id: '1', title: 'Current branch change', author: 'Alice', sourceBranch: 'main', targetBranch: 'develop', state: 'open', draft: false }, { id: '2', title: 'Closed change', author: 'Bob', sourceBranch: 'feature', targetBranch: 'main', state: 'closed', draft: false }] };
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(200); });
const show = (items = remotes) => render(<SidebarPullRequests repo="/repo" remotes={items} query="" />);
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); mock.app.activeTab = '/repo'; mock.app.pullRequestsModalOpen = false; mock.app.status = undefined;
  mock.load.mockResolvedValue(context);
});
it('opens the workspace with an automatic remote before context arrives and can configure a missing connection', async () => {
  mock.load.mockResolvedValue({ ...context, provider: null, remoteName: null, credentialConfigured: false, pullRequests: [] });
  show(); fireEvent.click(screen.getByRole('button', { name: 'Open requests' }));
  expect(mock.app.openPullRequestsModal).toHaveBeenCalledWith({ remoteName: undefined });
  await settle();
  screen.getByText('Connect this remote’s provider to load requests.');
  fireEvent.click(screen.getByRole('button', { name: 'Provider settings' })); expect(mock.settings).toHaveBeenCalledWith('providers');
  fireEvent.click(screen.getByRole('button', { name: 'Create request' }));
  expect(mock.app.openPullRequestsModal).toHaveBeenLastCalledWith({ remoteName: undefined, mode: 'create' });
});
it('supports remote selection, refresh, collapse, and normal current-branch requests', async () => {
  mock.load.mockImplementation(async name => ({ ...context, remoteName: name || 'origin' }));
  show(); await settle(); screen.getByRole('button', { name: /Current branch change/ });
  expect(screen.queryByText('Closed change')).not.toBeInTheDocument(); expect(screen.getByLabelText('Current branch')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
  expect(mock.app.openPullRequestsModal).toHaveBeenLastCalledWith({ remoteName: 'origin' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sidebar request remote' }), { target: { value: 'upstream' } });
  await settle();
  expect(mock.load).toHaveBeenLastCalledWith('upstream');
  screen.getByRole('button', { name: /Current branch change/ });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sidebar pull requests' }));
  await settle();
  expect(mock.load).toHaveBeenCalledTimes(3);
  screen.getByRole('button', { name: /Current branch change/ });
  fireEvent.click(screen.getByRole('button', { expanded: true }));
  expect(screen.queryByText('Current branch change')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  fireEvent.click(screen.getByRole('button', { name: /Current branch change/ }));
  expect(mock.app.openPullRequestsModal).toHaveBeenLastCalledWith({ remoteName: 'upstream', requestId: '1', mode: 'review' });
  mock.app.activeTab = '/other'; mock.app.openPullRequestsModal.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /Current branch change/ }));
  expect(mock.app.openPullRequestsModal).not.toHaveBeenCalled();
});
it('explains an empty remote list and disables request actions', () => {
  show([]); expect(screen.getByText('Add a remote to view requests.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Create request' })).toBeDisabled();
  expect(mock.load).not.toHaveBeenCalled();
});
it('ignores a rejected provider request delivered after switching repositories', async () => {
  let reject: ((reason: Error) => void) | undefined;
  mock.load.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  show(); await settle(); expect(mock.load).toHaveBeenCalledOnce();
  mock.app.activeTab = '/other';
  await act(async () => { reject?.(new Error('Old repository offline')); });
  expect(screen.queryByText('Old repository offline')).not.toBeInTheDocument();
});

it('keeps the automatic remote fallback when request metadata omits the remote name', async () => {
  mock.load.mockResolvedValue({ ...context, remoteName: null });
  show(); await settle(); screen.getByRole('button', { name: /Current branch change/ });
  fireEvent.click(screen.getByRole('button', { name: /Current branch change/ }));
  expect(mock.app.openPullRequestsModal).toHaveBeenLastCalledWith({ remoteName: undefined, requestId: '1', mode: 'review' });
});
