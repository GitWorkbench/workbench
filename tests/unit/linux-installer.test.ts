import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const installer = path.resolve('scripts/install-linux.sh');
const release = '1.3.1';
let root: string;
let bin: string;
let home: string;
let downloads: string;
let calls: string;

const sha512 = (content: string) => createHash('sha512').update(content).digest('base64');

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-installer-test-'));
  bin = path.join(root, 'bin');
  home = path.join(root, 'home with spaces');
  downloads = path.join(root, 'downloads');
  calls = path.join(root, 'calls.log');
  await fs.mkdir(bin, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(downloads, { recursive: true });
  await executable('curl', [
    "output=''",
    "url=''",
    'while (($#)); do',
    "  if [[ \"$1\" == '--output' ]]; then output=$2; shift 2; continue; fi",
    '  [[ \"$1\" == http* ]] && url=$1',
    '  shift',
    'done',
    "name=$(awk -F/ '{print $NF}' <<< \"$url\")",
    'source_file=\"$TEST_DOWNLOADS_DIR/$name\"',
    '[[ -f \"$source_file\" ]] || exit 22',
    'cp -- \"$source_file\" \"$output\"'
  ].join('\n'));
  await executable('uname', 'echo \"$TEST_MACHINE_ARCH\"');
  await executable('id', 'echo \"$TEST_UID\"');
  await executable('sudo', 'echo \"sudo $*\" >> \"$INSTALLER_CALL_LOG\"');
  for (const name of ['apt-get', 'apt', 'dnf', 'yum', 'zypper', 'pacman']) {
    await executable(name, 'echo \"' + name + ' $*\" >> \"$INSTALLER_CALL_LOG\"');
  }
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function executable(name: string, body: string) {
  const file = path.join(bin, name);
  await fs.writeFile(file, '#!/usr/bin/env bash\nset -eu\n' + body + '\n');
  await fs.chmod(file, 0o755);
}

async function configureDistro(id: string, idLike = '') {
  const osRelease = path.join(root, 'os-release');
  await fs.writeFile(osRelease, 'ID=' + id + '\nID_LIKE=\"' + idLike + '\"\n');
  return osRelease;
}

async function addAsset(name: string, content: string) {
  await fs.writeFile(path.join(downloads, name), content);
  return { name, checksum: sha512(content) };
}

async function addFeed(feedName: string, entries: Array<{ name: string; checksum: string }>) {
  const files = entries.map(entry => '  - url: ' + entry.name + '\n    sha512: ' + entry.checksum).join('\n');
  await fs.writeFile(path.join(downloads, feedName), 'version: ' + release + '\nfiles:\n' + files + '\n');
}

async function run(options: { id: string; idLike?: string; arch?: string }) {
  const osRelease = await configureDistro(options.id, options.idLike);
  return execFileSync('bash', [installer], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin + ':' + (process.env.PATH ?? ''),
      HOME: home,
      TMPDIR: root,
      INSTALLER_CALL_LOG: calls,
      TEST_DOWNLOADS_DIR: downloads,
      TEST_MACHINE_ARCH: options.arch ?? 'x86_64',
      TEST_UID: '1000',
      GIT_WORKBENCH_OS_RELEASE_FILE: osRelease
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function runFailure(options: { id: string; idLike?: string; arch?: string }) {
  try {
    await run(options);
    throw new Error('Expected the installer to fail');
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected the installer to fail') throw error;
    return error as NodeJS.ErrnoException & { stderr?: Buffer | string };
  }
}

async function callLog() {
  return fs.readFile(calls, 'utf8').catch(() => '');
}

describe('Linux one-line installer', () => {
  it('selects and checksum-verifies the Debian package before asking apt to install it', async () => {
    const appImage = await addAsset('git-workbench-' + release + '-x64.AppImage', 'appimage archive');
    const deb = await addAsset('git-workbench-' + release + '-x64.deb', 'debian archive');
    await addFeed('latest-linux.yml', [appImage, deb]);

    const output = await run({ id: 'ubuntu', idLike: 'debian' });

    expect(output).toContain('Verified Git Workbench 1.3.1 for x86_64 with SHA-512.');
    expect(await callLog()).toMatch(/sudo apt-get install .*\.deb/);
  });

  it('uses Fedora dnf for an RPM build', async () => {
    const rpm = await addAsset('git-workbench-' + release + '-x64.rpm', 'rpm archive');
    await addFeed('latest-linux.yml', [rpm]);

    await run({ id: 'fedora' });

    expect(await callLog()).toMatch(/sudo dnf install .*\.rpm/);
  });

  it('uses openSUSE zypper for an RPM build', async () => {
    const rpm = await addAsset('git-workbench-' + release + '-x64.rpm', 'rpm archive');
    await addFeed('latest-linux.yml', [rpm]);

    await run({ id: 'opensuse-tumbleweed' });

    expect(await callLog()).toMatch(/sudo zypper install .*\.rpm/);
  });

  it('selects the versioned Zstandard package for Arch and installs with pacman', async () => {
    const pacman = await addAsset('git-workbench-' + release + '-3-x86_64.pkg.tar.zst', 'zstandard package');
    await addFeed('latest-linux.yml', [pacman]);

    await run({ id: 'cachyos' });

    expect(await callLog()).toMatch(/sudo pacman -U .*\.pkg\.tar\.zst/);
  });

  it('installs a verified AppImage per-user on an unrecognized distribution', async () => {
    const appImage = await addAsset('git-workbench-' + release + '-x64.AppImage', 'portable appimage');
    await addFeed('latest-linux.yml', [appImage]);

    const output = await run({ id: 'custom-linux' });
    const installed = path.join(home, '.local/opt/git-workbench/GitWorkbench.AppImage');
    const desktopFile = path.join(home, '.local/share/applications/git-workbench.desktop');

    expect(output).toContain('Installed the AppImage for this user at ' + installed);
    expect(await fs.readFile(installed, 'utf8')).toBe('portable appimage');
    expect(await fs.realpath(path.join(home, '.local/bin/git-workbench'))).toBe(installed);
    expect(await fs.readFile(desktopFile, 'utf8')).toContain('Exec=\"' + installed + '\" %U');
    expect(await callLog()).toBe('');
  });

  it('refuses to install an artifact whose checksum does not match release metadata', async () => {
    const deb = await addAsset('git-workbench-' + release + '-x64.deb', 'debian archive');
    await addFeed('latest-linux.yml', [{ ...deb, checksum: sha512('different archive') }]);

    const error = await runFailure({ id: 'debian' });

    expect(String(error.stderr)).toContain('SHA-512 verification failed');
    expect(await callLog()).toBe('');
  });

  it('reports when no release feed exists for the current CPU architecture', async () => {
    const error = await runFailure({ id: 'ubuntu', arch: 'aarch64' });

    expect(String(error.stderr)).toContain('No stable Linux release metadata is published for aarch64 yet');
    expect(await callLog()).toBe('');
  });

  it('does not substitute an AppImage when the selected distribution package is missing', async () => {
    const appImage = await addAsset('git-workbench-' + release + '-x64.AppImage', 'portable appimage');
    await addFeed('latest-linux.yml', [appImage]);

    const error = await runFailure({ id: 'ubuntu' });

    expect(String(error.stderr)).toContain('No matching deb installer');
    expect(await callLog()).toBe('');
  });

  it('rejects non-release version values in the updater metadata', async () => {
    const deb = await addAsset('git-workbench-' + release + '-x64.deb', 'debian archive');
    await addFeed('latest-linux.yml', [deb]);
    const feed = await fs.readFile(path.join(downloads, 'latest-linux.yml'), 'utf8');
    await fs.writeFile(path.join(downloads, 'latest-linux.yml'), feed.replace(release, 'latest'));

    const error = await runFailure({ id: 'debian' });

    expect(String(error.stderr)).toContain('invalid version');
    expect(await callLog()).toBe('');
  });

  it('uses distribution ancestry to select the package manager', async () => {
    const deb = await addAsset('git-workbench-' + release + '-x64.deb', 'debian archive');
    await addFeed('latest-linux.yml', [deb]);

    await run({ id: 'mintlike', idLike: 'debian ubuntu' });

    expect(await callLog()).toMatch(/sudo apt-get install .*\.deb/);
  });
});
