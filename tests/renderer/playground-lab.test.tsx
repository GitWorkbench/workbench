// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaygroundChallengeId, PlaygroundLabSnapshot, PlaygroundSession } from '../../src/shared/types';
import { playgroundLessons } from '../../src/shared/playground-learning';
const mock = vi.hoisted(() => ({ get: vi.fn(), run: vi.fn(), save: vi.fn() }));
vi.mock('../../src/renderer/lib/api', async original => ({ ...await original<typeof import('../../src/renderer/lib/api')>(), api: { getPlaygroundLab: mock.get, runPlaygroundCommand: mock.run, savePlaygroundFile: mock.save } }));
import { PlaygroundLab } from '../../src/renderer/components/Playground/PlaygroundLab';
const session = (id: PlaygroundChallengeId = 'git-basics'): PlaygroundSession => ({ id: `attempt-${id}`, challengeId: id, path: `/practice/${id}`, createdAt: '2026-10-28' });
function snapshot(id: PlaygroundChallengeId = 'git-basics', patch: Partial<PlaygroundLabSnapshot> = {}): PlaygroundLabSnapshot {
  const selected = session(id), lesson = playgroundLessons.find(item => item.id === id)!;
  return { session: selected, branch: 'main', changed: [], staged: [], conflicts: [], files: lesson.files.map(file => ({ path: file, content: 'Original text\n', exists: true })), commits: [{ hash: 'abc123', subject: 'Starting snapshot' }], steps: [], progress: { session: selected, checks: [{ label: 'Task verified', passed: false }], observation: '' }, ...patch };
}
let props: React.ComponentProps<typeof PlaygroundLab>;
beforeEach(() => {
  props = { session: session(), onBack: vi.fn(), onWorkspace: vi.fn(), onProgress: vi.fn(), onLockChange: vi.fn(), onNext: vi.fn() };
  mock.get.mockReset().mockResolvedValue(snapshot()); mock.run.mockReset().mockResolvedValue({ ok: true, output: 'On branch main', snapshot: snapshot('git-basics', { steps: ['read-status'] }) }); mock.save.mockReset().mockResolvedValue(snapshot());
});
const open = async () => { const view = render(<PlaygroundLab {...props} />); await waitFor(() => expect(screen.getByLabelText('Git practice command')).toBeEnabled()); return view; };
const enter = (command: string) => fireEvent.change(screen.getByLabelText('Git practice command'), { target: { value: command } });
const execute = async (command: string) => { enter(command); fireEvent.submit(screen.getByLabelText('Git practice command').closest('form')!); await waitFor(() => expect(screen.getByLabelText('Git practice command')).toBeEnabled()); };

