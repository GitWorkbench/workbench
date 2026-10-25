import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: vi.fn(() => '0.3.0') },
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => void>(),
  send: vi.fn(), openExternal: vi.fn(),
  check: vi.fn(), download: vi.fn(), install: vi.fn()
}));
vi.mock('electron', () => ({
  app: mock.app,
  ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => mock.handlers.set(name, callback) },
  shell: { openExternal: mock.openExternal }
}));
vi.mock('electron-updater', () => ({ default: { autoUpdater: {
  on: (name: string, callback: (...args: any[]) => void) => mock.listeners.set(name, callback),
  checkForUpdates: mock.check, downloadUpdate: mock.download, quitAndInstall: mock.install
} } }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const call = (action: string) => mock.handlers.get(`app-update:${action}`)!();
const emit = (event: string, data?: unknown) => mock.listeners.get(event)!(data);
async function load(platform = 'linux', withWindow = true) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  const { registerUpdater } = await import('../../src/main/updater');
  registerUpdater(() => withWindow ? { webContents: { send: mock.send } } as any : null);
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  mock.handlers.clear(); mock.listeners.clear();
  mock.app.isPackaged = true;
  mock.check.mockReset(); mock.download.mockReset(); mock.install.mockReset();
  mock.send.mockClear(); mock.openExternal.mockReset();
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers();
  Object.defineProperty(process, 'platform', originalPlatform);
});

