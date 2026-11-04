import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GitBranch, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import type { BranchInfo, BranchList } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { classifyBranchesForCleanup } from './branch-cleanup';

export function BranchCleanupDialog({ onClose }: { onClose: () => void }) {
  const repository = useApp(state => state.activeTab);
  const currentBranch = useApp(state => state.status?.currentBranch || 'HEAD');
  const worktrees = useApp(state => state.worktrees);
  const notify = useApp(state => state.notify);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const cleanupTarget = branchList?.cleanupTarget || 'HEAD';
  const groups = useMemo(() => classifyBranchesForCleanup(
    branchList?.local || [], currentBranch, worktrees, cleanupTarget
  ), [branchList, currentBranch, worktrees, cleanupTarget]);
  const selectedBranches = groups.eligible.filter(branch => selected.has(branch.fullName));

  useEffect(() => {
    let active = true;
    dialogRef.current?.focus();
    void api.getBranches().then(data => {
      if (!active) return;
      setBranchList(data);
      const available = classifyBranchesForCleanup(data.local, currentBranch, worktrees, data.cleanupTarget || 'HEAD').eligible;
      setSelected(new Set(available.map(branch => branch.fullName)));
    }).catch(failure => {
      if (active) setError(String(failure).replace(/^Error: /, ''));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentBranch, worktrees]);

  const close = () => { if (!deleting) onClose(); };
  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !deleting) { event.preventDefault(); event.stopPropagation(); onClose(); }
  };
  const toggle = (name: string) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const selectAll = () => setSelected(previous => previous.size === groups.eligible.length
    ? new Set()
    : new Set(groups.eligible.map(branch => branch.fullName)));

  const deleteSelected = async () => {
    if (!repository || deleting || !selectedBranches.length) return;
    if (useApp.getState().activeTab !== repository) {
      setError('The active repository changed. Close this dialog and reopen it for the current repository.');
      return;
    }
    setDeleting(true); setError('');
    const deleted: BranchInfo[] = [];
    const failures: string[] = [];
    try {
      for (const branch of selectedBranches) {
        if (useApp.getState().activeTab !== repository) {
          failures.push('Stopped because the active repository changed.');
          break;
        }
        try {
          const response = await api.deleteBranch(branch.fullName, { local: true });
          if (!response.ok) throw new Error(response.error || 'Git did not delete this branch.');
          deleted.push(branch);
        } catch (failure) {
          failures.push(`${branch.name}: ${String(failure).replace(/^Error: /, '')}`);
        }
      }

      if (deleted.length && useApp.getState().activeTab === repository) {
        try {
          await useApp.getState().refresh();
          const fresh = await api.getBranches();
          setBranchList(fresh);
          const nextEligible = classifyBranchesForCleanup(fresh.local, currentBranch, worktrees, fresh.cleanupTarget || 'HEAD').eligible;
          setSelected(new Set(nextEligible.map(branch => branch.fullName)));
        } catch (failure) {
          const summary = `Deleted ${deleted.length} ${deleted.length === 1 ? 'branch' : 'branches'}. `;
          setError(`${summary}Could not refresh branch state: ${String(failure).replace(/^Error: /, '')}`);
          return;
        }
      }

      if (failures.length) {
        const summary = deleted.length ? `Deleted ${deleted.length} ${deleted.length === 1 ? 'branch' : 'branches'}. ` : '';
        setError(`${summary}Git refused to delete some branches or the repository changed: ${failures.join(' · ')}`);
      } else {
        notify('success', `Safely deleted ${deleted.length} ${deleted.length === 1 ? 'merged branch' : 'merged branches'}`);
        onClose();
      }
    } finally { setDeleting(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="branch-cleanup-title" tabIndex={-1} onKeyDown={onDialogKeyDown} className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-edge bg-panel text-fg shadow-2xl outline-none">
      <header className="flex items-center gap-3 border-b border-edge bg-panel2/40 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg border border-add/25 bg-add/10 text-add"><ShieldCheck size={17} /></span>
        <div className="min-w-0 flex-1"><h2 id="branch-cleanup-title" className="text-sm font-semibold">Safe branch cleanup</h2><p className="mt-0.5 text-xs text-dim">Review merged local branches before removing them.</p></div>
        <button className="btn-icon" aria-label="Close branch cleanup" disabled={deleting} onClick={close}><X size={15} /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-xs leading-5 text-dim">Candidates are merged into <span className="font-mono text-fg">{cleanupTarget === 'HEAD' ? 'the current branch' : cleanupTarget}</span>. The current branch, detected default branch, and branches checked out in worktrees stay protected. Git rechecks every deletion and refuses unmerged branches.</p>
        {error && <p role="alert" className="rounded-md border border-del/30 bg-del/10 px-3 py-2 text-xs text-del">{error}</p>}

        {loading ? <div className="flex items-center gap-2 rounded-lg border border-edge p-4 text-xs text-dim"><Loader2 size={14} className="animate-spin" />Checking branches…</div> : branchList && groups.eligible.length > 0 ? <section aria-label="Merged branches eligible for cleanup" className="overflow-hidden rounded-lg border border-edge">
          <div className="flex items-center gap-3 border-b border-edge bg-panel2/50 px-3 py-2">
            <input aria-label="Select all safe branches" type="checkbox" checked={selected.size === groups.eligible.length} ref={element => { if (element) element.indeterminate = selected.size > 0 && selected.size < groups.eligible.length; }} onChange={selectAll} />
            <span className="flex-1 text-xs font-medium">Merged branches ({groups.eligible.length})</span>
            <span className="text-[11px] text-dim">{selected.size} selected</span>
          </div>
          <ul className="divide-y divide-edge/70">
            {groups.eligible.map(branch => <li key={branch.fullName} className="flex items-center gap-3 px-3 py-2.5">
              <input aria-label={`Select ${branch.name}`} type="checkbox" checked={selected.has(branch.fullName)} onChange={() => toggle(branch.fullName)} />
              <GitBranch size={13} className="text-dim" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{branch.name}</span>
              {branch.tracking && <span className="max-w-[45%] truncate text-[11px] text-dim" title={`Tracks ${branch.tracking}`}>{branch.tracking}</span>}
              <Check size={13} className="text-add" aria-label="Merged" />
            </li>)}
          </ul>
        </section> : !loading && <div className="flex items-start gap-3 rounded-lg border border-edge bg-base/40 p-4">
          <Check size={16} className="mt-0.5 text-add" />
          <div><p className="text-xs font-medium">No safe merged branches found</p><p className="mt-1 text-xs text-dim">Branches that are current, protected, checked out elsewhere, or not merged stay in place.</p></div>
        </div>}

        {!loading && groups.protected.length > 0 && <details className="rounded-lg border border-edge px-3 py-2">
          <summary className="cursor-pointer text-xs text-dim">{groups.protected.length} {groups.protected.length === 1 ? 'branch kept safe' : 'branches kept safe'}</summary>
          <ul className="mt-2 space-y-2 border-t border-edge pt-2">
            {groups.protected.map(({ branch, reason }) => <li key={branch.fullName} className="flex items-center gap-2 text-xs"><GitBranch size={12} className="text-dim" /><span className="min-w-0 flex-1 truncate font-mono">{branch.name}</span><span className="shrink-0 text-dim">{reason}</span></li>)}
          </ul>
        </details>}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-edge bg-panel2/30 px-5 py-3">
        <button className="btn-secondary text-xs" disabled={deleting} onClick={close}>Cancel</button>
        <button className="btn-primary inline-flex items-center gap-2 text-xs" disabled={loading || deleting || !selectedBranches.length} onClick={() => void deleteSelected()}>{deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{deleting ? 'Deleting safely…' : `Delete ${selectedBranches.length} selected`}</button>
      </footer>
    </div>
  </div>;
}
