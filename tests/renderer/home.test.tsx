// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {}, home: Record<string, any> = {};
  return { app, home, openSettings: vi.fn(), openExternal: vi.fn(), useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn() }) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => ({ openSettings: mocks.openSettings }) } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { openExternal: mocks.openExternal } }));
vi.mock('../../src/renderer/components/Home/useHomeRepositories', () => ({ useHomeRepositories: () => mocks.home }));
import { Home } from '../../src/renderer/components/Home/Home';

const row = (patch = {}) => ({ branch: 'main', changed: 0, staged: 0, conflicts: 0, ahead: 0, behind: 0, checkedAt: '2026-10-19T10:00:00Z', ...patch });
beforeEach(() => {
  Object.assign(mocks.app, { recentRepos: [], tabs: [], isOpeningRepo: false, setActiveTab: vi.fn(), openRepo: vi.fn(), openRepoDialog: vi.fn(), openCreateRepoModal: vi.fn(), openUsageGuide: vi.fn() });
  Object.assign(mocks.home, { pins: [], rows: {}, initializing: false, refreshing: null, pending: [], mutating: null, error: '', refresh: vi.fn(), reload: vi.fn(), pin: vi.fn(), removeRecent: vi.fn() });
  mocks.openSettings.mockReset(); mocks.openExternal.mockReset().mockResolvedValue(undefined);
});
const pinned = () => within(screen.getByRole('region', { name: 'Pinned repositories' }));

