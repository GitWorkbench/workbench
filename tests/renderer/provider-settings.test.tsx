// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestCredentialStatus } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), api: {
  getPullRequestCredentialStatus: vi.fn(), savePullRequestCredential: vi.fn(), removePullRequestCredential: vi.fn(),
  testGitLabConnection: vi.fn(), testGiteaConnection: vi.fn()
} }));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: { notify: typeof mocks.notify }) => unknown) => selector({ notify: mocks.notify }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/components/Settings/GitHubSignInPanel', () => ({ GitHubSignInPanel: () => <section aria-label="GitHub browser sign-in">GitHub sign-in panel</section> }));
import { PullRequestProvidersSettings } from '../../src/renderer/components/Settings/PullRequestProvidersSettings';

const empty: PullRequestCredentialStatus = { github: false, gitlab: false, bitbucket: false, gitea: false, gitlabServers: [], giteaServers: [] };
function provider(name: 'GitLab' | 'Gitea' | 'Bitbucket Cloud') {
  const section = screen.getByRole('heading', { name }).closest('section');
  if (!section) throw new Error('Provider section missing');
  return within(section);
}
async function ready() { await waitFor(() => expect(screen.queryByText('Loading Gitea connections…')).not.toBeInTheDocument()); }
function formOf(input: HTMLElement) { const form = input.closest('form'); if (!form) throw new Error('Connection form missing'); return form; }
function bitbucketDraft() {
  const section = provider('Bitbucket Cloud');
  fireEvent.change(section.getByPlaceholderText('Paste your access token'), { target: { value: ' bb-test-token ' } });
  fireEvent.change(section.getByRole('textbox', { name: 'Atlassian account email' }), { target: { value: 'alice@example.test' } });
  return section;
}
function instanceDraft(name: 'GitLab' | 'Gitea', server = 'https://code.example:8443/forge') {
  const section = provider(name);
  fireEvent.change(section.getByLabelText(`${name} server URL`, { exact: false }), { target: { value: server } });
  fireEvent.change(section.getByPlaceholderText('Paste the token from this server'), { target: { value: ' instance-test-token ' } });
  return section;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue(empty);
  mocks.api.savePullRequestCredential.mockResolvedValue({ ok: true });
  mocks.api.removePullRequestCredential.mockResolvedValue({ ok: true });
  mocks.api.testGitLabConnection.mockResolvedValue({ ok: true, username: 'alice' });
  mocks.api.testGiteaConnection.mockResolvedValue({ ok: true, username: 'alice' });
});

