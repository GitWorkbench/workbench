// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, CommitRef } from '../../src/shared/types';

const mock = vi.hoisted(() => ({ state: {} as Record<string, any>, settings: {} as Record<string, any>, setState: vi.fn(), clipboard: vi.fn(), canvas: null as any, observers: [] as Array<() => void>, build: vi.fn(), api: Object.fromEntries([
  'pull', 'push', 'checkoutBranch', 'checkoutCommit', 'createWorktree', 'createBranch', 'resetBranchTo', 'editCommitMessage', 'revertCommit', 'dropCommit', 'moveCommitDown', 'applyPatchCommit', 'exportPatch', 'startBisect', 'pushTag', 'deleteTag', 'pushSetUpstream', 'setUpstream', 'deleteBranch', 'getCommitDetail'
].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/store', () => ({ WIP_HASH: 'WIP', useApp: Object.assign((select: (state: any) => any) => select(mock.state), { getState: () => mock.state, setState: mock.setState }) }));
vi.mock('../../src/renderer/store/settings', () => ({ DEFAULT_COMMIT_COLUMN_WIDTHS: { author: 180, date: 200, sha: 110 }, useSettings: (select: (state: any) => any) => select(mock.settings) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
vi.mock('../../src/renderer/components/CommitGraph/gitgraph', () => ({ buildGitGraph: mock.build }));
vi.mock('../../src/renderer/components/CommitGraph/GitGraphCanvas', () => ({ GitGraphCanvas: (props: any) => { mock.canvas = props; return <div data-testid="canvas" />; } }));
import { CommitGraph, consolidateRefs, RefPill } from '../../src/renderer/components/CommitGraph/CommitGraph';

const branch = (label: string, extra: Partial<CommitRef> = {}): CommitRef => ({ label, kind: 'branch', ...extra });
const makeCommit = (hash: string, extra: Partial<Commit> = {}): Commit => ({ hash, shortHash: hash.slice(0, 7), parents: [], message: `Commit ${hash}`, body: '', authorName: 'Alice', authorEmail: 'alice@example.invalid', date: '2026-10-19T09:00:00Z', refs: [], lane: 0, lanes: [], ...extra });
const commits = () => [makeCommit('aaaa1111', { refs: [branch('main', { isCurrent: true }), branch('origin/main', { isRemote: true })], body: 'Long commit body\nSecond line' }), makeCommit('bbbb2222', { authorName: 'Bob', authorEmail: 'bob@example.invalid', date: '2026-10-17T00:00:00Z', refs: [{ kind: 'tag', label: 'v1' }] }), makeCommit('cccc3333', { authorName: 'Carol', authorEmail: 'carol@example.invalid', date: '2025-01-01T00:00:00Z', refs: [branch('upstream/feature', { isRemote: true })] })];
beforeEach(() => {
  Object.keys(mock.state).forEach(key => delete mock.state[key]);
  Object.assign(mock.state, { log: { commits: commits(), totalCommits: 3, hasMore: false }, filter: '', filterAuthor: '', filterDateRange: 'all', status: { currentBranch: 'main', staged: [], unstaged: [] }, selectedCommit: null, compareCommits: null, remotes: [], openDiff: null, diffMaximized: false, isLoadingMoreCommits: false });
  for (const name of ['selectCommit', 'setCompareCommits', 'openFileDiff', 'setFilterAuthor', 'setFilterDateRange', 'openBisectModal', 'openChangelogModal', 'notify', 'loadMoreCommits', 'openRebaseModal', 'cherryPickCommit', 'openCreateTagModal', 'refresh']) mock.state[name] = vi.fn();
  mock.state.runAndRefresh = vi.fn(async (run: () => unknown) => { await run(); return true; });
  Object.assign(mock.settings, { graphRowHeight: 26, commitColumns: { author: true, date: true, sha: true }, commitColumnWidths: { author: 180, date: 200, sha: 110 }, setCommitColumns: vi.fn(), setCommitColumnWidths: vi.fn() });
  mock.setState.mockReset(); mock.clipboard.mockReset().mockResolvedValue(undefined); mock.observers.length = 0;
  Object.values(mock.api).forEach(fn => fn.mockReset().mockResolvedValue({ ok: true }));
  mock.api.getCommitDetail.mockResolvedValue({ files: [{ path: 'file.txt', status: 'modified' }], insertions: 1, deletions: 1 });
  mock.build.mockReset().mockImplementation((list: Commit[]) => ({ width: 80, height: list.length * 26, paths: [], commits: list.map(commit => ({ hash: commit.hash, color: '#38bdf8' })) }));
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { mock.observers.push(callback); } observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mock.clipboard } });
});
const row = (hash = 'aaaa1111') => document.querySelector<HTMLElement>(`[data-commit-row="${hash}"]`)!;
const context = (hash = 'aaaa1111') => fireEvent.contextMenu(row(hash), { clientX: 300, clientY: 200 });

describe('branch and tag consolidation', () => {
  it('pairs local tracking refs once and sorts current/local/tag/remote groups', () => {
    expect(consolidateRefs(undefined as any)).toEqual([]); expect(consolidateRefs([])).toEqual([]);
    const result = consolidateRefs([branch('origin/main', { isRemote: true }), { kind: 'tag', label: 'v2' }, branch('z'), branch('main', { isCurrent: true }), branch('a'), branch('upstream/solo', { isRemote: true }), { kind: 'tag', label: 'v1' }]);
    expect(result.map(ref => ref.label)).toEqual(['main', 'a', 'z', 'v1', 'v2', 'upstream/solo']); expect(result[0]).toMatchObject({ hasLocal: true, hasRemote: true, isCurrent: true });
    expect(consolidateRefs([branch('dev'), branch('upstream/dev', { isRemote: true })])[0].hasRemote).toBe(true);
  });
  it('ref pills stop row selection, expose their full label and route context menus', () => {
    const selected = vi.fn(), menu = vi.fn(); const values = consolidateRefs([branch('main', { isCurrent: true }), { kind: 'tag', label: 'v1' }, branch('remote/only', { isRemote: true }), branch('local')]);
    const { rerender } = render(<div onClick={selected}><RefPill value={values[0]} onContextMenu={menu} /></div>);
    fireEvent.click(screen.getByTitle('main')); expect(selected).not.toHaveBeenCalled(); fireEvent.contextMenu(screen.getByTitle('main')); expect(menu).toHaveBeenCalledOnce();
    for (const value of values.slice(1)) { rerender(<RefPill value={value} />); fireEvent.contextMenu(screen.getByTitle(value.label)); expect(screen.getByText(value.label)).toBeVisible(); }
  });
});

describe('commit graph rendering, metadata and selection', () => {
  it('resizes and persists metadata columns and resets widths from the column menu', () => {
    render(<CommitGraph />); fireEvent.keyDown(screen.getByLabelText('Resize author column'), { key: 'ArrowRight' }); expect(mock.settings.setCommitColumnWidths).toHaveBeenCalledWith({ author: 190 });
    fireEvent.click(screen.getByLabelText('Choose visible commit columns')); fireEvent.click(screen.getByRole('checkbox', { name: 'SHA' })); expect(mock.settings.setCommitColumns).toHaveBeenCalledWith({ sha: false }); fireEvent.click(screen.getByRole('button', { name: 'Reset column widths' })); expect(mock.settings.setCommitColumnWidths).toHaveBeenCalledWith({ author: 180, date: 200, sha: 110 });
  });
  it('supports canvas hover without a pointer location and omits reset actions without a current branch', async () => {
    vi.useFakeTimers(); mock.state.status = null; render(<CommitGraph />); await act(async () => mock.canvas.onHover('aaaa1111')); await act(async () => vi.advanceTimersByTime(301)); expect(screen.getByRole('group', { name: 'Preview for commit aaaa111' })).toBeInTheDocument(); context(); expect(screen.queryByRole('button', { name: /Reset .* to this commit/ })).not.toBeInTheDocument();
  });
  it('keeps additional references discoverable and uses raw dates if locale formatting fails', () => {
    mock.state.log.commits[0].refs.push({ kind: 'tag', label: 'extra-tag' }); vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => { throw new Error('locale unavailable'); }); vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(() => { throw new Error('locale unavailable'); });
    mock.settings.commitColumns.date = false; mock.state.log.commits[0].date = '2020-01-01'; render(<CommitGraph />); expect(screen.getByTitle('extra-tag')).toHaveTextContent('+1'); expect(screen.getByText('2020-01-01')).toBeVisible();
  });
  it('shows repository/empty states and all installed metadata columns', () => {
    mock.state.log = null; const { rerender } = render(<CommitGraph />); expect(screen.getByText(/Open a repository/)).toBeVisible();
    mock.state.log = { commits: [], totalCommits: 0 }; rerender(<CommitGraph />); expect(screen.getByText('No commits match the current filter.')).toBeVisible();
    mock.state.log = { commits: commits(), totalCommits: 3 }; rerender(<CommitGraph />);
    expect(screen.getByText('AUTHOR')).toBeVisible(); expect(screen.getByText('DATE/TIME')).toBeVisible(); expect(screen.getByText('SHA')).toBeVisible(); expect(screen.getByText('Loaded all 3 commits')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Copy full commit SHA aaaa1111')); expect(mock.clipboard).toHaveBeenCalledWith('aaaa1111'); expect(mock.state.selectCommit).not.toHaveBeenCalled();
    expect(row()).not.toHaveAttribute('title'); expect(screen.getByText('Long commit body', { exact: false })).toBeInTheDocument();
  });
  it('uses selected and comparison states, Ctrl/Cmd/Shift selection and swap/clear controls', () => {
    const { rerender } = render(<CommitGraph />); fireEvent.click(row()); expect(mock.state.selectCommit).toHaveBeenCalledWith('aaaa1111');
    fireEvent.click(row('bbbb2222'), { ctrlKey: true }); expect(mock.state.selectCommit).toHaveBeenCalledWith('bbbb2222');
    mock.state.selectedCommit = 'aaaa1111'; rerender(<CommitGraph />); fireEvent.click(row('bbbb2222'), { metaKey: true }); expect(mock.state.setCompareCommits).toHaveBeenCalledWith(['aaaa1111', 'bbbb2222']);
    mock.state.selectedCommit = null; mock.state.compareCommits = ['aaaa1111', 'bbbb2222']; rerender(<CommitGraph />);
    expect(screen.getByText('DIFF BASE A')).toBeVisible(); expect(screen.getByText('DIFF TARGET B')).toBeVisible();
    fireEvent.click(row('aaaa1111'), { shiftKey: true }); expect(mock.state.selectCommit).toHaveBeenCalledWith('bbbb2222');
    fireEvent.click(row('cccc3333'), { ctrlKey: true }); expect(mock.state.setCompareCommits).toHaveBeenCalledWith(['aaaa1111', 'cccc3333']);
    fireEvent.click(screen.getByTitle('Swap Base and Target')); expect(mock.state.setCompareCommits).toHaveBeenCalledWith(['bbbb2222', 'aaaa1111']);
    fireEvent.click(screen.getByTitle('Clear comparison')); expect(mock.state.setCompareCommits).toHaveBeenCalledWith(null);
  });
  it('opens the first committed file on double click and tolerates a commit without files', async () => {
    render(<CommitGraph />); fireEvent.doubleClick(row()); await waitFor(() => expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: 'aaaa1111', filePath: 'file.txt', status: 'modified' }));
    mock.api.getCommitDetail.mockResolvedValueOnce(null); fireEvent.doubleClick(row('bbbb2222')); await act(async () => {});
    mock.api.getCommitDetail.mockResolvedValueOnce({ files: [] }); fireEvent.doubleClick(row('cccc3333')); await act(async () => {}); expect(mock.state.openFileDiff).toHaveBeenCalledTimes(1);
  });
  it('summarizes WIP without duplicate paths and opens staged or unstaged files', () => {
    mock.state.status.staged = [{ path: 'a', status: 'modified' }, { path: 'b', status: 'added' }];
    mock.state.status.unstaged = [{ path: 'a', status: 'deleted' }, { path: 'c', status: 'renamed' }, { path: 'd', status: 'untracked' }];
    const { rerender } = render(<CommitGraph />); const wip = screen.getByText('// WIP').closest('.cursor-pointer')!;
    expect(screen.getByTitle('1 modified file')).toBeInTheDocument(); expect(screen.getByTitle('2 added/untracked files')).toBeInTheDocument(); expect(screen.getByTitle('1 deleted file')).toBeInTheDocument();
    fireEvent.click(wip); expect(mock.state.selectCommit).toHaveBeenCalledWith('WIP'); fireEvent.doubleClick(wip); expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'a', staged: true, status: 'modified' });
    mock.state.status = { ...mock.state.status, staged: [], unstaged: [{ path: 'conflict', status: 'conflicted' }] }; rerender(<CommitGraph />);
    expect(screen.getByText('1 changes')).toBeInTheDocument(); fireEvent.doubleClick(screen.getByText('// WIP').closest('.cursor-pointer')!); expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'conflict', staged: false, status: 'conflicted' });
    fireEvent.contextMenu(screen.getByText('// WIP').closest('.cursor-pointer')!); expect(screen.queryByRole('button', { name: 'Push' })).not.toBeInTheDocument();
  });
  it('uses readable fallback authors/messages/dates and relative dates when the date column is hidden', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-19T10:00:00Z').getTime());
    mock.state.log.commits = [makeCommit('empty', { message: '', authorName: '', date: '' })];
    const { rerender } = render(<CommitGraph />); expect(screen.getByText('(no message)')).toBeVisible(); expect(screen.getByText('Unknown author')).toBeVisible(); expect(screen.getByText('—')).toBeVisible();
    mock.settings.commitColumns = { author: false, date: false, sha: false };
    for (const [date, expected] of [['2026-10-19T09:59:50Z', 'just now'], ['2026-10-19T09:58:00Z', '2m ago'], ['2026-10-19T08:00:00Z', '2h ago'], ['2026-10-17T10:00:00Z', '2d ago']]) {
      mock.state.log = { commits: [makeCommit('time', { date })] }; rerender(<CommitGraph />); expect(screen.getByText(expected)).toBeVisible();
    }
    mock.state.log = { commits: [makeCommit('older', { date: '2020-01-01' })] }; rerender(<CommitGraph />); expect(screen.getByText(new Date('2020-01-01').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))).toBeVisible();
  });
  it('opens one pointer-adjacent hover preview after a delay and keeps it while the pointer moves onto it', async () => {
    vi.useFakeTimers(); render(<CommitGraph />); fireEvent.mouseEnter(row(), { clientX: 310, clientY: 200 }); fireEvent.mouseMove(row(), { clientX: 330, clientY: 205 });
    await act(async () => vi.advanceTimersByTime(299)); expect(screen.queryByRole('group')).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1)); const card = screen.getByRole('group', { name: 'Preview for commit aaaa111' }); expect(card).toBeInTheDocument();
    fireEvent.mouseLeave(row()); fireEvent.mouseEnter(card); await act(async () => vi.advanceTimersByTime(151)); expect(card).toBeInTheDocument();
    fireEvent.mouseLeave(card); await act(async () => vi.advanceTimersByTime(151)); expect(screen.queryByRole('group')).not.toBeInTheDocument();
    fireEvent.mouseEnter(row(), { clientX: 310, clientY: 200 }); fireEvent.contextMenu(row()); await act(async () => vi.advanceTimersByTime(350)); expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

