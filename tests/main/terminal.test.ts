import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { TerminalSession } from '../../src/shared/types';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  quit: vi.fn(), spawn: vi.fn(), send: vi.fn(), destroyed: vi.fn(() => false), once: vi.fn(),
  children: [] as { write: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; data: (value: string) => void; exit: (value: {exitCode: number}) => void; dispose: ReturnType<typeof vi.fn> }[]
}));
vi.mock('electron', () => ({ app: { once: mock.quit }, ipcMain: { handle: (name: string, callback: (...args: unknown[]) => unknown) => mock.handlers.set(name, callback) } }));
vi.mock('node-pty', () => ({ spawn: mock.spawn }));
import { registerTerminal } from '../../src/main/terminal';

const repo = path.resolve('/repository');
const owner = { send: mock.send, isDestroyed: mock.destroyed, once: mock.once };
const event = { sender: owner };
const call = (name: string, ...args: unknown[]) => mock.handlers.get(`terminal:${name}`)!(event, ...args);
const open = (repoPath = repo) => call('open', repoPath, 80, 24) as TerminalSession;
let currentRepo: string | null;
let windowAvailable = true;
let windowOwner = owner;
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', originalPlatform); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.clearAllMocks(); mock.handlers.clear(); mock.children.length = 0; currentRepo = repo; windowAvailable = true; windowOwner = owner;
  mock.destroyed.mockReturnValue(false);
  mock.spawn.mockImplementation(() => {
    const child = { write: vi.fn(), resize: vi.fn(), kill: vi.fn(), pause: vi.fn(), resume: vi.fn(), data: (_: string) => {}, exit: (_: {exitCode: number}) => {}, dispose: vi.fn() };
    mock.children.push(child);
    return { ...child, onData: (listener: typeof child.data) => { child.data = listener; return { dispose: child.dispose }; }, onExit: (listener: typeof child.exit) => { child.exit = listener; return { dispose: child.dispose }; } };
  });
  registerTerminal(() => windowAvailable ? { webContents: windowOwner } as never : null, () => currentRepo);
});

