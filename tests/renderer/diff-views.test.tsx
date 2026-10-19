// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ state: {} as Record<string, any>, api: {
  stageHunk: vi.fn(), unstageHunk: vi.fn(), discardHunk: vi.fn(), revertHunk: vi.fn(), getBlame: vi.fn(), getFileHistory: vi.fn(), openInEditor: vi.fn()
} }));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: any) => any) => selector(mock.state) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mock.api }));
import { UnifiedDiffView } from '../../src/renderer/components/DiffViewer/UnifiedDiffView';
import { SplitDiffView } from '../../src/renderer/components/DiffViewer/SplitDiffView';
import { HunkHeader } from '../../src/renderer/components/DiffViewer/HunkHeader';
import { BlameView } from '../../src/renderer/components/DiffViewer/BlameView';
import { FileHistoryView } from '../../src/renderer/components/DiffViewer/FileHistoryView';
import { DiffViewer } from '../../src/renderer/components/DiffViewer/DiffViewer';

const hunk = { header: '@@ -1,2 +1,2 @@ function example', oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [
  { kind: 'context', oldNo: 1, newNo: 1, content: 'context' },
  { kind: 'del', oldNo: 2, newNo: null, content: 'old value' },
  { kind: 'add', oldNo: null, newNo: 2, content: 'new value' }
] } as any;
beforeEach(() => {
  mock.state.openDiff = { commitHash: null, filePath: 'file.txt' };
  Object.assign(mock.state, { fileDiff: null, diffLoading: false, diffHeight: 300, diffMaximized: false, diffViewMode: 'unified', diffActiveTab: 'diff',
    closeDiff: vi.fn(), setDiffHeight: vi.fn(), toggleDiffMaximized: vi.fn(), setDiffViewMode: vi.fn(), setDiffActiveTab: vi.fn() });
  mock.state.selectCommit = vi.fn(); mock.state.openFileDiff = vi.fn();
  mock.state.reloadCurrentDiff = vi.fn().mockResolvedValue(undefined);
  mock.state.runAndRefresh = vi.fn(async (run: () => Promise<unknown>) => run());
  Object.values(mock.api).forEach(fn => fn.mockReset().mockResolvedValue(undefined));
});

