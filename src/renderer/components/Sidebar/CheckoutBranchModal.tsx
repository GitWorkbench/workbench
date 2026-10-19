import React, { useEffect } from 'react';
import { GitBranch, X, Check, MoreHorizontal } from 'lucide-react';
import { BranchInfo } from '../../../shared/types';

export interface CheckoutTarget {
  name: string;
  fullName: string;
  isRemote?: boolean;
  tracking?: string;
  branchObj?: BranchInfo;
}

interface CheckoutBranchModalProps {
  target: CheckoutTarget;
  currentBranch: string;
  onClose: () => void;
  onConfirmCheckout: () => void;
  onMoreActions?: () => void;
}

export function CheckoutBranchModal({
  target,
  currentBranch,
  onClose,
  onConfirmCheckout,
  onMoreActions
}: CheckoutBranchModalProps) {
  const isCurrent = Boolean(target.branchObj?.isCurrent || (!target.isRemote && target.name === currentBranch));

  useEffect(() => {
    // A checkout through another control may have made this target active.
    if (isCurrent) {
      onClose();
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirmCheckout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCurrent, onClose, onConfirmCheckout]);

  if (isCurrent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-panel border border-edge rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-panel2/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <GitBranch size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg leading-none">
                Checkout Branch
              </h2>
              <span className="text-[11px] text-dim">
                Switch working tree to branch
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 text-xs">
          {/* Branch Information Card */}
          <div className="rounded-lg border border-edge/80 bg-panel2/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-dim font-medium">Branch</span>
              {target.isRemote ? (
                <span className="px-1.5 py-0.5 rounded bg-panel3 text-[10px] text-accent font-mono border border-edge">
                  Remote Tracking
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-panel3 text-[10px] text-dim font-mono border border-edge">
                  Local Branch
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <GitBranch size={15} className="text-accent shrink-0" />
              <span className="font-mono text-sm font-semibold text-fg break-all">{target.name}</span>
            </div>

            {target.tracking && (
              <div className="text-[11px] text-dim pt-1 border-t border-edge/40 flex items-center gap-1.5">
                <span>Tracks:</span>
                <span className="font-mono text-fg font-medium">{target.tracking}</span>
              </div>
            )}

            <div className="text-[11px] text-faint flex items-center gap-1.5">
              <span>Current branch:</span>
              <span className="font-mono text-dim font-medium">{currentBranch}</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-dim leading-relaxed">
            {target.isRemote
              ? `Checkout remote branch "${target.fullName}" as a local tracking branch?`
              : `Do you want to checkout and switch to branch "${target.name}"?`}
          </p>

          <p className="text-[11px] text-faint">
            Git will update files in your working directory. Working tree modifications will be kept if they do not conflict.
          </p>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-edge bg-panel2/40 gap-2">
          {onMoreActions ? (
            <button
              type="button"
              onClick={onMoreActions}
              className="btn text-xs text-dim hover:text-fg hover:bg-panel3 transition-colors"
              title="Open branch actions menu"
            >
              <MoreHorizontal size={13} />
              <span>More Options…</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn text-xs text-dim hover:text-fg hover:bg-panel3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirmCheckout}
              className="btn btn-primary text-xs font-medium px-3.5 shadow-xs transition-colors"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Checkout Branch</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
