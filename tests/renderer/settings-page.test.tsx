// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../src/shared/types';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  const api = Object.fromEntries(['onAppUpdateState', 'getAppUpdateState', 'checkForAppUpdates', 'downloadAppUpdate', 'installAppUpdate', 'openAppReleasePage', 'getGitConfig', 'setGitConfig', 'generateAiCommitMessage'].map(name => [name, vi.fn()]));
  return { app, api, listener: null as null | ((state: any) => void), unsubscribe: vi.fn(), useApp: Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app }) };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/components/Settings/PullRequestProvidersSettings', () => ({ PullRequestProvidersSettings: () => <div>Provider connection settings</div> }));
import { SettingsPage } from '../../src/renderer/components/Settings/SettingsPage';
import { useSettings, type SettingsSection } from '../../src/renderer/store/settings';
import { APP_VERSION } from '../../src/renderer/lib/appVersion';

const idle: AppUpdateState = { status: 'idle', currentVersion: '0.3.0', canInstallInApp: true };
beforeEach(() => {
  useSettings.getState().resetDefaults();
  useSettings.setState({ isSettingsOpen: true, settingsSection: 'about' });
  Object.assign(mocks.app, { activeTab: null, tabs: [], notify: vi.fn(), openUsageGuide: vi.fn() });
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.api.onAppUpdateState.mockImplementation(listener => { mocks.listener = listener; return mocks.unsubscribe; });
  mocks.api.getAppUpdateState.mockResolvedValue(idle);
  mocks.api.checkForAppUpdates.mockResolvedValue({ ...idle, status: 'not-available' });
  mocks.api.downloadAppUpdate.mockResolvedValue({ ...idle, status: 'downloaded', availableVersion: '0.4.0' });
  mocks.api.installAppUpdate.mockResolvedValue(true);
  mocks.api.openAppReleasePage.mockResolvedValue(undefined);
  mocks.api.setGitConfig.mockResolvedValue(undefined);
  mocks.api.getGitConfig.mockResolvedValue({ name: 'Alice', email: 'alice@example.test' });
  mocks.api.generateAiCommitMessage.mockResolvedValue({ ok: true, message: 'feat: improve application' });
});
async function ready() { await screen.findByText('Current version: v0.3.0'); }
async function emit(state: Partial<AppUpdateState>) { await act(async () => mocks.listener!({ ...idle, ...state })); }
function navigate(section: string) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Preferences categories' })).getByRole('button', { name: new RegExp(`^${section}`) }));
}
function renderSection(section: SettingsSection) { useSettings.setState({ settingsSection: section }); return render(<SettingsPage />); }

