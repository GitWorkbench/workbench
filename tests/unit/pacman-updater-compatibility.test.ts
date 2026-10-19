import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CancellationToken, type UpdateInfo } from 'builder-util-runtime';
import { PacmanUpdater } from 'electron-updater/out/PacmanUpdater';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';

// Exercise the pinned updater's real file selection, cache and install command.
// Only HTTP and the privileged command runner are replaced; no installation runs.
class FeedPacmanUpdater extends PacmanUpdater {
  constructor(app: AppAdapter, private executor: ElectronHttpExecutor) {
    super(null, app);
    Object.defineProperty(this, 'httpExecutor', { value: executor });
    this.logger = null;
    this.autoInstallOnAppQuit = false;
  }

  downloadFeed(info: UpdateInfo) {
    const provider = new GenericProvider({ provider: 'generic', url: 'https://example.test/releases/v1.2.3/' }, this, {
      executor: this.executor, platform: 'linux', isUseMultipleRangeRequest: false
    });
    return this.doDownloadUpdate({ updateInfoAndProvider: { info, provider }, cancellationToken: new CancellationToken(), requestHeaders: {} });
  }
}

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-pacman-updater-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe('existing Pacman updater compatibility with standard Arch archives', () => {
  it.each(['x86_64', 'aarch64'])('selects the %s Zstandard archive from a mixed Linux feed and preserves its filename', async arch => {
    const config = path.join(directory, 'app-update.yml');
    await fs.writeFile(config, 'updaterCacheDirName: git-workbench-updater\n');
    const app: AppAdapter = {
      version: '1.0.0', name: 'Git Workbench', isPackaged: true, appUpdateConfigPath: config,
      userDataPath: directory, baseCachePath: directory,
      whenReady: async () => {}, quit: vi.fn(), relaunch: vi.fn(), onQuit: vi.fn()
    };
    const executor = new ElectronHttpExecutor();
    const data = Buffer.from('standard Arch package fixture');
    const sha512 = createHash('sha512').update(data).digest('base64');
    const download = vi.spyOn(executor, 'download').mockImplementation(async (_url, destination, options) => {
      await fs.writeFile(destination, data);
      options.onProgress?.({ total: data.length, transferred: data.length, percent: 100, delta: data.length, bytesPerSecond: data.length });
      return destination;
    });
    const updater = new FeedPacmanUpdater(app, executor);
    const progress = vi.fn(), downloaded = vi.fn();
    updater.on('download-progress', progress);
    updater.on('update-downloaded', downloaded);
    const name = `git-workbench-1.2.3-1-${arch}.pkg.tar.zst`;
    const info: UpdateInfo = {
      version: '1.2.3', releaseDate: '2026-10-19T00:00:00.000Z', path: 'git-workbench.AppImage', sha512,
      files: ['git-workbench.AppImage', 'git-workbench.deb', 'git-workbench.rpm', name].map(url => ({ url, sha512, size: data.length }))
    };
    const [cached] = await updater.downloadFeed(info);
    expect(download).toHaveBeenCalledWith(new URL(`https://example.test/releases/v1.2.3/${name}`), expect.any(String), expect.objectContaining({ sha512 }));
    expect(path.basename(cached)).toBe(name);
    expect(await fs.readFile(cached)).toEqual(data);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ percent: 100 }));
    expect(downloaded).toHaveBeenCalledWith(expect.objectContaining({ downloadedFile: cached, version: '1.2.3' }));
    expect(await updater.downloadFeed(info)).toEqual([cached]);
    expect(download).toHaveBeenCalledTimes(1);
    const command = vi.fn();
    PacmanUpdater.installWithCommandRunner(cached, command, { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    expect(command).toHaveBeenCalledExactlyOnceWith(['pacman', '-U', '--noconfirm', cached]);
    expect(app.quit).not.toHaveBeenCalled();
    expect(app.relaunch).not.toHaveBeenCalled();
  });
});