describe('desktop update lifecycle', () => {
  it('retains a downloaded update when another check is requested, including the startup timer', async () => {
    await load(); emit('update-downloaded', { version: '1.2.0' });
    expect(await call('check')).toMatchObject({ status: 'downloaded', availableVersion: '1.2.0' });
    await vi.advanceTimersByTimeAsync(5000); expect(mock.check).not.toHaveBeenCalled();
  });
  it('registers explicit controls with automatic download and installation disabled', async () => {
    await load();
    const { default: { autoUpdater } } = await import('electron-updater');
    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdater.allowPrerelease).toBe(true);
    expect(call('get-state')).toMatchObject({ status: 'idle', currentVersion: '0.3.0', canInstallInApp: true });
    expect(mock.check).not.toHaveBeenCalled();
    mock.check.mockResolvedValue({ isUpdateAvailable: false, updateInfo: { version: '0.3.0' } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock.check).toHaveBeenCalledTimes(1);
    expect(call('get-state').status).toBe('not-available');
  });

  it.each(['linux', 'win32'])('downloads explicitly, reports bounded progress, then installs on %s', async platform => {
    await load(platform);
    expect(await call('install')).toBe(false);
    await call('download'); expect(mock.download).not.toHaveBeenCalled();
    emit('checking-for-update');
    expect(call('get-state').status).toBe('checking');
    emit('update-available', { version: '0.4.0', releaseName: 'Release 0.4', releaseNotes: '  Notes  ' });
    expect(call('get-state')).toMatchObject({ status: 'available', releaseNotes: 'Notes', releaseName: 'Release 0.4' });
    await call('download');
    expect(mock.download).toHaveBeenCalledTimes(1);
    for (const [percent, expected] of [[-4, 0], [42.5, 42.5], [102, 100]]) {
      emit('download-progress', { percent });
      expect(call('get-state')).toMatchObject({ status: 'downloading', progress: expected });
    }
    emit('update-downloaded', { version: '0.4.0' });
    expect(call('get-state')).toMatchObject({ status: 'downloaded', progress: 100 });
    expect(call('install')).toBe(true);
    expect(mock.install).toHaveBeenCalledWith(false, true);
  });

  it('keeps unsigned macOS installation manual', async () => {
    await load('darwin');
    expect(call('get-state').canInstallInApp).toBe(false);
    emit('update-available', { version: '0.4.0' });
    expect(await call('download')).toMatchObject({ status: 'unsupported', error: expect.stringContaining('macOS') });
    expect(call('install')).toBe(false);
    await call('open-release-page');
    expect(mock.openExternal).toHaveBeenCalledWith('https://github.com/GitWorkbench/workbench/releases');
  });

  it('preserves an installer failure reported through the error event and retries without downloading again', async () => {
    await load();
    emit('update-downloaded', { version: '1.0.0', releaseName: 'First release', releaseNotes: 'Release notes' });
    mock.install.mockImplementation(() => emit('error', new Error('Command pkexec exited with code 127')));
    expect(call('install')).toBe(false);
    expect(call('get-state')).toMatchObject({ status: 'error', errorStage: 'install', availableVersion: '1.0.0', progress: 100, releaseNotes: 'Release notes', error: expect.stringContaining('package matches your distribution') });
    expect(mock.download).not.toHaveBeenCalled();
    mock.install.mockImplementation(() => {});
    expect(call('install')).toBe(true);
    expect(call('get-state')).toMatchObject({ status: 'installing', error: undefined, errorStage: undefined });
    expect(call('install')).toBe(false);
    expect(mock.install).toHaveBeenCalledTimes(2);
    await call('check');
    expect(mock.check).not.toHaveBeenCalled();
  });

  it('keeps a thrown installation error actionable and distinguishes authorization cancellation', async () => {
    await load();
    emit('update-downloaded', { version: '1.0.0' });
    mock.install.mockImplementation(() => { throw new Error('Command pkexec exited with code 126'); });
    expect(call('install')).toBe(false);
    expect(call('get-state')).toMatchObject({ status: 'error', errorStage: 'install', error: expect.stringContaining('cancelled in the authorization dialog') });
  });

  it('does not check again while downloading and identifies download failures separately', async () => {
    await load();
    emit('download-progress', { percent: 25 });
    await call('check');
    expect(mock.check).not.toHaveBeenCalled();
    emit('error', new Error('Disk full'));
    expect(call('get-state')).toMatchObject({ status: 'error', errorStage: 'download', error: 'Disk full' });
    expect(call('install')).toBe(false);
  });

  it('reports unsupported development builds without scheduling a check', async () => {
    mock.app.isPackaged = false; await load();
    expect(await call('check')).toMatchObject({ status: 'unsupported', canInstallInApp: false });
    await vi.advanceTimersByTimeAsync(6000);
    expect(mock.check).not.toHaveBeenCalled();
  });

  it('does not schedule or perform checks on other platforms', async () => {
    await load('freebsd');
    expect(await call('check')).toMatchObject({ status: 'unsupported', error: expect.stringContaining('platform') });
    await vi.advanceTimersByTimeAsync(6000); expect(mock.check).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent checks and allows a later check', async () => {
    await load();
    let resolve!: (value: unknown) => void;
    mock.check.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const first = call('check'), second = call('check');
    expect(mock.check).toHaveBeenCalledTimes(1);
    resolve({ isUpdateAvailable: true, updateInfo: { version: '0.4.0' } });
    expect(await first).toEqual(await second);
    mock.check.mockResolvedValue({ isUpdateAvailable: false, updateInfo: { version: '0.3.0' } });
    expect(await call('check')).toMatchObject({ status: 'not-available', availableVersion: '0.3.0' });
    expect(mock.check).toHaveBeenCalledTimes(2);
  });

  it('preserves updater events rather than overriding them with the fallback', async () => {
    await load('linux', false);
    mock.check.mockImplementation(async () => {
      emit('update-not-available', { version: '0.3.0' });
      return { isUpdateAvailable: true, updateInfo: { version: 'wrong' } };
    });
    expect(await call('check')).toMatchObject({ status: 'not-available', availableVersion: '0.3.0' });
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('reports an empty provider response', async () => {
    await load(); mock.check.mockResolvedValue(null);
    expect(await call('check')).toMatchObject({ status: 'error', error: expect.stringContaining('did not return a result') });
  });

  it.each([
    [undefined, undefined], ['', undefined], ['   ', undefined],
    [[{ version: '0.4.0', note: 'First' }, 'Second', { note: 'Third' }, { version: '0.3.9' }], 'v0.4.0\nFirst\n\nSecond\n\nThird\n\nv0.3.9'],
    [[{ note: '' }, ''], undefined]
  ])('normalizes release notes %#', async (releaseNotes, expected) => {
    await load(); emit('update-available', { version: '0.4.0', releaseNotes });
    expect(call('get-state').releaseNotes).toBe(expected);
  });
});

describe('useful update errors', () => {
  it.each([
    [new Error('Cannot find latest-linux.yml in the latest release artifacts'), /missing latest-linux.yml/],
    [Object.assign(new Error('bad feed'), { code: 'ERR_UPDATER_INVALID_RELEASE_FEED' }), /release feed/],
    [new Error('Unable to find latest version on GitHub'), /release feed/],
    [new Error('HttpError: 406'), /release feed/],
    [new Error('spawn pkexec ENOENT'), /installation helper is unavailable/],
    [new Error('Offline\n Headers: { secret: "hidden" }'), /^Offline$/],
    ['Network unavailable', /^Network unavailable$/],
    [null, /Unknown update error/],
    [new Error('x'.repeat(400)), /^x{317}…$/]
  ])('sanitizes an error without dumping response headers %#', async (error, expected) => {
    await load(); mock.check.mockRejectedValue(error);
    expect(await call('check')).toMatchObject({ status: 'error', error: expect.stringMatching(expected) });
    expect(call('get-state').error).not.toContain('secret');
  });

  it('handles download failures and background error events', async () => {
    await load(); emit('update-available', { version: '0.4.0' });
    mock.download.mockRejectedValue(new Error('Disk full'));
    expect(await call('download')).toMatchObject({ status: 'error', error: 'Disk full' });
    emit('error', new Error('Offline'));
    expect(call('get-state')).toMatchObject({ status: 'error', error: 'Offline' });
  });
});
