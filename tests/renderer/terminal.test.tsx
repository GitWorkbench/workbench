// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ state: {} as Record<string, any>, setState: vi.fn(), run: vi.fn(), external: vi.fn(), copy: vi.fn() }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign((select: (state: any) => any) => select(mock.state), { setState: mock.setState }) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { runCommand: mock.run, openTerminal: mock.external } }));
import { TerminalDrawer } from '../../src/renderer/components/TerminalDrawer/TerminalDrawer';
beforeEach(() => {
  Object.assign(mock.state, { terminalDrawerOpen: true, terminalDrawerHeight: 240, activeTab: '/repo', setTerminalDrawerHeight: vi.fn(), refresh: vi.fn(), notify: vi.fn() });
  mock.run.mockReset().mockResolvedValue({ ok: true, stdout: 'result output', stderr: '', exitCode: 0 }); mock.external.mockReset(); mock.copy.mockReset().mockResolvedValue(undefined); mock.setState.mockReset();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mock.copy } });
});
const input = () => screen.getByPlaceholderText(/Enter command/);
const run = async (command: string) => {
  fireEvent.change(input(), { target: { value: command } }); fireEvent.keyDown(input(), { key: 'Enter' });
  await waitFor(() => expect(input()).toBeEnabled());
};

describe('embedded terminal', () => {
  it('stays hidden while closed and focuses when opened', async () => {
    vi.useFakeTimers(); mock.state.terminalDrawerOpen = false; const { container, rerender } = render(<TerminalDrawer />); expect(container).toBeEmptyDOMElement();
    mock.state.terminalDrawerOpen = true; rerender(<TerminalDrawer />); await act(async () => vi.advanceTimersByTime(50)); expect(input()).toHaveFocus();
    expect(screen.getByTitle('Copy all output')).toBeDisabled(); expect(screen.getByTitle('Clear output')).toBeDisabled();
    fireEvent.click(screen.getByTitle('Open external terminal')); expect(mock.external).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Close terminal drawer (Ctrl+`)')); expect(mock.setState).toHaveBeenCalledWith({ terminalDrawerOpen: false });
  });
  it('trims commands, logs stdout/stderr/exit status, and does not run an empty command', async () => {
    render(<TerminalDrawer />); fireEvent.keyDown(input(), { key: 'Enter' }); expect(mock.run).not.toHaveBeenCalled();
    await run('  echo hello  '); expect(mock.run).toHaveBeenCalledWith('echo hello'); expect(screen.getByText('result output')).toBeVisible(); expect(input()).toHaveValue('');
    mock.run.mockResolvedValueOnce({ ok: false, stderr: 'invalid command', exitCode: 127 }); await run('invalid'); expect(screen.getByText('invalid command')).toBeVisible(); expect(screen.getByText('127')).toBeVisible();
  });
  it.each(['git status', 'git log --oneline', 'git diff', 'echo hello'])('does not refresh the repository for read-only command %s', async command => {
    render(<TerminalDrawer />); await run(command); expect(mock.state.refresh).not.toHaveBeenCalled();
  });
  it.each(['git checkout feature', 'git add .', 'git branch -a'])('refreshes repository state after Git command %s', async command => {
    render(<TerminalDrawer />); await run(command); expect(mock.state.refresh).toHaveBeenCalledOnce();
  });
  it('runs each preset through the same IPC boundary and supports button submission', async () => {
    render(<TerminalDrawer />);
    for (const command of ['git status -s', 'git log --oneline -5', 'git diff --stat', 'git branch -a', 'git remote -v', 'git stash list']) {
      fireEvent.click(screen.getByRole('button', { name: command })); await waitFor(() => expect(input()).toBeEnabled()); expect(mock.run).toHaveBeenCalledWith(command);
    }
    fireEvent.change(input(), { target: { value: 'echo button' } }); fireEvent.click(screen.getByTitle('Run command (Enter)')); await waitFor(() => expect(mock.run).toHaveBeenCalledWith('echo button'));
  });
  it('deduplicates command history and navigates both boundaries with arrow keys', async () => {
    render(<TerminalDrawer />); fireEvent.keyDown(input(), { key: 'ArrowUp' }); fireEvent.keyDown(input(), { key: 'ArrowDown' }); expect(input()).toHaveValue('');
    await run('first'); await run('second'); await run('first');
    fireEvent.keyDown(input(), { key: 'ArrowUp' }); expect(input()).toHaveValue('first'); fireEvent.keyDown(input(), { key: 'ArrowUp' }); expect(input()).toHaveValue('second');
    fireEvent.keyDown(input(), { key: 'ArrowUp' }); expect(input()).toHaveValue('second'); fireEvent.keyDown(input(), { key: 'ArrowDown' }); expect(input()).toHaveValue('first');
    fireEvent.keyDown(input(), { key: 'ArrowDown' }); expect(input()).toHaveValue(''); fireEvent.keyDown(input(), { key: 'x' }); expect(input()).toHaveValue('');
  });
  it('shows useful failures for thrown commands or missing result fields', async () => {
    render(<TerminalDrawer />); mock.run.mockRejectedValueOnce(new Error('IPC offline')); await run('failure'); expect(screen.getByText('Error: IPC offline')).toBeVisible();
    mock.run.mockResolvedValueOnce({ ok: false, error: 'command denied' }); await run('denied'); expect(screen.getByText('command denied')).toBeVisible();
    mock.run.mockResolvedValueOnce({ ok: true }); await run('empty success'); expect(screen.getByText('empty success')).toBeVisible();
    mock.run.mockResolvedValueOnce({ ok: false }); await run('empty failure'); expect(screen.getByText('empty failure')).toBeVisible();
  });
  it('disables input and presets while running, then restores input after completion', async () => {
    let finish!: (data: unknown) => void; mock.run.mockReturnValue(new Promise(resolve => { finish = resolve; })); render(<TerminalDrawer />);
    fireEvent.change(input(), { target: { value: 'slow' } }); fireEvent.keyDown(input(), { key: 'Enter' }); expect(input()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'git status -s' })); expect(mock.run).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: true, stdout: 'done' })); expect(input()).toBeEnabled(); expect(screen.getByText('done')).toBeVisible();
  });
  it('copies individual/all logs, resets copy indication, and clears output', async () => {
    render(<TerminalDrawer />); await run('echo first'); mock.run.mockResolvedValueOnce({ ok: false, stderr: 'error text', exitCode: 1 }); await run('echo second');
    vi.useFakeTimers(); fireEvent.click(screen.getAllByTitle('Copy command output')[0]); expect(mock.copy).toHaveBeenLastCalledWith('$ echo first\nresult output');
    expect(document.querySelector('.lucide-check')).toBeInTheDocument(); await act(async () => vi.advanceTimersByTime(1500)); expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Copy all output')); expect(mock.copy).toHaveBeenLastCalledWith('$ echo first\nresult output\n\n$ echo second\nerror text'); expect(mock.state.notify).toHaveBeenCalledWith('success', 'Terminal output copied to clipboard');
    fireEvent.click(screen.getByTitle('Clear output')); expect(screen.getByText(/Git Workbench Embedded Terminal/)).toBeVisible(); expect(screen.getByTitle('Clear output')).toBeDisabled();
  });
  it('resizes while dragging and toggles a viewport-based maximized height', () => {
    const { container } = render(<TerminalDrawer />); expect(container.firstChild).toHaveStyle({ height: '240px' });
    fireEvent.mouseDown(screen.getByTitle('Drag to resize terminal drawer'), { clientY: 400 }); fireEvent.mouseMove(window, { clientY: 350 }); expect(mock.state.setTerminalDrawerHeight).toHaveBeenLastCalledWith(290);
    fireEvent.mouseUp(window); fireEvent.mouseMove(window, { clientY: 100 }); expect(mock.state.setTerminalDrawerHeight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle('Maximize terminal')); expect((container.firstChild as HTMLElement).style.height).toBe('75vh'); expect(screen.queryByTitle('Drag to resize terminal drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Restore height')); expect(container.firstChild).toHaveStyle({ height: '240px' });
  });
});
