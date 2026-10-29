// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ api: {
  getBranches: vi.fn(), getHistoryReplay: vi.fn(), getCommitDetail: vi.fn(), getFileDiff: vi.fn()
} }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
vi.mock('../../src/renderer/components/CommitGraph/GitGraphCanvas', () => ({
  GitGraphCanvas: ({ onSelect }: { onSelect?: (hash: string) => void }) => <button type="button" onClick={() => onSelect?.('b'.repeat(40))}>Select newest graph node</button>
}));
vi.mock('../../src/renderer/components/DiffViewer/UnifiedDiffView', () => ({
  UnifiedDiffView: ({ hunks }: { hunks: unknown[] }) => <div>Historical diff ({hunks.length})</div>
}));
import { HistoryTimeMachine } from '../../src/renderer/components/CommitGraph/HistoryTimeMachine';

const older = 'a'.repeat(40);
const newer = 'b'.repeat(40);
const branchData = {
  local: [{ fullName: 'main', isCurrent: true }, { fullName: 'topic', isCurrent: false }],
  remote: [{ fullName: 'origin/main', isCurrent: false }]
} as any;
const commits = [
  { hash: newer, shortHash: 'bbbbbbb', parents: [older], authorName: 'Bea', authorEmail: 'bea@example.test', date: '2026-10-03T12:00:00Z', summary: 'Add the feature' },
  { hash: older, shortHash: 'aaaaaaa', parents: [], authorName: 'Ali', authorEmail: 'ali@example.test', date: '2026-10-02T12:00:00Z', summary: 'Start the project' }
];
const details = (files: any[] = [{ path: 'src/app.ts', status: 'modified', insertions: 3, deletions: 1 }]) => ({ files, insertions: 3, deletions: 1 }) as any;

beforeEach(() => {
  vi.useRealTimers();
  mock.api.getBranches.mockReset().mockResolvedValue(branchData);
  mock.api.getHistoryReplay.mockReset().mockResolvedValue({ branch: 'main', remote: false, commits, totalCommits: 2, hasMore: false });
  mock.api.getCommitDetail.mockReset().mockResolvedValue(details());
  mock.api.getFileDiff.mockReset().mockResolvedValue({ hunks: [{ header: '@@ -1 +1 @@', lines: [] }] });
});

