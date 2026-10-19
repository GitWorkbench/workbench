import React, { useEffect, useState } from 'react';
import {
  X,
  GitBranch,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit3,
  Layers,
  Check,
  Loader2,
  AlertCircle,
  Play
} from 'lucide-react';
import { RebaseStep, RebaseActionKind } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

const ACTIONS: { kind: RebaseActionKind; label: string; desc: string; color: string }[] = [
  { kind: 'pick', label: 'Pick', desc: 'Use commit as is', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  { kind: 'reword', label: 'Reword', desc: 'Use commit but edit message', color: 'text-teal-400 bg-teal-500/10 border-teal-500/30' },
  { kind: 'squash', label: 'Squash', desc: 'Meld into previous commit', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { kind: 'fixup', label: 'Fixup', desc: 'Meld into previous, discard message', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { kind: 'drop', label: 'Drop', desc: 'Remove commit entirely', color: 'text-del bg-del/10 border-del/30' }
];

export function InteractiveRebaseModal() {
  const baseCommit = useApp((s) => s.rebaseModalBaseCommit);
  const close = useApp((s) => s.closeRebaseModal);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);
  const openConflictResolver = useApp((s) => s.openConflictResolver);

  const [steps, setSteps] = useState<RebaseStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (!baseCommit) return;
    setLoading(true);
    api
      .getCommitsForRebase(baseCommit)
      .then((data) => {
        setSteps(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load commits for rebase:', err);
        notify('error', `Failed to load commits: ${String(err)}`);
        setLoading(false);
      });
  }, [baseCommit]);

  if (!baseCommit) return null;

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const item = next[index];
    next[index] = next[target];
    next[target] = item;
    setSteps(next);
  };

  const updateAction = (index: number, action: RebaseActionKind) => {
    const next = [...steps];
    next[index] = { ...next[index], action };
    setSteps(next);
  };

  const updateMessage = (index: number, message: string) => {
    const next = [...steps];
    next[index] = { ...next[index], message };
    setSteps(next);
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const res = await api.executeInteractiveRebase(baseCommit, steps);
      setExecuting(false);
      await useApp.getState().refresh();
      if (res.ok) {
        notify('success', 'Interactive rebase completed successfully');
        close();
        const rewriteId = (res as { rewriteId?: string }).rewriteId;
        if (rewriteId) useApp.setState({ rangeComparisonOpen: true, rangeComparisonId: rewriteId });
      } else {
        if (res.hasConflicts) {
          const op = await api.getRepoOperationState();
          close();
          if (op.conflictedFiles.length > 0) {
            openConflictResolver(op.conflictedFiles[0]);
          }
          notify('error', 'Rebase paused due to merge conflicts. Please resolve conflicts.');
        } else {
          notify('error', res.error || 'Rebase failed');
        }
      }
    } catch (err: unknown) {
      setExecuting(false);
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `Rebase failed: ${message}`);
    }
  };

  const activeSteps = steps.filter((s) => s.action !== 'drop');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-panel border border-edge rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-panel2 border-b border-edge shrink-0 select-none">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent shrink-0">
            <GitBranch size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-fg">Interactive Rebase</h2>
            <p className="text-xs text-dim">
              Rebase commits onto <span className="font-mono text-accent font-semibold">{baseCommit.slice(0, 7)}</span>
            </p>
          </div>
          <button className="btn-icon !w-7 !h-7 text-dim hover:text-fg" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* List of Commits */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-base p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-xs py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
              <span>Fetching commits in range...</span>
            </div>
          ) : steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-sm py-16">
              <AlertCircle size={28} className="text-warn" />
              <span>No commits found between {baseCommit.slice(0, 7)} and HEAD.</span>
            </div>
          ) : (
            steps.map((step, idx) => {
              const currentAction = ACTIONS.find((a) => a.kind === step.action) || ACTIONS[0];

              return (
                <div
                  key={step.hash}
                  className={`flex flex-col gap-2 p-2.5 rounded-lg border transition-all ${
                    step.action === 'drop'
                      ? 'opacity-50 bg-panel3/40 border-edge/30'
                      : 'bg-panel border-edge/60 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Reorder buttons */}
                    <div className="flex items-center gap-0.5 border border-edge rounded bg-panel2 p-0.5">
                      <button
                        disabled={idx === 0}
                        className="btn-icon !w-5 !h-5 disabled:opacity-30"
                        title="Move commit earlier (older)"
                        onClick={() => moveStep(idx, 'up')}
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        disabled={idx === steps.length - 1}
                        className="btn-icon !w-5 !h-5 disabled:opacity-30"
                        title="Move commit later (newer)"
                        onClick={() => moveStep(idx, 'down')}
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>

                    {/* Action Selector */}
                    <select
                      value={step.action}
                      onChange={(e) => updateAction(idx, e.target.value as RebaseActionKind)}
                      className={`text-xs font-semibold px-2 py-1 rounded border outline-none cursor-pointer ${currentAction.color}`}
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.kind} value={a.kind} className="bg-panel text-fg font-normal">
                          {a.label} — {a.desc}
                        </option>
                      ))}
                    </select>

                    {/* Commit hash */}
                    <span className="font-mono text-xs text-accent font-medium bg-panel3 px-1.5 py-0.5 rounded border border-edge/40">
                      {step.shortHash}
                    </span>

                    {/* Author */}
                    <span className="text-[11px] text-dim truncate max-w-[120px]">
                      {step.author}
                    </span>

                    <span className="flex-1" />

                    {/* Quick drop button */}
                    {step.action !== 'drop' ? (
                      <button
                        className="btn-icon !w-6 !h-6 hover:!text-del"
                        title="Drop this commit"
                        onClick={() => updateAction(idx, 'drop')}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : (
                      <button
                        className="text-[11px] text-accent hover:underline px-1"
                        onClick={() => updateAction(idx, 'pick')}
                      >
                        Restore
                      </button>
                    )}
                  </div>

                  {/* Commit message editor (if reword) or text preview */}
                  {step.action === 'reword' ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Edit3 size={13} className="text-teal-400 shrink-0" />
                      <input
                        type="text"
                        value={step.message}
                        onChange={(e) => updateMessage(idx, e.target.value)}
                        placeholder="Enter new commit message..."
                        className="flex-1 bg-panel2 border border-teal-500/40 rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-teal-400 font-sans"
                      />
                    </div>
                  ) : (
                    <div
                      className={`text-xs font-medium px-1 truncate ${
                        step.action === 'drop' ? 'line-through text-dim' : 'text-fg'
                      }`}
                    >
                      {step.message}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 bg-panel2 border-t border-edge shrink-0 select-none">
          <div className="text-xs text-dim">
            <span className="font-semibold text-fg">{activeSteps.length}</span> commits to apply
            {steps.some((s) => s.action === 'squash' || s.action === 'fixup') && (
              <span className="text-amber-400 ml-2">
                • {steps.filter((s) => s.action === 'squash' || s.action === 'fixup').length} squashed
              </span>
            )}
            {steps.some((s) => s.action === 'drop') && (
              <span className="text-del ml-2">
                • {steps.filter((s) => s.action === 'drop').length} dropped
              </span>
            )}
          </div>

          <span className="flex-1" />

          <button
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-dim hover:text-fg hover:bg-panel3 transition-colors"
            onClick={close}
            disabled={executing}
          >
            Cancel
          </button>

          <button
            disabled={executing || steps.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:brightness-110 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleExecute}
          >
            {executing ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Rebasing...</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                <span>Execute Rebase</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
