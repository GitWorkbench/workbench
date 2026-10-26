// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPreferences } from '../../src/shared/types';
const mock = vi.hoisted(() => ({
  config: null as AiPreferences | null, keys: new Map<string, string>(), complete: vi.fn(), gitGet: vi.fn(), gitSet: vi.fn(), test: vi.fn(), hash: vi.fn(),
  get: vi.fn(), save: vi.fn(), import: vi.fn()
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: {
  getAiSettings: mock.get, saveAiSettings: mock.save, importAiSettings: mock.import,
  testAiSettings: mock.test, completeSetup: mock.complete, getGitConfig: mock.gitGet, setGitConfig: mock.gitSet
} }));
vi.mock('../../src/renderer/lib/emailAvatar', () => ({ emailAvatarHash: mock.hash }));
import { useSettings, THEMES } from '../../src/renderer/store/settings';
import { OFFLINE_AI, aiCredentialScope } from '../../src/shared/ai-preferences';
import { SetupPage } from '../../src/renderer/components/Onboarding/SetupPage';
import { AiSetupForm } from '../../src/renderer/components/Settings/AiSetupForm';
const defaults = useSettings.getState();
beforeEach(() => {
  localStorage.clear(); useSettings.setState({ ...defaults, aiCommit: { ...OFFLINE_AI, apiKey: '' }, setupCompleted: false });
  mock.config = null; mock.keys.clear();
  mock.get.mockReset().mockImplementation(async (target?: AiPreferences) => ({ config: target || mock.config, hasApiKey: !!target && !!mock.keys.get(aiCredentialScope(target)) }));
  mock.save.mockReset().mockImplementation(async (config: AiPreferences, key?: string) => {
    mock.config = config; if (key !== undefined) mock.keys.set(aiCredentialScope(config), key);
    return { config, hasApiKey: !!mock.keys.get(aiCredentialScope(config)) };
  });
  mock.test.mockReset().mockResolvedValue({ ok: true, message: 'feat: connection check' });
  mock.complete.mockReset().mockResolvedValue(undefined);
  mock.gitGet.mockReset().mockResolvedValue({ name: 'Alex Developer', email: 'alex@example.test' });
  mock.gitSet.mockReset().mockResolvedValue({ ok: true });
  mock.hash.mockReset().mockResolvedValue('sha256-example');
});
const chooseProvider = (provider: string) => fireEvent.change(screen.getByLabelText('Model provider'), { target: { value: provider } });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('first-run setup', () => {
  it('walks through profile, live themes and optional AI before completing and opening Explore', async () => {
    const done = vi.fn(); render(<SetupPage onComplete={done} />);
    expect(screen.getByRole('heading', { name: 'Commit profile' })).toHaveFocus();
    await screen.findByDisplayValue('alex@example.test');
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: ' Personal ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Commit profile' }));
    await screen.findByRole('heading', { name: 'Appearance' });
    expect(useSettings.getState().commitProfiles[0]).toMatchObject({ name: 'Personal', authorName: 'Alex Developer', authorEmail: 'alex@example.test' });
    expect(useSettings.getState().commitProfiles[1].id).toBe('work'); expect(mock.gitSet).not.toHaveBeenCalled();
    for (const theme of Object.values(THEMES)) {
      fireEvent.click(screen.getByRole('radio', { name: theme.name })); expect(document.documentElement).toHaveAttribute('data-theme', theme.id);
      expect(screen.getByRole('radio', { name: theme.name })).toHaveAttribute('aria-checked', 'true');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'AI assistant' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Finish & explore' }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mock.config).toEqual(OFFLINE_AI); expect(mock.complete).toHaveBeenCalledOnce();
    expect(useSettings.getState().setupCompleted).toBe(true);
  });
  it('can skip the complete setup or profile and AI independently', async () => {
    const done = vi.fn(); const first = render(<SetupPage onComplete={done} />); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' })); await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(mock.gitSet).not.toHaveBeenCalled(); first.unmount();
    useSettings.setState({ setupCompleted: false }); render(<SetupPage onComplete={done} />); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Set up later' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip AI & explore' })); await waitFor(() => expect(done).toHaveBeenCalledTimes(2));
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('validates identity, saves global Git config only with explicit opt-in, and supports back navigation', async () => {
    render(<SetupPage onComplete={vi.fn()} />); await flush();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Commit email'), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Commit profile' })); expect(screen.getByRole('alert')).toHaveTextContent('valid email');
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Work' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Author  ' } });
    fireEvent.change(screen.getByLabelText('Commit email'), { target: { value: 'author@example.test' } });
    fireEvent.click(screen.getByLabelText('Also set this identity in my global Git configuration'));
    fireEvent.submit(screen.getByRole('form', { name: 'Commit profile' })); await screen.findByRole('heading', { name: 'Appearance' });
    expect(mock.gitSet).toHaveBeenCalledWith({ name: 'Author', email: 'author@example.test', scope: 'global' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' })); expect(screen.getByLabelText('Your name')).toHaveValue('  Author  ');
  });
  it.each([new Error('Git failed'), { ok: false }])('preserves the profile draft when global Git save fails: %j', failure => {
    if (failure instanceof Error) mock.gitSet.mockRejectedValue(failure); else mock.gitSet.mockResolvedValue(failure);
    render(<SetupPage onComplete={vi.fn()} />);
    return screen.findByDisplayValue('alex@example.test').then(async () => {
      fireEvent.click(screen.getByLabelText('Also set this identity in my global Git configuration'));
      fireEvent.submit(screen.getByRole('form', { name: 'Commit profile' }));
      await screen.findByText(/Could not save your Git identity/);
      expect(useSettings.getState().defaultAuthorName).toBe(''); expect(screen.getByLabelText('Your name')).toHaveValue('Alex Developer');
    });
  });
  it('does not overwrite typed identity with a slow detection result and handles missing Git identity', async () => {
    let resolve!: (config: { name: string; email: string }) => void;
    mock.gitGet.mockReturnValue(new Promise(done => { resolve = done; }));
    const first = render(<SetupPage onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'My name' } });
    await act(async () => resolve({ name: 'Other', email: 'other@example.test' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('My name'); expect(screen.getByLabelText('Commit email')).toHaveValue(''); first.unmount();
    mock.gitGet.mockResolvedValue({ name: '', email: '' }); const second = render(<SetupPage onComplete={vi.fn()} />);
    await screen.findByText(/No global Git identity/); expect(screen.getByText('Your commit identity')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: ' ' } }); expect(screen.getByText('Personal profile')).toBeVisible(); second.unmount();
    mock.gitGet.mockRejectedValue(new Error('no Git')); render(<SetupPage onComplete={vi.fn()} />); await screen.findByText(/Could not read Git identity/);
  });
  it('preserves existing identity fields during detection and traps focus without accidental Escape completion', async () => {
    useSettings.setState({ defaultAuthorName: 'Existing', defaultAuthorEmail: 'existing@example.test' });
    const done = vi.fn(); render(<SetupPage onComplete={done} />); await flush();
    expect(screen.getByLabelText('Your name')).toHaveValue('Existing');
    const first = screen.getByRole('button', { name: 'Skip setup' }), last = screen.getByRole('button', { name: 'Continue' });
    last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    screen.getByRole('heading', { name: 'Commit profile' }).focus(); fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Escape' }); expect(done).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Your name'), { key: 'x' }); fireEvent.keyDown(first, { key: 'Tab' });
  });
  it('debounces avatar requests, ignores stale hashes, supports opt-out and falls back on image errors', async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    mock.hash.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue('new-hash');
    render(<SetupPage onComplete={vi.fn()} />); await flush();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    fireEvent.change(screen.getByLabelText('Commit email'), { target: { value: 'new@example.test' } });
    await act(async () => resolve('stale-hash')); expect(screen.queryByRole('img', { name: 'Alex Developer' })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const avatar = screen.getByRole('img', { name: 'Alex Developer' }); expect(avatar).toHaveAttribute('src', expect.stringContaining('new-hash'));
    fireEvent.error(avatar); expect(screen.getByText('AD')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Show my Gravatar preview')); await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole('img', { name: 'Alex Developer' })).not.toBeInTheDocument();
    mock.hash.mockRejectedValue(new Error('crypto unavailable')); fireEvent.click(screen.getByLabelText('Show my Gravatar preview'));
    await act(async () => vi.advanceTimersByTimeAsync(500)); expect(screen.getByText('AD')).toBeVisible();
  });
  it('reports completion errors and allows an explicit session-only continuation or retry', async () => {
    mock.complete.mockRejectedValueOnce(new Error('disk full')); const done = vi.fn(); const first = render(<SetupPage onComplete={done} />); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' })); await screen.findByText(/Setup could not be saved/);
    expect(done).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Continue for this session' })); expect(done).toHaveBeenCalledOnce(); first.unmount();
    mock.complete.mockRejectedValueOnce(new Error('busy')); render(<SetupPage onComplete={done} />); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' })); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' })); await waitFor(() => expect(done).toHaveBeenCalledTimes(2));
  });
  it('ignores identity, profile saves and completion results after closing the page', async () => {
    let configDone!: (config: { name: string; email: string }) => void; mock.gitGet.mockReturnValueOnce(new Promise(done => { configDone = done; }));
    const done = vi.fn(), first = render(<SetupPage onComplete={done} />); first.unmount(); await act(async () => configDone({ name: 'Late', email: '' }));
    mock.gitGet.mockResolvedValue({ name: 'Author', email: 'author@example.test' });
    let saved!: (value: { ok: boolean }) => void; mock.gitSet.mockReturnValue(new Promise(resolve => { saved = resolve; }));
    const second = render(<SetupPage onComplete={done} />); await flush(); fireEvent.click(screen.getByLabelText('Also set this identity in my global Git configuration')); fireEvent.submit(screen.getByRole('form', { name: 'Commit profile' })); second.unmount(); await act(async () => saved({ ok: true }));
    let finished!: () => void; mock.complete.mockReturnValue(new Promise(resolve => { finished = resolve; }));
    const third = render(<SetupPage onComplete={done} />); await flush(); fireEvent.click(screen.getByRole('button', { name: 'Skip setup' })); third.unmount(); await act(async () => finished()); expect(done).not.toHaveBeenCalled();
  });
});

