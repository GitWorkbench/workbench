import React from 'react';
import { RotateCcw } from 'lucide-react';

interface TypographySizeControlProps {
  id: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  presets: readonly number[];
  onChange: (value: number) => void;
  preview: React.ReactNode;
  previewFontVariable: string;
  monospace?: boolean;
}

export function TypographySizeControl({
  id,
  label,
  description,
  value,
  min,
  max,
  defaultValue,
  presets,
  onChange,
  preview,
  previewFontVariable,
  monospace = false
}: TypographySizeControlProps) {
  return (
    <section className="min-w-0 rounded-xl border border-edge bg-panel2/50 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-fg">{label}</label>
        <div className="flex items-center gap-2">
          <output htmlFor={id} className="text-xs tabular-nums font-medium px-2 py-0.5 rounded bg-panel3 text-accent">
            {value}px
          </output>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            disabled={value === defaultValue}
            className="btn-secondary text-xs disabled:opacity-40"
            aria-label={`Reset ${label.toLowerCase()} to ${defaultValue} pixels`}
            title={`Default: ${defaultValue}px`}
          >
            <RotateCcw size={12} aria-hidden="true" /> Reset
          </button>
        </div>
      </div>
      <p id={`${id}-description`} className="text-xs text-dim leading-relaxed">{description}</p>
      <input
        id={id}
        aria-describedby={`${id}-description`}
        aria-valuetext={`${value} pixels`}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full min-w-0 accent-accent cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
      />
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }} aria-label={`${label} presets`}>
        {presets.map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={value === size}
            aria-label={`${label}: ${size} pixels`}
            onClick={() => onChange(size)}
            className={`min-w-0 px-1 py-1 text-xs tabular-nums ${value === size ? 'btn-primary font-semibold' : 'btn-secondary text-dim'}`}
          >
            {size}
          </button>
        ))}
      </div>
      <div className="mt-auto rounded-lg border border-edge bg-panel p-3 overflow-hidden">
        <p className="text-xs text-faint mb-2">Preview · {value}px</p>
        <div
          className="text-fg leading-relaxed break-words"
          style={{
            fontSize: `var(${previewFontVariable}, ${value}px)`,
            fontFamily: monospace ? 'var(--font-mono)' : 'var(--font-sans)'
          }}
        >
          {preview}
        </div>
      </div>
    </section>
  );
}
