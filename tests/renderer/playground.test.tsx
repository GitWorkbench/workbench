// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundChallenges } from '../../src/shared/playground';
import { playgroundLessons } from '../../src/shared/playground-learning';
import type { PlaygroundSession } from '../../src/shared/types';

const mock = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), check: vi.fn(), lab: vi.fn(), command: vi.fn(), save: vi.fn() }));
vi.mock('../../src/renderer/lib/api', async original => ({
  ...await original<typeof import('../../src/renderer/lib/api')>(),
  api: { listPlaygroundSessions: mock.list, createPlaygroundSession: mock.create, checkPlaygroundSession: mock.check, getPlaygroundLab: mock.lab, runPlaygroundCommand: mock.command, savePlaygroundFile: mock.save }
}));
import { useApp, WIP_HASH } from '../../src/renderer/store';
import { useSettings } from '../../src/renderer/store/settings';
import { Playground } from '../../src/renderer/components/Playground/Playground';
const initial = useApp.getState();
const session = (id = 'first', challengeId: PlaygroundSession['challengeId'] = 'first-commit', completed = false): PlaygroundSession => ({ id, challengeId, path: `/practice/${id}/repository`, createdAt: id === 'new' ? '2026-10-28T12:00:00Z' : '2026-10-28T10:00:00Z', ...(completed ? { completedAt: '2026-10-28T11:00:00Z' } : {}) });
const chooseFirst = () => fireEvent.click(screen.getByRole('button', { name: /One focused commit/ }));
const start = async () => { render(<Playground />); chooseFirst(); await waitFor(() => expect(screen.getByRole('button', { name: 'Start challenge' })).toBeEnabled()); };
beforeEach(() => {
  mock.list.mockReset().mockResolvedValue({ sessions: [], warnings: [] }); mock.create.mockReset().mockImplementation(async id => session('new', id)); mock.check.mockReset();
  mock.lab.mockReset(); mock.command.mockReset(); mock.save.mockReset();
  useApp.setState({ ...initial, playgroundOpen: true, homeOpen: false, activeTab: null, isOpeningRepo: false,
    openRepo: vi.fn(async path => { useApp.setState({ activeTab: path }); }), selectCommit: vi.fn(), openReflogModal: vi.fn(), openBisectModal: vi.fn() }, true);
  useSettings.setState({ isSettingsOpen: false });
});