describe('graph filters, pagination and canvas boundary', () => {
  it.each([
    ['author:alice', 'aaaa1111'], ['from:bob@example', 'bbbb2222'], ['hash:bbbb', 'bbbb2222'], ['tag:v1', 'bbbb2222'], ['branch:feature', 'cccc3333'],
    ['alice', 'aaaa1111'], ['bbbb', 'bbbb2222'], ['v1', 'bbbb2222'], ['main', 'aaaa1111']
  ])('filters %s to the corresponding commit', (query, expected) => {
    mock.state.filter = query; render(<CommitGraph />); expect(document.querySelectorAll('[data-commit-row]')).toHaveLength(1); expect(row(expected)).toBeInTheDocument();
  });
  it.each(['today', 'week', 'month', 'year', 'unknown'])('applies the %s date window and exposes filter reset controls', period => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-19T10:00:00Z').getTime()); mock.state.filterDateRange = period; mock.state.filterAuthor = 'Alice';
    render(<CommitGraph />); expect(row()).toBeInTheDocument();
    fireEvent.click(screen.getByText('Author: Alice').querySelector('button')!); expect(mock.state.setFilterAuthor).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByText(`Date: ${period}`).querySelector('button')!); expect(mock.state.setFilterDateRange).toHaveBeenCalledWith('all');
  });
  it('filters authors by email and excludes commits older than the selected date window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-19T10:00:00Z').getTime()); mock.state.filterAuthor = 'bob@example'; mock.state.filterDateRange = 'week';
    const { rerender } = render(<CommitGraph />); expect(row('bbbb2222')).toBeInTheDocument(); expect(row()).not.toBeInTheDocument();
    mock.state.filterDateRange = 'today'; rerender(<CommitGraph />); expect(screen.getByText('No commits match the current filter.')).toBeVisible();
  });
  it('virtualizes long histories and loads more once scrolling approaches the end', () => {
    mock.state.log = { commits: Array.from({ length: 100 }, (_, index) => makeCommit(`hash${index}`)), totalCommits: 200, hasMore: true };
    const { container, rerender } = render(<CommitGraph />); expect(document.querySelectorAll('[data-commit-row]').length).toBeLessThan(100);
    const scroll = container.firstChild as HTMLElement; Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 2600 }); scroll.scrollTop = 2000; fireEvent.scroll(scroll); expect(mock.state.loadMoreCommits).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Load more commits (100 of 200)' })); expect(mock.state.loadMoreCommits).toHaveBeenCalledTimes(2);
    mock.state.isLoadingMoreCommits = true; mock.state.log.totalCommits = 0; rerender(<CommitGraph />); fireEvent.scroll(scroll); expect(mock.state.loadMoreCommits).toHaveBeenCalledTimes(2); expect(screen.getByText('Loading more commits… (100 of 100)')).toBeVisible();
    fireEvent.resize(window); mock.observers.forEach(callback => callback());
  });
  it('routes canvas selection/hover/context, ignores stale canvas refs and hides behind a maximized diff', async () => {
    const { container, rerender } = render(<CommitGraph />);
    await act(async () => mock.canvas.onSelect('bbbb2222')); expect(mock.state.selectCommit).toHaveBeenCalledWith('bbbb2222');
    await act(async () => mock.canvas.onHover('bbbb2222', { x: 310, y: 200 })); expect(row('bbbb2222')).toHaveClass('bg-panel2/70');
    await act(async () => mock.canvas.onHover(null)); await act(async () => mock.canvas.onContextMenu({ clientX: 100, clientY: 100 }, 'missing')); expect(screen.queryByRole('button', { name: 'Push' })).not.toBeInTheDocument();
    await act(async () => mock.canvas.onContextMenu({ clientX: 100, clientY: 100 }, 'bbbb2222')); expect(screen.getByRole('button', { name: 'Push' })).toBeVisible();
    mock.state.openDiff = {}; mock.state.diffMaximized = true; rerender(<CommitGraph />); expect(container.firstChild).toHaveClass('hidden');
  });
});