describe('Preferences navigation and basic controls', () => {
  it('uses the chosen initial category, searches labels/descriptions and clears no-result searches', async () => {
    const { unmount } = renderSection('themes');
    await waitFor(() => expect(mocks.api.getAppUpdateState).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: 'Appearance & Themes', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByText('Clean Studio Light'));
    expect(useSettings.getState().theme).toBe('light');
    fireEvent.click(screen.getByText('Bottom Right'));
    expect(useSettings.getState().toastPosition).toBe('bottom-right');
    expect(mocks.app.notify).toHaveBeenCalledWith('success', 'Toast position set to Bottom Right');
    const search = screen.getByRole('textbox', { name: 'Search settings categories' });
    fireEvent.change(search, { target: { value: 'GitHub' } });
    expect(within(screen.getByRole('navigation')).getAllByRole('button')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'missing category' } });
    expect(screen.getByText('No matching categories. Try a different search.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear settings search' }));
    expect(search).toHaveValue('');
    navigate('Pull Request Providers'); expect(screen.getByText('Provider connection settings')).toBeVisible();
    navigate('Keyboard Shortcuts'); expect(screen.getByText('Ctrl / Cmd + K')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Defaults' }));
    expect(useSettings.getState().theme).toBe('git-workbench-dark');
    unmount(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it('closes by Escape or back and opens Explore from About', async () => {
    render(<SettingsPage />); await ready();
    fireEvent.keyDown(window, { key: 'x' }); expect(useSettings.getState().isSettingsOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(useSettings.getState().isSettingsOpen).toBe(false);
    useSettings.setState({ isSettingsOpen: true });
    fireEvent.click(screen.getByRole('button', { name: /Back to Workspace/ }));
    expect(useSettings.getState().isSettingsOpen).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Explore Git Workbench' }));
    expect(mocks.app.openUsageGuide).toHaveBeenCalledOnce();
  });
  it('adjusts each typography scope separately, changes font families and resets only typography', () => {
    renderSection('typography');
    for (const [label, key, value] of [['Interface text', 'uiFontSize', '16'], ['Diff & code text', 'codeFontSize', '18'], ['Home text', 'homeFontSize', '17'], ['Guide text', 'guideFontSize', '20']] as const) {
      fireEvent.change(screen.getByRole('slider', { name: label }), { target: { value } });
      expect(useSettings.getState()[key]).toBe(Number(value));
    }
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'custom' } });
    fireEvent.change(screen.getByPlaceholderText('Enter custom font name (e.g. Segoe UI, Cantarell, SF Pro)'), { target: { value: 'Readable UI' } });
    fireEvent.change(selects[1], { target: { value: 'custom' } });
    fireEvent.change(screen.getByPlaceholderText('Enter custom monospace font name (e.g. Cascadia Code, Menlo, Fira Code)'), { target: { value: 'Readable Code' } });
    expect(useSettings.getState()).toMatchObject({ customUiFont: 'Readable UI', customCodeFont: 'Readable Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Spacious (30px)' }));
    expect(useSettings.getState().graphRowHeight).toBe(30);
    fireEvent.click(screen.getByRole('button', { name: 'Reset typography' }));
    expect(useSettings.getState()).toMatchObject({ uiFontSize: 13, codeFontSize: 12, homeFontSize: 13, guideFontSize: 13, graphRowHeight: 26 });
  });
  it('renders legacy unknown font names with safe selector defaults and respects a missing toast position', () => {
    useSettings.setState({ uiFontFamily: 'Removed font', codeFontFamily: 'Removed mono', toastPosition: undefined as any });
    renderSection('typography');
    expect(screen.getAllByRole('combobox').map(select => (select as HTMLSelectElement).value)).toEqual(['Inter', 'JetBrains Mono']);
    navigate('Appearance & Themes');
    expect(screen.getByText('Top Center (Recommended)').closest('.group')).toHaveClass('border-accent');
  });
  it('changes background fetch interval and hides interval choices when disabled', () => {
    renderSection('git');
    fireEvent.click(screen.getByRole('button', { name: '5m' }));
    expect(useSettings.getState().autoFetchInterval).toBe(300);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(useSettings.getState().autoFetch).toBe(false);
    expect(screen.queryByRole('button', { name: '5m' })).not.toBeInTheDocument();
  });
});

