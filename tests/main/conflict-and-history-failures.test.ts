import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ exec: vi.fn(), memory: vi.fn(), raw: vi.fn(), deleteLocalBranch: vi.fn() }));
vi.mock('node:child_process', () => { const execFile = () => {}; Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), { value: mock.exec }); return { execFile }; });
vi.mock('../../src/main/git/resolution-memory', () => ({ captureResolutionMemory: mock.memory }));
vi.mock('../../src/main/git/core', () => ({ withGit: async (_repo: string, run: any) => run({ raw: mock.raw, deleteLocalBranch: mock.deleteLocalBranch }), errorMessage: String }));
import { getConflictFile, resolveConflictFile } from '../../src/main/git/conflict-files';
import { continueOperation, simulateMerge, getRepoOperationState, getCommitsForRebase, cherryPick, executeInteractiveRebase } from '../../src/main/git/conflicts-rebase';
import { dropCommit, deleteBranchEx, createWorktree } from '../../src/main/git/history';
let root: string, file: string;
const hash = 'a'.repeat(40);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-conflict-boundary-')); file = path.join(root, 'file.txt'); fs.writeFileSync(file, '<<<<<<< current\nours\n=======\ntheirs\n>>>>>>> incoming\n'); mock.raw.mockReset().mockResolvedValue(''); mock.deleteLocalBranch.mockReset().mockResolvedValue(undefined); mock.memory.mockReset().mockResolvedValue(new Map());
  mock.exec.mockReset().mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files' ? [1, 2, 3].map(stage => `100644 ${hash} ${stage}\tfile.txt\0`).join('') : args[0] === 'cat-file' ? Buffer.from('version\n') : args.includes('--absolute-git-dir') ? root : args[0] === 'rev-parse' ? 'main' : '', stderr: '' }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('conflict filesystem errors and save races', () => {
  it('refuses oversized working files before trying to load their content', async () => { const original = fs.promises.lstat.bind(fs.promises); vi.spyOn(fs.promises, 'lstat').mockImplementation(async value => String(value) === file ? { isDirectory: () => false, size: 21 * 1024 * 1024 } as fs.Stats : original(value)); await expect(getConflictFile(root, 'file.txt')).rejects.toThrow('too large for the merge editor'); });
  it('propagates permission failures but recognizes a missing working file', async () => { const original = fs.promises.lstat.bind(fs.promises); const stat = vi.spyOn(fs.promises, 'lstat').mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' })); await expect(getConflictFile(root, 'file.txt')).rejects.toThrow('permission denied'); stat.mockImplementation(original); fs.unlinkSync(file); expect(await getConflictFile(root, 'file.txt')).toMatchObject({ workingTreeExists: false, kind: 'text' }); });
  it('rejects malformed Git index stages rather than displaying an incorrect conflict', async () => { mock.exec.mockResolvedValue({ stdout: 'malformed\0', stderr: '' }); await expect(getConflictFile(root, 'file.txt')).rejects.toThrow('conflicted Git index'); });
  it('does not overwrite an external edit that arrives after the result is prepared', async () => {
    const conflict = await getConflictFile(root, 'file.txt'); const original = fs.promises.writeFile.bind(fs.promises); vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (...args: any[]) => { await (original as any)(...args); if (String(args[0]).includes('.git-workbench-merge-')) fs.writeFileSync(file, 'external change\n'); });
    await expect(resolveConflictFile(root, 'file.txt', 'reviewed result\n', { action: 'result', expectedSnapshot: conflict.snapshot })).rejects.toThrow('changed outside the merge editor'); expect(fs.readFileSync(file, 'utf8')).toBe('external change\n'); expect(fs.readdirSync(root)).toEqual(['file.txt']); expect(mock.exec.mock.calls.some(([, args]) => args[0] === 'add')).toBe(false);
  });
  it('stages a valid result even if optional conflict memory capture fails', async () => { vi.spyOn(console, 'warn').mockImplementation(() => {}); mock.memory.mockRejectedValue(new Error('cache full')); await resolveConflictFile(root, 'file.txt', 'resolved\n'); expect(fs.readFileSync(file, 'utf8')).toBe('resolved\n'); expect(console.warn).toHaveBeenCalledWith('Conflict memory:', 'cache full'); expect(mock.exec).toHaveBeenCalledWith('git', ['add', '--', ':(literal)file.txt'], { cwd: root }); });
  it('reads a directory conflict without attempting to open it as a file', async () => { fs.unlinkSync(file); fs.mkdirSync(file); expect(await getConflictFile(root, 'file.txt')).toMatchObject({ rawContent: '', workingTreeExists: true }); });
});
describe('Git operation and history failure boundaries', () => {
  it.each([true, false])('continues a rebase using the saved editor when present: %s', async withEditor => { fs.mkdirSync(path.join(root, 'rebase-merge')); const editorDir = path.join(root, 'git-workbench-rebase-editor'); if (withEditor) { fs.mkdirSync(editorDir); fs.writeFileSync(path.join(editorDir, 'message.cjs'), 'message editor'); fs.writeFileSync(path.join(editorDir, 'todo.cjs'), 'todo editor'); } const original = mock.exec.getMockImplementation()!; mock.exec.mockImplementation(async (cmd, args, opts) => { if (args[0] === 'rebase' && args[1] === '--continue') fs.rmdirSync(path.join(root, 'rebase-merge')); return original(cmd, args, opts); }); await continueOperation(root); expect(mock.exec).toHaveBeenCalledWith('git', ['rebase', '--continue'], expect.objectContaining({ cwd: root, env: expect.objectContaining({ GIT_EDITOR: withEditor ? `node ${JSON.stringify(path.join(editorDir, 'message.cjs'))}` : 'true' }) })); expect(fs.existsSync(editorDir)).toBe(false); });
  it('parses generic conflict messages and handles failed merge simulation without output', async () => { mock.exec.mockRejectedValueOnce({ stdout: 'CONFLICT (modify/delete): file.txt deleted\nCONFLICT (unknown):    \n', stderr: '' }); expect(await simulateMerge(root, 'feature')).toMatchObject({ clean: false, conflicts: ['file.txt'], message: expect.stringContaining('1 file') }); mock.exec.mockRejectedValueOnce('unsupported Git'); expect(await simulateMerge(root, 'feature')).toEqual({ clean: false, conflicts: [], message: 'Merge with feature will encounter conflicts.' }); });
  it.each([new Error('nothing to do'), 'nothing to do', new Error('other rebase failure')])('reports the only-commit drop refusal or original failure: %s', async error => { const original = mock.exec.getMockImplementation()!; mock.exec.mockImplementation(async (cmd, args, opts) => { if (args[0] === 'rebase' && args[1] === '-i') throw error; return original(cmd, args, opts); }); await expect(dropCommit(root, hash)).rejects.toThrow(String(error).includes('nothing to do') ? 'only commit in its history range' : 'other rebase failure'); expect(mock.exec).toHaveBeenCalledWith('git', ['rebase', '--abort'], { cwd: root }); });
  it('explains unmerged branch deletion without leaking Git advice and propagates unrelated or forced deletion failures', async () => { const hint = 'error: The branch \'feature\' is not fully merged.\nhint: If you are sure you want to delete it, run \'git branch -D feature\'\nhint: Disable this message with "git config set advice.forceDeleteBranch false"'; mock.deleteLocalBranch.mockRejectedValue(new Error(hint)); await expect(deleteBranchEx(root, 'feature', { local: true })).rejects.toThrow(/^Branch \'feature\' is not fully merged\. Use "force delete" to discard its commits\.$/); mock.deleteLocalBranch.mockRejectedValue(hint); await expect(deleteBranchEx(root, 'feature', { local: true })).rejects.toThrow(/^Branch \'feature\' is not fully merged\. Use "force delete" to discard its commits\.$/); mock.deleteLocalBranch.mockRejectedValue(new Error('not fully merged')); await expect(deleteBranchEx(root, 'feature', { local: true, force: true })).rejects.toThrow('not fully merged'); mock.deleteLocalBranch.mockRejectedValue(new Error('branch checked out')); await expect(deleteBranchEx(root, 'feature', { local: true })).rejects.toThrow('branch checked out'); });
});


it('resolves relative worktree destinations inside the selected repository', async () => {
  await createWorktree(root, 'review', hash);
  expect(mock.raw).toHaveBeenCalledWith(['worktree', 'add', path.join(root, 'review'), hash]);
});
it('retains operation markers when conflict enumeration fails', async () => {
  fs.writeFileSync(path.join(root, 'MERGE_HEAD'), hash);
  const original = mock.exec.getMockImplementation()!;
  mock.exec.mockImplementation(async (cmd, args, opts) => { if (args[0] === 'diff') throw new Error('index locked'); return original(cmd, args, opts); });
  expect(await getRepoOperationState(root)).toMatchObject({ inMerge: true, conflictedFiles: [] });
});
it('handles incomplete interactive-rebase metadata without losing row order', async () => {
  mock.exec.mockResolvedValue({ stdout: '\tshort\t\t\nhash\n', stderr: '' });
  expect(await getCommitsForRebase(root, hash)).toEqual([
    { hash: '', shortHash: 'short', action: 'pick', message: '', author: 'Unknown' },
    { hash: 'hash', shortHash: '', action: 'pick', message: '', author: 'Unknown' }
  ]);
});
it('reports non-Error cherry-pick failures without inventing a conflict', async () => {
  const original = mock.exec.getMockImplementation()!;
  mock.exec.mockImplementation(async (cmd, args, opts) => { if (args[0] === 'cherry-pick') throw 'checkout unavailable'; return original(cmd, args, opts); });
  expect(await cherryPick(root, hash)).toEqual({ ok: false, error: 'checkout unavailable' });
});
it.each([true, false])('reports non-Error interactive-rebase failures with paused state %s', async paused => {
  const original = mock.exec.getMockImplementation()!;
  mock.exec.mockImplementation(async (cmd, args, opts) => {
    if (args[0] === 'rebase' && args[1] === '-i') { if (paused) fs.mkdirSync(path.join(root, 'rebase-merge')); throw 'rebase refused'; }
    if (args[0] === 'rebase' && args[1] === '--abort') throw new Error('nothing to abort');
    return original(cmd, args, opts);
  });
  expect(await executeInteractiveRebase(root, hash, [{ hash, shortHash: hash.slice(0, 7), action: 'pick', message: 'Commit', author: 'Author' }])).toEqual({ ok: false, ...(paused ? { hasConflicts: true } : {}), error: 'rebase refused' });
});

it('reads submodule conflicts without treating commit objects as blobs and refuses applying text', async () => {
  const original = mock.exec.getMockImplementation()!;
  mock.exec.mockImplementation(async (cmd, args, opts) => args[0] === 'ls-files'
    ? { stdout: `160000 ${hash} 2\tfile.txt\0`, stderr: '' } : original(cmd, args, opts));
  expect(await getConflictFile(root, 'file.txt')).toMatchObject({ kind: 'submodule', currentContent: null, incomingContent: null });
  await expect(resolveConflictFile(root, 'file.txt', 'result')).rejects.toThrow('submodule conflict');
  expect(mock.exec.mock.calls.some(([, args]) => args[0] === 'cat-file' || args[0] === 'add')).toBe(false);
});
it('uses the incoming line endings when the worktree and current version are empty', async () => {
  fs.unlinkSync(file);
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files'
    ? `100644 ${hash} 3\tfile.txt\0` : args[0] === 'cat-file' ? Buffer.from('incoming\r\n') : '', stderr: '' }));
  expect(await getConflictFile(root, 'file.txt')).toMatchObject({ currentLabel: 'Current', incomingLabel: 'Incoming', currentContent: null, incomingContent: 'incoming\r\n', lineEnding: '\r\n' });
});
it('handles an empty conflict with only a base stage without inventing side contents', async () => {
  fs.unlinkSync(file);
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files'
    ? `100644 ${hash} 1\tfile.txt\0` : args[0] === 'cat-file' ? Buffer.alloc(0) : '', stderr: '' }));
  expect(await getConflictFile(root, 'file.txt')).toMatchObject({ rawContent: '', currentContent: null, incomingContent: null, lineEnding: '\n' });
  await resolveConflictFile(root, 'file.txt', 'reviewed base-only result\n');
  expect(fs.readFileSync(file, 'utf8')).toBe('reviewed base-only result\n');
});
it('represents binary incoming versions without decoding them into editable text', async () => {
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files'
    ? `100644 ${hash} 3\tfile.txt\0` : args[0] === 'cat-file' ? Buffer.from([0, 1]) : 'main', stderr: '' }));
  expect(await getConflictFile(root, 'file.txt')).toMatchObject({ kind: 'binary', rawContent: '', incomingContent: '' });
});
it.each(['100755', '100644'])('creates missing conflict directories and preserves incoming mode %s', async mode => {
  const relative = 'missing/nested/file.txt';
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files'
    ? `${mode} ${hash} 3\t${relative}\0` : '', stderr: '' }));
  const write = vi.spyOn(fs.promises, 'writeFile');
  await resolveConflictFile(root, relative, 'reviewed\n');
  expect(write).toHaveBeenCalledWith(expect.stringContaining('.git-workbench-merge-'), 'reviewed\n', expect.objectContaining({ mode: mode === '100755' ? 0o755 : 0o644 }));
  expect(fs.readFileSync(path.join(root, relative), 'utf8')).toBe('reviewed\n');
});

it('preserves NUL-delimited Unicode and tab paths without requiring the host filesystem to create them', async () => {
  const original = mock.exec.getMockImplementation()!;
  mock.exec.mockImplementation(async (cmd, args, opts) => args[0] === 'diff'
    ? { stdout: '日本\tfile.txt\0from -> to.txt\0', stderr: '' } : original(cmd, args, opts));
  expect((await getRepoOperationState(root)).conflictedFiles).toEqual(['日本\tfile.txt', 'from -> to.txt']);
});

it('detects a binary base even when both side stages and the working file are absent', async () => {
  fs.unlinkSync(file);
  mock.exec.mockImplementation(async (_cmd, args) => ({ stdout: args[0] === 'ls-files'
    ? `100644 ${hash} 1\tfile.txt\0` : args[0] === 'cat-file' ? Buffer.from([0, 255]) : 'main', stderr: '' }));
  expect(await getConflictFile(root, 'file.txt')).toMatchObject({ kind: 'binary', workingTreeExists: false, baseContent: '', currentContent: null, incomingContent: null });
  expect(fs.existsSync(file)).toBe(false);
});
