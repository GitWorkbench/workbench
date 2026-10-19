import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp,
  FileText, GitMerge, Layers, Link2, Loader2, Pencil, Redo2, RotateCcw, Save, Trash2, Undo2, X
} from 'lucide-react';
import { EditorSelection, Transaction } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import type { ConflictFileParsed, ConflictResolutionOptions } from '../../../shared/types';
import { hasConflictMarkers } from '../../../shared/conflicts';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { MergeEditor, setActiveMergeRegion } from './MergeEditor';
import {
  choiceLabels, createMergeModel, mapRegion, mergeFileAction, mergeRegions, normalizeLines,
  setMergeFileAction, setMergeRegions, type MergeChoice, type MergeRegion
} from './mergeModel';

type Pane = 'current' | 'result' | 'incoming';
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function ConflictResolverModal() {
  const filePath = useApp(state => state.conflictedFileToResolve);
  const repository = useApp(state => state.activeTab);
  const close = useApp(state => state.closeConflictResolver);
  const [data, setData] = useState<ConflictFileParsed | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null);
    setError('');
    if (!filePath) return;
    let alive = true;
    api.getConflictFile(filePath).then(parsed => {
      if (alive) setData(parsed);
    }).catch(reason => { if (alive) setError(messageOf(reason)); });
    return () => { alive = false; };
  }, [filePath, repository, revision]);
  if (!filePath) return null;
  if (data && data.filePath === filePath) return <MergeWorkspace key={`${repository}:${filePath}:${revision}`} data={data} onReload={() => setRevision(value => value + 1)} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Resolve merge conflicts">
      <div className="w-full max-w-lg rounded-xl border border-edge bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><GitMerge size={17} />Resolve conflicts<button className="btn-icon ml-auto" onClick={close} aria-label="Close merge editor"><X size={16} /></button></div>
        <p className="mb-4 break-all font-mono text-xs text-dim">{filePath}</p>
        {error ? <><p className="select-text text-sm text-del">{error}</p><button className="btn mt-4 border border-edge" onClick={() => setRevision(value => value + 1)}><RotateCcw size={13} />Reload file</button></>
          : <div className="flex items-center gap-2 py-8 text-dim"><Loader2 size={20} className="animate-spin" />Loading file versions…</div>}
      </div>
    </div>
  );
}

