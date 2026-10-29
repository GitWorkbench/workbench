import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  FolderGit2,
  Home,
  Minus,
  Square,
  Copy,
  Settings,
  FlaskConical
} from 'lucide-react';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';
import { AppLogo } from '../Common/AppLogo';

export function TabBar() {
  const { tabs, activeTab, setActiveTab, closeTab, homeOpen, openHome, playgroundOpen, playgroundTabOpen, playgroundLocked, openPlayground, closePlayground } = useApp();
  const openSettings = useSettings((s) => s.openSettings);
  const closeSettings = useSettings((s) => s.closeSettings);
  const isSettingsOpen = useSettings((s) => s.isSettingsOpen);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void api.isWindowMaximized?.().then((max) => {
      if (typeof max === 'boolean') setIsMaximized(max);
    });

    const unsubscribe = api.onMaximizeChange?.((max) => {
      setIsMaximized(max);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div
      className="relative flex items-center bg-base border-b border-edge select-none h-10 px-2 shrink-0 z-30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => void api.maximizeWindow?.()}
    >
      {/* 1. App Branding & Logo */}
      <div
        className="flex items-center gap-2 pr-2.5 py-1 shrink-0 cursor-default"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <AppLogo size={19} />
        <span className="text-[12px] font-bold tracking-wider text-fg/90 font-mono">
          Git <span className="text-accent">Workbench</span>
        </span>
      </div>

      {/* Subtle divider */}
      <div className="w-[1px] h-4 bg-edge mx-1 shrink-0" />

      {/* 2. Tabs Section */}
      <div
        className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 py-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Home combines recent repositories and the pinned dashboard. */}
        <button
          className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            !isSettingsOpen && !playgroundOpen && (homeOpen || !activeTab)
              ? 'bg-panel2 text-accent shadow-sm border border-accent/40 font-semibold'
              : 'text-dim hover:text-fg hover:bg-panel2/60'
          }`}
          onClick={() => {
            closeSettings();
            openHome();
          }}
          title="Home — repositories and dashboard"
          aria-current={!isSettingsOpen && !playgroundOpen && (homeOpen || !activeTab) ? 'page' : undefined}
        >
          <Home size={13} />
          <span>Home</span>
        </button>

        {/* Repository Tabs */}
        {tabs.map((t) => {
          const isActive = !isSettingsOpen && !playgroundOpen && !homeOpen && activeTab === t.path;
          return (
            <div
              key={t.path}
              className={`group relative flex shrink-0 items-center gap-2 pl-3 pr-2 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-all max-w-[210px] ${
                isActive
                  ? 'bg-panel2 text-fg shadow-sm border border-edge font-semibold'
                  : 'text-dim hover:text-fg hover:bg-panel2/60'
              }`}
              onClick={() => {
                closeSettings();
                setActiveTab(t.path);
              }}
              title={t.path}
            >
              <FolderGit2
                size={12}
                className={isActive ? 'text-accent shrink-0' : 'text-dim shrink-0'}
              />
              <span className="truncate">{t.name}</span>
              <button
                className={`rounded p-0.5 ml-1 transition-opacity ${
                  isActive
                    ? 'opacity-60 hover:opacity-100 hover:bg-white/10 text-fg'
                    : 'opacity-0 group-hover:opacity-100 hover:bg-panel3 text-dim hover:text-fg'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.path);
                }}
                title="Close tab"
              >
                <X size={11} />
              </button>
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
              )}
            </div>
          );
        })}

        {playgroundTabOpen && <div className={`flex shrink-0 items-center rounded-md border text-xs ${!isSettingsOpen && playgroundOpen ? 'bg-panel2 text-accent border-accent/40' : 'text-dim border-transparent hover:bg-panel2/60'}`}>
          <button className="flex items-center gap-1.5 px-3 py-1.5 font-medium" aria-label="Git Playground tab" aria-current={!isSettingsOpen && playgroundOpen ? 'page' : undefined} onClick={() => { closeSettings(); openPlayground(); }}><FlaskConical size={13} />Git Playground</button>
          <button className="rounded p-1 mr-1 hover:bg-panel3 disabled:opacity-40" aria-label="Close Git Playground tab" disabled={playgroundLocked} title={playgroundLocked ? 'Save or revert your draft and wait for the current operation before closing. You can switch tabs freely.' : 'Close Git Playground tab'} onClick={closePlayground}><X size={11} /></button>
        </div>}

        {/* Settings Tab (shows when active/open) */}
        {isSettingsOpen && (
          <div
            className="group relative flex items-center gap-2 pl-3 pr-2 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-all max-w-[210px] bg-panel2 text-accent shadow-sm border border-accent/40"
            title="Settings Page"
          >
            <Settings size={12} className="text-accent shrink-0 animate-spin-slow" />
            <span className="truncate">Settings</span>
            <button
              className="rounded p-0.5 ml-1 opacity-70 hover:opacity-100 hover:bg-white/10 text-fg transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                closeSettings();
              }}
              title="Close settings (Esc)"
            >
              <X size={11} />
            </button>
            <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
          </div>
        )}

        {/* Open another repository from Home. */}
        <button
          className="flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-fg hover:bg-panel2 transition-colors ml-0.5"
          onClick={() => {
            closeSettings();
            openHome();
          }}
          title="Open another repository (Home)"
          aria-label="Open another repository"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 3. Center Draggable Space */}
      <div
        className="flex-1 min-w-[30px] h-full cursor-default"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* 4. Action & Window Controls */}
      <div
        className="flex items-center h-full ml-auto shrink-0 -mr-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Settings button */}
        <button
          className={`w-9 h-10 flex items-center justify-center transition-colors mr-1 ${
            isSettingsOpen ? 'text-accent bg-panel3' : 'text-dim hover:text-fg hover:bg-panel3'
          }`}
          onClick={() => (isSettingsOpen ? closeSettings() : openSettings())}
          title="Preferences (Ctrl+,)"
        >
          <Settings size={14} />
        </button>

        <div className="w-[1px] h-4 bg-edge mx-1 shrink-0" />

        <button
          className="w-10 h-10 flex items-center justify-center text-dim hover:text-fg hover:bg-panel3 transition-colors"
          onClick={() => void api.minimizeWindow?.()}
          title="Minimize"
        >
          <Minus size={14} />
        </button>

        <button
          className="w-10 h-10 flex items-center justify-center text-dim hover:text-fg hover:bg-panel3 transition-colors"
          onClick={() => void api.maximizeWindow?.()}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy size={12} className="rotate-90 stroke-[1.8]" />
          ) : (
            <Square size={12} strokeWidth={1.8} />
          )}
        </button>

        <button
          className="w-10 h-10 flex items-center justify-center text-dim hover:text-white hover:bg-del transition-colors"
          onClick={() => void api.closeWindow?.()}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
