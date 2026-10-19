import { describe, expect, it } from 'vitest';
import { hasConflictMarkers, parseConflictSections } from '../../src/shared/conflicts';

describe('parseConflictSections', () => {
  it('preserves plain text and normalizes CRLF offsets', () => {
    expect(parseConflictSections('a\r\nb\r\n')).toEqual([{ type: 'text', lines: ['a', 'b', ''] }]);
    expect(parseConflictSections('')).toEqual([{ type: 'text', lines: [''] }]);
  });

  it('extracts labeled conflict sections and exact normalized ranges', () => {
    const raw = 'before\r\n<<<<<<< HEAD\r\nours\r\n=======\r\ntheirs\r\n>>>>>>> feature\r\nafter\r\n';
    const sections = parseConflictSections(raw);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ type: 'text', lines: ['before'] });
    expect(sections[2]).toEqual({ type: 'text', lines: ['after', ''] });
    const conflict = sections[1].type === 'conflict' && sections[1].conflict;
    expect(conflict).toEqual({
      id: 'conflict-1-1', startLine: 2, endLine: 6,
      currentLabel: 'HEAD', incomingLabel: 'feature',
      currentLines: ['ours'], incomingLines: ['theirs'], baseLines: undefined,
      startOffset: 7, endOffset: raw.replace(/\r\n/g, '\n').indexOf('after'), hasTrailingNewline: true
    });
  });

  it('supports diff3 base sections, custom marker sizes, empty sides and no final newline', () => {
    expect(parseConflictSections('<<<<<<<<\n|||||||| base\nancestor\n========\n>>>>>>>>')[0]).toEqual({
      type: 'conflict', conflict: {
        id: 'conflict-1-0', startLine: 1, endLine: 5,
        currentLabel: 'Current', incomingLabel: 'Incoming',
        currentLines: [], baseLines: ['ancestor'], incomingLines: [],
        startOffset: 0, endOffset: 49, hasTrailingNewline: false
      }
    });
  });

  it('numbers adjacent conflicts and preserves unmatched marker-like content', () => {
    const raw = '<<<<<<<\nours\n=======\ntheirs\n>>>>>>>\n<<<<<<< \n|||||| shorter\n=======\n||||||| incoming text\n>>>>>>> \n';
    const sections = parseConflictSections(raw);
    const conflicts = sections.filter(s => s.type === 'conflict').map(s => s.conflict);
    expect(conflicts.map(c => c.id)).toEqual(['conflict-1-0', 'conflict-2-5']);
    expect(conflicts[1].currentLines).toEqual(['|||||| shorter']);
    expect(conflicts[1].incomingLines).toEqual(['||||||| incoming text']);
  });

  it.each([
    '<<<<<<< HEAD\nours',
    '<<<<<<< HEAD\nours\n=======\ntheirs',
    '<<<<<<< HEAD\nours\n>>>>>>> bad',
    'prefix\n<<<<<<< HEAD\nours\n========\ntheirs\n>>>>>>> feature'
  ])('rejects incomplete or mismatched markers: %s', raw => {
    expect(() => parseConflictSections(raw)).toThrow(/Incomplete conflict markers at line [12]/);
  });
});

describe('hasConflictMarkers', () => {
  it.each(['<<<<<<< HEAD', '>>>>>>> feature', '||||||| base', '<<<<<<<<', 'a\r\n<<<<<<<\r\nb'])('detects standalone markers: %s', text => {
    expect(hasConflictMarkers(text)).toBe(true);
  });
  it.each(['', '=======', '<<<<<< HEAD', 'prefix <<<<<<< HEAD', '<<<<<<<not-a-marker', 'x > y'])('does not flag ordinary content: %s', text => {
    expect(hasConflictMarkers(text)).toBe(false);
  });
});
