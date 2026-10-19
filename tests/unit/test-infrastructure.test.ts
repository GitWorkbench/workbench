import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isolateGitEnvironment } = require('../../scripts/test-git-environment.cjs');
afterEach(() => vi.unstubAllEnvs());
describe('Git test isolation', () => {
  it('clears inherited repository/index/object paths and restores the caller environment on cleanup', () => {
    const dangerous = ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_PARAMETERS', 'GIT_NAMESPACE', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_EMAIL'];
    dangerous.forEach(name => vi.stubEnv(name, 'sentinel-never-opened')); vi.stubEnv('GIT_CONFIG_COUNT', '10'); vi.stubEnv('GIT_CONFIG_KEY_0', 'user.name');
    const cleanup = isolateGitEnvironment(); const hooks = process.env.GIT_CONFIG_VALUE_0!;
    const config = process.env.GIT_CONFIG_GLOBAL!;
    try {
      dangerous.forEach(name => expect(process.env[name]).toBeUndefined());
      expect(path.isAbsolute(config)).toBe(true);
      expect(fs.readFileSync(config, 'utf8')).toBe('');
      expect(process.env.GIT_CONFIG_COUNT).toBe('3');
      expect(process.env.GIT_CONFIG_KEY_0).toBe('core.hooksPath');
      expect(process.env.GIT_CONFIG_VALUE_1).toBe('false');
      expect(fs.readdirSync(hooks)).toEqual([]);
    }
    finally { cleanup(); }
    dangerous.forEach(name => expect(process.env[name]).toBe('sentinel-never-opened')); expect(process.env.GIT_CONFIG_COUNT).toBe('10'); expect(process.env.GIT_CONFIG_KEY_0).toBe('user.name'); expect(fs.existsSync(hooks)).toBe(false);
    expect(fs.existsSync(config)).toBe(false);
  });
  it('restores originally unset environment values without creating empty overrides', () => {
    vi.stubEnv('GIT_INDEX_FILE', undefined); const cleanup = isolateGitEnvironment(); cleanup(); expect(Object.hasOwn(process.env, 'GIT_INDEX_FILE')).toBe(false);
  });
});
describe('coverage report generator', () => {
  const script = fs.readFileSync(path.resolve(__dirname, '../../scripts/report-test-coverage.cjs'), 'utf8');
  const metric = (covered: number, total = 10) => ({ covered, total, pct: covered / total * 100 });
  function execute(report?: Record<string, any>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-coverage-report-test-'));
    const output = vi.fn(), error = vi.fn(), fakeProcess = { exitCode: 0 };
    try {
      fs.mkdirSync(path.join(root, 'scripts')); if (report) { fs.mkdirSync(path.join(root, 'coverage')); fs.writeFileSync(path.join(root, 'coverage', 'coverage-summary.json'), JSON.stringify(report)); }
      new Function('require', '__dirname', 'process', 'console', script.replace(/^#![^\n]*\n/, ''))(require, path.join(root, 'scripts'), fakeProcess, { log: output, error });
      const generated = path.join(root, 'coverage', 'coverage-gaps.md'); return { code: fakeProcess.exitCode, output, error, markdown: fs.existsSync(generated) ? fs.readFileSync(generated, 'utf8') : '' };
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  it('explains how to produce coverage when no report exists', () => { const result = execute(); expect(result.code).toBe(1); expect(result.error).toHaveBeenCalledWith(expect.stringContaining('Run npm run test:coverage')); expect(result.markdown).toBe(''); });
  it('reports every metric, includes uncovered files, and does not label incomplete coverage complete', () => { const full = { lines: metric(10), statements: metric(10), functions: metric(10), branches: metric(10) }; const partial = { ...full, branches: metric(5) }; const result = execute({ total: partial, '/project/src/full.ts': full, '/project/src/partial.ts': partial }); expect(result.code).toBe(0); expect(result.markdown).toContain('Source files: 2. All four metrics at 100%: 1.'); expect(result.markdown).toContain('branches: 50% (5/10)'); expect(result.markdown).toContain('partial.ts | 100% | 100% | 100% | 50%'); expect(result.markdown).not.toContain('full.ts |'); expect(result.markdown).toContain('not yet satisfied'); });
  it('marks the gate complete only when all four metrics pass on every file', () => { const full = { lines: metric(10), statements: metric(10), functions: metric(10), branches: metric(10) }; expect(execute({ total: full, '/project/src/full.ts': full }).markdown).toContain('Every included source file satisfies the strict 100% gate.'); });
});
