import { describe, expect, it } from 'vitest';
import { ChangeSet, EditorState } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { parseConflictSections } from '../../src/shared/conflicts';
import type { ConflictFileParsed } from '../../src/shared/types';
import {
  blockText, choiceLabels, createMergeModel, mapRegion, mergeFileAction, mergeHistory,
  mergeRegions, normalizeLines, setMergeFileAction, setMergeRegions, type MergeRegion
} from '../../src/renderer/components/ConflictResolver/mergeModel';

function file(rawContent: string, options: Partial<ConflictFileParsed> = {}): ConflictFileParsed {
  const sections = parseConflictSections(rawContent);
  return {
    filePath: 'file.txt', rawContent, sections, totalConflicts: sections.filter(s => s.type === 'conflict').length,
    currentContent: '', incomingContent: '', baseContent: null,
    currentLabel: 'ours', incomingLabel: 'theirs', kind: 'text', lineEnding: '\n', snapshot: 'snapshot',
    workingTreeExists: true, ...options
  };
}
const markers = (current: string, incoming: string, base?: string) => `<<<<<<< ours\n${current}${base === undefined ? '' : `||||||| base\n${base}`}=======\n${incoming}>>>>>>> theirs`;
const region = (overrides: Partial<MergeRegion> = {}): MergeRegion => ({ id: 'one', from: 2, to: 5, choice: 'current', edited: false, ...overrides });

