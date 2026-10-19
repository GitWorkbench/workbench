import React from 'react';
import { AlertTriangle, GitMerge, Check, RotateCcw, ArrowRight } from 'lucide-react';
import { useApp } from '../../store';

export function ConflictBanner() {
  const operationState = useApp((s) => s.operationState);
  const openConflictResolver = useApp((s) => s.openConflictResolver);
  const abortRepoOperation = useApp((s) => s.abortRepoOperation);
  const continueRepoOperation = useApp((s) => s.continueRepoOperation);

  if (!operationState) return null;

  const { inMerge, inRebase, inCherryPick, conflictedFiles } = operationState;
  const isOperating = inMerge || inRebase || inCherryPick || conflictedFiles.length > 0;

  if (!isOperating) return null;

  const opName = inRebase ? 'Rebase' : inCherryPick ? 'Cherry-Pick' : 'Merge';
  const hasConflicts = conflictedFiles.length > 0;

  return (
    <div className="bg-del/15 border-b border-del/30 px-3 py-2 flex items-center gap-3 text-xs shrink-0 select-none animate-in slide-in-from-top-2 duration-150">
      <div className="w-5 h-5 rounded-md bg-del/20 text-del flex items-center justify-center shrink-0">
        <AlertTriangle size={13} />
      </div>

      <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
        <span className="font-semibold text-fg font-sans">
          {opName} in progress:
        </span>

        {hasConflicts ? (
          <>
            <span className="text-del font-medium font-sans">
              {conflictedFiles.length} conflicted file{conflictedFiles.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {conflictedFiles.map((file) => (
                <button
                  key={file}
                  className="px-2 py-0.5 rounded bg-panel border border-del/40 text-fg hover:border-del text-[11px] font-mono hover:bg-panel3 transition-all flex items-center gap-1"
                  onClick={() => openConflictResolver(file)}
                  title={`Click to resolve conflicts in ${file}`}
                >
                  <span>{file.split('/').pop()}</span>
                  <ArrowRight size={10} className="text-del" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <span className="text-add font-medium flex items-center gap-1 font-sans">
            <Check size={12} />
            All conflicts resolved! Ready to complete {opName.toLowerCase()}.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!hasConflicts && (
          <button
            className="btn-primary !min-h-0 !px-2.5 !py-1 !text-[11px] shadow-xs"
            onClick={continueRepoOperation}
          >
            <span>Continue {opName}</span>
          </button>
        )}

        <button
          className="flex items-center gap-1 px-2 py-1 rounded bg-panel3 hover:bg-del/20 text-dim hover:text-del border border-edge text-[11px] transition-colors"
          onClick={() => {
            if (window.confirm(`Abort this ${opName.toLowerCase()}? Working directory will be restored.`)) {
              void abortRepoOperation();
            }
          }}
        >
          <RotateCcw size={11} />
          <span>Abort</span>
        </button>
      </div>
    </div>
  );
}
