import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, RefreshCw, Copy, History, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import type { RangeComparison, RangeComparisonInput, RewriteSession } from '../../../shared/types';

const empty: RangeComparisonInput = { oldBase: '', oldTip: '', newBase: '', newTip: '' };
const colors = { unchanged: 'text-dim', changed: 'text-warn', removed: 'text-del', added: 'text-add' };

export function RangeComparisonModal() {
  const open = useApp(s => s.rangeComparisonOpen), repo = useApp(s => s.activeTab), selectedId = useApp(s => s.rangeComparisonId);
  return open && repo ? <RangeWorkspace key={repo} initialId={selectedId} /> : null;
}

function RangeWorkspace({ initialId }: { initialId: string | null }) {
  const [sessions, setSessions] = useState<RewriteSession[]>([]);
  const [sessionId, setSessionId] = useState(initialId || '');
  const [input, setInput] = useState<RangeComparisonInput>(empty);
  const [result, setResult] = useState<RangeComparison | null>(null);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<'all' | RangeComparison['entries'][number]['kind']>('all');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0), mounted = useRef(true);
  const compare = async (values: RangeComparisonInput) => {
    const request = ++generation.current;
    setBusy(true); setMessage(''); setResult(null);
    try { const data = await api.compareCommitRanges(values); if (mounted.current && request === generation.current) { setResult(data); setSelected(0); setFilter('all'); } }
    catch (error) { if (mounted.current && request === generation.current) setMessage(String(error)); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  };
  const chooseSession = (s?: RewriteSession) => {
    generation.current++; setBusy(false); setSessionId(s?.id || ''); setResult(null); setMessage('');
    if (!s) return;
    const values = { oldBase: s.oldBase, oldTip: s.oldTip, newBase: s.newBase, newTip: s.newTip || '' };
    setInput(values);
    if ((s.status === 'completed' || s.status === 'ended') && s.newTip) void compare(values);
  };
  useEffect(() => {
    mounted.current = true;
    void api.listRewriteSessions().then(records => {
      if (!mounted.current) return;
      setSessions(records);
      chooseSession(records.find(s => s.id === initialId) || records.find(s => s.status === 'completed') || records[0]);
    }).catch(e => { if (mounted.current) setMessage(String(e)); });
    return () => { mounted.current = false; generation.current++; };
  }, []);
  const session = sessions.find(s => s.id === sessionId);
  const visible = (result?.entries || []).map((entry, index) => ({ entry, index })).filter(({ entry }) => filter === 'all' || entry.kind === filter);
  const detail = visible.find(row => row.index === selected)?.entry || visible[0]?.entry;
  const close = () => useApp.setState({ rangeComparisonOpen: false, rangeComparisonId: null });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"><div role="dialog" aria-modal="true" aria-label="Rebase and rewrite comparison" className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
    <header className="flex items-center gap-3 border-b border-edge p-4"><History size={17} className="text-accent" /><h2 className="flex-1 text-sm font-semibold">Rebase &amp; Rewrite Comparison</h2><button className="btn-icon" title="Close" onClick={close}><X size={16} /></button></header>
    <div className="shrink-0 space-y-3 border-b border-edge p-3 text-xs">
      <div className="flex gap-2"><select aria-label="Saved rewrite" className="min-w-0 flex-1 text-xs" value={sessionId} disabled={busy} onChange={e => chooseSession(sessions.find(s => s.id === e.target.value))}><option value="">Custom ranges</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.branch} · {s.operation} · {new Date(s.createdAt).toLocaleString()} · {s.status}</option>)}</select><button className="btn-icon" title="Refresh rewrite records" disabled={busy} onClick={async () => { try { const next = await api.listRewriteSessions(); setSessions(next); chooseSession(next.find(s => s.id === sessionId)); } catch (e) { setMessage(String(e)); } }}><RefreshCw size={14} /></button>{session && <button className="btn-icon" title="Delete comparison record" disabled={busy || session.status === 'running' || session.status === 'paused'} onClick={async () => { if (!window.confirm('Delete this comparison record? Branches and working files stay unchanged, but the saved before/after revisions may eventually be cleaned up by Git.')) return; try { await api.deleteRewriteSession(session.id); setSessions(await api.listRewriteSessions()); chooseSession(undefined); } catch (e) { setMessage(String(e)); } }}><Trash2 size={14} /></button>}</div>
      {session?.status === 'paused' || session?.status === 'running' ? <p className="text-warn">This rebase is still in progress. Finish or abort it, then refresh this view.</p> : null}
      {session?.status === 'ended' && <p className="text-dim">This session ended outside Git Workbench. Its final revisions are available; the app cannot confirm whether it completed or was aborted.</p>}
      {session?.error && <p className="text-warn">{session.status}: {session.error}</p>}
      <form onSubmit={e => { e.preventDefault(); void compare(input); }} className="space-y-2"><div className="grid grid-cols-2 gap-3"><fieldset className="grid grid-cols-2 gap-2 rounded border border-edge p-2"><legend className="px-1 text-dim">Before rewrite</legend>{(['oldBase', 'oldTip'] as const).map(key => <label key={key} className="text-[10px] text-dim">{key === 'oldBase' ? 'Base (excluded)' : 'Tip (included)'}<input aria-label={key === 'oldBase' ? 'Before base' : 'Before tip'} className="mt-1 w-full font-mono text-xs" value={input[key]} disabled={busy} required placeholder={key === 'oldBase' ? 'e.g. origin/main' : 'e.g. HEAD@{1}'} onChange={e => { setInput(old => ({ ...old, [key]: e.target.value })); setSessionId(''); setResult(null); }} /></label>)}</fieldset><fieldset className="grid grid-cols-2 gap-2 rounded border border-edge p-2"><legend className="px-1 text-dim">After rewrite</legend>{(['newBase', 'newTip'] as const).map(key => <label key={key} className="text-[10px] text-dim">{key === 'newBase' ? 'Base (excluded)' : 'Tip (included)'}<input aria-label={key === 'newBase' ? 'After base' : 'After tip'} className="mt-1 w-full font-mono text-xs" value={input[key]} disabled={busy} required placeholder={key === 'newBase' ? 'e.g. origin/main' : 'e.g. HEAD'} onChange={e => { setInput(old => ({ ...old, [key]: e.target.value })); setSessionId(''); setResult(null); }} /></label>)}</fieldset></div><div className="flex items-center justify-between gap-3"><p className="text-[11px] text-dim">Records are created before in-app rebases and commit rewrites. Comparisons are read only.</p><button className="btn-primary text-xs !px-4" disabled={busy || Object.values(input).some(value => !value.trim())}>{busy && <Loader2 size={13} className="animate-spin" />} Compare ranges</button></div></form>
    </div>
    {message && <p role="status" className="shrink-0 border-b border-edge p-3 text-xs text-warn">{message}</p>}
    {result ? <><div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge p-2 text-xs"><span className="mr-2 text-dim">{result.beforeCount} → {result.afterCount} commits</span>{(['all', 'unchanged', 'changed', 'removed', 'added'] as const).map(kind => <button key={kind} className={`btn text-xs ${filter === kind ? '!bg-panel3 !text-accent' : ''}`} onClick={() => setFilter(kind)}>{kind} ({kind === 'all' ? result.entries.length : result.entries.filter(e => e.kind === kind).length})</button>)}<button className="btn text-xs ml-auto" onClick={() => { void navigator.clipboard.writeText(result.raw).then(() => setMessage('Raw comparison copied.'), e => setMessage(String(e))); }}><Copy size={12} /> Copy raw output</button></div>
      <div className="min-h-0 flex-[1_1_45%] overflow-auto"><div className="grid min-w-[650px] grid-cols-[145px_100px_145px_minmax(0,1fr)] border-b border-edge bg-panel2 px-4 py-2 text-xs text-dim"><span>Before</span><span>Change</span><span>After</span><span>Commit</span></div>{visible.map(({ entry, index }) => <button key={index} className={`grid min-w-[650px] w-full grid-cols-[145px_100px_145px_minmax(0,1fr)] border-b border-edge/50 px-4 py-2 text-left text-xs ${detail === entry ? 'bg-panel3' : 'hover:bg-panel2'}`} onClick={() => setSelected(index)}><span className="font-mono text-dim">{entry.before ?? '—'} {entry.oldHash?.slice(0, 9)}</span><span className={colors[entry.kind]}>{entry.kind}</span><span className="font-mono text-dim">{entry.after ?? '—'} {entry.newHash?.slice(0, 9)}</span><span className="truncate">{entry.subject}</span></button>)}{!visible.length && <p className="p-4 text-xs text-dim">{result.raw && !result.entries.length ? 'This Git version returned a different output format. Expand raw output below.' : 'No commits match this filter.'}</p>}</div>
      <section className="min-h-0 flex-[1_1_55%] overflow-auto border-t border-edge bg-base p-3 selectable"><h3 className="mb-2 text-xs font-semibold">{detail ? `${detail.kind}: ${detail.subject}` : 'Patch comparison'}</h3><pre className="code-surface whitespace-pre-wrap break-words">{detail?.patch.slice(0, 200_000) || (detail?.kind === 'unchanged' ? 'The patch, message, and author match. Commit hashes or positions may differ.' : detail ? 'This commit has no paired patch to compare. Inspect its full commit below.' : 'Select a commit pair to inspect changes.')}</pre>{detail && <div className="mt-3 flex gap-2">{detail.oldHash && <button className="btn-secondary text-xs" onClick={() => { close(); void useApp.getState().selectCommit(detail.oldHash!); }}>Inspect old commit</button>}{detail.newHash && <button className="btn-secondary text-xs" onClick={() => { close(); void useApp.getState().selectCommit(detail.newHash!); }}>Inspect new commit</button>}</div>}{detail && detail.patch.length > 200_000 && <p className="mt-2 text-xs text-warn">Patch preview is truncated. Copy raw output for the full comparison.</p>}<details className="mt-4 text-xs"><summary className="cursor-pointer text-accent">Raw Git output</summary><pre className="code-surface mt-2 whitespace-pre-wrap break-words">{result.raw.slice(0, 300_000) || '(Both ranges are empty.)'}</pre>{result.raw.length > 300_000 && <p className="text-warn">Raw preview truncated; Copy raw output includes everything.</p>}</details></section><p className="shrink-0 border-t border-edge px-3 py-2 text-[11px] text-dim">{result.warning}</p></> : <p className="p-6 text-xs text-dim">{busy ? 'Matching commits and comparing patches…' : 'Choose a saved rewrite or enter two commit ranges. Completed in-app rewrites open this view automatically.'}</p>}
  </div></div>;
}
