// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitDetail, FileChange } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>, settings: {} as Record<string, any>, listeners: new Set<() => void>(), errors: [] as unknown[],
  api: { commit: vi.fn(), stageAll: vi.fn(), unstageAll: vi.fn(), stageFiles: vi.fn(), unstageFiles: vi.fn(), discardFile: vi.fn(), generateAiCommitMessage: vi.fn(), explainChanges: vi.fn(), revertCommit: vi.fn(), applyStashFile: vi.fn(), stashApply: vi.fn(), stashDrop: vi.fn() }
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/store', async () => {
  const React = await import('react');
  const useApp = Object.assign((selector: (state: Record<string, any>) => unknown) => React.useSyncExternalStore(
    callback => { mocks.listeners.add(callback); return () => mocks.listeners.delete(callback); }, () => selector(mocks.state)
  ), { getState: () => mocks.state });
  return { useApp, WIP_HASH: '__WIP__' };
});
vi.mock('../../src/renderer/store/settings', async () => {
  const React = await import('react');
  return { useSettings: (selector?: (settings: Record<string, any>) => unknown) => React.useSyncExternalStore(
    callback => { mocks.listeners.add(callback); return () => mocks.listeners.delete(callback); }, () => selector ? selector(mocks.settings) : mocks.settings
  ) };
});
import { CommitDetailPanel, StatusIcon } from '../../src/renderer/components/CommitDetailPanel/CommitDetailPanel';

