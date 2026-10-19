'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');

const execute = promisify(execFile);
const XZ_MAGIC = Buffer.from('fd377a585a00', 'hex');
const ZSTD_MAGIC = Buffer.from('28b52ffd', 'hex');
const ARCH_NAMES = { x64: 'x86_64', arm64: 'aarch64', armv7l: 'armv7l', ia32: 'i686' };

function archPackageName(info, expectedArch) {
  function field(name) {
    const values = [...info.matchAll(new RegExp(`^${name}[ \\t]*=[ \\t]*(.+)$`, 'gm'))];
    if (values.length !== 1) throw new Error(`Arch package must contain exactly one ${name} field.`);
    return values[0][1].trim();
  }
  const name = field('pkgname');
  const version = field('pkgver').replace(/^\d+:/, '');
  const arch = field('arch');
  if (!/^[a-z0-9][a-z0-9@._+-]*$/.test(name) || !/^[A-Za-z0-9._+~-]+-\d+(?:\.\d+)?$/.test(version)) throw new Error('Arch package has an invalid name, version or package release.');
  if (!ARCH_NAMES[expectedArch] || arch !== ARCH_NAMES[expectedArch]) throw new Error(`Arch package architecture ${arch} does not match ${expectedArch}.`);
  return `${name}-${version}-${arch}.pkg.tar.zst`;
}

async function verifyMagic(file, expected, label) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== expected.length || !buffer.equals(expected)) throw new Error(`${path.basename(file)} is not a ${label} archive.`);
  } finally {
    await handle.close();
  }
}

const verifyZstdArchive = file => verifyMagic(file, ZSTD_MAGIC, 'Zstandard');

function completion(child, command) {
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  return new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`Could not start ${command}: ${error.message}`)));
    child.once('close', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`${command} failed (${signal || code}): ${stderr.trim()}`)));
  });
}

async function createArchPackage(source, arch) {
  await verifyMagic(source, XZ_MAGIC, 'XZ');
  const { stdout } = await execute('bsdtar', ['-xOf', source, '.PKGINFO'], { encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 30_000 });
  const destination = path.join(path.dirname(source), archPackageName(stdout, arch));
  // Never replace a previous package if compression fails or the path exists.
  const output = await fs.open(destination, 'wx');
  let decoder, encoder, timer;
  const tasks = [];
  try {
    decoder = spawn('xz', ['--decompress', '--stdout', '--', source], { stdio: ['ignore', 'pipe', 'pipe'] });
    tasks.push(completion(decoder, 'xz'));
    encoder = spawn('zstd', ['--compress', '-T2', '-10', '--quiet', '--stdout'], { stdio: ['pipe', 'pipe', 'pipe'] });
    tasks.push(completion(encoder, 'zstd'));
    // Preserve the tar payload byte for byte, including .PKGINFO and scripts.
    tasks.push(pipeline(decoder.stdout, encoder.stdin), pipeline(encoder.stdout, output.createWriteStream()));
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Arch package compression timed out.')), 10 * 60_000);
      timer.unref();
    });
    await Promise.race([Promise.all(tasks), timeout]);
    await verifyZstdArchive(destination);
    return destination;
  } catch (error) {
    decoder?.kill('SIGKILL');
    encoder?.kill('SIGKILL');
    await Promise.allSettled(tasks);
    await output.close().catch(() => {});
    await fs.rm(destination, { force: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { archPackageName, createArchPackage, verifyZstdArchive };
