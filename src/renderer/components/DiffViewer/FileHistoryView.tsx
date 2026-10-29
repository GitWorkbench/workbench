import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, FileDiff as FileDiffIcon, GitCommit, Loader2, Search, User } from 'lucide-react';
import { BlameLine, FileHistoryEntry } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

interface FileHistoryViewProps { filePath: string }

export function FileHistoryView({ filePath }: FileHistoryViewProps) {
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const openFileDiff = useApp((s) => s.openFileDiff);
  const selectCommit = useApp((s) => s.selectCommit);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true); setError(''); setHistory([]); setLines([]); setSelectedIndex(0);
    api.getFileHistory(filePath).then(value => {
      if (active) { setHistory(value); setHistoryLoading(false); }
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Could not load this file’s history.'); setHistoryLoading(false); }
    });
    return () => { active = false; };
  }, [filePath]);

  const oldestFirst = useMemo(() => [...history].reverse(), [history]);
  const selected = oldestFirst[selectedIndex];

  useEffect(() => {
    let active = true;
    setLines([]); setError(''); setSnapshotLoading(!!selected);
    if (!selected) return () => { active = false; };
    api.getBlame(filePath, selected.hash).then(value => {
      if (active) { setLines(value); setSnapshotLoading(false); }
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Could not inspect this revision.'); setSnapshotLoading(false); }
    });
    return () => { active = false; };
  }, [filePath, selected?.hash]);

  const visibleLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return lines;
    return lines.filter(line => [line.author, line.summary, line.shortHash, line.content].some(value => value.toLowerCase().includes(query)));
  }, [lines, search]);

  if (historyLoading) return <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-xs text-dim"><Loader2 size={20} className="animate-spin text-accent" /><span>Loading file history…</span></div>;
  if (!history.length) return <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-sm text-dim"><span>{error || 'No historical commits found for this file.'}</span></div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-base">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-panel px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-fg" title={filePath}>File archaeology · {filePath}</h3>
          <p className="mt-0.5 text-[10px] text-dim">Scrub revisions to see how the file changed and who last touched each line.</p>
        </div>
        <span className="shrink-0 text-[10px] text-dim">{history.length} revisions</span>
      </header>

      <div className="shrink-0 border-b border-edge bg-panel2/40 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-dim">Revision {selectedIndex + 1} of {oldestFirst.length}</span>
          {selected && <span className="max-w-[70%] truncate font-mono text-accent" title={selected.summary}>{selected.shortHash} · {selected.summary || '(no message)'}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-icon !h-6 !w-6" aria-label="Previous file revision" disabled={selectedIndex <= 0} onClick={() => setSelectedIndex(index => Math.max(0, index - 1))}><ArrowLeft size={13} /></button>
          <input aria-label="Scrub file history" type="range" min={0} max={oldestFirst.length - 1} value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))} className="min-w-0 flex-1 accent-sky-500" />
          <button type="button" className="btn-icon !h-6 !w-6" aria-label="Next file revision" disabled={selectedIndex >= oldestFirst.length - 1} onClick={() => setSelectedIndex(index => Math.min(oldestFirst.length - 1, index + 1))}><ArrowRight size={13} /></button>
        </div>
        <div className="mt-1 flex justify-between gap-2 text-[10px] text-faint"><span>{oldestFirst[0]?.date ? new Date(oldestFirst[0].date).toLocaleDateString() : 'Oldest'}</span><span>{oldestFirst.at(-1)?.date ? new Date(oldestFirst.at(-1)!.date).toLocaleDateString() : 'Newest'}</span></div>
      </div>

      {selected && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge px-3 py-2 text-[11px]">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-fg" title={selected.summary}><GitCommit size={13} className="shrink-0 text-accent" />{selected.summary || '(no message)'}</span>
        <span className="flex items-center gap-1 text-dim"><User size={11} />{selected.authorName || 'Unknown author'}</span>
        <span className="flex items-center gap-1 text-dim"><Calendar size={11} />{selected.date ? new Date(selected.date).toLocaleString() : 'Unknown date'}</span>
        <button type="button" className="btn-secondary !flex !items-center !gap-1 !px-2 !py-1 text-[10px]" onClick={() => openFileDiff({ commitHash: selected.hash, filePath })} title="View this revision’s diff"><FileDiffIcon size={12} />Diff</button>
        <button type="button" className="btn-secondary !px-2 !py-1 text-[10px]" onClick={() => selectCommit(selected.hash)}>Go to commit</button>
      </div>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-edge bg-panel px-3 py-1.5">
          <Search size={13} className="shrink-0 text-dim" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Filter author, message, or code…" aria-label="Filter historical lines" className="min-w-0 flex-1 border-none bg-transparent text-xs text-fg outline-none placeholder:text-faint" />
          {search && <span className="text-[10px] text-dim">{visibleLines.length}/{lines.length} lines</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto selectable">
          {snapshotLoading ? <div className="flex h-full items-center justify-center gap-2 text-xs text-dim"><Loader2 size={16} className="animate-spin text-accent" />Loading this revision…</div> : error ? <div role="status" className="p-4 text-xs text-dim">{error}</div> : !lines.length ? <div role="status" className="p-4 text-xs text-dim">This file has no text lines in this revision. It may have been added later, renamed, deleted, or contain binary data.</div> : !visibleLines.length ? <div className="p-4 text-xs text-dim">No lines match this filter.</div> : visibleLines.map((line, index) => {
            const sameCommitAsPrevious = index > 0 && visibleLines[index - 1]?.commitHash === line.commitHash;
            return <div key={`${line.lineNo}:${line.commitHash}`} className="group flex min-w-max items-baseline border-b border-edge/10 hover:bg-panel2/70" title={`${line.author} · ${line.date}\n${line.summary || '(no commit message)'}`}>
              <span className="w-12 shrink-0 select-none border-r border-edge/30 py-0.5 pr-2 text-right font-mono text-[10px] text-faint">{line.lineNo}</span>
              <div className="flex w-64 shrink-0 items-center gap-1.5 overflow-hidden border-r border-edge/40 bg-panel/40 px-2 py-0.5">
                {sameCommitAsPrevious ? <span className="pl-4 text-[10px] text-faint/40">〃</span> : <>
                  <button type="button" className="shrink-0 font-mono text-[10px] text-accent hover:underline" onClick={() => selectCommit(line.commitHash)} title={`Inspect commit ${line.shortHash}`}>{line.shortHash}</button>
                  <span className="max-w-20 truncate text-[10px] text-dim" title={line.author}>{line.author || 'Unknown'}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-faint" title={line.summary}>{line.summary || '(no message)'}</span>
                </>}
              </div>
              <code className="code-surface whitespace-pre px-3 py-0.5 text-[11px] text-fg/90">{line.content || ' '}</code>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
