import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { archPackageName, createArchPackage, verifyZstdArchive } = require('../../scripts/arch-package.cjs');
const metadata = 'pkgname = git-workbench\npkgver = 1.2.3-1\narch = x86_64\n';
let directory: string;

beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-arch-package-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe('standard Arch archive naming', () => {
  it.each([['x64', 'x86_64'], ['arm64', 'aarch64'], ['armv7l', 'armv7l'], ['ia32', 'i686']])('uses package metadata for %s filenames', (arch, native) => {
    expect(archPackageName(metadata.replace('x86_64', native), arch)).toBe(`git-workbench-1.2.3-1-${native}.pkg.tar.zst`);
  });

  it('preserves prerelease versions and package release numbers while omitting an epoch', () => {
    expect(archPackageName(metadata.replace('1.2.3-1', '2:1.2.3-beta.1-3.1'), 'x64')).toBe('git-workbench-1.2.3-beta.1-3.1-x86_64.pkg.tar.zst');
  });

  it.each(['pkgname', 'pkgver', 'arch'])('rejects missing or duplicated %s metadata', field => {
    const line = metadata.split('\n').find(value => value.startsWith(`${field} =`));
    expect(archPackageName.bind(null, metadata.split('\n').filter(value => !value.startsWith(`${field} =`)).join('\n'), 'x64')).toThrow(`exactly one ${field}`);
    expect(archPackageName.bind(null, `${metadata}${line}\n`, 'x64')).toThrow(`exactly one ${field}`);
  });

  it.each(['../git-workbench', 'git workbench', 'Git Workbench'])('rejects invalid package names: %s', name => {
    expect(() => archPackageName(metadata.replace('git-workbench', name), 'x64')).toThrow('invalid name');
  });

  it.each(['1.2.3', '../1.2.3-1', '1.2.3-unknown', '1.2.3-1/other'])('requires a safe version including a package release: %s', version => {
    expect(() => archPackageName(metadata.replace('1.2.3-1', version), 'x64')).toThrow('invalid name, version or package release');
  });

  it.each(['arm64', 'unknown'])('rejects mismatched or unknown build architectures: %s', arch => {
    expect(() => archPackageName(metadata, arch)).toThrow('does not match');
  });
});

describe('Arch compression format guards', () => {
  it('accepts the Zstandard frame header', async () => {
    const archive = path.join(directory, 'package.pkg.tar.zst');
    await fs.writeFile(archive, Buffer.from('28b52ffd', 'hex'));
    await expect(verifyZstdArchive(archive)).resolves.toBeUndefined();
  });

  it.each(['', '28b5', 'fd377a585a00'])('rejects empty, truncated and XZ archives even with a Zstandard filename: %s', async header => {
    const archive = path.join(directory, 'package.pkg.tar.zst');
    await fs.writeFile(archive, Buffer.from(header, 'hex'));
    await expect(verifyZstdArchive(archive)).rejects.toThrow('not a Zstandard archive');
  });

  it('rejects non-XZ builder output before starting external compression tools', async () => {
    const archive = path.join(directory, 'package.pacman');
    await fs.writeFile(archive, 'not an XZ archive');
    await expect(createArchPackage(archive, 'x64')).rejects.toThrow('not a XZ archive');
    expect(await fs.readdir(directory)).toEqual(['package.pacman']);
  });
});
