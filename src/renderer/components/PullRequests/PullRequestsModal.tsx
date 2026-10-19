import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  X
} from 'lucide-react';
import type {
  HostedPullRequest,
  PullRequestContext,
  PullRequestCredentialStatus,
  PullRequestProvider,
  RemoteInfo
} from '../../../shared/types';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';
import { PullRequestReview } from './PullRequestReview';

const providerInfo: Record<PullRequestProvider, { label: string }> = {
  github: { label: 'GitHub' },
  gitlab: { label: 'GitLab' },
  bitbucket: { label: 'Bitbucket Cloud' }
};

function dateLabel(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function branchTitle(branch: string): string {
  return branch.replace(/^(feature|feat|bugfix|fix|hotfix|release)[/\-_]+/i, '').replace(/[-_]/g, ' ').trim();
}

export function PullRequestsModal() {
  const [reviewRequest, setReviewRequest] = useState<HostedPullRequest | null>(null);
  const repoPath = useApp(s => s.activeTab);
  const isOpen = useApp((state) => state.pullRequestsModalOpen);
  const close = useApp((state) => state.closePullRequestsModal);
  const notify = useApp((state) => state.notify);
  const branches = useApp((state) => state.branches);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [selectedRemote, setSelectedRemote] = useState('');
  const [providerOverride, setProviderOverride] = useState<PullRequestProvider | undefined>();
  const [context, setContext] = useState<PullRequestContext | null>(null);
  const [credentialStatus, setCredentialStatus] = useState<PullRequestCredentialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const loadId = useRef(0);

  const activeProvider = context?.provider || providerOverride;
  const provider = activeProvider ? providerInfo[activeProvider] : null;
  const currentBranchRequest = useMemo(() =>
    context?.pullRequests.find((request) => request.sourceBranch === context.currentBranch && request.state === 'open') || null,
  [context]);
  const selectedRequest = context?.pullRequests.find((request) => request.id === selectedRequestId) || currentBranchRequest;
  const configured = context ? context.credentialConfigured : activeProvider ? !!credentialStatus?.[activeProvider] : false;

  const loadContext = useCallback(async (remoteName?: string, override?: PullRequestProvider, currentRemotes?: RemoteInfo[]) => {
    const requestId = ++loadId.current;
    setLoading(true);
    setMessage('');
    try {
      const [result, savedCredentials] = await Promise.all([
        api.getPullRequestContext(remoteName, override),
        api.getPullRequestCredentialStatus()
      ]);
      if (requestId !== loadId.current) return;
      setContext(result);
      setCredentialStatus(savedCredentials);
      if (result.error) setMessage(result.error);
      if (result.remoteName) setSelectedRemote(result.remoteName);
      if (result.provider && result.defaultBranch) setTargetBranch((existing) => existing || result.defaultBranch);
      if (result.currentBranch) setTitle((existing) => existing || branchTitle(result.currentBranch));
      if (!result.provider && currentRemotes && currentRemotes.length === 0) setMessage(result.error || 'Add a Git remote to view hosted requests.');
    } catch (error) {
      if (requestId === loadId.current) setMessage(String(error).replace(/^Error:\s*/, ''));
    } finally {
      if (requestId === loadId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    setContext(null);
    setReviewRequest(null);
    setTitle('');
    setDescription('');
    setTargetBranch('');
    setProviderOverride(undefined);
    setSelectedRequestId(null);
    setMessage('');
    void Promise.all([api.getRemotes(), api.getPullRequestCredentialStatus()]).then(([remoteList, savedCredentials]) => {
      if (!current) return;
      setRemotes(remoteList);
      setCredentialStatus(savedCredentials);
      const tracking = branches.local.find((branch) => branch.isCurrent)?.tracking || '';
      const trackingRemote = tracking.split('/')[0];
      const initialRemote = remoteList.find((remote) => remote.name === trackingRemote)?.name ||
        remoteList.find((remote) => remote.name === 'origin')?.name || remoteList[0]?.name || '';
      setSelectedRemote(initialRemote);
      void loadContext(initialRemote || undefined, undefined, remoteList);
    }).catch((error) => {
      if (current) setMessage(String(error).replace(/^Error:\s*/, ''));
    });
    return () => {
      current = false;
      loadId.current++;
    };
  }, [isOpen, repoPath, loadContext]);

  useEffect(() => {
    if (!context) return;
    setTargetBranch(context.defaultBranch || '');
    setSelectedRequestId(null);
  }, [context?.remoteName, context?.provider, context?.defaultBranch]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (selectedRequest) setSelectedRequestId(selectedRequest.id);
  }, [selectedRequest?.id]);

  if (!isOpen) return null;
  if (reviewRequest && context?.provider && context.remoteName) return <PullRequestReview key={`${repoPath}:${context.remoteName}:${reviewRequest.id}`} request={reviewRequest} target={{ provider: context.provider, remoteName: context.remoteName, requestId: reviewRequest.id }} onClose={() => setReviewRequest(null)} />;

  const selectRemote = (remoteName: string) => {
    setSelectedRemote(remoteName);
    setContext(null);
    setProviderOverride(undefined);
    setMessage('');
    if (remoteName) void loadContext(remoteName, undefined, remotes);
  };

  const selectProvider = (nextProvider: PullRequestProvider | '') => {
    const value = nextProvider || undefined;
    setProviderOverride(value);
    setContext(null);
    setMessage('');
    if (selectedRemote) void loadContext(selectedRemote, value, remotes);
  };

  const openProviderSettings = () => {
    close();
    useSettings.getState().openSettings('providers');
  };

  const createRequest = async (event: React.FormEvent, selectedProvider: { label: string }) => {
    event.preventDefault();
    if (!context?.remoteName || creatingRequest) return;
    setCreatingRequest(true);
    setMessage('Pushing the current branch and creating the request…');
    try {
      const result = await api.createHostedPullRequest({
        remoteName: context.remoteName,
        title,
        description,
        targetBranch,
        providerOverride
      });
      if (!result.ok || !result.pullRequest) throw new Error(result.error || 'Could not create the request.');
      setSelectedRequestId(result.pullRequest.id);
      await loadContext(context.remoteName, providerOverride, remotes);
      setMessage('Request created.');
      notify('success', `${selectedProvider.label} request created`);
    } catch (error) {
      setMessage(String(error).replace(/^Error:\s*/, ''));
    } finally {
      setCreatingRequest(false);
    }
  };

  const activePullRequests = context?.pullRequests.filter((request) => request.state === 'open') || [];
  const providerNeedsChoosing = !context?.provider && !!context?.remoteName;
  const canCreate = !!context?.credentialConfigured && !!context.currentBranch && !!context.defaultBranch &&
    !context.error && context.currentBranch !== targetBranch && !!title.trim() && !currentBranchRequest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div className="w-full max-w-6xl max-h-[90vh] rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shrink-0">
              <GitPullRequest size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">Pull request context</h2>
              <p className="text-[11px] text-dim truncate">GitHub pull requests, GitLab merge requests, and Bitbucket pull requests</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="btn-icon !w-8 !h-8 text-dim hover:text-fg"
              title="Refresh pull requests"
              onClick={() => void loadContext(selectedRemote, providerOverride, remotes)}
              disabled={loading || !selectedRemote}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            <button className="btn-icon !w-8 !h-8 text-dim hover:text-fg" onClick={close} title="Close"><X size={15} /></button>
          </div>
        </header>

        <div className="flex items-center gap-3 px-5 py-3 border-b border-edge bg-panel2/20 shrink-0">
          <label className="text-[11px] text-dim shrink-0" htmlFor="pr-remote">Git remote</label>
          <select
            id="pr-remote"
            className="input !w-auto min-w-44 max-w-xs text-xs"
            value={selectedRemote}
            onChange={(event) => selectRemote(event.target.value)}
            disabled={!remotes.length || loading}
          >
            {remotes.length === 0 ? <option value="">No remote configured</option> : null}
            {remotes.map((remote) => <option key={remote.name} value={remote.name}>{remote.name} · {remote.fetchUrl}</option>)}
          </select>
          {context?.provider && provider ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel px-2.5 py-1 text-[10px] text-dim">
              <span className="w-1.5 h-1.5 rounded-full bg-add" />{provider.label}
            </span>
          ) : null}
          {context?.repository ? <span className="text-[11px] text-faint truncate">{context.repository}</span> : null}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-edge">
            <div className="px-4 py-3 border-b border-edge flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-fg">Open requests</h3>
                <p className="text-[10px] text-dim mt-0.5">{context?.currentBranch ? <>Current branch: <span className="font-mono text-accent">{context.currentBranch}</span></> : 'Choose a remote to load request context'}</p>
              </div>
              {context?.repositoryUrl ? <a href={context.repositoryUrl} target="_blank" rel="noreferrer" className="btn !px-2 !py-1 text-[10px] gap-1"><ExternalLink size={11} /> Repository</a> : null}
            </div>

            {providerNeedsChoosing ? (
              <div className="p-5 border-b border-edge bg-panel2/25 space-y-2">
                <div className="text-xs font-medium text-fg">Choose the hosting service</div>
                <p className="text-[11px] text-dim">For a self-hosted GitLab remote, connect its instance URL in provider settings, then reopen this workspace.</p>
                <button className="btn-secondary text-xs" onClick={openProviderSettings}>Configure GitLab server</button>
                <select className="input max-w-xs text-xs" value={providerOverride || ''} onChange={(event) => selectProvider(event.target.value as PullRequestProvider | '')}>
                  <option value="">Select provider…</option>
                  <option value="gitlab">GitLab (including self-managed)</option>
                </select>
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {loading && !context ? (
                <div className="py-14 flex flex-col items-center gap-2 text-xs text-dim"><Loader2 size={18} className="animate-spin text-accent" />Loading repository context…</div>
              ) : !context?.provider ? (
                <div className="py-12 px-6 text-center text-xs text-dim">
                  <GitBranch size={21} className="mx-auto mb-2 text-faint" />
                  {message || context?.error || 'Add a Git remote to view pull requests.'}
                </div>
              ) : context.error ? (
                <div className="rounded-lg border border-warn/30 bg-warn/5 p-4 text-[11px] leading-relaxed text-warn">
                  <AlertCircle size={14} className="inline mr-1.5" />{context.error}
                </div>
              ) : !configured ? (
                <div className="py-12 px-6 text-center text-xs text-dim">
                  <KeyRound size={22} className="mx-auto mb-2 text-faint" />
                  Connect your {provider?.label} account to load open requests for this repository.
                </div>
              ) : loading && !context.pullRequests.length ? (
                <div className="py-14 flex flex-col items-center gap-2 text-xs text-dim"><Loader2 size={18} className="animate-spin text-accent" />Loading open requests…</div>
              ) : activePullRequests.length === 0 ? (
                <div className="py-12 px-6 text-center text-xs text-dim">
                  <CheckCircle2 size={22} className="mx-auto mb-2 text-add" />No open requests found for this repository.
                </div>
              ) : activePullRequests.map((request) => <PullRequestRow
                key={request.id}
                request={request}
                isCurrent={request.sourceBranch === context.currentBranch}
                isSelected={request.id === selectedRequest?.id}
                onSelect={() => setSelectedRequestId(request.id)}
              />)}
            </div>

            {selectedRequest ? <RequestDetails request={selectedRequest} onReview={() => setReviewRequest(selectedRequest)} /> : null}
          </section>

          <section className="min-h-0 overflow-y-auto p-5 space-y-5">
            {!provider ? (
              <div className="rounded-xl border border-edge bg-panel2/30 p-5 text-xs text-dim">
                <AlertCircle size={16} className="text-warn mb-2" />Choose a supported hosting service to connect an account.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-edge bg-panel2/35 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent"><Settings2 size={14} /></div>
                      <div>
                        <h3 className="text-xs font-semibold text-fg">{provider.label} provider settings</h3>
                        <p className="text-[10px] text-dim mt-0.5">Manage this provider’s access token in Settings.</p>
                      </div>
                    </div>
                    {configured ? <span className="text-[10px] text-add flex items-center gap-1"><CheckCircle2 size={12} /> Token saved</span> : null}
                  </div>
                  <div className="pl-9 space-y-2">
                    <p className="text-[10px] text-dim leading-relaxed">
                      {configured
                        ? 'Your token is stored encrypted on this device. You can replace or remove it from the provider settings page.'
                        : 'No token is saved for this provider yet. Add one in Settings to load requests and create new ones.'}
                    </p>
                    <button className="btn text-[10px] !px-2.5 !py-1.5" onClick={openProviderSettings}>
                      <Settings2 size={12} /> {configured ? 'Manage provider settings' : 'Configure in Settings'}
                    </button>
                  </div>
                </div>

                {configured ? (
                  <form className="rounded-xl border border-edge bg-panel2/35 p-4 space-y-3" onSubmit={(event) => void createRequest(event, provider)}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-fg">Create from current branch</h3>
                        <p className="text-[10px] text-dim mt-0.5">Git Workbench pushes this branch, then creates a request.</p>
                      </div>
                      {context?.currentBranch ? <span className="max-w-36 truncate text-[10px] font-mono text-accent" title={context.currentBranch}>{context.currentBranch}</span> : null}
                    </div>
                    {currentBranchRequest ? (
                      <div className="rounded-lg border border-add/25 bg-add/5 p-3 text-[11px] text-dim flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-add shrink-0" />An open request already exists for this branch.
                        <button type="button" className="ml-auto text-accent hover:underline shrink-0" onClick={() => setSelectedRequestId(currentBranchRequest.id)}>View</button>
                      </div>
                    ) : (
                      <>
                        <label className="block text-[10px] text-dim space-y-1">
                          Target branch
                          <input className="input w-full font-mono text-xs" value={targetBranch} onChange={(event) => setTargetBranch(event.target.value)} placeholder="main" required />
                        </label>
                        <label className="block text-[10px] text-dim space-y-1">
                          Title
                          <input className="input w-full text-xs" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What does this change do?" required />
                        </label>
                        <label className="block text-[10px] text-dim space-y-1">
                          Description <span className="text-faint">(optional)</span>
                          <textarea className="input w-full min-h-24 resize-y text-xs" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context for reviewers…" />
                        </label>
                        <p className="text-[10px] text-faint leading-relaxed">Only committed changes are pushed. Uncommitted edits remain in your working tree and are not part of the request.</p>
                        <button type="submit" className="btn btn-primary w-full justify-center !py-2 text-xs" disabled={!canCreate || creatingRequest}>
                          {creatingRequest ? <><Loader2 size={13} className="animate-spin" /> Pushing branch &amp; creating…</> : <><GitPullRequest size={13} /> Push branch &amp; create {activeProvider === 'gitlab' ? 'merge request' : 'pull request'}</>}
                        </button>
                      </>
                    )}
                  </form>
                ) : null}
              </>
            )}

            {message ? <div className={`rounded-lg border p-3 text-[11px] leading-relaxed ${/created\.$/.test(message) ? 'border-add/30 bg-add/5 text-add' : /Pushing/.test(message) ? 'border-accent/30 bg-accent/5 text-accent' : 'border-warn/30 bg-warn/5 text-warn'}`}>
              {/Pushing/.test(message) ? <Loader2 size={12} className="inline mr-1.5 animate-spin" /> : <AlertCircle size={12} className="inline mr-1.5" />}{message}
            </div> : null}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-edge bg-panel2/30 shrink-0">
          <span className="text-[10px] text-faint">{configured ? `${activePullRequests.length} open request${activePullRequests.length === 1 ? '' : 's'}` : 'Access tokens stay encrypted on this device.'}</span>
          <button className="btn !px-3 !py-1.5 text-[11px]" onClick={close}>Done</button>
        </footer>
      </div>
    </div>
  );
}

function PullRequestRow({
  request,
  isCurrent,
  isSelected,
  onSelect
}: {
  request: HostedPullRequest;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${isSelected ? 'border-accent/40 bg-accent/8' : 'border-edge/70 bg-panel2/20 hover:bg-panel2/60'}`}
    >
      <div className="flex items-start gap-2.5">
        <GitPullRequest size={14} className={`mt-0.5 shrink-0 ${request.draft ? 'text-dim' : 'text-add'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-xs font-medium text-fg">{request.title}</span>
            {isCurrent ? <span className="shrink-0 text-[9px] rounded bg-accent/15 px-1.5 py-0.5 text-accent">Current branch</span> : null}
          </div>
          <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap text-[10px] text-dim">
            <span className="font-mono">{request.sourceBranch}</span><span>→</span><span className="font-mono">{request.targetBranch}</span>
            <span>·</span><span>{request.author}</span>
            {dateLabel(request.updatedAt || request.createdAt) ? <><span>·</span><span>{dateLabel(request.updatedAt || request.createdAt)}</span></> : null}
            {request.draft ? <span className="rounded border border-edge px-1 py-0.5 text-faint">Draft</span> : null}
          </div>
        </div>
        <span className="text-[10px] font-mono text-faint">#{request.id}</span>
      </div>
    </button>
  );
}

function RequestDetails({ request, onReview }: { request: HostedPullRequest; onReview: () => void }) {
  return (
    <div className="shrink-0 border-t border-edge bg-panel2/30 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] text-dim">
        <GitBranch size={12} className="text-accent" />
        <span className="font-mono truncate">{request.sourceBranch}</span><span>→</span><span className="font-mono truncate">{request.targetBranch}</span>
        <span className="ml-auto text-faint">{request.draft ? 'Draft' : 'Open'}</span>
      </div>
      <a href={request.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-accent hover:underline">
        Open on provider <ExternalLink size={11} />
      </a>
      <button className="btn-primary mt-3 text-xs" onClick={onReview}>Review changes, conversation &amp; CI</button>
    </div>
  );
}
