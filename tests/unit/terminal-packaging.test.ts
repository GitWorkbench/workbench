import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../../package.json';

const require = createRequire(import.meta.url);
const ptyRoot = path.dirname(require.resolve('node-pty/package.json'));
const universalRequire = createRequire(require.resolve('@electron/universal'));
const { minimatch } = universalRequire('minimatch');
const { prepareTerminal } = require('../../scripts/prepare-terminal.cjs');

describe('portable Node-API terminal packaging', () => {
  it('keeps installed Node-API binaries instead of invoking an Electron-ABI rebuild', () => {
    expect(manifest.build.npmRebuild).toBe(false);
    expect(manifest.build.asarUnpack).toContain('node_modules/node-pty/**');
    expect(manifest.scripts['verify:terminal']).toBe('node scripts/check-terminal.cjs');
    expect('predev' in manifest.scripts).toBe(false); expect('prestart' in manifest.scripts).toBe(false);
  });
  it.each([['x64', 0x01000007], ['arm64', 0x0100000c]])('retains the %s Darwin module and executable helper in universal builds', (arch, cpu) => {
    for (const name of ['pty.node', 'spawn-helper']) {
      const relative = `Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-${arch}/${name}`;
      expect(minimatch(relative, manifest.build.mac.x64ArchFiles, { matchBase: true })).toBe(true);
      const bytes = readFileSync(path.join(ptyRoot, 'prebuilds', `darwin-${arch}`, name));
      expect(bytes.readUInt32LE(0)).toBe(0xfeedfacf); expect(bytes.readUInt32LE(4)).toBe(cpu);
    }
  });
  it('limits the universal exception to the terminal’s own architecture-specific prebuilds', () => {
    for (const relative of ['Contents/MacOS/Git Workbench', 'Contents/Resources/app.asar.unpacked/node_modules/other/pty.node', 'Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node']) {
      expect(minimatch(relative, manifest.build.mac.x64ArchFiles, { matchBase: true })).toBe(false);
    }
  });
  it('includes Windows ConPTY modules and its runtime library for the released x64 installer', () => {
    for (const name of ['conpty.node', 'conpty_console_list.node', 'conpty/conpty.dll']) {
      expect(readFileSync(path.join(ptyRoot, 'prebuilds', 'win32-x64', name)).subarray(0, 2).toString()).toBe('MZ');
    }
  });
  it('checks the actual Electron runtime before all three platform packaging steps', () => {
    const workflow = readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');
    const verifySteps = workflow.match(/run: npm run verify:terminal/g) || [];
    expect(verifySteps).toHaveLength(3);
    expect(existsSync(path.resolve('scripts/check-terminal.cjs'))).toBe(true);
  });
  it('restores the executable permission of both macOS helpers before packaging', () => {
    expect(manifest.scripts.postinstall).toBe('node scripts/prepare-terminal.cjs');
    const root = mkdtempSync(path.join(os.tmpdir(), 'workbench-terminal-package-'));
    try {
      for (const arch of ['x64', 'arm64']) {
        const directory = path.join(root, 'prebuilds', `darwin-${arch}`);
        mkdirSync(directory, { recursive: true });
        writeFileSync(path.join(directory, 'spawn-helper'), 'fixture', { mode: 0o644 });
      }
      prepareTerminal(root);
      prepareTerminal(root);
      for (const arch of ['x64', 'arm64']) {
        const helper = path.join(root, 'prebuilds', `darwin-${arch}`, 'spawn-helper');
        expect(readFileSync(helper, 'utf8')).toBe('fixture');
        // Windows does not implement POSIX executable permissions.
        if (process.platform !== 'win32') expect(statSync(helper).mode & 0o777).toBe(0o755);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('fails installation if an expected helper is missing instead of shipping a broken terminal', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'workbench-missing-helper-'));
    try { expect(() => prepareTerminal(root)).toThrow(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('Electron terminal smoke check lifecycle', () => {
  const source = readFileSync(path.resolve('scripts/check-terminal.cjs'), 'utf8');
  function simulate(platform = 'win32', runtime = true, childResult = { status: 0 } as object) {
    let data = (_value: string) => {}; let exited = (_event: { exitCode: number }) => {};
    let expired = () => {};
    const terminal = { kill: vi.fn(), onData: vi.fn(callback => { data = callback; }), onExit: vi.fn(callback => { exited = callback; }) };
    const spawn = vi.fn(() => terminal); const spawnSync = vi.fn(() => childResult);
    const processMock = { argv: runtime ? ['--runtime'] : [], platform, arch: 'x64', env: {}, versions: { electron: '44.4.5' }, exit: vi.fn(), exitCode: undefined, stdout: { write: vi.fn((_text, callback) => callback()) } };
    const consoleMock = { error: vi.fn(), log: vi.fn() };
    const clear = vi.fn();
    runInNewContext(source, {
      require: (name: string) => ({ 'node:os': { tmpdir: () => '/tmp' }, 'node-pty': { spawn }, 'node:child_process': { spawnSync }, electron: '/electron' })[name],
      process: processMock, console: consoleMock, __filename: '/check-terminal.cjs',
      setTimeout: (callback: () => void) => { expired = callback; return 1; }, clearTimeout: clear
    });
    return { processMock, consoleMock, spawn, spawnSync, terminal, clear, data: (value: string) => data(value), exited: (exitCode: number) => exited({ exitCode }), expired: () => expired() };
  }
  it.each(['win32', 'darwin', 'linux'])('checks shell output and explicitly exits the disposable %s verifier', platform => {
    const check = simulate(platform);
    expect(check.spawn.mock.calls[0][0]).toBe(platform === 'win32' ? 'powershell.exe' : '/bin/sh');
    check.data('GIT_WORKBENCH_'); check.data('PTY_OK'); check.exited(0);
    expect(check.clear).toHaveBeenCalled();
    expect(check.processMock.stdout.write).toHaveBeenCalled();
    expect(check.processMock.exit).toHaveBeenCalledWith(0);
  });
  it('rejects a successful shell that never produced the marker and a failed shell with the marker', () => {
    const missing = simulate(); missing.exited(0); expect(missing.processMock.exit).toHaveBeenCalledWith(1);
    const failed = simulate(); failed.data('GIT_WORKBENCH_PTY_OK'); failed.exited(1); expect(failed.processMock.exit).toHaveBeenCalledWith(1);
  });
  it('kills a stalled shell and fails instead of leaving a CI process alive', () => {
    const check = simulate(); check.expired();
    expect(check.terminal.kill).toHaveBeenCalled(); expect(check.processMock.exit).toHaveBeenCalledWith(1);
  });
  it('propagates Electron process failure and enforces a bounded runtime', () => {
    const check = simulate('linux', false, { status: 7 });
    expect(check.processMock.exitCode).toBe(7);
    expect(check.spawnSync.mock.calls[0][2]).toMatchObject({ timeout: 15_000, env: { ELECTRON_RUN_AS_NODE: '1' } });
    const signal = simulate('linux', false, { status: null }); expect(signal.processMock.exitCode).toBe(1);
    expect(() => simulate('linux', false, { error: new Error('runtime unavailable') })).toThrow('runtime unavailable');
  });
});
