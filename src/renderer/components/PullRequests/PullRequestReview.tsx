import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Loader2, ExternalLink, MessageSquare, X } from 'lucide-react';
import type { HostedPullRequest, PullReviewDetail, PullReviewSubmission, PullReviewTarget } from '../../../shared/types';
import { reviewDiffLines } from '../../../shared/review-diff';
import { api } from '../../lib/api';
import { useApp } from '../../store';

const safeUrl = (url?: string) => url && /^https?:\/\//i.test(url) ? url : undefined;

export function PullRequestReview({ request, target, onClose }: { request: HostedPullRequest; target: PullReviewTarget; onClose: () => void }) {
  const [data, setData] = useState<PullReviewDetail | null>(null);
  const [tab, setTab] = useState<'files' | 'conversation' | 'checks'>('files');
  const [filePath, setFilePath] = useState('');
  const [body, setBody] = useState('');
  const [action, setAction] = useState<PullReviewSubmission['action']>('comment');
  const [inline, setInline] = useState<PullReviewSubmission['inline']>();
  const [replyTo, setReplyTo] = useState<PullReviewSubmission['replyTo']>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [worktreeForm, setWorktreeForm] = useState(false);
  const [parentDirectory, setParentDirectory] = useState('');
  const [folder, setFolder] = useState(`review-${target.provider}-${request.id}`);
  const [reviewBranch, setReviewBranch] = useState(`review/${target.provider}-${request.id}-${Date.now().toString(36)}`);
  const [createdWorktree, setCreatedWorktree] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);

  const load = async () => {
    const id = ++generation.current;
    setLoading(true);
    try {
      const next = await api.getPullReview(target);
      if (!mounted.current || generation.current !== id) return;
      if (data && data.head !== next.head) { setInline(undefined); setReplyTo(undefined); setMessage('New commits arrived. Review the updated diff before submitting; your message is kept.'); }
      setData(next);
      setFilePath(old => next.files.some(f => f.path === old) ? old : next.files[0]?.path || '');
    } catch (error) { if (mounted.current && generation.current === id) setMessage(String(error)); }
    finally { if (mounted.current && generation.current === id) setLoading(false); }
  };
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!saving && (!body.trim() || window.confirm('Discard your unpublished review message?'))) onClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [saving, body, onClose]);
  const file = data?.files.find(f => f.path === filePath);
  const lines = file ? reviewDiffLines(file.patch) : [];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || saving) return;
    setSaving(true); setMessage('');
    try {
      const result = await api.submitPullReview({ ...target, head: data.head, action, body, inline, replyTo, changeRequestMode: data.changeRequestMode });
      if (!mounted.current) return;
      setMessage(result.message); setBody(''); setInline(undefined); setReplyTo(undefined); setAction('comment');
      await load();
    } catch (error) { if (mounted.current) setMessage(String(error)); }
    finally { if (mounted.current) setSaving(false); }
  };
  const createWorktree = async () => {
    if (!data || !parentDirectory || !folder || /[\\/\0]/.test(folder) || folder === '.' || folder === '..') { setMessage('Select a parent folder and enter a new folder name without slashes.'); return; }
    setSaving(true); setMessage('Fetching the reviewed revision and creating a separate worktree…');
    try {
      const result = await api.openPullRequestWorktree({ ...target, head: data.head, branch: reviewBranch, directory: `${parentDirectory.replace(/[\\/]$/, '')}/${folder}` });
      if (mounted.current) { setCreatedWorktree(result.path); setMessage('Review worktree created. Your current checkout is unchanged. LFS assets can be downloaded with the LFS manager.'); }
    } catch (error) { if (mounted.current) setMessage(String(error)); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
    <div role="dialog" aria-modal="true" aria-label="Review pull request" className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
      <header className="flex items-center gap-3 border-b border-edge p-4">
        <button className="btn-secondary text-xs" onClick={() => { if (!body.trim() || window.confirm('Discard your unpublished review message?')) onClose(); }} disabled={saving}><ArrowLeft size={13} /> Requests</button>
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">#{request.id} {request.title}</h2><p className="text-xs text-dim">{request.sourceBranch} → {request.targetBranch} · {data?.head.slice(0, 8) || 'Loading…'}</p></div>
        <a className="btn-secondary text-xs" href={safeUrl(request.url)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Provider</a>
        <button className="btn text-xs" disabled={!data || loading || saving} onClick={() => setWorktreeForm(!worktreeForm)}>Open in worktree…</button>
        <button className="btn-icon" title="Refresh review" disabled={loading || saving} onClick={() => void load()}>{loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
      </header>
      {worktreeForm && <div className="border-b border-edge bg-panel2 p-3 space-y-2 text-xs">
        <p>Create a new folder and local review branch at {data?.head.slice(0, 8)}. Your current files stay in place. Dependencies and project scripts are not run.</p>
        <div className="flex gap-2 items-center flex-wrap"><button className="btn" disabled={saving || !!createdWorktree} onClick={() => void api.selectDirectory('Choose a parent folder for the PR worktree').then(result => { if (result.ok && result.path) setParentDirectory(result.path); }).catch(e => setMessage(String(e)))}>Choose parent folder…</button><span className="text-dim break-all">{parentDirectory || 'No folder selected'}</span></div>
        <div className="flex gap-2 flex-wrap"><label className="flex flex-col gap-1">New folder<input value={folder} disabled={saving || !!createdWorktree} onChange={e => setFolder(e.target.value)} /></label><label className="flex flex-col gap-1">New local branch<input value={reviewBranch} disabled={saving || !!createdWorktree} onChange={e => setReviewBranch(e.target.value)} /></label><button className="btn self-end" disabled={!parentDirectory || !data || loading || saving || !!createdWorktree} onClick={() => void createWorktree()}>{saving ? 'Creating…' : 'Create worktree'}</button>{createdWorktree && <button className="btn self-end" onClick={() => { if (body.trim() && !window.confirm('Discard your unpublished review message and open the worktree?')) return; onClose(); useApp.getState().closePullRequestsModal(); void useApp.getState().openRepo(createdWorktree); }}>Open review workspace</button>}</div>
        {createdWorktree && <p className="text-add break-all">{createdWorktree}</p>}
      </div>}
      <nav className="flex gap-2 border-b border-edge px-4 py-2">
        {(['files', 'conversation', 'checks'] as const).map(t => <button key={t} className={`btn text-xs ${tab === t ? '!bg-panel3 !text-accent' : ''}`} onClick={() => setTab(t)}>{t === 'files' ? `Files (${data?.files.length || 0})` : t === 'conversation' ? `Conversation (${data?.comments.length || 0})` : `CI (${data?.checks.length || 0})`}</button>)}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto">
        {!data ? <p className="p-6 text-xs text-dim">{loading ? 'Loading review…' : 'Review could not be loaded. Refresh to retry.'}</p> : tab === 'files' ? <div className="flex h-full min-h-0">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-edge p-2">{data.files.map(f => <button key={f.path} title={f.path} className={`w-full rounded px-2 py-2 text-left text-xs ${f.path === filePath ? 'bg-panel3 text-accent' : 'hover:bg-panel2'}`} onClick={() => setFilePath(f.path)}><span className="block truncate">{f.path}</span><span className="text-[10px] text-dim">{f.status}</span></button>)}</aside>
          <div className="min-w-0 flex-1 overflow-auto selectable">
            <h3 className="sticky top-0 border-b border-edge bg-panel2 px-3 py-2 text-xs font-mono">{file?.path || 'No changed files'}</h3>
            {file?.unavailable || !file?.patch ? <p className="p-5 text-xs text-dim">No text patch is available. Review this file on the provider.</p> : <div className="code-surface">{lines.slice(0, 4000).map((l, i) => <div key={i} className={`flex min-w-max ${l.kind === 'add' ? 'bg-add/10' : l.kind === 'del' ? 'bg-del/10' : l.kind === 'hunk' ? 'bg-panel3 text-dim' : ''}`}>
              <button disabled={l.oldNo == null || saving || loading} title="Comment on old line" className="code-surface w-[6ch] shrink-0 px-[1ch] text-right text-faint enabled:hover:bg-accent/20 enabled:hover:text-accent" onClick={() => { setInline({ path: file.path, side: 'old', line: l.oldNo! }); setReplyTo(undefined); setAction('comment'); }}>{l.oldNo ?? ''}</button>
              <button disabled={l.newNo == null || saving || loading} title="Comment on new line" className="code-surface w-[6ch] shrink-0 border-r border-edge px-[1ch] text-right text-faint enabled:hover:bg-accent/20 enabled:hover:text-accent" onClick={() => { setInline({ path: file.path, side: 'new', line: l.newNo! }); setReplyTo(undefined); setAction('comment'); }}>{l.newNo ?? ''}</button>
              <pre className="code-surface m-0 px-3">{l.text}</pre>
            </div>)}</div>}
            {lines.length > 4000 && <p className="p-3 text-xs text-warn">Showing the first 4,000 patch lines. Open the provider for the rest.</p>}
          </div>
        </div> : tab === 'checks' ? <div className="space-y-2 p-4">{!data.checks.length && <p className="text-xs text-dim">No CI results were returned for this revision. Check the warnings for missing permissions.</p>}{data.checks.map((check, i) => <div key={i} className="flex items-center gap-3 rounded border border-edge p-3 text-xs"><span className="flex-1">{check.name}</span><span className={/^(success|successful|passed)$/i.test(check.state) ? 'text-add' : /fail|error|cancel/i.test(check.state) ? 'text-del' : 'text-dim'}>{check.state}</span>{safeUrl(check.url) && <a href={safeUrl(check.url)} target="_blank" rel="noreferrer" className="text-accent"><ExternalLink size={13} /></a>}</div>)}</div> : <div className="space-y-3 p-4 selectable">
          {data.description && <pre className="whitespace-pre-wrap rounded border border-edge p-3 text-xs">{data.description}</pre>}
          {data.comments.map(c => <article key={c.id} className="rounded-lg border border-edge p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><strong>{c.author}</strong><span className="text-dim">{c.state || (c.resolved === true ? 'Resolved' : c.resolved === false ? 'Unresolved' : '')}</span><span className="text-faint">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span></div>{c.path && <p className="mt-1 font-mono text-accent">{c.path}:{c.line} ({c.side})</p>}<p className="mt-2 whitespace-pre-wrap break-words">{c.body}</p>{(target.provider === 'github' ? /^\d+$/.test(c.id) && !!c.path : !c.state) && <button className="btn mt-2 text-xs" disabled={saving} onClick={() => { setReplyTo({ id: c.id, threadId: c.threadId }); setInline(undefined); setAction('comment'); }}><MessageSquare size={12} /> Reply</button>}</article>)}
        </div>}
      </div>
      <footer className="max-h-[42vh] shrink-0 overflow-auto border-t border-edge bg-panel2/30 p-3">
        {data?.warnings.map((w, i) => <p key={i} className="mb-1 text-[11px] text-warn">{w}</p>)}
        {message && <p role="status" className="mb-2 whitespace-pre-wrap text-xs text-accent">{message}</p>}
        <form onSubmit={submit} className="space-y-2">
          {(inline || replyTo) && <div className="flex items-center gap-2 text-xs text-accent"><span>{inline ? `Comment on ${inline.path}:${inline.line} (${inline.side})` : `Reply to comment #${replyTo!.id}`}</span><button type="button" title="Clear comment target" className="btn-icon" disabled={saving} onClick={() => { setInline(undefined); setReplyTo(undefined); }}><X size={12} /></button></div>}
          <textarea aria-label="Review message" className="w-full resize-y text-xs" rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Write a review or select a line number to comment on the diff…" maxLength={60_000} disabled={saving} />
          <div className="flex items-center justify-between gap-3"><select aria-label="Review action" className="text-xs" value={action} disabled={saving || !!inline || !!replyTo} onChange={e => setAction(e.target.value as typeof action)}><option value="comment">Comment</option><option value="approve">Approve</option><option value="request-changes">{data?.changeRequestMode === 'discussion' ? 'Request changes (discussion)' : 'Request changes'}</option></select><button type="submit" className="btn-primary text-xs !px-4" disabled={!data || loading || saving || (action !== 'approve' && !body.trim())}>{saving ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} {action === 'approve' ? 'Submit approval' : action === 'request-changes' ? 'Submit change request' : 'Post comment'}</button></div>
        </form>
      </footer>
    </div>
  </div>;
}
