import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ raw: vi.fn(), shadow: vi.fn() }));
vi.mock('../../src/main/git/core', () => ({ gitFor: () => ({ raw: mock.raw }) }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitWithEnvironment: () => ({ raw: mock.shadow }) }));
import { captureResolutionMemory } from '../../src/main/git/resolution-memory';
let root: string, gitDir: string;
let files: string[];
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-memory-boundary-')));
  gitDir = path.join(root, '.git'); await fs.mkdir(gitDir); await fs.writeFile(path.join(gitDir, 'index'), 'isolated index');
  files = ['file.txt']; await fs.writeFile(path.join(root, 'file.txt'), '<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> feature\n');
  mock.raw.mockReset().mockImplementation(async (args: string[]) => {
    if (args[0] === 'config') return 'true';
    if (args[0] === 'diff') return files.join('\0');
    return args.includes('--absolute-git-dir') ? gitDir : '.git/index';
  });
  mock.shadow.mockReset().mockResolvedValue('');
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

describe('suggestion-only conflict memory filesystem boundaries', () => {
  it('copies split-index dependencies and forgets only the requested conflicted path in the shadow checkout', async () => {
    await fs.writeFile(path.join(gitDir, 'sharedindex.abcdef'), 'shared index');
    mock.shadow.mockImplementation(async (args: string[]) => {
      const tree = args[3];
      expect(await fs.readFile(path.join(path.dirname(tree), 'sharedindex.abcdef'), 'utf8')).toBe('shared index');
      expect(tree).not.toBe(root);
      return '';
    });
    expect(await captureResolutionMemory(root, 'file.txt')).toEqual(new Map());
    expect(mock.shadow).toHaveBeenCalledWith(expect.arrayContaining(['forget', '--', ':(literal)file.txt']));
    expect(await fs.readFile(path.join(gitDir, 'index'), 'utf8')).toBe('isolated index');
    expect(await fs.readdir(gitDir)).toEqual(expect.arrayContaining(['index', 'sharedindex.abcdef']));
    expect((await fs.readdir(gitDir)).some(name => name.startsWith('git-workbench-rerere-'))).toBe(false);
  });
  it.each(['..', '../outside.txt', '.'])('refuses an untrusted conflict path %s before copying user data', async file => {
    files = [file]; await expect(captureResolutionMemory(root)).rejects.toThrow('Invalid conflict path');
    expect(mock.shadow).not.toHaveBeenCalled();
  });
  it('skips directories, missing files, oversized data, binary bytes and invalid UTF-8', async () => {
    files = ['directory', 'missing', 'large', 'binary', 'invalid'];
    await fs.mkdir(path.join(root, 'directory'));
    await fs.writeFile(path.join(root, 'large'), Buffer.alloc(20 * 1024 * 1024 + 1, 65));
    await fs.writeFile(path.join(root, 'binary'), Buffer.from([0, 65]));
    await fs.writeFile(path.join(root, 'invalid'), Buffer.from([0xff, 65]));
    mock.shadow.mockImplementation(async (args: string[]) => {
      expect(await fs.readdir(args[3])).toEqual([]); return '';
    });
    expect(await captureResolutionMemory(root)).toEqual(new Map());
  });
  it('rejects a tracked parent that resolves outside the repository', async () => {
    files = ['nested/file.txt']; await fs.mkdir(path.join(root, 'nested')); await fs.writeFile(path.join(root, 'nested/file.txt'), 'text');
    const realpath = fs.realpath.bind(fs);
    vi.spyOn(fs, 'realpath').mockImplementation(async target => String(target) === path.join(root, 'nested') ? path.dirname(root) : realpath(target));
    await expect(captureResolutionMemory(root)).rejects.toThrow('Conflict path leaves the repository');
    expect(mock.shadow).not.toHaveBeenCalled();
  });
});
