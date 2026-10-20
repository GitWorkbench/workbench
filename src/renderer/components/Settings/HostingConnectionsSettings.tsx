import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import { normalizeHostingServer, requestLabel } from '../../../shared/hosting-provider';
import { api } from '../../lib/api';

export function HostingConnectionsSettings({ provider, servers, loading, onChanged }: {
  provider: 'gitlab' | 'gitea';
  servers: string[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const name = provider === 'gitlab' ? 'GitLab' : 'Gitea';
  const normalizeServer = (value: string) => normalizeHostingServer(value, name);
  const [editing, setEditing] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(provider === 'gitlab' ? 'https://gitlab.com' : '');
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const showForm = editing !== null || !servers.length;
  let normalized = '';
  try { normalized = normalizeServer(serverUrl); } catch { /* Validate on submit. */ }

  const start = (server = '') => {
    if (pending.current) return;
    setEditing(server);
    setServerUrl(server || '');
    setToken('');
    setVisible(false);
    setError('');
    setMessage('');
  };

  const perform = async (name: string, action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(name);
    setError('');
    setMessage('');
    try { await action(); }
    catch (reason) { if (active.current) setError(String(reason).replace(/^Error:\s*/, '')); }
    finally {
      pending.current = false;
      if (active.current) setBusy('');
    }
  };

  const test = async (server: string, draft?: string) => {
    const result = await (provider === 'gitlab' ? api.testGitLabConnection(server, draft) : api.testGiteaConnection(server, draft));
    if (!result.ok || !result.username) throw new Error(result.error || `Could not connect to ${name}.`);
    return result.username;
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void perform('save', async () => {
      const server = normalizeServer(serverUrl);
      const username = await test(server, token.trim());
      if (!active.current) return;
      const result = await api.savePullRequestCredential(provider, { serverUrl: server, token: token.trim() });
      if (!result.ok) throw new Error(result.error || `Could not save the ${name} connection.`);
      if (!active.current) return;
      setToken('');
      setVisible(false);
      setEditing(null);
      await onChanged();
      if (active.current) setMessage(`Connected to ${server} as ${username}. Reopen the request workspace to load ${requestLabel(provider).toLowerCase()}.`);
    });
  };

  return <section className="xl:col-span-2 rounded-xl border border-edge bg-panel2/40 p-4 space-y-4" aria-label={`${name} connections`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent"><Globe size={16} /></div>
        <div><h3 className="text-sm font-semibold text-fg">{name}</h3><p className="mt-0.5 text-xs text-dim">{provider === 'gitlab' ? 'GitLab.com and self-hosted servers, each with its own connection.' : 'Connect Gitea servers, each with its own connection.'}</p></div>
      </div>
      <button className="btn-secondary text-xs" disabled={loading || !!busy} onClick={() => start()}><Plus size={13} />Add {name} server</button>
    </header>
    <p className="text-xs leading-relaxed text-dim">Use the instance URL, such as https://code.company.com, and a personal access token created on that server. {provider === 'gitlab' ? <>Use the <code>api</code> scope.</> : <>Allow <code>read:user</code>, <code>write:repository</code>, and <code>write:issue</code> for the repositories you use.</>} HTTPS ports and base paths are supported. Tokens are only sent to their configured instance.</p>
    {loading ? <p className="flex items-center gap-2 text-xs text-dim"><Loader2 size={13} className="animate-spin" />Loading {name} connections…</p> : servers.length > 0 ? <ul className="space-y-2">
      {servers.map(server => <li key={server} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-panel p-3">
        <div className="flex min-w-0 items-start gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-add" /><div className="min-w-0"><p className="break-all text-xs font-medium text-fg">{server}</p><p className="mt-1 text-xs text-dim">Token saved securely</p></div></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-xs" disabled={!!busy} onClick={() => void perform(`test:${server}`, async () => {
            const username = await test(server);
            if (active.current) setMessage(`Connection successful: ${server} · ${username}`);
          })}>{busy === `test:${server}` && <Loader2 size={12} className="animate-spin" />}Test connection</button>
          <button className="btn-secondary text-xs" disabled={!!busy} onClick={() => start(server)}>Replace token</button>
          <button className="btn-secondary text-xs text-del" disabled={!!busy} aria-label={`Remove ${name} connection ${server}`} onClick={() => void perform(`remove:${server}`, async () => {
            const result = await api.removePullRequestCredential(provider, server);
            if (!result.ok) throw new Error(result.error || `Could not remove the ${name} connection.`);
            if (!active.current) return;
            setToken('');
            setEditing(null);
            await onChanged();
            if (active.current) setMessage(`Removed the connection to ${server}.`);
          })}><Trash2 size={12} />Remove</button>
        </div>
      </li>)}
    </ul> : null}
    {!loading && showForm && <form className="space-y-3 border-t border-edge pt-4" onSubmit={save}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-dim">{name} server URL
          <input className="input w-full text-xs" type="url" required autoComplete="url" placeholder="https://code.company.com" value={serverUrl} disabled={!!busy || !!editing} onChange={event => { setServerUrl(event.target.value); setError(''); setMessage(''); }} />
          <span className="block leading-relaxed">Include a base path when needed, for example https://code.company.com/{provider}.</span>
        </label>
        <label className="block space-y-1.5 text-xs text-dim">{name} personal access token
          <span className="flex gap-2">
            <input className="input min-w-0 flex-1 text-xs" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={token} disabled={!!busy} placeholder="Paste the token from this server" onChange={event => { setToken(event.target.value); setError(''); setMessage(''); }} />
            <button className="btn-secondary !px-2" type="button" disabled={!!busy} aria-label={visible ? `Hide ${name} token` : `Show ${name} token`} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={13} /> : <Eye size={13} />}</button>
          </span>
          <span className="block leading-relaxed">Paste a token to enable the connection buttons. Access is checked before saving.</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {normalized && !busy ? <a
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          href={`${normalized}${provider === 'gitlab' ? '/-/user_settings/personal_access_tokens?name=Git%20Workbench&scopes=api' : '/user/settings/applications'}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { setError(''); setMessage(''); }}
        >Create a token on this server<ExternalLink size={12} /></a> : <span aria-disabled="true" className="inline-flex items-center gap-1.5 text-xs text-dim opacity-50">Create a token on this server<ExternalLink size={12} /></span>}
        <div className="flex flex-wrap gap-2">
          {!!servers.length && <button type="button" className="btn-secondary text-xs" disabled={!!busy} onClick={() => { setEditing(null); setToken(''); setVisible(false); setError(''); setMessage(''); }}>Cancel</button>}
          <button type="button" className="btn-secondary text-xs" disabled={!!busy || !token.trim() || !normalized} onClick={() => void perform('test-draft', async () => {
            const username = await test(normalizeServer(serverUrl), token.trim());
            if (active.current) setMessage(`Connection successful as ${username}. Save the connection to use it.`);
          })}>{busy === 'test-draft' && <Loader2 size={12} className="animate-spin" />}Test connection</button>
          <button type="submit" className="btn-primary text-xs" disabled={!!busy || !token.trim() || !normalized}>{busy === 'save' && <Loader2 size={12} className="animate-spin" />}{busy === 'save' ? 'Connecting…' : editing ? 'Update connection' : `Connect ${name}`}</button>
        </div>
      </div>
    </form>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-del/30 bg-del/5 p-3 text-xs leading-relaxed text-del"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}
    {message && <p role="status" className="flex items-start gap-2 rounded-lg border border-add/30 bg-add/5 p-3 text-xs leading-relaxed text-add"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />{message}</p>}
    <p className="text-xs leading-relaxed text-dim">Requests, reviews, CI status, review worktrees, and stacked branch actions use the connection matching the repository’s remote. Custom SSH host aliases must match the server hostname. Your Git SSH keys and credential helper still handle pushes.</p>
  </section>;
}
