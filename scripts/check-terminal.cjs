#!/usr/bin/env node
'use strict';

// node-pty uses Node-API. Verify it in the actual Electron runtime instead of
// rebuilding it with an Electron-ABI toolchain that can replace valid prebuilds.
if (process.argv.includes('--runtime')) {
  const os = require('node:os');
  const pty = require('node-pty');
  const marker = 'GIT_WORKBENCH_PTY_OK';
  const windows = process.platform === 'win32';
  const terminal = pty.spawn(windows ? 'powershell.exe' : '/bin/sh', windows
    ? ['-NoLogo', '-NoProfile', '-Command', `[Console]::Write('${marker}')`]
    : ['-c', `test -t 0 && printf ${marker}`], {
    name: 'xterm-256color', cols: 80, rows: 24, cwd: os.tmpdir(), env: process.env
  });
  let output = '';
  const timer = setTimeout(() => {
    console.error('The Electron terminal smoke check timed out.');
    terminal.kill();
    process.exitCode = 1;
  }, 10_000);
  terminal.onData(data => { output = (output + data).slice(-32_768); });
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timer);
    if (exitCode !== 0 || !output.includes(marker)) {
      console.error(`The Electron terminal smoke check failed (exit ${exitCode}).`);
      process.exitCode = 1;
    } else {
      console.log(`Interactive terminal verified in Electron ${process.versions.electron} on ${process.platform}/${process.arch}.`);
    }
  });
} else {
  const { spawnSync } = require('node:child_process');
  const electron = require('electron');
  const result = spawnSync(electron, [__filename, '--runtime'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', timeout: 15_000
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
