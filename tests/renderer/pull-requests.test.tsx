// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedPullRequest, PullRequestContext } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ app: {} as Record<string, any>, openSettings: vi.fn(), api: Object.fromEntries(['getRemotes', 'getPullRequestCredentialStatus', 'getPullRequestContext', 'createHostedPullRequest'].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((selector: (state: any) => any) => selector(mocks.app), { getState: () => mocks.app }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => ({ openSettings: mocks.openSettings }) } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/components/PullRequests/PullRequestReview', () => ({ PullRequestReview: ({ request, target, onClose }: any) => <div aria-label="Request review">Review {request.id}: {target.provider}/{target.remoteName}<button onClick={onClose}>Back to requests</button></div> }));
import { PullRequestsModal } from '../../src/renderer/components/PullRequests/PullRequestsModal';

const request = (patch: Partial<HostedPullRequest> = {}): HostedPullRequest => ({ id: '12', title: 'Improve workflow', state: 'open', author: 'Alice', draft: false, sourceBranch: 'feature/old', targetBranch: 'main', url: 'https://github.com/org/repo/pull/12', createdAt: '2026-10-19T10:00:00Z', ...patch });
const context = (patch: Partial<PullRequestContext> = {}): PullRequestContext => ({ provider: 'github', remoteName: 'origin', repository: 'org/repo', repositoryUrl: 'https://github.com/org/repo', credentialConfigured: true, currentBranch: 'feature/new-work', defaultBranch: 'main', pullRequests: [], ...patch });
beforeEach(() => {
  Object.assign(mocks.app, { activeTab: '/repo', pullRequestsModalOpen: true, pullRequestIntent: null, closePullRequestsModal: vi.fn(), notify: vi.fn(), branches: { local: [{ name: 'feature/new-work', isCurrent: true, tracking: 'origin/feature/new-work' }], remote: [] } });
  mocks.openSettings.mockReset(); for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.getRemotes.mockResolvedValue([{ name: 'origin', fetchUrl: 'git@github.com:org/repo.git' }, { name: 'backup', fetchUrl: 'git@gitlab.com:org/repo.git' }]);
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: true, gitlab: true, bitbucket: true });
  mocks.api.getPullRequestContext.mockResolvedValue(context());
  mocks.api.createHostedPullRequest.mockResolvedValue({ ok: true, pullRequest: request({ sourceBranch: 'feature/new-work' }) });
});
const ready = async () => screen.findByRole('heading', { name: /^(Pull|Merge) Requests$/ });