describe('About update controls', () => {
  it('loads installed version consistently and manually checks for updates', async () => {
    render(<SettingsPage />); await ready();
    expect(screen.getByText('Version 0.3.0')).toBeVisible();
    expect(screen.getByText('Git Workbench v0.3.0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await screen.findByText('You’re up to date (v0.3.0).');
    expect(mocks.api.checkForAppUpdates).toHaveBeenCalledOnce();
  });
  it('checks even before initial state is available and ignores a late response after unmount', async () => {
    let resolve!: (value: AppUpdateState) => void;
    mocks.api.getAppUpdateState.mockImplementation(() => new Promise<AppUpdateState>(done => { resolve = done; }));
    const { unmount } = render(<SettingsPage />);
    expect(screen.getByText('Getting update status…')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await screen.findByText('You’re up to date (v0.3.0).');
    unmount(); await act(async () => resolve(idle));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    await emit({ status: 'error' });
  });
  it('works without an update event subscription and disables duplicate manual checks while pending', async () => {
    const subscription = mocks.api.onAppUpdateState;
    (mocks.api as any).onAppUpdateState = undefined;
    let resolve!: (state: AppUpdateState) => void;
    mocks.api.checkForAppUpdates.mockImplementation(() => new Promise<AppUpdateState>(done => { resolve = done; }));
    const { unmount } = render(<SettingsPage />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    await act(async () => resolve({ ...idle, status: 'not-available' }));
    unmount(); (mocks.api as any).onAppUpdateState = subscription;
  });
  it('recovers a failed initial state request and a failed manual check with useful errors', async () => {
    mocks.api.getAppUpdateState.mockRejectedValue(new Error('Unavailable'));
    mocks.api.checkForAppUpdates.mockRejectedValue(new Error('You are offline'));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await screen.findByText('You are offline');
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeVisible();
    mocks.api.checkForAppUpdates.mockRejectedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await screen.findByText('Could not check for updates. Check your internet connection and try again.');
  });
  it('downloads only after explicit action, shows clamped progress and installs after restart confirmation', async () => {
    render(<SettingsPage />); await ready();
    await emit({ status: 'available', availableVersion: '0.4.0' });
    expect(screen.getByText('Version 0.4.0 is available.')).toBeVisible();
    expect(mocks.api.downloadAppUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    await screen.findByRole('button', { name: 'Restart & install' });
    expect(mocks.api.downloadAppUpdate).toHaveBeenCalledOnce();
    await emit({ status: 'downloading', progress: 45.8 });
    expect(screen.getByText('Downloading update · 45%')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Downloading 45%' })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'Update download progress' })).toHaveAttribute('aria-valuenow', '45');
    await emit({ status: 'downloading', progress: 150 });
    expect(screen.getByRole('progressbar').firstChild).toHaveStyle({ width: '100%' });
    await emit({ status: 'downloading', progress: -10 });
    expect(screen.getByRole('progressbar').firstChild).toHaveStyle({ width: '0%' });
    await emit({ status: 'downloaded', availableVersion: '0.4.0' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart & install' }));
    await waitFor(() => expect(mocks.api.installAppUpdate).toHaveBeenCalledOnce());
    expect(screen.getByText('Your system may ask for permission to install this update.')).toBeVisible();
  });
  it('uses manual release navigation for unsigned builds and shows readable sanitized release notes', async () => {
    render(<SettingsPage />); await ready();
    await emit({ status: 'available', canInstallInApp: false, releaseName: 'Release preview', releaseNotes: '<style>bad-style</style><script>bad-script</script><h2>Highlights</h2><p>Improved<br>history</p><ul><li>Graph updates</li></ul>' });
    const notes = screen.getByText(/• Graph updates/);
    expect(notes.tagName).toBe('PRE');
    expect(notes.textContent).toContain('Highlights\n\nImproved\nhistory');
    expect(notes.textContent).not.toMatch(/bad-style|bad-script|<p>/);
    fireEvent.click(screen.getByRole('button', { name: 'View release', exact: true }));
    await waitFor(() => expect(mocks.api.openAppReleasePage).toHaveBeenCalledOnce());
    expect(mocks.api.downloadAppUpdate).not.toHaveBeenCalled();
    await emit({ status: 'not-available', currentVersion: '', releaseNotes: 'Plain Markdown release notes', releaseName: undefined });
    expect(screen.getByText('You’re up to date.')).toBeVisible();
    expect(screen.getByText('Plain Markdown release notes')).toBeVisible();
  });
  it.each([
    [{ status: 'checking' }, 'Checking for updates…', 'Checking…'],
    [{ status: 'downloading' }, 'Downloading update…', 'Downloading 0%'],
    [{ status: 'unsupported' }, 'Update checks are available in an installed build.', 'Check for updates'],
    [{ status: 'unsupported', error: 'Use the release page' }, 'Use the release page', 'Check for updates'],
    [{ status: 'available' }, 'Version new is available.', 'Download update'],
    [{ status: 'downloaded' }, 'Version is ready to install. Restart Git Workbench to finish.', 'Restart & install'],
    [{ status: 'installing' }, 'Installing update… Git Workbench will restart when installation succeeds.', 'Installing…']
  ])('renders update status %s', async (state, text, label) => {
    render(<SettingsPage />); await ready(); await emit(state as Partial<AppUpdateState>);
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });
  it('reports failed installation, download errors and release-page failures', async () => {
    mocks.api.installAppUpdate.mockResolvedValue(false);
    render(<SettingsPage />); await ready(); await emit({ status: 'downloaded' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart & install' }));
    await screen.findByText('The update could not be started. Retry installation or use View releases to install manually.');
    mocks.api.downloadAppUpdate.mockRejectedValue(new Error('Download failed'));
    await emit({ status: 'available' });
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    await screen.findByText('Download failed');
    mocks.api.openAppReleasePage.mockRejectedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'View releases' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Could not open the Git Workbench release page.'));
    await emit({ status: 'available', canInstallInApp: false });
    fireEvent.click(screen.getByRole('button', { name: 'View release', exact: true }));
    await screen.findByText('The update action failed. Please try again.');
  });
  it('opens releases and preserves installation errors from a rejected retry', async () => {
    render(<SettingsPage />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'View releases' }));
    await waitFor(() => expect(mocks.api.openAppReleasePage).toHaveBeenCalledOnce());
    mocks.api.installAppUpdate.mockRejectedValue(new Error('Authorization unavailable'));
    await emit({ status: 'downloaded' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart & install' }));
    await screen.findByText('Authorization unavailable');
    expect(screen.getByRole('button', { name: 'Retry installation' })).toBeEnabled();
  });
  it('preserves the main-process installation error and offers retry instead of downloading again', async () => {
    render(<SettingsPage />); await ready();
    await emit({ status: 'downloaded', availableVersion: '1.0.0' });
    mocks.api.installAppUpdate.mockResolvedValueOnce(false);
    mocks.api.getAppUpdateState.mockResolvedValue({ ...idle, status: 'error', errorStage: 'install', availableVersion: '1.0.0', error: 'The package installer could not obtain authorization.' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart & install' }));
    await screen.findByText('The package installer could not obtain authorization.');
    expect(screen.getByText('The update was downloaded, but installation could not finish.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry installation' }));
    await waitFor(() => expect(mocks.api.installAppUpdate).toHaveBeenCalledTimes(2));
    expect(mocks.api.downloadAppUpdate).not.toHaveBeenCalled();
    expect(mocks.api.checkForAppUpdates).not.toHaveBeenCalled();
  });
  it('strips a release containing only unsafe markup and reports release navigation errors', async () => {
    render(<SettingsPage />); await ready();
    await emit({ releaseNotes: '<script>bad</script><style>bad</style>' });
    expect(screen.getByText('Release notes').parentElement?.querySelector('pre')).toHaveTextContent('');
    mocks.api.openAppReleasePage.mockRejectedValue(new Error('Browser unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'View releases' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Browser unavailable'));
  });
});

describe('commit identity profiles', () => {
  it.each([null, '/another'])('ignores a stale local identity action after switching repository to %j', path => {
    mocks.app.activeTab = '/repo'; renderSection('profiles');
    const button = screen.getByRole('button', { name: 'Save to Current Repo' });
    mocks.app.activeTab = path; fireEvent.click(button);
    expect(mocks.api.setGitConfig).not.toHaveBeenCalled();
  });
  it('keeps the final profile when an earlier delete control receives a queued click', () => {
    renderSection('profiles');
    const button = screen.getAllByTitle('Delete profile')[0];
    const last = useSettings.getState().commitProfiles[0];
    act(() => { useSettings.setState({ commitProfiles: [last], activeProfileId: last.id }); fireEvent.click(button); });
    expect(useSettings.getState().commitProfiles).toEqual([last]);
  });
  it('detects and edits identity, signing key, saves global/local config and dismisses success messages', async () => {
    mocks.app.activeTab = '/work/repo'; mocks.app.tabs = [{ path: '/work/repo', name: 'My repo' }];
    renderSection('profiles');
    fireEvent.click(screen.getByRole('button', { name: 'Detect from Git' }));
    await screen.findByText('Detected git config: Alice <alice@example.test>');
    expect(useSettings.getState()).toMatchObject({ defaultAuthorName: 'Alice', defaultAuthorEmail: 'alice@example.test' });
    fireEvent.click(screen.getByTitle('Dismiss'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Jane Developer'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. jane@example.com'), { target: { value: 'bob@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('Optional GPG Key ID or ~/.ssh/id_ed25519.pub'), { target: { value: 'key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Global (~/.gitconfig)' }));
    await screen.findByText('Applied to ~/.gitconfig (global configuration)');
    expect(mocks.api.setGitConfig).toHaveBeenCalledWith({ name: 'Bob', email: 'bob@example.test', scope: 'global' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Current Repo' }));
    await screen.findByText('Applied to local repository: My repo');
    expect(mocks.api.setGitConfig).toHaveBeenCalledWith({ name: 'Bob', email: 'bob@example.test', scope: 'local' });
    expect(useSettings.getState().signingKey).toBe('key');
  });
  it.each([{}, { name: 'Alice' }, { email: 'alice@example.test' }])('reports complete or partial detected config %s', async config => {
    mocks.api.getGitConfig.mockResolvedValue(config); renderSection('profiles');
    fireEvent.click(screen.getByRole('button', { name: 'Detect from Git' }));
    await screen.findByText(!config.name && !config.email ? 'No global user.name or user.email found in Git config' : `Detected git config: ${config.name || 'unnamed'} <${config.email || 'no-email'}>`);
  });
  it('reports config failures and disables local save without a repository', async () => {
    mocks.api.getGitConfig.mockRejectedValue(new Error('Git not found'));
    mocks.api.setGitConfig.mockRejectedValue(new Error('Config is read-only'));
    renderSection('profiles');
    expect(screen.getByRole('button', { name: 'Save to Current Repo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Detect from Git' })); await screen.findByText('Git not found');
    fireEvent.click(screen.getByRole('button', { name: 'Save to Global (~/.gitconfig)' })); await screen.findByText('Config is read-only');
  });
  it('uses fallback error messages and repository paths when Git has incomplete responses', async () => {
    mocks.app.activeTab = '/work/no-tab'; mocks.app.tabs = [];
    mocks.api.getGitConfig.mockRejectedValue({}); mocks.api.setGitConfig.mockRejectedValueOnce({});
    renderSection('profiles');
    fireEvent.click(screen.getByRole('button', { name: 'Detect from Git' })); await screen.findByText('Failed to detect git config');
    fireEvent.click(screen.getByRole('button', { name: 'Save to Global (~/.gitconfig)' })); await screen.findByText('Failed to save global git config');
    expect(mocks.api.setGitConfig).toHaveBeenCalledWith({ name: undefined, email: undefined, scope: 'global' });
    mocks.api.setGitConfig.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Current Repo' })); await screen.findByText('Applied to local repository: /work/no-tab');
    mocks.api.setGitConfig.mockRejectedValueOnce(new Error('Local config locked'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to Current Repo' })); await screen.findByText('Local config locked');
    mocks.api.setGitConfig.mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Save to Current Repo' })); await screen.findByText('Failed to save local git config');
  });
  it('saves an explicit profile identity and closes its draft with the close control', () => {
    renderSection('profiles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Profile' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Work / Client'), { target: { value: ' Work ' } });
    fireEvent.change(screen.getByPlaceholderText('Author Name'), { target: { value: ' Client Author ' } });
    fireEvent.change(screen.getByPlaceholderText('email@company.com'), { target: { value: 'client@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(useSettings.getState().commitProfiles.at(-1)).toMatchObject({ name: 'Work', authorName: 'Client Author', authorEmail: 'client@example.test' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Profile' }));
    fireEvent.click(screen.getByPlaceholderText('e.g. Work / Client').closest('form')!.querySelector('button')!);
    expect(screen.queryByText('New Commit Profile')).not.toBeInTheDocument();
  });
  it('indicates signing on profiles with a configured key', () => {
    useSettings.setState({ commitProfiles: [{ id: 'one', name: 'Signed profile', authorName: 'Author', authorEmail: 'author@example.test', signingKey: 'key' }], activeProfileId: 'one' });
    renderSection('profiles');
    expect(screen.getByText('🔑 Signed')).toBeVisible();
  });
  it('adds a trimmed profile with inherited identity and can activate/delete profiles without deleting the last one', () => {
    useSettings.getState().setDefaultAuthorName('Alice'); useSettings.getState().setDefaultAuthorEmail('alice@example.test');
    renderSection('profiles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Profile' }));
    fireEvent.keyDown(window, { key: 'Escape' }); expect(useSettings.getState().isSettingsOpen).toBe(true);
    const name = screen.getByPlaceholderText('e.g. Work / Client');
    fireEvent.change(name, { target: { value: '   ' } }); fireEvent.submit(name.closest('form')!);
    expect(useSettings.getState().commitProfiles).toHaveLength(2);
    fireEvent.change(name, { target: { value: ' Client ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    const profile = useSettings.getState().commitProfiles.at(-1)!;
    expect(profile).toMatchObject({ name: 'Client', authorName: 'Alice', authorEmail: 'alice@example.test' });
    expect(useSettings.getState().activeProfileId).toBe(profile.id);
    fireEvent.click(screen.getAllByRole('button', { name: 'Set as Active' })[0]);
    expect(useSettings.getState().activeProfileId).toBe('default');
    fireEvent.click(screen.getAllByTitle('Delete profile')[0]);
    expect(useSettings.getState().activeProfileId).toBe('work');
    fireEvent.click(screen.getAllByTitle('Delete profile')[1]);
    expect(useSettings.getState().commitProfiles).toHaveLength(1);
    expect(screen.queryByTitle('Delete profile')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New Commit Profile')).not.toBeInTheDocument();
  });
});

describe('AI settings', () => {
  it('sets each provider default, editable model/key/endpoint and preferred commit style', () => {
    renderSection('ai');
    const providers = [['Smart Rule-Based', 'local', 'heuristic'], ['Pollinations.ai', 'pollinations', 'openai'], ['OpenRouter Free', 'openrouter', 'openrouter/free'], ['Groq Cloud', 'groq', 'llama-3.3-70b-versatile'], ['Google Gemini', 'gemini', 'gemini-2.5-flash'], ['Ollama Local', 'ollama', 'qwen2.5-coder:7b'], ['Custom Endpoint', 'custom', 'qwen2.5-coder:7b']];
    for (const [label, provider, model] of providers) { fireEvent.click(screen.getByText(label)); expect(useSettings.getState().aiCommit).toMatchObject({ provider, model }); }
    fireEvent.change(screen.getByPlaceholderText('e.g. openai-fast, gemini-2.0-flash-exp'), { target: { value: 'my-model' } });
    const key = screen.getByPlaceholderText('Leave blank for free endpoints');
    fireEvent.change(key, { target: { value: 'secret' } }); expect(key).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show', exact: true })); expect(key).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide', exact: true })); expect(key).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByPlaceholderText('e.g. http://localhost:11434/v1 or https://your-provider/v1'), { target: { value: 'http://localhost:8000/v1' } });
    fireEvent.click(screen.getByText('Detailed Summary')); expect(useSettings.getState().aiCommit.promptStyle).toBe('detailed');
    fireEvent.click(screen.getByText('Minimalist One-Liner')); expect(useSettings.getState().aiCommit.promptStyle).toBe('simple');
    expect(useSettings.getState().aiCommit).toMatchObject({ model: 'my-model', apiKey: 'secret', endpoint: 'http://localhost:8000/v1' });
  });
  it('shows pending state and model output', async () => {
    let resolve!: (result: any) => void;
    mocks.api.generateAiCommitMessage.mockImplementation(() => new Promise(done => { resolve = done; }));
    renderSection('ai');
    fireEvent.click(screen.getByRole('button', { name: 'Test AI Model' }));
    expect(screen.getByRole('button', { name: 'Testing...' })).toBeDisabled();
    await act(async () => resolve({ ok: true, message: 'feat: improve test coverage' }));
    expect(screen.getByText('feat: improve test coverage')).toBeVisible();
  });
  it.each([{ ok: false, error: 'Invalid API key' }, { ok: false }, new Error('Server offline'), {}])('shows generation failures %s', async result => {
    if (result instanceof Error || !('ok' in result)) mocks.api.generateAiCommitMessage.mockRejectedValue(result);
    else mocks.api.generateAiCommitMessage.mockResolvedValue(result);
    renderSection('ai'); fireEvent.click(screen.getByRole('button', { name: 'Test AI Model' }));
    await screen.findByText(result instanceof Error ? result.message : 'ok' in result ? result.error || 'Failed to generate commit message' : 'Connection or generation failed');
    expect(screen.getByRole('button', { name: 'Test AI Model' })).toBeEnabled();
  });
});
