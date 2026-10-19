import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import type { PullRequestCredentialStatus, PullRequestProvider } from '../../../shared/types';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { GitHubSignInPanel } from './GitHubSignInPanel';

const providers: Array<{
  id: PullRequestProvider;
  name: string;
  detail: string;
  tokenName: string;
  tokenUrl: string;
  instructions: string;
}> = [
  {
    id: 'github', name: 'GitHub', detail: 'GitHub.com pull requests', tokenName: 'Personal access token',
    tokenUrl: 'https://github.com/settings/personal-access-tokens/new',
    instructions: 'Create a fine-grained token with Pull requests read and write access for the repositories you use.'
  },
  {
    id: 'gitlab', name: 'GitLab', detail: 'GitLab.com and self-managed GitLab merge requests', tokenName: 'Personal access token',
    tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens?name=Git%20Workbench&scopes=api',
    instructions: 'Create a token with the api scope. For a self-managed server, create the token on that GitLab instance.'
  },
  {
    id: 'bitbucket', name: 'Bitbucket Cloud', detail: 'Bitbucket Cloud pull requests', tokenName: 'API token',
    tokenUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    instructions: 'Allow repository read and pull request read/write. Enter the Atlassian account email used with the token.'
  }
];

const emptyStatus: PullRequestCredentialStatus = { github: false, gitlab: false, bitbucket: false };

