// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCommitConfig, AiCommitDraft, BranchChangesExplanation, Commit } from '../../src/shared/types';

const mock = vi.hoisted(() => ({
  app: { activeTab: '/repo', branches: { local: [{ name: 'main', fullName: 'main', isCurrent: true }], remote: [{ name: 'origin/main', fullName: 'origin/main', isCurrent: false }] }, runAndRefresh: vi.fn() },
  config: { provider: 'local', model: '', apiKey: '', endpoint: '', promptStyle: 'conventional' } as AiCommitConfig,
  openSettings: vi.fn(), close: vi.fn(), clipboard: vi.fn(),
  api: { recomposeCommitMessage: vi.fn(), explainBranchChanges: vi.fn(), editCommitMessage: vi.fn() }
}));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: typeof mock.app) => unknown) => select(mock.app), { getState: () => mock.app }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: Object.assign((select: (state: { aiCommit: AiCommitConfig }) => unknown) => select({ aiCommit: mock.config }), { getState: () => ({ openSettings: mock.openSettings }) }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
import { AiHistoryDialog } from '../../src/renderer/components/CommitGraph/AiHistoryDialog';

const commit: Commit = { hash: 'b'.repeat(40), shortHash: 'bbbbbbb', parents: [], message: 'Original subject', body: 'Original body', authorName: 'Author', authorEmail: 'author@example.invalid', date: '2026-01-01', refs: [], lane: 0, lanes: [] };
const draft: AiCommitDraft = { head: 'a'.repeat(40), branch: 'feature', commitHash: commit.hash, originalMessage: 'Original subject\n\nOriginal body', message: 'feat: generated subject', inputTruncated: true };
const explanation: BranchChangesExplanation = { baseHash: 'c'.repeat(40), tipHash: commit.hash, mergeBase: 'd'.repeat(40), commitCount: 3, filesChanged: 2, explanation: 'The selected branch changes two files.' };
const show = (kind: 'reword' | 'explain' = 'reword') => render(<AiHistoryDialog kind={kind} commit={commit} repo="/repo" onClose={mock.close} />);
const generate = async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate draft' })); await waitFor(() => expect(screen.getByRole('textbox', { name: 'Recomposed commit message' })).toHaveValue(draft.message)); };
beforeEach(() => {
  vi.resetAllMocks(); mock.app.activeTab = '/repo';
  mock.app.branches = { local: [{ name: 'main', fullName: 'main', isCurrent: true }], remote: [{ name: 'origin/main', fullName: 'origin/main', isCurrent: false }] };
  mock.config = { provider: 'local', model: '', apiKey: '', endpoint: '', promptStyle: 'conventional' };
  mock.api.recomposeCommitMessage.mockResolvedValue(draft);
  mock.api.explainBranchChanges.mockResolvedValue(explanation);
  mock.api.editCommitMessage.mockResolvedValue({ ok: true });
  mock.app.runAndRefresh.mockImplementation(async (run: () => Promise<unknown>) => { await run(); return true; });
  mock.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mock.clipboard } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AI commit draft interactions', () => {
  it('waits for explicit generation, shows the committed original, and applies only the edited confirmed draft', async () => {
    show();
    expect(mock.api.recomposeCommitMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/Original subject\s+Original body/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply message' })).toBeDisabled();
    await generate();
    expect(mock.api.recomposeCommitMessage).toHaveBeenCalledWith(commit.hash, mock.config);
    expect(screen.getByText(/first 8,000 characters/)).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Recomposed commit message' }), { target: { value: '  fix: reviewed draft  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply message' }));
    await waitFor(() => expect(mock.api.editCommitMessage).toHaveBeenCalledWith(commit.hash, 'fix: reviewed draft', { head: draft.head, branch: draft.branch }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('restore point'));
    await waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  });
  it('does not rewrite an unchanged, empty, cancelled, or wrong-repository draft', async () => {
    show(); await generate(); const field = screen.getByRole('textbox', { name: 'Recomposed commit message' });
    fireEvent.change(field, { target: { value: draft.originalMessage } }); expect(screen.getByRole('button', { name: 'Apply message' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '  ' } }); expect(screen.getByRole('button', { name: 'Apply message' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'New subject' } }); vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Apply message' })); expect(mock.api.editCommitMessage).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockImplementation(() => { mock.app.activeTab = '/other'; return true; });
    fireEvent.click(screen.getByRole('button', { name: 'Apply message' })); expect(mock.api.editCommitMessage).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, error: 'Stale branch' }, { ok: false }, new Error('Keyring unavailable')])('keeps editable text after application failure %#', async result => {
    if (result instanceof Error) mock.api.editCommitMessage.mockRejectedValue(result); else mock.api.editCommitMessage.mockResolvedValue(result);
    show(); await generate(); fireEvent.click(screen.getByRole('button', { name: 'Apply message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(result instanceof Error ? result.message : result.error || 'could not be changed');
    expect(screen.getByRole('textbox', { name: 'Recomposed commit message' })).toHaveValue(draft.message);
    expect(mock.close).not.toHaveBeenCalled();
  });
  it('keeps the dialog open when refresh reports failure and surfaces refresh rejections', async () => {
    mock.app.runAndRefresh.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Refresh failed'));
    show(); await generate(); fireEvent.click(screen.getByRole('button', { name: 'Apply message' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply message' })).toBeEnabled());
    expect(mock.close).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Apply message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed');
  });
  it('prevents duplicate writes and closing while the branch update is pending', async () => {
    let finish: ((value: { ok: boolean }) => void) | undefined;
    mock.api.editCommitMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    show(); await generate(); const apply = screen.getByRole('button', { name: 'Apply message' }); fireEvent.click(apply); fireEvent.click(apply);
    fireEvent.keyDown(window, { key: 'Escape' });
    const dialog = screen.getByRole('dialog'); fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.getByRole('button', { name: 'Close AI history dialog' })).toBeDisabled();
    expect(mock.close).not.toHaveBeenCalled(); expect(mock.api.editCommitMessage).toHaveBeenCalledOnce();
    await act(async () => { finish?.({ ok: true }); }); await waitFor(() => expect(mock.close).toHaveBeenCalledOnce());
  });
  it('rejects stale generation results after config changes, repository changes, or unmount', async () => {
    let finish: ((value: AiCommitDraft) => void) | undefined;
    mock.api.recomposeCommitMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { rerender, unmount } = show(); fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
    mock.config = { ...mock.config, provider: 'ollama', model: 'new-model' };
    rerender(<AiHistoryDialog kind="reword" commit={commit} repo="/repo" onClose={mock.close} />);
    await act(async () => { finish?.(draft); }); expect(screen.getByRole('textbox', { name: 'Recomposed commit message' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' })); mock.app.activeTab = '/other';
    rerender(<AiHistoryDialog kind="reword" commit={commit} repo="/repo" onClose={mock.close} />);
    await act(async () => { finish?.(draft); }); expect(mock.close).toHaveBeenCalled();
    unmount(); await act(async () => { finish?.(draft); });
  });
  it('shows generation errors and ignores requests from a closed repository', async () => {
    mock.api.recomposeCommitMessage.mockRejectedValue(new Error('Provider offline')); show();
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' })); expect(await screen.findByRole('alert')).toHaveTextContent('Provider offline');
    mock.app.activeTab = '/other'; fireEvent.click(screen.getByRole('button', { name: 'Generate draft' })); expect(mock.api.recomposeCommitMessage).toHaveBeenCalledOnce();
  });
});

describe('AI branch explanations and dialog navigation', () => {
  it('compares explicit refs, displays counts, copies text, and invalidates results when refs change', async () => {
    mock.config = { ...mock.config, provider: 'ollama', model: '' }; show('explain');
    expect(screen.getByText(/default model/)).toBeVisible();
    expect(screen.getByLabelText('Explanation base revision')).toHaveValue('main');
    fireEvent.change(screen.getByLabelText('Explanation base revision'), { target: { value: 'origin/main' } });
    fireEvent.change(screen.getByLabelText('Explanation tip revision'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explain changes' }));
    expect(await screen.findByText(explanation.explanation)).toBeVisible();
    expect(mock.api.explainBranchChanges).toHaveBeenCalledWith('origin/main', 'feature', mock.config);
    fireEvent.click(screen.getByRole('button', { name: 'Copy explanation' })); expect(mock.clipboard).toHaveBeenCalledWith(explanation.explanation);
    mock.clipboard.mockRejectedValueOnce(new Error('Clipboard denied')); fireEvent.click(screen.getByRole('button', { name: 'Copy explanation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard denied');
    fireEvent.change(screen.getByLabelText('Explanation tip revision'), { target: { value: '' } });
    expect(screen.queryByText(explanation.explanation)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Explain changes' })).toBeDisabled();
  });
  it('uses a safe base fallback when there is no main branch and handles explanation failures', async () => {
    mock.app.branches = { local: [], remote: [] }; mock.api.explainBranchChanges.mockRejectedValue(new Error('No common ancestor'));
    show('explain'); expect(screen.getByLabelText('Explanation base revision')).toHaveValue('HEAD~1');
    fireEvent.click(screen.getByRole('button', { name: 'Explain changes' })); expect(await screen.findByRole('alert')).toHaveTextContent('No common ancestor');
  });
  it('opens AI settings only by explicit action', () => {
    show(); fireEvent.click(screen.getByRole('button', { name: 'AI settings' }));
    expect(mock.close).toHaveBeenCalledOnce(); expect(mock.openSettings).toHaveBeenCalledWith('ai');
  });
  it('traps keyboard focus, restores the previous control on close, and supports Escape/backdrop', () => {
    const previous = document.createElement('button'); document.body.append(previous); previous.focus();
    const { unmount } = show(); const dialog = screen.getByRole('dialog'); expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' }); expect(screen.getByRole('button', { name: 'Close AI history dialog' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(screen.getByRole('button', { name: 'Generate draft' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' }); expect(screen.getByRole('button', { name: 'Close AI history dialog' })).toHaveFocus();
    fireEvent.mouseDown(dialog); expect(mock.close).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!); fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(mock.close).toHaveBeenCalledTimes(3); unmount(); expect(previous).toHaveFocus(); previous.remove();
  });
});

it('rejects applying a draft after the repository changes before the click', async () => {
  show(); await generate(); mock.app.activeTab = '/other';
  fireEvent.click(screen.getByRole('button', { name: 'Apply message' }));
  expect(window.confirm).not.toHaveBeenCalled(); expect(mock.api.editCommitMessage).not.toHaveBeenCalled();
});
it('traps reverse focus from the panel and keeps focus when all controls are disabled', () => {
  show(); const dialog = screen.getByRole('dialog');
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Generate draft' })).toHaveFocus();
  dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
  dialog.focus(); fireEvent.keyDown(window, { key: 'Tab' });
  expect(dialog).toHaveFocus();
});
it('cleans up the focus trap and tolerates an already queued event after unmount', () => {
  const listen = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
  const { unmount } = show();
  const keydown = listen.mock.calls.find(([type]) => type === 'keydown')?.[1];
  if (typeof keydown !== 'function') throw new Error('Dialog key handler missing');
  unmount();
  expect(remove).toHaveBeenCalledWith('keydown', keydown, true);
  expect(() => keydown.call(window, new KeyboardEvent('keydown', { key: 'Tab' }))).not.toThrow();
});