describe('hosted request context', () => {
  it('ignores provider context delivered after the modal closes', async () => {
    let finish!: (value: PullRequestContext) => void;
    mocks.api.getPullRequestContext.mockImplementation(() => new Promise<PullRequestContext>(resolve => { finish = resolve; }));
    const { unmount } = render(<PullRequestsModal />);
    await waitFor(() => expect(mocks.api.getPullRequestContext).toHaveBeenCalledOnce()); unmount();
    await act(async () => finish(context()));
    expect(mocks.app.notify).not.toHaveBeenCalled();
  });
  it('clears remote selection without issuing a request against an unintended default remote', async () => {
    render(<PullRequestsModal />); await ready(); mocks.api.getPullRequestContext.mockClear();
    fireEvent.change(screen.getByRole('combobox', { name: 'Git remote' }), { target: { value: '' } });
    expect(mocks.api.getPullRequestContext).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Refresh.*requests$/i })).toBeDisabled();
  });
  it('can clear a manual provider choice while its remote remains unidentified', async () => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ provider: null }));
    render(<PullRequestsModal />); await screen.findByText('Choose the hosting service');
    const selector = screen.getAllByRole('combobox')[1];
    fireEvent.change(selector, { target: { value: 'gitlab' } });
    await waitFor(() => expect(mocks.api.getPullRequestContext).toHaveBeenLastCalledWith('origin', 'gitlab'));
    await screen.findByText('Choose the hosting service');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '' } });
    await waitFor(() => expect(mocks.api.getPullRequestContext).toHaveBeenLastCalledWith('origin', undefined));
  });
  it('loads the tracked remote, suggests a readable branch title and closes by controls, Escape or backdrop', async () => {
    const { container } = render(<PullRequestsModal />); await ready();
    expect(mocks.api.getPullRequestContext).toHaveBeenCalledWith('origin', undefined);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('new work'); expect(screen.getByRole('textbox', { name: 'Target branch' })).toHaveValue('main');
    expect(screen.getByText('No open pull requests found for this repository.')).toBeVisible(); expect(screen.getByRole('link', { name: 'Repository' })).toHaveAttribute('href', 'https://github.com/org/repo');
    fireEvent.mouseDown(screen.getByRole('heading', { name: 'Pull Requests' })); expect(mocks.app.closePullRequestsModal).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.firstChild!); fireEvent.keyDown(window, { key: 'a' }); fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.click(screen.getByTitle('Close')); fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(mocks.app.closePullRequestsModal).toHaveBeenCalledTimes(4);
  });
  it.each([
    [[{ name: 'fork', fetchUrl: 'fork-url' }, { name: 'origin', fetchUrl: 'origin-url' }], 'fork/feature', 'fork'],
    [[{ name: 'fork', fetchUrl: 'fork-url' }, { name: 'origin', fetchUrl: 'origin-url' }], undefined, 'origin'],
    [[{ name: 'fork', fetchUrl: 'fork-url' }], undefined, 'fork']
  ])('chooses a sensible remote from %s', async (remotes, tracking, expected) => {
    mocks.api.getRemotes.mockResolvedValue(remotes); mocks.app.branches.local = tracking ? [{ isCurrent: true, tracking }] : [];
    mocks.api.getPullRequestContext.mockResolvedValue(context({ remoteName: expected as string }));
    render(<PullRequestsModal />); await ready(); expect(mocks.api.getPullRequestContext).toHaveBeenCalledWith(expected, undefined);
  });
  it('changes remote context and can refresh a loaded provider without disturbing text drafts', async () => {
    mocks.api.getPullRequestContext.mockResolvedValueOnce(context()).mockResolvedValue(context({ provider: 'gitlab', remoteName: 'backup', defaultBranch: 'develop' }));
    render(<PullRequestsModal />); await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Custom title' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Git remote' }), { target: { value: 'backup' } });
    await screen.findByRole('heading', { name: 'Merge Requests' }); expect(mocks.api.getPullRequestContext).toHaveBeenCalledWith('backup', undefined);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Target branch' })).toHaveValue('develop')); expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Custom title');
    fireEvent.click(screen.getByRole('button', { name: /^Refresh.*requests$/i })); await waitFor(() => expect(mocks.api.getPullRequestContext).toHaveBeenCalledTimes(3));
  });
  it('explains missing remotes and offers GitLab selection for an unidentified self-hosted remote', async () => {
    mocks.api.getRemotes.mockResolvedValue([]); mocks.api.getPullRequestContext.mockResolvedValue(context({ provider: null, remoteName: null, repository: undefined, defaultBranch: '' }));
    const { unmount } = render(<PullRequestsModal />);
    await screen.findAllByText('Add a Git remote to view hosted requests.'); expect(screen.getByRole('combobox', { name: 'Git remote' })).toBeDisabled(); expect(screen.getByRole('button', { name: /^Refresh.*requests$/i })).toBeDisabled(); unmount();
    mocks.api.getRemotes.mockResolvedValue([{ name: 'origin', fetchUrl: 'git@selfhosted.test:team/repo.git' }]);
    mocks.api.getPullRequestContext.mockResolvedValueOnce(context({ provider: null })).mockResolvedValue(context({ provider: 'gitlab' }));
    render(<PullRequestsModal />); await screen.findByText('Choose the hosting service');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'gitlab' } });
    await screen.findByRole('heading', { name: 'Merge Requests' }); expect(mocks.api.getPullRequestContext).toHaveBeenCalledWith('origin', 'gitlab');
  });
  it('offers account configuration when the provider is not connected', async () => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: false, gitlab: false, bitbucket: false });
    mocks.api.getPullRequestContext.mockResolvedValue(context({ credentialConfigured: false }));
    render(<PullRequestsModal />); await ready();
    expect(screen.getByText('Connect your GitHub account to load open requests for this repository.')).toBeVisible(); expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open connection settings' })); expect(mocks.app.closePullRequestsModal).toHaveBeenCalledOnce(); expect(mocks.openSettings).toHaveBeenCalledWith('providers');
  });
  it('reports provider and network errors, keeps connected provider settings out of the modal', async () => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ error: 'Missing provider permission' }));
    render(<PullRequestsModal />); await ready(); expect(screen.getAllByText('Missing provider permission')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Push branch & create pull request' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Manage provider settings' })).not.toBeInTheDocument();
    expect(screen.queryByText(/provider settings$/)).not.toBeInTheDocument();
    mocks.api.getPullRequestContext.mockRejectedValue(new Error('Offline')); fireEvent.click(screen.getByRole('button', { name: /^Refresh.*requests$/i })); await screen.findByText('Offline');
  });
  it('reports initial remote/credential failures without crashing and ignores responses after close', async () => {
    mocks.api.getRemotes.mockRejectedValueOnce(new Error('No remote access'));
    const { unmount } = render(<PullRequestsModal />); await screen.findAllByText('No remote access'); unmount();
    let resolve!: (value: any) => void; mocks.api.getRemotes.mockImplementation(() => new Promise(done => { resolve = done; }));
    const next = render(<PullRequestsModal />); next.unmount(); await act(async () => resolve([{ name: 'origin' }]));
    expect(mocks.api.getPullRequestContext).not.toHaveBeenCalled();
  });
  it('stays hidden when closed', () => { mocks.app.pullRequestsModalOpen = false; const { container } = render(<PullRequestsModal />); expect(container).toBeEmptyDOMElement(); expect(mocks.api.getRemotes).not.toHaveBeenCalled(); });
});