describe('commit context actions', () => {
  it.each([
    ['Pull (fast-forward if possible)', 'pull', []], ['Push', 'push', []], ['Checkout main', 'checkoutBranch', ['main']], ['Checkout as detached HEAD', 'checkoutCommit', ['aaaa1111']],
    ['Reset main to this commit (hard)', 'resetBranchTo', ['aaaa1111', 'hard']], ['Reset main to this commit (soft)', 'resetBranchTo', ['aaaa1111', 'soft']], ['Reset main to this commit (mixed)', 'resetBranchTo', ['aaaa1111', 'mixed']],
    ['Revert commit', 'revertCommit', ['aaaa1111']], ['Drop commit', 'dropCommit', ['aaaa1111']], ['Move commit down', 'moveCommitDown', ['aaaa1111']], ['Apply patch to current branch', 'applyPatchCommit', ['aaaa1111']]
  ])('%s delegates arguments through the guarded mutation action', async (label, method, args) => {
    render(<CommitGraph />); context(); expect(screen.getByRole('button', { name: label, exact: true })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    await waitFor(() => expect(mock.api[method]).toHaveBeenCalledWith(...args));
  });
  it.each([
    ['Worktree path (e.g. ../wt-feature)', 'Create worktree', '/tmp/worktree', 'createWorktree', ['aaaa1111', '/tmp/worktree']],
    ['Branch name', 'Create branch', 'new-branch', 'createBranch', ['new-branch', 'aaaa1111']],
    ['New commit message', 'Reword commit', 'new message', 'editCommitMessage', ['aaaa1111', 'new message']],
    ['Patch file path (e.g. /tmp/commit.patch)', 'Export patch', '/tmp/a.patch', 'exportPatch', ['aaaa1111', '/tmp/a.patch']]
  ])('submits %s from the commit context form', async (placeholder, label, value, method, args) => {
    render(<CommitGraph />); context(); fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(mock.api[method]).toHaveBeenCalledWith(...args));
  });
  it('opens tag, cherry-pick, rebase, split and selected-commit comparison tools', () => {
    mock.state.selectedCommit = 'bbbb2222'; render(<CommitGraph />);
    for (const [label, callback] of [['Create tag here…', 'openCreateTagModal'], ['Cherry-Pick onto current branch', 'cherryPickCommit'], ['Interactive Rebase from here...', 'openRebaseModal']]) {
      context(); fireEvent.click(screen.getByRole('button', { name: label })); expect(mock.state[callback]).toHaveBeenCalledWith('aaaa1111');
    }
    context(); fireEvent.click(screen.getByRole('button', { name: 'Split into smaller commits…' })); expect(mock.setState).toHaveBeenCalledWith({ commitSplitOpen: true });
    context(); fireEvent.click(screen.getByRole('button', { name: /Compare with selected/ })); expect(mock.state.setCompareCommits).toHaveBeenCalledWith(['bbbb2222', 'aaaa1111']);
  });
  it.each(['Recompose commit with AI (Preview)', 'Start a pull request to origin', 'Explain Branch Changes (Preview)'])('labels unfinished command %s as preview', label => {
    render(<CommitGraph />); context(); fireEvent.click(screen.getByRole('button', { name: label })); expect(mock.state.notify).toHaveBeenCalledWith('info', expect.stringContaining('preview feature'));
  });
  it.each(['Bad', 'Good'])('marks a %s commit for bisect and reports rejected results', async verdict => {
    render(<CommitGraph />); context(); fireEvent.click(screen.getByRole('button', { name: `Mark as ${verdict} commit for Bisect` })); await waitFor(() => expect(mock.state.openBisectModal).toHaveBeenCalledOnce());
    expect(mock.api.startBisect).toHaveBeenCalledWith(...(verdict === 'Bad' ? ['aaaa1111'] : [undefined, 'aaaa1111']));
    mock.api.startBisect.mockResolvedValueOnce({ ok: false }); context(); fireEvent.click(screen.getByRole('button', { name: `Mark as ${verdict} commit for Bisect` })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', 'Failed to update bisect'));
    mock.api.startBisect.mockRejectedValueOnce(new Error('offline')); context(); fireEvent.click(screen.getByRole('button', { name: `Mark as ${verdict} commit for Bisect` })); await waitFor(() => expect(mock.state.notify).toHaveBeenCalledWith('error', 'Error: offline'));
  });
});

describe('reference context actions', () => {
  it.each([
    ['Push tag "v1" to origin', 'pushTag', ['v1', 'origin']], ['Delete tag "v1" (Local)', 'deleteTag', ['v1', false]], ['Delete tag "v1" on origin', 'deleteTag', ['v1', true, 'origin']]
  ])('%s uses the selected tag', async (label, method, args) => {
    render(<CommitGraph />); fireEvent.contextMenu(screen.getByTitle('v1')); fireEvent.click(screen.getByRole('button', { name: label })); await waitFor(() => expect(mock.api[method]).toHaveBeenCalledWith(...args));
  });
  it('copies tag labels and supports local upstream, push and delete operations', async () => {
    render(<CommitGraph />); fireEvent.contextMenu(screen.getByTitle('v1')); fireEvent.click(screen.getByRole('button', { name: 'Copy Tag Name' })); expect(mock.clipboard).toHaveBeenCalledWith('v1');
    const cases = [['Checkout main', 'checkoutBranch', ['main']], ['Push main to origin', 'pushSetUpstream', ['main']], ['Delete main', 'deleteBranch', ['main', { local: true }]], ['Force delete main', 'deleteBranch', ['main', { local: true, force: true }]], ['Delete main and origin/main', 'deleteBranch', ['main', { local: true, remote: true, remoteName: 'origin', force: true }]]] as const;
    for (const [label, method, args] of cases) { fireEvent.contextMenu(screen.getByTitle('main')); fireEvent.click(screen.getByRole('button', { name: label, exact: true })); expect(mock.api[method]).toHaveBeenCalledWith(...args); }
    fireEvent.contextMenu(screen.getByTitle('main')); fireEvent.change(screen.getByPlaceholderText('Upstream (e.g. origin/main)'), { target: { value: 'upstream/main' } }); fireEvent.click(screen.getByRole('button', { name: 'Set upstream' })); expect(mock.api.setUpstream).toHaveBeenCalledWith('main', 'upstream/main');
  });
  it('uses remote short names for remote and combined deletes', () => {
    render(<CommitGraph />); fireEvent.contextMenu(screen.getByTitle('upstream/feature')); fireEvent.click(screen.getByRole('button', { name: 'Delete upstream/feature', exact: true })); expect(mock.api.deleteBranch).toHaveBeenCalledWith('feature', { local: false, remote: true, remoteName: 'upstream', force: true });
    fireEvent.contextMenu(screen.getByTitle('upstream/feature')); fireEvent.click(screen.getByRole('button', { name: 'Delete feature and upstream/feature' })); expect(mock.api.deleteBranch).toHaveBeenCalledWith('feature', { local: true, remote: true, remoteName: 'upstream', force: true });
  });
});