describe('Git Playground workspace', () => {
  const labState = (attempt: PlaygroundSession) => ({ session: attempt, branch: 'main', changed: [], staged: [], conflicts: [], files: playgroundLessons.find(item => item.id === attempt.challengeId)!.files.map(path => ({ path, content: 'Starting text', exists: true })), commits: [], steps: [], progress: { session: attempt, checks: [], observation: '' } });
  it('starts the guided path, keeps editor drafts safe, resumes, restarts, and opens the practice repository on request', async () => {
    const attempt = session('new', 'git-basics'); mock.lab.mockResolvedValue(labState(attempt));
    render(<Playground />); await waitFor(() => expect(screen.getByRole('button', { name: 'Start guided lesson' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Foundations' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start guided lesson' })); await screen.findByRole('complementary', { name: 'Lesson coach' });
    expect(useApp.getState().openRepo).not.toHaveBeenCalled(); expect(mock.create).toHaveBeenCalledWith('git-basics');
    await waitFor(() => expect(screen.getByLabelText('Edit notes.txt')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Edit notes.txt'), { target: { value: 'draft' } }); expect(screen.getByRole('button', { name: 'Close Git Playground' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(useApp.getState().playgroundOpen).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Revert draft' })); fireEvent.click(screen.getByRole('button', { name: 'Learning path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume guided lesson' })); await screen.findByLabelText('Edit notes.txt'); expect(mock.create).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Learning path' }));
    mock.create.mockResolvedValueOnce(session('fresh', 'git-basics')); mock.lab.mockResolvedValueOnce(labState(session('fresh', 'git-basics')));
    fireEvent.click(screen.getByRole('button', { name: 'Restart guided lesson' })); await waitFor(() => expect(mock.lab).toHaveBeenLastCalledWith('fresh'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open full workspace' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Open full workspace' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useApp.getState().openRepo).toHaveBeenCalledWith(session('fresh', 'git-basics').path, { notifyOnSuccess: false });
  });
  it('continues to the next lesson and returns to the path after the last lesson', async () => {
    const basics = session('basics', 'git-basics', true); mock.list.mockResolvedValue({ sessions: [basics], warnings: [] });
    mock.lab.mockImplementation(async id => labState(id === 'basics' ? basics : session('new', 'first-commit')));
    render(<Playground />); await screen.findByText(basics.path); fireEvent.click(screen.getByRole('button', { name: 'Resume guided lesson' }));
    await screen.findByRole('region', { name: 'Quick understanding check' }); fireEvent.click(screen.getByRole('button', { name: 'The working tree' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue learning' })); await waitFor(() => expect(mock.create).toHaveBeenCalledWith('first-commit'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Learning path' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Learning path' }));
    const last = session('last', 'bisect', true); mock.list.mockResolvedValue({ sessions: [last], warnings: [] }); mock.lab.mockResolvedValue(labState(last));
    await act(async () => useApp.setState({ activeTab: '/another' })); fireEvent.click(screen.getByRole('button', { name: /Find the sneaky regression/ })); await screen.findByText(last.path);
    fireEvent.click(screen.getByRole('button', { name: 'Resume guided lesson' })); await screen.findByRole('region', { name: 'Quick understanding check' });
    fireEvent.click(screen.getByRole('button', { name: 'The bug exists at this revision' })); fireEvent.click(screen.getByRole('button', { name: 'Continue learning' })); expect(await screen.findByRole('heading', { name: 'Find the sneaky regression' })).toBeVisible();
  });
  it('preserves the course when a guided start fails and ignores a start finishing after the catalog closes', async () => {
    mock.create.mockRejectedValueOnce(new Error('Git missing')); render(<Playground />); await waitFor(() => expect(screen.getByRole('button', { name: 'Start guided lesson' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start guided lesson' })); expect(await screen.findByRole('alert')).toHaveTextContent('Git missing');
    let finish!: (value: PlaygroundSession) => void; mock.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Start guided lesson' }));
    await act(async () => useApp.setState({ playgroundOpen: false })); await act(async () => finish(session('late', 'git-basics')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps workspace-opening and next-lesson failures visible in the practice desk', async () => {
    const attempt = session('ready', 'git-basics', true); mock.list.mockResolvedValue({ sessions: [attempt], warnings: [] }); mock.lab.mockResolvedValue(labState(attempt));
    render(<Playground />); await screen.findByText(attempt.path); fireEvent.click(screen.getByRole('button', { name: 'Resume guided lesson' }));
    await screen.findByRole('region', { name: 'Quick understanding check' });
    useApp.setState({ openRepo: vi.fn(async () => { throw new Error('Repository could not be read'); }) });
    fireEvent.click(screen.getByRole('button', { name: 'Open full workspace' })); expect(await screen.findByRole('alert')).toHaveTextContent('Repository could not be read');
    mock.create.mockRejectedValueOnce(new Error('No space for the next lesson'));
    fireEvent.click(screen.getByRole('button', { name: 'The working tree' })); fireEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No space for the next lesson'));
    expect(screen.getByRole('region', { name: 'Quick understanding check' })).toBeVisible();
  });
  it('offers ten lessons, hints, keyboard navigation and skippable local practice', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    await start(); const dialog = screen.getByRole('dialog', { name: 'Git Playground' }); expect(dialog).toHaveFocus();
    expect(screen.getByText('0 / 10')).toBeVisible();
    for (const challenge of playgroundChallenges) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(challenge.title) }));
      expect(screen.getByRole('heading', { name: challenge.title })).toBeVisible();
      expect(screen.getByText(challenge.goal)).toBeVisible();
      fireEvent.click(screen.getByText('Need a hint?')); expect(screen.getByText(challenge.hint)).toBeInTheDocument();
    }
    const first = screen.getByRole('button', { name: 'Close Git Playground' }); const last = screen.getByRole('button', { name: 'Start guided lesson' });
    fireEvent.keyDown(window, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' }); expect(first).toHaveFocus();
    dialog.focus(); fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'ArrowDown' }); expect(useApp.getState().playgroundOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus(); trigger.remove();
  });
  it('starts a real attempt through IPC, opens its repository quietly, and leaves the tracker visible', async () => {
    mock.list.mockResolvedValue({ sessions: [session('new')], warnings: [] });
    render(<Playground />); chooseFirst(); await waitFor(() => expect(screen.getByRole('button', { name: 'Start fresh attempt' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh attempt' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mock.create).toHaveBeenCalledWith('first-commit'); expect(useApp.getState().openRepo).toHaveBeenCalledWith(session('new').path, { notifyOnSuccess: false });
    expect(screen.getByRole('region', { name: 'Playground challenge' })).toHaveTextContent('One focused commit');
    fireEvent.click(screen.getByRole('button', { name: 'Challenge details' })); expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close Git Playground' })); expect(useApp.getState().playgroundOpen).toBe(false);
  });
  it('shows persisted completion, resumes attempts and verifies progress from Git rather than button clicks', async () => {
    const attempt = session(); mock.list.mockResolvedValue({ sessions: [attempt, session('lost', 'lost-commit', true)], warnings: ['A damaged attempt was kept.'] });
    mock.check.mockResolvedValue({ session: { ...attempt, completedAt: '2026-10-28' }, checks: playgroundChallenges.find(item => item.id === 'first-commit')!.checks.map(label => ({ label, passed: true })), observation: 'Verified repository.' });
    render(<Playground />); chooseFirst(); await screen.findByText(attempt.path);
    expect(screen.getByText('1 / 10')).toBeVisible(); expect(screen.getByText('A damaged attempt was kept.')).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Challenge progress' })).getAllByText('Not yet verified')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Check progress' }));
    await screen.findByText('Challenge completed'); expect(mock.check).toHaveBeenCalledWith('first'); expect(screen.getByText('2 / 10')).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Challenge progress' })).getAllByText('Complete')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Resume attempt' }));
    await waitFor(() => expect(useApp.getState().activeTab).toBe(attempt.path));
  });
  it.each(playgroundChallenges.map(c => [c.id, c.tool] as const))('opens the existing Git tool for %s', async (id, tool) => {
    const attempt = session('active', id); useApp.setState({ activeTab: attempt.path }); mock.list.mockResolvedValue({ sessions: [attempt], warnings: [] });
    render(<Playground />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(playgroundChallenges.find(c => c.id === id)!.title) }));
    await screen.findByText(attempt.path);
    fireEvent.click(screen.getByRole('button', { name: tool, exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    if (!['merge-conflict', 'lost-commit', 'bisect'].includes(id)) expect(useApp.getState().selectCommit).toHaveBeenCalledWith(WIP_HASH);
    if (id === 'merge-conflict') expect(useApp.getState().conflictedFileToResolve).toBe('settings.json');
    if (id === 'lost-commit') expect(useApp.getState().openReflogModal).toHaveBeenCalledOnce();
    if (id === 'bisect') expect(useApp.getState().openBisectModal).toHaveBeenCalledOnce();
  });
  it('checks from the tracker, displays observations, and hides it on Home or Settings', async () => {
    const attempt = session('bisect', 'bisect'); useApp.setState({ playgroundOpen: false, activeTab: attempt.path });
    mock.list.mockResolvedValue({ sessions: [attempt], warnings: [] }); mock.check.mockRejectedValueOnce(new Error('check failed')).mockResolvedValue({ session: attempt, checks: [{ label: playgroundChallenges.find(item => item.id === 'bisect')!.checks[0], passed: false }], observation: 'answer.txt: 42' });
    render(<Playground />); await screen.findByRole('region'); fireEvent.click(screen.getByRole('button', { name: 'Check progress' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('check failed');
    fireEvent.click(screen.getByRole('button', { name: 'Check progress' })); expect(await screen.findByRole('status')).toHaveTextContent('answer.txt: 42');
    fireEvent.click(screen.getByRole('button', { name: 'Challenge details' })); await screen.findByRole('heading', { name: 'Find the sneaky regression' });
    await act(async () => useApp.setState({ playgroundOpen: false, homeOpen: true })); expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await act(async () => { useApp.setState({ homeOpen: false }); useSettings.setState({ isSettingsOpen: true }); }); expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
  it('shows failures, retries loading, and preserves a created attempt when opening fails', async () => {
    mock.list.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue({ sessions: [], warnings: [] });
    render(<Playground />); chooseFirst(); expect(await screen.findByRole('alert')).toHaveTextContent('storage unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reload attempts' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Start challenge' })).toBeEnabled());
    mock.create.mockRejectedValueOnce(new Error('Git missing'));
    fireEvent.click(screen.getByRole('button', { name: 'Start challenge' })); expect(await screen.findByRole('alert')).toHaveTextContent('Git missing');
    useApp.setState({ openRepo: vi.fn(async () => {}) });
    fireEvent.click(screen.getByRole('button', { name: 'Start challenge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened'); expect(screen.getByText(session('new').path)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resume attempt' })).toBeEnabled();
  });
  it('prevents duplicate starts and keeps Escape from interrupting creation', async () => {
    let finish!: (value: PlaygroundSession) => void; mock.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await start(); const button = screen.getByRole('button', { name: 'Start challenge' });
    fireEvent.click(button); fireEvent.click(button); expect(mock.create).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.getByRole('dialog')).toBeVisible(); expect(screen.getByRole('button', { name: 'Close Git Playground' })).toBeDisabled();
    mock.list.mockResolvedValue({ sessions: [session('new')], warnings: [] });
    await act(async () => finish(session('new'))); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('ignores stale list responses and checks after switching repository without showing another attempt’s results', async () => {
    let resolveList!: (value: { sessions: PlaygroundSession[]; warnings: string[] }) => void;
    mock.list.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; })).mockResolvedValue({ sessions: [session('new')], warnings: [] });
    render(<Playground />); chooseFirst(); await act(async () => useApp.setState({ activeTab: session('new').path }));
    await screen.findByText(session('new').path);
    await act(async () => resolveList({ sessions: [session('old')], warnings: [] })); expect(screen.queryByText(session('old').path)).not.toBeInTheDocument();
    let resolveCheck!: (value: unknown) => void; mock.check.mockReturnValue(new Promise(resolve => { resolveCheck = resolve; }));
    await act(async () => useApp.setState({ playgroundOpen: false })); fireEvent.click(screen.getByRole('button', { name: 'Check progress' }));
    await act(async () => useApp.setState({ activeTab: '/real/project' }));
    await act(async () => resolveCheck({ session: session('new'), checks: [], observation: 'old observation' })); expect(screen.queryByText('old observation')).not.toBeInTheDocument();
  });
  it('discards late list success, list failure, create, open, and check results after unmount', async () => {
    let resolveList!: (value: unknown) => void;
    mock.list.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; }));
    const listView = render(<Playground />); listView.unmount(); await act(async () => resolveList({ sessions: [], warnings: [] }));
    let rejectList!: (reason: Error) => void; mock.list.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectList = reject; }));
    const failure = render(<Playground />); failure.unmount(); await act(async () => rejectList(new Error('late list error')));
    let create!: (value: PlaygroundSession) => void; mock.create.mockReturnValueOnce(new Promise(resolve => { create = resolve; }));
    const creating = render(<Playground />); chooseFirst(); await waitFor(() => expect(screen.getByRole('button', { name: 'Start challenge' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Start challenge' })); creating.unmount(); await act(async () => create(session())); expect(useApp.getState().openRepo).not.toHaveBeenCalled();
    let open!: () => void; useApp.setState({ openRepo: vi.fn(() => new Promise(resolve => { open = resolve; })) });
    const openingView = render(<Playground />); chooseFirst(); await waitFor(() => expect(screen.getByRole('button', { name: 'Start challenge' })).toBeEnabled()); fireEvent.click(screen.getByRole('button', { name: 'Start challenge' })); await waitFor(() => expect(useApp.getState().openRepo).toHaveBeenCalled()); openingView.unmount(); await act(async () => open());
    mock.list.mockResolvedValue({ sessions: [session()], warnings: [] }); let check!: (value: unknown) => void; mock.check.mockReturnValueOnce(new Promise(resolve => { check = resolve; }));
    const checking = render(<Playground />); chooseFirst(); await screen.findByText(session().path); fireEvent.click(screen.getByRole('button', { name: 'Check progress' })); checking.unmount(); await act(async () => check({ session: session(), checks: [], observation: '' }));
  });
});
