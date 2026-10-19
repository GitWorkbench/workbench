// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), api: { getPullRequestCredentialStatus: vi.fn(), savePullRequestCredential: vi.fn(), removePullRequestCredential: vi.fn() } }));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: any) => any) => selector({ notify: mocks.notify }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/components/Settings/GitHubSignInPanel', () => ({ GitHubSignInPanel: () => <section aria-label="GitHub browser sign-in">GitHub sign-in panel</section> }));
import { PullRequestProvidersSettings } from '../../src/renderer/components/Settings/PullRequestProvidersSettings';

beforeEach(() => {
  mocks.notify.mockReset();
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: false, gitlab: false, bitbucket: false });
  mocks.api.savePullRequestCredential.mockResolvedValue({ ok: true });
  mocks.api.removePullRequestCredential.mockResolvedValue({ ok: true });
});
function provider(name: 'GitLab' | 'Bitbucket Cloud') { return within(screen.getByRole('heading', { name }).closest('section')!); }
async function ready() { await waitFor(() => expect(screen.queryAllByText('Checking')).toHaveLength(0)); }

describe('provider credential settings', () => {
  it('can remove a saved token while its replacement form is open', async () => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: false, gitlab: true, bitbucket: false });
    render(<PullRequestProvidersSettings />); await ready();
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Replace token' }));
    fireEvent.change(provider('GitLab').getByPlaceholderText('Paste a replacement token'), { target: { value: 'unused-replacement' } });
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Remove token' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitLab token removed'));
    expect(provider('GitLab').getByPlaceholderText('Paste your access token')).toHaveValue('');
    expect(provider('GitLab').queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
  it('loads statuses, embeds browser sign-in and links each provider to token creation', async () => {
    render(<PullRequestProvidersSettings />);
    expect(screen.getAllByText('Checking saved credentials…')).toHaveLength(2);
    await ready();
    expect(screen.getByRole('region', { name: 'GitHub browser sign-in' })).toBeVisible();
    expect(provider('GitLab').getByRole('link', { name: 'Create an access token' })).toHaveAttribute('href', 'https://gitlab.com/-/user_settings/personal_access_tokens?name=Git%20Workbench&scopes=api');
    expect(provider('Bitbucket Cloud').getByRole('link', { name: 'Create an access token' })).toHaveAttribute('href', 'https://id.atlassian.com/manage-profile/security/api-tokens');
    expect(provider('GitLab').getByRole('button', { name: 'Save token' })).toBeDisabled();
    expect(provider('Bitbucket Cloud').getByRole('button', { name: 'Save token' })).toBeDisabled();
  });
  it('shows a status-loading error while preserving editable configuration', async () => {
    mocks.api.getPullRequestCredentialStatus.mockRejectedValue(new Error('Credentials unavailable'));
    render(<PullRequestProvidersSettings />); await ready();
    expect(screen.getByText('Credentials unavailable')).toBeVisible();
    expect(provider('GitLab').getByPlaceholderText('Paste your access token')).toBeVisible();
  });
  it.each(['GitLab', 'Bitbucket Cloud'] as const)('saves %s with a trimmed secret and only required account data', async name => {
    render(<PullRequestProvidersSettings />); await ready();
    const section = provider(name), token = section.getByPlaceholderText('Paste your access token');
    fireEvent.change(token, { target: { value: ' secret-token ' } });
    if (name === 'Bitbucket Cloud') {
      expect(section.getByRole('button', { name: 'Save token' })).toBeDisabled();
      fireEvent.change(section.getByRole('textbox', { name: 'Atlassian account email' }), { target: { value: 'alice@example.test' } });
    }
    fireEvent.click(section.getByRole('button', { name: 'Save token' }));
    await waitFor(() => expect(mocks.api.savePullRequestCredential).toHaveBeenCalledWith(name === 'GitLab' ? 'gitlab' : 'bitbucket', name === 'GitLab' ? { token: 'secret-token' } : { token: 'secret-token', username: 'alice@example.test' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', `${name} token saved securely`));
    expect(mocks.api.getPullRequestCredentialStatus).toHaveBeenCalledTimes(2);
    expect(provider(name).getByPlaceholderText('Paste your access token')).toHaveValue('');
  });
  it('rejects empty direct submissions and toggles token visibility without submitting', async () => {
    render(<PullRequestProvidersSettings />); await ready();
    const section = provider('GitLab'), input = section.getByPlaceholderText('Paste your access token');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(section.getByTitle('Show token')); expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(section.getByTitle('Hide token')); expect(input).toHaveAttribute('type', 'password');
    fireEvent.change(input, { target: { value: '  ' } }); fireEvent.submit(input.closest('form')!);
    expect(mocks.api.savePullRequestCredential).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, error: 'Rejected credential' }, { ok: false }, new Error('Network unavailable')])('reports save errors and retains the value for correction', async result => {
    if (result instanceof Error) mocks.api.savePullRequestCredential.mockRejectedValue(result);
    else mocks.api.savePullRequestCredential.mockResolvedValue(result);
    render(<PullRequestProvidersSettings />); await ready();
    fireEvent.change(provider('GitLab').getByPlaceholderText('Paste your access token'), { target: { value: 'secret' } });
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Save token' }));
    const message = result instanceof Error ? result.message : result.error || 'Could not save the gitlab token.';
    expect(await screen.findByText(message)).toBeVisible();
    expect(mocks.notify).toHaveBeenCalledWith('error', message);
    expect(provider('GitLab').getByPlaceholderText('Paste your access token')).toHaveValue('secret');
  });
  it('opens token replacement, cancels without retaining a secret, then removes a credential', async () => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: true, gitlab: true, bitbucket: true });
    render(<PullRequestProvidersSettings />); await ready();
    expect(provider('GitLab').getByText('Token saved')).toBeVisible();
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Replace token' }));
    fireEvent.change(provider('GitLab').getByPlaceholderText('Paste a replacement token'), { target: { value: 'new-secret' } });
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Cancel' }));
    expect(provider('GitLab').queryByPlaceholderText('Paste a replacement token')).not.toBeInTheDocument();
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Replace token' }));
    expect(provider('GitLab').getByPlaceholderText('Paste a replacement token')).toHaveValue('');
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Cancel' }));
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Remove token' }));
    await waitFor(() => expect(mocks.api.removePullRequestCredential).toHaveBeenCalledWith('gitlab'));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('success', 'GitLab token removed'));
    expect(provider('GitLab').getByText('Not connected')).toBeVisible();
  });
  it.each([{ ok: false, error: 'Locked' }, { ok: false }, new Error('Storage unavailable')])('reports credential removal errors without forgetting the connection', async result => {
    mocks.api.getPullRequestCredentialStatus.mockResolvedValue({ github: false, gitlab: true, bitbucket: false });
    if (result instanceof Error) mocks.api.removePullRequestCredential.mockRejectedValue(result);
    else mocks.api.removePullRequestCredential.mockResolvedValue(result);
    render(<PullRequestProvidersSettings />); await ready();
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Remove token' }));
    const message = result instanceof Error ? result.message : result.error || 'Could not remove the gitlab token.';
    expect(await screen.findByText(message)).toBeVisible();
    expect(provider('GitLab').getByText('Token saved')).toBeVisible();
    expect(mocks.notify).toHaveBeenCalledWith('error', message);
  });
  it('shows pending save and remove states and prevents duplicate submission', async () => {
    let resolve!: (result: any) => void;
    mocks.api.savePullRequestCredential.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<PullRequestProvidersSettings />); await ready();
    fireEvent.change(provider('GitLab').getByPlaceholderText('Paste your access token'), { target: { value: 'secret' } });
    fireEvent.click(provider('GitLab').getByRole('button', { name: 'Save token' }));
    expect(provider('GitLab').getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => resolve({ ok: true }));
    expect(mocks.api.savePullRequestCredential).toHaveBeenCalledOnce();
  });
});