function MergeWorkspace({ data, onReload }: { data: ConflictFileParsed; onReload: () => void }) {
  const close = useApp(state => state.closeConflictResolver);
  const openFile = useApp(state => state.openConflictResolver);
  const operation = useApp(state => state.operationState);
  const memorySettingsOpen = useApp(state => state.resolutionMemoryOpen);
  const notify = useApp(state => state.notify);
  const model = useMemo(() => createMergeModel(data), [data]);
  const initialSourceRegions = useMemo(() => ({
    current: model.blocks.map(block => ({ id: block.id, from: block.currentFrom, to: block.currentTo, choice: null, edited: false } as MergeRegion)),
    incoming: model.blocks.map(block => ({ id: block.id, from: block.incomingFrom, to: block.incomingTo, choice: null, edited: false } as MergeRegion)),
    base: [] as MergeRegion[]
  }), [model]);
  const views = useRef<Partial<Record<Pane | 'base', EditorView>>>({});
  const [regions, setRegions] = useState(model.regions);
  const [activeId, setActiveId] = useState(model.blocks[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });
  const [fileAction, setFileAction] = useState<'result' | 'delete'>('result');
  const [wholeChoice, setWholeChoice] = useState<ConflictResolutionOptions['action']>();
  const [showBase, setShowBase] = useState(false);
  const [linkedScroll, setLinkedScroll] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasMarkers, setHasMarkers] = useState(hasConflictMarkers(model.result));
  const [widths, setWidths] = useState([31, 38, 31]);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState('');
  const [previewSuggestion, setPreviewSuggestion] = useState(false);
  const paneContainer = useRef<HTMLDivElement>(null);
  const syncFrame = useRef<number | null>(null);
  const syncing = useRef(false);
  const busy = useRef(false);
  const isText = data.kind === 'text';
  const files = [...new Set([data.filePath, ...(operation?.conflictedFiles ?? [])])];
  const remaining = regions.filter(region => !region.choice).length;
  const active = regions.find(region => region.id === activeId) ?? regions[0];
  const activeBlock = model.blocks.find(block => block.id === active?.id);
  const operationName = operation?.inRebase ? 'Rebase' : operation?.inCherryPick ? 'Cherry-Pick' : operation?.inMerge ? 'Merge' : null;
  const canApply = !saving && (isText ? remaining === 0 && (!hasMarkers || fileAction === 'delete') : !!wholeChoice && data.kind !== 'submodule');

  useEffect(() => () => { if (syncFrame.current !== null) cancelAnimationFrame(syncFrame.current); }, []);

  useEffect(() => {
    if (!isText || memorySettingsOpen) return;
    let live = true;
    void api.getResolutionSuggestion(data.filePath).then(result => {
      if (!live) return;
      if (result.snapshot !== data.snapshot) { setMemoryError('The conflict changed. Reload before using a remembered result.'); return; }
      setMemoryEnabled(result.enabled);
      setSuggestion(result.content);
    }).catch(error => { if (live) setMemoryError(messageOf(error)); });
    return () => { live = false; };
  }, [data, isText, memorySettingsOpen]);

  const useRememberedResult = () => {
    const view = views.current.result;
    if (!view || suggestion === null || busy.current) return;
    if (dirty && !window.confirm('Replace your unapplied result with this reviewed suggestion? You can undo the replacement.')) return;
    const text = normalizeLines(suggestion);
    setShowBase(false);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text },
      effects: [setMergeRegions.of(model.regions.map((region, i) => ({ ...region, from: i ? text.length : 0, to: text.length, choice: 'manual' as const, edited: false }))), setMergeFileAction.of('result')],
      annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.merge')] });
    setPreviewSuggestion(false);
    view.focus();
  };

  // Source revisions stay immutable; resolution colors and the active conflict follow the result.
  useEffect(() => {
    for (const side of ['current', 'incoming'] as const) {
      const view = views.current[side];
      if (!view) continue;
      view.dispatch({ effects: [
        setMergeRegions.of(initialSourceRegions[side].map(region => ({ ...region, choice: regions.find(item => item.id === region.id)?.choice ?? null }))),
        setActiveMergeRegion.of(activeId)
      ], annotations: Transaction.addToHistory.of(false) });
    }
    const result = views.current.result;
    if (result) result.dispatch({ effects: setActiveMergeRegion.of(activeId), annotations: Transaction.addToHistory.of(false) });
  }, [regions, activeId, initialSourceRegions]);

  const readResult = (update: ViewUpdate) => {
    if (update.docChanged || update.startState.field(mergeRegions) !== update.state.field(mergeRegions) ||
        update.startState.field(mergeFileAction) !== update.state.field(mergeFileAction)) {
      const nextRegions = update.state.field(mergeRegions);
      const text = update.state.doc.toString();
      setRegions(nextRegions);
      setFileAction(update.state.field(mergeFileAction));
      setDirty(text !== model.result || nextRegions.some(region => region.choice !== null || region.edited));
      setHasMarkers(hasConflictMarkers(text));
      setHistoryDepth({ undo: undoDepth(update.state), redo: redoDepth(update.state) });
      setSaveError('');
    }
    if (update.selectionSet) {
      const position = update.state.selection.main.head;
      const selected = update.state.field(mergeRegions).find(region => position >= region.from && position <= region.to);
      if (selected) setActiveId(selected.id);
    }
  };

  const focusConflict = (id: string, focusResult = false) => {
    setActiveId(id);
    syncing.current = true;
    for (const side of ['current', 'result', 'incoming'] as const) {
      const view = views.current[side];
      const region = view?.state.field(mergeRegions).find(item => item.id === id);
      if (view && region) view.dispatch({
        effects: [setActiveMergeRegion.of(id), EditorView.scrollIntoView(region.from, { y: 'center' })],
        ...(focusResult && side === 'result' ? { selection: EditorSelection.cursor(region.from) } : {}),
        annotations: Transaction.addToHistory.of(false)
      });
    }
    if (focusResult) views.current.result?.focus();
    requestAnimationFrame(() => { requestAnimationFrame(() => { syncing.current = false; }); });
  };

  const moveConflict = (direction: number) => {
    const index = regions.findIndex(region => region.id === activeId);
    const next = regions[(index + direction + regions.length) % regions.length];
    if (next) focusConflict(next.id, true);
  };

  const choose = (ids: string[], choice: MergeChoice | 'reset') => {
    const view = views.current.result;
    if (!view || busy.current) return;
    setShowBase(false);
    const previous = view.state.field(mergeRegions);
    const targets = previous.filter(region => ids.includes(region.id));
    if (!targets.length) return;
    if (choice === 'manual') {
      view.dispatch({ effects: setMergeRegions.of(previous.map<MergeRegion>(region => ids.includes(region.id) ? { ...region, choice: 'manual', edited: true } : region)),
        annotations: isolateHistory.of('full') });
      const next = previous.find(region => !ids.includes(region.id) && !region.choice);
      focusConflict(next?.id ?? targets[0].id);
      return;
    }
    if (targets.some(target => previous.some(other => target.id !== other.id && target.from < other.to && target.to > other.from))) {
      setSaveError('Your edit spans multiple conflicts. Review the result and mark the remaining conflicts resolved, or undo that edit to use individual choices.');
      return;
    }
    const replacements = [...targets].sort((a, b) => a.from - b.from).map(region => {
      const block = model.blocks.find(item => item.id === region.id)!;
      let insert: string;
      if (choice === 'reset') insert = block.initial;
      else if (choice === 'both') insert = joinBoth(block.current, block.incoming);
      else if (choice === 'incoming-first') insert = joinBoth(block.incoming, block.current);
      else insert = choice === 'base' ? block.base ?? block.initial : block[choice];
      return { id: region.id, from: region.from, to: region.to, insert };
    });
    const changes = view.state.changes(replacements.map(({ id: _id, ...replacement }) => replacement));
    const positions = new Map<string, { from: number; to: number }>();
    let delta = 0;
    for (const replacement of replacements) {
      const from = replacement.from + delta;
      positions.set(replacement.id, { from, to: from + replacement.insert.length });
      delta += replacement.insert.length - (replacement.to - replacement.from);
    }
    const next = previous.map(region => {
      const position = positions.get(region.id);
      return position ? { ...region, ...position, choice: choice === 'reset' ? null : choice, edited: false }
        : mapRegion(region, changes);
    });
    const deletedSide = targets.length === 1 && targets[0].id === 'whole-file' &&
      ((choice === 'current' && data.currentContent === null) || (choice === 'incoming' && data.incomingContent === null));
    view.dispatch({ changes, effects: [setMergeRegions.of(next), setMergeFileAction.of(deletedSide ? 'delete' : 'result')],
      annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.merge')] });
    const unresolved = next.find(region => !region.choice && region.from >= next.find(item => item.id === targets[targets.length - 1].id)!.to) ?? next.find(region => !region.choice);
    focusConflict(unresolved?.id ?? targets[0].id);
  };

  const chooseWholeFile = (side: 'current' | 'incoming') => {
    if (!isText) { setWholeChoice(side); setDirty(true); return; }
    const view = views.current.result;
    if (!view || busy.current) return;
    setShowBase(false);
    const content = side === 'current' ? data.currentContent : data.incomingContent;
    const text = normalizeLines(content ?? '');
    // Whole-file choices are explicit and include that revision's non-conflicting content.
    const next = view.state.field(mergeRegions).map(region => {
      const block = model.blocks.find(item => item.id === region.id)!;
      return { ...region, from: side === 'current' ? block.currentFrom : block.incomingFrom,
        to: side === 'current' ? block.currentTo : block.incomingTo, choice: side, edited: false };
    });
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text },
      effects: [setMergeRegions.of(next), setMergeFileAction.of(content === null ? 'delete' : 'result')],
      annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.merge')] });
  };

  const deleteFile = () => {
    if (busy.current) return;
    if (!isText) { setWholeChoice('delete'); setDirty(true); return; }
    const view = views.current.result;
    if (!view) return;
    view.dispatch({ effects: [setMergeRegions.of(view.state.field(mergeRegions).map<MergeRegion>(region => ({ ...region, choice: 'manual', edited: false }))), setMergeFileAction.of('delete')],
      annotations: isolateHistory.of('full') });
  };

  const requestClose = () => {
    if (!busy.current && (!dirty || window.confirm('Discard your unapplied merge result? The conflicted file on disk will stay unchanged.'))) close();
  };

  const apply = async (continueAfter = false) => {
    if (busy.current) return;
    const result = views.current.result;
    if (isText && !result) return;
    const action = isText ? result?.state.field(mergeFileAction) ?? 'result' : wholeChoice;
    const text = result?.state.doc.toString() ?? '';
    if (!action || (isText && (result?.state.field(mergeRegions).some(region => !region.choice) || (action !== 'delete' && hasConflictMarkers(text))))) return;
    busy.current = true;
    setSaving(true);
    setSaveError('');
    const repository = useApp.getState().activeTab;
    try {
      const saved = await api.resolveConflictFile(data.filePath, data.lineEnding === '\r\n' ? text.replace(/\n/g, '\r\n') : text, { expectedSnapshot: data.snapshot, action });
      if (!saved.ok) throw new Error(saved.error || 'The merge result could not be saved.');
      if (useApp.getState().activeTab !== repository) return;
      const latest = await api.getRepoOperationState();
      if (useApp.getState().activeTab !== repository) return;
      await useApp.getState().refresh();
      if (useApp.getState().activeTab !== repository) return;
      const next = latest.conflictedFiles.find(file => file !== data.filePath);
      notify('success', `${data.filePath} resolved and staged`);
      if (continueAfter && !latest.conflictedFiles.length) {
        const continued = await useApp.getState().runAndRefresh(() => api.continueOperation(), `${operationName} continued`);
        if (!continued) {
          // The file is safely staged. Subsequent operation errors remain visible in the banner.
          close();
          return;
        }
      }
      if (next) openFile(next); else close();
    } catch (reason) {
      setSaveError(messageOf(reason));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const syncScroll = (source: EditorView) => {
    if (!linkedScroll || syncing.current || showBase || busy.current) return;
    if (syncFrame.current !== null) cancelAnimationFrame(syncFrame.current);
    syncFrame.current = requestAnimationFrame(() => {
      syncFrame.current = null;
      if (!Object.values(views.current).includes(source)) return;
      source.requestMeasure({
        read: () => {
          const top = source.lineBlockAtHeight(Math.max(0, source.scrollDOM.getBoundingClientRect().top - source.documentTop));
          const line = source.state.doc.lineAt(top.from).number;
          const sourceRegions = source.state.field(mergeRegions);
          return Object.values(views.current).filter((view): view is EditorView => !!view && view !== source).map(target => {
            const targetRegions = target.state.field(mergeRegions);
            const anchors = [{ source: 1, target: 1 }];
            for (const region of sourceRegions) {
              const other = targetRegions.find(item => item.id === region.id);
              if (!other) continue;
              anchors.push({ source: source.state.doc.lineAt(region.from).number, target: target.state.doc.lineAt(other.from).number });
              anchors.push({ source: source.state.doc.lineAt(region.to).number, target: target.state.doc.lineAt(other.to).number });
            }
            anchors.push({ source: source.state.doc.lines, target: target.state.doc.lines });
            anchors.sort((a, b) => a.source - b.source);
            let lower = anchors[0], upper = anchors[anchors.length - 1];
            for (const anchor of anchors) { if (anchor.source <= line) lower = anchor; else { upper = anchor; break; } }
            const fraction = upper.source === lower.source ? 0 : (line - lower.source) / (upper.source - lower.source);
            const number = Math.max(1, Math.min(target.state.doc.lines, Math.round(lower.target + fraction * (upper.target - lower.target))));
            return { target, top: target.lineBlockAt(target.state.doc.line(number).from).top };
          });
        },
        write: positions => {
          syncing.current = true;
          for (const { target, top } of positions) if (Object.values(views.current).includes(target)) target.scrollDOM.scrollTop = top;
          requestAnimationFrame(() => { requestAnimationFrame(() => { syncing.current = false; }); });
        }
      });
    });
  };

  const resizePane = (event: React.PointerEvent<HTMLDivElement>, divider: number) => {
    if (!paneContainer.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const width = paneContainer.current.getBoundingClientRect().width;
    const original = [...widths];
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - start) / width * 100;
      const total = original[divider] + original[divider + 1];
      const next = [...original];
      next[divider] = Math.max(18, Math.min(total - 18, original[divider] + delta));
      next[divider + 1] = total - next[divider];
      setWidths(next);
    };
    const element = event.currentTarget;
    const finish = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', finish); element.removeEventListener('pointercancel', finish); };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
  };

  const resetResult = () => {
    const view = views.current.result;
    if (!view || busy.current) return;
    setShowBase(false);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: model.result },
      effects: [setMergeRegions.of(model.regions), setMergeFileAction.of('result')], annotations: isolateHistory.of('full') });
    focusConflict(model.blocks[0].id);
  };

  const onView = (side: Pane | 'base', view: EditorView | null) => {
    if (!view) { delete views.current[side]; return; }
    views.current[side] = view;
    if (activeId) view.dispatch({ effects: setActiveMergeRegion.of(activeId), annotations: Transaction.addToHistory.of(false) });
    if (side === 'result') requestAnimationFrame(() => {
      if (views.current.result === view) { view.focus(); if (activeId) focusConflict(activeId); }
    });
  };

  const currentDeleted = data.currentContent === null;
  const incomingDeleted = data.incomingContent === null;
  const currentIndex = Math.max(0, regions.findIndex(region => region.id === activeId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-3" onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); requestClose(); }
      else if (!event.defaultPrevented && event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); event.stopPropagation(); moveConflict(event.key === 'ArrowDown' ? 1 : -1); }
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="merge-editor-title" className="relative flex h-[94vh] w-full max-w-[1800px] min-w-0 flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-edge bg-panel2 px-4 py-3">
          <GitMerge size={19} className="shrink-0 text-warn" />
          <div className="min-w-0 flex-1"><h2 id="merge-editor-title" className="text-sm font-semibold">Resolve conflicts</h2><p className="truncate font-mono text-xs text-dim" title={data.filePath}>{data.filePath}</p></div>
          {files.length > 1 && <select aria-label="Conflicted file" value={data.filePath} disabled={saving} className="max-w-[260px] text-xs" onChange={event => {
            if (!dirty || window.confirm('Discard your unapplied changes and open another conflicted file?')) openFile(event.target.value);
          }}>{files.map(file => <option key={file} value={file}>{file}</option>)}</select>}
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${isText && !remaining ? 'border-add/30 text-add' : 'border-warn/30 text-warn'}`}>
            {isText ? `${remaining} unresolved` : 'File conflict'}
          </span>
          <button className="btn-icon" onClick={requestClose} disabled={saving} aria-label="Close merge editor"><X size={17} /></button>
        </div>

        {operation?.inRebase && <div className="shrink-0 border-b border-edge bg-panel2/50 px-4 py-1.5 text-xs text-dim">Rebase: Current is the branch you are replaying onto. Incoming is the commit being replayed.</div>}

        {isText && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-3 py-2 text-xs"><span className="text-dim">{suggestion !== null ? 'A remembered resolution matches this conflict.' : memoryEnabled ? 'Conflict memory is on. Reviewed resolutions will be remembered.' : 'Remember text resolutions for repeated conflicts.'}</span>{suggestion !== null && <><button className="btn-secondary text-xs" disabled={saving} onClick={() => setPreviewSuggestion(true)}>Preview remembered result</button><button className="btn text-xs" disabled={saving} onClick={async () => { if (!window.confirm('Forget the saved resolution for this conflict?')) return; try { await api.forgetResolution(data.filePath); setSuggestion(null); } catch (e) { setMemoryError(messageOf(e)); } }}>Forget this resolution</button></>}<button className="btn text-xs ml-auto" disabled={saving} onClick={() => useApp.setState({ resolutionMemoryOpen: true })}>Memory settings</button>{memoryError && <span className="text-warn">{memoryError}</span>}</div>}

        {previewSuggestion && suggestion !== null && <div className="absolute inset-4 z-20 flex min-h-0 flex-col rounded-xl border border-edge bg-panel shadow-2xl" role="dialog" aria-label="Preview remembered resolution" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPreviewSuggestion(false); } }}><header className="flex items-center gap-3 border-b border-edge p-3"><h3 className="flex-1 text-sm font-semibold">Remembered resolution · {data.filePath}</h3><button className="btn-icon" title="Close preview" onClick={() => setPreviewSuggestion(false)}><X size={15} /></button></header><p className="p-3 text-xs text-dim">Review the complete suggested result below. Loading it changes only the editor draft; Apply still controls writing and staging.</p><pre className="code-surface selectable m-3 min-h-0 flex-1 overflow-auto rounded border border-edge bg-base p-3">{suggestion}</pre><footer className="flex justify-end gap-2 border-t border-edge p-3"><button className="btn-secondary text-xs" onClick={() => setPreviewSuggestion(false)}>Cancel</button><button className="btn-primary text-xs" onClick={useRememberedResult}>Use reviewed result</button></footer></div>}

        {isText ? <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-3 py-2 text-xs">
            <button className="btn-icon" onClick={() => moveConflict(-1)} disabled={saving || regions.length < 2} title="Previous conflict (Alt+Up)" aria-label="Previous conflict"><ChevronUp size={15} /></button>
            <button className="btn-icon" onClick={() => moveConflict(1)} disabled={saving || regions.length < 2} title="Next conflict (Alt+Down)" aria-label="Next conflict"><ChevronDown size={15} /></button>
            <span className="mr-2 text-dim">{data.totalConflicts ? `Conflict ${currentIndex + 1} of ${regions.length}` : 'Review file'}</span>
            <div className="h-5 w-px bg-edge" />
            <button className="btn" disabled={saving || showBase || !remaining} onClick={() => choose(regions.filter(region => !region.choice).map(region => region.id), 'current')} title="Use current changes for every remaining conflict"><ArrowRight size={13} />Use current for remaining</button>
            <button className="btn" disabled={saving || showBase || !remaining} onClick={() => choose(regions.filter(region => !region.choice).map(region => region.id), 'incoming')} title="Use incoming changes for every remaining conflict"><ArrowLeft size={13} />Use incoming for remaining</button>
            {regions.some(region => region.edited) && remaining > 0 && <button className="btn text-add" disabled={saving || showBase} onClick={() => choose(regions.filter(region => !region.choice).map(region => region.id), 'manual')} title="Confirm your manual edits for every remaining conflict"><Check size={13} />Mark remaining resolved</button>}
            <span className="flex-1" />
            <button className="btn-icon" onClick={() => { const view = views.current.result; if (view) undo(view); }} disabled={saving || !historyDepth.undo || showBase} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo merge edit"><Undo2 size={15} /></button>
            <button className="btn-icon" onClick={() => { const view = views.current.result; if (view) redo(view); }} disabled={saving || !historyDepth.redo || showBase} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo merge edit"><Redo2 size={15} /></button>
            <button className={`btn ${linkedScroll ? 'text-accent' : 'text-dim'}`} onClick={() => setLinkedScroll(value => !value)} aria-pressed={linkedScroll} title="Keep all three panes at corresponding lines"><Link2 size={13} />Linked scroll</button>
            {data.baseContent !== null && <button className={`btn ${showBase ? 'text-accent bg-panel3' : ''}`} onClick={() => setShowBase(value => !value)} aria-pressed={showBase}><Layers size={13} />{showBase ? 'Show result' : 'Show base'}</button>}
            <button className="btn" disabled={saving || !dirty} onClick={resetResult}><RotateCcw size={13} />Reset result</button>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-44 shrink-0 flex-col border-r border-edge bg-panel max-[1000px]:w-32">
              <div className="border-b border-edge px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-dim">{data.totalConflicts ? 'Conflicts' : 'File decision'}</div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {regions.map((region, index) => <button key={region.id} className={`mb-1 flex w-full items-start gap-2 rounded-md border px-2 py-2 text-left text-xs ${activeId === region.id ? 'border-accent/40 bg-accent/10' : 'border-transparent hover:bg-panel2'}`} onClick={() => focusConflict(region.id, true)}>
                  {region.choice ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-add" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />}
                  <span className="min-w-0"><span className="block font-medium">{data.totalConflicts ? `Conflict ${index + 1}` : 'Whole file'}</span><span className={`mt-0.5 block text-[10px] ${region.choice ? 'text-add' : 'text-dim'}`}>{region.choice ? choiceLabels[region.choice] : region.edited ? 'Edited · review needed' : 'Unresolved'}</span></span>
                </button>)}
              </div>
              <div className="border-t border-edge p-2 text-[10px] leading-relaxed text-dim">Common changes are already merged. Choose a side or edit the result, then mark the conflict resolved.</div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-edge bg-panel2/60 px-3 py-2">
                <span className="mr-1 text-xs text-dim">{active?.choice ? `Resolved: ${choiceLabels[active.choice]}` : active?.edited ? 'Edited result' : 'Selected conflict'}</span>
                <button className="btn border border-edge" disabled={saving || showBase} onClick={() => active && choose([active.id], 'current')}><ArrowRight size={12} />Current</button>
                <button className="btn border border-edge" disabled={saving || showBase} onClick={() => active && choose([active.id], 'incoming')}><ArrowLeft size={12} />Incoming</button>
                <button className="btn border border-edge" disabled={saving || showBase} onClick={() => active && choose([active.id], 'both')} title="Keep current changes, then incoming changes"><Layers size={12} />Both</button>
                <button className="btn border border-edge" disabled={saving || showBase} onClick={() => active && choose([active.id], 'incoming-first')} title="Keep incoming changes, then current changes">Both reversed</button>
                {activeBlock?.base !== undefined && <button className="btn border border-edge" disabled={saving || showBase} onClick={() => active && choose([active.id], 'base')}>Base</button>}
                <button className="btn border border-add/30 text-add" disabled={saving || showBase || !!active?.choice} onClick={() => active && choose([active.id], 'manual')}><Check size={12} />Mark resolved</button>
                <button className="btn-icon" disabled={saving || showBase || (!active?.choice && !active?.edited)} onClick={() => active && choose([active.id], 'reset')} title="Reset this conflict" aria-label="Reset selected conflict"><RotateCcw size={13} /></button>
                <span className="flex-1" />
                <span className="text-[10px] text-dim">Edit the middle pane to combine changes</span>
              </div>
              {!data.totalConflicts && <div className="shrink-0 border-b border-warn/20 bg-warn/5 px-3 py-2 text-xs text-dim">{data.parseWarning || (currentDeleted || incomingDeleted ? 'One side deleted this file. Keep that deletion, choose the remaining version, or edit the result.' : 'The file has no conflict markers. Review your result, then mark it resolved.')}</div>}
              <div ref={paneContainer} className="grid min-h-0 min-w-0 flex-1" style={{ gridTemplateColumns: `${widths[0]}fr 5px ${widths[1]}fr 5px ${widths[2]}fr` }}>
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <PaneHeader label="Current" subtitle={data.currentLabel} color="text-accent" deleted={currentDeleted} onUse={() => chooseWholeFile('current')} disabled={saving} />
                  <MergeEditor filePath={data.filePath} value={model.current} label="Current file version, read only" side="current" initialRegions={initialSourceRegions.current} onView={view => onView('current', view)} onChoose={(id, choice) => choose([id], choice)} onScroll={syncScroll} onNavigate={moveConflict} onSave={() => void apply()} />
                </div>
                <div role="separator" aria-label="Resize current and result panes" aria-orientation="vertical" className="cursor-col-resize bg-edge hover:bg-accent/50 touch-none" onPointerDown={event => resizePane(event, 0)} />
                <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <div className="flex h-14 shrink-0 items-center gap-2 border-b border-edge bg-panel2 px-3"><Pencil size={14} className="text-warn" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{showBase ? 'Base revision' : 'Merge result'}</p><p className="truncate text-[10px] text-dim">{showBase ? 'Common ancestor · read only' : fileAction === 'delete' ? 'File will be deleted' : 'Editable · applied only when you save'}</p></div>{!showBase && <span className="text-[10px] text-dim">{data.lineEnding === '\r\n' ? 'CRLF' : 'LF'}</span>}</div>
                  <div className={`min-h-0 flex-1 flex-col ${showBase ? 'hidden' : 'flex'}`}>
                    <MergeEditor filePath={data.filePath} value={model.result} label="Editable merge result" side="result" initialRegions={model.regions} onView={view => onView('result', view)} onUpdate={readResult} onScroll={syncScroll} onSave={() => void apply()} onNavigate={moveConflict} locked={saving} />
                  </div>
                  {showBase && <MergeEditor filePath={data.filePath} value={normalizeLines(data.baseContent ?? '')} label="Common ancestor file, read only" side="base" initialRegions={initialSourceRegions.base} onView={view => onView('base', view)} />}
                  {!showBase && fileAction === 'delete' && <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col items-center justify-center gap-3 bg-base/95 p-6 text-center"><Trash2 size={26} className="text-del" /><p className="text-sm font-medium">This file will be deleted</p><p className="text-xs text-dim">Apply to keep the deletion, or undo to restore your result.</p><button className="btn border border-edge" onClick={() => { const view = views.current.result; if (view) undo(view); }}><Undo2 size={13} />Undo deletion</button></div>}
                </div>
                <div role="separator" aria-label="Resize result and incoming panes" aria-orientation="vertical" className="cursor-col-resize bg-edge hover:bg-accent/50 touch-none" onPointerDown={event => resizePane(event, 1)} />
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <PaneHeader label="Incoming" subtitle={data.incomingLabel} color="text-add" deleted={incomingDeleted} onUse={() => chooseWholeFile('incoming')} disabled={saving} />
                  <MergeEditor filePath={data.filePath} value={model.incoming} label="Incoming file version, read only" side="incoming" initialRegions={initialSourceRegions.incoming} onView={view => onView('incoming', view)} onChoose={(id, choice) => choose([id], choice)} onScroll={syncScroll} onNavigate={moveConflict} onSave={() => void apply()} />
                </div>
              </div>
            </div>
          </div>
        </> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-8 text-center">
          <FileText size={32} className="text-warn" />
          <h3 className="text-sm font-semibold">{data.kind === 'binary' ? 'Binary file conflict' : data.kind === 'symlink' ? 'Symbolic link conflict' : 'Submodule conflict'}</h3>
          {data.kind === 'submodule' ? <p className="max-w-md text-xs text-dim">Resolve the submodule to the desired commit using Git, then refresh the repository.</p> : <>
            <p className="max-w-md text-xs text-dim">Choose the complete version to keep. The original file bytes or link target are preserved when you apply.</p>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-4">{(['current', 'incoming'] as const).map(side => <button key={side} disabled={saving} onClick={() => chooseWholeFile(side)} className={`rounded-lg border p-5 text-left ${wholeChoice === side ? 'border-accent bg-accent/10' : 'border-edge bg-panel2 hover:bg-panel3'}`}>
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold">{side === 'current' ? 'Current' : 'Incoming'}{wholeChoice === side && <CheckCircle2 size={15} className="text-add" />}</span>
              <span className="block break-all text-xs text-dim">{side === 'current' ? data.currentLabel : data.incomingLabel}</span>
              <span className="mt-3 block text-xs">{(side === 'current' ? currentDeleted : incomingDeleted) ? 'Deleted on this side' : data.kind === 'symlink' ? side === 'current' ? data.currentContent : data.incomingContent : 'Keep this version'}</span>
            </button>)}</div>
          </>}
        </div>}

        {(saveError || hasMarkers) && <div role="alert" className="flex shrink-0 items-center gap-2 border-t border-del/30 bg-del/10 px-4 py-2 text-xs text-del"><AlertTriangle size={13} className="shrink-0" /><span className="min-w-0 flex-1 select-text">{saveError || 'The result still contains conflict markers. Remove them before applying.'}</span>{saveError && <button className="btn shrink-0 border border-del/30" disabled={saving} onClick={() => { if (!dirty || window.confirm('Discard this draft and reload the file from disk?')) onReload(); }}><RotateCcw size={12} />Reload file</button>}</div>}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-edge bg-panel2 px-4 py-3">
          {(currentDeleted || incomingDeleted) && data.kind !== 'submodule' && <button className="btn border border-del/30 text-del" disabled={saving} onClick={deleteFile}><Trash2 size={13} />Keep deletion</button>}
          <span className="text-xs text-dim">{isText ? `${regions.length - remaining} of ${regions.length} reviewed` : wholeChoice ? `Selected: ${wholeChoice === 'delete' ? 'delete file' : wholeChoice}` : 'Choose a version to resolve'}</span>
          <span className="flex-1" />
          <button className="btn" onClick={requestClose} disabled={saving}>Cancel</button>
          {files.length === 1 && operationName && <button className="btn border border-edge px-3 py-1.5" disabled={!canApply} onClick={() => void apply(true)}>Apply &amp; Continue {operationName}</button>}
          <button className="btn btn-primary px-4 py-1.5 font-semibold" disabled={!canApply} onClick={() => void apply()}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{files.length > 1 ? 'Apply & Next File' : 'Apply & Mark Resolved'}</button>
        </div>
        {saving && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25" aria-label="Saving merge result"><span className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-4 py-3 text-xs"><Loader2 size={16} className="animate-spin" />Applying merge result…</span></div>}
      </div>
    </div>
  );
}

function PaneHeader({ label, subtitle, color, deleted, onUse, disabled }: {
  label: string; subtitle: string; color: string; deleted: boolean; onUse: () => void; disabled: boolean;
}) {
  return <div className="flex h-14 shrink-0 items-center gap-2 border-b border-edge bg-panel2 px-3"><span className={`h-2 w-2 shrink-0 rounded-full ${color === 'text-accent' ? 'bg-accent' : 'bg-add'}`} /><div className="min-w-0 flex-1"><p className={`text-xs font-semibold ${color}`}>{label}{deleted && ' · deleted'}</p><p className="truncate text-[10px] text-dim" title={subtitle}>{subtitle}</p></div><button className="btn shrink-0 border border-edge text-[10px]" disabled={disabled} onClick={onUse} title={`Use the entire ${label.toLowerCase()} file, including its non-conflicting content`}>{deleted ? 'Use deletion' : 'Use file'}</button></div>;
}

function joinBoth(first: string, second: string): string {
  return first && second && !first.endsWith('\n') ? `${first}\n${second}` : first + second;
}