function update(values: Record<string, unknown>) { mocks.state = { ...mocks.state, ...values }; for (const listener of mocks.listeners) listener(); }
function setting(values: Record<string, unknown>) { mocks.settings = { ...mocks.settings, ...values }; for (const listener of mocks.listeners) listener(); }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
const changed = (path: string, status: FileChange['status'] = 'modified', insertions?: number, deletions?: number): FileChange => ({ path, status, insertions, deletions });
function detail(options: Partial<CommitDetail> = {}): CommitDetail {
  return { hash: 'abcdef1234567890', shortHash: 'abcdef1', parents: ['parent111111', 'parent222222'], message: 'Improve workflows', body: 'Detailed commit body', authorName: 'Developer', authorEmail: 'dev@example.com', date: '2026-01-02T12:30:00Z', files: [changed('src/one.ts', 'modified', 2, 1), changed('src/sub/two.ts', 'added', 3, 0), changed('README.md', 'deleted', 0, 4)], insertions: 5, deletions: 5, ...options };
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
function workdir(staged: FileChange[] = [changed('staged.ts')], unstaged: FileChange[] = [changed('unstaged.ts')]) {
  update({ selectedCommit: '__WIP__', commitDetail: detail({ hash: '__WIP__', shortHash: 'WIP', authorName: '', parents: [], files: [...staged, ...unstaged] }), status: { staged, unstaged } });
  return render(<CommitDetailPanel />);
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.listeners.clear(); mocks.errors = [];
  for (const fn of Object.values(mocks.api)) fn.mockResolvedValue(undefined);
  mocks.api.generateAiCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated change' });
  mocks.api.explainChanges.mockResolvedValue({ ok: true, explanation: 'Summary of actual changes.' });
  mocks.api.applyStashFile.mockResolvedValue({ ok: true });
  mocks.state = {
    selectedCommit: 'abcdef1234567890', commitDetail: detail(), detailLoading: false, compareCommits: null, comparisonResult: null,
    selectedStashIndex: null, stashDetail: null, status: { staged: [], unstaged: [] }, openDiff: null,
    selectCommit: vi.fn(), setCompareCommits: vi.fn(), inspectStash: vi.fn(), notify: vi.fn(), openRebaseModal: vi.fn(),
    cherryPickCommit: vi.fn(), openCreateTagModal: vi.fn(), openFileDiff: vi.fn(), openConflictResolver: vi.fn(),
    runAndRefresh: vi.fn(async fn => { try { await fn(); return true; } catch (error) { mocks.errors.push(error); return false; } })
  };
  mocks.settings = {
    defaultAuthorName: 'Default Author', defaultAuthorEmail: 'default@example.com', commitProfiles: [], activeProfileId: '',
    setActiveProfileId: vi.fn(id => setting({ activeProfileId: id })), openSettings: vi.fn(),
    aiCommit: { provider: 'ollama', model: 'model', promptStyle: 'conventional' }
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps commit details readable if locale formatting fails and unknown status codes arrive', () => {
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(() => { throw new Error('locale unavailable'); }); render(<CommitDetailPanel />); expect(screen.getByText('2026-01-02T12:30:00Z')).toBeVisible(); render(<StatusIcon status={'unknown' as any} />); expect(screen.getAllByTitle('Modified').length).toBeGreaterThan(0);
});

it('dismisses profile and generator menus through their backdrops', () => {
  const { container } = workdir(); fireEvent.click(screen.getByTitle(/Commit Profile:/)); fireEvent.click(container.querySelector('.fixed.inset-0.z-40')!); expect(screen.queryByText('Switch Commit Profile')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Select generator mode: Smart Heuristic (No AI) or AI Model')); fireEvent.click(container.querySelector('.fixed.inset-0.z-40')!); expect(screen.queryByText('Message Generator')).not.toBeInTheDocument();
});

describe('commit detail navigation and file presentation', () => {
  it('hides when inactive, handles active empty detail, and displays an adjustable loading panel', () => {
    update({ selectedCommit: null, commitDetail: null }); const result = render(<CommitDetailPanel />);
    expect(result.container).toBeEmptyDOMElement();
    act(() => update({ selectedCommit: 'head' })); expect(screen.queryByText('Improve workflows')).not.toBeInTheDocument();
    act(() => update({ detailLoading: true })); expect(result.container.querySelector('.animate-spin')).toBeInTheDocument();
    const handle = result.container.querySelector<HTMLElement>('.cursor-col-resize')!;
    fireEvent.mouseDown(handle, { clientX: 500 }); fireEvent.mouseMove(window, { clientX: 900 });
    expect(result.container.firstElementChild).toHaveStyle({ width: '260px' });
    fireEvent.mouseUp(window); fireEvent.mouseMove(window, { clientX: 0 }); expect(result.container.firstElementChild).toHaveStyle({ width: '260px' });
  });
  it('shows author, body, file statistics and parent links and copies the full hash', async () => {
    render(<CommitDetailPanel />);
    expect(screen.getByText('Detailed commit body')).toBeInTheDocument(); expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('3 changed')).toBeInTheDocument(); expect(screen.getByText('+5 added')).toBeInTheDocument(); expect(screen.getByText('-5 deleted')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Go to parent parent1')); expect(mocks.state.selectCommit).toHaveBeenCalledWith('parent111111');
    fireEvent.click(screen.getByTitle('Copy hash')); expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abcdef1234567890');
    expect(mocks.state.notify).toHaveBeenCalledWith('success', 'Hash copied');
    fireEvent.click(screen.getByTitle('Close details (Esc)')); expect(mocks.state.selectCommit).toHaveBeenCalledWith(null);
  });
  it('opens commit file diffs, switches to tree layout, and collapses folders', () => {
    update({ openDiff: { commitHash: 'abcdef1234567890', filePath: 'src/one.ts' } }); render(<CommitDetailPanel />);
    expect(screen.getByTitle('src/one.ts')).toHaveClass('bg-accent/10');
    fireEvent.click(screen.getByTitle('src/one.ts')); expect(mocks.state.openFileDiff).toHaveBeenCalledWith({ commitHash: 'abcdef1234567890', filePath: 'src/one.ts', status: 'modified' });
    fireEvent.click(screen.getByTitle('Tree view')); expect(screen.getByText('src/')).toBeInTheDocument(); expect(screen.getByText('src/sub/')).toBeInTheDocument();
    fireEvent.click(screen.getByText('src/')); expect(screen.queryByTitle('src/one.ts')).not.toBeInTheDocument(); expect(screen.getByTitle('README.md')).toBeInTheDocument();
    fireEvent.click(screen.getByText('src/')); expect(screen.getByTitle('src/one.ts')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Path view')); expect(screen.queryByText('src/')).not.toBeInTheDocument();
  });
  it('uses singular changed-file counts and omits an absent commit body', () => {
    update({ commitDetail: detail({ body: '', files: [changed('only.ts')] }) }); render(<CommitDetailPanel />);
    expect(screen.getByText('1 changed file')).toBeInTheDocument(); expect(screen.queryByText('Detailed commit body')).not.toBeInTheDocument();
  });
  it.each([
    ['Copy full hash', 'copy'], ['Revert commit', 'revert'], ['Cherry-pick onto current branch', 'cherry'],
    ['Interactive rebase from here', 'rebase'], ['Create tag at this commit', 'tag']
  ])('executes %s from the real action dropdown', async (label, action) => {
    render(<CommitDetailPanel />); click('Commit Actions'); click(label);
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    if (action === 'copy') expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abcdef1234567890');
    else if (action === 'revert') await waitFor(() => expect(mocks.api.revertCommit).toHaveBeenCalledWith('abcdef1234567890'));
    else expect(mocks.state[action === 'cherry' ? 'cherryPickCommit' : action === 'rebase' ? 'openRebaseModal' : 'openCreateTagModal']).toHaveBeenCalledWith('abcdef1234567890');
  });
  it('resizes the detail panel within bounds and removes drag listeners', () => {
    const result = render(<CommitDetailPanel />); const handle = screen.getByTitle('Drag to resize panel');
    fireEvent.mouseDown(handle, { clientX: 500 }); fireEvent.mouseMove(window, { clientX: 0 }); expect(result.container.firstElementChild).toHaveStyle({ width: '640px' });
    fireEvent.mouseUp(window); fireEvent.mouseMove(window, { clientX: 1000 }); expect(result.container.firstElementChild).toHaveStyle({ width: '640px' });
    fireEvent.mouseDown(handle, { clientX: 0 }); fireEvent.mouseMove(window, { clientX: 1000 }); expect(result.container.firstElementChild).toHaveStyle({ width: '260px' }); fireEvent.mouseUp(window);
  });
  it('closes the current detail mode through Escape', () => {
    render(<CommitDetailPanel />); fireEvent.keyDown(window, { key: 'Other' }); expect(mocks.state.selectCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(mocks.state.selectCommit).toHaveBeenCalledWith(null);
  });
});

describe('two-commit comparison and stash inspection', () => {
  it('opens comparison diffs, swaps revision order, and closes through click or Escape', () => {
    update({ compareCommits: ['basehash', 'targethash'], comparisonResult: { baseHash: 'basehash', targetHash: 'targethash', files: [changed('file.ts', 'modified', 3, 2)], insertions: 3, deletions: 2 }, openDiff: { filePath: 'file.ts', compareCommits: ['basehash', 'targethash'] } });
    render(<CommitDetailPanel />); expect(screen.getByText('1 changed file')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('file.ts')); expect(mocks.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'file.ts', compareCommits: ['basehash', 'targethash'], status: 'modified' });
    click('Swap'); expect(mocks.state.setCompareCommits).toHaveBeenCalledWith(['targethash', 'basehash']);
    fireEvent.click(screen.getByTitle('Close comparison (Esc)')); fireEvent.keyDown(window, { key: 'Escape' }); expect(mocks.state.setCompareCommits).toHaveBeenCalledWith(null);
  });
  function stash(files = [changed('stash.ts', 'modified', 1, 2)]) {
    update({ selectedCommit: null, commitDetail: null, selectedStashIndex: 2, stashDetail: { index: 2, message: 'Saved work', date: '2026-01-02T00:00:00Z', files, insertions: 1, deletions: 2 }, openDiff: { filePath: 'stash.ts', stashIndex: 2 } });
    return render(<CommitDetailPanel />);
  }
  it('opens stash diffs, restores one file without opening its diff, and applies the entire stash', async () => {
    stash(); expect(screen.getByText('1 file')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('stash.ts')); expect(mocks.state.openFileDiff).toHaveBeenCalledWith({ commitHash: null, filePath: 'stash.ts', stashIndex: 2, status: 'modified' });
    mocks.state.openFileDiff.mockClear(); click('Apply File'); await waitFor(() => expect(mocks.api.applyStashFile).toHaveBeenCalledWith(2, 'stash.ts'));
    expect(mocks.state.openFileDiff).not.toHaveBeenCalled();
    click('Apply Stash'); await waitFor(() => expect(mocks.api.stashApply).toHaveBeenCalledWith(2));
  });
  it.each([{ ok: false, error: 'stash path missing' }, { ok: false }])('surfaces individual stash restore failures via the shared operation runner', async response => {
    mocks.api.applyStashFile.mockResolvedValue(response); stash(); click('Apply File');
    await waitFor(() => expect(mocks.errors).toHaveLength(1)); expect(String(mocks.errors[0])).toContain(response.error || 'Failed to apply stash file');
  });
  it('requires confirmation to drop a stash and closes only after a successful drop', async () => {
    stash([changed('one'), changed('two')]); expect(screen.getByText('2 files')).toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValueOnce(false); click('Drop Stash'); expect(mocks.api.stashDrop).not.toHaveBeenCalled();
    click('Drop Stash'); await waitFor(() => expect(mocks.state.inspectStash).toHaveBeenCalledWith(null)); expect(mocks.api.stashDrop).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTitle('Close inspector')); fireEvent.keyDown(window, { key: 'Escape' }); expect(mocks.state.inspectStash).toHaveBeenCalledTimes(3);
  });
});

describe('AI commit explanation', () => {
  it('requests the selected commit and reuses cached explanations after closing the accordion', async () => {
    render(<CommitDetailPanel />); click('Explain');
    expect(await screen.findByText('Summary of actual changes.')).toBeInTheDocument();
    expect(mocks.api.explainChanges).toHaveBeenCalledExactlyOnceWith({ commitHash: 'abcdef1234567890', config: mocks.settings.aiCommit });
    const header = screen.getByText('AI Code Review & Explainer').parentElement!; fireEvent.click(within(header).getByRole('button'));
    expect(screen.queryByText('Summary of actual changes.')).not.toBeInTheDocument(); click('Explain');
    expect(screen.getByText('Summary of actual changes.')).toBeInTheDocument(); expect(mocks.api.explainChanges).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: false, error: 'provider offline' }, { ok: true }])('shows provider failures and supports explicit retry: %j', async response => {
    mocks.api.explainChanges.mockResolvedValueOnce(response); render(<CommitDetailPanel />); click('Explain');
    expect(await screen.findByText(response.error || 'Failed to explain changes')).toBeInTheDocument(); click('Retry');
    expect(await screen.findByText('Summary of actual changes.')).toBeInTheDocument();
  });
  it('shows thrown explanation errors and avoids duplicate in-flight requests', async () => {
    const pending = deferred<{ ok: boolean }>(); mocks.api.explainChanges.mockReturnValueOnce(pending.promise);
    render(<CommitDetailPanel />); click('Explain'); click('Explain'); expect(mocks.api.explainChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Analyzing commit diff and generating review...')).toBeInTheDocument();
    await act(async () => pending.reject(new Error('connection failed')));
    expect(screen.getByText('Error: connection failed')).toBeInTheDocument();
  });
  it.each(['resolve', 'reject'] as const)('ignores obsolete explanation results when selection changes and the old request %ss', async completion => {
    const pending = deferred<{ ok: boolean; explanation: string }>(); mocks.api.explainChanges.mockReturnValueOnce(pending.promise);
    render(<CommitDetailPanel />); click('Explain'); act(() => update({ selectedCommit: 'different' }));
    await act(async () => { if (completion === 'resolve') pending.resolve({ ok: true, explanation: 'Obsolete review' }); else pending.reject(new Error('obsolete error')); });
    expect(screen.queryByText('Obsolete review')).not.toBeInTheDocument(); expect(screen.queryByText('Error: obsolete error')).not.toBeInTheDocument();
    click('Explain'); expect(await screen.findByText('Summary of actual changes.')).toBeInTheDocument();
    expect(mocks.api.explainChanges.mock.calls[1][0].commitHash).toBe('different');
  });
});

describe('working directory staging and commit operations', () => {
  it('shows WIP without immutable commit actions and opens conflicted files in the merge editor', () => {
    workdir([changed('staged.ts')], [changed('conflict.ts', 'conflicted'), changed('fresh.ts', 'untracked')]);
    expect(screen.getByText('Working directory')).toBeInTheDocument(); expect(screen.queryByTitle('Copy hash')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Explain' })).not.toBeInTheDocument();
    click('Commit Actions'); click('Working directory changes'); expect(screen.queryByRole('button', { name: 'Revert commit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('conflict.ts')); click('Resolve'); expect(mocks.state.openConflictResolver.mock.calls).toEqual([['conflict.ts'], ['conflict.ts']]);
    expect(screen.getByText('new')).toBeInTheDocument();
  });
  it('stages, unstages, and discards the selected worktree files through the operation runner', async () => {
    workdir([changed('stage.ts', 'renamed')], [changed('work.ts')]);
    fireEvent.click(screen.getByTitle('Unstage')); fireEvent.click(screen.getByTitle('Unstage all'));
    fireEvent.click(screen.getByTitle('Stage file')); fireEvent.click(screen.getByTitle('Stage all')); fireEvent.click(screen.getByTitle('Discard changes'));
    await waitFor(() => expect(mocks.api.discardFile).toHaveBeenCalledWith('work.ts'));
    expect(mocks.api.unstageFiles).toHaveBeenCalledWith(['stage.ts']); expect(mocks.api.unstageAll).toHaveBeenCalledOnce(); expect(mocks.api.stageFiles).toHaveBeenCalledWith(['work.ts']); expect(mocks.api.stageAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('stage.ts')); fireEvent.click(screen.getByTitle('work.ts'));
    expect(mocks.state.openFileDiff.mock.calls).toEqual([
      [{ commitHash: null, filePath: 'stage.ts', staged: true, status: 'renamed' }], [{ commitHash: null, filePath: 'work.ts', staged: false, status: 'modified' }]
    ]);
  });
  it('counts modified, added, and deleted files independently in staged and unstaged groups', () => {
    const staged = [changed('s-mod'), changed('s-rename', 'renamed'), changed('s-add', 'added'), changed('s-delete', 'deleted')];
    const unstaged = [changed('u-mod'), changed('u-rename', 'renamed'), changed('u-add', 'untracked'), changed('u-delete', 'deleted')];
    update({ openDiff: { filePath: 's-mod', commitHash: null, staged: true } }); workdir(staged, unstaged);
    expect(screen.getByText('STAGED FILES (4)')).toBeInTheDocument(); expect(screen.getByText('UNSTAGED FILES (4)')).toBeInTheDocument();
    expect(screen.getAllByTitle('2 modified')).toHaveLength(2); expect(screen.getAllByTitle('1 deleted')).toHaveLength(2); expect(screen.getByTitle('1 new')).toBeInTheDocument(); expect(screen.getByTitle('1 new/untracked')).toBeInTheDocument();
    expect(screen.getByTitle('s-delete')).toHaveClass('line-through'); expect(screen.getByTitle('u-delete')).toHaveClass('line-through');
  });
  it('commits a trimmed staged message with the effective author and clears it only on success', async () => {
    workdir(); const input = screen.getByRole('textbox');
    expect(screen.getByTitle('Commit staged changes (Ctrl+Enter)')).toBeDisabled();
    fireEvent.change(input, { target: { value: ' feat: commit change ' } }); click('Commit 1 staged file');
    await waitFor(() => expect(input).toHaveValue(''));
    expect(mocks.api.commit).toHaveBeenCalledWith('feat: commit change', { name: 'Default Author', email: 'default@example.com' });
    mocks.state.runAndRefresh.mockResolvedValueOnce(false); fireEvent.change(input, { target: { value: 'Keep draft' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }); await act(async () => {}); expect(input).toHaveValue('Keep draft');
  });
  it('does not issue a keyboard commit with blank text or no staged changes', async () => {
    workdir([], [changed('unstaged.ts')]); const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true }); expect(mocks.api.commit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Unstaged draft' } }); fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await act(async () => {}); expect(mocks.api.commit).not.toHaveBeenCalled();
  });
  it('uses Git author defaults when no author is configured and supports signed profile selection', async () => {
    setting({ defaultAuthorName: '', defaultAuthorEmail: '', commitProfiles: [{ id: 'signed', name: 'Work', authorName: 'Work User', authorEmail: 'work@example.com', signingKey: 'ABC' }, { id: 'empty', name: 'Personal', authorName: '', authorEmail: '', signingKey: '' }] });
    workdir([changed('a'), changed('b')]); const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Use default Git author' } }); fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(mocks.api.commit).toHaveBeenCalledWith('Use default Git author', undefined));
    fireEvent.click(screen.getByTitle(/Commit Profile: Default Profile/)); click(/Work Work User/);
    expect(mocks.settings.setActiveProfileId).toHaveBeenCalledWith('signed'); expect(screen.getByText('🔑 Signed')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Signed change' } }); click(/^Commit 2 staged files/);
    await waitFor(() => expect(mocks.api.commit).toHaveBeenCalledWith('Signed change', { name: 'Work User', email: 'work@example.com' }));
    fireEvent.click(screen.getByTitle(/Commit Profile: Work/)); click('Manage Profiles & Signing...'); expect(mocks.settings.openSettings).toHaveBeenCalledOnce();
  });
});

describe('commit message generation', () => {
  it('uses offline smart generation for staged changes without staging more files', async () => {
    workdir(); click('Generate Message'); const input = screen.getByRole('textbox');
    await waitFor(() => expect(input).toHaveValue('feat: generated change'));
    expect(mocks.api.generateAiCommitMessage).toHaveBeenCalledWith({ ...mocks.settings.aiCommit, provider: 'local' }); expect(mocks.api.stageAll).not.toHaveBeenCalled();
  });
  it('stages unstaged changes once, refreshes, then generates a message', async () => {
    workdir([], [changed('work.ts')]); click('Generate Message');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('feat: generated change'));
    expect(mocks.api.stageAll).toHaveBeenCalledOnce(); expect(mocks.state.runAndRefresh).toHaveBeenCalledOnce();
    expect(mocks.api.stageAll.mock.invocationCallOrder[0]).toBeLessThan(mocks.api.generateAiCommitMessage.mock.invocationCallOrder[0]);
  });
  it('switches between the configured AI model and offline generator modes', async () => {
    workdir(); fireEvent.click(screen.getByTitle('Select generator mode: Smart Heuristic (No AI) or AI Model')); click(/AI Model \(ollama\)/);
    click('Generate (AI)'); await waitFor(() => expect(mocks.api.generateAiCommitMessage).toHaveBeenCalledWith(mocks.settings.aiCommit));
    fireEvent.click(screen.getByTitle('Select generator mode: Smart Heuristic (No AI) or AI Model')); click(/Smart Rule-Based \(No AI\)/);
    expect(screen.getByRole('button', { name: 'Generate Message' })).toBeInTheDocument();
  });
  it.each([{ ok: false, error: 'model offline' }, { ok: true }])('shows actionable provider failures without overwriting the draft: %j', async response => {
    mocks.api.generateAiCommitMessage.mockResolvedValueOnce(response); workdir(); const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Existing draft' } }); click('Generate Message');
    const error = await screen.findByText(response.error || 'Failed to generate commit message'); expect(input).toHaveValue('Existing draft');
    fireEvent.click(error.parentElement!.parentElement!.querySelector('button')!); expect(screen.queryByText(error.textContent!)).not.toBeInTheDocument();
  });
  it('shows thrown errors and locks generation while its request is pending', async () => {
    const pending = deferred<{ ok: boolean }>(); mocks.api.generateAiCommitMessage.mockReturnValueOnce(pending.promise); workdir(); click('Generate Message');
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    await act(async () => pending.reject(new Error('request failed'))); expect(screen.getByText('request failed')).toBeInTheDocument();
  });
  it.each([null, 'non-Error failure'])('handles unknown generator failures without losing the draft: %j', async failure => {
    mocks.api.generateAiCommitMessage.mockRejectedValueOnce(failure); workdir();
    const input = screen.getByRole('textbox'); fireEvent.change(input, { target: { value: 'Keep draft' } }); click('Generate Message');
    expect(await screen.findByText('Generation failed')).toBeInTheDocument(); expect(input).toHaveValue('Keep draft');
  });
  it('disables generation when no staged or unstaged changes exist, including a missing status', () => {
    workdir([], []); expect(screen.getByRole('button', { name: 'Generate Message' })).toBeDisabled();
    act(() => update({ status: null })); expect(screen.getByTitle('No changes detected to generate commit message')).toBeDisabled();
  });
});
