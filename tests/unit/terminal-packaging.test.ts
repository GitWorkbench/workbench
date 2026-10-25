import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

const require = createRequire(import.meta.url);
const ptyRoot = path.dirname(require.resolve('node-pty/package.json'));
const universalRequire = createRequire(require.resolve('@electron/universal'));
const { minimatch } = universalRequire('minimatch');

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
});
