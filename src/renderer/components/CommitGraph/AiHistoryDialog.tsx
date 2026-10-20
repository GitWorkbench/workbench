import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Settings2, Sparkles, X } from 'lucide-react';
import type { AiCommitDraft, BranchChangesExplanation, Commit } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';

export function AiHistoryDialog({ kind, commit, repo, onClose }: {
  kind: 'reword' | 'explain'; commit: Commit; repo: string; onClose: () => void;
}) {
  const config = useSettings(s => s.aiCommit);
  const branches = useApp(s => s.branches);
  const activeTab = useApp(s => s.activeTab);
  const options = [...new Set([...branches.local, ...branches.remote].map(b => b.fullName))];
  const [base, setBase] = useState(options.find(b => /(?:^|\/)(main|master)$/.test(b)) || 'HEAD~1');
  const [tip, setTip] = useState(commit.hash);
  const [draft, setDraft] = useState<AiCommitDraft | null>(null);
  const [message, setMessage] = useState('');
  const [explanation, setExplanation] = useState<BranchChangesExplanation | null>(null);
  const [busy, setBusy] = useState<'generate' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const alive = useRef(true), locked = useRef(false), ticket = useRef(0);
  const applying = useRef(false);
  const close = () => { if (!applying.current) { ticket.current++; onClose(); } };
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    panel.current?.focus();
    return () => { alive.current = false; ticket.current++; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (activeTab !== repo) onClose(); }, [activeTab, repo, onClose]);
  useEffect(() => {
    ticket.current++;
    setDraft(null); setMessage(''); setExplanation(null); setError('');
  }, [config]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)') || [])];
        if (!controls.length) { event.preventDefault(); panel.current?.focus(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  });
  const current = (id: number) => alive.current && id === ticket.current && useApp.getState().activeTab === repo;
  const generate = async () => {
    if (locked.current || useApp.getState().activeTab !== repo) return;
    locked.current = true;
    const id = ++ticket.current;
    setBusy('generate'); setError(''); setDraft(null); setExplanation(null);
    try {
      if (kind === 'reword') {
        const value = await api.recomposeCommitMessage(commit.hash, config);
        if (current(id)) { setDraft(value); setMessage(value.message); }
      } else {
        const value = await api.explainBranchChanges(base, tip, config);
        if (current(id)) setExplanation(value);
      }
    } catch (reason) { if (current(id)) setError(String(reason).replace(/^Error:\s*/, '')); }
    finally { locked.current = false; if (alive.current) setBusy(null); }
  };
  const apply = async () => {
    if (locked.current || !draft || !message.trim() || useApp.getState().activeTab !== repo) return;
    if (!window.confirm(`Rewrite the message of ${draft.commitHash.slice(0, 12)} on ${draft.branch}? This changes its hash and descendant hashes. A restore point will be saved. Nothing is pushed.`)) return;
    if (useApp.getState().activeTab !== repo) return;
    applying.current = true;
    locked.current = true;
    const id = ++ticket.current;
    setBusy('apply'); setError('');
    try {
      const success = await useApp.getState().runAndRefresh(async () => {
        try {
          const result = await api.editCommitMessage(draft.commitHash, message.trim(), { head: draft.head, branch: draft.branch });
          if (!result.ok) throw new Error(result.error || 'The commit message could not be changed.');
          return result;
        } catch (reason) { if (current(id)) setError(String(reason).replace(/^Error:\s*/, '')); throw reason; }
      }, 'Commit message updated');
      if (success && current(id)) onClose();
    } catch (reason) { if (current(id)) setError(String(reason).replace(/^Error:\s*/, '')); }
    finally { applying.current = false; locked.current = false; if (alive.current) setBusy(null); }
  };
  return createPortal(<div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="ai-history-title" tabIndex={-1} className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl text-sm">
      <header className="flex items-center gap-3 border-b border-edge p-4"><Sparkles size={17} className="text-accent" /><h2 id="ai-history-title" className="flex-1 font-semibold">{kind === 'reword' ? 'Recompose commit message' : 'Explain branch changes'}</h2><button className="btn-icon" aria-label="Close AI history dialog" disabled={busy === 'apply'} onClick={close}><X size={15} /></button></header>
      <div className="min-h-0 overflow-auto space-y-4 p-4">
        <p className="text-dim leading-relaxed">{kind === 'reword' ? 'Generate a draft from the selected commit’s changes, edit it, then explicitly apply it. Requires a clean checkout and linear history. Files stay unchanged; rewriting changes commit hashes and signatures.' : 'Compare the tip with its common ancestor with your chosen base. The explanation covers committed changes, without changing your checkout.'}</p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-edge p-3 text-xs"><span className="flex-1 text-dim">{config.provider === 'local' ? 'Local heuristic message generator. Choose an AI model for branch explanations.' : `Provider: ${config.provider} · ${config.model || 'default model'}. Generating sends the diff to this configured provider.`}</span><button className="btn-secondary" disabled={!!busy} onClick={() => { onClose(); useSettings.getState().openSettings('ai'); }}><Settings2 size={12} />AI settings</button></div>
        {kind === 'explain' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><datalist id="ai-history-refs">{options.map(ref => <option key={ref} value={ref} />)}</datalist><label className="space-y-1 text-xs text-dim">Base branch or revision<input aria-label="Explanation base revision" className="input w-full" list="ai-history-refs" disabled={!!busy} value={base} onChange={event => { setBase(event.target.value); setExplanation(null); }} /></label><label className="space-y-1 text-xs text-dim">Tip branch or revision<input aria-label="Explanation tip revision" className="input w-full" list="ai-history-refs" disabled={!!busy} value={tip} onChange={event => { setTip(event.target.value); setExplanation(null); }} /></label></div>}
        {kind === 'reword' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><section><h3 className="mb-2 text-xs font-semibold text-dim">Original · {commit.shortHash}</h3><pre className="whitespace-pre-wrap break-words rounded-lg border border-edge bg-base p-3 text-sm selectable">{draft?.originalMessage || [commit.message, commit.body].filter(Boolean).join('\n\n')}</pre></section><label className="block text-xs font-semibold text-dim">Editable message draft<textarea aria-label="Recomposed commit message" className="input mt-2 w-full min-h-48 text-sm" disabled={!draft || !!busy} value={message} onChange={event => setMessage(event.target.value)} placeholder="Choose Generate draft first" /></label></div>}
        {draft?.inputTruncated && <p className="text-xs text-warn">The provider saw only the first 8,000 characters of this commit’s diff. Review the draft against the full commit.</p>}
        {explanation && <section className="space-y-3"><p className="text-xs text-dim">{explanation.commitCount} commits · {explanation.filesChanged} files · {explanation.mergeBase.slice(0, 12)} → {explanation.tipHash.slice(0, 12)}</p><div className="whitespace-pre-wrap break-words selectable rounded-lg border border-edge bg-base p-4 leading-relaxed">{explanation.explanation}</div><button className="btn-secondary text-xs" onClick={() => void navigator.clipboard.writeText(explanation.explanation).catch(reason => setError(String(reason)))}>Copy explanation</button></section>}
        {error && <p role="alert" className="rounded-lg border border-del/30 bg-del/5 p-3 text-xs text-del whitespace-pre-wrap">{error}</p>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-edge p-3"><button className="btn-secondary" disabled={busy === 'apply'} onClick={close}>Close</button><button className="btn-secondary" disabled={!!busy || (kind === 'explain' && (!base.trim() || !tip.trim()))} onClick={() => void generate()}>{busy === 'generate' && <Loader2 size={13} className="animate-spin" />}{kind === 'reword' ? 'Generate draft' : 'Explain changes'}</button>{kind === 'reword' && <button className="btn-primary" disabled={!!busy || !draft || !message.trim() || message.trim() === draft.originalMessage.trim()} onClick={() => void apply()}>{busy === 'apply' && <Loader2 size={13} className="animate-spin" />}Apply message</button>}</footer>
    </div>
  </div>, document.body);
}
