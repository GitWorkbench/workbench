import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, GitMerge, Loader2, FileWarning } from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { MergeSimulationResult } from '../../../shared/types';

export function MergeSimulationModal() {
  const branch = useApp((s) => s.simulateMergeBranch);
  const close = useApp((s) => s.closeSimulateMerge);
  const status = useApp((s) => s.status);
  const runAndRefresh = useApp((s) => s.runAndRefresh);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MergeSimulationResult | null>(null);

  const currentBranch = status?.currentBranch || 'HEAD';

  useEffect(() => {
    if (!branch) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    api.simulateMerge(branch).then((res) => {
      if (!cancelled) {
        setResult(res);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setResult({
          clean: false,
          conflicts: [],
          message: `Simulation error: ${String(err)}`
        });
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [branch]);

  if (!branch) return null;

  const handlePerformMerge = async () => {
    close();
    await runAndRefresh(async () => {
      await api.mergeBranch(branch);
    }, `Merged ${branch} into ${currentBranch}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <GitMerge size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Merge Pre-Flight Simulator</h2>
              <p className="text-[11px] text-dim">
                Simulating merge of <span className="font-mono text-cyan-300 font-medium">{branch}</span> into <span className="font-mono text-fg font-medium">{currentBranch}</span>
              </p>
            </div>
          </div>
          <button className="btn-icon !w-7 !h-7 hover:text-fg text-dim" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[400px]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-dim">
              <Loader2 size={24} className="animate-spin text-cyan-400" />
              <p className="text-xs">Computing 3-way tree merge without touching disk...</p>
            </div>
          ) : result?.clean ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-300">Clean Merge Guaranteed</h3>
                  <p className="text-xs text-emerald-200/80 mt-1 leading-relaxed">
                    No conflicting file changes detected. This merge can be executed safely as a fast-forward or non-conflicting commit.
                  </p>
                </div>
              </div>
              <div className="text-xs text-dim bg-panel2/50 p-3 rounded-lg border border-edge/60">
                Working directory files and index will not be broken when you proceed.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-300">Potential Conflicts Detected</h3>
                  <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                    {result?.message || 'Merging these branches will require conflict resolution.'}
                  </p>
                </div>
              </div>

              {result?.conflicts && result.conflicts.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-dim mb-2 flex items-center justify-between">
                    <span>Conflicting Files ({result.conflicts.length}):</span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {result.conflicts.map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-panel2 border border-del/20 text-xs font-mono text-del"
                      >
                        <FileWarning size={14} className="shrink-0 text-del" />
                        <span className="truncate flex-1">{file}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-edge bg-panel2/30">
          <span className="text-[11px] text-faint">Non-destructive pre-flight test</span>
          <div className="flex items-center gap-2">
            <button className="btn text-xs px-3 py-1.5" onClick={close}>
              Close
            </button>
            <button
              className={`btn text-xs px-3.5 py-1.5 font-medium shadow-sm transition-all ${
                result?.clean
                  ? 'bg-accent hover:bg-accent-hover text-white'
                  : 'hover:bg-panel3 text-fg'
              }`}
              onClick={handlePerformMerge}
              disabled={loading}
            >
              Perform Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
