import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ simpleGit: vi.fn() }));
vi.mock('simple-git', () => ({ simpleGit: mock.simpleGit }));
import { errorMessage, gitFor, isValidRepo, withGit } from '../../src/main/git/core';
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-core-test-')); mock.simpleGit.mockReset().mockReturnValue({ value: 'client' }); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('Git client and repository checks', () => {
  it('configures per-client timeouts rather than an unsupported chainable timeout method', () => { expect(gitFor(root, { timeout: { block: 1000 } })).toEqual({ value: 'client' }); expect(mock.simpleGit).toHaveBeenCalledWith({ baseDir: root, binary: 'git', maxConcurrentProcesses: 6, trimmed: false, timeout: { block: 1000 } }); });
  it('handles absent paths, missing HEAD, worktree pointers and filesystem races', async () => { expect(isValidRepo(path.join(root, 'missing'))).toBe(false); expect(isValidRepo(root)).toBe(false); fs.mkdirSync(path.join(root, '.git')); expect(isValidRepo(root)).toBe(false); fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main'); expect(isValidRepo(root)).toBe(true); expect(await withGit(root, async git => git)).toEqual({ value: 'client' }); fs.rmSync(path.join(root, '.git'), { recursive: true }); fs.writeFileSync(path.join(root, '.git'), 'gitdir: ../main/.git/worktrees/review'); expect(isValidRepo(root)).toBe(true); vi.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('removed during stat'); }); expect(isValidRepo(root)).toBe(false); await expect(withGit(root, async () => true)).rejects.toThrow('Not a git repository'); });
  it('returns the last useful line for Error objects and stringifies other rejection values', () => { expect(errorMessage(new Error('first\n\nlast\n'))).toBe('last'); expect(errorMessage(new Error(''))).toBe(''); expect(errorMessage(null)).toBe('null'); expect(errorMessage('text')).toBe('text'); });
});
