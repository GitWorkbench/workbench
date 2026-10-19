import type { ConflictFileParsed } from './types';

/** Offsets refer to LF-normalized text, as used by the merge editor. */
export function parseConflictSections(content: string): ConflictFileParsed['sections'] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const sections: ConflictFileParsed['sections'] = [];
  let text: string[] = [];
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const opening = /^(<{7,})(?:[ \t](.*))?$/.exec(lines[i]);
    if (!opening) {
      text.push(lines[i]);
      continue;
    }
    const start = i;
    const size = opening[1].length;
    const currentLines: string[] = [];
    const incomingLines: string[] = [];
    let baseLines: string[] | undefined;
    let side: 'current' | 'base' | 'incoming' = 'current';
    let incomingLabel = '';
    let closed = false;
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      if (side === 'current' && new RegExp(`^\\|{${size}}(?:[ \\t].*)?$`).test(line)) {
        baseLines = [];
        side = 'base';
      } else if (side !== 'incoming' && line === '='.repeat(size)) {
        side = 'incoming';
      } else if (side === 'incoming' && new RegExp(`^>{${size}}(?:[ \\t](.*))?$`).test(line)) {
        incomingLabel = line.slice(size).trim();
        closed = true;
        break;
      } else if (side === 'current') {
        currentLines.push(line);
      } else if (side === 'base') {
        baseLines!.push(line);
      } else {
        incomingLines.push(line);
      }
    }
    if (!closed) throw new Error(`Incomplete conflict markers at line ${start + 1}. Repair the markers in your editor and reopen this file.`);
    if (text.length) sections.push({ type: 'text', lines: text });
    text = [];
    sections.push({
      type: 'conflict',
      conflict: {
        id: `conflict-${++count}-${start}`,
        startLine: start + 1, endLine: i + 1,
        currentLabel: opening[2]?.trim() || 'Current',
        incomingLabel: incomingLabel || 'Incoming',
        currentLines, incomingLines, baseLines,
        startOffset: offsets[start],
        endOffset: offsets[i] + lines[i].length + (i < lines.length - 1 ? 1 : 0),
        hasTrailingNewline: i < lines.length - 1
      }
    });
  }
  if (text.length) sections.push({ type: 'text', lines: text });
  return sections;
}

export function hasConflictMarkers(content: string): boolean {
  return /^(?:<{7,}(?:[ \t].*)?|>{7,}(?:[ \t].*)?|\|{7,}(?:[ \t].*)?)\r?$/m.test(content);
}