describe('guided practice desk', () => {
  it('explains the current task, inserts suggestions without executing, and advances from verified Git state', async () => {
    await open(); expect(screen.getByRole('heading', { name: 'Ask Git what changed' })).toBeVisible();
    expect(screen.getByText('Status is your starting point whenever you feel unsure.')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Live Git state' })).toHaveTextContent('0 pending');
    fireEvent.click(screen.getByRole('button', { name: 'git status', exact: true })); expect(mock.run).not.toHaveBeenCalled(); expect(screen.getByLabelText('Git practice command')).toHaveValue('git status');
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    expect(await screen.findByText('On branch main', { selector: 'pre' })).toBeVisible(); expect(mock.run).toHaveBeenCalledWith('attempt-git-basics', 'git status');
    expect(screen.getByRole('heading', { name: 'Meet the first snapshot' })).toBeVisible(); expect(props.onProgress).toHaveBeenCalledWith(session());
    fireEvent.click(screen.getByRole('button', { name: 'Show a hint' })); expect(screen.getByText(playgroundLessons[0].steps[1].hint)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hide hint' })); expect(screen.queryByText(playgroundLessons[0].steps[1].hint)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1. Ask Git what changed' })); expect(screen.getByRole('heading', { name: 'Ask Git what changed' })).toBeVisible();
    fireEvent.click(screen.getByText('Understand the idea')); expect(screen.getByText(playgroundLessons[0].concept)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Repository history ·/)); expect(screen.getByText('Starting snapshot')).toBeVisible();
  });
  it('preserves editor drafts, saves with the expected disk content, and blocks commands until the draft is settled', async () => {
    mock.save.mockResolvedValue(snapshot('git-basics', { changed: ['notes.txt'], steps: ['edit'], files: [{ path: 'notes.txt', content: 'My edit\n', exists: true }] }));
    await open(); const editor = screen.getByLabelText('Edit notes.txt');
    fireEvent.change(editor, { target: { value: 'My edit\n' } }); expect(screen.getByText('Unsaved draft')).toBeVisible(); expect(props.onLockChange).toHaveBeenLastCalledWith(true);
    enter('git status'); expect(screen.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Git practice command').closest('form')!); expect(await screen.findByRole('alert')).toHaveTextContent('Save or revert'); expect(mock.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save file' }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith('attempt-git-basics', 'notes.txt', 'My edit\n', 'Original text\n'));
    await waitFor(() => expect(screen.getByText('Saved on disk')).toBeVisible()); expect(editor).toHaveValue('My edit\n');
    fireEvent.click(screen.getByRole('button', { name: 'Insert example' })); expect(editor).toHaveValue(playgroundLessons[0].example);
    fireEvent.click(screen.getByRole('button', { name: 'Revert draft' })); expect(editor).toHaveValue('My edit\n');
    expect(screen.getByRole('button', { name: 'Learning path' })).toBeEnabled();
  });
  it('creates missing files and switches between practice files without silently dropping a draft', async () => {
    props.session = session('first-commit'); const current = snapshot('first-commit', { files: [{ path: 'mission.txt', content: '', exists: false }, { path: 'scratch.txt', content: 'Scratch', exists: true }] });
    mock.get.mockResolvedValue(current); mock.save.mockResolvedValue({ ...current, files: [{ path: 'mission.txt', content: 'new mission', exists: true }, current.files[1]] });
    await open(); expect(screen.getByText('New file')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'scratch.txt' })); fireEvent.click(screen.getByRole('button', { name: 'mission.txt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert example' })); fireEvent.click(screen.getByRole('button', { name: 'Revert draft' })); expect(screen.getByLabelText('Edit mission.txt')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Edit mission.txt'), { target: { value: 'new mission' } }); expect(screen.getByRole('button', { name: 'scratch.txt' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save file' })); await waitFor(() => expect(mock.save).toHaveBeenCalledWith('attempt-first-commit', 'mission.txt', 'new mission', null));
    await waitFor(() => expect(screen.getByRole('button', { name: 'scratch.txt' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'scratch.txt' })); expect(screen.getByLabelText('Edit scratch.txt')).toHaveValue('Scratch'); expect(screen.getByRole('button', { name: 'Insert example' })).toBeDisabled();
  });
  it('checks understanding after completion, explains wrong answers, and allows reviewing earlier steps', async () => {
    const completed = { ...session(), completedAt: '2026-10-28' };
    mock.get.mockResolvedValue(snapshot('git-basics', { session: completed, steps: playgroundLessons[0].steps.map(step => step.id) }));
    await open(); expect(screen.getByRole('heading', { name: 'You did it.' })).toBeVisible();
    const quiz = within(screen.getByRole('region', { name: 'Quick understanding check' }));
    expect(quiz.getByRole('button', { name: 'Continue learning' })).toBeDisabled();
    fireEvent.click(quiz.getByRole('button', { name: 'The last commit' })); expect(quiz.getByRole('status')).toHaveTextContent('Try again');
    fireEvent.click(quiz.getByRole('button', { name: 'The working tree' })); expect(quiz.getByRole('status')).toHaveTextContent('Exactly');
    fireEvent.click(quiz.getByRole('button', { name: 'Continue learning' })); expect(props.onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '1. Ask Git what changed' })); expect(screen.getByRole('heading', { name: 'Ask Git what changed' })).toBeVisible();
  });
  it('keeps a bounded console transcript, supports command history, and distinguishes failed Git commands', async () => {
    await open(); const input = screen.getByLabelText('Git practice command'); fireEvent.keyDown(input, { key: 'ArrowUp' });
    const output = screen.getByRole('log'); Object.defineProperty(output, 'scrollHeight', { configurable: true, value: 900 });
    mock.run.mockResolvedValueOnce({ ok: false, output: 'Nothing to commit', snapshot: snapshot() }); await execute('git commit -m "Too soon"');
    expect(screen.getByText('Nothing to commit')).toHaveClass('text-warn');
    expect(output.scrollTop).toBe(900); output.scrollTop = 100;
    enter('git status'); expect(output.scrollTop).toBe(100);
    await execute('git status'); fireEvent.keyDown(input, { key: 'ArrowUp' }); expect(input).toHaveValue('git status');
    fireEvent.keyDown(input, { key: 'ArrowUp' }); expect(input).toHaveValue('git commit -m "Too soon"'); fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(input).toHaveValue('git status'); fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(input).toHaveValue('');
    fireEvent.keyDown(input, { key: 'a' });
    for (let index = 0; index < 21; index++) await execute(`git status ${index}`);
    expect(within(screen.getByRole('log')).getAllByText(/^\$ git status/)).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Learning path' })); fireEvent.click(screen.getByRole('button', { name: 'Open full workspace' })); expect(props.onBack).toHaveBeenCalledOnce(); expect(props.onWorkspace).toHaveBeenCalledOnce();
  });
  it('reports load, command, and stale-save failures while retaining the editable draft', async () => {
    mock.get.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(snapshot());
    render(<PlaygroundLab {...props} />); expect(await screen.findByRole('alert')).toHaveTextContent('storage unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reload lesson' })); await waitFor(() => expect(screen.getByLabelText('Git practice command')).toBeEnabled());
    mock.run.mockRejectedValueOnce(new Error('Unsupported command')); await execute('git push'); expect(screen.getByRole('alert')).toHaveTextContent('Unsupported command');
    mock.save.mockRejectedValueOnce(new Error('File changed since loading')); fireEvent.change(screen.getByLabelText('Edit notes.txt'), { target: { value: 'Keep my draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save file' })); expect(await screen.findByRole('alert')).toHaveTextContent('File changed'); expect(screen.getByLabelText('Edit notes.txt')).toHaveValue('Keep my draft'); expect(screen.getByRole('button', { name: 'Reload lesson' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Revert draft' })); fireEvent.click(screen.getByRole('button', { name: 'Refresh practice state' })); await waitFor(() => expect(mock.get).toHaveBeenCalledTimes(3));
  });
  it('prevents duplicate commands and blank or premature form submissions', async () => {
    let finish!: (value: unknown) => void; mock.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<PlaygroundLab {...props} />); const form = screen.getByLabelText('Git practice command').closest('form')!; fireEvent.submit(form); expect(mock.run).not.toHaveBeenCalled();
    await act(async () => finish(snapshot())); fireEvent.submit(form); expect(mock.run).not.toHaveBeenCalled();
    let complete!: (value: unknown) => void; mock.run.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    enter('git status'); fireEvent.submit(form); fireEvent.submit(form); expect(mock.run).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Learning path' })).toBeDisabled();
    await act(async () => complete({ ok: true, output: 'Complete', snapshot: snapshot() })); expect(screen.getByText('Complete', { selector: 'pre' })).toBeVisible();
  });
  it('reads historical bisect files without offering an edit that would change the test result', async () => {
    props.session = session('bisect'); mock.get.mockResolvedValue(snapshot('bisect', { branch: '', changed: ['answer.txt'], staged: ['answer.txt'], conflicts: ['answer.txt'] }));
    await open(); expect(screen.getByText('Detached HEAD')).toBeVisible(); expect(screen.getByLabelText('Read answer.txt')).toHaveAttribute('readonly'); expect(screen.queryByRole('button', { name: 'Insert example' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Live Git state' })).toHaveTextContent('1 staged'); expect(screen.getByRole('status')).toHaveTextContent('Merge paused');
  });
  it('ignores late initial loads, rejected loads, command replies, and file saves after closing', async () => {
    let loaded!: (value: unknown) => void; mock.get.mockReturnValueOnce(new Promise(resolve => { loaded = resolve; }));
    const first = render(<PlaygroundLab {...props} />); first.unmount(); await act(async () => loaded(snapshot())); expect(props.onProgress).not.toHaveBeenCalled();
    let failed!: (reason: Error) => void; mock.get.mockReturnValueOnce(new Promise((_resolve, reject) => { failed = reject; }));
    const second = render(<PlaygroundLab {...props} />); second.unmount(); await act(async () => failed(new Error('late error')));
    let ran!: (value: unknown) => void; mock.run.mockReturnValueOnce(new Promise(resolve => { ran = resolve; })); const third = await open(); enter('git status'); fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true })); third.unmount(); const calls = vi.mocked(props.onProgress).mock.calls.length; await act(async () => ran({ ok: true, output: 'late', snapshot: snapshot() })); expect(props.onProgress).toHaveBeenCalledTimes(calls);
    let saved!: (value: unknown) => void; mock.save.mockReturnValueOnce(new Promise(resolve => { saved = resolve; })); const fourth = await open(); fireEvent.change(screen.getByLabelText('Edit notes.txt'), { target: { value: 'draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save file' })); fourth.unmount(); const afterSave = vi.mocked(props.onProgress).mock.calls.length; await act(async () => saved(snapshot())); expect(props.onProgress).toHaveBeenCalledTimes(afterSave);
  });
});
