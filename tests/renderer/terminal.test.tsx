// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalEvent, TerminalSession } from '../../src/shared/types';
const mock = vi.hoisted(() => ({
  state: { terminalDrawerOpen: true, terminalDrawerHeight: 240, activeTab: '/repo' as string | null, setTerminalDrawerHeight: vi.fn(), refresh: vi.fn() },
  settings: { theme: 'dark', codeFontSize: 13, codeFontFamily: 'monospace', customCodeFont: '' },
  setState: vi.fn(), open: vi.fn(), write: vi.fn(), resize: vi.fn(), close: vi.fn(), detach: vi.fn(), ack: vi.fn(), external: vi.fn(), copy: vi.fn(), read: vi.fn(), unsubscribe: vi.fn(), fit: vi.fn(), disconnect: vi.fn(),
  listener: null as null | ((event: TerminalEvent) => void),
  observe: null as null | (() => void),
  terms: [] as { options: Record<string, unknown>; cols: number; rows: number; write: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; inputDispose: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn>; paste: ReturnType<typeof vi.fn>; data: (data: string) => void; key: (event: KeyboardEvent) => boolean }[]
}));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: typeof mock.state) => unknown) => select(mock.state), { setState: mock.setState, getState: () => mock.state }) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: (select: (state: typeof mock.settings) => unknown) => select(mock.settings) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { openTerminalSession: mock.open, writeTerminalSession: mock.write, resizeTerminalSession: mock.resize, closeTerminalSession: mock.close, acknowledgeTerminalData: mock.ack, detachTerminalSession: mock.detach, onTerminalEvent: (cb: (event: TerminalEvent) => void) => { mock.listener = cb; return mock.unsubscribe; }, openTerminal: mock.external } }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options: Record<string, unknown> = {}; cols = 80; rows = 24;
  write = vi.fn((_data: string, callback: () => void) => callback()); dispose = vi.fn(); inputDispose = vi.fn(); focus = vi.fn(); clear = vi.fn(); paste = vi.fn(); getSelection = () => 'selected output';
  data = (_: string) => {}; key = (_: KeyboardEvent) => true;
  constructor() { mock.terms.push(this); }
  open() {} loadAddon() {}
  onData(listener: typeof this.data) { this.data = listener; return { dispose: this.inputDispose }; }
  attachCustomKeyEventHandler(listener: typeof this.key) { this.key = listener; }
} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = mock.fit; } }));
import { TerminalDrawer } from '../../src/renderer/components/TerminalDrawer/TerminalDrawer';
const snapshot: TerminalSession = { id: 'session-1', connectionId: 'connection-1', repoPath: '/repo', shell: 'zsh', output: '$ ', sequence: 2 };
const ready = () => waitFor(() => expect(screen.queryByText('Starting shell…')).not.toBeInTheDocument());
const emit = (event: TerminalEvent) => act(() => mock.listener!(event));
beforeEach(() => {
  vi.clearAllMocks(); mock.terms.length = 0;
  Object.assign(mock.state, { terminalDrawerOpen: true, terminalDrawerHeight: 240, activeTab: '/repo' }); mock.state.refresh.mockReset().mockResolvedValue(undefined);
  for (const method of [mock.write, mock.resize, mock.close, mock.ack, mock.detach, mock.copy]) method.mockReset().mockResolvedValue(undefined);
  mock.open.mockReset().mockResolvedValue(snapshot); mock.external.mockReset().mockResolvedValue({ ok: true }); mock.read.mockReset().mockResolvedValue('pasted command');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mock.copy, readText: mock.read } });
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { mock.observe = cb; } observe() {} disconnect = mock.disconnect; });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640); vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(220);
});

