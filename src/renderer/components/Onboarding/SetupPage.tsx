import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Palette, Sparkles, UserRound } from 'lucide-react';
import { useSettings, THEMES } from '../../store/settings';
import { api } from '../../lib/api';
import { emailAvatarHash } from '../../lib/emailAvatar';
import { AppLogo } from '../Common/AppLogo';
import { Avatar } from '../ui/Avatar';
import { AiSetupForm } from '../Settings/AiSetupForm';
import './setup.css';

const steps = [
  { title: 'Commit profile', detail: 'Put a name to your work', Icon: UserRound },
  { title: 'Appearance', detail: 'Make the workspace yours', Icon: Palette },
  { title: 'AI assistant', detail: 'Optional help, your choice', Icon: Sparkles }
];

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const settings = useSettings();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [profileName, setProfileName] = useState('Personal / Default');
  const [name, setName] = useState(settings.defaultAuthorName), [email, setEmail] = useState(settings.defaultAuthorEmail);
  const [globalIdentity, setGlobalIdentity] = useState(false), [preview, setPreview] = useState(true), [avatar, setAvatar] = useState('');
  const [identityNote, setIdentityNote] = useState('Checking your existing Git identity…');
  const dirtyIdentity = useRef(false), alive = useRef(true), root = useRef<HTMLDivElement>(null), title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    void api.getGitConfig('global').then(config => {
      if (!alive.current) return;
      if (!dirtyIdentity.current) { setName(current => current || config.name); setEmail(current => current || config.email); }
      setIdentityNote(config.name || config.email ? 'Prefilled from Git when available. Edit it for this app.' : 'No global Git identity found. Add one below, or skip this step.');
    }).catch(() => { if (alive.current) setIdentityNote('Could not read Git identity. You can enter it manually.'); });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { title.current?.focus(); }, [step]);
  useEffect(() => {
    let active = true;
    setAvatar('');
    if (!preview) return;
    const timer = setTimeout(() => {
      void emailAvatarHash(email).then(hash => { if (active) setAvatar(hash); }).catch(() => {});
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [email, preview]);

  const finish = async () => {
    setBusy(true); setError('');
    try { await settings.finishSetup(); if (alive.current) onComplete(); }
    catch { if (alive.current) setError('Setup could not be saved. Check access to the app data folder and try again, or continue for this session.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!profileName.trim() || !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a profile name, your name, and a valid email address.'); return;
    }
    setBusy(true);
    try {
      if (globalIdentity) {
        const result = await api.setGitConfig({ name: name.trim(), email: email.trim(), scope: 'global' });
        if (!result.ok) throw new Error('Could not save the global Git identity.');
      }
      if (!alive.current) return;
      const current = useSettings.getState();
      const id = current.activeProfileId;
      const profile = { id, name: profileName.trim(), authorName: name.trim(), authorEmail: email.trim() };
      current.setCommitProfiles([profile, ...current.commitProfiles.filter(item => item.id !== id)]);
      current.setDefaultAuthorName(profile.authorName); current.setDefaultAuthorEmail(profile.authorEmail);
      setStep(1);
    } catch { if (alive.current) setError('Could not save your Git identity. Try again, or turn off the global Git option to save a profile in this app only.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const move = (next: number) => { setError(''); setStep(next); };
  return <div className="setup-page" role="dialog" aria-modal="true" aria-labelledby="setup-title" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    if (event.key === 'Tab') {
      const targets = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]');
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div className="setup-shell">
      <aside className="setup-sidebar"><div className="setup-brand"><AppLogo size={36} /><strong>Git Workbench</strong></div><p className="setup-eyebrow">WELCOME TO YOUR WORKSPACE</p><h2>A good start.<br />A smoother workflow.</h2><p>A few preferences now, a workspace that feels familiar from your first commit.</p>
        <ol aria-label="Setup progress">{steps.map(({ title: label, detail, Icon }, index) => <li key={label} className={index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check size={17} /> : <Icon size={17} />}</span><div><strong>{label}</strong><small>{detail}</small></div></li>)}</ol>
        <p className="setup-sidebar-note">Everything here can be changed later in Settings.</p>
      </aside>
      <main className="setup-main"><header className="setup-header"><div><p className="setup-eyebrow">STEP {step + 1} OF {steps.length}</p><h1 id="setup-title" ref={title} tabIndex={-1}>{steps[step].title}</h1><p>{step === 0 ? 'Choose the identity shown on the commits you create.' : step === 1 ? 'Pick a color palette. Preview it in the workspace immediately.' : 'Connect a model, use local commit drafts, or configure this later.'}</p></div><button type="button" className="setup-skip" disabled={busy} onClick={() => { void finish(); }}>Skip setup</button></header>
        <div className="setup-content">
          {step === 0 && <form id="setup-profile" aria-label="Commit profile" onSubmit={event => { void saveProfile(event); }}>
            <div className="setup-identity-preview"><Avatar key={avatar || email} name={name || 'Your name'} email={email} avatarHash={avatar || undefined} size={64} /><div><strong>{name.trim() || 'Your commit identity'}</strong><span>{email.trim() || 'you@example.com'}</span><small>{profileName.trim() || 'Personal profile'}</small></div></div>
            <p className="setup-note" role="status">{identityNote}</p>
            <label className="setup-field">Profile name<input required maxLength={80} value={profileName} onChange={event => setProfileName(event.target.value)} disabled={busy} autoComplete="off" /></label>
            <label className="setup-field">Your name<input required maxLength={128} value={name} onChange={event => { dirtyIdentity.current = true; setName(event.target.value); }} disabled={busy} autoComplete="name" /></label>
            <label className="setup-field">Commit email<input required type="email" maxLength={254} value={email} onChange={event => { dirtyIdentity.current = true; setEmail(event.target.value); }} disabled={busy} autoComplete="email" /></label>
            <label className="setup-check"><input type="checkbox" checked={preview} onChange={event => setPreview(event.target.checked)} />Show my Gravatar preview</label><p className="setup-note">The preview sends a hash of this email to Gravatar. Initials are shown if the image cannot load.</p>
            <label className="setup-check"><input type="checkbox" checked={globalIdentity} onChange={event => setGlobalIdentity(event.target.checked)} disabled={busy} />Also set this identity in my global Git configuration</label><p className="setup-note">Your profile is saved in Git Workbench. The global option also changes the default identity used by Git in other apps; repository-specific settings are kept.</p>
          </form>}
          {step === 1 && <><div className="setup-workspace-preview" aria-label="Workspace theme preview"><div><i /><i /><i /><span>My workspace</span></div><section><aside><span>main</span><span>feature/new-idea</span><span>Recent changes</span></aside><svg viewBox="0 0 350 85" aria-hidden="true"><path d="M20 18 H330 M20 43 H330 M20 68 H330" stroke="var(--color-edge)" /><path d="M40 8 V75 M40 43 C40 20 80 20 80 8" fill="none" stroke="var(--color-accent)" strokeWidth="2" />{[18, 43, 68].map(y => <circle key={y} cx="40" cy={y} r="4" fill="var(--color-accent)" />)}<path d="M100 18 H230 M100 43 H280 M100 68 H200" stroke="var(--color-dim)" strokeWidth="4" strokeLinecap="round" /></svg></section></div>
            <div className="setup-themes" role="radiogroup" aria-label="Color theme">{Object.values(THEMES).map(theme => <button key={theme.id} type="button" role="radio" aria-checked={settings.theme === theme.id} onClick={() => settings.setTheme(theme.id)}><span className="setup-theme-swatch" style={{ background: theme.colors.base }}><i style={{ background: theme.colors.accent }} /><i style={{ background: theme.colors.add }} /><i style={{ background: theme.colors.dim }} /></span><span>{theme.name}</span>{settings.theme === theme.id && <Check size={14} />}</button>)}</div></>}
          {step === 2 && <AiSetupForm submitLabel="Finish & explore" onSaved={finish} />}
          {error && <div className="setup-error" role="alert"><p>{error}</p>{error.startsWith('Setup could') && <button className="btn-secondary" onClick={() => { useSettings.setState({ setupCompleted: true }); onComplete(); }}>Continue for this session</button>}</div>}
        </div>
        <footer className="setup-footer"><button type="button" className="btn-secondary" disabled={step === 0 || busy} onClick={() => move(step - 1)}><ArrowLeft size={14} />Back</button><span>Next: {step === 2 ? 'Explore Git Workbench' : steps[step + 1].title}</span><div>{step === 0 ? <><button type="button" className="setup-skip" disabled={busy} onClick={() => move(1)}>Set up later</button><button form="setup-profile" type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Continue'}<ArrowRight size={14} /></button></> : step === 1 ? <button className="btn-primary" onClick={() => move(2)}>Continue<ArrowRight size={14} /></button> : <button className="btn-secondary" disabled={busy} onClick={() => { void finish(); }}>Skip AI &amp; explore<ArrowRight size={14} /></button>}</div></footer>
      </main>
    </div>
  </div>;
}
