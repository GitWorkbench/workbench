import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Undo2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import type { RestorePoint } from '../../../shared/types';

export function RestorePointsModal() {
  const open = useApp(s => s.restorePointsOpen), repo = useApp(s => s.activeTab);
  return open && repo ? <RestorePoints key={repo} /> : null;
}

function RestorePoints() {
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<string>();
  const [confirmation, setConfirmation] = useState<'restore' | 'delete'>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const point = points.find(p => p.id === selected);
  const close = () => { if (!busy) useApp.setState({ restorePointsOpen: false }); };
  const load = async () => { const list = await api.listRestorePoints(); setPoints(list); setSelected(old => list.some(p => p.id === old) ? old : list[0]?.id); };
  useEffect(() => { let live = true; void api.listRestorePoints().then(list => { if (live) { setPoints(list); setSelected(list[0]?.id); } }).catch(e => { if (live) setMessage(String(e)); }); return () => { live = false; }; }, []);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await fn(); setMessage(success); await load(); await useApp.getState().refresh(); }
    catch (e) { setMessage(String(e)); await useApp.getState().refresh(); }
    finally { setBusy(false); setConfirmation(undefined); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
    <div role="dialog" aria-modal="true" aria-label="Restore points" className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
      <header className="flex items-center gap-2 border-b border-edge p-4"><Undo2 size={17} className="text-accent" /><h2 className="flex-1 text-sm font-semibold">Restore Points</h2><button className="btn-icon" title="Refresh points" disabled={busy} onClick={() => void run(load, '')}><RefreshCw size={14} /></button><button className="btn-icon" title="Close" disabled={busy} onClick={close}><X size={15} /></button></header>
      <div className="space-y-3 border-b border-edge p-4 text-xs"><p className="text-dim">Saved automatically before reset, discard, pull, and history rewrites. Points preserve HEAD, staged and unstaged changes, and non-ignored untracked files without changing your workspace.</p><p className="text-faint">Ignored files, unsaved editor buffers, and files inside submodules are excluded. Submodule revisions are recorded; their working directories are not changed during recovery. Conflicted indexes cannot be snapshotted.</p><form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { const created = await api.createRestorePoint(label); setSelected(created.id); setLabel(''); }, 'Restore point saved.'); }}><input className="min-w-0 flex-1 text-xs" value={label} onChange={e => setLabel(e.target.value)} maxLength={180} placeholder="Optional name for a manual restore point" disabled={busy} /><button className="btn-primary text-xs !px-3" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save point</button></form></div>
      <div className="flex min-h-40 min-w-0 flex-1 overflow-hidden"><aside className="w-72 shrink-0 overflow-auto border-r border-edge p-2">{!points.length && <p className="p-3 text-xs text-dim">No restore points yet.</p>}{points.map(p => <button key={p.id} className={`mb-1 w-full rounded p-3 text-left text-xs ${p.id === selected ? 'bg-panel3' : 'hover:bg-panel2'}`} disabled={busy} onClick={() => { setSelected(p.id); setConfirmation(undefined); }}><span className="block break-words font-medium">{p.label}</span><span className="mt-1 block text-[10px] text-dim">{new Date(p.createdAt).toLocaleString()} · {p.branch}</span></button>)}</aside><section className="min-w-0 flex-1 overflow-auto p-4 text-xs">{point && <><h3 className="font-semibold">{point.label}</h3><p className="mt-2 font-mono text-dim">{point.branch} · {point.unborn ? 'Before the first commit' : point.head.slice(0, 12)}</p><p className="mt-1 text-dim">{point.untrackedCount} untracked files included</p><pre className="code-surface selectable mt-3 whitespace-pre-wrap break-words rounded border border-edge bg-base p-3">{point.status || 'Clean working tree — HEAD is preserved.'}</pre><div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary text-xs" disabled={busy} onClick={() => setConfirmation('restore')}><Undo2 size={13} /> Restore into new branch</button><button className="btn-secondary text-xs" disabled={busy} onClick={() => setConfirmation('delete')}><Trash2 size={13} /> Delete point</button></div>{confirmation && <div className="mt-3 space-y-3 rounded border border-warn/40 p-3"><p>{confirmation === 'restore' ? 'Your working tree must be clean. Recovery creates and checks out a new branch at the saved HEAD, then restores the saved index, working files, and untracked files. The point and your existing branch are kept.' : 'Delete this saved point? Its uncommitted content may become unrecoverable after Git garbage collection.'}</p><div className="flex gap-2"><button className="btn-secondary text-xs" disabled={busy} onClick={() => setConfirmation(undefined)}>Cancel</button><button className="btn-primary text-xs" disabled={busy} onClick={() => void run(async () => { if (confirmation === 'restore') { const result = await api.restorePoint(point.id); useApp.getState().notify('success', `Restored into ${result.branch}`); } else await api.deleteRestorePoint(point.id); }, confirmation === 'restore' ? 'Restored. The saved point is still available.' : 'Restore point deleted.')}>Confirm {confirmation}</button></div></div>}</>}</section></div>
      {message && <p role="status" className="border-t border-edge p-3 text-xs text-accent">{message}</p>}
    </div>
  </div>;
}
