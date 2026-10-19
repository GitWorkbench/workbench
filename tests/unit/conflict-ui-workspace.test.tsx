// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import type { ConflictFileParsed } from '../../src/shared/types';
import { parseConflictSections } from '../../src/shared/conflicts';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>, listeners: new Set<() => void>(), close: vi.fn(), open: vi.fn(), notify: vi.fn(), refresh: vi.fn(), run: vi.fn(),
  api: { getConflictFile: vi.fn(), getResolutionSuggestion: vi.fn(), forgetResolution: vi.fn(), resolveConflictFile: vi.fn(), getRepoOperationState: vi.fn(), continueOperation: vi.fn() }
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/store', async () => {
  const React = await import('react');
  const useApp = Object.assign((selector: (s: Record<string, any>) => unknown) => React.useSyncExternalStore(
    callback => { mocks.listeners.add(callback); return () => mocks.listeners.delete(callback); },
    () => selector(mocks.state)
  ), {
    getState: () => mocks.state,
    setState: (update: Record<string, unknown>) => { mocks.state = { ...mocks.state, ...update }; for (const listener of mocks.listeners) listener(); }
  });
  return { useApp };
});
import { ConflictResolverModal } from '../../src/renderer/components/ConflictResolver/ConflictResolverModal';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setState(update: Record<string, unknown>) {
  mocks.state = { ...mocks.state, ...update }; for (const listener of mocks.listeners) listener();
}
function conflict(options: Partial<ConflictFileParsed> = {}): ConflictFileParsed {
  const rawContent = 'before\n<<<<<<< ours\nours\n||||||| base\nancestor\n=======\ntheirs\n>>>>>>> incoming\nafter\n';
  return { filePath: 'file.txt', rawContent, sections: parseConflictSections(rawContent), totalConflicts: 1,
    currentContent: 'before\nours\nafter\n', incomingContent: 'before\ntheirs\nafter\n', baseContent: 'before\nancestor\nafter\n',
    currentLabel: 'Current branch', incomingLabel: 'Incoming branch', kind: 'text', lineEnding: '\n', snapshot: 'snapshot', workingTreeExists: true, ...options };
}
function twoConflicts(): ConflictFileParsed {
  const rawContent = 'start\n<<<<<<< ours\nA\n=======\nB\n>>>>>>> incoming\nmiddle\n<<<<<<< ours\nC\n=======\nD\n>>>>>>> incoming\nend\n';
  return conflict({ rawContent, sections: parseConflictSections(rawContent), totalConflicts: 2,
    currentContent: 'start\nA\nmiddle\nC\nend\n', incomingContent: 'start\nB\nmiddle\nD\nend\n', baseContent: null });
}
function view(label = 'Editable merge result'): EditorView {
  const content = screen.getAllByLabelText(label).find(element => element.classList.contains('cm-content'))!;
  return EditorView.findFromDOM(content)!;
}
async function open(data = conflict()) {
  mocks.api.getConflictFile.mockResolvedValue(data);
  setState({ conflictedFileToResolve: data.filePath });
  const result = render(<ConflictResolverModal />);
  if (data.kind === 'text') await waitFor(() => expect(screen.getAllByLabelText('Editable merge result')).toHaveLength(2));
  else await screen.findByText(data.kind === 'binary' ? 'Binary file conflict' : data.kind === 'symlink' ? 'Symbolic link conflict' : 'Submodule conflict');
  return result;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const applyButton = () => screen.getByRole('button', { name: /^Apply & Mark Resolved$/ });

beforeEach(() => {
  vi.resetAllMocks(); mocks.listeners.clear();
  mocks.close.mockImplementation(() => setState({ conflictedFileToResolve: null }));
  mocks.open.mockImplementation(path => setState({ conflictedFileToResolve: path }));
  mocks.refresh.mockResolvedValue(undefined); mocks.run.mockImplementation(async fn => { await fn(); return true; });
  mocks.state = {
    conflictedFileToResolve: null, activeTab: '/repo', closeConflictResolver: mocks.close, openConflictResolver: mocks.open,
    notify: mocks.notify, refresh: mocks.refresh, runAndRefresh: mocks.run,
    operationState: { inMerge: true, conflictedFiles: ['file.txt'] }, resolutionMemoryOpen: false
  };
  mocks.api.getResolutionSuggestion.mockResolvedValue({ snapshot: 'snapshot', enabled: false, content: null });
  mocks.api.resolveConflictFile.mockResolvedValue({ ok: true });
  mocks.api.getRepoOperationState.mockResolvedValue({ conflictedFiles: [] });
  mocks.api.forgetResolution.mockResolvedValue(undefined);
  mocks.api.continueOperation.mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 100, 20) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['current', 'incoming'] as const)('chooses an individual conflict using the %s editor gutter widget', async side => {
  await open(); const editor = view(side === 'current' ? 'Current file version, read only' : 'Incoming file version, read only'); const accept = editor.dom.querySelector('.cm-merge-accept')!; expect(accept).not.toBeNull(); fireEvent.click(accept); expect(view().state.doc.toString()).toContain(side === 'current' ? 'ours' : 'theirs'); expect(applyButton()).toBeEnabled();
});

it.each(['Current file version, read only', 'Editable merge result', 'Incoming file version, read only'])('saves a resolved result with the keyboard while focus is in %s', async label => {
  await open(); click(/^Current$/); fireEvent.keyDown(view(label).contentDOM, { key: 's', ctrlKey: true }); await waitFor(() => expect(mocks.api.resolveConflictFile).toHaveBeenCalledWith('file.txt', 'before\nours\nafter\n', { action: 'result', expectedSnapshot: 'snapshot' }));
});

it('uses the incoming whole-file choice and allows cancelling a remembered preview from its footer', async () => {
  mocks.api.getResolutionSuggestion.mockResolvedValue({ enabled: true, snapshot: 'snapshot', content: 'remembered' }); await open(); await screen.findByRole('button', { name: 'Preview remembered result' }); click('Preview remembered result'); const preview = screen.getByRole('dialog', { name: 'Preview remembered resolution' }); fireEvent.click(within(preview).getByRole('button', { name: 'Cancel' })); expect(screen.queryByRole('dialog', { name: 'Preview remembered resolution' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Use the entire incoming file, including its non-conflicting content')); expect(view().state.doc.toString()).toBe('before\ntheirs\nafter\n');
});

describe('conflict file loading and stale results', () => {
  it('renders nothing until a conflict file is selected', () => {
    const result = render(<ConflictResolverModal />);
    expect(result.container).toBeEmptyDOMElement();
    expect(mocks.api.getConflictFile).not.toHaveBeenCalled();
  });
  it('shows loading, accepts close, and discards a late loading result', async () => {
    const load = deferred<ConflictFileParsed>(); mocks.api.getConflictFile.mockReturnValueOnce(load.promise);
    setState({ conflictedFileToResolve: 'file.txt' }); render(<ConflictResolverModal />);
    expect(screen.getByText('Loading file versions…')).toBeInTheDocument();
    click('Close merge editor');
    await act(async () => load.resolve(conflict()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each([new Error('file unreadable'), 'file missing'])('shows loading failures and retries from disk', async error => {
    mocks.api.getConflictFile.mockRejectedValueOnce(error).mockResolvedValueOnce(conflict());
    setState({ conflictedFileToResolve: 'file.txt' }); render(<ConflictResolverModal />);
    expect(await screen.findByText(error instanceof Error ? error.message : error)).toBeInTheDocument();
    click('Reload file');
    await screen.findAllByLabelText('Editable merge result');
    expect(mocks.api.getConflictFile).toHaveBeenCalledTimes(2);
  });
  it('ignores stale errors when the selected file changes', async () => {
    const old = deferred<ConflictFileParsed>(); mocks.api.getConflictFile.mockReturnValueOnce(old.promise).mockResolvedValueOnce(conflict({ filePath: 'next.txt' }));
    setState({ conflictedFileToResolve: 'file.txt' }); render(<ConflictResolverModal />);
    act(() => setState({ conflictedFileToResolve: 'next.txt' }));
    await screen.findAllByLabelText('Editable merge result');
    await act(async () => old.reject(new Error('stale error')));
    expect(screen.queryByText('stale error')).not.toBeInTheDocument();
    expect(screen.getByTitle('next.txt')).toBeInTheDocument();
  });
});

describe('actual merge editor resolution interactions', () => {
  it.each([
    ['Current', 'before\nours\nafter\n'], ['Incoming', 'before\ntheirs\nafter\n'],
    ['Both', 'before\nours\ntheirs\nafter\n'], ['Both reversed', 'before\ntheirs\nours\nafter\n'], ['Base', 'before\nancestor\nafter\n']
  ])('applies %s to the active conflict without writing disk', async (choice, expected) => {
    await open();
    expect(view().state.doc.toString()).toBe('before\nancestor\nafter\n');
    expect(applyButton()).toBeDisabled();
    click(new RegExp(`^${choice}$`));
    expect(view().state.doc.toString()).toBe(expected);
    expect(screen.getByText('0 unresolved')).toBeInTheDocument();
    expect(applyButton()).toBeEnabled();
    expect(mocks.api.resolveConflictFile).not.toHaveBeenCalled();
  });
  it('supports undo, redo, individual reset, and full result reset', async () => {
    await open();
    click(/^Incoming$/);
    expect(view().state.doc.toString()).toContain('theirs');
    click('Undo merge edit'); expect(view().state.doc.toString()).toContain('ancestor'); expect(applyButton()).toBeDisabled();
    click('Redo merge edit'); expect(view().state.doc.toString()).toContain('theirs'); expect(applyButton()).toBeEnabled();
    click('Reset selected conflict'); expect(screen.getByText('1 unresolved')).toBeInTheDocument();
    click(/^Current$/); click('Reset result');
    expect(view().state.doc.toString()).toBe('before\nancestor\nafter\n'); expect(applyButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset result' })).toBeDisabled();
  });
  it('requires explicit review after manual edits and blocks unresolved conflict markers', async () => {
    await open();
    act(() => view().dispatch({ changes: { from: 7, to: 15, insert: 'custom' } }));
    expect(screen.getByText('Edited result')).toBeInTheDocument(); expect(applyButton()).toBeDisabled();
    click('Mark resolved'); expect(applyButton()).toBeEnabled();
    act(() => view().dispatch({ changes: { from: 7, insert: '<<<<<<< HEAD\n' } }));
    click('Mark remaining resolved');
    expect(applyButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('still contains conflict markers');
    click('Reset result'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows the read-only ancestor and locks resolution buttons until result is restored', async () => {
    await open(); click('Show base');
    expect(screen.getAllByLabelText('Common ancestor file, read only')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Incoming$/ })).toBeDisabled();
    click('Show result'); expect(screen.queryByLabelText('Common ancestor file, read only')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Incoming$/ })).toBeEnabled();
    const linked = screen.getByRole('button', { name: 'Linked scroll' }); expect(linked).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(linked); expect(linked).toHaveAttribute('aria-pressed', 'false');
  });
  it('requires confirmation when discarding a dirty result through cancel or Escape', async () => {
    await open(); click(/^Incoming$/); vi.mocked(window.confirm).mockReturnValueOnce(false);
    click('Cancel'); expect(mocks.close).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('allows closing an unchanged result without a confirmation', async () => {
    await open(); click('Close merge editor');
    expect(window.confirm).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('uses whole-file revisions including surrounding non-conflicting text', async () => {
    await open(conflict({ currentContent: 'extra\nours\ntail\n' }));
    fireEvent.click(screen.getByTitle('Use the entire current file, including its non-conflicting content'));
    expect(view().state.doc.toString()).toBe('extra\nours\ntail\n'); expect(applyButton()).toBeEnabled();
  });
  it('navigates multiple conflicts, resolves remaining blocks, and preserves unaffected ranges', async () => {
    await open(twoConflicts());
    expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();
    click('Next conflict'); expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();
    click('Previous conflict'); expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown', altKey: true });
    expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowUp', altKey: true });
    click(/^Incoming$/); expect(view().state.doc.toString()).toBe('start\nB\nmiddle\nC\nend\n');
    expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();
    click('Use current for remaining'); expect(screen.getByText('0 unresolved')).toBeInTheDocument();
    click('Reset result'); click('Use incoming for remaining'); expect(view().state.doc.toString()).toBe('start\nB\nmiddle\nD\nend\n');
    fireEvent.click(screen.getByRole('button', { name: /^Conflict 1/ }));
    expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();
  });
  it('rejects individual choices after a manual edit spans overlapping conflict ranges', async () => {
    await open(twoConflicts());
    act(() => view().dispatch({ changes: { from: 5, to: 17, insert: 'merged\n' } }));
    click(/^Incoming$/);
    expect(screen.getByRole('alert')).toHaveTextContent('Your edit spans multiple conflicts');
    click('Mark remaining resolved'); expect(applyButton()).toBeEnabled();
  });
  it('joins both sides with a separating newline when final source revisions omit it', async () => {
    const rawContent = '<<<<<<< ours\nours\n=======\ntheirs\n>>>>>>> incoming';
    await open(conflict({ rawContent, sections: parseConflictSections(rawContent), currentContent: 'ours', incomingContent: 'theirs', baseContent: null }));
    click(/^Both$/); expect(view().state.doc.toString()).toBe('ours\ntheirs');
    click('Reset selected conflict'); click('Both reversed'); expect(view().state.doc.toString()).toBe('theirs\nours');
  });
  it('confirms dirty file changes and opens another conflicted file only on approval', async () => {
    setState({ operationState: { conflictedFiles: ['file.txt', 'next.txt'] } }); await open(); click(/^Current$/);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.change(screen.getByRole('combobox', { name: 'Conflicted file' }), { target: { value: 'next.txt' } });
    expect(mocks.open).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Conflicted file' }), { target: { value: 'next.txt' } });
    expect(mocks.open).toHaveBeenCalledWith('next.txt');
  });
  it('resizes adjacent panes within minimum widths and removes pointer listeners on completion', async () => {
    await open();
    const separator = screen.getByRole('separator', { name: 'Resize current and result panes' });
    const grid = separator.parentElement!;
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 600));
    Object.defineProperty(separator, 'setPointerCapture', { configurable: true, value: vi.fn() });
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true }); Object.defineProperties(event, { clientX: { value: x }, pointerId: { value: 1 } }); fireEvent(separator, event);
    };
    pointer('pointerdown', 100); pointer('pointermove', 200);
    expect(grid.style.gridTemplateColumns).toBe('41fr 5px 28fr 5px 31fr');
    pointer('pointermove', -1000); expect(grid.style.gridTemplateColumns).toBe('18fr 5px 51fr 5px 31fr');
    pointer('pointerup', -1000); pointer('pointermove', 300);
    expect(grid.style.gridTemplateColumns).toBe('18fr 5px 51fr 5px 31fr');
    pointer('pointerdown', 100); pointer('pointermove', 1000); pointer('pointercancel', 1000);
    expect(grid.style.gridTemplateColumns).toBe('51fr 5px 18fr 5px 31fr');
  });
  it('synchronizes corresponding line positions only while linked scrolling is enabled', async () => {
    await open(twoConflicts());
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
    const source = view('Current file version, read only');
    const target = view();
    const measure = vi.spyOn(source, 'requestMeasure').mockImplementation((request: any) => { request.write?.(request.read(source), source); });
    vi.spyOn(source, 'lineBlockAtHeight').mockReturnValue({ from: source.state.doc.line(3).from } as any);
    vi.spyOn(target, 'lineBlockAt').mockImplementation(position => ({ top: position * 10 } as any));
    fireEvent.scroll(source.scrollDOM);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(measure).toHaveBeenCalled(); expect(target.scrollDOM.scrollTop).toBeGreaterThanOrEqual(0);
    const calls = measure.mock.calls.length; click('Linked scroll'); fireEvent.scroll(source.scrollDOM);
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(measure).toHaveBeenCalledTimes(calls);
  });
});

describe('safe saving and operation continuation', () => {
  it('saves only reviewed content with its snapshot, refreshes, and closes', async () => {
    await open(); click(/^Incoming$/); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    expect(mocks.api.resolveConflictFile).toHaveBeenCalledExactlyOnceWith('file.txt', 'before\ntheirs\nafter\n', { expectedSnapshot: 'snapshot', action: 'result' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith('success', 'file.txt resolved and staged');
  });
  it('preserves CRLF when saving normalized editor content', async () => {
    await open(conflict({ lineEnding: '\r\n' })); click(/^Current$/); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.api.resolveConflictFile).toHaveBeenCalled());
    expect(mocks.api.resolveConflictFile.mock.calls[0][1]).toBe('before\r\nours\r\nafter\r\n');
  });
  it('prevents duplicate saves, locks the actual editor, and disables closing while saving', async () => {
    const save = deferred<{ ok: boolean }>(); mocks.api.resolveConflictFile.mockReturnValueOnce(save.promise);
    await open(); click(/^Incoming$/); click(/^Apply & Mark Resolved$/);
    expect(screen.getByLabelText('Saving merge result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const before = view().state.doc.toString();
    act(() => view().dispatch({ changes: { from: 0, insert: 'bad' } }));
    expect(view().state.doc.toString()).toBe(before);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => save.resolve({ ok: true }));
    expect(mocks.api.resolveConflictFile).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: false, error: 'Snapshot changed' }, { ok: false }])('keeps drafts and reports refused writes: %j', async result => {
    mocks.api.resolveConflictFile.mockResolvedValueOnce(result);
    await open(); click(/^Incoming$/); click(/^Apply & Mark Resolved$/);
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent(result.error || 'could not be saved');
    expect(mocks.close).not.toHaveBeenCalled(); expect(view().state.doc.toString()).toContain('theirs');
    vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(within(alert).getByRole('button', { name: 'Reload file' }));
    expect(mocks.api.getConflictFile).toHaveBeenCalledTimes(1);
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload file' }));
    await waitFor(() => expect(mocks.api.getConflictFile).toHaveBeenCalledTimes(2));
  });
  it('opens the next remaining conflict after a successful apply', async () => {
    setState({ operationState: { inMerge: true, conflictedFiles: ['file.txt', 'next.txt'] } });
    mocks.api.getRepoOperationState.mockResolvedValue({ conflictedFiles: ['next.txt'] });
    await open(); click(/^Current$/); click('Apply & Next File');
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith('next.txt'));
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it.each([true, false])('continues an operation after the final conflict; runAndRefresh returns %s', async continued => {
    mocks.run.mockImplementation(async fn => { await fn(); return continued; });
    await open(); click(/^Current$/); click('Apply & Continue Merge');
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
    expect(mocks.api.continueOperation).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledWith(expect.any(Function), 'Merge continued');
  });
  it('ignores save completion when the active repository changes', async () => {
    const save = deferred<{ ok: boolean }>(); mocks.api.resolveConflictFile.mockReturnValueOnce(save.promise);
    await open(); click(/^Incoming$/); click(/^Apply & Mark Resolved$/);
    act(() => setState({ activeTab: '/different', conflictedFileToResolve: null }));
    await act(async () => save.resolve({ ok: true }));
    expect(mocks.api.getRepoOperationState).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it('stops continuation if the repository changes while loading the next operation state', async () => {
    const operation = deferred<{ conflictedFiles: string[] }>(); mocks.api.getRepoOperationState.mockReturnValueOnce(operation.promise);
    await open(); click(/^Current$/); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.api.getRepoOperationState).toHaveBeenCalledOnce());
    act(() => setState({ activeTab: '/different', conflictedFileToResolve: null }));
    await act(async () => operation.resolve({ conflictedFiles: [] }));
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  });
  it('stops continuation if the repository changes during refresh', async () => {
    const refresh = deferred<void>(); mocks.refresh.mockReturnValueOnce(refresh.promise);
    await open(); click(/^Current$/); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    act(() => setState({ activeTab: '/different', conflictedFileToResolve: null }));
    await act(async () => refresh.resolve());
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  });
  it('uses rebase and cherry-pick operation names and keeps operation errors visible', async () => {
    setState({ operationState: { inRebase: true, conflictedFiles: ['file.txt'] } }); await open();
    expect(screen.getByText(/Rebase: Current is/)).toBeInTheDocument(); click(/^Current$/);
    mocks.api.resolveConflictFile.mockRejectedValueOnce('write unavailable'); click('Apply & Continue Rebase');
    expect(await screen.findByRole('alert')).toHaveTextContent('write unavailable');
    act(() => setState({ operationState: { inCherryPick: true, conflictedFiles: ['file.txt'] } }));
    expect(screen.getByRole('button', { name: 'Apply & Continue Cherry-Pick' })).toBeInTheDocument();
  });
});

describe('whole-file conflicts and deletion choices', () => {
  it.each(['binary', 'symlink'] as const)('resolves %s files only after an explicit side choice', async kind => {
    await open(conflict({ kind, totalConflicts: 0, sections: [], currentContent: 'ours-target', incomingContent: 'incoming-target' }));
    expect(applyButton()).toBeDisabled();
    click(/^Incoming/); expect(applyButton()).toBeEnabled(); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.api.resolveConflictFile).toHaveBeenCalled());
    expect(mocks.api.resolveConflictFile.mock.calls[0][2]).toEqual({ expectedSnapshot: 'snapshot', action: 'incoming' });
  });
  it('requires external resolution for a submodule conflict', async () => {
    await open(conflict({ kind: 'submodule', totalConflicts: 0, sections: [] }));
    expect(screen.getByText(/Resolve the submodule/)).toBeInTheDocument();
    expect(applyButton()).toBeDisabled(); expect(screen.queryByRole('button', { name: /^Incoming/ })).not.toBeInTheDocument();
  });
  it('supports deletion as a whole-file text resolution and undo', async () => {
    await open(conflict({ rawContent: 'theirs', sections: [], totalConflicts: 0, currentContent: null, incomingContent: 'theirs', baseContent: null }));
    click('Use deletion'); expect(screen.getByText('This file will be deleted')).toBeInTheDocument(); expect(applyButton()).toBeEnabled();
    click('Undo deletion'); expect(screen.queryByText('This file will be deleted')).not.toBeInTheDocument(); expect(applyButton()).toBeDisabled();
    click('Keep deletion'); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.api.resolveConflictFile).toHaveBeenCalled());
    expect(mocks.api.resolveConflictFile.mock.calls[0][2].action).toBe('delete');
  });
  it('supports an explicit binary file deletion', async () => {
    await open(conflict({ kind: 'binary', sections: [], totalConflicts: 0, currentContent: null }));
    expect(screen.getByText('Deleted on this side')).toBeInTheDocument(); click('Keep deletion');
    expect(screen.getByText('Selected: delete file')).toBeInTheDocument(); click(/^Apply & Mark Resolved$/);
    await waitFor(() => expect(mocks.api.resolveConflictFile).toHaveBeenCalled()); expect(mocks.api.resolveConflictFile.mock.calls[0][2].action).toBe('delete');
  });
  it('uses custom unmarked-file warnings and a deleted incoming whole-file choice', async () => {
    await open(conflict({ rawContent: 'ours', sections: [], totalConflicts: 0, currentContent: 'ours', incomingContent: null, parseWarning: 'Custom parse warning' }));
    expect(screen.getByText('Custom parse warning')).toBeInTheDocument(); click(/^Incoming$/);
    expect(screen.getByText('This file will be deleted')).toBeInTheDocument(); expect(applyButton()).toBeEnabled();
  });
});

describe('remembered resolution review', () => {
  it('previews and loads remembered text only after explicit review, without writing disk', async () => {
    mocks.api.getResolutionSuggestion.mockResolvedValue({ snapshot: 'snapshot', enabled: true, content: 'remembered\r\n' });
    await open(); fireEvent.click(await screen.findByRole('button', { name: 'Preview remembered result' }));
    const preview = screen.getByRole('dialog', { name: 'Preview remembered resolution' });
    expect(within(preview).getByText('remembered')).toBeInTheDocument();
    fireEvent.click(within(preview).getByRole('button', { name: 'Use reviewed result' }));
    expect(view().state.doc.toString()).toBe('remembered\n'); expect(applyButton()).toBeEnabled();
    expect(mocks.api.resolveConflictFile).not.toHaveBeenCalled();
    click('Undo merge edit'); expect(view().state.doc.toString()).toContain('ancestor');
  });
  it('rejects stale remembered snapshots and displays provider failures', async () => {
    mocks.api.getResolutionSuggestion.mockResolvedValue({ snapshot: 'old', enabled: true, content: 'stale' });
    await open(); expect(await screen.findByText('The conflict changed. Reload before using a remembered result.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview remembered result' })).not.toBeInTheDocument();
  });
  it('requires confirmation before overwriting a dirty result with remembered text', async () => {
    mocks.api.getResolutionSuggestion.mockResolvedValue({ snapshot: 'snapshot', enabled: true, content: 'remembered' });
    await open(); await screen.findByRole('button', { name: 'Preview remembered result' });
    click(/^Current$/); click('Preview remembered result'); vi.mocked(window.confirm).mockReturnValueOnce(false);
    click('Use reviewed result'); expect(view().state.doc.toString()).toContain('ours');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Preview remembered resolution' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Preview remembered resolution' })).not.toBeInTheDocument(); expect(mocks.close).not.toHaveBeenCalled();
  });
  it('forgets a suggestion only after confirmation and exposes memory settings', async () => {
    mocks.api.getResolutionSuggestion.mockResolvedValue({ snapshot: 'snapshot', enabled: true, content: 'remembered' });
    await open(); await screen.findByRole('button', { name: 'Forget this resolution' });
    vi.mocked(window.confirm).mockReturnValueOnce(false); click('Forget this resolution'); expect(mocks.api.forgetResolution).not.toHaveBeenCalled();
    click('Forget this resolution'); await waitFor(() => expect(screen.queryByRole('button', { name: 'Preview remembered result' })).not.toBeInTheDocument());
    expect(mocks.api.forgetResolution).toHaveBeenCalledWith('file.txt'); click('Memory settings'); expect(mocks.state.resolutionMemoryOpen).toBe(true);
  });
  it('reports suggestion lookup and forgetting failures without changing the result', async () => {
    mocks.api.getResolutionSuggestion.mockRejectedValueOnce(new Error('memory unavailable'));
    await open(); expect(await screen.findByText('memory unavailable')).toBeInTheDocument();
    act(() => setState({ resolutionMemoryOpen: true }));
    mocks.api.getResolutionSuggestion.mockResolvedValueOnce({ snapshot: 'snapshot', enabled: true, content: 'remembered' });
    act(() => setState({ resolutionMemoryOpen: false })); await screen.findByRole('button', { name: 'Preview remembered result' });
    mocks.api.forgetResolution.mockRejectedValueOnce('forget denied'); click('Forget this resolution');
    expect(await screen.findByText('forget denied')).toBeInTheDocument(); expect(view().state.doc.toString()).toContain('ancestor');
    click('Preview remembered result'); fireEvent.click(screen.getByTitle('Close preview'));
    expect(screen.queryByRole('dialog', { name: 'Preview remembered resolution' })).not.toBeInTheDocument();
  });
});
