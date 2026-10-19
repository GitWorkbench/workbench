import React, { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter, keymap, type ViewUpdate } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';
import { mergeFileAction, mergeHistory, mergeRegions, type MergeRegion } from './mergeModel';

export const setActiveMergeRegion = StateEffect.define<string | null>();
const activeMergeRegion = StateField.define<string | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setActiveMergeRegion)) value = effect.value;
    return value;
  }
});

const conflictDecorations = EditorView.decorations.compute([mergeRegions, activeMergeRegion], state => {
  const active = state.field(activeMergeRegion);
  const lines = new Map<number, { active: boolean; unresolved: boolean }>();
  for (const region of state.field(mergeRegions)) {
    const from = state.doc.lineAt(Math.min(region.from, state.doc.length));
    const end = Math.min(region.to, state.doc.length);
    const to = state.doc.lineAt(end > region.from && state.doc.sliceString(end - 1, end) === '\n' ? end - 1 : end);
    for (let number = from.number; number <= to.number; number++) {
      const previous = lines.get(number);
      lines.set(number, { active: previous?.active || region.id === active, unresolved: previous?.unresolved || !region.choice });
    }
  }
  return Decoration.set([...lines].sort(([a], [b]) => a - b).map(([number, status]) =>
    Decoration.line({ class: `${status.unresolved ? 'cm-merge-unresolved' : 'cm-merge-resolved'}${status.active ? ' cm-merge-selected' : ''}` }).range(state.doc.line(number).from)
  ));
});

const mergeTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--font-size-code)', color: 'var(--color-fg)', backgroundColor: 'var(--color-base)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--color-accent)' },
  '.cm-line': { padding: '0 12px', userSelect: 'text' },
  '.cm-gutters': { color: 'var(--color-faint)', backgroundColor: 'var(--color-panel)', borderRight: '1px solid var(--color-edge)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px', minWidth: '36px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--color-panel3) 45%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)' },
  '.cm-merge-unresolved': { backgroundColor: 'color-mix(in srgb, var(--color-warn) 10%, transparent)' },
  '&.cm-merge-current .cm-merge-unresolved': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' },
  '&.cm-merge-incoming .cm-merge-unresolved': { backgroundColor: 'color-mix(in srgb, var(--color-add) 12%, transparent)' },
  '.cm-merge-resolved': { backgroundColor: 'color-mix(in srgb, var(--color-add) 7%, transparent)' },
  '.cm-merge-selected': { boxShadow: 'inset 3px 0 var(--color-warn)' },
  '.cm-merge-actions .cm-gutterElement': { padding: '0 3px', minWidth: '26px', display: 'flex', alignItems: 'center' },
  '.cm-merge-accept': { color: 'var(--color-accent)', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', lineHeight: '20px' },
  '.cm-merge-accept:hover': { backgroundColor: 'var(--color-panel3)' },
  '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--color-panel2)', color: 'var(--color-fg)', borderColor: 'var(--color-edge)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--color-warn) 25%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 35%, transparent)' }
});

const mergeHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--color-accent)' },
  { tag: [tags.string, tags.regexp], color: 'var(--color-add)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--color-warn)' },
  { tag: [tags.comment, tags.meta], color: 'var(--color-dim)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className, tags.tagName], color: 'var(--color-accent)' },
  { tag: [tags.function(tags.variableName), tags.attributeName], color: 'var(--color-warn)' }
]));

class AcceptMarker extends GutterMarker {
  constructor(readonly id: string, readonly side: 'current' | 'incoming', readonly choose: (id: string, side: 'current' | 'incoming') => void) { super(); }
  eq(other: AcceptMarker) { return this.id === other.id && this.side === other.side; }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-merge-accept';
    button.textContent = this.side === 'current' ? '→' : '←';
    button.title = `Use ${this.side} changes for this conflict`;
    button.setAttribute('aria-label', button.title);
    button.onclick = () => this.choose(this.id, this.side);
    return button;
  }
}

interface MergeEditorProps {
  filePath: string;
  value: string;
  label: string;
  side: 'current' | 'result' | 'incoming' | 'base';
  initialRegions: MergeRegion[];
  onView: (view: EditorView | null) => void;
  onUpdate?: (update: ViewUpdate) => void;
  onChoose?: (id: string, side: 'current' | 'incoming') => void;
  onScroll?: (view: EditorView) => void;
  onSave?: () => void;
  onNavigate?: (direction: number) => void;
  locked?: boolean;
}

export function MergeEditor(props: MergeEditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    if (!parent.current) return;
    const readOnly = props.side !== 'result';
    const language = new Compartment();
    const extensions: Extension[] = [basicSetup, mergeTheme, mergeHighlighting,
      EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorView.editorAttributes.of({ class: `cm-merge-${props.side}`, 'aria-label': props.label }),
      EditorView.contentAttributes.of({ 'aria-label': props.label, ...(readOnly ? { tabindex: '0', 'aria-readonly': 'true' } : {}) }),
      EditorState.tabSize.of(4), language.of([]),
      EditorState.transactionFilter.of(transaction => transaction.docChanged && callbacks.current.locked ? [] : transaction),
      Prec.highest(keymap.of([
        { key: 'Alt-ArrowUp', run: () => { callbacks.current.onNavigate?.(-1); return true; } },
        { key: 'Alt-ArrowDown', run: () => { callbacks.current.onNavigate?.(1); return true; } },
        { key: 'Mod-s', run: () => { callbacks.current.onSave?.(); return true; } }
      ])),
      mergeRegions.init(() => props.initialRegions), mergeFileAction, activeMergeRegion, conflictDecorations,
      EditorView.updateListener.of(update => callbacks.current.onUpdate?.(update)),
      EditorView.domEventHandlers({ scroll: (_event, view) => { callbacks.current.onScroll?.(view); return false; } })
    ];
    if (!readOnly) extensions.push(mergeHistory, Prec.highest(keymap.of([indentWithTab])));
    if (props.side === 'current' || props.side === 'incoming') {
      const side = props.side;
      extensions.push(gutter({
        class: 'cm-merge-actions', side: side === 'current' ? 'after' : 'before',
        lineMarker: (view, line) => {
          const candidates = view.state.field(mergeRegions).filter(r => view.state.doc.lineAt(Math.min(r.from, view.state.doc.length)).from === line.from);
          const region = candidates.find(r => r.id === view.state.field(activeMergeRegion)) ?? candidates.find(r => !r.choice) ?? candidates[0];
          return region ? new AcceptMarker(region.id, side, (id, choice) => callbacks.current.onChoose?.(id, choice)) : null;
        },
        lineMarkerChange: update => update.startState.field(mergeRegions) !== update.state.field(mergeRegions) || update.startState.field(activeMergeRegion) !== update.state.field(activeMergeRegion)
      }));
    }
    const view = new EditorView({ parent: parent.current, state: EditorState.create({ doc: props.value, extensions }) });
    callbacks.current.onView(view);
    let alive = true;
    const description = LanguageDescription.matchFilename(languages, props.filePath.split(/[\\/]/).pop() || props.filePath);
    description?.load().then(support => { if (alive) view.dispatch({ effects: language.reconfigure(support) }); }).catch(() => {});
    return () => { alive = false; callbacks.current.onView(null); view.destroy(); };
  }, [props.filePath, props.value, props.side, props.initialRegions]);
  return <div ref={parent} className="min-h-0 min-w-0 flex-1 overflow-hidden" />;
}
