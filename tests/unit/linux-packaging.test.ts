import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const { buildLinux, verifyLinuxRelease } = require('../../scripts/build-linux.cjs');
const { archPackageName } = require('../../scripts/arch-package.cjs');

let project: string;
const digest = (data: string) => createHash('sha512').update(data).digest('base64');
const nativeArches: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64', armv7l: 'armv7l', ia32: 'i686' };
// Compression is the external tool boundary; native package validation covers
// the real XZ-to-Zstandard pipeline separately.
async function fakeArchPackage(source: string, arch: string) {
  const name = archPackageName(`pkgname = git-workbench\npkgver = 1.2.3-1\narch = ${nativeArches[arch]}\n`, arch);
  const destination = path.join(path.dirname(source), name);
  await fs.writeFile(destination, Buffer.concat([Buffer.from('28b52ffd', 'hex'), await fs.readFile(source)]));
  return destination;
}
const buildOptions = (builder = fakeBuilder()) => ({ project, builder, packageArch: fakeArchPackage });
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-linux-packaging-'));
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ version: '1.2.3' }));
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });

function fakeBuilder(options: { wrongMarker?: boolean; wrongFeed?: boolean; fail?: boolean } = {}) {
  const markers: { target: string; marker: string }[] = [];
  return {
    markers,
    Arch: { x64: 'x64', arm64: 'arm64', armv7l: 'armv7l', ia32: 'ia32' },
    Platform: { LINUX: { createTarget: (target: string, arch: string) => ({ target, arch }) } },
    build: vi.fn(async input => {
      const { target, arch } = input.targets;
      const output = input.config.directories.output;
      const resources = path.join(output, 'linux-unpacked', 'resources');
      await fs.mkdir(resources, { recursive: true });
      await fs.writeFile(path.join(resources, 'app-update.yml'), 'provider: github');
      await fs.writeFile(path.join(resources, 'package-type'), 'rpm');
      await input.config.afterPack({ appOutDir: path.dirname(resources), packager: { getResourcesDir: () => resources } });
      markers.push({ target, marker: await fs.readFile(path.join(resources, 'package-type'), 'utf8').catch(() => '') });
      if (options.fail) throw new Error('Packaging failed');
      if (options.wrongMarker) await fs.writeFile(path.join(resources, 'package-type'), 'incorrect');
      const data = `${target}-${arch}-archive`;
      const name = `git-workbench-1.2.3-${arch}.${target}`;
      await fs.writeFile(path.join(output, name), data);
      if (target === 'AppImage') {
        const suffix = arch === 'x64' ? '' : `-${arch === 'armv7l' ? 'arm' : arch}`;
        await fs.writeFile(path.join(output, `latest-linux${suffix}.yml`), yaml.dump({ version: '1.2.3', files: [{ url: name, sha512: options.wrongFeed ? 'incorrect' : digest(data), size: Buffer.byteLength(data), blockMapSize: 123 }] }));
        await fs.writeFile(path.join(output, `${name}.blockmap`), 'blockmap');
      }
      return [path.join(output, name)];
    })
  };
}