describe('merge text construction', () => {
  it('normalizes CRLF while preserving other whitespace and terminal newlines', () => {
    expect(normalizeLines('a\r\nb\r\n')).toBe('a\nb\n');
    expect(blockText([], true)).toBe('');
    expect(blockText(['one', 'two'], true)).toBe('one\ntwo\n');
    expect(blockText(['one'], false)).toBe('one');
  });
  it('creates whole-file models for binary or unmarked conflicts and keeps existing working content', () => {
    const model = createMergeModel(file('manual\r\n', { currentContent: 'ours\r\n', incomingContent: 'theirs\r\n', baseContent: 'base\r\n' }));
    expect(model.result).toBe('manual\n');
    expect(model.current).toBe('ours\n');
    expect(model.blocks[0]).toMatchObject({ id: 'whole-file', initial: 'manual\n', base: 'base\n', currentFrom: 0, currentTo: 5, incomingFrom: 0, incomingTo: 7 });
    expect(model.regions).toEqual([region({ id: 'whole-file', from: 0, to: 7, choice: null })]);
  });
  it('uses current or incoming content when a working file is deleted', () => {
    expect(createMergeModel(file('', { workingTreeExists: false, currentContent: 'ours', incomingContent: 'theirs' })).result).toBe('ours');
    const missingCurrent = createMergeModel(file('', { workingTreeExists: false, currentContent: null, incomingContent: 'theirs' }));
    expect(missingCurrent.result).toBe('theirs');
    expect(missingCurrent.blocks[0].base).toBeUndefined();
    expect(createMergeModel(file('', { workingTreeExists: false, currentContent: null, incomingContent: null })).result).toBe('');
  });
  it('removes marker ranges, initializes with base, and preserves surrounding text', () => {
    const raw = `before\n${markers('ours\n', 'theirs\n', 'ancestor\n')}\nafter\n`;
    const model = createMergeModel(file(raw, { currentContent: 'before\nours\nafter\n', incomingContent: 'before\ntheirs\nafter\n', baseContent: 'before\nancestor\nafter\n' }));
    expect(model.result).toBe('before\nancestor\nafter\n');
    expect(model.blocks[0]).toMatchObject({ initial: 'ancestor\n', current: 'ours\n', incoming: 'theirs\n', base: 'ancestor\n', currentFrom: 7, currentTo: 12, incomingFrom: 7, incomingTo: 14 });
    expect(model.regions[0]).toEqual(region({ id: 'conflict-1-1', from: 7, to: 16, choice: null }));
  });
  it('initializes ordinary conflicts with current and preserves final source newline rules', () => {
    const raw = markers('ours\n', 'theirs\n') + '\n';
    const model = createMergeModel(file(raw, { currentContent: 'ours', incomingContent: 'theirs\n' }));
    expect(model.result).toBe('ours');
    expect(model.blocks[0]).toMatchObject({ current: 'ours', incoming: 'theirs\n', base: undefined });
    const withoutNewline = createMergeModel(file(markers('ours\n', 'theirs\n', 'base\n'), { currentContent: 'ours\n', incomingContent: 'theirs\n', baseContent: 'base\n' }));
    expect(withoutNewline.result).toBe('base');
  });
  it('handles multiple regions without confusing repeated lines in source panes', () => {
    const raw = `start\n${markers('same\n', 'first\n')}\nbetween\n${markers('same\n', 'second\n')}\nend\n`;
    const model = createMergeModel(file(raw, { currentContent: 'start\nsame\nbetween\nsame\nend\n', incomingContent: 'start\nfirst\nbetween\nsecond\nend\n' }));
    expect(model.result).toBe('start\nsame\nbetween\nsame\nend\n');
    expect(model.blocks.map(b => b.currentFrom)).toEqual([6, 19]);
    expect(model.blocks.map(b => b.incomingFrom)).toEqual([6, 20]);
    expect(model.regions).toHaveLength(2);
    expect(model.regions.every(r => model.result.slice(r.from, r.to) === 'same\n')).toBe(true);
  });
  it('locates empty sides using the preceding context anchor', () => {
    const raw = `keep\n${markers('', 'new\n')}\nend`;
    const model = createMergeModel(file(raw, { currentContent: 'keep\nend', incomingContent: 'keep\nnew\nend' }));
    expect(model.result).toBe('keep\nend');
    expect(model.blocks[0]).toMatchObject({ current: '', currentFrom: 5, currentTo: 5 });
    expect(model.regions[0].from).toBe(model.regions[0].to);
  });
  it('falls back from missing context to available matching source text', () => {
    const raw = `missing\n${markers('ours\n', 'theirs\n')}\nend`;
    const model = createMergeModel(file(raw, { currentContent: 'ours', incomingContent: 'theirs' }));
    expect(model.blocks[0]).toMatchObject({ currentFrom: 0, currentTo: 4, incomingFrom: 0, incomingTo: 6 });
  });
  it('searches before an anchor when the corresponding text is absent after it', () => {
    const raw = `after\n${markers('ours\n', 'theirs\n')}\nend`;
    const model = createMergeModel(file(raw, { currentContent: 'ours\nafter\n', incomingContent: 'theirs\nafter\n' }));
    expect(model.blocks[0]).toMatchObject({ currentFrom: 0, currentTo: 5, incomingFrom: 0, incomingTo: 7 });
  });
  it('finds shorter context anchors and uses bounded fallback positions when content is unavailable', () => {
    const raw = `one\ntwo\nthree\nfour\nfive\nsix\nseven\n${markers('not present\n', '')}\nend`;
    const model = createMergeModel(file(raw, { currentContent: 'seven\n', incomingContent: 'unrelated' }));
    expect(model.blocks[0]).toMatchObject({ currentFrom: 6, currentTo: 6, incomingFrom: 9, incomingTo: 9 });
    const empty = createMergeModel(file(markers('', '') + '\n', { currentContent: '', incomingContent: '', baseContent: '' }));
    expect(empty.blocks[0]).toMatchObject({ currentFrom: 0, currentTo: 0, incomingFrom: 0, incomingTo: 0 });
  });
  it('handles blank-line sides when no source line can be located', () => {
    const model = createMergeModel(file(markers('\n', '\n') + '\ntail', { currentContent: 'a', incomingContent: 'b' }));
    expect(model.blocks[0]).toMatchObject({ current: '\n', incoming: '\n', currentFrom: 0, currentTo: 0 });
  });
  it('omits a final base newline when the ancestor source has none or is absent', () => {
    const raw = markers('ours\n', 'theirs\n', 'base\n') + '\n';
    for (const baseContent of ['base', null]) {
      expect(createMergeModel(file(raw, { currentContent: 'ours\n', incomingContent: 'theirs\n', baseContent })).result).toBe('base');
    }
  });
  it('exposes a human label for every available resolution choice', () => {
    expect(choiceLabels).toEqual({ current: 'Current', incoming: 'Incoming', both: 'Both · current first', 'incoming-first': 'Both · incoming first', base: 'Base', manual: 'Manual' });
  });
});

