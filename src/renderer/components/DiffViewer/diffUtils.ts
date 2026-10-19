import { DiffHunk, DiffLine } from '../../../shared/types';

export interface InlineDiffPart {
  text: string;
  isDiff: boolean;
}

/** Compute inline word/character diff using prefix and suffix matching */
export function computeInlineDiff(
  oldStr: string,
  newStr: string
): { oldParts: InlineDiffPart[]; newParts: InlineDiffPart[] } {
  if (oldStr === newStr) {
    return {
      oldParts: [{ text: oldStr, isDiff: false }],
      newParts: [{ text: newStr, isDiff: false }]
    };
  }

  // Find common prefix
  let prefixLen = 0;
  const maxPrefix = Math.min(oldStr.length, newStr.length);
  while (prefixLen < maxPrefix && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  const maxSuffix = Math.min(oldStr.length - prefixLen, newStr.length - prefixLen);
  while (
    suffixLen < maxSuffix &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldPrefix = oldStr.slice(0, prefixLen);
  const oldMid = oldStr.slice(prefixLen, oldStr.length - suffixLen);
  const oldSuffix = oldStr.slice(oldStr.length - suffixLen);

  const newPrefix = newStr.slice(0, prefixLen);
  const newMid = newStr.slice(prefixLen, newStr.length - suffixLen);
  const newSuffix = newStr.slice(newStr.length - suffixLen);

  const oldParts: InlineDiffPart[] = [];
  if (oldPrefix) oldParts.push({ text: oldPrefix, isDiff: false });
  if (oldMid) oldParts.push({ text: oldMid, isDiff: true });
  if (oldSuffix) oldParts.push({ text: oldSuffix, isDiff: false });

  const newParts: InlineDiffPart[] = [];
  if (newPrefix) newParts.push({ text: newPrefix, isDiff: false });
  if (newMid) newParts.push({ text: newMid, isDiff: true });
  if (newSuffix) newParts.push({ text: newSuffix, isDiff: false });

  return { oldParts, newParts };
}

export interface SplitRow {
  hunkLineIndex: number; // 0-based index within hunk lines
  left?: {
    hunkLineIndex: number;
    lineNo: number | null;
    content: string;
    kind: 'del' | 'context';
    inlineParts?: InlineDiffPart[];
  };
  right?: {
    hunkLineIndex: number;
    lineNo: number | null;
    content: string;
    kind: 'add' | 'context';
    inlineParts?: InlineDiffPart[];
  };
}

/** Align unified hunk lines into side-by-side rows */
export function alignHunkLinesForSplit(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  const lines = hunk.lines;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.kind === 'context') {
      rows.push({
        hunkLineIndex: i,
        left: { hunkLineIndex: i, lineNo: line.oldNo, content: line.content, kind: 'context' },
        right: { hunkLineIndex: i, lineNo: line.newNo, content: line.content, kind: 'context' }
      });
      i++;
    } else {
      // Collect contiguous block of deletions and additions
      const delLines: { line: DiffLine; index: number }[] = [];
      const addLines: { line: DiffLine; index: number }[] = [];

      while (i < lines.length && (lines[i].kind === 'del' || lines[i].kind === 'add')) {
        if (lines[i].kind === 'del') {
          delLines.push({ line: lines[i], index: i });
        } else {
          addLines.push({ line: lines[i], index: i });
        }
        i++;
      }

      const count = Math.max(delLines.length, addLines.length);
      for (let k = 0; k < count; k++) {
        const delItem = delLines[k];
        const addItem = addLines[k];

        let oldParts: InlineDiffPart[] | undefined;
        let newParts: InlineDiffPart[] | undefined;

        if (delItem && addItem) {
          const res = computeInlineDiff(delItem.line.content, addItem.line.content);
          oldParts = res.oldParts;
          newParts = res.newParts;
        }

        rows.push({
          hunkLineIndex: delItem ? delItem.index : addItem ? addItem.index : i - 1,
          left: delItem
            ? {
                hunkLineIndex: delItem.index,
                lineNo: delItem.line.oldNo,
                content: delItem.line.content,
                kind: 'del',
                inlineParts: oldParts
              }
            : undefined,
          right: addItem
            ? {
                hunkLineIndex: addItem.index,
                lineNo: addItem.line.newNo,
                content: addItem.line.content,
                kind: 'add',
                inlineParts: newParts
              }
            : undefined
        });
      }
    }
  }

  return rows;
}
