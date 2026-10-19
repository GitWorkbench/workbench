import React, { useState } from 'react';
import {
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Copy,
  CheckCheck
} from 'lucide-react';
import { useApp, ToastItem } from '../../store';
import { useSettings } from '../../store/settings';

function ToastPill({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(toast.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSuccess = toast.kind === 'success';
  const isError = toast.kind === 'error';
  const isWarn = toast.kind === 'warn';

  const icon = isSuccess ? (
    <Check size={12} strokeWidth={2.8} className="text-emerald-400" />
  ) : isError ? (
    <AlertCircle size={13} strokeWidth={2.4} className="text-rose-400" />
  ) : isWarn ? (
    <AlertTriangle size={12} strokeWidth={2.4} className="text-amber-400" />
  ) : (
    <Info size={13} strokeWidth={2.4} className="text-sky-400" />
  );

  const iconBadge = isSuccess
    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
    : isError
    ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.25)]'
    : isWarn
    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
    : 'bg-sky-500/15 border-sky-500/30 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.25)]';

  const glowShadow = isSuccess
    ? 'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.65),0_0_24px_-4px_rgba(16,185,129,0.2),0_0_0_1px_rgba(255,255,255,0.08)]'
    : isError
    ? 'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.65),0_0_24px_-4px_rgba(244,63,94,0.25),0_0_0_1px_rgba(255,255,255,0.08)]'
    : isWarn
    ? 'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.65),0_0_24px_-4px_rgba(245,158,11,0.2),0_0_0_1px_rgba(255,255,255,0.08)]'
    : 'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.65),0_0_24px_-4px_rgba(56,189,248,0.2),0_0_0_1px_rgba(255,255,255,0.08)]';

  const progressBg = isSuccess
    ? 'bg-emerald-400/80'
    : isError
    ? 'bg-rose-400/80'
    : isWarn
    ? 'bg-amber-400/80'
    : 'bg-sky-400/80';

  const durationMs = toast.duration || 3800;

  return (
    <div
      className={`group pointer-events-auto relative flex flex-col items-stretch overflow-hidden rounded-2xl bg-[#0f131c]/92 backdrop-blur-xl border border-white/10 ${glowShadow} transition-all duration-300 animate-in fade-in-0 slide-in-from-top-3 zoom-in-95 ease-out max-w-lg min-w-[280px] w-auto`}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Soft Glowing Icon */}
        <div
          className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${iconBadge}`}
        >
          {icon}
        </div>

        {/* Content Details */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {toast.title && (
            <span className="text-xs font-semibold text-white/95 shrink-0">
              {toast.title}
            </span>
          )}
          <span className="text-[13px] font-normal text-slate-200/90 leading-snug break-words selectable select-text">
            {toast.text}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {isError && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Copy error message"
            >
              {copied ? (
                <CheckCheck size={12} className="text-emerald-400" />
              ) : (
                <Copy size={12} />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Whisper-thin Hairline Countdown Indicator */}
      {durationMs > 0 && (
        <div className="h-[2px] w-full bg-white/[0.04] overflow-hidden">
          <div
            className={`h-full ${progressBg}`}
            style={{
              animation: `toast-progress ${durationMs}ms linear forwards`
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useApp((s) => s.toasts);
  const dismissToast = useApp((s) => s.dismissToast);
  const toastPosition = useSettings((s) => s.toastPosition) || 'top-center';

  if (!toasts || toasts.length === 0) return null;

  const positionClasses = {
    'top-center': 'top-[84px] left-1/2 -translate-x-1/2 items-center max-w-xl',
    'top-right': 'top-[84px] right-6 items-end max-w-md',
    'bottom-center': 'bottom-10 left-1/2 -translate-x-1/2 items-center max-w-xl',
    'bottom-right': 'bottom-10 right-6 items-end max-w-md'
  }[toastPosition] || 'top-[84px] left-1/2 -translate-x-1/2 items-center max-w-xl';

  return (
    <div
      className={`fixed ${positionClasses} z-[9999] flex flex-col gap-2 pointer-events-none w-full px-4`}
    >
      {toasts.map((toast) => (
        <ToastPill
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