describe('merge editor state and undo', () => {
  function initial(regions = [region()]) {
    return EditorState.create({ doc: '0123456789', extensions: [mergeRegions, mergeFileAction, mergeHistory, history()] })
      .update({ effects: setMergeRegions.of(regions) }).state;
  }
  it('maps region boundaries with replacement association and never reverses the range', () => {
    const changes = ChangeSet.of({ from: 2, to: 5, insert: 'xy' }, 10);
    expect(mapRegion(region(), changes)).toMatchObject({ from: 2, to: 4 });
    expect(mapRegion(region(), changes, true)).toMatchObject({ from: 2, to: 4 });
    const insertion = ChangeSet.of({ from: 2, insert: 'xy' }, 10);
    expect(mapRegion(region(), insertion)).toMatchObject({ from: 4, to: 7 });
    expect(mapRegion(region(), insertion, true)).toMatchObject({ from: 2, to: 7 });
    const effect = setMergeRegions.of([region()]).map(changes);
    expect(effect?.value).toEqual([mapRegion(region(), changes)]);
  });
  it('defaults to empty regions and the result action', () => {
    const state = EditorState.create({ extensions: [mergeRegions, mergeFileAction] });
    expect(state.field(mergeRegions)).toEqual([]);
    expect(state.field(mergeFileAction)).toBe('result');
  });
  it('retains resolution decisions for edits outside the region while shifting coordinates', () => {
    const before = initial();
    const after = before.update({ changes: { from: 0, insert: 'x' } }).state;
    expect(after.field(mergeRegions)).toEqual([region({ from: 3, to: 6 })]);
    expect(after.update({ selection: { anchor: 0 } }).state.field(mergeRegions)).toEqual(after.field(mergeRegions));
  });
  it.each([
    { from: 3, to: 4, insert: 'x' },
    { from: 2, insert: 'x' },
    { from: 5, insert: 'x' },
    { from: 0, to: 9, insert: 'x' }
  ])('marks changed/conflicting region as edited and unresolved: %j', changes => {
    const after = initial().update({ changes }).state;
    expect(after.field(mergeRegions)[0]).toMatchObject({ choice: null, edited: true });
  });
  it('invalidates empty deletion regions when an edit covers their point', () => {
    const after = initial([region({ from: 4, to: 4 })]).update({ changes: { from: 3, to: 6, insert: '' } }).state;
    expect(after.field(mergeRegions)[0]).toMatchObject({ choice: null, edited: true, from: 3, to: 3 });
  });
  it.each([{ from: 0, to: 1 }, { from: 7, to: 8 }])('preserves an empty region when edits are entirely elsewhere: %j', changes => {
    const after = initial([region({ from: 4, to: 4 })]).update({ changes }).state;
    expect(after.field(mergeRegions)[0]).toMatchObject({ choice: 'current', edited: false });
  });
  it('applies explicit state effects after document mapping and resets delete on an edit', () => {
    const before = initial().update({ effects: setMergeFileAction.of('delete') }).state;
    expect(before.field(mergeFileAction)).toBe('delete');
    expect(before.update({ selection: { anchor: 3 } }).state.field(mergeFileAction)).toBe('delete');
    const replacement = region({ choice: 'incoming' });
    const after = before.update({ changes: { from: 3, insert: 'x' }, effects: setMergeRegions.of([replacement]) }).state;
    expect(after.field(mergeRegions)).toEqual([replacement]);
    expect(after.field(mergeFileAction)).toBe('result');
    expect(before.update({ changes: { from: 3, insert: 'x' }, effects: setMergeFileAction.of('delete') }).state.field(mergeFileAction)).toBe('delete');
  });
  it('undoes and redoes text together with resolution decisions and file action', () => {
    let state = initial();
    state = state.update({ effects: [setMergeRegions.of([region({ choice: 'manual', edited: true })]), setMergeFileAction.of('delete')] }).state;
    const dispatch = (transaction: { state: EditorState }) => { state = transaction.state; };
    expect(undo({ state, dispatch })).toBe(true);
    expect(state.field(mergeRegions)).toEqual([region()]);
    expect(state.field(mergeFileAction)).toBe('result');
    expect(redo({ state, dispatch })).toBe(true);
    expect(state.field(mergeRegions)[0].choice).toBe('manual');
    expect(state.field(mergeFileAction)).toBe('delete');
    state = state.update({ changes: { from: 3, insert: 'new' } }).state;
    expect(state.field(mergeRegions)[0].choice).toBeNull();
    expect(undo({ state, dispatch })).toBe(true);
    expect(state.doc.toString()).toBe('0123456789');
    expect(state.field(mergeRegions)[0].choice).toBe('manual');
    expect(state.field(mergeFileAction)).toBe('delete');
  });
});