describe('Home workspace hub', () => {
  it('aligns repository information in a compact list and keeps clean sync states readable', () => {
    mocks.home.pins = ['/work/api', '/work/design', '/work/review'];
    mocks.home.rows = {
      '/work/api': row({ changed: 5, staged: 2, ahead: 3, behind: 1 }),
      '/work/design': row(),
      '/work/review': row({ branch: '', conflicts: 1, changed: 1, behind: 2 })
    };
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
    for (const label of ['Repository', 'Branch', 'Working tree', 'Sync']) expect(pinned().getByText(label, { exact: true })).toBeVisible();
    const apiRow = within(pinned().getByRole('article', { name: 'api' }));
    expect(apiRow.getByText('/work/api')).toHaveAttribute('title', '/work/api');
    expect(apiRow.getByText('main', { exact: true })).toHaveAttribute('title', 'main');
    expect(apiRow.getByText('2 staged')).toBeVisible();
    expect(apiRow.getByTitle('3 to push')).toHaveTextContent('3'); expect(apiRow.getByTitle('1 to pull')).toHaveTextContent('1');
    const clean = within(pinned().getByRole('article', { name: 'design' }));
    expect(clean.getByText('Up to date')).toBeVisible(); expect(clean.queryByText('0 staged')).not.toBeInTheDocument();
    fireEvent.click(clean.getByRole('button', { name: 'Open', exact: true })); expect(mocks.app.openRepo).toHaveBeenCalledWith('/work/design');
    const review = within(pinned().getByRole('article', { name: 'review' }));
    expect(review.getByText('1 conflict')).toBeVisible(); expect(review.getByText('—')).toBeVisible(); expect(review.getByTitle('2 to pull')).toHaveTextContent('2');
    expect(within(screen.getByRole('button', { name: 'All pinned' })).getByText('3')).toBeVisible();
    expect(within(screen.getByRole('button', { name: 'With changes' })).getByText('2')).toBeVisible();
    expect(within(screen.getByRole('button', { name: 'Needs attention' })).getByText('1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'All pinned' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('marks refreshing rows busy and keeps unresolved filter totals distinct from zero', () => {
    mocks.home.pins = ['/loading']; mocks.home.pending = ['/loading'];
    const { rerender } = render(<Home />);
    expect(pinned().getByRole('article', { name: 'loading' })).toHaveAttribute('aria-busy', 'true');
    expect(within(screen.getByRole('button', { name: 'With changes' })).getByText('—')).toBeVisible();
    expect(pinned().getByText('Loading…')).toBeVisible();
    mocks.home.rows = { '/loading': row() }; mocks.home.pending = []; rerender(<Home />);
    expect(pinned().getByRole('article', { name: 'loading' })).toHaveAttribute('aria-busy', 'false');
    expect(within(screen.getByRole('button', { name: 'With changes' })).getByText('0')).toBeVisible();
  });
  it('provides onboarding, open/create/browse and setup tools without empty placeholders', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Keep your projects close' })).toBeVisible();
    expect(screen.getByText('Repositories you open will appear here, ready for next time.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open repository', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Open a repository', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Browse for a repository' }));
    expect(mocks.app.openRepoDialog).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Create repository' })); expect(mocks.app.openCreateRepoModal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Connect your providers/ })); expect(mocks.openSettings).toHaveBeenCalledWith('providers');
    fireEvent.click(screen.getByRole('button', { name: /Preferences/ })); expect(mocks.openSettings).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole('button', { name: /Explore Git Workbench/ })); expect(mocks.app.openUsageGuide).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Git Playground/ })); expect(mocks.useApp.setState).toHaveBeenCalledWith({ playgroundOpen: true, usageGuideOpen: false });
  });
  it('deduplicates recent repositories, excludes pins, resumes open projects and pins/removes other recents', () => {
    mocks.app.recentRepos = ['/work/pinned', '/work/first', '/work/first', 'C:\\work\\second'];
    mocks.app.tabs = [{ path: '/work/first' }];
    mocks.home.pins = ['/work/pinned']; mocks.home.rows = { '/work/pinned': row() };
    render(<Home />);
    fireEvent.click(screen.getByTitle('Open /work/first')); expect(mocks.app.setActiveTab).toHaveBeenCalledWith('/work/first');
    fireEvent.click(screen.getByTitle('Open C:\\work\\second')); expect(mocks.app.openRepo).toHaveBeenCalledWith('C:\\work\\second');
    expect(screen.getAllByTitle('Open /work/first')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pin second' })); expect(mocks.home.pin).toHaveBeenCalledWith('C:\\work\\second', true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove first from recent repositories' })); expect(mocks.home.removeRecent).toHaveBeenCalledWith('/work/first');
    fireEvent.click(screen.getByRole('button', { name: 'Unpin pinned' })); expect(mocks.home.pin).toHaveBeenCalledWith('/work/pinned', false);
  });
  it('shows pinned clean/changed/conflicted/unavailable/loading states and filters by attention or changes', () => {
    mocks.home.pins = ['/clean', '/changed', '/conflicted', '/missing', '/loading'];
    mocks.home.rows = { '/clean': row(), '/changed': row({ changed: 2, staged: 1, ahead: 3, behind: 4 }), '/conflicted': row({ changed: 1, conflicts: 2 }), '/missing': row({ error: 'Folder unavailable' }) };
    render(<Home />);
    expect(pinned().getByText('Clean')).toBeVisible(); expect(pinned().getByText('2 changed')).toBeVisible(); expect(pinned().getByText('2 conflicts')).toBeVisible();
    expect(pinned().getByText('Unavailable')).toBeVisible(); expect(pinned().getByText('Loading…')).toBeVisible();
    expect(pinned().getByRole('alert')).toHaveTextContent('Folder unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'With changes' }));
    expect(pinned().getAllByRole('article')).toHaveLength(2);
    expect(pinned().queryByText('Clean')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
    expect(pinned().getAllByRole('article')).toHaveLength(2);
    expect(pinned().queryByText('2 changed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All pinned' })); expect(pinned().getAllByRole('article')).toHaveLength(5);
  });
  it('searches by name/path, clears with Escape or button and restores an empty filter result', () => {
    mocks.home.pins = ['/work/first']; mocks.home.rows = { '/work/first': row() }; mocks.app.recentRepos = ['/work/second'];
    render(<Home />);
    const search = screen.getByRole('textbox', { name: 'Search repositories' });
    fireEvent.keyDown(search, { key: 'Escape' });
    fireEvent.change(search, { target: { value: '  FIRST ' } }); expect(pinned().getByRole('article')).toBeVisible();
    expect(screen.getByText('No recent repositories match your search.')).toBeVisible();
    fireEvent.keyDown(search, { key: 'Escape' }); expect(search).toHaveValue('');
    fireEvent.change(search, { target: { value: 'missing' } }); expect(screen.getByRole('heading', { name: 'No matching pinned repositories' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); expect(search).toHaveValue('');
    fireEvent.change(search, { target: { value: 'second' } }); fireEvent.click(screen.getByRole('button', { name: 'Clear search' })); expect(search).toHaveValue('');
  });
  it('refreshes local status or explicitly includes hosted requests and retries a load error', () => {
    mocks.home.pins = ['/repo']; mocks.home.rows = { '/repo': row() }; mocks.home.error = 'Dashboard unavailable';
    render(<Home />);
    expect(screen.getByRole('alert')).toHaveTextContent('Dashboard unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(mocks.home.reload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true })); expect(mocks.home.refresh).toHaveBeenCalledWith(['/repo']);
    fireEvent.click(screen.getByRole('button', { name: 'Check requests' })); expect(mocks.home.refresh).toHaveBeenCalledWith(['/repo'], true);
  });
  it('shows a skeleton during initialization and disables actions during opening and mutation', () => {
    mocks.home.initializing = true;
    const { rerender } = render(<Home />);
    expect(screen.getByLabelText('Loading pinned repositories')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading recent repositories…')).toBeVisible();
    mocks.home.initializing = false; mocks.home.mutating = '/repo'; mocks.app.isOpeningRepo = true; mocks.app.recentRepos = ['/repo'];
    rerender(<Home />);
    expect(screen.getByRole('button', { name: 'Create repository' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pin repo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove repo from recent repositories' })).toBeDisabled();
    expect(screen.getByTitle('Open /repo')).toBeDisabled();
  });
  it('shows fetched request details, opens provider links and reports browser failures', async () => {
    mocks.home.pins = ['/repo']; mocks.app.tabs = [{ path: '/repo' }];
    mocks.home.rows = { '/repo': row({ requests: [{ id: '12', title: 'Fix something', url: 'https://github.com/org/repo/pull/12' }], hostedMessage: 'Loaded latest requests', hostedCheckedAt: '2026-10-19T10:00:00Z' }) };
    render(<Home />);
    expect(screen.getByText('1 open request loaded')).toBeVisible();
    const details = screen.getByText('1 open request loaded').closest('details')!;
    fireEvent.click(screen.getByText('1 open request loaded')); details.open = true;
    expect(screen.getByText('Loaded latest requests')).toBeVisible();
    fireEvent.click(screen.getByTitle('Fix something'));
    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/org/repo/pull/12'));
    mocks.openExternal.mockRejectedValue(new Error('Browser blocked'));
    fireEvent.click(screen.getByTitle('Fix something'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: Browser blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' })); expect(mocks.app.setActiveTab).toHaveBeenCalledWith('/repo');
  });
  it('shows empty hosted results, provider messages and local/hosted pending indicators', () => {
    mocks.home.pins = ['/repo', '/other']; mocks.home.pending = ['/repo']; mocks.home.refreshing = 'local';
    mocks.home.rows = { '/repo': row({ requests: [] }), '/other': row({ hostedMessage: 'Connect a provider' }) };
    const { rerender } = render(<Home />);
    expect(screen.getByText('0 open requests loaded')).toBeVisible(); expect(screen.getByText('Connect a provider')).toBeVisible(); expect(screen.getByText('Refreshing…')).toBeVisible();
    mocks.home.refreshing = 'hosted'; rerender(<Home />); expect(screen.getByText('Checking requests…')).toBeVisible();
  });
  it('explains when every recent project is pinned and handles a root path name', () => {
    mocks.home.pins = ['/']; mocks.home.rows = { '/': row() }; mocks.app.recentRepos = ['/'];
    render(<Home />);
    expect(screen.getByText('All your recent repositories are pinned. Open another project to add it here.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unpin /' })).toBeVisible();
  });
});
