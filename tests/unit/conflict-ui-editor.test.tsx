// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { LanguageDescription } from '@codemirror/language';
import { MergeEditor, setActiveMergeRegion } from '../../src/renderer/components/ConflictResolver/MergeEditor';
import { setMergeRegions, type MergeRegion } from '../../src/renderer/components/ConflictResolver/mergeModel';

const regions: MergeRegion[] = [{ id: 'first', from: 0, to: 4, choice: null, edited: false }];
function fixture(side: 'current' | 'incoming' | 'result' | 'base' = 'result') {
  let current: EditorView | null = null;
  const onView = vi.fn((view: EditorView | null) => { current = view; });
  const props = { filePath: 'file.txt', value: 'one\ntwo', label: `Test ${side} editor`, side, initialRegions: regions, onView,
    onUpdate: vi.fn(), onChoose: vi.fn(), onSave: vi.fn(), onNavigate: vi.fn(), onScroll: vi.fn(), locked: false };
  const rendered = render(<MergeEditor {...props} />);
  return { props, rendered, view: () => current!, onView };
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 100, 20) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('MergeEditor real CodeMirror integration', () => {
  it('creates an editable result with conflict decorations and destroys it on unmount', () => {
    const editor = fixture();
    expect(editor.view().state.doc.toString()).toBe('one\ntwo');
    expect(editor.view().state.facet(EditorState.readOnly)).toBe(false);
    expect(editor.view().contentDOM).toHaveAttribute('contenteditable', 'true');
    expect(editor.view().dom.querySelector('.cm-merge-unresolved')).toHaveTextContent('one');
    act(() => editor.view().dispatch({ effects: setActiveMergeRegion.of('first') }));
    expect(editor.view().dom.querySelector('.cm-merge-selected')).toHaveTextContent('one');
    act(() => editor.view().dispatch({ changes: { from: 0, to: 3, insert: 'edited' } }));
    expect(editor.view().state.doc.toString()).toBe('edited\ntwo');
    expect(editor.props.onUpdate).toHaveBeenCalled();
    const old = editor.view(); editor.rendered.unmount();
    expect(editor.onView).toHaveBeenLastCalledWith(null); expect(old.dom.isConnected).toBe(false);
  });
  it.each(['current', 'incoming', 'base'] as const)('keeps the %s revision read-only and keyboard-focusable', side => {
    const editor = fixture(side);
    expect(editor.view().state.facet(EditorState.readOnly)).toBe(true);
    expect(editor.view().contentDOM).toHaveAttribute('contenteditable', 'false');
    expect(editor.view().contentDOM).toHaveAttribute('aria-readonly', 'true');
    expect(editor.view().contentDOM).toHaveAttribute('tabindex', '0');
    expect(editor.view().dom).toHaveClass(`cm-merge-${side}`);
  });
  it('blocks document edits while saving and uses the latest callback props without rebuilding the view', () => {
    const editor = fixture(); const original = editor.view();
    const onSave = vi.fn(), onNavigate = vi.fn(), onScroll = vi.fn();
    editor.rendered.rerender(<MergeEditor {...editor.props} locked onSave={onSave} onNavigate={onNavigate} onScroll={onScroll} />);
    expect(editor.view()).toBe(original);
    act(() => editor.view().dispatch({ changes: { from: 0, insert: 'blocked' } }));
    expect(editor.view().state.doc.toString()).toBe('one\ntwo');
    fireEvent.keyDown(editor.view().contentDOM, { key: 's', ctrlKey: true });
    fireEvent.keyDown(editor.view().contentDOM, { key: 'ArrowDown', altKey: true });
    fireEvent.keyDown(editor.view().contentDOM, { key: 'ArrowUp', altKey: true });
    fireEvent.scroll(editor.view().scrollDOM);
    expect(onSave).toHaveBeenCalledOnce(); expect(onNavigate.mock.calls).toEqual([[1], [-1]]);
    expect(onScroll).toHaveBeenCalledWith(original);
    editor.rendered.rerender(<MergeEditor {...editor.props} />);
    act(() => editor.view().dispatch({ changes: { from: 0, insert: 'allowed ' } }));
    expect(editor.view().state.doc.toString()).toBe('allowed one\ntwo');
  });
  it('handles optional callbacks, selected overlapping ranges, and fully resolved decorations', () => {
    const editor = fixture();
    editor.rendered.rerender(<MergeEditor {...editor.props} onSave={undefined} onNavigate={undefined} onScroll={undefined} onUpdate={undefined} />);
    fireEvent.keyDown(editor.view().contentDOM, { key: 's', ctrlKey: true });
    fireEvent.keyDown(editor.view().contentDOM, { key: 'ArrowDown', altKey: true });
    fireEvent.keyDown(editor.view().contentDOM, { key: 'ArrowUp', altKey: true });
    fireEvent.scroll(editor.view().scrollDOM);
    act(() => editor.view().dispatch({ effects: [setMergeRegions.of([
      { id: 'resolved', from: 0, to: 3, choice: 'current', edited: false },
      { id: 'overlap', from: 0, to: 7, choice: null, edited: false },
      { id: 'out-of-bounds', from: 100, to: 100, choice: 'manual', edited: false }
    ]), setActiveMergeRegion.of('overlap')] }));
    expect(editor.view().dom.querySelector('.cm-merge-unresolved.cm-merge-selected')).toBeInTheDocument();
    act(() => editor.view().dispatch({ effects: [setMergeRegions.of([{ ...regions[0], choice: 'manual' }]), setActiveMergeRegion.of(null)] }));
    expect(editor.view().dom.querySelector('.cm-merge-resolved')).toBeInTheDocument();
    expect(editor.view().dom.querySelector('.cm-merge-selected')).not.toBeInTheDocument();
  });
  it.each(['current', 'incoming'] as const)('offers an accessible %s-side gutter action for the active conflict', async side => {
    const editor = fixture(side);
    await waitFor(() => expect(editor.view().dom.querySelector('.cm-merge-accept')).not.toBeNull());
    const button = editor.view().dom.querySelector<HTMLButtonElement>('.cm-merge-accept')!;
    expect(button).toHaveAccessibleName(`Use ${side} changes for this conflict`);
    fireEvent.click(button); expect(editor.props.onChoose).toHaveBeenCalledWith('first', side);
    act(() => editor.view().dispatch({ effects: setMergeRegions.of([{ ...regions[0], choice: 'current' }]) }));
    expect(editor.view().dom.querySelector('.cm-merge-accept')).toBeInTheDocument();
  });
  it('loads syntax highlighting asynchronously and ignores a late language load after unmount', async () => {
    let resolve!: (extension: never[]) => void;
    const load = vi.fn().mockReturnValue(new Promise<never[]>(yes => { resolve = yes; }));
    vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValue({ load } as unknown as LanguageDescription);
    const editor = fixture();
    expect(load).toHaveBeenCalledOnce();
    await act(async () => resolve([]));
    expect(editor.view().state.doc.toString()).toBe('one\ntwo');
    let late!: (extension: never[]) => void;
    load.mockReturnValueOnce(new Promise<never[]>(yes => { late = yes; }));
    editor.rendered.rerender(<MergeEditor {...editor.props} filePath="other.txt" />);
    editor.rendered.unmount();
    await act(async () => late([]));
    expect(editor.onView).toHaveBeenLastCalledWith(null);
  });
  it('tolerates unsupported or failing language loaders', async () => {
    vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValue({ load: () => Promise.reject(new Error('language unavailable')) } as unknown as LanguageDescription);
    const editor = fixture();
    await act(async () => {});
    expect(editor.view().state.doc.toString()).toBe('one\ntwo');
  });
  it('supports empty filenames and source gutter actions with no choice callback', async () => {
    const editor = fixture('current');
    editor.rendered.rerender(<MergeEditor {...editor.props} filePath="" onChoose={undefined} />);
    await waitFor(() => expect(editor.view().dom.querySelector('.cm-merge-accept')).not.toBeNull());
    fireEvent.click(editor.view().dom.querySelector('.cm-merge-accept')!);
    expect(editor.props.onChoose).not.toHaveBeenCalled();
  });
});