describe('diff workspace', () => {
  it('renders no pane without a file selection and explains empty/binary/loading states', () => {
    mock.state.openDiff = null; const { container, rerender } = render(<DiffViewer />); expect(container).toBeEmptyDOMElement();
    mock.state.openDiff = { commitHash: null, filePath: 'file.txt' }; rerender(<DiffViewer />);
    expect(screen.getByText('WORKING DIR')).toBeVisible(); expect(screen.getByText(/No textual changes/)).toBeVisible();
    mock.state.openDiff = { commitHash: 'head', filePath: 'file.txt' }; mock.state.fileDiff = { hunks: [] }; rerender(<DiffViewer />);
    expect(screen.getByText(/No diff available/)).toBeVisible();
    mock.state.fileDiff = { isBinary: true }; rerender(<DiffViewer />); expect(screen.getByText('Binary file cannot be displayed inline')).toBeVisible();
    mock.state.diffLoading = true; rerender(<DiffViewer />); expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
  it('renders unified/split content, staged stats and mode/tab/close controls', async () => {
    mock.state.openDiff.staged = true; mock.state.fileDiff = { hunks: [hunk], insertions: 2, deletions: 1 };
    mock.api.getBlame.mockResolvedValue([]); mock.api.getFileHistory.mockResolvedValue([]);
    const { rerender } = render(<DiffViewer />); expect(screen.getByText('STAGED')).toBeVisible(); expect(screen.getByText('+2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Split/ })); expect(mock.state.setDiffViewMode).toHaveBeenCalledWith('split');
    mock.state.diffViewMode = 'split'; rerender(<DiffViewer />); expect(screen.getAllByText('context')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Unified/ })); expect(mock.state.setDiffViewMode).toHaveBeenCalledWith('unified');
    for (const tab of ['Blame', 'History', 'Diff']) {
      fireEvent.click(screen.getByRole('button', { name: tab })); expect(mock.state.setDiffActiveTab).toHaveBeenCalledWith(tab.toLowerCase());
      mock.state.diffActiveTab = tab.toLowerCase(); rerender(<DiffViewer />);
      if (tab === 'Blame') await screen.findByText('No blame information available for this file.');
      if (tab === 'History') await screen.findByText('No historical commits found for this file.');
    }
    fireEvent.click(screen.getByTitle('Close diff (Esc)')); expect(mock.state.closeDiff).toHaveBeenCalledOnce();
  });
  it('resizes only while dragging, toggles full view and delegates to the OS editor', async () => {
    const { container, rerender } = render(<DiffViewer />);
    expect(container.firstChild).toHaveStyle({ height: '300px' });
    fireEvent.mouseDown(screen.getByTitle('Drag to resize diff view'), { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 350 }); expect(mock.state.setDiffHeight).toHaveBeenLastCalledWith(350);
    fireEvent.mouseUp(window); fireEvent.mouseMove(window, { clientY: 200 }); expect(mock.state.setDiffHeight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Full diff view (hide graph)')); expect(mock.state.toggleDiffMaximized).toHaveBeenCalledOnce();
    mock.state.diffMaximized = true; rerender(<DiffViewer />); expect(screen.queryByTitle('Drag to resize diff view')).not.toBeInTheDocument();
    expect(screen.getByTitle('Restore split view (show commit graph)')).toBeVisible();
    fireEvent.click(screen.getByTitle('Open this file in default editor or system handler')); await waitFor(() => expect(mock.api.openInEditor).toHaveBeenCalledWith('file.txt'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}); mock.api.openInEditor.mockRejectedValue(new Error('editor unavailable'));
    fireEvent.click(screen.getByTitle('Open this file in default editor or system handler')); await waitFor(() => expect(error).toHaveBeenCalled());
  });
});

describe('hunk actions', () => {
  it('does not render without an opened diff and shows read-only comparison/stash headers', () => {
    mock.state.openDiff = null; const { container, rerender } = render(<HunkHeader hunk={hunk} hunkIndex={0} />);
    expect(container).toBeEmptyDOMElement();
    for (const mode of [{ compareCommits: ['base', 'target'] }, { stashIndex: 0 }]) {
      mock.state.openDiff = { commitHash: null, filePath: 'file.txt', ...mode }; rerender(<HunkHeader hunk={hunk} hunkIndex={0} />);
      expect(screen.getByText(hunk.header)).toBeVisible(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  });
  it('stages a worktree hunk and reloads it only after the operation completes', async () => {
    render(<HunkHeader hunk={hunk} hunkIndex={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage Hunk' }));
    await waitFor(() => expect(mock.state.reloadCurrentDiff).toHaveBeenCalledOnce());
    expect(mock.api.stageHunk).toHaveBeenCalledExactlyOnceWith('file.txt', 2);
    expect(mock.state.runAndRefresh.mock.calls[0][1]).toBe('Hunk #3 staged');
  });
  it('requires confirmation before discarding, and then reloads safely', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); render(<HunkHeader hunk={hunk} hunkIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard Hunk' })); expect(mock.api.discardHunk).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Discard Hunk' }));
    await waitFor(() => expect(mock.state.reloadCurrentDiff).toHaveBeenCalledOnce()); expect(mock.api.discardHunk).toHaveBeenCalledWith('file.txt', 0);
  });
  it('unstages staged content, and offers revert for committed content', async () => {
    mock.state.openDiff.staged = true; const { rerender } = render(<HunkHeader hunk={{ ...hunk, header: '@@ -1 +1 @@' }} hunkIndex={1} />);
    expect(screen.getByText('@@ -1 +1 @@')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Unstage Hunk' }));
    await waitFor(() => expect(mock.api.unstageHunk).toHaveBeenCalledWith('file.txt', 1));
    mock.state.openDiff = { commitHash: 'commit-hash', filePath: 'file.txt' }; rerender(<HunkHeader hunk={hunk} hunkIndex={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revert Hunk' }));
    await waitFor(() => expect(mock.api.revertHunk).toHaveBeenCalledWith('commit-hash', 'file.txt', 1));
  });
});

describe('unified and split code views', () => {
  it('renders context, addition and deletion markers with independent old/new line numbers', () => {
    const { container } = render(<UnifiedDiffView hunks={[hunk]} isCommitted={false} />);
    expect(screen.getByText('context')).toBeVisible(); expect(screen.getByText('old value')).toBeVisible(); expect(screen.getByText('new value')).toBeVisible();
    expect(container.querySelectorAll('.code-surface')).toHaveLength(1);
    expect(screen.getByText('+')).toBeVisible(); expect(screen.getByText('-')).toBeVisible();
  });
  it('aligns paired changes and highlights only changed words while retaining unpaired rows', () => {
    const unpaired = { ...hunk, lines: [
      ...hunk.lines, { kind: 'add', oldNo: null, newNo: 3, content: 'new unpaired' },
      { kind: 'context', oldNo: 4, newNo: 4, content: 'middle' },
      { kind: 'del', oldNo: 5, newNo: null, content: 'removed unpaired' }
    ] };
    const { container } = render(<SplitDiffView hunks={[unpaired]} isCommitted={false} />);
    expect(screen.getAllByText('context')).toHaveLength(2); expect(screen.getByText('old')).toBeVisible(); expect(screen.getByText('new')).toBeVisible();
    expect(screen.getByText('old')).toHaveClass('underline'); expect(screen.getByText('new unpaired')).toBeVisible();
    expect(screen.getByText('removed unpaired')).toBeVisible(); expect(container.querySelectorAll('.code-surface')).toHaveLength(1);
  });
  it('handles no hunks without creating synthetic content', () => {
    const { container, rerender } = render(<SplitDiffView hunks={[]} isCommitted={true} />); expect(container.textContent).toBe('');
    rerender(<UnifiedDiffView hunks={[]} isCommitted={true} />); expect(container.textContent).toBe('');
  });
});

const blame = [
  { lineNo: 1, commitHash: 'aaaa1111', shortHash: 'aaaa111', author: 'Alice', date: '2026-10-19', summary: 'First change', content: 'alpha code' },
  { lineNo: 2, commitHash: 'aaaa1111', shortHash: 'aaaa111', author: 'Alice', date: '2026-10-19', summary: 'First change', content: 'second line' },
  { lineNo: 3, commitHash: 'bbbb2222', shortHash: 'bbbb222', author: 'Bob', date: '2026-10-18', summary: 'Fix routing', content: 'beta code' }
];
describe('blame annotations', () => {
  it('shows loading, groups repeated authors, filters by every supported field and selects commits', async () => {
    mock.api.getBlame.mockResolvedValue(blame); render(<BlameView filePath="file.txt" />);
    expect(screen.getByText('Computing blame annotations...')).toBeVisible();
    await screen.findByText('alpha code'); expect(screen.getAllByRole('button', { name: /aaaa111/ })).toHaveLength(1);
    expect(screen.getByText('〃')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: /bbbb222/ })); expect(mock.state.selectCommit).toHaveBeenCalledWith('bbbb2222');
    const input = screen.getByPlaceholderText(/Filter by author/);
    for (const query of ['Bob', 'Fix routing', 'bbbb222', 'beta code']) {
      fireEvent.change(input, { target: { value: query } }); expect(screen.getByText('1 of 3 lines')).toBeVisible(); expect(screen.getByText('beta code')).toBeVisible(); expect(screen.queryByText('alpha code')).not.toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: '   ' } }); expect(screen.getByText('alpha code')).toBeVisible();
  });
  it('handles empty data, request failures, and an old result after unmount', async () => {
    mock.api.getBlame.mockResolvedValueOnce([]); const { unmount } = render(<BlameView filePath="empty.txt" />);
    await screen.findByText('No blame information available for this file.'); unmount();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mock.api.getBlame.mockRejectedValueOnce(new Error('missing')); const next = render(<BlameView filePath="missing.txt" />);
    await screen.findByText('No blame information available for this file.'); expect(error).toHaveBeenCalled(); next.unmount();
    let resolve!: (data: any) => void; mock.api.getBlame.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const stale = render(<BlameView filePath="old.txt" />); stale.unmount(); await act(async () => resolve(blame)); expect(screen.queryByText('alpha code')).not.toBeInTheDocument();
    let reject!: (error: Error) => void; mock.api.getBlame.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
    const failed = render(<BlameView filePath="old.txt" />); failed.unmount(); await act(async () => reject(new Error('late')));
  });
});

describe('file revision history', () => {
  const entries = [{ hash: 'a1', shortHash: 'a1', authorName: 'Alice', date: '2026-10-19T12:00:00Z', summary: 'First revision' }, { hash: 'b2', shortHash: 'b2', authorName: 'Bob', date: '2026-10-18T12:00:00Z', summary: 'Older revision' }];
  it('shows each revision, highlights the selected diff and opens file/commit actions', async () => {
    mock.state.openDiff = { commitHash: 'a1' }; mock.api.getFileHistory.mockResolvedValue(entries); render(<FileHistoryView filePath="file.txt" />);
    expect(screen.getByText('Loading file revision history...')).toBeVisible(); await screen.findByText('First revision');
    expect(screen.getByText('2 commits')).toBeVisible(); expect(screen.getByText('2026-10-19')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'View Diff at Commit' })[0]); expect(mock.state.openFileDiff).toHaveBeenCalledWith({ commitHash: 'a1', filePath: 'file.txt' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Go to Commit' })[1]); expect(mock.state.selectCommit).toHaveBeenCalledWith('b2');
  });
  it('handles empty results, errors, and responses settling after unmount', async () => {
    mock.api.getFileHistory.mockResolvedValueOnce([]); const first = render(<FileHistoryView filePath="empty" />);
    await screen.findByText('No historical commits found for this file.'); first.unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {}); mock.api.getFileHistory.mockRejectedValueOnce(new Error('missing'));
    const second = render(<FileHistoryView filePath="missing" />); await screen.findByText('No historical commits found for this file.'); second.unmount();
    let resolve!: (data: any) => void; mock.api.getFileHistory.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const stale = render(<FileHistoryView filePath="old" />); stale.unmount(); await act(async () => resolve(entries));
    let reject!: (error: Error) => void; mock.api.getFileHistory.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
    const failed = render(<FileHistoryView filePath="old" />); failed.unmount(); await act(async () => reject(new Error('late')));
  });
});
