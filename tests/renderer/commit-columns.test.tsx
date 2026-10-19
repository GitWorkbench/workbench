// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitColumnMenu, ResizableColumnHeader } from '../../src/renderer/components/CommitGraph/CommitColumnControls';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  if (!window.PointerEvent) Object.defineProperty(window, 'PointerEvent', { configurable: true, value: class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId || 0; this.pointerType = init.pointerType || ''; }
  } });
});

describe('ResizableColumnHeader', () => {
  it.each([
    ['author', 150, 100, 360], ['date', 200, 150, 360], ['sha', 100, 80, 220]
  ] as const)('clamps %s resizing and commits only the active pointer', (column, width, min, max) => {
    const resize = vi.fn(), commit = vi.fn();
    render(<ResizableColumnHeader column={column} label={column} width={width} onResize={resize} onCommit={commit} />);
    const handle = screen.getByRole('button', { name: `Resize ${column} column` });
    fireEvent.pointerMove(handle, { clientX: 999, pointerId: 9 });
    fireEvent.pointerUp(handle, { clientX: 999, pointerId: 9 });
    fireEvent.pointerCancel(handle, { pointerId: 9 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { pointerType: 'mouse', button: 2, pointerId: 7, clientX: 40 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 100 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { pointerType: 'mouse', button: 0, pointerId: 7, clientX: 40 });
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 1000 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 1000 });
    expect(resize).toHaveBeenLastCalledWith(column, max);
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: -1000 });
    expect(resize).toHaveBeenLastCalledWith(column, min);
    expect(commit).toHaveBeenCalledWith(column, min);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
    fireEvent.doubleClick(handle);
    expect(commit).toHaveBeenLastCalledWith(column, width);
  });
  it('restores initial width on cancellation and allows touch dragging', () => {
    const resize = vi.fn(), commit = vi.fn();
    render(<ResizableColumnHeader column="author" label="Author" width={151} onResize={resize} onCommit={commit} />);
    const handle = screen.getByRole('button');
    fireEvent.pointerDown(handle, { pointerType: 'touch', pointerId: 1, clientX: 30 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50.6 });
    expect(resize).toHaveBeenLastCalledWith('author', 172);
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(resize).toHaveBeenLastCalledWith('author', 151);
    expect(commit).not.toHaveBeenCalled();
  });
  it('resizes by keyboard and ignores other keys', () => {
    const resize = vi.fn(), commit = vi.fn();
    render(<ResizableColumnHeader column="date" label="Date/time" width={200} onResize={resize} onCommit={commit} />);
    const handle = screen.getByRole('button');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(resize.mock.calls).toEqual([['date', 210], ['date', 190]]);
    expect(commit.mock.calls).toEqual(resize.mock.calls);
  });
});

describe('CommitColumnMenu', () => {
  const visibility = { author: true, date: false, sha: true };
  it('opens at the gear, preserves ordering and emits independent visibility changes', () => {
    const change = vi.fn(), reset = vi.fn();
    render(<CommitColumnMenu visibility={visibility} onChange={change} onResetWidths={reset} />);
    const trigger = screen.getByRole('button', { name: 'Choose visible commit columns' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('checkbox').map(input => input.closest('label')!.textContent)).toEqual(['Author', 'Date/time', 'SHA']);
    expect(screen.getByRole('checkbox', { name: 'Author' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Date/time' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Date/time' }));
    expect(change).toHaveBeenCalledWith({ date: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reset column widths' }));
    expect(reset).toHaveBeenCalledOnce();
    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.pointerDown(trigger);
    fireEvent.keyDown(document, { key: 'x' });
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it.each(['outside', 'Escape'])('closes on %s and removes active listeners', method => {
    const { unmount } = render(<CommitColumnMenu visibility={visibility} onChange={vi.fn()} onResetWidths={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    if (method === 'outside') fireEvent.pointerDown(document.body);
    else fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    expect(() => fireEvent.resize(window)).not.toThrow();
  });
  it('repositions below and above the trigger as the viewport changes', () => {
    let nearBottom = false;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if ((this as HTMLElement).tagName === 'BUTTON') return { right: 600, bottom: nearBottom ? 490 : 50, top: nearBottom ? 470 : 30, height: 20 } as DOMRect;
      return { height: 190 } as DOMRect;
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500);
    render(<CommitColumnMenu visibility={visibility} onChange={vi.fn()} onResetWidths={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toHaveStyle({ left: '380px', top: '56px' });
    fireEvent.scroll(window);
    nearBottom = true;
    fireEvent.resize(window);
    expect(screen.getByRole('dialog')).toHaveStyle({ left: '380px', top: '274px' });
  });
});
