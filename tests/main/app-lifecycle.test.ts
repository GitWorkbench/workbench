import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(), ipc: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[], register: vi.fn(), updater: vi.fn(), quit: vi.fn(), open: vi.fn(), identity: vi.fn(), menu: vi.fn(), ready: vi.fn(() => Promise.resolve())
}));
vi.mock('../../src/main/ipc', () => ({ registerIpc: mock.register }));
vi.mock('../../src/main/updater', () => ({ registerUpdater: mock.updater }));
vi.mock('../../src/main/terminal', () => ({ registerTerminal: mock.register }));
vi.mock('../../src/main/app-identity', () => ({ configureAppIdentity: mock.identity, configureAppMenu: mock.menu }));
vi.mock('electron', () => ({
  app: { whenReady: mock.ready, on: (name: string, fn: (...args: any[]) => any) => mock.handlers.set(name, fn), quit: mock.quit },
  ipcMain: { on: (name: string, fn: (...args: any[]) => any) => mock.ipc.set(name, fn) },
  shell: { openExternal: mock.open },
  BrowserWindow: class {
    options: unknown;
    events = new Map<string, (...args: any[]) => any>();
    webContents = { send: vi.fn() };
    loadFile = vi.fn(); loadURL = vi.fn();
    constructor(options: unknown) { this.options = options; mock.windows.push(this); }
    on(name: string, fn: (...args: any[]) => any) { this.events.set(name, fn); }
    static getAllWindows() { return mock.windows; }
  }
}));
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  vi.resetModules(); mock.handlers.clear(); mock.ipc.clear(); mock.windows.length = 0;
  mock.register.mockReset(); mock.updater.mockReset(); mock.quit.mockReset(); mock.open.mockReset();
  mock.identity.mockClear(); mock.menu.mockClear(); mock.ready.mockClear();
  vi.stubEnv('ELECTRON_RENDERER_URL', '');
});
afterEach(() => { vi.unstubAllEnvs(); Object.defineProperty(process, 'platform', originalPlatform); });
async function start() { await import('../../src/main/index'); await Promise.resolve(); }

describe('Electron application lifecycle', () => {
  it('creates an isolated renderer, wires main services, and tracks the active repo', async () => {
    await start(); const win = mock.windows[0];
    expect(win.options).toMatchObject({ minWidth: 1024, minHeight: 640, title: 'Git Workbench', webPreferences: { contextIsolation: true, nodeIntegration: false } });
    expect(win.loadFile).toHaveBeenCalledWith(expect.stringContaining(path.join('renderer', 'index.html')));
    expect(mock.register).toHaveBeenCalledTimes(2); expect(mock.updater).toHaveBeenCalledOnce();
    expect(mock.identity).toHaveBeenCalledOnce();
    expect(mock.identity.mock.invocationCallOrder[0]).toBeLessThan(mock.ready.mock.invocationCallOrder[0]);
    expect(mock.menu).toHaveBeenCalledOnce();
    expect(mock.menu.mock.invocationCallOrder[0]).toBeGreaterThan(mock.ready.mock.invocationCallOrder[0]);
    const [getWindow, getRepo] = mock.register.mock.calls[0];
    const [getTerminalWindow, getTerminalRepo] = mock.register.mock.calls[1];
    expect(getTerminalWindow()).toBe(win); expect(getTerminalRepo()).toBeNull();
    expect(getWindow()).toBe(win); expect(mock.updater.mock.calls[0][0]()).toBe(win); expect(getRepo()).toBeNull();
    mock.ipc.get('repo:set-active')!({}, '/temporary/repository'); expect(getRepo()).toBe('/temporary/repository'); expect(getTerminalRepo()).toBe('/temporary/repository');
    mock.ipc.get('repo:set-active')!({}, null); expect(getRepo()).toBeNull();
    win.events.get('maximize')!(); win.events.get('unmaximize')!();
    expect(win.webContents.send.mock.calls).toEqual([['window:maximize-change', true], ['window:maximize-change', false]]);
    win.events.get('closed')!(); expect(getWindow()).toBeNull(); expect(getTerminalWindow()).toBeNull();
    win.events.get('maximize')!(); win.events.get('unmaximize')!(); expect(win.webContents.send).toHaveBeenCalledTimes(2);
  });
  it('loads a development URL only when one is configured', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173'); await start();
    expect(mock.windows[0].loadURL).toHaveBeenCalledExactlyOnceWith('http://localhost:5173'); expect(mock.windows[0].loadFile).not.toHaveBeenCalled();
  });
  it.each([true, false])('includes the application icon only if present (%s)', async exists => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(exists); await start();
    expect(mock.windows[0].options.icon).toEqual(exists ? expect.stringContaining(path.join('build', 'icon.png')) : undefined);
  });
  it('recreates a window on activation only when all windows are closed', async () => {
    await start(); mock.handlers.get('activate')!(); expect(mock.windows).toHaveLength(1);
    mock.windows.length = 0; mock.handlers.get('activate')!(); expect(mock.windows).toHaveLength(1);
  });
  it.each(['linux', 'win32', 'darwin'])('uses native quit behavior on %s', async platform => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true }); await start(); mock.handlers.get('window-all-closed')!();
    expect(mock.quit.mock.calls.length).toBe(platform === 'darwin' ? 0 : 1);
  });
  it('opens external links in the system browser and prevents renderer popups', async () => {
    await start(); const contents = { setWindowOpenHandler: vi.fn() }; mock.handlers.get('web-contents-created')!({}, contents);
    const handle = contents.setWindowOpenHandler.mock.calls[0][0];
    expect(handle({ url: 'https://github.com/GitWorkbench/workbench' })).toEqual({ action: 'deny' });
    expect(mock.open).toHaveBeenCalledWith('https://github.com/GitWorkbench/workbench');
  });
});
