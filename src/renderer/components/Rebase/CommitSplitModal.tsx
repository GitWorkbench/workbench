import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { CommitSplitPlan, CommitSplitPreview } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

export function CommitSplitModal() {
  const open = useApp(s => s.commitSplitOpen), repo = useApp(s => s.activeTab);
  return open && repo ? <CommitSplit key={repo} /> : null;
}
function CommitSplit() {
  const [hash, setHash] = useState(useApp.getState().selectedCommit || 'HEAD');
  const [plan, setPlan] = useState<CommitSplitPlan>();
  const [messages, setMessages] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<CommitSplitPreview>();
  const [saved, setSaved] = useState<CommitSplitPreview[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let live = true; void api.listCommitSplitPreviews().then(rows => { if (live) setSaved(rows); }).catch(e => { if (live) setError(String(e)); }); return () => { live = false; }; }, []);
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const load = () => run(async () => {
    const value = await api.getCommitSplit(hash); setPlan(value); setPreview(undefined);
    setMessages([value.message, `Split: ${value.message.split('\n')[0]}`]);
    setAssignments(Object.fromEntries(value.units.map((u, i) => [u.id, i === value.units.length - 1 ? 1 : 0])));
  });
  const files = [...new Set(plan?.units.map(u => u.file) || [])];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div role="dialog" aria-modal="true" aria-label="Split commit" className="flex h-[88vh] w-full max-w-6xl flex-col rounded-xl border border-edge bg-panel overflow-hidden shadow-2xl">
    <header className="flex gap-3 items-center border-b border-edge p-4"><h2 className="flex-1 text-sm font-semibold">Split commit</h2><button className="btn-icon" disabled={busy} aria-label="Close" onClick={() => useApp.setState({ commitSplitOpen: false })}><X size={16} /></button></header>
    <div className="p-4 border-b border-edge space-y-2 text-xs"><p className="text-dim">Choose a commit on this branch, then assign each file or hunk to a smaller commit. Requires a clean checkout and linear history. A restore point is saved before applying.</p><p className="text-warn">This rewrites the selected commit and its descendants. Authors and final files are preserved; commit hashes, committer metadata, and signatures change. Coordinate before rewriting shared history. Nothing is pushed.</p><div className="flex gap-2"><input aria-label="Commit to split" className="flex-1" value={hash} disabled={busy} onChange={e => setHash(e.target.value)} /><button className="btn" disabled={busy} onClick={() => void load()}>Load commit</button>{saved.length > 0 && <select aria-label="Saved split previews" value={preview?.id || ''} disabled={busy} onChange={e => setPreview(saved.find(p => p.id === e.target.value))}><option value="">Saved previews…</option>{saved.map(p => <option key={p.id} value={p.id}>{p.branch} · {p.oldHead.slice(0, 8)} → {p.commits.length} commits</option>)}</select>}</div></div>
    <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4 text-xs">
      {preview ? <><h3 className="font-semibold">Preview · {preview.branch}</h3>{preview.commits.map((c, i) => <article key={c.hash} className="rounded border border-edge bg-base p-3"><strong>{i + 1}. {c.message.split('\n')[0]}</strong><p className="font-mono text-accent my-1">{c.hash.slice(0, 12)}</p><pre className="whitespace-pre-wrap text-dim">{c.message}</pre><p className="mt-2 text-faint">{c.files.join(', ')}</p></article>)}<p>{preview.descendantCount} later commits will receive new hashes. The final tree is identical to {preview.oldHead.slice(0, 12)}.</p></> : plan ? <>
        <div className="flex items-center gap-3"><span className="flex-1">{plan.hash.slice(0, 12)} · {plan.units.length} pieces · {plan.descendantCount} later commits</span><button className="btn" disabled={busy || messages.length >= 20} onClick={() => setMessages([...messages, ''])}><Plus size={13} />Add commit</button></div>
        <div className="grid grid-cols-2 gap-3">{messages.map((m, i) => <label key={i} className="flex flex-col gap-1">Commit {i + 1} · {Object.values(assignments).filter(n => n === i).length} pieces<textarea rows={2} maxLength={10000} disabled={busy} value={m} onChange={e => setMessages(messages.map((old, n) => n === i ? e.target.value : old))} /></label>)}</div>
        {files.map(file => <section key={file} className="rounded border border-edge overflow-hidden"><header className="flex items-center gap-2 p-2 bg-panel2"><strong className="flex-1 break-all">{file}</strong><select aria-label={`Move all changes in ${file}`} value="" disabled={busy} onChange={e => setAssignments(old => ({ ...old, ...Object.fromEntries(plan.units.filter(u => u.file === file).map(u => [u.id, Number(e.target.value)])) }))}><option value="">Move whole file…</option>{messages.map((_, i) => <option key={i} value={i}>Commit {i + 1}</option>)}</select></header>{plan.units.filter(u => u.file === file).map(u => <div key={u.id} className="border-t border-edge p-2"><div className="flex gap-2 items-center"><span className="flex-1 text-dim">{u.label}</span><select aria-label={`Assign ${file} ${u.label}`} disabled={busy} value={assignments[u.id] ?? 0} onChange={e => setAssignments({ ...assignments, [u.id]: Number(e.target.value) })}>{messages.map((_, i) => <option key={i} value={i}>Commit {i + 1}</option>)}</select></div><details className="mt-1"><summary className="cursor-pointer text-accent">View patch</summary><pre className="code-surface overflow-auto bg-base p-2 max-h-72 selectable">{u.patch.length > 100_000 ? `${u.patch.slice(0, 100_000)}\n[Preview truncated; full patch is used.]` : u.patch}</pre></details></div>)}</section>)}
      </> : <p className="text-dim">Load the selected commit or enter a revision above. Saved previews can be reopened after restarting.</p>}
    </div>
    <footer className="border-t border-edge p-3 space-y-2">{error && <p role="alert" className="text-xs text-del whitespace-pre-wrap">{error}</p>}<div className="flex justify-end gap-2">{preview ? <><button className="btn" disabled={busy} onClick={() => void run(async () => { await api.discardCommitSplit(preview.id); setSaved(saved.filter(p => p.id !== preview.id)); setPreview(undefined); })}>Discard preview</button><button className="btn-primary" disabled={busy} onClick={() => void run(async () => {
      if (!window.confirm(`Rewrite ${preview.branch} with this split? A restore point will be saved. Shared branch history will change.`)) return;
      const ok = await useApp.getState().runAndRefresh(async () => { const result = await api.applyCommitSplit(preview.id); if (result.warning) useApp.getState().notify('warn', result.warning); return result; }, 'Commit split applied');
      if (ok) useApp.setState({ commitSplitOpen: false });
    })}>{busy ? 'Applying…' : 'Apply split'}</button></> : <button className="btn-primary" disabled={busy || !plan} onClick={() => void run(async () => { if (!plan) return; const value = await api.previewCommitSplit({ hash: plan.hash, head: plan.head, groups: messages.map((message, i) => ({ message, units: plan.units.filter(u => assignments[u.id] === i).map(u => u.id) })) }); setPreview(value); setSaved([value, ...saved]); })}>{busy ? 'Preparing…' : 'Preview split'}</button>}</div></footer>
  </div></div>;
}