describe('interactive repository terminal', () => {
  it('resizes the backing pseudoterminal when the configured code font changes', async () => {
    const { rerender } = render(<TerminalDrawer />); await ready();
    mock.terms[0].cols = 120; mock.terms[0].rows = 32; mock.settings.codeFontSize = 14;
    rerender(<TerminalDrawer />); expect(mock.resize).toHaveBeenLastCalledWith(snapshot.id, 120, 32); expect(mock.terms[0].options.fontSize).toBe(14);
    mock.settings.codeFontSize = 13;
  });
  it('keeps shell shortcuts inside the terminal and lets the drawer shortcut reach the app', async () => {
    const { container, unmount } = render(<TerminalDrawer />); await ready();
    const host = container.querySelector('.min-h-0')!; const globalKey = vi.fn(); window.addEventListener('keydown', globalKey);
    for (const patch of [{ key: 't', ctrlKey: true }, { key: 'k', metaKey: true }, { key: 'x' }]) fireEvent.keyDown(host, patch);
    expect(globalKey).not.toHaveBeenCalled(); fireEvent.keyDown(host, { key: '`', ctrlKey: true }); fireEvent.keyDown(host, { key: '~', metaKey: true }); expect(globalKey).toHaveBeenCalledTimes(2); window.removeEventListener('keydown', globalKey);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0); mock.observe!();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600); vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(0); mock.observe!();
    unmount(); mock.observe!();
  });
  it('stops a session explicitly, frees its slot, and hides the drawer', async () => {
    render(<TerminalDrawer />); await ready(); fireEvent.click(screen.getByLabelText('Stop terminal session'));
    await waitFor(() => expect(mock.close).toHaveBeenCalledWith(snapshot.id)); expect(mock.setState).toHaveBeenCalledWith({ terminalDrawerOpen: false });
  });
  it('ignores a pending restart and clipboard response after switching repositories', async () => {
    let finishClose!: () => void, finishPaste!: (text: string) => void;
    mock.close.mockReturnValueOnce(new Promise<void>(done => { finishClose = done; }));
    mock.read.mockReturnValueOnce(new Promise<string>(done => { finishPaste = done; }));
    const { rerender } = render(<TerminalDrawer />); await ready(); const old = mock.terms[0];
    old.key(new KeyboardEvent('keydown', { key: 'v', metaKey: true }));
    fireEvent.click(screen.getByLabelText('Restart shell')); fireEvent.click(screen.getByText('Restart shell now'));
    mock.state.activeTab = '/other'; rerender(<TerminalDrawer />); await ready();
    await act(async () => { finishClose(); finishPaste('stale paste'); });
    expect(mock.open).toHaveBeenCalledTimes(2); expect(old.paste).not.toHaveBeenCalled();
  });
  it('reports resize failures and ignores output/refresh callbacks after cleanup', async () => {
    const { container, unmount } = render(<TerminalDrawer />); await ready();
    mock.resize.mockRejectedValueOnce(new Error('resize failed')); act(() => mock.observe!()); await screen.findByText('resize failed');
    mock.state.refresh.mockRejectedValueOnce(new Error('read failed')); fireEvent.blur(container.querySelector('.min-h-0')!, { relatedTarget: document.body }); await act(async () => {});
    const term = mock.terms[0]; const callbacks = term.write.mock.calls.map(call => call[1]); unmount(); callbacks.forEach(callback => callback());
  });
  it('opens a real session, restores scrollback, focuses, resizes, and detaches on hide without killing it', async () => {
    const { rerender } = render(<TerminalDrawer />); await ready(); const term = mock.terms[0];
    expect(mock.open).toHaveBeenCalledWith('/repo', 80, 24); expect(term.write).toHaveBeenCalledWith('$ ', expect.any(Function)); expect(term.focus).toHaveBeenCalledOnce();
    expect(mock.ack).toHaveBeenCalledWith(snapshot.id, 2); expect(mock.resize).toHaveBeenCalledWith(snapshot.id, 80, 24);
    fireEvent.click(screen.getByLabelText('Hide terminal')); expect(mock.setState).toHaveBeenCalledWith({ terminalDrawerOpen: false });
    mock.state.terminalDrawerOpen = false; rerender(<TerminalDrawer />); expect(screen.queryByRole('region')).not.toBeInTheDocument(); expect(term.dispose).toHaveBeenCalledOnce(); expect(term.inputDispose).toHaveBeenCalledOnce(); expect(mock.unsubscribe).toHaveBeenCalledOnce(); expect(mock.disconnect).toHaveBeenCalledOnce();
    expect(mock.detach).toHaveBeenCalledWith(snapshot.id, snapshot.connectionId); expect(mock.close).not.toHaveBeenCalled();
    emit({ id: snapshot.id, sequence: 3, type: 'data', data: 'late' }); expect(term.write).toHaveBeenCalledTimes(1);
  });
  it('stays hidden without starting a shell and does not open a session without a repository', () => {
    mock.state.terminalDrawerOpen = false; const { rerender } = render(<TerminalDrawer />); expect(mock.open).not.toHaveBeenCalled();
    mock.state.terminalDrawerOpen = true; mock.state.activeTab = null; rerender(<TerminalDrawer />); expect(mock.open).not.toHaveBeenCalled();
  });
  it('cancels a resize drag when the drawer is hidden by its keyboard shortcut', async () => {
    const { rerender } = render(<TerminalDrawer />); await ready();
    fireEvent.mouseDown(screen.getByTitle('Drag to resize terminal drawer'), { clientY: 400 });
    mock.state.terminalDrawerOpen = false; rerender(<TerminalDrawer />);
    mock.state.setTerminalDrawerHeight.mockClear(); fireEvent.mouseMove(window, { clientY: 300 });
    expect(mock.state.setTerminalDrawerHeight).not.toHaveBeenCalled();
  });
  it('streams live input, completion/interrupt keys, and large pastes without disabling input', async () => {
    render(<TerminalDrawer />); await ready(); const term = mock.terms[0];
    act(() => term.data('git status\r')); act(() => term.data('\t')); act(() => term.data('\x03')); act(() => term.data('x'.repeat(70000)));
    expect(mock.write.mock.calls.slice(0, 3)).toEqual([[snapshot.id, 'git status\r'], [snapshot.id, '\t'], [snapshot.id, '\x03']]);
    expect(mock.write.mock.calls.slice(3).map(call => call[1].length)).toEqual([65536, 4464]);
    emit({ id: 'other', sequence: 99, type: 'data', data: 'foreign' }); emit({ id: snapshot.id, sequence: 2, type: 'data', data: 'duplicate' }); expect(term.write).toHaveBeenCalledTimes(1);
    emit({ id: snapshot.id, sequence: 3, type: 'data', data: '\x1b[32mstreamed' }); expect(term.write).toHaveBeenLastCalledWith('\x1b[32mstreamed', expect.any(Function)); expect(mock.ack).toHaveBeenLastCalledWith(snapshot.id, 3);
  });
  it('replays events arriving before the snapshot, drops duplicate snapshot output and detaches stale openings', async () => {
    let resolve!: (session: TerminalSession) => void; mock.open.mockReturnValueOnce(new Promise<TerminalSession>(done => { resolve = done; }));
    const { unmount } = render(<TerminalDrawer />); act(() => mock.terms[0].data('ignored'));
    for (let sequence = 0; sequence < 130; sequence++) emit({ id: snapshot.id, sequence, type: 'data', data: String(sequence) });
    await act(async () => resolve({ ...snapshot, sequence: 128 })); expect(mock.terms[0].write).toHaveBeenLastCalledWith('129', expect.any(Function));
    unmount(); const term = mock.terms[0]; term.write.mock.calls[0][1]();
    mock.open.mockReturnValueOnce(new Promise<TerminalSession>(done => { resolve = done; })); const next = render(<TerminalDrawer />); next.unmount(); await act(async () => resolve(snapshot)); expect(mock.detach).toHaveBeenCalledTimes(2);
  });
  it('reports exited shells and restarts only after confirmation', async () => {
    render(<TerminalDrawer />); await ready(); emit({ id: snapshot.id, sequence: 3, type: 'exit', exitCode: 7 }); expect(screen.getByText(/Shell exited with code 7/)).toBeVisible(); expect(mock.terms[0].options.disableStdin).toBe(true);
    fireEvent.click(screen.getByLabelText('Restart shell')); expect(mock.close).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Cancel')); expect(screen.queryByText('Restart shell now')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Restart shell')); fireEvent.click(screen.getByText('Restart shell now')); await waitFor(() => expect(mock.open).toHaveBeenCalledTimes(2)); expect(mock.close).toHaveBeenCalledWith(snapshot.id);
    expect(mock.terms[0].dispose).toHaveBeenCalledOnce();
  });
  it('displays an exited snapshot, handles failed creation and allows retry without an existing session', async () => {
    mock.open.mockRejectedValueOnce(new Error('PTY unavailable')); const { rerender } = render(<TerminalDrawer />); await ready(); expect(screen.getByRole('alert')).toHaveTextContent('PTY unavailable');
    fireEvent.click(screen.getByLabelText('Restart shell')); fireEvent.click(screen.getByText('Restart shell now')); await waitFor(() => expect(mock.open).toHaveBeenCalledTimes(2)); expect(mock.close).not.toHaveBeenCalled();
    mock.state.terminalDrawerOpen = false; rerender(<TerminalDrawer />); mock.open.mockResolvedValueOnce({ ...snapshot, exitCode: 0 }); mock.state.terminalDrawerOpen = true; rerender(<TerminalDrawer />); await ready(); expect(screen.getByText(/Shell exited with code 0/)).toBeVisible();
  });
  it('surfaces IPC, clipboard and external terminal errors without breaking the session', async () => {
    render(<TerminalDrawer />); await ready();
    mock.write.mockRejectedValueOnce(new Error('Write failed')); act(() => mock.terms[0].data('x')); await screen.findByText('Write failed');
    mock.ack.mockRejectedValueOnce(null); emit({ id: snapshot.id, sequence: 3, type: 'data', data: 'x' }); await screen.findByText(/terminal connection failed/);
    mock.copy.mockRejectedValueOnce(new Error('clipboard')); fireEvent.click(screen.getByLabelText('Copy terminal selection')); await screen.findByText('Could not copy the selection.');
    mock.external.mockResolvedValueOnce({ ok: false, error: 'No terminal' }); fireEvent.click(screen.getByLabelText('Open external terminal')); await screen.findByText('No terminal');
    mock.external.mockResolvedValueOnce({ ok: false }); fireEvent.click(screen.getByLabelText('Open external terminal')); await screen.findByText('Could not open the external terminal.');
    mock.external.mockRejectedValueOnce(new Error('offline')); fireEvent.click(screen.getByLabelText('Open external terminal')); await screen.findByText('Could not open the external terminal.');
    mock.close.mockRejectedValueOnce(new Error('close failed')); fireEvent.click(screen.getByLabelText('Restart shell')); fireEvent.click(screen.getByText('Restart shell now')); await screen.findByText('Error: close failed');
  });
  it('copies a selection, clears scrollback and preserves native copy/paste shortcuts', async () => {
    render(<TerminalDrawer />); await ready(); const term = mock.terms[0];
    fireEvent.click(screen.getByLabelText('Copy terminal selection')); expect(mock.copy).toHaveBeenCalledWith('selected output'); fireEvent.click(screen.getByLabelText('Clear terminal scrollback')); expect(term.clear).toHaveBeenCalledOnce();
    expect(term.key(new KeyboardEvent('keyup', { key: 'c', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(term.key(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(true);
    expect(term.key(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(term.key(new KeyboardEvent('keydown', { key: 'v', metaKey: true }))).toBe(false); await waitFor(() => expect(term.paste).toHaveBeenCalledWith('pasted command'));
    mock.read.mockRejectedValueOnce(new Error('read denied')); term.key(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true })); await screen.findByText('read denied');
    mock.copy.mockRejectedValueOnce(new Error('copy denied')); term.key(new KeyboardEvent('keydown', { key: 'c', metaKey: true })); await screen.findByText('copy denied');
  });
  it('resizes smoothly without a height transition, supports maximize and cleans up an active drag', async () => {
    const { container, unmount } = render(<TerminalDrawer />); await ready(); expect(container.firstChild).toHaveStyle({ height: '240px' });
    fireEvent.mouseDown(screen.getByTitle('Drag to resize terminal drawer'), { clientY: 400 }); fireEvent.mouseMove(window, { clientY: 350 }); expect(mock.state.setTerminalDrawerHeight).toHaveBeenLastCalledWith(290); fireEvent.mouseUp(window);
    fireEvent.click(screen.getByTitle('Maximize terminal')); expect((container.firstChild as HTMLElement).style.height).toBe('75vh'); expect(screen.queryByTitle('Drag to resize terminal drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Restore height')); expect(container.firstChild).toHaveStyle({ height: '240px' });
    fireEvent.mouseDown(screen.getByTitle('Drag to resize terminal drawer'), { clientY: 300 }); fireEvent.mouseDown(screen.getByTitle('Drag to resize terminal drawer'), { clientY: 300 }); unmount(); mock.state.setTerminalDrawerHeight.mockClear(); fireEvent.mouseMove(window, { clientY: 200 }); expect(mock.state.setTerminalDrawerHeight).not.toHaveBeenCalled();
  });
  it('refreshes after shell output settles and on blur, while ignoring repository switches', async () => {
    const { container } = render(<TerminalDrawer />); await ready(); vi.useFakeTimers();
    const term = mock.terms[0]; act(() => term.data('touch file\r')); emit({ id: snapshot.id, sequence: 3, type: 'data', data: '$ ' });
    await act(async () => { await vi.advanceTimersByTimeAsync(750); }); expect(mock.state.refresh).toHaveBeenCalledOnce();
    const host = container.querySelector('.min-h-0')!; fireEvent.blur(host, { relatedTarget: document.body }); expect(mock.state.refresh).toHaveBeenCalledTimes(2);
    fireEvent.blur(host, { relatedTarget: host }); expect(mock.state.refresh).toHaveBeenCalledTimes(2);
    mock.state.activeTab = '/other'; act(() => term.data('git status\r')); emit({ id: snapshot.id, sequence: 4, type: 'data', data: 'next' }); await act(async () => { await vi.advanceTimersByTimeAsync(750); }); expect(mock.state.refresh).toHaveBeenCalledTimes(2);
  });
});