describe('provider settings and Bitbucket credentials', () => {
  it('loads all connection sections and keeps GitHub browser sign-in separate', async () => {
    render(<PullRequestProvidersSettings />);
    expect(screen.getByText('Checking saved credentials…')).toBeVisible();
    expect(screen.getByText('Loading GitLab connections…')).toBeVisible();
    expect(screen.getByText('Loading Gitea connections…')).toBeVisible();
    await ready();
    expect(screen.getByRole('region', { name: 'GitHub browser sign-in' })).toBeVisible();
    expect(provider('GitLab').getByRole('link', { name: 'Create a token on this server' })).toHaveAttribute('href', 'https://gitlab.com/-/user_settings/personal_access_tokens?name=Git%20Workbench&scopes=api');
    expect(provider('Bitbucket Cloud').getByRole('link', { name: 'Create an access token' })).toHaveAttribute('href', 'https://id.atlassian.com/manage-profile/security/api-tokens');
    expect(provider('Gitea').queryByRole('link')).not.toBeInTheDocument();
    expect(provider('Gitea').getByRole('button', { name: 'Connect Gitea' })).toBeDisabled();
  });
  it('surfaces a status failure and retains editable forms', async () => {
    mocks.api.getPullRequestCredentialStatus.mockRejectedValue(new Error('Storage locked'));
    render(<PullRequestProvidersSettings />); await ready();
    expect(screen.getByText('Storage locked')).toBeVisible();
    expect(provider('Gitea').getByLabelText('Gitea server URL', { exact: false })).toBeVisible();
  });
  it('requires the Bitbucket email, trims secrets, and clears them after saving', async () => {
    render(<PullRequestProvidersSettings />); await ready();
    const section = provider('Bitbucket Cloud');
    fireEvent.change(section.getByPlaceholderText('Paste your access token'), { target: { value: ' token ' } });
    expect(section.getByRole('button', { name: 'Save token' })).toBeDisabled();
    fireEvent.change(section.getByRole('textbox', { name: 'Atlassian account email' }), { target: { value: 'alice@example.test' } });
    fireEvent.click(section.getByRole('button', { name: 'Save token' }));
    await waitFor(() => expect(mocks.api.savePullRequestCredential).toHaveBeenCalledWith('bitbucket', { token: 'token', username: 'alice@example.test' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'Bitbucket Cloud token saved securely'));
    expect(section.getByPlaceholderText('Paste your access token')).toHaveValue('');
  });
  it('toggles visibility and rejects empty direct submissions', async () => {
    render(<PullRequestProvidersSettings />); await ready();
    const section = provider('Bitbucket Cloud'), token = section.getByPlaceholderText('Paste your access token');
    fireEvent.click(section.getByTitle('Show token')); expect(token).toHaveAttribute('type', 'text');
    fireEvent.click(section.getByTitle('Hide token')); expect(token).toHaveAttribute('type', 'password');
    fireEvent.change(token, { target: { value: '  ' } }); fireEvent.submit(formOf(token));
    expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, error: 'Rejected credential' }, { ok: false }, new Error('Network unavailable')])('retains a rejected Bitbucket draft %#', async result => {
    if (result instanceof Error) mocks.api.savePullRequestCredential.mockRejectedValue(result); else mocks.api.savePullRequestCredential.mockResolvedValue(result);
    render(<PullRequestProvidersSettings />); await ready(); const section = bitbucketDraft();
    fireEvent.click(section.getByRole('button', { name: 'Save token' }));
    const message = result instanceof Error ? result.message : result.error || 'Could not save the bitbucket token.';
    expect(await screen.findByText(message)).toBeVisible();
    expect(section.getByPlaceholderText('Paste your access token')).toHaveValue(' bb-test-token ');
    expect(mocks.notify).toHaveBeenCalledWith('error', message);
  });
  it('cancels replacement without keeping a secret, then removes the saved Bitbucket token', async () => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, bitbucket: true });
    render(<PullRequestProvidersSettings />); await ready(); const section = provider('Bitbucket Cloud');
    fireEvent.click(section.getByRole('button', { name: 'Replace token' }));
    fireEvent.change(section.getByPlaceholderText('Paste a replacement token'), { target: { value: 'temporary' } });
    fireEvent.click(section.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(section.getByRole('button', { name: 'Replace token' }));
    expect(section.getByPlaceholderText('Paste a replacement token')).toHaveValue('');
    fireEvent.click(section.getByRole('button', { name: 'Remove token' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'Bitbucket Cloud token removed'));
    expect(mocks.api.removePullRequestCredential).toHaveBeenCalledWith('bitbucket');
    expect(section.getByText('Not connected')).toBeVisible();
  });
  it.each([{ ok: false, error: 'Locked' }, { ok: false }, new Error('Storage unavailable')])('keeps a saved Bitbucket connection after removal failure %#', async result => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, bitbucket: true });
    if (result instanceof Error) mocks.api.removePullRequestCredential.mockRejectedValue(result); else mocks.api.removePullRequestCredential.mockResolvedValue(result);
    render(<PullRequestProvidersSettings />); await ready(); const section = provider('Bitbucket Cloud');
    fireEvent.click(section.getByRole('button', { name: 'Remove token' }));
    expect(await screen.findByText(result instanceof Error ? result.message : result.error || 'Could not remove the bitbucket token.')).toBeVisible();
    expect(section.getByText('Token saved')).toBeVisible();
  });
});

