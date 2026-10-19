import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Pencil,
  Plus,
  Minus,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  FileText,
  List,
  GitBranch,
  Loader2,
  MessageSquarePlus,
  Check,
  Undo2,
  RotateCcw,
  Copy,
  Layers,
  Tag as TagIcon,
  X,
  Sparkles,
  Zap,
  Wand2,
  User,
  AlertCircle,
  Sliders,
  ChevronUp,
  GitMerge
} from 'lucide-react';
import { FileChange, FileStatusKind, ComparisonResult, StashDetail } from '../../../shared/types';
import { useApp, WIP_HASH } from '../../store';
import { useSettings } from '../../store/settings';
import { Avatar } from '../ui/Avatar';
import { Dropdown, MenuItem } from '../ui/Dropdown';
import { api } from '../../lib/api';

export function StatusIcon({ status }: { status: FileStatusKind }) {
  const map: Record<FileStatusKind, { icon: React.ReactNode; color: string; title: string }> = {
    modified: { icon: <Pencil size={11} />, color: 'text-warn', title: 'Modified' },
    added: { icon: <Plus size={12} className="stroke-[2.5]" />, color: 'text-add', title: 'Added' },
    deleted: { icon: <Minus size={12} className="stroke-[2.5]" />, color: 'text-del', title: 'Deleted' },
    renamed: { icon: <ArrowRight size={11} />, color: 'text-accent', title: 'Renamed' },
    untracked: { icon: <Plus size={12} className="stroke-[2.5]" />, color: 'text-add', title: 'Untracked / New file' },
    conflicted: { icon: <GitMerge size={12} />, color: 'text-del', title: 'Conflicted · open merge editor' }
  };
  const { icon, color, title } = map[status] || map.modified;
  return (
    <span className={`${color} shrink-0 flex items-center justify-center w-3.5 h-3.5`} title={title}>
      {icon}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' @ ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

/** Working-copy commit form: stage/unstage/discard + commit message box. */
function WorkdirPanel() {
  const status = useApp((s) => s.status);
  const openDiff = useApp((s) => s.openDiff);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const [msg, setMsg] = useState('');

  const {
    defaultAuthorName,
    defaultAuthorEmail,
    commitProfiles,
    activeProfileId,
    setActiveProfileId,
    aiCommit,
    openSettings
  } = useSettings();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [generateMode, setGenerateMode] = useState<'smart' | 'ai'>('smart');
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeProfile = useMemo(() => {
    return (
      commitProfiles.find((p) => p.id === activeProfileId) || {
        id: 'default',
        name: 'Default Profile',
        authorName: defaultAuthorName,
        authorEmail: defaultAuthorEmail,
        signingKey: ''
      }
    );
  }, [commitProfiles, activeProfileId, defaultAuthorName, defaultAuthorEmail]);

  const effectiveAuthorName = activeProfile.authorName || defaultAuthorName;
  const effectiveAuthorEmail = activeProfile.authorEmail || defaultAuthorEmail;

  const stagedCounts = useMemo(() => {
    if (!status) return { modified: 0, added: 0, deleted: 0 };
    const modified = status.staged.filter((f) => f.status === 'modified' || f.status === 'renamed').length;
    const added = status.staged.filter((f) => f.status === 'added' || f.status === 'untracked').length;
    const deleted = status.staged.filter((f) => f.status === 'deleted').length;
    return { modified, added, deleted };
  }, [status]);

  const unstagedCounts = useMemo(() => {
    if (!status) return { modified: 0, added: 0, deleted: 0 };
    const modified = status.unstaged.filter((f) => f.status === 'modified' || f.status === 'renamed').length;
    const added = status.unstaged.filter((f) => f.status === 'added' || f.status === 'untracked').length;
    const deleted = status.unstaged.filter((f) => f.status === 'deleted').length;
    return { modified, added, deleted };
  }, [status]);

  const doCommit = async () => {
    if (!msg.trim() || !status?.staged.length) return;
    const authorParam = effectiveAuthorName
      ? { name: effectiveAuthorName, email: effectiveAuthorEmail }
      : undefined;
    const ok = await runAndRefresh(() => api.commit(msg.trim(), authorParam), 'Commit created');
    if (ok) setMsg('');
  };

  const handleGenerateCommitMessage = async (overrideMode?: 'smart' | 'ai') => {
    const stagedCount = status?.staged.length ?? 0;
    const unstagedCount = status?.unstaged.length ?? 0;
    if (stagedCount === 0 && unstagedCount === 0) {
      setAiError('No changes detected. Stage or modify files before generating a commit message.');
      return;
    }
    const mode = overrideMode || generateMode;
    setGeneratingAi(true);
    setAiError(null);
    try {
      // If nothing staged yet, auto-stage all files for the user
      if (stagedCount === 0 && unstagedCount > 0) {
        await api.stageAll();
        await runAndRefresh(() => Promise.resolve());
      }
      const config = mode === 'smart' ? { ...aiCommit, provider: 'local' as const } : aiCommit;
      const res = await api.generateAiCommitMessage(config);
      if (res.ok && res.message) {
        setMsg(res.message);
      } else {
        setAiError(res.error || 'Failed to generate commit message');
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error && err.message ? err.message : 'Generation failed');
    } finally {
      setGeneratingAi(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      {status && status.staged.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-dim bg-panel2/40 border-b border-edge/30">
            <span className="font-semibold text-fg/80">STAGED FILES ({status.staged.length})</span>
            <div className="flex items-center gap-2 ml-1 text-xs font-mono">
              {stagedCounts.modified > 0 && (
                <span className="flex items-center gap-0.5 text-warn text-[11px]" title={`${stagedCounts.modified} modified`}>
                  <Pencil size={10} className="text-warn shrink-0" />
                  <span>{stagedCounts.modified}</span>
                </span>
              )}
              {stagedCounts.added > 0 && (
                <span className="flex items-center gap-0.5 text-add text-[11px]" title={`${stagedCounts.added} new`}>
                  <Plus size={11} className="text-add shrink-0 stroke-[2.5]" />
                  <span>{stagedCounts.added}</span>
                </span>
              )}
              {stagedCounts.deleted > 0 && (
                <span className="flex items-center gap-0.5 text-del text-[11px]" title={`${stagedCounts.deleted} deleted`}>
                  <Minus size={11} className="text-del shrink-0 stroke-[2.5]" />
                  <span>{stagedCounts.deleted}</span>
                </span>
              )}
            </div>
            <span className="flex-1" />
            <button className="hover:text-fg hover:bg-panel3 p-1 rounded" title="Unstage all" onClick={() => void runAndRefresh(() => api.unstageAll())}>
              <Undo2 size={12} />
            </button>
          </div>
          {status.staged.map((f) => {
            const active = openDiff?.filePath === f.path && openDiff?.commitHash === null && openDiff?.staged === true;
            return (
              <div
                key={f.path}
                className={`group flex items-center gap-2 px-3 py-1 text-sm select-none ${
                  active ? 'bg-accent/15' : 'hover:bg-panel2'
                }`}
              >
                <StatusIcon status={f.status} />
                <span
                  className={`truncate font-mono text-xs flex-1 cursor-pointer hover:underline ${
                    f.status === 'untracked' || f.status === 'added'
                      ? 'text-add hover:text-add'
                      : f.status === 'deleted'
                        ? 'text-del line-through hover:text-del'
                        : 'text-fg/90 hover:text-accent'
                  }`}
                  title={f.path}
                  onClick={() => void useApp.getState().openFileDiff({ commitHash: null, filePath: f.path, staged: true, status: f.status })}
                >
                  {f.path}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-dim hover:text-fg hover:bg-panel3 transition-opacity"
                    title="Unstage"
                    onClick={() => void runAndRefresh(() => api.unstageFiles([f.path]))}
                  >
                    <Undo2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {status && status.unstaged.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-dim bg-panel2/40 border-b border-edge/30">
            <span className="font-semibold text-fg/80">UNSTAGED FILES ({status.unstaged.length})</span>
            <div className="flex items-center gap-2 ml-1 text-xs font-mono">
              {unstagedCounts.modified > 0 && (
                <span className="flex items-center gap-0.5 text-warn text-[11px]" title={`${unstagedCounts.modified} modified`}>
                  <Pencil size={10} className="text-warn shrink-0" />
                  <span>{unstagedCounts.modified}</span>
                </span>
              )}
              {unstagedCounts.added > 0 && (
                <span className="flex items-center gap-0.5 text-add text-[11px]" title={`${unstagedCounts.added} new/untracked`}>
                  <Plus size={11} className="text-add shrink-0 stroke-[2.5]" />
                  <span>{unstagedCounts.added}</span>
                </span>
              )}
              {unstagedCounts.deleted > 0 && (
                <span className="flex items-center gap-0.5 text-del text-[11px]" title={`${unstagedCounts.deleted} deleted`}>
                  <Minus size={11} className="text-del shrink-0 stroke-[2.5]" />
                  <span>{unstagedCounts.deleted}</span>
                </span>
              )}
            </div>
            <span className="flex-1" />
            <button className="hover:text-fg hover:bg-panel3 p-1 rounded" title="Stage all" onClick={() => void runAndRefresh(() => api.stageAll())}>
              <Plus size={12} />
            </button>
          </div>
          {status.unstaged.map((f) => {
            const active = openDiff?.filePath === f.path && openDiff?.commitHash === null && openDiff?.staged === false;
            return (
              <div
                key={f.path}
                className={`group flex items-center gap-2 px-3 py-1 text-sm select-none ${
                  active ? 'bg-accent/15' : 'hover:bg-panel2'
                }`}
              >
                <StatusIcon status={f.status} />
                <span
                  className={`truncate font-mono text-xs flex-1 cursor-pointer hover:underline ${
                    f.status === 'untracked' || f.status === 'added'
                      ? 'text-add hover:text-add'
                      : f.status === 'deleted'
                        ? 'text-del line-through hover:text-del'
                        : 'text-fg/90 hover:text-accent'
                  }`}
                  title={f.path}
                  onClick={() => {
                    if (f.status === 'conflicted') useApp.getState().openConflictResolver(f.path);
                    else void useApp.getState().openFileDiff({ commitHash: null, filePath: f.path, staged: false, status: f.status });
                  }}
                >
                  {f.path}
                </span>
                {f.status === 'untracked' && (
                  <span className="text-[9px] uppercase font-mono px-1 rounded bg-add/10 text-add border border-add/25 shrink-0">
                    new
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {f.status === 'conflicted' ? <button
                    className="flex items-center gap-1 rounded border border-warn/30 px-1.5 py-0.5 text-[10px] text-warn hover:bg-warn/10"
                    title="Resolve this file in the three-pane merge editor"
                    onClick={() => useApp.getState().openConflictResolver(f.path)}
                  ><GitMerge size={11} />Resolve</button> : <button
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-dim hover:text-fg hover:bg-panel3 transition-opacity"
                    title="Stage file"
                    onClick={() => void runAndRefresh(() => api.stageFiles([f.path]))}
                  >
                    <Plus size={11} />
                  </button>}
                  {f.status !== 'untracked' && f.status !== 'conflicted' && (
                    <button
                      className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-dim hover:text-del hover:bg-del/10 transition-opacity"
                      title="Discard changes"
                      onClick={() => void runAndRefresh(() => api.discardFile(f.path), 'Changes discarded')}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Commit box */}
      <div className="p-3 border-t border-edge mt-auto space-y-2 bg-panel2/30">
        {/* Profile and AI Action Header */}
        <div className="flex items-center justify-between gap-1 relative">
          {/* Active Commit Profile Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-panel2 hover:bg-panel3 border border-edge/80 text-[11px] text-fg transition-all"
              title={`Commit Profile: ${activeProfile.name} (${effectiveAuthorName || 'Default Git Author'})`}
            >
              <User size={11} className="text-accent" />
              <span className="font-medium max-w-[120px] truncate">{activeProfile.name}</span>
              {profileDropdownOpen ? <ChevronUp size={11} className="text-dim" /> : <ChevronDown size={11} className="text-dim" />}
            </button>

            {/* Profile Dropdown */}
            {profileDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileDropdownOpen(false)}
                />
                <div className="absolute left-0 bottom-full mb-1 z-50 w-64 rounded-lg border border-edge bg-panel shadow-2xl p-1 text-xs space-y-1 animate-in fade-in">
                  <div className="px-2 py-1 text-[10px] font-semibold text-dim uppercase tracking-wider border-b border-edge/60">
                    Switch Commit Profile
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {commitProfiles.map((p) => {
                      const isCur = p.id === activeProfileId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActiveProfileId(p.id);
                            setProfileDropdownOpen(false);
                          }}
                          className={`flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-all ${
                            isCur ? 'bg-accent/15 text-accent font-semibold' : 'text-fg/90 hover:bg-panel2'
                          }`}
                        >
                          <div className="w-3.5 h-3.5 mt-0.5 rounded-full border border-edge flex items-center justify-center shrink-0">
                            {isCur && <span className="w-2 h-2 rounded-full bg-accent" />}
                          </div>
                          <div className="truncate flex-1">
                            <div className="text-xs truncate">{p.name}</div>
                            <div className="text-[10px] text-dim font-mono truncate">
                              {p.authorName || defaultAuthorName || 'Default'}{' '}
                              &lt;{p.authorEmail || defaultAuthorEmail || 'no-email'}&gt;
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-1 border-t border-edge/60">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        openSettings();
                      }}
                      className="flex items-center gap-1.5 w-full text-left px-2 py-1 text-[11px] text-dim hover:text-fg hover:bg-panel2 rounded"
                    >
                      <Sliders size={11} />
                      <span>Manage Profiles &amp; Signing...</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Commit Message Generator Action Group */}
          <div className="flex items-center rounded border border-edge/80 bg-panel2 p-0.5 shadow-xs">
            <button
              type="button"
              disabled={generatingAi || ((status?.staged.length ?? 0) === 0 && (status?.unstaged.length ?? 0) === 0)}
              onClick={() => void handleGenerateCommitMessage()}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                ((status?.staged.length ?? 0) > 0 || (status?.unstaged.length ?? 0) > 0) && !generatingAi
                  ? 'hover:bg-accent/20 text-accent cursor-pointer active:scale-95'
                  : 'text-dim/50 cursor-not-allowed'
              }`}
              title={
                ((status?.staged.length ?? 0) === 0 && (status?.unstaged.length ?? 0) === 0)
                  ? 'No changes detected to generate commit message'
                  : generateMode === 'smart'
                  ? 'Generate conventional commit message using smart diff inspection (Fast, local & offline, no AI)'
                  : `Generate commit message using ${aiCommit.provider} AI model`
              }
            >
              {generatingAi ? (
                <>
                  <Loader2 size={12} className="animate-spin text-accent" />
                  <span>Generating…</span>
                </>
              ) : generateMode === 'smart' ? (
                <>
                  <Zap size={11} className="text-warn shrink-0" />
                  <span>Generate Message</span>
                </>
              ) : (
                <>
                  <Sparkles size={11} className="text-accent shrink-0" />
                  <span>Generate (AI)</span>
                </>
              )}
            </button>

            {/* Mode Selector Dropdown */}
            <div className="relative border-l border-edge/60 pl-0.5">
              <button
                type="button"
                onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                className="p-1 rounded text-dim hover:text-fg hover:bg-panel3"
                title="Select generator mode: Smart Heuristic (No AI) or AI Model"
              >
                {modeDropdownOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {modeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModeDropdownOpen(false)} />
                  <div className="absolute right-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-edge bg-panel shadow-2xl p-1 text-xs space-y-1 animate-in fade-in">
                    <div className="px-2 py-1 text-[10px] font-semibold text-dim uppercase tracking-wider border-b border-edge/60">
                      Message Generator
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGenerateMode('smart');
                        setModeDropdownOpen(false);
                      }}
                      className={`flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-all ${
                        generateMode === 'smart' ? 'bg-accent/15 text-accent font-semibold' : 'text-fg/90 hover:bg-panel2'
                      }`}
                    >
                      <Zap size={13} className="text-warn mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs">Smart Rule-Based (No AI)</div>
                        <div className="text-[10px] text-dim">Instant offline conventional commit diff analysis</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenerateMode('ai');
                        setModeDropdownOpen(false);
                      }}
                      className={`flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-all ${
                        generateMode === 'ai' ? 'bg-accent/15 text-accent font-semibold' : 'text-fg/90 hover:bg-panel2'
                      }`}
                    >
                      <Sparkles size={13} className="text-accent mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs">AI Model ({aiCommit.provider})</div>
                        <div className="text-[10px] text-dim">Cloud/Ollama generative AI assistant</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* AI Error Alert */}
        {aiError && (
          <div className="flex items-center justify-between p-2 rounded bg-del-bg/30 border border-del/30 text-[11px] text-del animate-in fade-in">
            <div className="flex items-center gap-1.5 truncate">
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate">{aiError}</span>
            </div>
            <button
              type="button"
              className="p-0.5 hover:bg-black/20 rounded shrink-0 ml-1"
              onClick={() => setAiError(null)}
            >
              <X size={10} />
            </button>
          </div>
        )}

        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void doCommit();
          }}
          placeholder="Commit message (e.g. feat: add new feature)&#10;Press Ctrl+Enter to commit"
          rows={3}
          className="w-full text-xs font-mono resize-none rounded border border-edge bg-base/80 p-2 text-fg placeholder:text-dim/60 focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
        />

        <button
          className="w-full flex items-center justify-center gap-2 rounded bg-accent hover:bg-accent-hover text-white py-1.5 text-xs font-semibold disabled:opacity-40 shadow-sm transition-all active:scale-[0.99]"
          disabled={!msg.trim() || (status?.staged.length ?? 0) === 0}
          onClick={() => void doCommit()}
          title="Commit staged changes (Ctrl+Enter)"
        >
          <MessageSquarePlus size={13} />
          <span>Commit {status?.staged.length ? `${status.staged.length} staged file${status.staged.length === 1 ? '' : 's'}` : ''}</span>
          {activeProfile.signingKey && (
            <span className="ml-1 text-[10px] bg-black/20 px-1 py-0.2 rounded font-normal text-white/90">
              🔑 Signed
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function FileRow({ file, commitHash }: { file: FileChange; commitHash: string | null }) {
  const openFileDiff = useApp((s) => s.openFileDiff);
  const openDiff = useApp((s) => s.openDiff);
  const active = openDiff?.filePath === file.path && openDiff?.commitHash === commitHash;
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1 text-sm text-left hover:bg-panel2 ${
        active ? 'bg-accent/10 text-accent' : 'text-fg/90'
      }`}
      onClick={() => void openFileDiff({ commitHash, filePath: file.path, status: file.status })}
      title={file.path}
    >
      <StatusIcon status={file.status} />
      <span className="truncate font-mono text-xs flex-1">{file.path}</span>
      {file.insertions !== undefined && file.insertions > 0 && <span className="text-add text-xs">+{file.insertions}</span>}
      {file.deletions !== undefined && file.deletions > 0 && <span className="text-del text-xs">-{file.deletions}</span>}
    </button>
  );
}

function FileList({ files, commitHash }: { files: FileChange[]; commitHash: string | null }) {
  const [mode, setMode] = useState<'path' | 'tree'>('path');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => {
    const root: { name: string; path: string; children: Map<string, never[]> } & { files: FileChange[] } = Object.assign(
      { name: '', path: '', children: new Map(), files: [] as FileChange[] },
      {}
    );
    const folders = new Map<string, { name: string; files: FileChange[]; sub: Map<string, unknown> }>();
    folders.set('', { name: '', files: [], sub: new Map() });
    for (const f of files) {
      const parts = f.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      if (!folders.has(dir)) folders.set(dir, { name: dir, files: [], sub: new Map() });
      folders.get(dir)!.files.push(f);
    }
    return folders;
  }, [files]);

  const rootFiles = tree.get('')?.files ?? [];
  const dirs = [...tree.keys()].filter((k) => k !== '').sort();

  const toggleDir = (d: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  const dirCount = (d: string) =>
    files.filter((f) => f.path.startsWith(d + '/')).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-edge/60 text-xs text-dim">
        <span className="flex-1">{files.length} changed file{files.length === 1 ? '' : 's'}</span>
        <button
          className={`btn-icon !w-5 !h-5 ${mode === 'path' ? '!text-accent' : ''}`}
          title="Path view"
          onClick={() => setMode('path')}
        >
          <List size={12} />
        </button>
        <button
          className={`btn-icon !w-5 !h-5 ${mode === 'tree' ? '!text-accent' : ''}`}
          title="Tree view"
          onClick={() => setMode('tree')}
        >
          <FileText size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {mode === 'path' ? (
          files.map((f) => <FileRow key={f.path} file={f} commitHash={commitHash} />)
        ) : (
          <>
            {dirs.map((d) => (
              <div key={d}>
                <button
                  className="flex w-full items-center gap-1.5 px-3 py-1 text-sm text-left hover:bg-panel2 text-fg/90"
                  onClick={() => toggleDir(d)}
                >
                  {collapsed.has(d) ? <ChevronRight size={12} className="text-faint" /> : <ChevronDown size={12} className="text-faint" />}
                  <span className="truncate flex-1 font-mono text-xs">{d}/</span>
                  <span className="text-[10px] text-faint">{dirCount(d)}</span>
                </button>
                {!collapsed.has(d) && tree.get(d)!.files.map((f) => <FileRow key={f.path} file={f} commitHash={commitHash} />)}
              </div>
            ))}
            {rootFiles.map((f) => (
              <FileRow key={f.path} file={f} commitHash={commitHash} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ComparisonView({
  result,
  compareCommits,
  onSwap,
  onClose
}: {
  result: ComparisonResult;
  compareCommits: [string, string];
  onSwap: () => void;
  onClose: () => void;
}) {
  const openFileDiff = useApp((s) => s.openFileDiff);
  const openDiff = useApp((s) => s.openDiff);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-edge bg-panel2/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
              DIFF
            </span>
            <span className="font-mono text-xs font-semibold text-fg">
              {result.baseHash.slice(0, 7)} .. {result.targetHash.slice(0, 7)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="btn text-xs !py-0.5 !px-2 hover:bg-cyan-900/40 border-cyan-700/40 text-cyan-300" onClick={onSwap} title="Swap base and target">
              Swap
            </button>
            <button className="btn-icon !w-6 !h-6 hover:text-fg text-dim" onClick={onClose} title="Close comparison (Esc)">
              <X size={13} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-dim">
          Comparing revision <code className="text-cyan-300 font-mono">{result.baseHash.slice(0, 7)}</code> with <code className="text-cyan-300 font-mono">{result.targetHash.slice(0, 7)}</code>
        </p>
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-edge text-xs">
        <span className="text-dim">{result.files.length} changed file{result.files.length === 1 ? '' : 's'}</span>
        <span className="text-add font-mono">+{result.insertions}</span>
        <span className="text-del font-mono">-{result.deletions}</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {result.files.map((file) => {
          const active = openDiff?.filePath === file.path && openDiff?.compareCommits?.[0] === compareCommits[0] && openDiff?.compareCommits?.[1] === compareCommits[1];
          return (
            <button
              key={file.path}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-panel2 transition-colors border-b border-edge/20 ${
                active ? 'bg-cyan-500/15 text-cyan-200 border-l-2 border-cyan-400 font-medium' : 'text-fg/90'
              }`}
              onClick={() => void openFileDiff({ commitHash: null, filePath: file.path, compareCommits, status: file.status })}
              title={file.path}
            >
              <StatusIcon status={file.status} />
              <span className="truncate font-mono text-xs flex-1">{file.path}</span>
              {(file.insertions ?? 0) > 0 && <span className="text-add text-xs font-mono">+{file.insertions}</span>}
              {(file.deletions ?? 0) > 0 && <span className="text-del text-xs font-mono">-{file.deletions}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StashInspectorView({
  stash,
  onClose
}: {
  stash: StashDetail;
  onClose: () => void;
}) {
  const openFileDiff = useApp((s) => s.openFileDiff);
  const openDiff = useApp((s) => s.openDiff);
  const runAndRefresh = useApp((s) => s.runAndRefresh);

  const handleApplyFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    await runAndRefresh(async () => {
      const res = await api.applyStashFile(stash.index, filePath);
      if (!res.ok) throw new Error(res.error || 'Failed to apply stash file');
    }, `Restored ${filePath} from stash@{${stash.index}}`);
  };

  const handleApplyStash = async () => {
    await runAndRefresh(async () => {
      await api.stashApply(stash.index);
    }, `Applied stash@{${stash.index}}`);
  };

  const handleDropStash = async () => {
    if (!window.confirm(`Drop stash@{${stash.index}}? This action cannot be undone.`)) return;
    await runAndRefresh(async () => {
      await api.stashDrop(stash.index);
      onClose();
    }, `Dropped stash@{${stash.index}}`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-edge bg-panel2/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
              STASH @{stash.index}
            </span>
            <span className="text-xs text-dim">{formatDate(stash.date)}</span>
          </div>
          <button className="btn-icon !w-6 !h-6 hover:text-fg text-dim" onClick={onClose} title="Close inspector">
            <X size={13} />
          </button>
        </div>
        <h3 className="mt-2 text-sm font-medium text-fg selectable">{stash.message}</h3>

        <div className="flex items-center gap-2 mt-2.5">
          <button className="btn text-xs !py-1 !px-2.5 bg-accent/20 hover:bg-accent/30 text-accent border-accent/40 font-medium" onClick={handleApplyStash}>
            Apply Stash
          </button>
          <button className="btn text-xs !py-1 !px-2.5 hover:text-del hover:border-del/40" onClick={handleDropStash}>
            Drop Stash
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-edge text-xs">
        <span className="text-dim">{stash.files.length} file{stash.files.length === 1 ? '' : 's'}</span>
        <span className="text-add font-mono">+{stash.insertions}</span>
        <span className="text-del font-mono">-{stash.deletions}</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {stash.files.map((file) => {
          const active = openDiff?.filePath === file.path && openDiff?.stashIndex === stash.index;
          return (
            <div
              key={file.path}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-panel2 transition-colors border-b border-edge/20 group cursor-pointer ${
                active ? 'bg-purple-500/15 text-purple-200 border-l-2 border-purple-400 font-medium' : 'text-fg/90'
              }`}
              onClick={() => void openFileDiff({ commitHash: null, filePath: file.path, stashIndex: stash.index, status: file.status })}
              title={file.path}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <StatusIcon status={file.status} />
                <span className="truncate font-mono text-xs flex-1">{file.path}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(file.insertions ?? 0) > 0 && <span className="text-add text-xs font-mono">+{file.insertions}</span>}
                {(file.deletions ?? 0) > 0 && <span className="text-del text-xs font-mono">-{file.deletions}</span>}
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity btn text-[10px] !py-0.5 !px-1.5 hover:bg-accent/20 hover:text-accent border-edge"
                  onClick={(e) => void handleApplyFile(e, file.path)}
                  title="Apply only this file from stash into working copy"
                >
                  Apply File
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommitDetailPanel() {
  const detail = useApp((s) => s.commitDetail);
  const loading = useApp((s) => s.detailLoading);
  const selectedCommit = useApp((s) => s.selectedCommit);
  const selectCommit = useApp((s) => s.selectCommit);
  const compareCommits = useApp((s) => s.compareCommits);
  const comparisonResult = useApp((s) => s.comparisonResult);
  const setCompareCommits = useApp((s) => s.setCompareCommits);
  const selectedStashIndex = useApp((s) => s.selectedStashIndex);
  const stashDetail = useApp((s) => s.stashDetail);
  const inspectStash = useApp((s) => s.inspectStash);
  const notify = useApp((s) => s.notify);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const openRebaseModal = useApp((s) => s.openRebaseModal);
  const cherryPickCommit = useApp((s) => s.cherryPickCommit);
  const openCreateTagModal = useApp((s) => s.openCreateTagModal);
  const isWip = selectedCommit === WIP_HASH;
  const [panelWidth, setPanelWidth] = useState(380);

  const aiConfig = useSettings(s => s.aiCommit);
  const explanationRequest = useRef(0);

  // AI Explain state
  const [explaining, setExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  useEffect(() => {
    explanationRequest.current++;
    setExplaining(false);
    setAiExplanation(null);
    setExplainOpen(false);
    setExplainError(null);
  }, [selectedCommit, compareCommits, aiConfig]);

  const handleExplainChanges = async () => {
    setExplainOpen(true);
    if (aiExplanation || explaining) return;
    const request = ++explanationRequest.current;
    setExplaining(true);
    setExplainError(null);
    try {
      const res = await api.explainChanges({
        commitHash: selectedCommit && selectedCommit !== WIP_HASH ? selectedCommit : undefined,
        config: aiConfig
      });
      if (request !== explanationRequest.current) return;
      if (res.ok && res.explanation) {
        setAiExplanation(res.explanation);
      } else {
        setExplainError(res.error || 'Failed to explain changes');
      }
    } catch (err) {
      if (request === explanationRequest.current) setExplainError(String(err));
    } finally {
      if (request === explanationRequest.current) setExplaining(false);
    }
  };

  // Close panel on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (compareCommits) void setCompareCommits(null);
        else if (selectedStashIndex !== null) void inspectStash(null);
        else void selectCommit(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectCommit, compareCommits, selectedStashIndex, setCompareCommits, inspectStash]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.max(260, Math.min(640, startW - (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const hasActive = !!selectedCommit || !!compareCommits || selectedStashIndex !== null;
  if (!hasActive && !loading) {
    return null;
  }

  if (loading) {
    return (
      <div
        className="relative shrink-0 border-l border-edge bg-panel flex items-center justify-center min-h-0"
        style={{ width: panelWidth }}
      >
        <div
          className="absolute top-0 left-0 h-full w-1 cursor-col-resize hover:bg-accent/40 z-10"
          onMouseDown={startResize}
        />
        <Loader2 size={18} className="animate-spin text-dim" />
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 border-l border-edge bg-panel flex flex-col min-h-0"
      style={{ width: panelWidth }}
    >
      {/* Draggable resize handle */}
      <div
        className="absolute top-0 left-0 h-full w-1.5 -ml-0.5 cursor-col-resize hover:bg-accent/40 z-10 transition-colors"
        title="Drag to resize panel"
        onMouseDown={startResize}
      />

      {/* 1. Two-Commit Comparison Mode */}
      {compareCommits && comparisonResult ? (
        <ComparisonView
          result={comparisonResult}
          compareCommits={compareCommits}
          onSwap={() => void setCompareCommits([compareCommits[1], compareCommits[0]])}
          onClose={() => void setCompareCommits(null)}
        />
      ) : selectedStashIndex !== null && stashDetail ? (
        /* 2. Stash Inspector Mode */
        <StashInspectorView
          stash={stashDetail}
          onClose={() => void inspectStash(null)}
        />
      ) : detail ? (
        /* 3. Normal / WIP Commit Detail Mode */
        <>
          {/* Header */}
          <div className="p-3 border-b border-edge">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-accent">{isWip ? 'WIP' : detail.shortHash}</span>
              {!isWip && (
                <button
                  className="btn-icon !w-5 !h-5"
                  title="Copy hash"
                  onClick={() => {
                    void navigator.clipboard.writeText(detail.hash);
                    notify('success', 'Hash copied');
                  }}
                >
                  <Copy size={11} />
                </button>
              )}
              <span className="flex-1" />
              {!isWip && (
                <button
                  className="btn text-xs gap-1.5 hover:text-cyan-300 hover:border-cyan-500/50"
                  onClick={handleExplainChanges}
                  title="Explain changes with AI"
                >
                  <Sparkles size={12} className="text-cyan-400" />
                  <span>Explain</span>
                </button>
              )}
              <Dropdown
                align="right"
                trigger={
                  <button className="btn text-xs">
                    Commit Actions <ChevronDown size={11} />
                  </button>
                }
                width={220}
              >
            {(close) =>
              isWip ? (
                <MenuItem label="Working directory changes" onClick={close} />
              ) : (
                <>
                  <MenuItem
                    icon={<Copy size={13} />}
                    label="Copy full hash"
                    onClick={() => {
                      close();
                      void navigator.clipboard.writeText(detail.files ? detail.hash : detail.hash);
                      notify('success', 'Hash copied');
                    }}
                  />
                  <MenuItem
                    icon={<RotateCcw size={13} />}
                    label="Revert commit"
                    onClick={() => {
                      close();
                      void runAndRefresh(() => api.revertCommit(detail.hash), `Reverted ${detail.shortHash}`);
                    }}
                  />
                  <MenuItem
                    icon={<Layers size={13} />}
                    label="Cherry-pick onto current branch"
                    onClick={() => {
                      close();
                      void cherryPickCommit(detail.hash);
                    }}
                  />
                  <MenuItem
                    icon={<GitBranch size={13} />}
                    label="Interactive rebase from here"
                    onClick={() => {
                      close();
                      openRebaseModal(detail.hash);
                    }}
                  />
                  <MenuItem
                    icon={<TagIcon size={13} />}
                    label="Create tag at this commit"
                    onClick={() => {
                      close();
                      openCreateTagModal(detail.hash);
                    }}
                  />
                </>
              )
            }
          </Dropdown>
          {/* Close button */}
          <button
            className="btn-icon !w-6 !h-6 hover:text-fg text-dim ml-0.5"
            title="Close details (Esc)"
            onClick={() => void selectCommit(null)}
          >
            <X size={13} />
          </button>
        </div>
        <h3 className="mt-2 text-sm font-medium text-fg selectable">{detail.message}</h3>
        {detail.body && <pre className="mt-1 text-xs text-dim whitespace-pre-wrap font-sans selectable">{detail.body}</pre>}

        {/* AI Explainer Accordion Card */}
        {explainOpen && (
          <div className="mt-3 p-3 rounded-lg bg-panel2 border border-cyan-500/30 text-xs shadow-md">
            <div className="flex items-center justify-between font-semibold text-fg mb-2">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Sparkles size={13} className="text-cyan-400" /> AI Code Review & Explainer
              </span>
              <button onClick={() => setExplainOpen(false)} className="text-dim hover:text-fg">
                <X size={13} />
              </button>
            </div>
            {explaining ? (
              <div className="flex items-center gap-2 py-3 text-dim">
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span>Analyzing commit diff and generating review...</span>
              </div>
            ) : explainError ? (
              <div className="text-del py-1">{explainError}<button className="btn ml-2" onClick={handleExplainChanges}>Retry</button></div>
            ) : (
              <div className="prose prose-invert prose-xs max-w-none text-fg/90 whitespace-pre-wrap font-sans leading-relaxed text-[11px] selectable">
                {aiExplanation}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Author row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-edge text-xs text-dim">
        {detail.authorName ? (
          <>
            <Avatar name={detail.authorName} email={detail.authorEmail} avatarHash={detail.avatarHash} size={20} />
            <span className="text-fg">{detail.authorName}</span>
            <span>·</span>
            <span>{formatDate(detail.date)}</span>
          </>
        ) : (
          <span>Working directory</span>
        )}
        <span className="flex-1" />
        {detail.parents.map((p) => (
          <button
            key={p}
            className="font-mono text-accent hover:underline"
            title={`Go to parent ${p.slice(0, 7)}`}
            onClick={() => void selectCommit(p)}
          >
            parent: {p.slice(0, 7)}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-edge text-xs">
        <span className="text-dim">{detail.files.length} changed</span>
        <span className="text-add">+{detail.insertions} added</span>
        <span className="text-del">-{detail.deletions} deleted</span>
      </div>

      {isWip ? <WorkdirPanel /> : <FileList files={detail.files} commitHash={detail.hash} />}
        </>
      ) : null}
    </div>
  );
}