describe('request browsing and creation', () => {
  it.each([true, false])('shows the selected request status consistently when draft is %s', async draft => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ pullRequests: [request({ sourceBranch: 'feature/new-work', draft })] }));
    render(<PullRequestsModal />);
    const review = await screen.findByRole('button', { name: 'Review changes, conversation & CI' });
    const details = review.parentElement;
    if (!details) throw new Error('Selected request details missing');
    expect(within(details).getByText(draft ? 'Draft' : 'Open', { exact: true })).toBeVisible();
    expect(within(details).getByRole('link', { name: 'Open on provider' })).toHaveAttribute('href', request().url);
    expect(mocks.api.createHostedPullRequest).not.toHaveBeenCalled();
  });
  it('ignores duplicate form submission and retains successful creation feedback after reloading', async () => {
    let finish!: (value: { ok: true; pullRequest: HostedPullRequest }) => void;
    mocks.api.createHostedPullRequest.mockImplementation(() => new Promise<{ ok: true; pullRequest: HostedPullRequest }>(resolve => { finish = resolve; }));
    render(<PullRequestsModal />); await ready();
    const form = screen.getByRole('textbox', { name: 'Title' }).closest('form'); if (!form) throw new Error('Request form missing');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.api.createHostedPullRequest).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: true, pullRequest: request() }));
    expect(await screen.findByText('Request created.')).toHaveClass('text-add');
  });
  it('selects the current open request, hides creation duplicates and opens the in-app review workspace', async () => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ pullRequests: [request({ sourceBranch: 'feature/new-work' }), request({ id: '13', title: 'Draft request', draft: true, createdAt: 'invalid-date' }), request({ id: '14', title: 'Closed request', state: 'closed' })] }));
    render(<PullRequestsModal />); await ready();
    expect(screen.getByText('An open request already exists for this branch.')).toBeVisible(); expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument(); expect(screen.queryByText('Closed request')).not.toBeInTheDocument();
    expect(screen.getByText('2 open requests')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Draft request/ })); expect(screen.getByRole('link', { name: 'Open on provider' })).toHaveAttribute('href', request().url);
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes, conversation & CI' }));
    expect(screen.getByLabelText('Request review')).toHaveTextContent('Review 12: github/origin');
    fireEvent.click(screen.getByRole('button', { name: 'Back to requests' })); expect(screen.getByRole('heading', { name: 'Pull Requests' })).toBeVisible();
  });
  it('selects other requests without a current-branch default and handles dates omitted from provider results', async () => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ pullRequests: [request({ createdAt: undefined, updatedAt: undefined })] }));
    render(<PullRequestsModal />); await ready(); expect(await screen.findByText('1 open request')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Improve workflow/ }));
    expect(await screen.findByRole('button', { name: 'Review changes, conversation & CI' })).toBeVisible();
  });
  it.each(['github', 'gitlab', 'bitbucket', 'gitea'] as const)('pushes and creates a %s request with the edited fields', async provider => {
    mocks.api.getPullRequestContext.mockResolvedValue(context({ provider })); render(<PullRequestsModal />); await screen.findByRole('heading', { name: provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Implement workflow' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'Review context' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Target branch' }), { target: { value: 'develop' } });
    fireEvent.click(screen.getByRole('button', { name: provider === 'gitlab' ? 'Push branch & create merge request' : 'Push branch & create pull request' }));
    expect(screen.getByRole('button', { name: 'Pushing branch & creating…' })).toBeDisabled();
    await waitFor(() => expect(mocks.api.createHostedPullRequest).toHaveBeenCalledWith({ remoteName: 'origin', title: 'Implement workflow', description: 'Review context', targetBranch: 'develop', providerOverride: undefined }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('success', `${provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : provider === 'gitea' ? 'Gitea' : 'Bitbucket Cloud'} request created`));
  });
  it.each([{ ok: false, error: 'Push rejected' }, { ok: false }, new Error('Provider offline')])('reports request creation failure %s without discarding the draft', async result => {
    if (result instanceof Error) mocks.api.createHostedPullRequest.mockRejectedValue(result); else mocks.api.createHostedPullRequest.mockResolvedValue(result);
    render(<PullRequestsModal />); await ready(); fireEvent.click(screen.getByRole('button', { name: 'Push branch & create pull request' }));
    const message = result instanceof Error ? result.message : result.error || 'Could not create the request.';
    expect(await screen.findByText(message)).toBeVisible(); expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('new work'); expect(mocks.app.notify).not.toHaveBeenCalled();
  });
  it('prevents empty titles or targeting the current branch', async () => {
    render(<PullRequestsModal />); await ready();
    const targetBranch = screen.getByRole('textbox', { name: 'Target branch' });
    await waitFor(() => expect(targetBranch).toHaveValue('main'));
    fireEvent.change(targetBranch, { target: { value: 'feature/new-work' } });
    expect(targetBranch).toHaveValue('feature/new-work');
    expect(screen.getByRole('button', { name: 'Push branch & create pull request' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Target branch' }), { target: { value: 'main' } }); fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '  ' } }); expect(screen.getByRole('button', { name: 'Push branch & create pull request' })).toBeDisabled();
  });
});


it.each(['github', 'gitlab', 'bitbucket', 'gitea'] as const)('uses the %s host terminology without embedding provider settings', async provider => {
  mocks.api.getPullRequestContext.mockResolvedValue(context({ provider }));
  render(<PullRequestsModal />); await ready();
  expect(screen.getByRole('heading', { name: provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests' })).toBeVisible();
  expect(screen.queryByText(/provider settings$/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Manage provider settings|Configure in Settings|Open connection settings/ })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeVisible();
});
it('opens the selected sidebar request directly for review without publishing', async () => {
  mocks.app.pullRequestIntent = { remoteName: 'backup', requestId: '12', mode: 'review' };
  mocks.api.getPullRequestContext.mockResolvedValue(context({ provider: 'gitea', remoteName: 'backup', pullRequests: [request()] }));
  render(<PullRequestsModal />);
  expect(await screen.findByLabelText('Request review')).toHaveTextContent('Review 12: gitea/backup');
  expect(mocks.api.getPullRequestContext).toHaveBeenCalledWith('backup', undefined);
  expect(mocks.api.createHostedPullRequest).not.toHaveBeenCalled();
});

it('explains a sidebar request that disappeared from the open list', async () => {
  mocks.app.pullRequestIntent = { requestId: 'missing', mode: 'review' };
  render(<PullRequestsModal />);
  expect(await screen.findByText('This request is no longer in the loaded open list. Refresh or open it on the provider.')).toBeVisible();
  expect(screen.queryByLabelText('Request review')).not.toBeInTheDocument();
});
it('focuses the title when opened from the sidebar create action', async () => {
  mocks.app.pullRequestIntent = { mode: 'create' };
  render(<PullRequestsModal />); await ready();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus());
});
it.each(['create', 'refresh'] as const)('ignores creation feedback after switching repositories during %s', async phase => {
  let finish: (() => void) | undefined;
  if (phase === 'create') mocks.api.createHostedPullRequest.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ok: true, pullRequest: request() }); }));
  else mocks.api.getPullRequestContext.mockResolvedValueOnce(context()).mockImplementation(() => new Promise(resolve => { finish = () => resolve(context()); }));
  render(<PullRequestsModal />); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Push branch & create pull request' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  mocks.app.activeTab = '/another-repo';
  await act(async () => { finish?.(); });
  expect(mocks.app.notify).not.toHaveBeenCalled();
  expect(screen.queryByText('Request created.')).not.toBeInTheDocument();
});
