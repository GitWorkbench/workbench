import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AiPreferences } from '../../../shared/types';
import { AI_PROVIDERS, validateAiPreferences } from '../../../shared/ai-preferences';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';

type AiSetupFormProps = {
  onSaved?: () => Promise<void>;
  submitLabel?: string;
  variant?: 'setup' | 'settings';
};

const providerBadges: Record<AiPreferences['provider'], string> = {
  local: 'Offline',
  pollinations: 'API key required',
  openrouter: 'Free models available',
  groq: 'Fast inference',
  gemini: 'Free tier available',
  ollama: 'Local & private',
  custom: 'OpenAI-compatible'
};

const commitStyles: Array<{ id: AiPreferences['promptStyle']; label: string; example: string }> = [
  { id: 'conventional', label: 'Conventional Commits', example: 'feat(auth): add OAuth2 token refresh' },
  { id: 'detailed', label: 'Detailed Summary', example: 'Refactor diff parser with a clear breakdown' },
  { id: 'simple', label: 'Minimalist One-Liner', example: 'Update build tools and dependencies' },
  { id: 'gitmoji', label: 'Gitmoji', example: '✨ add OAuth2 token refresh' }
];

export function AiSetupForm({ onSaved, submitLabel = 'Save AI settings', variant = 'setup' }: AiSetupFormProps) {
  const [config, setConfig] = useState<AiPreferences>(() => ({ ...useSettings.getState().aiCommit }));
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState('');
  const [retry, setRetry] = useState(0);
  const keyInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const migrationError = useSettings(state => state.aiSettingsError);
  const settingsVariant = variant === 'settings';
  const local = config.provider === 'local';
  const needsEndpoint = config.provider === 'custom' || config.provider === 'ollama';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (keyInput.current) keyInput.current.value = '';
    setHasKey(false);
    setError('');
    setMessage('');
    setTestResult('');
    let target: AiPreferences;
    try {
      target = validateAiPreferences(config);
    } catch {
      return () => { active = false; };
    }
    void api.getAiSettings(target).then(snapshot => {
      if (active) setHasKey(snapshot.hasApiKey);
    }).catch(() => {
      if (active) setError('Could not read saved keys. Unlock your system keyring and retry.');
    });
    return () => { active = false; };
  }, [config.provider, config.endpoint, retry]);

  const save = async (test = false, remove = false) => {
    setBusy(true);
    setError('');
    setMessage('');
    setTestResult('');
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
        const successMessage = result.message || 'Connection verified.';
        setTestResult(successMessage);
        if (!settingsVariant) setMessage(successMessage);
      } else if (remove) {
        setMessage('API key removed for this provider and endpoint.');
      } else {
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

  const chooseProvider = (provider: AiPreferences['provider'], model: string) => {
    setConfig(current => ({
      ...current,
      provider,
      model,
      endpoint: provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : ''
    }));
  };

  const styles = <div className={settingsVariant ? 'preferences-choice-grid' : 'grid grid-cols-2 gap-2'}>
    {commitStyles.map(style => {
      const selected = config.promptStyle === style.id;
      return <button
        key={style.id}
        type="button"
        aria-pressed={selected}
        disabled={busy}
        onClick={() => setConfig(current => ({ ...current, promptStyle: style.id }))}
        className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${selected
          ? 'border-accent bg-accent/15 text-accent ring-1 ring-accent/30 font-semibold'
          : 'border-edge bg-panel2 hover:bg-panel3 text-fg'}`}
      >
        <span className="block text-xs">{style.label}</span>
        <span className="mt-1 block truncate font-mono text-[10px] text-dim">{style.example}</span>
      </button>;
    })}
  </div>;

  const modelField = <div>
    <label className="mb-1 block text-xs font-semibold" htmlFor={`ai-${variant}-model`}>Model name</label>
    <input
      id={`ai-${variant}-model`}
      required={!local}
      maxLength={200}
      value={config.model}
      disabled={busy || local}
      onChange={event => setConfig(current => ({ ...current, model: event.target.value }))}
      className="w-full rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-xs disabled:opacity-60"
      placeholder="Model identifier from your provider"
    />
  </div>;

  const keyField = !local && <div>
    <label className="mb-1 block text-xs font-semibold" htmlFor={`ai-${variant}-key`}>API key</label>
    <div className="flex gap-2">
      <input
        ref={keyInput}
        id={`ai-${variant}-key`}
        type={showKey ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        maxLength={8192}
        disabled={busy}
        className="min-w-0 flex-1 rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-xs"
        placeholder={hasKey ? 'Saved securely — leave blank to keep' : 'Paste your provider API key'}
      />
      <button type="button" className="btn-secondary !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => setShowKey(value => !value)} aria-label={showKey ? 'Hide API key' : 'Show API key'}>{showKey ? 'Hide' : 'Show'}</button>
    </div>
    <p className="mt-2 flex items-center gap-1.5 text-xs text-dim">
      {hasKey ? <ShieldCheck size={13} aria-hidden="true" /> : <KeyRound size={13} aria-hidden="true" />}
      {hasKey ? 'API key saved securely for this provider and endpoint.' : 'Keys are encrypted by your OS keychain or keyring, outside app preferences.'}
    </p>
    {hasKey && <button type="button" className="mt-2 cursor-pointer text-xs text-del" disabled={busy} onClick={() => { void save(false, true); }}>Remove saved API key</button>}
  </div>;

  return <form className={settingsVariant ? 'space-y-5' : 'ai-setup-form space-y-4'} onSubmit={event => { event.preventDefault(); void save(); }}>
    {settingsVariant ? <>
      <section className="space-y-4 rounded-xl border border-edge bg-panel2/50 p-5" aria-labelledby="ai-provider-heading">
        <div>
          <h3 id="ai-provider-heading" className="block text-xs font-semibold text-fg">Model provider</h3>
          <p className="text-[11px] text-dim">Choose a hosted provider or a local model.</p>
        </div>
        <div className="preferences-choice-grid">
          {AI_PROVIDERS.map(provider => {
            const selected = config.provider === provider.id;
            return <button
              key={provider.id}
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => chooseProvider(provider.id, provider.model)}
              className={`min-w-0 rounded-xl border p-3.5 text-left transition-colors ${selected
                ? 'border-accent bg-panel3 shadow-md ring-1 ring-accent/30'
                : 'border-edge/70 bg-panel2/60 hover:bg-panel2'}`}
            >
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-fg">{provider.name}</span>
                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">{providerBadges[provider.id]}</span>
              </span>
              <span className="block text-[11px] text-dim">{provider.detail}</span>
            </button>;
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-edge bg-panel2/50 p-5" aria-label="Provider configuration">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {modelField}
          {keyField}
        </div>
        {needsEndpoint && <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor={`ai-${variant}-endpoint`}>API endpoint URL</label>
          <input
            id={`ai-${variant}-endpoint`}
            required
            type="url"
            maxLength={2048}
            value={config.endpoint}
            disabled={busy}
            onChange={event => setConfig(current => ({ ...current, endpoint: event.target.value }))}
            className="w-full rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-xs"
            placeholder={config.provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'https://your-provider.example/v1'}
          />
          <p className="mt-2 text-xs text-dim">Use HTTPS for remote endpoints. HTTP is allowed for localhost.</p>
        </div>}
        <p className="flex items-center gap-1.5 text-xs text-dim"><ShieldCheck size={13} aria-hidden="true" />{hasKey ? 'Saved API keys stay encrypted in your system keyring across app updates.' : 'API keys are encrypted in your system keyring, not in app preferences.'}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-edge bg-panel2/50 p-5" aria-labelledby="ai-style-heading">
        <div>
          <h3 id="ai-style-heading" className="block text-xs font-semibold text-fg">Commit message style</h3>
          <p className="text-[11px] text-dim">Choose the format used when drafting commit messages.</p>
        </div>
        {styles}
      </section>

      <section className="space-y-3 rounded-xl border border-edge bg-panel2/50 p-5" aria-labelledby="ai-test-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-56">
            <h3 id="ai-test-heading" className="block text-xs font-semibold text-fg">Test connection</h3>
            <p className="text-[11px] text-dim">Saves this configuration and sends a small built-in example to verify the provider.</p>
          </div>
          <button type="button" disabled={busy} aria-busy={busy} onClick={() => { void save(true); }} className="btn-secondary min-h-8 !px-3.5 !py-2 !text-xs">
            {busy ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /><span>Testing…</span></> : <><Sparkles size={13} aria-hidden="true" /><span>Test AI model</span></>}
          </button>
        </div>
        {testResult && <div className="space-y-1.5 rounded-xl border border-edge bg-panel3/80 p-3.5" role="status">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">Sample output</span>
          <pre className="whitespace-pre-wrap font-mono text-xs text-fg">{testResult}</pre>
        </div>}
        {error && <div className="flex items-center gap-2 rounded-xl border border-del/30 bg-del-bg/30 p-3.5 text-xs text-del" role="alert"><AlertCircle size={15} className="shrink-0" aria-hidden="true" /><span>{error}</span></div>}
      </section>
    </> : <>
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor="ai-setup-provider">Model provider</label>
        <select id="ai-setup-provider" className="w-full rounded-lg border border-edge bg-panel px-3 py-2" value={config.provider} disabled={busy}
          onChange={event => {
            const provider = AI_PROVIDERS.find(item => item.id === event.target.value);
            if (provider) chooseProvider(provider.id, provider.model);
          }}>
          {AI_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
        <p className="mt-2 text-xs text-dim">{AI_PROVIDERS.find(provider => provider.id === config.provider)?.detail}</p>
      </div>
      {!local && <>
        {modelField}
        {needsEndpoint && <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="ai-setup-endpoint">API endpoint URL</label>
          <input id="ai-setup-endpoint" required type="url" maxLength={2048} value={config.endpoint} disabled={busy} onChange={event => setConfig(current => ({ ...current, endpoint: event.target.value }))} className="w-full rounded-lg border border-edge bg-panel px-3 py-2" placeholder="https://your-provider.example/v1" />
        </div>}
        {keyField}
      </>}
      <div>
        <label className="mb-1 block text-xs font-semibold" htmlFor="ai-setup-style">Commit message style</label>
        <select id="ai-setup-style" className="w-full rounded-lg border border-edge bg-panel px-3 py-2" disabled={busy} value={config.promptStyle} onChange={event => setConfig(current => ({ ...current, promptStyle: event.target.value as AiPreferences['promptStyle'] }))}>
          {commitStyles.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
        </select>
      </div>
    </>}

    {migrationError && <p className="text-xs text-warn" role="alert">{migrationError}</p>}
    {error && !settingsVariant && <p className="text-xs text-del" role="alert">{error}</p>}
    {(error || migrationError) && <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { await useSettings.getState().initializeAiSettings(); if (mounted.current) setRetry(value => value + 1); }}>Retry secure storage</button>}
    {message && <p className="whitespace-pre-wrap text-xs text-add" role="status">{message}</p>}
    {!settingsVariant && <p className="text-xs text-dim">AI is optional. Save &amp; test sends a small built-in example, never your repository changes. Remote AI features send selected code only when you request them.</p>}
    <div className={`flex flex-wrap gap-2 ${settingsVariant ? 'justify-end' : ''}`}>
      {!settingsVariant && <button type="button" className="btn-secondary" disabled={busy} onClick={() => { void save(true); }}>Save &amp; test</button>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy && !settingsVariant && <Loader2 size={14} className="animate-spin" />}{settingsVariant ? 'Save AI settings' : submitLabel}</button>
    </div>
  </form>;
}