describe('shared secure AI setup form', () => {
  it('saves hosted keys outside renderer state and shows configured status after reopening', async () => {
    const first = render(<AiSetupForm />); await flush(); chooseProvider('groq'); await flush();
    const key = screen.getByLabelText('API key'); fireEvent.change(key, { target: { value: 'fake-secret-only-for-main' } });
    expect(useSettings.getState().aiCommit.apiKey).toBe(''); expect(localStorage.getItem('git-workbench:settings:v1') || '').not.toContain('fake-secret-only-for-main');
    fireEvent.click(screen.getByRole('button', { name: 'Show API key' })); expect(key).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide API key' })); expect(key).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'selected-model' } });
    fireEvent.change(screen.getByLabelText('Commit message style'), { target: { value: 'detailed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' })); await screen.findByText(/AI settings saved/);
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'groq', model: 'selected-model', promptStyle: 'detailed' }), 'fake-secret-only-for-main');
    expect(key).toHaveValue(''); expect(screen.getByText('API key saved securely for this provider and endpoint.')).toBeVisible();
    first.unmount(); render(<AiSetupForm />); await screen.findByPlaceholderText('Saved securely — leave blank to keep');
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' })); await screen.findByText(/AI settings saved/);
    expect(mock.save).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'groq' }), undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved API key' })); await screen.findByText('API key removed for this provider and endpoint.');
    expect(mock.save).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'groq' }), '');
  });
  it('supports every provider, clears unsaved keys on host changes and validates custom URLs', async () => {
    render(<AiSetupForm />); await flush();
    for (const provider of ['pollinations', 'openrouter', 'gemini', 'ollama', 'custom', 'local']) { chooseProvider(provider); await flush(); expect(screen.getByLabelText('Model provider')).toHaveValue(provider); }
    chooseProvider('custom'); await flush();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'do-not-forward' } });
    fireEvent.change(screen.getByLabelText('API endpoint URL'), { target: { value: 'http://insecure.example.test/v1' } }); await flush(); expect(screen.getByLabelText('API key')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'custom-model' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Save AI settings' }).closest('form')!);
    await screen.findByText(/Use HTTPS for remote AI endpoints/); expect(mock.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('API endpoint URL'), { target: { value: 'http://localhost:1234/v1' } }); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' })); await screen.findByText(/AI settings saved/);
  });
  it('tests a saved configuration with built-in example content, shows pending state and connection failures', async () => {
    let respond!: (value: { ok: boolean; message?: string; error?: string }) => void;
    mock.test.mockReturnValueOnce(new Promise(resolve => { respond = resolve; }));
    render(<AiSetupForm />); await flush(); fireEvent.click(screen.getByRole('button', { name: 'Save & test' })); await waitFor(() => expect(mock.test).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Save AI settings' })).toBeDisabled();
    await act(async () => respond({ ok: true })); await screen.findByText('Connection verified.');
    mock.test.mockResolvedValueOnce({ ok: false, error: 'Provider offline' }); fireEvent.click(screen.getByRole('button', { name: 'Save & test' })); await screen.findByText('Provider offline');
    mock.test.mockResolvedValueOnce({ ok: false }); fireEvent.click(screen.getByRole('button', { name: 'Save & test' })); await screen.findByText(/The connection check failed/);
  });
  it('reports storage failures without exposing a key and retries loading after keyring recovery', async () => {
    mock.get.mockRejectedValueOnce(new Error('locked'));
    render(<AiSetupForm />); await screen.findByText(/Could not read saved keys/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry secure storage' })); await waitFor(() => expect(screen.queryByText(/Could not read saved keys/)).not.toBeInTheDocument());
    mock.save.mockRejectedValueOnce('unknown failure'); fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' })); await screen.findByText('Could not save AI settings. Try again.');
    useSettings.setState({ aiSettingsError: 'An older key needs secure import.' }); await screen.findByText('An older key needs secure import.');
  });
  it('ignores stale key status and save/test responses when the form unmounts', async () => {
    let getDone!: (snapshot: { config: AiPreferences | null; hasApiKey: boolean }) => void;
    mock.get.mockReturnValueOnce(new Promise(resolve => { getDone = resolve; }));
    const saved = vi.fn(), first = render(<AiSetupForm onSaved={saved} />); first.unmount(); await act(async () => getDone({ config: null, hasApiKey: true }));
    mock.get.mockRejectedValueOnce(new Error('late failure')); const failed = render(<AiSetupForm />); failed.unmount(); await flush();
    let saveDone!: (snapshot: { config: AiPreferences; hasApiKey: boolean }) => void;
    mock.save.mockReturnValueOnce(new Promise(resolve => { saveDone = resolve; }));
    const second = render(<AiSetupForm onSaved={saved} />); await flush(); fireEvent.click(screen.getByRole('button', { name: 'Save AI settings' })); second.unmount(); await act(async () => saveDone({ config: OFFLINE_AI, hasApiKey: false })); expect(saved).not.toHaveBeenCalled();
    let testDone!: (result: { ok: boolean }) => void; mock.test.mockReturnValueOnce(new Promise(resolve => { testDone = resolve; }));
    const third = render(<AiSetupForm />); await flush(); fireEvent.click(screen.getByRole('button', { name: 'Save & test' })); await waitFor(() => expect(mock.test).toHaveBeenCalled()); third.unmount(); await act(async () => testDone({ ok: true }));
  });
});
