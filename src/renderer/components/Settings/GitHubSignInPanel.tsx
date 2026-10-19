import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Github, Loader2, RefreshCw, Unplug, X } from 'lucide-react';
import type { GitHubSignInState } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

const messageOf = (reason: unknown) => String(reason).replace(/^Error:\s*/, '');

export function GitHubSignInPanel() {
  const notify = useApp(state => state.notify);
  const [state, setState] = useState<GitHubSignInState | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(false);
  const phase = useRef<GitHubSignInState['phase']>('idle');

  const receive = (next: GitHubSignInState) => {
    if (!mounted.current) return;
    if (next.phase === 'success' && (phase.current === 'waiting' || phase.current === 'requesting')) {
      notify('success', next.account ? `Signed in to GitHub as @${next.account.login}` : 'Signed in to GitHub');
      setManual(false);
      setToken('');
    }
    phase.current = next.phase;
    setState(next);
  };

  useEffect(() => {
    mounted.current = true;
    let disposed = false, receivedEvent = false;
    const unsubscribe = api.onGitHubSignInState(next => { receivedEvent = true; receive(next); });
    void api.getGitHubSignInState().then(next => {
      if (!disposed && !receivedEvent) receive(next);
    }).catch(reason => { if (!disposed) setError(messageOf(reason)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; mounted.current = false; unsubscribe(); };
  }, []);

  const waiting = state?.phase === 'requesting' || state?.phase === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting, state?.expiresAt]);

  const run = async (name: string, action: () => Promise<void>) => {
    setOperation(name);
    setError('');
    try { await action(); }
    catch (reason) { if (mounted.current) setError(messageOf(reason)); }
    finally { if (mounted.current) setOperation(''); }
  };
  const start = () => run('start', async () => {
    const next = await api.startGitHubSignIn();
    receive(next);
    if (next.flowId && next.phase === 'waiting') await api.openGitHubSignInPage(next.flowId);
  });
  const disconnect = () => run('disconnect', async () => {
    const result = await api.removePullRequestCredential('github');
    if (!result.ok) throw new Error(result.error || 'Could not disconnect GitHub.');
    receive(await api.getGitHubSignInState());
    setToken('');
    notify('success', 'GitHub disconnected on this device');
  });
  const saveToken = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    void run('save', async () => {
      const result = await api.savePullRequestCredential('github', { token: token.trim() });
      if (!result.ok) throw new Error(result.error || 'Could not save the GitHub token.');
      receive(await api.getGitHubSignInState());
      setToken(''); setManual(false);
      notify('success', 'GitHub token saved securely');
    });
  };
  const busy = loading || !!operation;
  const secondsLeft = Math.max(0, Math.ceil(((state?.expiresAt ? Date.parse(state.expiresAt) : now) - now) / 1000));
  const codeActive = !!state?.flowId && !!state?.userCode && secondsLeft > 0;
  const status = loading ? 'Checking' : waiting ? 'Signing in' : state?.needsSignIn ? 'Sign in again' : state?.connected ? state.method === 'device' ? 'Connected' : 'Token saved' : 'Not connected';

  return (
    <section className="rounded-xl border border-edge bg-panel2/40 p-4 space-y-4 xl:col-span-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl border border-edge bg-panel flex items-center justify-center text-fg"><Github size={21} /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg">GitHub</h3>
            <p className="mt-0.5 text-[11px] text-dim">Sign in through your browser to connect pull requests and reviews.</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${state?.connected && !waiting ? 'border-add/25 bg-add/5 text-add' : 'border-edge bg-panel text-dim'}`}>
          {loading || waiting ? <Loader2 size={11} className="animate-spin" /> : state?.connected ? <CheckCircle2 size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}{status}
        </span>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-del/30 bg-del-bg/20 p-3 text-[11px] leading-relaxed text-del"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</div> : null}

      {state?.method && !waiting ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-panel/60 p-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-fg">{state.account ? `@${state.account.login}` : 'Personal access token saved'}</div>
            <p className="mt-1 text-[11px] text-dim">{state.account?.name ? `${state.account.name} · ` : ''}{state.needsSignIn ? 'Session needs reconnection' : state.method === 'device' ? 'Connected with GitHub sign-in' : 'Using a manually configured token'}</p>
          </div>
          <button type="button" className="btn-secondary text-[11px]" onClick={() => void disconnect()} disabled={busy}>
            {operation === 'disconnect' ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}Disconnect
          </button>
        </div>
      ) : null}

      {waiting ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-fg">Continue on GitHub</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-dim">Enter this code at github.com/login/device, then approve Git Workbench Desktop, the registered GitHub App for Git Workbench.</p>
            </div>
            <button type="button" className="btn text-[11px]" disabled={!state?.flowId || operation === 'cancel'} onClick={() => void run('cancel', async () => { receive(await api.cancelGitHubSignIn(state!.flowId!)); })}><X size={12} />Cancel</button>
          </div>
          {state?.userCode ? (
            <div className="flex flex-wrap items-center gap-3">
              <code className="select-text rounded-lg border border-edge bg-panel px-4 py-2.5 font-mono text-xl tracking-[0.18em] text-fg" aria-label={`GitHub verification code ${state.userCode}`}>{state.userCode}</code>
              <button type="button" className="btn-secondary text-[11px]" disabled={!codeActive || busy} onClick={() => void run('copy', async () => { await api.copyGitHubSignInCode(state.flowId!); notify('success', 'GitHub sign-in code copied'); })}><Copy size={12} />Copy code</button>
              <button type="button" className="btn-primary text-[11px]" disabled={!codeActive || busy} onClick={() => void run('open', async () => { await api.openGitHubSignInPage(state.flowId!); })}><ExternalLink size={12} />Open GitHub</button>
            </div>
          ) : <div className="flex items-center gap-2 text-[11px] text-dim"><Loader2 size={13} className="animate-spin" />Requesting sign-in code…</div>}
          <p className="text-[11px] leading-relaxed text-dim">{state?.message}</p>
          {state?.expiresAt ? <p className="text-[10px] text-faint">{secondsLeft > 0 ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}. This panel updates automatically after approval.` : 'This code has expired. Cancel and start again for a new code.'}</p> : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary text-xs !px-4 !py-2" disabled={busy || !state?.configured || !state?.secureStorageAvailable} onClick={() => void start()}>
            {operation === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
            {state?.needsSignIn ? 'Sign in again with GitHub' : state?.connected && state.method === 'device' ? 'Switch GitHub account' : 'Sign in with GitHub'}
          </button>
          <p className="text-[11px] text-dim">No access token to copy. Your Git SSH setup stays in use.</p>
        </div>
      )}

      {!waiting && state?.message ? <p role="status" className={`text-[11px] leading-relaxed ${!state.secureStorageAvailable || state.phase === 'error' || state.phase === 'expired' ? 'text-del' : 'text-dim'}`}>{state.message}</p> : null}
      {!loading && !state?.configured && !state?.message ? <p className="text-[11px] text-dim">Browser sign-in is unavailable in this build. You can connect with an access token below.</p> : null}
      {state?.needsSignIn ? <p className="text-[11px] text-del">Your GitHub session expired or was revoked. Sign in again to reconnect.</p> : null}

      {state?.method === 'device' && state.connected && !waiting ? (
        <div className="rounded-lg border border-edge bg-panel/40 p-3 space-y-2.5">
          <div>
            <h4 className="text-xs font-semibold text-fg">Repository access</h4>
            <p className="mt-1 text-[11px] leading-relaxed text-dim">{state.account?.installations === 0 ? 'Choose repositories on GitHub to enable pull requests. Sign-in alone does not grant repository access.' : 'Choose which repositories Git Workbench can access on GitHub. Organization repositories may need an owner’s approval.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state.installationUrl ? <a href={state.installationUrl} target="_blank" rel="noreferrer" className="btn-secondary text-[11px]"><ExternalLink size={12} />Choose repositories on GitHub</a> : null}
            <button type="button" className="btn text-[11px]" disabled={busy} onClick={() => void run('refresh', async () => { receive(await api.refreshGitHubAccount()); notify('success', 'GitHub account access refreshed'); })}><RefreshCw size={12} className={operation === 'refresh' ? 'animate-spin' : ''} />Refresh access</button>
          </div>
        </div>
      ) : null}

      {!waiting ? (
        <div className="border-t border-edge/70 pt-3">
          <button type="button" aria-expanded={manual} aria-controls="github-manual-token" className="flex items-center gap-1.5 text-[11px] text-dim hover:text-fg" disabled={busy} onClick={() => { setManual(!manual); setToken(''); setShowToken(false); }}><ChevronDown size={13} className={manual ? 'rotate-180' : ''} />{state?.method === 'token' ? 'Replace access token' : 'Use an access token instead'}</button>
          {manual ? (
            <form id="github-manual-token" className="mt-3 space-y-3" onSubmit={saveToken}>
              <p className="text-[11px] leading-relaxed text-dim">Use a fine-grained token with Pull requests read/write and Contents read for your repositories. CI results also need Checks read and Commit statuses read.</p>
              <label className="block space-y-1 text-[11px] text-dim">Personal access token
                <div className="mt-1 flex gap-1.5">
                  <input type={showToken ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} className="input min-w-0 flex-1 text-xs" value={token} onChange={event => setToken(event.target.value)} placeholder="Paste your access token" required disabled={busy} />
                  <button type="button" className="btn-secondary !px-2" aria-label={showToken ? 'Hide token' : 'Show token'} onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                </div>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">Create an access token <ExternalLink size={11} /></a>
                <button type="submit" className="btn-primary text-[11px]" disabled={busy || !token.trim() || !state?.secureStorageAvailable}>{operation === 'save' ? <Loader2 size={12} className="animate-spin" /> : null}{state?.method ? 'Replace connection with token' : 'Save token'}</button>
              </div>
            </form>
          ) : null}
          <p className="mt-3 text-[10px] leading-relaxed text-faint">Disconnect removes credentials from this device. To revoke GitHub access, manage Git Workbench Desktop in <a href="https://github.com/settings/apps/authorizations" target="_blank" rel="noreferrer" className="text-accent hover:underline">GitHub’s authorized apps</a>.</p>
        </div>
      ) : null}
      {!loading && !state ? <button type="button" className="btn-secondary text-[11px]" disabled={busy} onClick={() => void run('reload', async () => { receive(await api.getGitHubSignInState()); })}><RefreshCw size={12} />Reload connection</button> : null}
    </section>
  );
}
