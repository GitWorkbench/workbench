import { StateEffect, StateField, type ChangeDesc } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import type { ConflictFileParsed, ConflictSection } from '../../../shared/types';

export type MergeChoice = 'current' | 'incoming' | 'both' | 'incoming-first' | 'base' | 'manual';
export type MergeRegion = { id: string; from: number; to: number; choice: MergeChoice | null; edited: boolean };
export type MergeBlock = {
  id: string;
  conflict: ConflictSection;
  initial: string;
  current: string;
  incoming: string;
  base?: string;
  currentFrom: number;
  currentTo: number;
  incomingFrom: number;
  incomingTo: number;
};

export const normalizeLines = (text: string) => text.replace(/\r\n/g, '\n');

export function blockText(lines: string[], trailingNewline: boolean): string {
  return lines.length ? lines.join('\n') + (trailingNewline ? '\n' : '') : '';
}

function sourceRange(source: string, text: string, cursor: number, fallbackLine: number, context: string): [number, number] {
  const contextLines = context.split('\n');
  if (contextLines[contextLines.length - 1] === '') contextLines.pop();
  let contextEnd: number | undefined;
  for (let count = Math.min(6, contextLines.length); count > 0; count--) {
    const anchor = contextLines.slice(-count).join('\n') + '\n';
    const position = source.indexOf(anchor, cursor);
    if (position >= 0) { contextEnd = position + anchor.length; break; }
  }
  if (text) {
    const index = source.indexOf(text, contextEnd ?? cursor);
    if (index >= 0) return [index, index + text.length];
    const withoutNewline = text.replace(/\n$/, '');
    const partial = withoutNewline ? source.indexOf(withoutNewline, contextEnd ?? cursor) : -1;
    if (partial >= 0) return [partial, partial + withoutNewline.length];
    const fallback = source.indexOf(text, cursor);
    if (fallback >= 0) return [fallback, fallback + text.length];
  }
  // Empty sides represent deleted lines. Their insertion point still needs a gutter control.
  if (contextEnd !== undefined) return [contextEnd, contextEnd];
  const lines = source.split('\n');
  const offset = lines.slice(0, Math.min(fallbackLine, lines.length)).reduce((sum, line) => sum + line.length + 1, 0);
  const from = Math.min(source.length, Math.max(cursor, offset));
  return [from, from];
}

export function createMergeModel(data: ConflictFileParsed): {
  result: string; current: string; incoming: string; blocks: MergeBlock[]; regions: MergeRegion[];
} {
  const raw = normalizeLines(data.rawContent);
  const current = normalizeLines(data.currentContent ?? '');
  const incoming = normalizeLines(data.incomingContent ?? '');
  const conflicts = data.sections.flatMap(section => section.type === 'conflict' ? [section.conflict] : []);
  if (!conflicts.length) {
    const result = data.workingTreeExists ? raw : current || incoming;
    const conflict: ConflictSection = {
      id: 'whole-file', startLine: 1, endLine: raw.split('\n').length,
      currentLabel: data.currentLabel, incomingLabel: data.incomingLabel,
      currentLines: current.split('\n'), incomingLines: incoming.split('\n'),
      startOffset: 0, endOffset: raw.length, hasTrailingNewline: false
    };
    return {
      result, current, incoming,
      blocks: [{ id: conflict.id, conflict, initial: result, current, incoming,
        base: data.baseContent === null ? undefined : normalizeLines(data.baseContent),
        currentFrom: 0, currentTo: current.length, incomingFrom: 0, incomingTo: incoming.length }],
      regions: [{ id: conflict.id, from: 0, to: result.length, choice: null, edited: false }]
    };
  }
  const blocks: MergeBlock[] = [];
  const regions: MergeRegion[] = [];
  let result = '';
  let last = 0;
  let currentCursor = 0;
  let incomingCursor = 0;
  for (const conflict of conflicts) {
    result += raw.slice(last, conflict.startOffset);
    const finalBlock = conflict.endOffset === raw.length;
    const currentText = blockText(conflict.currentLines, conflict.hasTrailingNewline && (!finalBlock || current.endsWith('\n')));
    const incomingText = blockText(conflict.incomingLines, conflict.hasTrailingNewline && (!finalBlock || incoming.endsWith('\n')));
    const base = conflict.baseLines === undefined ? undefined : blockText(conflict.baseLines, conflict.hasTrailingNewline && (!finalBlock || normalizeLines(data.baseContent ?? '').endsWith('\n')));
    const initial = base ?? currentText;
    const context = raw.slice(last, conflict.startOffset);
    const [currentFrom, currentTo] = sourceRange(current, currentText, currentCursor, result.split('\n').length - 1, context);
    const [incomingFrom, incomingTo] = sourceRange(incoming, incomingText, incomingCursor, result.split('\n').length - 1, context);
    currentCursor = currentTo;
    incomingCursor = incomingTo;
    blocks.push({ id: conflict.id, conflict, initial, current: currentText, incoming: incomingText, base,
      currentFrom, currentTo, incomingFrom, incomingTo });
    regions.push({ id: conflict.id, from: result.length, to: result.length + initial.length, choice: null, edited: false });
    result += initial;
    last = conflict.endOffset;
  }
  result += raw.slice(last);
  return { result, current, incoming, blocks, regions };
}

export function mapRegion(region: MergeRegion, changes: ChangeDesc, includeReplacement = false): MergeRegion {
  const from = changes.mapPos(region.from, includeReplacement ? -1 : 1);
  return { ...region, from, to: Math.max(from, changes.mapPos(region.to, includeReplacement ? 1 : -1)) };
}

export const setMergeRegions = StateEffect.define<MergeRegion[]>({
  map: (regions, changes) => regions.map(region => mapRegion(region, changes))
});

export const setMergeFileAction = StateEffect.define<'result' | 'delete'>();
export const mergeFileAction = StateField.define<'result' | 'delete'>({
  create: () => 'result',
  update(value, transaction) {
    if (transaction.docChanged) value = 'result';
    for (const effect of transaction.effects) if (effect.is(setMergeFileAction)) value = effect.value;
    return value;
  }
});

export const mergeRegions = StateField.define<MergeRegion[]>({
  create: () => [],
  update(regions, transaction) {
    let next = regions;
    if (transaction.docChanged) {
      next = regions.map(region => {
        let touched = false;
        transaction.changes.iterChangedRanges((from, to) => {
          if ((from < region.to && to > region.from) || (from === to && from >= region.from && from <= region.to) ||
              (region.from === region.to && from <= region.from && to >= region.to)) touched = true;
        });
        return { ...mapRegion(region, transaction.changes, touched), ...(touched ? { choice: null, edited: true } : {}) };
      });
    }
    for (const effect of transaction.effects) if (effect.is(setMergeRegions)) next = effect.value;
    return next;
  }
});

// Undo restores resolution decisions as well as text, including manual confirmations.
export const mergeHistory = invertedEffects.of(transaction =>
  transaction.docChanged || transaction.effects.some(effect => effect.is(setMergeRegions) || effect.is(setMergeFileAction))
    ? [setMergeRegions.of(transaction.startState.field(mergeRegions)), setMergeFileAction.of(transaction.startState.field(mergeFileAction))] : []
);

export const choiceLabels: Record<MergeChoice, string> = {
  current: 'Current', incoming: 'Incoming', both: 'Both · current first', 'incoming-first': 'Both · incoming first',
  base: 'Base', manual: 'Manual'
};
