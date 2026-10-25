import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Copy, ExternalLink, Loader2, Maximize2, Minimize2, RotateCcw, Square, Terminal as TerminalIcon, Trash2, X } from 'lucide-react';
import type { TerminalEvent, TerminalSession } from '../../../shared/types';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';
import '@xterm/xterm/css/xterm.css';

export function TerminalDrawer() {
  const isOpen = useApp(s => s.terminalDrawerOpen);
  const height = useApp(s => s.terminalDrawerHeight);
  const setHeight = useApp(s => s.setTerminalDrawerHeight);
  const repo = useApp(s => s.activeTab);
  const theme = useSettings(s => s.theme);
  const fontSize = useSettings(s => s.codeFontSize);
  const fontFamily = useSettings(s => s.codeFontFamily);
  const customFont = useSettings(s => s.customCodeFont);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const session = useRef<TerminalSession | null>(null);
  const fit = useRef<(() => void) | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shell, setShell] = useState('');
  const [exitCode, setExitCode] = useState<number>();
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => () => dragCleanup.current?.(), []);
  useEffect(() => {
    if (!isOpen || !repo) return;
    let alive = true;
    let current: TerminalSession | null = null;
    let sequence = 0;
    let pending: TerminalEvent[] = [];
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let commandPending = false;
    const term = new Terminal({ cursorBlink: true, scrollback: 5000, allowProposedApi: false, allowTransparency: false, screenReaderMode: true });
    const fitter = new FitAddon();
    terminal.current = term;
    term.loadAddon(fitter); term.open(host.current!);
    setLoading(true); setError(''); setShell(''); setExitCode(undefined); setConfirmRestart(false);
    const fail = (reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'The terminal connection failed. Try restarting the shell.'); };
    const refresh = () => {
      if (useApp.getState().activeTab === repo) void useApp.getState().refresh().catch(fail);
    };
    const acknowledge = (value: number) => { if (alive && current) void api.acknowledgeTerminalData(current.id, value).catch(fail); };
    const receive = (event: TerminalEvent) => {
      if (!alive) return;
      if (!current) { pending = [...pending, event].slice(-128); return; }
      if (event.id !== current.id || event.sequence <= sequence) return;
      sequence = event.sequence;
      if (event.type === 'data') {
        term.write(event.data, () => acknowledge(event.sequence));
        if (commandPending) {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => { commandPending = false; refresh(); }, 750);
        }
      } else {
        setExitCode(event.exitCode); term.options.disableStdin = true; refresh();
      }
    };
    const unsubscribe = api.onTerminalEvent(receive);
    const input = term.onData(data => {
      if (!current) return;
      if (/[\r\n]/.test(data)) commandPending = true;
      // Bound each IPC write, including a large bracketed paste from xterm.
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        void api.writeTerminalSession(current.id, data.slice(offset, offset + 64 * 1024)).catch(fail);
      }
    });
    term.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true;
      const copy = (event.metaKey || (event.ctrlKey && event.shiftKey)) && event.key.toLowerCase() === 'c';
      const paste = (event.metaKey || (event.ctrlKey && event.shiftKey)) && event.key.toLowerCase() === 'v';
      if (copy) { event.preventDefault(); void navigator.clipboard.writeText(term.getSelection()).catch(fail); return false; }
      if (paste) { event.preventDefault(); void navigator.clipboard.readText().then(text => { if (alive) term.paste(text); }).catch(fail); return false; }
      return true;
    });
    const resize = () => {
      if (!alive || !host.current?.clientWidth || !host.current.clientHeight) return;
      fitter.fit();
      if (current && current.exitCode === undefined) void api.resizeTerminalSession(current.id, Math.min(500, term.cols), Math.min(300, term.rows)).catch(fail);
    };
    fit.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(host.current!);
    resize();
    void api.openTerminalSession(repo, Math.max(2, Math.min(500, term.cols)), Math.max(1, Math.min(300, term.rows))).then(opened => {
      if (!alive) { void api.detachTerminalSession(opened.id, opened.connectionId).catch(() => {}); return; }
      current = opened; session.current = opened; sequence = opened.sequence;
      setShell(opened.shell); setExitCode(opened.exitCode); setLoading(false);
      term.options.disableStdin = opened.exitCode !== undefined;
      term.write(opened.output, () => acknowledge(opened.sequence));
      pending.forEach(receive); pending = [];
      resize(); term.focus();
    }).catch(reason => { fail(reason); if (alive) setLoading(false); });
    return () => {
      alive = false;
      dragCleanup.current?.();
      clearTimeout(refreshTimer);
      unsubscribe(); input.dispose(); observer.disconnect(); term.dispose();
      if (current) void api.detachTerminalSession(current.id, current.connectionId).catch(() => {});
      session.current = null; terminal.current = null; fit.current = null;
    };
  }, [isOpen, repo, revision]);

  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    const css = getComputedStyle(document.documentElement);
    term.options.fontSize = fontSize;
    term.options.fontFamily = css.getPropertyValue('--font-mono').trim();
    const color = (name: string) => css.getPropertyValue(`--color-${name}`).trim();
    term.options.theme = { background: color('base'), foreground: color('fg'), cursor: color('accent'), selectionBackground: color('panel3'), black: color('panel'), red: color('del'), green: color('add'), yellow: color('warn'), blue: color('accent'), magenta: '#c084fc', cyan: '#22d3ee', white: color('fg'), brightBlack: color('dim') };
    fit.current!();
  }, [theme, fontSize, fontFamily, customFont, isOpen, repo, revision]);

  const restart = async (stop = false) => {
    const current = session.current;
    try {
      if (current) await api.closeTerminalSession(current.id);
      if (useApp.getState().activeTab === repo) {
        if (stop) useApp.setState({ terminalDrawerOpen: false });
        else setRevision(value => value + 1);
      }
    } catch (reason) { setError(String(reason)); }
  };
  const resize = (event: React.MouseEvent) => {
    event.preventDefault(); dragCleanup.current?.();
    const startY = event.clientY, startHeight = height;
    const move = (next: MouseEvent) => setHeight(startHeight + startY - next.clientY);
    const stop = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); dragCleanup.current = null; };
    dragCleanup.current = stop;
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
  };
  if (!isOpen) return null;
  return <section aria-label="Repository terminal" className="relative z-20 flex shrink-0 flex-col overflow-hidden border-t border-edge bg-base" style={{ height: maximized ? '75vh' : `${height}px` }}>
    {!maximized && <div className="absolute inset-x-0 top-0 z-30 h-1 cursor-row-resize hover:bg-accent/50" title="Drag to resize terminal drawer" onMouseDown={resize} />}
    <div className="flex min-w-0 items-center gap-2 border-b border-edge bg-panel px-3 py-1 text-xs text-dim">
      <TerminalIcon size={13} className="shrink-0 text-accent" /><span className="font-medium text-fg">Terminal</span>
      <span className="truncate" title={repo ?? undefined}>{shell}{shell && ' · '}{repo}</span><span className="flex-1" />
      <button className="btn-icon !h-6 !w-6" title="Restart shell" aria-label="Restart shell" disabled={loading} onClick={() => setConfirmRestart(true)}><RotateCcw size={12} /></button>
      <button className="btn-icon !h-6 !w-6" title="Stop session and hide terminal" aria-label="Stop terminal session" disabled={loading || !shell} onClick={() => void restart(true)}><Square size={12} /></button>
      <button className="btn-icon !h-6 !w-6" title="Copy selection" aria-label="Copy terminal selection" disabled={!shell} onClick={() => void navigator.clipboard.writeText(terminal.current!.getSelection()).catch(() => setError('Could not copy the selection.'))}><Copy size={12} /></button>
      <button className="btn-icon !h-6 !w-6" title="Clear scrollback" aria-label="Clear terminal scrollback" disabled={!shell} onClick={() => terminal.current?.clear()}><Trash2 size={12} /></button>
      <button className="btn-icon !h-6 !w-6" title="Open external terminal" aria-label="Open external terminal" onClick={() => void api.openTerminal().then(result => { if (!result.ok) setError(result.error || 'Could not open the external terminal.'); }).catch(() => setError('Could not open the external terminal.'))}><ExternalLink size={12} /></button>
      <button className="btn-icon !h-6 !w-6" title={maximized ? 'Restore height' : 'Maximize terminal'} aria-label={maximized ? 'Restore terminal height' : 'Maximize terminal'} onClick={() => setMaximized(value => !value)}>{maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button>
      <button className="btn-icon !h-6 !w-6" title="Hide terminal (Ctrl+`)" aria-label="Hide terminal" onClick={() => useApp.setState({ terminalDrawerOpen: false })}><X size={13} /></button>
    </div>
    {confirmRestart && <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2 text-xs text-dim"><span className="flex-1">Restarting stops programs running in this terminal.</span><button className="btn-secondary" onClick={() => setConfirmRestart(false)}>Cancel</button><button className="btn-primary" onClick={() => void restart()}>Restart shell now</button></div>}
    {loading && <p role="status" className="flex items-center gap-2 px-3 py-1 text-xs text-dim"><Loader2 size={12} className="animate-spin" />Starting shell…</p>}
    {error && <p role="alert" className="px-3 py-1 text-xs text-warn">{error}</p>}
    {exitCode !== undefined && <p role="status" className="px-3 py-1 text-xs text-dim">Shell exited with code {exitCode}. Restart the shell to continue.</p>}
    <div ref={host} className="min-h-0 flex-1 px-2 py-1" onKeyDown={event => { if (!(event.ctrlKey || event.metaKey) || !['`', '~'].includes(event.key)) event.stopPropagation(); }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null) && useApp.getState().activeTab === repo) void useApp.getState().refresh().catch(() => {});
    }} />
    <div className="border-t border-edge px-3 py-0.5 text-[10px] text-dim">Tab completion · ↑ history · Ctrl+C interrupt · Ctrl/Cmd+Shift+C/V copy/paste</div>
  </section>;
}