describe.each(['GitLab', 'Gitea'] as const)('%s instance connections', name => {
  const id = name === 'GitLab' ? 'gitlab' : 'gitea';
  it('tests and saves only the entered instance and clears its token', async () => {
    render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft(name);
    expect(section.getByRole('link', { name: 'Create a token on this server' })).toHaveAttribute('href', `https://code.example:8443/forge${name === 'GitLab' ? '/-/user_settings/personal_access_tokens?name=Git%20Workbench&scopes=api' : '/user/settings/applications'}`);
    fireEvent.click(section.getByRole('button', { name: `Connect ${name}` }));
    await waitFor(() => expect(mocks.api.savePullRequestCredential).toHaveBeenCalledWith(id, { serverUrl: 'https://code.example:8443/forge', token: 'instance-test-token' }));
    expect(name === 'GitLab' ? mocks.api.testGitLabConnection : mocks.api.testGiteaConnection).toHaveBeenCalledWith('https://code.example:8443/forge', 'instance-test-token');
    expect(await screen.findByText(/Connected to https:\/\/code.example:8443\/forge as alice/)).toBeVisible();
    expect(section.getByPlaceholderText('Paste the token from this server')).toHaveValue('');
    expect(section.getByPlaceholderText('Paste the token from this server')).toHaveAttribute('type', 'password');
  });
  it('can test a draft without saving and hides/reveals only its own token', async () => {
    render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft(name);
    const token = section.getByPlaceholderText('Paste the token from this server');
    fireEvent.click(section.getByRole('button', { name: `Show ${name} token` })); expect(token).toHaveAttribute('type', 'text');
    fireEvent.click(section.getByRole('button', { name: `Hide ${name} token` })); expect(token).toHaveAttribute('type', 'password');
    fireEvent.click(section.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection successful as alice. Save the connection to use it.')).toBeVisible();
    expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
  });
  it('rejects invalid URLs and retains a draft when the account check fails', async () => {
    const test = name === 'GitLab' ? mocks.api.testGitLabConnection : mocks.api.testGiteaConnection;
    test.mockResolvedValue({ ok: false, error: 'Token expired' });
    render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft(name, 'http://code.example');
    expect(section.getByRole('button', { name: `Connect ${name}` })).toBeDisabled();
    expect(section.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.change(section.getByLabelText(`${name} server URL`, { exact: false }), { target: { value: 'https://code.example' } });
    fireEvent.click(section.getByRole('button', { name: `Connect ${name}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token expired');
    expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
    expect(section.getByPlaceholderText('Paste the token from this server')).toHaveValue(' instance-test-token ');
  });
  it('isolates saved-server test, replacement, cancellation, and removal', async () => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, [id]: true, [`${id}Servers`]: ['https://one.example', 'https://two.example'] });
    render(<PullRequestProvidersSettings />); await ready(); const section = provider(name);
    const row = section.getByText('https://one.example').closest('li'); if (!row) throw new Error('Server row missing');
    fireEvent.click(within(row).getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection successful: https://one.example · alice')).toBeVisible();
    expect(name === 'GitLab' ? mocks.api.testGitLabConnection : mocks.api.testGiteaConnection).toHaveBeenCalledWith('https://one.example', undefined);
    fireEvent.click(within(row).getByRole('button', { name: 'Replace token' }));
    expect(section.getByLabelText(`${name} server URL`, { exact: false })).toBeDisabled();
    fireEvent.change(section.getByPlaceholderText('Paste the token from this server'), { target: { value: 'unused' } });
    fireEvent.click(section.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Replace token' }));
    expect(section.getByPlaceholderText('Paste the token from this server')).toHaveValue('');
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, [id]: true, [`${id}Servers`]: ['https://two.example'] });
    fireEvent.click(within(row).getByRole('button', { name: `Remove ${name} connection https://one.example` }));
    await waitFor(() => expect(mocks.api.removePullRequestCredential).toHaveBeenCalledWith(id, 'https://one.example'));
    expect(await screen.findByText('Removed the connection to https://one.example.')).toBeVisible();
    expect(section.queryByText('https://one.example')).not.toBeInTheDocument();
    expect(section.getByText('https://two.example')).toBeVisible();
  });
  it('prevents duplicate submissions while checking credentials', async () => {
    const test = name === 'GitLab' ? mocks.api.testGitLabConnection : mocks.api.testGiteaConnection;
    let finish: ((value: { ok: boolean; username: string }) => void) | undefined;
    test.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft(name);
    const form = formOf(section.getByPlaceholderText('Paste the token from this server'));
    fireEvent.submit(form); fireEvent.submit(form);
    expect(test).toHaveBeenCalledTimes(1); expect(section.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    await act(async () => { finish?.({ ok: true, username: 'alice' }); });
    await waitFor(() => expect(mocks.api.savePullRequestCredential).toHaveBeenCalledTimes(1));
  });
});

it.each([true, false])('loads a GitLab cloud status without an instance list: %s', async gitlab => {
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: false, bitbucket: false, gitea: false, gitlab });
  render(<PullRequestProvidersSettings />); await ready();
  if (gitlab) expect(provider('GitLab').getByText('https://gitlab.com')).toBeVisible();
  else expect(provider('GitLab').getByLabelText('GitLab server URL', { exact: false })).toHaveValue('https://gitlab.com');
});
it('adds a fresh Gitea server beside a saved connection and clears messages on the token link', async () => {
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, gitea: true, giteaServers: ['https://saved.example'] });
  render(<PullRequestProvidersSettings />); await ready();
  const section = provider('Gitea'); fireEvent.click(section.getByRole('button', { name: 'Add Gitea server' }));
  expect(section.getByLabelText('Gitea server URL', { exact: false })).toHaveValue('');
  instanceDraft('Gitea'); fireEvent.click(section.getAllByRole('button', { name: 'Test connection' })[1]);
  expect(await screen.findByText('Connection successful as alice. Save the connection to use it.')).toBeVisible();
  fireEvent.click(section.getByRole('link', { name: 'Create a token on this server' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it.each([{ ok: false }, { ok: true }])('rejects an account check without a username: %j', async result => {
  mocks.api.testGiteaConnection.mockResolvedValue(result);
  render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft('Gitea');
  fireEvent.click(section.getByRole('button', { name: 'Connect Gitea' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to Gitea.');
  expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
});
it.each([{ ok: false, error: 'Keyring locked' }, { ok: false }])('preserves instance drafts after save failure %j', async result => {
  mocks.api.savePullRequestCredential.mockResolvedValue(result);
  render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft('Gitea');
  fireEvent.click(section.getByRole('button', { name: 'Connect Gitea' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(result.error || 'Could not save the Gitea connection.');
  expect(section.getByPlaceholderText('Paste the token from this server')).toHaveValue(' instance-test-token ');
});
it.each([{ ok: false, error: 'Keyring locked' }, { ok: false }])('retains saved instances after remove failure %j', async result => {
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, gitea: true, giteaServers: ['https://saved.example'] });
  mocks.api.removePullRequestCredential.mockResolvedValue(result);
  render(<PullRequestProvidersSettings />); await ready();
  fireEvent.click(provider('Gitea').getByRole('button', { name: 'Remove Gitea connection https://saved.example' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(result.error || 'Could not remove the Gitea connection.');
  expect(provider('Gitea').getByText('https://saved.example')).toBeVisible();
});
it.each(['check', 'save', 'remove'] as const)('ignores an instance %s completion after unmount', async phase => {
  let finish: (() => void) | undefined;
  if (phase === 'check') mocks.api.testGiteaConnection.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ok: true, username: 'alice' }); }));
  if (phase === 'save') mocks.api.savePullRequestCredential.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ok: true }); }));
  if (phase === 'remove') {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ ...empty, gitea: true, giteaServers: ['https://saved.example'] });
    mocks.api.removePullRequestCredential.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ok: true }); }));
  }
  const { unmount } = render(<PullRequestProvidersSettings />); await ready();
  if (phase === 'remove') fireEvent.click(provider('Gitea').getByRole('button', { name: 'Remove Gitea connection https://saved.example' }));
  else fireEvent.click(instanceDraft('Gitea').getByRole('button', { name: 'Connect Gitea' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  const refreshes = mocks.api.getPullRequestCredentialStatus.mock.calls.length;
  unmount(); await act(async () => { finish?.(); });
  expect(mocks.api.getPullRequestCredentialStatus).toHaveBeenCalledTimes(refreshes);
  if (phase === 'check') expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
});

it('does not reset an instance draft when Add server is queued in the same event batch as save', async () => {
  let finish: ((value: { ok: true; username: string }) => void) | undefined;
  mocks.api.testGiteaConnection.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<PullRequestProvidersSettings />); await ready(); const section = instanceDraft('Gitea');
  act(() => {
    fireEvent.submit(formOf(section.getByPlaceholderText('Paste the token from this server')));
    fireEvent.click(section.getByRole('button', { name: 'Add Gitea server' }));
  });
  expect(section.getByLabelText('Gitea server URL', { exact: false })).toHaveValue('https://code.example:8443/forge');
  expect(mocks.api.testGiteaConnection).toHaveBeenCalledOnce();
  await act(async () => { finish?.({ ok: true, username: 'alice' }); });
  expect(mocks.api.savePullRequestCredential).toHaveBeenCalledWith('gitea', { serverUrl: 'https://code.example:8443/forge', token: 'instance-test-token' });
});
