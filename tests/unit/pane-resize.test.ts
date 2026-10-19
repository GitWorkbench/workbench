// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { startPaneResize } from '../../src/renderer/components/ConflictResolver/paneResize';

function fixture(width = 1000) {
  const container = document.createElement('div'), divider = document.createElement('div');
  container.append(divider);
  divider.setPointerCapture = vi.fn();
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, 400));
  return { container, divider, event: { clientX: 100, pointerId: 1, currentTarget: divider, preventDefault: vi.fn() } };
}
function move(divider: HTMLElement, x: number) {
  const event = new Event('pointermove'); Object.defineProperty(event, 'clientX', { value: x }); divider.dispatchEvent(event);
}
it('ignores unattached or hidden containers without capturing a pointer', () => {
  const item = fixture(); const update = vi.fn();
  startPaneResize(item.event, null, 0, [31, 38, 31], update)();
  for (const width of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const hidden = fixture(width); startPaneResize(hidden.event, hidden.container, 0, [31, 38, 31], update)();
    expect(hidden.divider.setPointerCapture).not.toHaveBeenCalled();
  }
  expect(item.event.preventDefault).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it.each([0, 1] as const)('resizes divider %s within bounds and cleans up on release, cancellation or unmount', dividerIndex => {
  const item = fixture(), update = vi.fn(), original: [number, number, number] = [31, 38, 31];
  const cleanup = startPaneResize(item.event, item.container, dividerIndex, original, update);
  expect(item.event.preventDefault).toHaveBeenCalledOnce(); expect(item.divider.setPointerCapture).toHaveBeenCalledWith(1);
  move(item.divider, 200);
  expect(update).toHaveBeenLastCalledWith(dividerIndex === 0 ? [41, 28, 31] : [31, 48, 21]);
  move(item.divider, -10000); expect(update.mock.lastCall?.[0][dividerIndex]).toBe(18);
  move(item.divider, 10000); expect(update.mock.lastCall?.[0][dividerIndex + 1]).toBe(18);
  expect(original).toEqual([31, 38, 31]);
  cleanup(); update.mockClear(); move(item.divider, 300); expect(update).not.toHaveBeenCalled();
  for (const end of ['pointerup', 'pointercancel']) {
    startPaneResize(item.event, item.container, dividerIndex, original, update);
    item.divider.dispatchEvent(new Event(end)); move(item.divider, 400); expect(update).not.toHaveBeenCalled();
  }
});