export function PullRequestProvidersSettings() {
  const notify = useApp((state) => state.notify);
  const [credentialStatus, setCredentialStatus] = useState<PullRequestCredentialStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PullRequestProvider | null>(null);
  const [tokens, setTokens] = useState<Partial<Record<PullRequestProvider, string>>>({});
  const [bitbucketEmail, setBitbucketEmail] = useState('');
  const [showToken, setShowToken] = useState<PullRequestProvider | null>(null);
  const [saving, setSaving] = useState<PullRequestProvider | null>(null);
  const [removing, setRemoving] = useState<PullRequestProvider | null>(null);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCredentialStatus(await api.getPullRequestCredentialStatus());
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const save = async (event: React.FormEvent, provider: PullRequestProvider) => {
    event.preventDefault();
    const token = tokens[provider]?.trim() || '';
    if (!token) return;
    setSaving(provider);
    setError('');
    try {
      const result = await api.savePullRequestCredential(provider, {
        token,
        ...(provider === 'bitbucket' ? { username: bitbucketEmail.trim() } : {})
      });
      if (!result.ok) throw new Error(result.error || `Could not save the ${provider} token.`);
      setTokens((existing) => ({ ...existing, [provider]: '' }));
      setEditing(null);
      await refreshStatus();
      notify('success', `${providers.find((item) => item.id === provider)?.name || provider} token saved securely`);
    } catch (reason) {
      const message = String(reason).replace(/^Error:\s*/, '');
      setError(message);
      notify('error', message);
    } finally {
      setSaving(null);
    }
  };

  const remove = async (provider: PullRequestProvider) => {
    setRemoving(provider);
    setError('');
    try {
      const result = await api.removePullRequestCredential(provider);
      if (!result.ok) throw new Error(result.error || `Could not remove the ${provider} token.`);
      setCredentialStatus((current) => ({ ...current, [provider]: false }));
      setTokens((current) => ({ ...current, [provider]: '' }));
      if (editing === provider) setEditing(null);
      notify('success', `${providers.find((item) => item.id === provider)?.name || provider} token removed`);
    } catch (reason) {
      const message = String(reason).replace(/^Error:\s*/, '');
      setError(message);
      notify('error', message);
    } finally {
      setRemoving(null);
    }
  };

  const startEditing = (provider: PullRequestProvider) => {
    setError('');
    setEditing(provider);
    setTokens((current) => ({ ...current, [provider]: '' }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-fg">Pull Request Providers</h2>
        <p className="text-xs text-dim mt-0.5">
          Connect provider accounts to browse and create pull requests or merge requests from a repository.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 p-4">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <div className="text-xs font-semibold text-fg">Credentials stay on this device</div>
          <p className="mt-1 text-[11px] leading-relaxed text-dim">
            Git Workbench encrypts provider tokens with your operating system’s secure storage. Tokens are not saved in browser preferences. Git pushes continue to use your normal SSH key or Git credential helper.
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-del/30 bg-del-bg/20 p-3 text-[11px] leading-relaxed text-del">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {providers.map((provider) => {
          if (provider.id === 'github') return <GitHubSignInPanel key={provider.id} />;
          const configured = credentialStatus[provider.id];
          const isEditing = !loading && (editing === provider.id || !configured);
          const busy = saving === provider.id || removing === provider.id;
          return (
            <section key={provider.id} className="rounded-xl border border-edge bg-panel2/40 p-4 space-y-4">
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 rounded-lg border border-accent/25 bg-accent/10 flex items-center justify-center text-accent">
                    <KeyRound size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-fg">{provider.name}</h3>
                    <p className="mt-0.5 text-[11px] text-dim">{provider.detail}</p>
                  </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${configured ? 'border-add/25 bg-add/5 text-add' : 'border-edge bg-panel text-faint'}`}>
                  {loading ? <Loader2 size={11} className="animate-spin" /> : configured ? <CheckCircle2 size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-faint" />}
                  {loading ? 'Checking' : configured ? 'Token saved' : 'Not connected'}
                </span>
              </header>

              <p className="text-[11px] leading-relaxed text-dim">{provider.instructions}</p>

              {loading ? (
                <div className="flex items-center gap-2 border-t border-edge/70 pt-3 text-[11px] text-dim">
                  <Loader2 size={13} className="animate-spin text-accent" />Checking saved credentials…
                </div>
              ) : !isEditing ? (
                <div className="flex items-center gap-2 border-t border-edge/70 pt-3">
                  <button className="btn text-[11px] !px-3 !py-1.5" onClick={() => startEditing(provider.id)} disabled={busy}>Replace token</button>
                  <button className="btn text-[11px] !px-3 !py-1.5 text-del" onClick={() => void remove(provider.id)} disabled={busy}>
                    {removing === provider.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Remove token
                  </button>
                </div>
              ) : (
                <form className="border-t border-edge/70 pt-3 space-y-2.5" onSubmit={(event) => void save(event, provider.id)}>
                  {provider.id === 'bitbucket' ? (
                    <label className="block space-y-1 text-[10px] text-dim">
                      Atlassian account email
                      <input
                        className="input w-full text-xs"
                        type="email"
                        autoComplete="username"
                        value={bitbucketEmail}
                        onChange={(event) => setBitbucketEmail(event.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                    </label>
                  ) : null}
                  <label className="block space-y-1 text-[10px] text-dim">
                    {provider.tokenName}
                    <div className="flex gap-1.5">
                      <input
                        className="input min-w-0 flex-1 text-xs"
                        type={showToken === provider.id ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={tokens[provider.id] || ''}
                        onChange={(event) => setTokens((current) => ({ ...current, [provider.id]: event.target.value }))}
                        placeholder={configured ? 'Paste a replacement token' : 'Paste your access token'}
                        required
                      />
                      <button type="button" className="btn !px-2" title={showToken === provider.id ? 'Hide token' : 'Show token'} onClick={() => setShowToken((current) => current === provider.id ? null : provider.id)}>
                        {showToken === provider.id ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <a href={provider.tokenUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline">
                      Create an access token <ExternalLink size={10} />
                    </a>
                    <div className="flex items-center gap-2">
                      {configured ? <button type="button" className="btn text-[10px] !px-2.5 !py-1.5" onClick={() => { setEditing(null); setTokens((current) => ({ ...current, [provider.id]: '' })); }}>Cancel</button> : null}
                      <button type="submit" className="btn btn-primary text-[10px] !px-3 !py-1.5" disabled={saving === provider.id || !tokens[provider.id]?.trim() || (provider.id === 'bitbucket' && !bitbucketEmail.trim())}>
                        {saving === provider.id ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : configured ? 'Replace token' : 'Save token'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
