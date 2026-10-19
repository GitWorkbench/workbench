#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

if (process.platform === 'linux') {
  require('./build-linux.cjs').buildLinux(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
} else {
  const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), ...process.argv.slice(2), '--publish', 'never'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
