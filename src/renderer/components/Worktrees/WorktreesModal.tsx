import React, { useState } from 'react';
import {
  X,
  FolderGit2,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  GitBranch,
  ShieldAlert
} from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';

export function WorktreesModal() {
  const isOpen = useApp((s) => s.worktreesModalOpen);
  const close = useApp((s) => s.closeWorktreesModal);
  const worktrees = useApp((s) => s.worktrees);
  const activeTab = useApp((s) => s.activeTab);
  const openRepo = useApp((s) => s.openRepo);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);

  const [newPath, setNewPath] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) {
      notify('warn', 'Please specify a worktree directory path');
      return;
    }
    setLoading(true);
    try {
      const succeeded = await runAndRefresh(async () => {
        const branchOrHash = newBranch.trim() || 'HEAD';
        const res = await api.createWorktree(branchOrHash, newPath.trim());
        if (!res.ok) throw new Error(res.error || 'Failed to create worktree');
      }, `Worktree created at ${newPath}`);
      if (succeeded) { setNewPath(''); setNewBranch(''); }
    } catch (err) {
      notify('error', String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (worktreePath: string, isMain: boolean) => {
    if (isMain) {
      notify('warn', 'Cannot remove main worktree checkout');
      return;
    }
    if (!window.confirm(`Remove worktree at "${worktreePath}"? Git will refuse removal if it has uncommitted changes.`)) {
      return;
    }
    await runAndRefresh(async () => {
      const res = await api.removeWorktree(worktreePath);
      if (!res.ok) throw new Error(res.error || 'Failed to remove worktree');
    }, `Worktree removed`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <FolderGit2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Git Worktree Management Dashboard</h2>
              <p className="text-[11px] text-dim">Simultaneously check out multiple branches in linked working directories</p>
            </div>
          </div>
          <button className="btn-icon !w-7 !h-7 hover:text-fg text-dim" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Existing Worktrees list */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[340px] space-y-2.5">
          <div className="text-xs font-semibold text-dim flex items-center justify-between">
            <span>Linked Worktrees ({worktrees.length}):</span>
          </div>

          <div className="space-y-2">
            {worktrees.map((wt, i) => {
              const isMain = i === 0;
              const isCurrent = activeTab === wt.path;
              const displayName = wt.branch || wt.path.split(/[/\\]/).pop() || wt.path;

              return (
                <div
                  key={wt.path}
                  className="flex items-center justify-between p-3 rounded-lg bg-panel2 border border-edge hover:border-edge/90 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FolderGit2 size={16} className={`shrink-0 ${isMain ? 'text-accent' : 'text-purple-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg">{displayName}</span>
                        {isMain ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-accent/20 text-accent uppercase">
                            Main Checkout
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-panel3 text-dim">
                            {wt.hash.slice(0, 7)}
                          </span>
                        )}
                        {isCurrent && <span className="text-[10px] text-accent">Current</span>}
                        {wt.isLocked && <span className="text-[10px] text-warn">Locked</span>}
                        {wt.branch && (
                          <span className="text-[10px] text-purple-300 font-mono flex items-center gap-1">
                            <GitBranch size={10} /> {wt.branch}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-dim truncate font-mono mt-0.5" title={wt.path}>
                        {wt.path}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      className="btn text-xs px-2.5 py-1 flex items-center gap-1 hover:text-accent"
                      onClick={() => {
                        void openRepo(wt.path);
                        close();
                      }}
                      title="Open worktree in tab"
                    >
                      <ExternalLink size={12} />
                      <span>Open</span>
                    </button>
                    {!isMain && !isCurrent && !wt.isLocked && (
                      <button
                        className="btn-icon !w-7 !h-7 hover:!text-del text-dim"
                        onClick={() => void handleRemove(wt.path, isMain)}
                        title="Remove worktree"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {worktrees.length === 0 && (
              <div className="py-6 text-center text-xs text-dim">No linked worktrees found.</div>
            )}
          </div>
        </div>

        {/* Add Worktree Section */}
        <form onSubmit={handleCreate} className="p-5 border-t border-edge bg-panel2/30 space-y-3">
          <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
            <Plus size={13} /> Create Linked Worktree
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-dim mb-1">Target Directory Path</label>
              <input
                type="text"
                className="input w-full font-mono text-xs"
                placeholder="../project-worktree-name"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-dim mb-1">Branch or Commit Hash</label>
              <input
                type="text"
                className="input w-full font-mono text-xs"
                placeholder="branch-name or commit hash"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="btn bg-accent hover:bg-accent-hover text-white text-xs px-4 py-1.5 font-medium shadow-sm flex items-center gap-1.5"
              disabled={loading}
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              <span>Add Worktree</span>
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-edge bg-panel2/40">
          <span className="text-[11px] text-faint">Linked worktrees share the parent git repository database</span>
          <button className="btn text-xs px-3 py-1.5" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
