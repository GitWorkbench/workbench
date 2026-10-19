import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  GitBranch,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X
} from 'lucide-react';
import type { ReflogEntry } from '../../../shared/types';
import { useApp } from '../../store';
import { api } from '../../lib/api';

function formatDate(value: string): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function refLabel(ref: string): string {
  return ref.replace(/^refs\/(heads|remotes)\//, '');
}

export function ReflogModal() {
  const isOpen = useApp((s) => s.reflogModalOpen);
  const close = useApp((s) => s.closeReflogModal);
  const notify = useApp((s) => s.notify);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const status = useApp((s) => s.status);
  const operationState = useApp((s) => s.operationState);
  const branches = useApp((s) => s.branches);
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [desiredBranchName, setDesiredBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'branch' | 'restore' | null>(null);
  const requestId = useRef(0);

  const loadEntries = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const result = await api.getReflog();
      if (request !== requestId.current) return;
      setEntries(result);
      setSelectedKey((current) => {
        if (current && result.some((entry) => entryKey(entry) === current)) return current;
        return result[0] ? entryKey(result[0]) : null;
      });
    } catch (error) {
      if (request === requestId.current) notify('error', `Couldn't load the reflog: ${String(error).replace('Error: ', '')}`);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!isOpen) return;
    void loadEntries();
    return () => { requestId.current++; };
  }, [isOpen, loadEntries]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) =>
      `${entry.ref} ${entry.action} ${entry.subject} ${entry.hash}`.toLowerCase().includes(normalized)
    );
  }, [entries, query]);

  const selected = filteredEntries.find((entry) => entryKey(entry) === selectedKey) ?? filteredEntries[0] ?? null;
  const currentBranch = status?.currentBranch ?? '';
  const restoreBlockedReason = !status
    ? 'Repository status is still loading.'
    : !currentBranch || currentBranch.includes('detached')
      ? 'Check out a local branch first.'
      : status.staged.length > 0 || status.unstaged.length > 0
        ? 'Commit or stash working tree changes before restoring.'
        : operationState?.inMerge || operationState?.inRebase || operationState?.inCherryPick
          ? 'Finish or abort the active Git operation before restoring.'
          : '';

  useEffect(() => {
    if (!selected) {
      setDesiredBranchName('');
      return;
    }
    const movedFrom = selected.action.match(/moving from (.+?) to /)?.[1];
    const priorBranch = movedFrom && !/^[0-9a-f]{7,64}$/i.test(movedFrom) &&
      !branches.local.some((branch) => branch.name === movedFrom) ? movedFrom : '';
    setDesiredBranchName(priorBranch || `recovered/${selected.shortHash}-${selected.date.slice(0, 10) || 'commit'}`);
  }, [selected ? entryKey(selected) : null]);

  if (!isOpen) return null;

  const handleCreateBranch = async () => {
    if (!selected || action) return;
    setAction('branch');
    let createdBranchName = '';
    const succeeded = await runAndRefresh(async () => {
      const result = await api.createRecoveryBranch(selected.hash, desiredBranchName);
      if (!result.ok) throw new Error(result.error || 'Could not create a recovery branch');
      createdBranchName = result.branchName || '';
      return result;
    });
    if (succeeded) {
      notify('success', createdBranchName ? `Saved as ${createdBranchName}` : `Saved ${selected.shortHash} as a recovery branch`);
      await loadEntries();
    }
    setAction(null);
  };

  const handleRestore = async () => {
    if (!selected || action) return;
    const branch = currentBranch || 'the current branch';
    const confirmed = window.confirm(
      `Move ${branch} to ${selected.shortHash} (${selected.subject})?\n\nGit Workbench will first create a safety branch at the current tip. This action requires a clean working tree.`
    );
    if (!confirmed) return;

    setAction('restore');
    let backupBranch = '';
    const succeeded = await runAndRefresh(async () => {
      const result = await api.restoreHeadFromReflog(selected.hash);
      if (!result.ok) throw new Error(result.error || 'Could not restore HEAD');
      backupBranch = result.backupBranch || '';
      return result;
    }, 'Current branch restored from reflog');
    if (succeeded && backupBranch) notify('info', `Previous tip saved as ${backupBranch}`);
    if (succeeded) close();
    setAction(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div className="w-full max-w-5xl max-h-[88vh] rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/25 flex items-center justify-center text-amber-300">
              <History size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Reflog & Recovery</h2>
              <p className="text-[11px] text-dim">Recent local branch and HEAD movements</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="btn-icon !w-8 !h-8 text-dim hover:text-fg" onClick={() => void loadEntries()} title="Refresh reflog" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            <button className="btn-icon !w-8 !h-8 text-dim hover:text-fg" onClick={close} title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.85fr)] min-h-0 flex-1">
          <section className="min-h-0 flex flex-col border-b md:border-b-0 md:border-r border-edge">
            <div className="px-4 py-3 border-b border-edge">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  className="input w-full pl-9 text-xs"
                  placeholder="Filter by branch, action, message, or SHA…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="mt-2 text-[10px] text-faint">{filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} shown</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
              {loading && entries.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-2 text-dim text-xs">
                  <Loader2 size={18} className="animate-spin text-accent" />
                  Reading local reflog…
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="py-14 px-5 text-center text-xs text-dim">
                  {query ? 'No reflog entries match that filter.' : 'No reflog entries are available for this repository yet.'}
                </div>
              ) : filteredEntries.map((entry) => {
                const key = entryKey(entry);
                const isSelected = key === (selected ? entryKey(selected) : selectedKey);
                return (
                  <button
                    key={key}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${isSelected ? 'border-accent/40 bg-accent/10' : 'border-transparent hover:border-edge hover:bg-panel2/70'}`}
                    onClick={() => setSelectedKey(key)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded bg-panel3 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">{entry.shortHash}</span>
                      <span className="truncate text-[10px] text-faint">{refLabel(entry.ref)}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-faint">{formatDate(entry.date)}</span>
                    </div>
                    <div className="mt-1 text-xs text-fg/90 truncate" title={entry.subject}>{entry.subject}</div>
                    <div className="mt-1 text-[10px] text-dim truncate" title={entry.action}>{entry.action}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
            {selected ? (
              <>
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-faint">
                    <GitBranch size={12} /> {refLabel(selected.ref)}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-relaxed text-fg">{selected.subject}</h3>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-dim">
                    <Clock3 size={12} /> {formatDate(selected.date)}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-cyan-300 break-all">{selected.hash}</div>
                  <p className="mt-3 text-[11px] text-dim break-words">{selected.action}</p>
                </div>

                <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                    <ShieldCheck size={14} className="text-emerald-400" /> Keep this commit
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
                    Create a new local branch here. The commit will stay reachable even after reflog entries expire.
                  </p>
                  <label className="block mt-3 mb-1 text-[10px] text-faint" htmlFor="reflog-recovery-branch">Branch name</label>
                  <input
                    id="reflog-recovery-branch"
                    className="input w-full text-xs"
                    value={desiredBranchName}
                    onChange={(event) => setDesiredBranchName(event.target.value)}
                    placeholder="recovered/my-branch"
                    disabled={!!action}
                  />
                  <button
                    className="btn mt-3 w-full justify-center text-xs px-3 py-2"
                    onClick={() => void handleCreateBranch()}
                    disabled={!!action}
                  >
                    {action === 'branch' ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
                    <span>Create recovery branch</span>
                  </button>
                </div>

                <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                    <AlertTriangle size={14} className="text-amber-300" /> Move current branch here
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
                    {restoreBlockedReason || `Moves ${currentBranch} to this commit. Git Workbench saves the current tip to a safety branch first. The working tree must be clean.`}
                  </p>
                  <button
                    className="btn mt-3 w-full justify-center border border-amber-400/30 text-xs px-3 py-2 hover:bg-amber-400/10"
                    onClick={() => void handleRestore()}
                    disabled={!!action || !!restoreBlockedReason}
                    title={restoreBlockedReason || 'Restore the current branch from this reflog entry'}
                  >
                    {action === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    <span>Restore current branch</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-xs text-dim">
                <History size={25} className="mx-auto mb-2 text-faint" />
                Select a reflog entry to see recovery options.
              </div>
            )}
          </aside>
        </div>

        <div className="px-5 py-3 border-t border-edge bg-panel2/30 text-[10px] text-faint">
          Reflog entries exist only in this clone and Git may expire them over time. Create a recovery branch to keep an entry permanently.
        </div>
      </div>
    </div>
  );
}

function entryKey(entry: ReflogEntry): string {
  return `${entry.ref}\0${entry.date}\0${entry.hash}\0${entry.action}`;
}
