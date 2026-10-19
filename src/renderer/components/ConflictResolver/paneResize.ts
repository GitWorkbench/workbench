import type { PointerEvent as ReactPointerEvent } from 'react';

export type PaneWidths = [number, number, number];
type ResizeStart = Pick<ReactPointerEvent<HTMLDivElement>, 'clientX' | 'pointerId' | 'preventDefault' | 'currentTarget'>;
const noop = () => {};

/** Capture a bounded adjacent-pane drag and return its listener cleanup. */
export function startPaneResize(event: ResizeStart, container: HTMLElement | null, divider: 0 | 1,
  original: PaneWidths, onResize: (widths: PaneWidths) => void): () => void {
  if (!container) return noop;
  const width = container.getBoundingClientRect().width;
  if (!Number.isFinite(width) || width <= 0) return noop;
  event.preventDefault();
  const element = event.currentTarget, start = event.clientX;
  element.setPointerCapture(event.pointerId);
  const move = (nextEvent: PointerEvent) => {
    const delta = (nextEvent.clientX - start) / width * 100;
    const total = original[divider] + original[divider + 1];
    const next: PaneWidths = [...original];
    next[divider] = Math.max(18, Math.min(total - 18, original[divider] + delta));
    next[divider + 1] = total - next[divider];
    onResize(next);
  };
  const finish = () => {
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', finish);
    element.removeEventListener('pointercancel', finish);
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
  return finish;
}
