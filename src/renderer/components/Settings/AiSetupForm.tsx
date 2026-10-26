import React, { useEffect, useRef, useState } from 'react';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import type { AiPreferences } from '../../../shared/types';
import { AI_PROVIDERS, validateAiPreferences } from '../../../shared/ai-preferences';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';

export function AiSetupForm({ onSaved, submitLabel = 'Save AI settings' }: { onSaved?: () => Promise<void>; submitLabel?: string }) {
  const [config, setConfig] = useState<AiPreferences>(() => ({ ...useSettings.getState().aiCommit }));
  const [hasKey, setHasKey] = useState(false), [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const keyInput = useRef<HTMLInputElement>(null), mounted = useRef(true);
  const migrationError = useSettings(s => s.aiSettingsError);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (keyInput.current) keyInput.current.value = '';
    setHasKey(false); setError(''); setMessage('');
    let target: AiPreferences;
    try { target = validateAiPreferences(config); } catch { return; }
    void api.getAiSettings(target).then(snapshot => { if (active) setHasKey(snapshot.hasApiKey); }).catch(() => {
      if (active) setError('Could not read saved keys. Unlock your system keyring and retry.');
    });
    return () => { active = false; };
  }, [config.provider, config.endpoint, retry]);

  const save = async (test = false, remove = false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const target = validateAiPreferences(config);
      const key = keyInput.current?.value.trim();
      await useSettings.getState().saveAiPreferences(target, remove ? '' : key || undefined);
      const snapshot = await api.getAiSettings(target);
      if (!mounted.current) return;
      setHasKey(snapshot.hasApiKey);
      if (test) {
        const result = await api.testAiSettings(target);
        if (!mounted.current) return;
        if (!result.ok) throw new Error(result.error || 'The connection check failed. Check your model and credentials.');
        setMessage(result.message || 'Connection verified.');
      } else if (remove) setMessage('API key removed for this provider and endpoint.');
      else {
        setMessage('AI settings saved. Your keys are kept across app updates.');
        await onSaved?.();
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not save AI settings. Try again.');
    } finally {
      if (keyInput.current) keyInput.current.value = '';
      if (mounted.current) setBusy(false);
    }
  };
  const local = config.provider === 'local';
  return <form className="ai-setup-form space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <div><label className="block text-xs font-semibold mb-1" htmlFor="ai-setup-provider">Model provider</label>
      <select id="ai-setup-provider" className="w-full bg-panel border border-edge rounded-lg px-3 py-2" value={config.provider} disabled={busy}
        onChange={event => { const provider = AI_PROVIDERS.find(item => item.id === event.target.value); if (provider) setConfig({ ...config, provider: provider.id, model: provider.model, endpoint: provider.id === 'ollama' ? 'http://127.0.0.1:11434/v1' : '' }); }}>
        {AI_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select><p className="text-xs text-dim mt-2">{AI_PROVIDERS.find(provider => provider.id === config.provider)?.detail}</p></div>
    {!local && <>
      <div><label className="block text-xs font-semibold mb-1" htmlFor="ai-setup-model">Model name</label><input id="ai-setup-model" required maxLength={200} value={config.model} disabled={busy} onChange={event => setConfig({ ...config, model: event.target.value })} className="w-full bg-panel border border-edge rounded-lg px-3 py-2" placeholder="Model identifier from your provider" /></div>
      {(config.provider === 'custom' || config.provider === 'ollama') && <div><label className="block text-xs font-semibold mb-1" htmlFor="ai-setup-endpoint">API endpoint URL</label><input id="ai-setup-endpoint" required type="url" maxLength={2048} value={config.endpoint} disabled={busy} onChange={event => setConfig({ ...config, endpoint: event.target.value })} className="w-full bg-panel border border-edge rounded-lg px-3 py-2" placeholder="https://your-provider.example/v1" /></div>}
      <div><label className="block text-xs font-semibold mb-1" htmlFor="ai-setup-key">API key</label><div className="flex gap-2"><input ref={keyInput} id="ai-setup-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={8192} disabled={busy} className="min-w-0 flex-1 bg-panel border border-edge rounded-lg px-3 py-2" placeholder={hasKey ? 'Saved securely — leave blank to keep' : 'Paste a key, or leave blank for a local server'} /><button type="button" className="btn-secondary" disabled={busy} onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Hide API key' : 'Show API key'}>{showKey ? 'Hide' : 'Show'}</button></div>
        <p className="text-xs text-dim mt-2 flex items-center gap-1.5">{hasKey ? <ShieldCheck size={13} /> : <KeyRound size={13} />}{hasKey ? 'API key saved securely for this provider and endpoint.' : 'Keys are encrypted by your OS keychain or keyring, outside app preferences.'}</p>
        {hasKey && <button type="button" className="text-xs text-del mt-2 cursor-pointer" disabled={busy} onClick={() => { void save(false, true); }}>Remove saved API key</button>}</div>
    </>}
    <div><label className="block text-xs font-semibold mb-1" htmlFor="ai-setup-style">Commit message style</label><select id="ai-setup-style" className="w-full bg-panel border border-edge rounded-lg px-3 py-2" disabled={busy} value={config.promptStyle} onChange={event => setConfig({ ...config, promptStyle: event.target.value as AiPreferences['promptStyle'] })}>
      <option value="conventional">Conventional Commits</option><option value="simple">Minimalist One-Liner</option><option value="detailed">Detailed Summary</option><option value="gitmoji">Gitmoji</option>
    </select></div>
    {migrationError && <p className="text-xs text-warn" role="alert">{migrationError}</p>}
    {error && <p className="text-xs text-del" role="alert">{error}</p>}
    {(error || migrationError) && <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { await useSettings.getState().initializeAiSettings(); if (mounted.current) setRetry(value => value + 1); }}>Retry secure storage</button>}
    {message && <p className="text-xs text-add whitespace-pre-wrap" role="status">{message}</p>}
    <p className="text-xs text-dim">AI is optional. Save &amp; test sends a small built-in example, never your repository changes. Remote AI features send selected code only when you request them.</p>
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => { void save(true); }}>Save &amp; test</button><button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{submitLabel}</button></div>
  </form>;
}
