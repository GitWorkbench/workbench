const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'build');
const svgPath = path.join(dir, 'icon.svg');

if (!fs.existsSync(svgPath)) {
  console.error('icon.svg does not exist at', svgPath);
  process.exit(1);
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

for (const s of sizes) {
  const outPath = path.join(dir, `icon-${s}.png`);
  try {
    execFileSync('rsvg-convert', ['-w', String(s), '-h', String(s), svgPath, '-o', outPath]);
    console.log(`Rendered ${outPath} (${s}x${s})`);
  } catch (err) {
    console.error(`Failed to render icon-${s}.png via rsvg-convert:`, err.message);
  }
}

// Copy 512 as default icon.png
fs.copyFileSync(path.join(dir, 'icon-512.png'), path.join(dir, 'icon.png'));
console.log('Git Workbench icon build completed: build/icon.png ready');