describe('repository pseudoterminal boundary', () => {
  it('starts PowerShell directly on Windows', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' }); open();
    expect(mock.spawn).toHaveBeenCalledWith('powershell.exe', ['-NoLogo'], expect.objectContaining({ cwd: repo }));
  });
  it('isolates a replacement window from the original owner’s sessions and cleanup', () => {
    const first = open();
    windowOwner = { ...owner, send: vi.fn() };
    expect(() => mock.handlers.get('terminal:write')!({ sender: windowOwner }, first.id, 'x')).toThrow('session has closed');
    mock.handlers.get('terminal:open')!({ sender: windowOwner }, repo, 80, 24);
    const destroyOld = mock.once.mock.calls[0][1] as () => void; destroyOld();
    expect(mock.children[0].kill).toHaveBeenCalledOnce(); expect(mock.children[1].kill).not.toHaveBeenCalled();
  });
  it('starts a login shell in the captured repository with a clean interactive environment', () => {
    vi.stubEnv('SHELL', '/bin/zsh'); vi.stubEnv('GIT_INDEX_FILE', '/bad-index'); vi.stubEnv('NODE_OPTIONS', 'bad'); vi.stubEnv('ELECTRON_RUN_AS_NODE', '1');
    const session = open();
    expect(session).toMatchObject({ repoPath: repo, shell: process.platform === 'win32' ? 'powershell.exe' : 'zsh', output: '', sequence: 0 });
    const [shell, args, options] = mock.spawn.mock.calls[0];
    expect(shell).toBe(process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');
    expect(args).toEqual(process.platform === 'win32' ? ['-NoLogo'] : ['-l']);
    expect(options).toMatchObject({ cwd: repo, cols: 80, rows: 24, name: 'xterm-256color', env: { TERM_PROGRAM: 'git-workbench', COLORTERM: 'truecolor' } });
    expect(options.env.GIT_INDEX_FILE).toBeUndefined(); expect(options.env.NODE_OPTIONS).toBeUndefined(); expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    vi.unstubAllEnvs();
  });
  it('uses the default shell when SHELL is unavailable, and reports a missing shell', () => {
    vi.stubEnv('SHELL', ''); open(); expect(mock.spawn.mock.calls[0][0]).toBe(process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
    mock.spawn.mockImplementationOnce(() => { throw new Error('Shell is missing'); }); currentRepo = path.resolve('/second'); expect(() => open(currentRepo!)).toThrow('Shell is missing'); vi.unstubAllEnvs();
  });
  it('streams output with monotonic sequence numbers and reattaches without rerunning the shell', () => {
    const session = open(); const child = mock.children[0]; child.data('\x1b[32mhello\r\n');
    expect(mock.send).toHaveBeenCalledWith('terminal:event', { id: session.id, sequence: 1, type: 'data', data: '\x1b[32mhello\r\n' });
    const next = open(); expect(next.id).toBe(session.id); expect(next.connectionId).not.toBe(session.connectionId); expect(next.output).toContain('hello'); expect(mock.spawn).toHaveBeenCalledOnce();
    call('detach', next.id, session.connectionId); child.data('still attached'); expect(mock.send).toHaveBeenCalledTimes(2);
    call('write', next.id, 'cd child\r'); expect(child.write).toHaveBeenCalledWith('cd child\r');
    call('resize', next.id, 120, 40); expect(child.resize).toHaveBeenLastCalledWith(120, 40);
  });
  it('bounds scrollback and applies output backpressure until acknowledged', () => {
    const session = open(); const child = mock.children[0]; child.data('a'.repeat(256 * 1024)); child.data('last'); expect(child.pause).toHaveBeenCalledOnce();
    call('acknowledge', session.id, 0); expect(child.resume).not.toHaveBeenCalled();
    call('acknowledge', session.id, 1); expect(child.resume).toHaveBeenCalledOnce();
    child.data('b'.repeat(256 * 1024)); call('detach', session.id, session.connectionId); expect(child.resume).toHaveBeenCalledTimes(2);
    mock.send.mockClear(); child.data('background output'); expect(mock.send).not.toHaveBeenCalled();
    const attached = open(); expect(attached.output).toHaveLength(256 * 1024); expect(attached.output.endsWith('background output')).toBe(true);
    child.data('c'.repeat(256 * 1024)); const resumed = open(); expect(resumed.id).toBe(session.id); expect(child.resume).toHaveBeenCalledTimes(3);
  });
  it('keeps exited output until explicit restart and does not write, resize, or kill an exited shell', () => {
    const session = open(); const child = mock.children[0]; child.exit({ exitCode: 7 });
    expect(mock.send).toHaveBeenLastCalledWith('terminal:event', { type: 'exit', id: session.id, sequence: 1, exitCode: 7 });
    expect(() => call('write', session.id, 'ls')).toThrow('shell has exited'); call('resize', session.id, 90, 24); expect(child.resize).not.toHaveBeenCalled();
    expect(open().exitCode).toBe(7); call('close', session.id); expect(child.kill).not.toHaveBeenCalled(); expect(child.dispose).toHaveBeenCalledTimes(2);
    expect(open().id).not.toBe(session.id);
  });
  it('captures sessions per repository, limits resource use, and closes only the requested session', () => {
    const first = open(); for (let i = 1; i < 8; i++) { currentRepo = path.resolve(`/repo-${i}`); open(currentRepo); }
    currentRepo = path.resolve('/ninth'); expect(() => open(currentRepo!)).toThrow('Eight repository terminals');
    call('close', first.id); expect(mock.children[0].kill).toHaveBeenCalledOnce(); expect(() => open(currentRepo!)).not.toThrow();
    expect(mock.once).toHaveBeenCalledOnce();
    const destroy = mock.once.mock.calls[0][1] as () => void; destroy(); expect(mock.children.slice(1).every(child => child.kill.mock.calls.length === 1)).toBe(true);
  });
  it('kills running shells when the app quits, including when the window has closed', () => {
    const session = open(); mock.destroyed.mockReturnValue(true); mock.children[0].data('late'); expect(mock.send).not.toHaveBeenCalled();
    expect(() => call('write', session.id, 'x')).toThrow('access is unavailable');
    const quit = mock.quit.mock.calls[0][1] as () => void; quit(); expect(mock.children[0].kill).toHaveBeenCalledOnce();
  });
  it('rejects foreign senders, stale repositories, invalid sizes, invalid acknowledgements and oversized input', () => {
    expect(() => mock.handlers.get('terminal:open')!({ sender: {} }, repo, 80, 24)).toThrow('access is unavailable');
    windowAvailable = false; expect(() => open()).toThrow('access is unavailable'); windowAvailable = true;
    currentRepo = null; expect(() => open()).toThrow('active repository changed'); currentRepo = repo;
    for (const value of [null, 'relative', path.resolve('/other')]) expect(() => call('open', value, 80, 24)).toThrow('active repository changed');
    for (const [cols, rows] of [[1, 24], [501, 24], [80, 0], [80, 301], [1.5, 24], [80, NaN]]) expect(() => call('open', repo, cols, rows)).toThrow('Invalid terminal dimensions');
    const session = open(); expect(() => call('write', 'missing', 'x')).toThrow('session has closed');
    for (const value of [null, 'a'.repeat(65537)]) expect(() => call('write', session.id, value)).toThrow('input is too large');
    for (const value of [-1, 1.5, 1]) expect(() => call('acknowledge', session.id, value)).toThrow('Invalid terminal output acknowledgement');
    call('close', session.id); expect(() => call('resize', session.id, 80, 24)).toThrow('session has closed');
  });
});