describe('isolated Linux packaging and updater feeds', () => {
  it('builds each format in its own directory, retains the correct package marker and merges all four formats', async () => {
    const builder = fakeBuilder();
    await buildLinux(['--x64'], buildOptions(builder));
    expect(builder.markers).toEqual([{ target: 'AppImage', marker: '' }, { target: 'deb', marker: 'deb' }, { target: 'rpm', marker: 'rpm' }, { target: 'pacman', marker: 'pacman' }]);
    expect(new Set(builder.build.mock.calls.map(([input]) => input.config.directories.output)).size).toBe(4);
    expect(builder.build.mock.calls.every(([input]) => input.publish === 'never')).toBe(true);
    const output = path.join(project, 'dist');
    const feed = yaml.load(await fs.readFile(path.join(output, 'latest-linux.yml'), 'utf8'));
    expect(feed.files.map((file: { url: string }) => file.url)).toEqual(['git-workbench-1.2.3-x64.AppImage', 'git-workbench-1.2.3-x64.deb', 'git-workbench-1.2.3-x64.rpm', 'git-workbench-1.2.3-1-x86_64.pkg.tar.zst']);
    expect(feed.files[0].blockMapSize).toBe(123);
    const pacmanBuild = builder.build.mock.calls.find(([input]) => input.targets.target === 'pacman');
    expect(pacmanBuild?.[0].config.pacman).toEqual({ compression: 'xz' });
    await expect(verifyLinuxRelease(output, '1.2.3')).resolves.toBeUndefined();
    expect((await fs.readdir(output)).some(name => name.startsWith('.linux-build-'))).toBe(false);
    expect((await fs.readdir(output)).some(name => name.endsWith('.pacman'))).toBe(false);
  });

  it('generates Pacman metadata even when the builder does not supply a Pacman feed', async () => {
    await buildLinux(['--x64', '--target=pacman'], buildOptions());
    const output = path.join(project, 'dist');
    await expect(verifyLinuxRelease(output, '1.2.3', ['x64'], ['pacman'])).resolves.toBeUndefined();
  });

  it('keeps architecture feeds and installer names separate', async () => {
    await buildLinux(['--x64', '--arm64'], buildOptions());
    await expect(verifyLinuxRelease(path.join(project, 'dist'), '1.2.3', ['x64', 'arm64'])).resolves.toBeUndefined();
    expect(await fs.readdir(path.join(project, 'dist'))).toEqual(expect.arrayContaining(['git-workbench-1.2.3-1-x86_64.pkg.tar.zst', 'git-workbench-1.2.3-1-aarch64.pkg.tar.zst']));
  });

  it.each(['--publish=always', '--target=unknown'])('rejects unsupported packaging arguments %s', async arg => {
    const builder = fakeBuilder();
    await expect(buildLinux([arg], buildOptions(builder))).rejects.toThrow('Unsupported Linux build option');
    expect(builder.build).not.toHaveBeenCalled();
  });

  it.each([{ wrongMarker: true }, { wrongFeed: true }, { fail: true }])('fails safely without exposing incomplete artifacts: %j', async options => {
    await expect(buildLinux(['--x64'], buildOptions(fakeBuilder(options)))).rejects.toThrow();
    expect(await fs.readdir(path.join(project, 'dist'))).toEqual([]);
  });

  it('does not expose incomplete outputs when Arch conversion fails', async () => {
    await expect(buildLinux(['--x64'], { ...buildOptions(), packageArch: async () => { throw new Error('zstd failed'); } })).rejects.toThrow('zstd failed');
    expect(await fs.readdir(path.join(project, 'dist'))).toEqual([]);
  });

  it.each(['contents', 'version', 'missing-format', 'path', 'fallback', 'legacy-arch', 'fake-zstd'])('rejects corrupt or incomplete release outputs: %s', async failure => {
    await buildLinux(['--x64'], buildOptions());
    const output = path.join(project, 'dist'), feedPath = path.join(output, 'latest-linux.yml');
    const feed = yaml.load(await fs.readFile(feedPath, 'utf8'));
    if (failure === 'contents') await fs.writeFile(path.join(output, feed.files[0].url), 'corrupt archive');
    else if (failure === 'version') feed.version = '0.0.0';
    else if (failure === 'missing-format') feed.files.pop();
    else if (failure === 'path') feed.files[0].url = '../outside.AppImage';
    else if (failure === 'legacy-arch') feed.files.push({ url: 'old.pacman' });
    else if (failure === 'fake-zstd') {
      const file = feed.files.find((entry: { url: string }) => entry.url.endsWith('.pkg.tar.zst'));
      const data = 'XZ archive renamed to Zstandard';
      await fs.writeFile(path.join(output, file.url), data);
      file.sha512 = digest(data);
      file.size = Buffer.byteLength(data);
    }
    else feed.path = 'missing.AppImage';
    await fs.writeFile(feedPath, yaml.dump(feed));
    await expect(verifyLinuxRelease(output, '1.2.3')).rejects.toThrow();
  });
});
