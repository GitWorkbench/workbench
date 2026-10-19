#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const yaml = require('js-yaml');
const { createArchPackage, verifyZstdArchive } = require('./arch-package.cjs');

const TARGETS = ['AppImage', 'deb', 'rpm', 'pacman'];
const ARCHES = ['x64', 'arm64', 'armv7l', 'ia32'];
const packageSuffix = target => target === 'pacman' ? '.pkg.tar.zst' : `.${target}`;

async function checksum(file) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}

async function verifyLinuxRelease(output, version, arches = ['x64'], targets = TARGETS) {
  for (const arch of arches) {
    const suffix = arch === 'x64' ? '' : `-${arch === 'armv7l' ? 'arm' : arch}`;
    const feed = yaml.load(await fs.readFile(path.join(output, `latest-linux${suffix}.yml`), 'utf8'));
    if (feed?.version !== version || !Array.isArray(feed.files)) throw new Error('Linux update feed has an incorrect version or file list.');
    if (feed.files.some(file => typeof file?.url !== 'string' || !TARGETS.some(target => file.url.endsWith(packageSuffix(target))))) throw new Error('Linux update feed contains an unsupported installer format. Arch installers must use .pkg.tar.zst.');
    for (const target of targets) {
      if (feed.files.filter(file => typeof file.url === 'string' && file.url.endsWith(packageSuffix(target))).length !== 1) throw new Error(`Linux update feed must contain one ${target} installer.`);
    }
    for (const file of feed.files) {
      if (typeof file.url !== 'string' || file.url !== path.basename(file.url) || file.url.includes('\\') || /\s/.test(file.url)) throw new Error('Linux update feed contains an invalid installer filename.');
      const installer = path.join(output, file.url);
      if (file.url.endsWith('.pkg.tar.zst')) await verifyZstdArchive(installer);
      if ((await fs.stat(installer)).size !== file.size || await checksum(installer) !== file.sha512) throw new Error(`Linux update feed does not match ${file.url}.`);
    }
    if (!feed.files.some(file => file.url === feed.path && file.sha512 === feed.sha512)) throw new Error('Linux update feed fallback path does not match its files.');
  }
}

async function buildLinux(args = [], options = {}) {
  const project = options.project || path.resolve(__dirname, '..');
  const requestedArches = args.filter(arg => ARCHES.some(arch => arg === `--${arch}`)).map(arg => arg.slice(2));
  const selectedTargets = args.filter(arg => arg.startsWith('--target=')).map(arg => arg.slice('--target='.length));
  const unknown = args.find(arg => !ARCHES.some(arch => arg === `--${arch}`) && !(arg.startsWith('--target=') && TARGETS.includes(arg.slice('--target='.length))));
  if (unknown) throw new Error(`Unsupported Linux build option: ${unknown}`);
  const arches = [...new Set(requestedArches.length ? requestedArches : [process.arch])];
  if (arches.some(arch => !ARCHES.includes(arch))) throw new Error(`Unsupported Linux architecture: ${arches.join(', ')}`);
  const targets = [...new Set(selectedTargets.length ? selectedTargets : TARGETS)];
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
  const builder = options.builder || require('electron-builder');
  const output = path.join(project, 'dist');
  await fs.mkdir(output, { recursive: true });
  const staging = await fs.mkdtemp(path.join(output, '.linux-build-'));
  const artifacts = [];
  const feeds = [];

  try {
    for (const arch of arches) {
      const files = [];
      let appImageInfo;
      for (const target of targets) {
        // FPM writes package-type into linux-unpacked. Sharing that directory
        // between targets can put an RPM marker into a Pacman or Debian package.
        const targetOutput = path.join(staging, `${arch}-${target}`);
        let packedResources;
        await builder.build({
          projectDir: project,
          targets: builder.Platform.LINUX.createTarget(target, builder.Arch[arch]),
          publish: 'never',
          config: {
            directories: { output: targetOutput },
            ...(target === 'pacman' ? { pacman: { compression: 'xz' } } : {}),
            afterPack: async context => {
              packedResources = context.packager.getResourcesDir(context.appOutDir);
              const marker = path.join(packedResources, 'package-type');
              if (target === 'AppImage') await fs.rm(marker, { force: true });
              else await fs.writeFile(marker, target);
            }
          }
        });
        if (!packedResources) throw new Error(`The ${target} package did not run its packaging hook.`);
        const marker = await fs.readFile(path.join(packedResources, 'package-type'), 'utf8').catch(error => {
          if (error.code === 'ENOENT') return '';
          throw error;
        });
        if (marker.trim() !== (target === 'AppImage' ? '' : target)) throw new Error(`Incorrect updater package-type for ${target}: ${marker}`);
        await fs.access(path.join(packedResources, 'app-update.yml'));
        const names = await fs.readdir(targetOutput);
        const packages = names.filter(name => name.endsWith(`.${target}`));
        if (packages.length !== 1) throw new Error(`Expected one ${target} installer, found ${packages.length}.`);
        // Builder 25 emits an XZ-compressed .pacman intermediary. Only the
        // standard Zstandard archive is copied to dist and advertised to clients.
        let artifact = path.join(targetOutput, packages[0]);
        if (target === 'pacman') artifact = await (options.packageArch || createArchPackage)(artifact, arch);
        const name = path.basename(artifact);
        if (/\s/.test(name)) throw new Error(`Installer names must not contain whitespace: ${name}`);
        const info = { url: name, sha512: await checksum(artifact), size: (await fs.stat(artifact)).size };
        if (target === 'AppImage') {
          const suffix = arch === 'x64' ? '' : `-${arch === 'armv7l' ? 'arm' : arch}`;
          const generated = yaml.load(await fs.readFile(path.join(targetOutput, `latest-linux${suffix}.yml`), 'utf8'));
          const generatedFile = generated.files?.find(file => file.url === name);
          if (generated.version !== manifest.version || generatedFile?.sha512 !== info.sha512) throw new Error('AppImage updater metadata does not match its installer.');
          Object.assign(info, generatedFile);
          appImageInfo = generated;
        }
        files.push(info);
        artifacts.push({ source: artifact, name });
        for (const blockmap of names.filter(name => name.endsWith('.blockmap'))) artifacts.push({ source: path.join(targetOutput, blockmap), name: blockmap });
      }
      // Builder 25 doesn't generate Pacman update entries. Include every built
      // format, with hashes from the actual archives, in one per-architecture feed.
      const first = files[0];
      const suffix = arch === 'x64' ? '' : `-${arch === 'armv7l' ? 'arm' : arch}`;
      feeds.push({ name: `latest-linux${suffix}.yml`, contents: yaml.dump({ ...appImageInfo, version: manifest.version, files, path: first.url, sha512: first.sha512, releaseDate: new Date().toISOString() }) });
    }
    const names = artifacts.map(artifact => artifact.name);
    if (new Set(names).size !== names.length) throw new Error('Linux build outputs have conflicting filenames across architectures.');
    for (const artifact of artifacts) await fs.copyFile(artifact.source, path.join(output, artifact.name));
    for (const feed of feeds) await fs.writeFile(path.join(output, feed.name), feed.contents);
    await verifyLinuxRelease(output, manifest.version, arches, targets);
    console.log(`Linux packages ready in ${output}: ${names.join(', ')}`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

module.exports = { buildLinux, verifyLinuxRelease };
if (require.main === module) (process.argv[2] === '--verify-only'
  ? verifyLinuxRelease(path.resolve(__dirname, '../dist'), require('../package.json').version)
  : buildLinux(process.argv.slice(2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
