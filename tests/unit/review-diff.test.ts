import { describe, expect, it } from 'vitest';
import { reviewDiffLines } from '../../src/shared/review-diff';

describe('reviewDiffLines', () => {
  it('assigns displayed old and new coordinates independently across hunks', () => {
    expect(reviewDiffLines('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -2,3 +7,3 @@ name\n same\n-old\n+new\n\\ No newline at end of file\n@@ -20 +30 @@\n+insert\n-remove\n end')).toEqual([
      { text: 'diff --git a/x b/x', kind: 'meta', oldNo: null, newNo: null },
      { text: '--- a/x', kind: 'meta', oldNo: null, newNo: null },
      { text: '+++ b/x', kind: 'meta', oldNo: null, newNo: null },
      { text: '@@ -2,3 +7,3 @@ name', kind: 'hunk', oldNo: null, newNo: null },
      { text: ' same', kind: 'context', oldNo: 2, newNo: 7 },
      { text: '-old', kind: 'del', oldNo: 3, newNo: null },
      { text: '+new', kind: 'add', oldNo: null, newNo: 8 },
      { text: '\\ No newline at end of file', kind: 'meta', oldNo: null, newNo: null },
      { text: '@@ -20 +30 @@', kind: 'hunk', oldNo: null, newNo: null },
      { text: '+insert', kind: 'add', oldNo: null, newNo: 30 },
      { text: '-remove', kind: 'del', oldNo: 20, newNo: null },
      { text: ' end', kind: 'context', oldNo: 21, newNo: 31 }
    ]);
  });
  it('keeps empty text and malformed hunk headers as metadata', () => {
    expect(reviewDiffLines('')).toEqual([{ text: '', kind: 'meta', oldNo: null, newNo: null }]);
    expect(reviewDiffLines('@@ invalid\n+not a hunk\n-unmapped').every(line => line.kind === 'meta')).toBe(true);
  });
  it('handles zero-length hunks and blank context lines', () => {
    expect(reviewDiffLines('@@ -0,0 +1,1 @@\n+first\n \n')).toEqual([
      { text: '@@ -0,0 +1,1 @@', kind: 'hunk', oldNo: null, newNo: null },
      { text: '+first', kind: 'add', oldNo: null, newNo: 1 },
      { text: ' ', kind: 'context', oldNo: 0, newNo: 2 },
      { text: '', kind: 'meta', oldNo: null, newNo: null }
    ]);
  });
});
