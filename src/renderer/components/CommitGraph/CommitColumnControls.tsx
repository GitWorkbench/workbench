import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import {
  CommitColumnVisibility,
  CommitColumnWidths,
  DEFAULT_COMMIT_COLUMN_WIDTHS
} from '../../store/settings';

type ColumnKey = keyof CommitColumnWidths;

const WIDTH_LIMITS: Record<ColumnKey, { min: number; max: number }> = {
  author: { min: 100, max: 360 },
  date: { min: 150, max: 360 },
  sha: { min: 80, max: 220 }
};

function clampWidth(column: ColumnKey, width: number): number {
  const { min, max } = WIDTH_LIMITS[column];
  return Math.max(min, Math.min(max, Math.round(width)));
}

export function ResizableColumnHeader({
  column,
  label,
  width,
  onResize,
  onCommit
}: {
  column: ColumnKey;
  label: string;
  width: number;
  onResize: (column: ColumnKey, width: number) => void;
  onCommit: (column: ColumnKey, width: number) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const widthAt = (clientX: number) => {
    const current = drag.current;
    return current ? clampWidth(column, current.startWidth + clientX - current.startX) : width;
  };

  return (
    <div className="relative flex h-full shrink-0 items-center px-2" style={{ width }}>
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize items-center justify-center hover:bg-accent/15 focus-visible:bg-accent/15"
        style={{ touchAction: 'none' }}
        aria-label={`Resize ${label.toLowerCase()} column`}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId === event.pointerId) onResize(column, widthAt(event.clientX));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          const next = widthAt(event.clientX);
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onResize(column, next);
          onCommit(column, next);
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          onResize(column, drag.current.startWidth);
          drag.current = null;
        }}
        onDoubleClick={() => {
          const defaultWidth = DEFAULT_COMMIT_COLUMN_WIDTHS[column];
          onResize(column, defaultWidth);
          onCommit(column, defaultWidth);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const next = clampWidth(column, width + (event.key === 'ArrowRight' ? 10 : -10));
          onResize(column, next);
          onCommit(column, next);
        }}
      >
        <span className="h-3 w-px bg-edge group-hover:bg-accent group-focus-visible:bg-accent" />
      </button>
    </div>
  );
}

const MENU_WIDTH = 220;
const COLUMN_OPTIONS: { key: keyof CommitColumnVisibility; label: string }[] = [
  { key: 'author', label: 'Author' },
  { key: 'date', label: 'Date/time' },
  { key: 'sha', label: 'SHA' }
];

export function CommitColumnMenu({
  visibility,
  onChange,
  onResetWidths
}: {
  visibility: CommitColumnVisibility;
  onChange: (columns: Partial<CommitColumnVisibility>) => void;
  onResetWidths: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const height = menuRef.current?.getBoundingClientRect().height ?? 190;
      const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      const below = rect.bottom + 6;
      const above = rect.top - height - 6;
      const top = Math.max(8, Math.min(
        below + height <= window.innerHeight - 8 ? below : above,
        window.innerHeight - height - 8
      ));
      setPosition((current) => current.left === left && current.top === top ? current : { left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, visibility.author, visibility.date, visibility.sha]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-dim hover:bg-panel2 hover:text-fg"
        aria-label="Choose visible commit columns"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={14} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Commit columns"
          className="fixed z-[2200] rounded-md border border-edge bg-panel2 p-2 text-xs text-fg shadow-2xl"
          style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
        >
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Show in commit list</div>
          {COLUMN_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-panel3 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
                className="accent-cyan-400"
              />
              <span>{label}</span>
            </label>
          ))}
          <p className="px-2 py-1 text-[10px] leading-4 text-faint">When Date/time is hidden, relative time stays beside the message.</p>
          <div className="mt-1 border-t border-edge pt-1">
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-dim hover:bg-panel3 hover:text-fg"
              onClick={onResetWidths}
            >
              Reset column widths
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
