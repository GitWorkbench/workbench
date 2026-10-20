import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GitPullRequest, Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react';
import type { PullRequestContext, PullRequestProvider, RemoteInfo } from '../../../shared/types';
import { requestLabel } from '../../../shared/hosting-provider';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';

export function SidebarPullRequests({ repo, remotes, query, enabled = true }: { repo: string; remotes: RemoteInfo[]; query: string; enabled?: boolean }) {
  const [open, setOpen] = useState(true);
  const [remote, setRemote] = useState('');
  const [loadedContext, setContext] = useState<PullRequestContext | null>(null);
  const [detected, setDetected] = useState<{ key: string; provider: PullRequestProvider | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const modalOpen = useApp(s => s.pullRequestsModalOpen);
  const currentBranch = useApp(s => s.status?.currentBranch);
  const remoteKey = JSON.stringify(remotes.map(item => [item.name, item.fetchUrl, item.pushUrl]));
  const requestedRemote = remotes.some(item => item.name === remote) ? remote : '';
  const selectionKey = JSON.stringify([remoteKey, requestedRemote, requestedRemote ? '' : currentBranch]);
  const context = detected?.key === selectionKey ? loadedContext : null;
  useEffect(() => {
    if (!enabled || modalOpen) { setLoading(false); return; }
    const id = ++generation.current;
    setContext(null); setError('');
    if (!remotes.length) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api.getPullRequestContext(requestedRemote || undefined).then(value => {
        if (id !== generation.current || useApp.getState().activeTab !== repo) return;
        setContext(value);
        setDetected({ key: selectionKey, provider: value.provider });
        setError(value.error || '');
      }).catch(reason => {
        if (id === generation.current && useApp.getState().activeTab === repo) setError(String(reason).replace(/^Error:\s*/, ''));
      }).finally(() => { if (id === generation.current) setLoading(false); });
    }, 200);
    return () => { generation.current++; window.clearTimeout(timer); };
  }, [repo, remoteKey, remote, refresh, currentBranch, modalOpen, enabled]);
  const provider = context?.provider || (detected?.key === selectionKey ? detected.provider : null);
  const label = requestLabel(provider);
  const requestRemote = requestedRemote || context?.remoteName;
  const requests = context?.pullRequests.filter(request => request.state === 'open') || [];
  const filtered = requests.filter(request => `${request.id} ${request.title} ${request.sourceBranch} ${request.targetBranch} ${request.author}`.toLowerCase().includes(query.toLowerCase()));
  const openWorkspace = () => useApp.getState().openPullRequestsModal({ remoteName: requestRemote || undefined });
  return <section className="border-b border-edge/60" aria-label={label}>
    <div className="flex items-center gap-1 pr-2 hover:bg-panel2/40">
      <button className="flex flex-1 min-w-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-dim hover:text-fg" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="flex-1 text-left">{label}</span><span className="rounded bg-panel3 px-1.5 text-[10px]">{loading ? '…' : requests.length}</span>
      </button>
      <button className="btn-icon !w-5 !h-5" aria-label={`Refresh sidebar ${label.toLowerCase()}`} disabled={loading || !remotes.length} onClick={() => setRefresh(value => value + 1)}>{loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}</button>
      <button className="btn-icon !w-5 !h-5" aria-label={`Create ${requestLabel(provider, false).toLowerCase()}`} disabled={!remotes.length} onClick={() => useApp.getState().openPullRequestsModal({ remoteName: requestRemote || undefined, mode: 'create' })}><Plus size={11} /></button>
    </div>
    {open && <div className="pb-2">
      {remotes.length > 1 && <div className="px-3 pb-2"><select aria-label="Sidebar request remote" className="input w-full text-xs" disabled={loading} value={requestedRemote || context?.remoteName || ''} onChange={event => setRemote(event.target.value)}><option value="">Tracking remote / auto</option>{remotes.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></div>}
      {loading ? <p className="px-3 py-2 text-xs text-dim">Loading {label.toLowerCase()}…</p> : !remotes.length ? <p className="px-3 py-2 text-xs text-dim">Add a remote to view requests.</p> : error || !context?.credentialConfigured ? <div className="px-3 py-2 space-y-2"><p role={error ? 'status' : undefined} className="text-xs leading-relaxed break-words text-dim">{error || 'Connect this remote’s provider to load requests.'}</p><button className="inline-flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => useSettings.getState().openSettings('providers')}><Settings2 size={11} />Provider settings</button>{error && <button className="ml-2 text-xs text-accent hover:underline" onClick={() => setRefresh(value => value + 1)}>Retry</button>}</div> : filtered.length ? <div className="max-h-72 overflow-auto">{filtered.map(request => <button
        key={request.id}
        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-panel2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]"
        title={`#${request.id} ${request.title}\n${request.sourceBranch} → ${request.targetBranch}\n${request.author}${request.draft ? ' · Draft' : ''}`}
        onClick={() => { if (useApp.getState().activeTab === repo) useApp.getState().openPullRequestsModal({ remoteName: requestRemote || undefined, requestId: request.id, mode: 'review' }); }}
      ><GitPullRequest size={12} className={`mt-0.5 shrink-0 ${request.draft ? 'text-dim' : 'text-add'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-fg">{request.title}</span><span className="block truncate mt-0.5 text-[10px] text-dim">#{request.id} · {request.author}{request.draft ? ' · Draft' : ''}</span></span>{request.sourceBranch === context?.currentBranch && <span className="shrink-0 text-accent" aria-label="Current branch">●</span>}</button>)}</div> : <p className="px-3 py-2 text-xs text-dim">{query && requests.length ? `No matching ${label.toLowerCase()}.` : `No open ${label.toLowerCase()}.`}</p>}
      {context?.credentialConfigured && !error && <p className="px-3 pt-1 text-[10px] text-faint">Up to 100 open {label.toLowerCase()} per remote.</p>}
      {!!remotes.length && <button className="mx-3 mt-1 text-xs text-accent hover:underline" onClick={openWorkspace}>Open {label.toLowerCase()}</button>}
    </div>}
  </section>;
}