describe('history time machine', () => {
  it('replays the current branch, grows the graph, inspects each commit file and diff, and closes', async () => {
    const onClose = vi.fn(); render(<HistoryTimeMachine onClose={onClose} />);
    expect(screen.getAllByText('Loading branch history…').length).toBeGreaterThan(0);
    await screen.findByText('Start the project');
    expect(mock.api.getHistoryReplay).toHaveBeenCalledWith('main', false);
    expect(screen.getByText('Step 1 of 2')).toBeVisible();
    await screen.findByText('src/app.ts');
    fireEvent.click(screen.getByText('src/app.ts').closest('button')!);
    await screen.findByText('Historical diff (1)');
    expect(mock.api.getFileDiff).toHaveBeenCalledWith(older, 'src/app.ts');

    fireEvent.change(screen.getByRole('slider', { name: 'Replay commit history' }), { target: { value: '1' } });
    await screen.findByText('Add the feature');
    expect(screen.getByText('Step 2 of 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Select newest graph node' }));
    expect(screen.getByText('Step 2 of 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Previous commit' }));
    await screen.findByText('Start the project');
    fireEvent.click(screen.getByRole('button', { name: 'Close history time machine' })); expect(onClose).toHaveBeenCalledOnce();
  });

  it('selects local and remote branches, reports capped history, and restarts playback from the end', async () => {
    vi.useFakeTimers();
    mock.api.getHistoryReplay.mockImplementation(async (branch: string, remote: boolean) => ({ branch, remote, commits, totalCommits: 501, hasMore: true }));
    const { container } = render(<HistoryTimeMachine onClose={vi.fn()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('Showing the latest 2 of 501 commits.')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Branch to replay' }), { target: { value: 'remote:origin/main' } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mock.api.getHistoryReplay).toHaveBeenLastCalledWith('origin/main', true);
    fireEvent.click(screen.getByRole('button', { name: 'Next commit' }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Play history replay' }));
    expect(screen.getByRole('button', { name: 'Pause history replay' })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(720); });
    expect(screen.getByText('Step 2 of 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Play history replay' })).toBeVisible();
    expect(container.querySelector('.history-time-machine__canvas')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('handles branch-list failures and an empty branch list', async () => {
    mock.api.getBranches.mockRejectedValueOnce(new Error('Branch fetch failed'));
    const first = render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Branch fetch failed'); first.unmount();
    mock.api.getBranches.mockResolvedValueOnce({ local: [], remote: [] });
    render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('No local or remote branches are available.');
    expect(mock.api.getHistoryReplay).not.toHaveBeenCalled();
  });

  it('handles non-Error branch fetch failures and invalid branch selection events', async () => {
    mock.api.getBranches.mockRejectedValueOnce('offline');
    const first = render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not load branches.'); first.unmount();
    render(<HistoryTimeMachine onClose={vi.fn()} />);
    await screen.findByText('Start the project');
    fireEvent.change(screen.getByRole('combobox', { name: 'Branch to replay' }), { target: { value: 'missing:branch' } });
    expect(mock.api.getHistoryReplay).toHaveBeenCalledTimes(1);
  });

  it('shows empty history and handles history errors without exposing raw non-Error values', async () => {
    mock.api.getHistoryReplay.mockResolvedValueOnce({ branch: 'main', remote: false, commits: [], totalCommits: 0, hasMore: false });
    const empty = render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('This branch has no commits to replay.'); empty.unmount();
    mock.api.getHistoryReplay.mockRejectedValueOnce(new Error('Cannot read history'));
    const failed = render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Cannot read history'); failed.unmount();
    mock.api.getHistoryReplay.mockRejectedValueOnce('offline');
    render(<HistoryTimeMachine onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not load this branch history.');
  });

  it('renders missing details, empty file lists and unknown commit metadata safely', async () => {
    mock.api.getHistoryReplay.mockResolvedValueOnce({ branch: 'main', remote: false, commits: [{ ...commits[1], summary: '', authorName: '', date: '' }], totalCommits: 1, hasMore: false });
    mock.api.getCommitDetail.mockResolvedValueOnce(details([]));
    render(<HistoryTimeMachine onClose={vi.fn()} />);
    await screen.findByText('(no message)');
    expect(screen.getByText(/Unknown author/)).toBeVisible(); expect(screen.getByText(/Unknown date/)).toBeVisible();
    expect(await screen.findByText('0 changed files · +3 −1')).toBeVisible();
    expect(screen.getByText('No file changes in this commit.')).toBeVisible();
    expect(screen.getByText('Choose a changed file to inspect its diff at this step.')).toBeVisible();
  });

  it('handles missing commit details, empty diffs and diff errors', async () => {
    mock.api.getCommitDetail.mockRejectedValueOnce(new Error('details unavailable'));
    const first = render(<HistoryTimeMachine onClose={vi.fn()} />); await screen.findByText('Start the project');
    await waitFor(() => expect(mock.api.getCommitDetail).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Loading commit details…')).toBeVisible(); first.unmount();

    mock.api.getCommitDetail.mockResolvedValue(details([{ path: 'empty.txt', status: 'deleted', insertions: null, deletions: null }]));
    mock.api.getFileDiff.mockResolvedValueOnce({ hunks: [] });
    const second = render(<HistoryTimeMachine onClose={vi.fn()} />); await screen.findByText('empty.txt');
    fireEvent.click(screen.getByText('empty.txt').closest('button')!);
    expect(await screen.findByRole('status')).toHaveTextContent('This file is binary, empty, or its diff is unavailable.'); second.unmount();

    mock.api.getFileDiff.mockRejectedValueOnce(new Error('diff failed'));
    mock.api.getCommitDetail.mockResolvedValue(details());
    render(<HistoryTimeMachine onClose={vi.fn()} />); await screen.findByText('src/app.ts');
    fireEvent.click(screen.getByText('src/app.ts').closest('button')!);
    expect(await screen.findByRole('status')).toHaveTextContent('This file is binary, empty, or its diff is unavailable.');
  });

  it('labels added, deleted and modified paths and avoids stale detail results', async () => {
    let resolveOld!: (value: any) => void;
    mock.api.getCommitDetail.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(details([
      { path: 'new.txt', status: 'added' }, { path: 'gone.txt', status: 'deleted' }, { path: 'edit.txt', status: 'modified' }
    ]));
    render(<HistoryTimeMachine onClose={vi.fn()} />); await screen.findByText('Start the project');
    fireEvent.click(screen.getByRole('button', { name: 'Next commit' }));
    await screen.findByText('new.txt');
    expect(screen.getByText('gone.txt')).toBeVisible();
    expect(screen.getByText('edit.txt')).toBeVisible();
    await act(async () => resolveOld(details([{ path: 'stale.txt', status: 'added' }])));
    expect(screen.queryByRole('button', { name: /stale.txt/ })).not.toBeInTheDocument();
  });

  it('ignores a stale branch replay result after unmount', async () => {
    let resolveOld!: (value: any) => void;
    mock.api.getHistoryReplay.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { unmount } = render(<HistoryTimeMachine onClose={vi.fn()} />);
    await waitFor(() => expect(mock.api.getHistoryReplay).toHaveBeenCalledOnce());
    unmount();
    await act(async () => resolveOld({ branch: 'main', remote: false, commits: [commits[1]], totalCommits: 1, hasMore: false }));
    expect(screen.queryByText('Start the project')).not.toBeInTheDocument();
  });

  it('ignores a stale branch-list result after unmount', async () => {
    let resolveBranches!: (value: any) => void;
    mock.api.getBranches.mockImplementationOnce(() => new Promise(resolve => { resolveBranches = resolve; }));
    const { unmount } = render(<HistoryTimeMachine onClose={vi.fn()} />);
    await waitFor(() => expect(mock.api.getBranches).toHaveBeenCalledOnce());
    unmount();
    await act(async () => resolveBranches(branchData));
    expect(mock.api.getHistoryReplay).not.toHaveBeenCalled();
  });
});
