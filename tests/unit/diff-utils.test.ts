import { describe, expect, it } from 'vitest';
import { alignHunkLinesForSplit, computeInlineDiff } from '../../src/renderer/components/DiffViewer/diffUtils';
import type { DiffHunk, DiffLine } from '../../src/shared/types';

describe('computeInlineDiff', () => {
  it.each(['same', ''])('does not highlight unchanged text %j', text => {
    expect(computeInlineDiff(text, text)).toEqual({ oldParts: [{ text, isDiff: false }], newParts: [{ text, isDiff: false }] });
  });
  it('highlights only changed middle text with common prefix and suffix', () => {
    expect(computeInlineDiff('hello old world', 'hello new world')).toEqual({
      oldParts: [{ text: 'hello ', isDiff: false }, { text: 'old', isDiff: true }, { text: ' world', isDiff: false }],
      newParts: [{ text: 'hello ', isDiff: false }, { text: 'new', isDiff: true }, { text: ' world', isDiff: false }]
    });
  });
  it.each([['abc', 'xyz'], ['', 'new'], ['old', ''], ['prefix', 'prefix suffix'], ['start x', 'x'], ['aa', 'a']])('reconstructs %j → %j without overlap', (oldText, newText) => {
    const result = computeInlineDiff(oldText, newText);
    expect(result.oldParts.map(part => part.text).join('')).toBe(oldText);
    expect(result.newParts.map(part => part.text).join('')).toBe(newText);
    expect([...result.oldParts, ...result.newParts].some(part => part.isDiff)).toBe(true);
    expect([...result.oldParts, ...result.newParts].every(part => part.text.length > 0)).toBe(true);
  });
});

const line = (kind: DiffLine['kind'], content: string, oldNo: number | null, newNo: number | null): DiffLine => ({ kind, content, oldNo, newNo });
const hunk = (lines: DiffLine[]): DiffHunk => ({ header: '@@ -1 +1 @@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines });
describe('alignHunkLinesForSplit', () => {
  it('returns no rows for empty hunks', () => expect(alignHunkLinesForSplit(hunk([]))).toEqual([]));
  it('mirrors context lines with original line coordinates', () => {
    expect(alignHunkLinesForSplit(hunk([line('context', 'same', 4, 5)]))).toEqual([{
      hunkLineIndex: 0,
      left: { hunkLineIndex: 0, lineNo: 4, content: 'same', kind: 'context' },
      right: { hunkLineIndex: 0, lineNo: 5, content: 'same', kind: 'context' }
    }]);
  });
  it('pairs deletion/addition blocks and retains unmatched lines and original indices', () => {
    const rows = alignHunkLinesForSplit(hunk([
      line('del', 'old one', 1, null), line('del', 'old two', 2, null), line('add', 'new one', null, 1),
      line('context', 'middle', 3, 2), line('add', 'added', null, 3),
      line('context', 'end', 4, 4), line('del', 'removed', 5, null)
    ]));
    expect(rows).toHaveLength(6);
    expect(rows[0].hunkLineIndex).toBe(0);
    expect(rows[0].right?.hunkLineIndex).toBe(2);
    expect(rows[0].left?.inlineParts).toEqual([{ text: 'old', isDiff: true }, { text: ' one', isDiff: false }]);
    expect(rows[0].right?.inlineParts).toEqual([{ text: 'new', isDiff: true }, { text: ' one', isDiff: false }]);
    expect(rows[1].left?.content).toBe('old two');
    expect(rows[1].left?.inlineParts).toBeUndefined();
    expect(rows[1].right).toBeUndefined();
    expect(rows[3]).toEqual({ hunkLineIndex: 4, left: undefined, right: { hunkLineIndex: 4, lineNo: 3, content: 'added', kind: 'add', inlineParts: undefined } });
    expect(rows[5].right).toBeUndefined();
  });
});
