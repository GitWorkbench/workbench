import React, { useEffect, useRef, useState } from 'react';

export function Dropdown({
  trigger,
  children,
  align = 'left',
  width = 240
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`relative ${open ? 'z-50' : ''}`} ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-md border border-edge bg-panel2 shadow-2xl py-1 max-h-96 overflow-y-auto"
          style={{ [align]: 0, width } as React.CSSProperties}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
  trailing
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-panel3 disabled:opacity-40 disabled:pointer-events-none ${
        danger ? 'text-del' : 'text-fg'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {trailing && <span className="text-xs text-faint">{trailing}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-edge" />;
}
