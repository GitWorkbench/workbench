import React, { useEffect, useState } from 'react';
import { GitBranch, ArrowUp, ArrowDown, Archive, Check, ChevronDown, Home, Terminal, Search, ArrowDownToLine } from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { Dropdown } from '../ui/Dropdown';
import { AppLogo } from '../Common/AppLogo';
import { APP_VERSION } from '../../lib/appVersion';
import { useAppUpdates } from '../../store/appUpdates';

export function StatusBar() {
  const [version, setVersion] = useState(APP_VERSION);
  const update = useAppUpdates(s => s.update);
  const showUpdate = useAppUpdates(s => s.show);
  const updateVisible = update?.availableVersion && ['available', 'downloading', 'downloaded', 'installing', 'error'].includes(update.status);
  const updateLabel = update?.status === 'downloading' ? `Downloading update · ${Math.floor(update.progress ?? 0)}%`
    : update?.status === 'downloaded' ? 'Update ready · Restart'
      : update?.status === 'installing' ? 'Installing update…'
        : update?.status === 'error' ? 'Update needs attention' : 'Update available';
  const status = useApp((s) => s.status);
  const stashes = useApp((s) => s.stashes);
  const log = useApp((s) => s.log);
  const isLoadingMoreCommits = useApp((s) => s.isLoadingMoreCommits);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const terminalOpen = useApp((s) => s.terminalDrawerOpen);
  const toggleTerminalDrawer = useApp((s) => s.toggleTerminalDrawer);
  const openCommandPalette = useApp((s) => s.openCommandPalette);
  const activeTab = useApp((s) => s.activeTab);
  const homeOpen = useApp(s => s.homeOpen);
  const tabCount = useApp(s => s.tabs.length);
  const onHome = homeOpen || !activeTab;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const branch = status?.currentBranch ?? '—';
  const dirty = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0);

  useEffect(() => {
    let active = true;
    void api.getAppUpdateState().then((update) => {
      if (active) setVersion(update.currentVersion);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div className="flex items-center gap-1 bg-panel border-t border-edge px-2 py-0.5 text-xs text-dim shrink-0">
      {onHome ? <span className="flex items-center gap-2 px-1.5 py-0.5"><Home size={11} /><span>Home</span><span className="text-faint">· {tabCount} {tabCount === 1 ? 'repository' : 'repositories'} open</span></span> : <>
      <Dropdown
        trigger={
          <button className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel3 text-fg/90">
            <GitBranch size={11} />
            {branch}
            <ChevronDown size={10} />
          </button>
        }
        width={240}
        align="left"
      >
        {(close) => (
          <>
            {useApp.getState().branches.local.map((b) => (
              <button
                key={b.fullName}
                className="flex w-full items-center gap-2 px-3 py-1 text-sm text-left hover:bg-panel3 text-fg/90"
                onClick={() => {
                  close();
                  if (!b.isCurrent) void runAndRefresh(() => api.checkoutBranch(b.fullName), `Checked out ${b.name}`);
                }}
              >
                <span className="flex-1 truncate">{b.name}</span>
                {b.isCurrent && <Check size={12} className="text-accent" />}
              </button>
            ))}
          </>
        )}
      </Dropdown>

      <button
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel3 disabled:opacity-40"
        disabled={ahead === 0}
        title={`Push ${ahead} commit(s)`}
        onClick={() => void runAndRefresh(() => api.push(), 'Pushed')}
      >
        <ArrowUp size={11} /> {ahead}
      </button>
      <button
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel3 disabled:opacity-40"
        disabled={behind === 0}
        title={`Pull ${behind} commit(s)`}
        onClick={() => void runAndRefresh(() => api.pull(), 'Pulled')}
      >
        <ArrowDown size={11} /> {behind}
      </button>

      {stashes.length > 0 && (
        <span className="flex items-center gap-1 px-1.5">
          <Archive size={11} /> {stashes.length}
        </span>
      )}

      {dirty > 0 && <span className="px-1.5 text-warn">{dirty} changed</span>}

      {log && (
        <span className="flex items-center gap-1 px-1.5 text-dim">
          {isLoadingMoreCommits && (
            <div className="w-2.5 h-2.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-0.5" />
          )}
          <span>
            {log.commits.length} of {log.totalCommits.toLocaleString()} commits
          </span>
        </span>
      )}
      </>}

      <span className="flex-1" />

      {!onHome && (
        <button
          onClick={() => toggleTerminalDrawer()}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs select-none transition-colors ${
            terminalOpen ? 'bg-panel3 text-purple-300 font-medium' : 'hover:bg-panel3 text-dim hover:text-fg'
          }`}
          title="Toggle Embedded Terminal (Ctrl+`)"
        >
          <Terminal size={11} className={terminalOpen ? 'text-purple-400' : ''} />
          <span>Terminal</span>
        </button>
      )}

      <button
        onClick={() => openCommandPalette()}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel3 text-xs text-dim hover:text-fg select-none transition-colors"
        title="Command Palette (Ctrl+K)"
      >
        <Search size={11} />
        <span>⌘K</span>
      </button>

      {updateVisible && <button onClick={showUpdate} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-accent" title={`Git Workbench v${update.availableVersion}`} aria-label={updateLabel}>
        <ArrowDownToLine size={12} /><span role="status" aria-live="polite">{updateLabel}</span>
      </button>}
      <span className="flex items-center gap-1.5 px-1.5 font-mono text-[11px] text-dim hover:text-fg transition-colors">
        <AppLogo size={12} />
        <span>Git Workbench v{update?.currentVersion || version}</span>
      </span>
    </div>
  );
}
