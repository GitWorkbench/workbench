#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'coverage');
const summaryFile = path.join(directory, 'coverage-summary.json');
if (!fs.existsSync(summaryFile)) {
  console.error('No coverage report found. Run npm run test:coverage first; its report is retained even when the 100% gate fails.');
  process.exitCode = 1;
} else {
  const report = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const complete = value => metrics.every(metric => value[metric].pct === 100);
  const files = Object.entries(report).filter(([name]) => name !== 'total');
  const gaps = files.filter(([, value]) => !complete(value)).sort(([a, av], [b, bv]) => av.lines.pct - bv.lines.pct || av.branches.pct - bv.branches.pct || a.localeCompare(b));
  const text = [
    '# Source coverage gaps', '',
    `Source files: ${files.length}. All four metrics at 100%: ${files.filter(([, value]) => complete(value)).length}.`, '',
    ...metrics.map(metric => `- ${metric}: ${report.total[metric].pct}% (${report.total[metric].covered}/${report.total[metric].total})`), '',
    gaps.length ? 'The strict 100% per-file gate is not yet satisfied.' : 'Every included source file satisfies the strict 100% gate.', '',
    '| Source file | Lines | Statements | Functions | Branches |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...gaps.map(([name, value]) => `| ${path.relative(root, name).split(path.sep).join('/')} | ${metrics.map(metric => `${value[metric].pct}%`).join(' | ')} |`), '',
    'See index.html for annotated source and lcov.info for CI tooling. Only erased TypeScript declarations are excluded.', ''
  ].join('\n');
  fs.writeFileSync(path.join(directory, 'coverage-gaps.md'), text);
  console.log(text);
}
