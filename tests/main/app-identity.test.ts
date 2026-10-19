import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import packageJson from '../../package.json';
import packageLock from '../../package-lock.json';

const mock = vi.hoisted(() => ({
  getPath: vi.fn(), setName: vi.fn(), setPath: vi.fn(), setAboutPanelOptions: vi.fn(), setDesktopName: vi.fn(),
  buildMenu: vi.fn(() => ({ id: 'native-menu' })), setMenu: vi.fn()
}));
vi.mock('electron', () => ({ app: mock, Menu: { buildFromTemplate: mock.buildMenu, setApplicationMenu: mock.setMenu } }));
import { configureAppIdentity, configureAppMenu } from '../../src/main/app-identity';
import { APP_NAME } from '../../src/shared/appIdentity';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  mock.getPath.mockReset().mockReturnValue(path.resolve('fake-app-data'));
  mock.setName.mockClear(); mock.setPath.mockClear(); mock.setAboutPanelOptions.mockClear();
  mock.setDesktopName.mockClear(); mock.buildMenu.mockClear(); mock.setMenu.mockClear();
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
});
afterEach(() => { Object.defineProperty(process, 'platform', originalPlatform); });

describe('Git Workbench identity', () => {
  it.each(['linux', 'darwin', 'win32'])('uses Git Workbench for the display name, profile and keychain on %s', platform => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    configureAppIdentity();
    expect(APP_NAME).toBe('Git Workbench');
    expect(mock.setName).toHaveBeenCalledExactlyOnceWith('Git Workbench');
    expect(mock.getPath).toHaveBeenCalledExactlyOnceWith('appData');
    const profile = path.resolve('fake-app-data', 'Git Workbench');
    expect(fs.mkdirSync).toHaveBeenCalledExactlyOnceWith(profile, { recursive: true });
    expect(mock.setPath.mock.calls).toEqual([['userData', profile], ['sessionData', profile]]);
    expect(mock.setAboutPanelOptions).toHaveBeenCalledExactlyOnceWith({ applicationName: 'Git Workbench' });
    expect(mock.setName.mock.invocationCallOrder[0]).toBeLessThan(mock.setPath.mock.invocationCallOrder[0]);
    if (platform === 'linux') expect(mock.setDesktopName).toHaveBeenCalledExactlyOnceWith('git-workbench.desktop');
    else expect(mock.setDesktopName).not.toHaveBeenCalled();
  });

  it('brands the macOS native menu', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    configureAppMenu();
    expect(mock.buildMenu).toHaveBeenCalledExactlyOnceWith([
      { label: 'Git Workbench', submenu: [
        { role: 'about', label: 'About Git Workbench' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide', label: 'Hide Git Workbench' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit', label: 'Quit Git Workbench' }
      ] },
      { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
    ]);
    expect(mock.setMenu).toHaveBeenCalledExactlyOnceWith({ id: 'native-menu' });
    expect(mock.setName).not.toHaveBeenCalled();
  });

  it.each(['linux', 'win32'])('preserves the native menu behavior on %s', platform => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    configureAppMenu();
    expect(mock.buildMenu).not.toHaveBeenCalled();
    expect(mock.setMenu).not.toHaveBeenCalled();
  });

  it('fails visibly if the app profile cannot be accessed', () => {
    vi.mocked(fs.mkdirSync).mockImplementationOnce(() => { throw new Error('Profile access denied'); });
    expect(configureAppIdentity).toThrow('Profile access denied');
    expect(mock.setPath).not.toHaveBeenCalled();
  });

  it('keeps manifest, lockfile, package and update identities aligned', () => {
    expect(packageJson.name).toBe('git-workbench');
    expect(packageLock.name).toBe(packageJson.name);
    expect(packageLock.packages[''].name).toBe(packageJson.name);
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageJson.build.productName).toBe(APP_NAME);
    expect(packageJson.build.appId).toBe('dev.gitworkbench.app');
    expect(packageJson.build).not.toHaveProperty('nsis.guid');
    expect(packageJson.build.publish).toMatchObject({ provider: 'github', owner: 'GitWorkbench', repo: 'workbench' });
    expect(packageJson.build.linux.executableName).toBe('git-workbench');
    expect(packageJson.build.linux.desktop.StartupWMClass).toBe('git-workbench');
    for (const target of ['deb', 'rpm', 'pacman'] as const) expect(packageJson.build[target].packageName).toBe('git-workbench');
    expect(packageJson.build.artifactName).toBe('git-workbench-${version}-${arch}.${ext}');
    expect(packageJson.build.win.artifactName).toBe('git-workbench-setup-${version}.${ext}');
  });
});
