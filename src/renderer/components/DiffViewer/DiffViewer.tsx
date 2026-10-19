import React from 'react';
import {
  X,
  Loader2,
  FileText,
  Maximize2,
  Rows2,
  Columns2,
  AlignLeft,
  History,
  UserCheck,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { StatusIcon } from '../CommitDetailPanel/CommitDetailPanel';
import { UnifiedDiffView } from './UnifiedDiffView';
import { SplitDiffView } from './SplitDiffView';
import { BlameView } from './BlameView';
import { FileHistoryView } from './FileHistoryView';

export function DiffViewer() {
  const openDiff = useApp((s) => s.openDiff);
  const fileDiff = useApp((s) => s.fileDiff);
  const loading = useApp((s) => s.diffLoading);
  const closeDiff = useApp((s) => s.closeDiff);
  const diffHeight = useApp((s) => s.diffHeight);
  const diffMaximized = useApp((s) => s.diffMaximized);
  const setDiffHeight = useApp((s) => s.setDiffHeight);
  const toggleDiffMaximized = useApp((s) => s.toggleDiffMaximized);
  const diffViewMode = useApp((s) => s.diffViewMode);
  const setDiffViewMode = useApp((s) => s.setDiffViewMode);
  const diffActiveTab = useApp((s) => s.diffActiveTab);
  const setDiffActiveTab = useApp((s) => s.setDiffActiveTab);

  if (!openDiff) return null;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = diffHeight;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY; // dragging upwards increases height
      setDiffHeight(startH + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleOpenInEditor = () => {
    if (!openDiff) return;
    api.openInEditor(openDiff.filePath).catch((err) => {
      console.error('Failed to open file in editor:', err);
    });
  };

  return (
    <div
      className={`relative min-w-0 min-h-0 flex flex-col bg-base overflow-hidden border-t border-edge ${
        diffMaximized ? 'flex-1 h-full' : 'shrink-0'
      }`}
      style={diffMaximized ? undefined : { height: `${diffHeight}px` }}
    >
      {/* Draggable resize handle */}
      {!diffMaximized && (
        <div
          className="absolute top-0 left-0 right-0 h-1.5 -mt-0.5 cursor-row-resize hover:bg-accent/50 z-20 transition-colors"
          title="Drag to resize diff view"
          onMouseDown={startResize}
        />
      )}

      {/* Main Diff Header Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border-b border-edge shrink-0 select-none z-10 flex-wrap">
        {/* File icon, path & status badge */}
        <StatusIcon status={openDiff.status ?? (openDiff.staged ? 'added' : 'modified')} />
        <span className="font-mono text-sm text-fg truncate max-w-xs sm:max-w-md font-medium">
          {openDiff.filePath}
        </span>

        {openDiff.commitHash === null && (
          <span className="text-[10px] rounded bg-panel3 px-1.5 py-px text-warn font-semibold border border-warn/30">
            {openDiff.staged ? 'STAGED' : 'WORKING DIR'}
          </span>
        )}

        {fileDiff && (fileDiff.insertions > 0 || fileDiff.deletions > 0) && (
          <span className="text-xs text-dim shrink-0 font-mono">
            <span className="text-add font-medium">+{fileDiff.insertions}</span>{' '}
            <span className="text-del font-medium">-{fileDiff.deletions}</span>
          </span>
        )}

        {/* Center / Navigation Tabs: Diff | Blame | History */}
        <div className="flex items-center gap-0.5 bg-panel2 p-0.5 rounded-md border border-edge/50 ml-2">
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              diffActiveTab === 'diff'
                ? 'bg-panel text-fg font-medium shadow-xs'
                : 'text-dim hover:text-fg'
            }`}
            onClick={() => setDiffActiveTab('diff')}
            title="View code changes diff"
          >
            <FileCode size={12} className={diffActiveTab === 'diff' ? 'text-accent' : ''} />
            <span>Diff</span>
          </button>

          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              diffActiveTab === 'blame'
                ? 'bg-panel text-fg font-medium shadow-xs'
                : 'text-dim hover:text-fg'
            }`}
            onClick={() => setDiffActiveTab('blame')}
            title="Inspect line-by-line git blame"
          >
            <UserCheck size={12} className={diffActiveTab === 'blame' ? 'text-accent' : ''} />
            <span>Blame</span>
          </button>

          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              diffActiveTab === 'history'
                ? 'bg-panel text-fg font-medium shadow-xs'
                : 'text-dim hover:text-fg'
            }`}
            onClick={() => setDiffActiveTab('history')}
            title="Explore file commit revision history"
          >
            <History size={12} className={diffActiveTab === 'history' ? 'text-accent' : ''} />
            <span>History</span>
          </button>
        </div>

        <span className="flex-1" />

        {/* Diff Mode Toggle (Unified vs Split) - only when Diff tab is active */}
        {diffActiveTab === 'diff' && (
          <div className="flex items-center gap-0.5 bg-panel2 p-0.5 rounded-md border border-edge/50">
            <button
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                diffViewMode === 'unified'
                  ? 'bg-panel text-fg font-medium shadow-xs'
                  : 'text-dim hover:text-fg'
              }`}
              title="Unified single-column diff"
              onClick={() => setDiffViewMode('unified')}
            >
              <AlignLeft size={12} />
              <span className="hidden md:inline text-[11px]">Unified</span>
            </button>
            <button
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                diffViewMode === 'split'
                  ? 'bg-panel text-fg font-medium shadow-xs'
                  : 'text-dim hover:text-fg'
              }`}
              title="Side-by-side 2-column split diff"
              onClick={() => setDiffViewMode('split')}
            >
              <Columns2 size={12} />
              <span className="hidden md:inline text-[11px]">Split</span>
            </button>
          </div>
        )}

        {/* Open in Editor button */}
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-dim hover:text-fg hover:bg-panel3 border border-edge/40 transition-colors"
          title="Open this file in default editor or system handler"
          onClick={handleOpenInEditor}
        >
          <ExternalLink size={12} />
          <span className="hidden lg:inline text-[11px]">Edit on Disk</span>
        </button>

        {/* Maximize / Restore Toggle */}
        <button
          className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-dim hover:text-fg hover:bg-panel3 border border-edge/40 transition-colors"
          title={diffMaximized ? 'Restore split view (show commit graph)' : 'Full diff view (hide graph)'}
          onClick={toggleDiffMaximized}
        >
          {diffMaximized ? (
            <>
              <Rows2 size={12} className="text-dim" />
              <span className="text-[11px] hidden sm:inline">Split View</span>
            </>
          ) : (
            <>
              <Maximize2 size={12} className="text-accent" />
              <span className="text-[11px] text-accent hidden sm:inline">Full Diff</span>
            </>
          )}
        </button>

        {/* Close Button */}
        <button className="btn-icon !w-6 !h-6" title="Close diff (Esc)" onClick={closeDiff}>
          <X size={13} />
        </button>
      </div>

      {/* Main Diff Content Container */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 bg-base">
        {diffActiveTab === 'blame' ? (
          <BlameView filePath={openDiff.filePath} />
        ) : diffActiveTab === 'history' ? (
          <FileHistoryView filePath={openDiff.filePath} />
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-dim">
            <Loader2 size={18} className="animate-spin text-accent" />
          </div>
        ) : fileDiff?.isBinary ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-sm py-16">
            <FileText size={24} className="opacity-50" />
            <span>Binary file cannot be displayed inline</span>
          </div>
        ) : !fileDiff || fileDiff.hunks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-sm py-16">
            <FileText size={24} className="opacity-50" />
            <span>
              {openDiff.commitHash === null
                ? 'No textual changes in working directory (empty or clean file)'
                : 'No diff available (empty file or identical content)'}
            </span>
          </div>
        ) : diffViewMode === 'split' ? (
          <SplitDiffView
            hunks={fileDiff.hunks}
            isCommitted={openDiff.commitHash !== null}
          />
        ) : (
          <UnifiedDiffView
            hunks={fileDiff.hunks}
            isCommitted={openDiff.commitHash !== null}
          />
        )}
      </div>
    </div>
  );
}
