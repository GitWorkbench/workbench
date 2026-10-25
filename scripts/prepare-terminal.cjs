#!/usr/bin/env node
'use strict';

const { chmodSync, statSync } = require('node:fs');
const path = require('node:path');

function prepareTerminal(root = path.dirname(require.resolve('node-pty/package.json'))) {
  // npm archives do not preserve these helpers' executable bit. Both must be
  // executable before packaging a universal macOS application.
  for (const arch of ['x64', 'arm64']) {
    const helper = path.join(root, 'prebuilds', `darwin-${arch}`, 'spawn-helper');
    const mode = statSync(helper).mode;
    chmodSync(helper, mode | 0o111);
  }
}

module.exports = { prepareTerminal };
if (require.main === module) prepareTerminal();
