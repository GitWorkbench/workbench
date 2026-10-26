import React, { useEffect, useRef } from 'react';
import { ArrowDownToLine, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { useAppUpdates, connectAppUpdates } from '../../store/appUpdates';
import { api } from '../../lib/api';
import { formatReleaseNotes } from '../../lib/releaseNotes';

export function AppUpdateNotice({ ready }: { ready: boolean }) {
  const { update, dialogOpen, busy, actionError, dismiss, act } = useAppUpdates();
  useEffect(connectAppUpdates, []);
  const dialog = useRef<HTMLDivElement>(null);
  const visible = ready && dialogOpen && update !== null;
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [visible]);
  if (!visible || !update) return null;
  const downloading = update.status === 'downloading';
  const installing = update.status === 'installing';
  const checking = update.status === 'checking';
  const downloaded = update.status === 'downloaded' || update.errorStage === 'install';
  const progress = Math.max(0, Math.min(100, update.progress ?? 0));
  const label = installing ? 'Installing…' : downloading ? `Downloading ${Math.floor(progress)}%` : checking ? 'Checking…' : downloaded ? 'Restart and install' : update.canInstallInApp ? 'Download update' : 'Download for macOS';
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby="app-update-description" tabIndex={-1} className="w-full max-w-lg rounded-xl border border-edge bg-panel p-5 text-fg shadow-2xl outline-none">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="app-update-title" className="text-base font-semibold text-fg">{downloaded ? 'Your update is ready' : 'Update available'}</h2>
          <p id="app-update-description" className="mt-1 text-sm text-dim">Git Workbench {update.availableVersion ? `v${update.availableVersion}` : 'update'} · Installed v{update.currentVersion}</p></div>
        <button className="btn-icon" aria-label="Close update notification" onClick={dismiss}><X size={16} /></button>
      </div>
      <p className="mt-4 text-sm text-dim">{downloaded ? 'Save any terminal work before restarting to finish the installation.' : update.canInstallInApp ? 'Download when you’re ready. You choose when to restart and install.' : 'Download and install the macOS release manually. Your current app can stay open while you download.'}</p>
      {update.releaseNotes && <details className="mt-4 text-sm"><summary className="cursor-pointer text-accent">What’s new</summary><div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-dim">{formatReleaseNotes(update.releaseNotes)}</div></details>}
      {downloading && <div className="mt-4 h-1.5 overflow-hidden rounded bg-panel3" role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}><div className="h-full bg-accent" style={{ width: `${progress}%` }} /></div>}
      {(actionError || update.status === 'error') && <p role="alert" className="mt-4 text-sm text-warn">{actionError || update.error}</p>}
      {update.status === 'not-available' && <p role="status" className="mt-4 text-sm text-dim">You’re up to date.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button className="btn-secondary" onClick={dismiss}>{downloading || downloaded ? 'Later' : 'Skip for now'}</button>
        <button className="btn-secondary" onClick={() => void api.openAppReleasePage().catch(() => useAppUpdates.setState({ actionError: 'Could not open the release page. Please try again.' }))}><ExternalLink size={13} />Release page</button>
        <button className="btn-primary" disabled={busy || downloading || installing || checking || update.status === 'not-available'} onClick={() => void act()}>
          {busy || downloading || installing || checking ? <Loader2 size={14} className="animate-spin" /> : downloaded ? <RefreshCw size={14} /> : <ArrowDownToLine size={14} />}{label}
        </button>
      </div>
    </div>
  </div>;
}
