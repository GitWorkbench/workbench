import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ spawn: vi.fn(), raw: vi.fn(), operation: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mock.spawn }));
vi.mock('../../src/main/git/core', () => ({ gitFor: () => ({ raw: mock.raw }) }));
vi.mock('../../src/main/git/conflicts-rebase', () => ({ getRepoOperationState: mock.operation }));
import { cleanBranch, gitCommand, gitWithEnvironment, resolveCommit } from '../../src/main/git/advanced-process';

let child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: EventEmitter & { end: ReturnType<typeof vi.fn> }; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { end: vi.fn() }), kill: vi.fn() });
  mock.spawn.mockReset().mockReturnValue(child); mock.raw.mockReset();
  mock.operation.mockReset().mockResolvedValue({ inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: [] });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('bounded Git subprocess execution', () => {
  it('uses argument arrays, preserves inherited environment, and forwards stdin', async () => {
    vi.stubEnv('GIT_WORKBENCH_TEST_SENTINEL', 'inherited');
    const pending = gitCommand('/repo', ['show', 'HEAD:file with spaces'], 'stdin bytes', { GIT_INDEX_FILE: '/temp/index' });
    expect(mock.spawn).toHaveBeenCalledWith('git', ['show', 'HEAD:file with spaces'], expect.objectContaining({ cwd: '/repo', windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'], env: expect.objectContaining({ GIT_TERMINAL_PROMPT: '0', GIT_WORKBENCH_TEST_SENTINEL: 'inherited', GIT_INDEX_FILE: '/temp/index' }) }));
    expect(child.stdin.end).toHaveBeenCalledWith('stdin bytes');
    child.stdout.emit('data', Buffer.from('first')); child.stdout.emit('data', Buffer.from(' second')); child.emit('close', 0);
    await expect(pending).resolves.toBe('first second'); expect(vi.getTimerCount()).toBe(0);
  });
  it('wraps environment overrides without copying them through simple-git', async () => {
    const pending = gitWithEnvironment('/repo', { GIT_LFS_SKIP_SMUDGE: '1' }, 100).raw(['status']);
    expect(mock.spawn.mock.calls[0][2].env.GIT_LFS_SKIP_SMUDGE).toBe('1');
    child.emit('close', 0); await expect(pending).resolves.toBe('');
    const again = gitWithEnvironment('/repo', {}).raw(['status']); child.emit('close', 0); await again;
  });
  it.each([[1, '  fatal: bad revision\n', 'fatal: bad revision'], [2, '', 'Git exited with code 2.'], [null, '', 'Git exited with code null.']])('rejects failed Git exits %#', async (code, stderr, message) => {
    const pending = expect(gitCommand('/repo', ['status'])).rejects.toThrow(message);
    child.stderr.emit('data', Buffer.from(stderr)); child.emit('close', code); await pending;
  });
  it('handles a missing Git executable and cleans up its timeout', async () => {
    const pending = expect(gitCommand('/repo', ['status'])).rejects.toThrow('Git missing');
    child.emit('error', new Error('Git missing')); await pending; expect(vi.getTimerCount()).toBe(0);
  });
  it('handles a closed stdin without an unhandled EPIPE event', async () => {
    const pending = gitCommand('/repo', ['status']); child.stdin.emit('error', new Error('EPIPE')); child.emit('close', 0);
    await expect(pending).resolves.toBe('');
  });
  it('kills a timed-out child and rejects even if its close code is zero', async () => {
    const pending = expect(gitCommand('/repo', ['status'], undefined, undefined, 100)).rejects.toThrow('Git timed out');
    await vi.advanceTimersByTimeAsync(100); expect(child.kill).toHaveBeenCalledOnce(); child.emit('close', 0); await pending;
  });
  it('bounds combined stderr/stdout memory instead of returning truncated successful output', async () => {
    const pending = expect(gitCommand('/repo', ['show'])).rejects.toThrow('32 MB');
    child.stdout.emit('data', Buffer.alloc(16 * 1024 * 1024));
    child.stderr.emit('data', Buffer.alloc(16 * 1024 * 1024 + 1));
    expect(child.kill).toHaveBeenCalledOnce(); child.emit('close', 0); await pending;
  });
});

describe('clean branch and revision prerequisites', () => {
  it.each(['inMerge', 'inRebase', 'inCherryPick', 'conflictedFiles'])('refuses active operation %s before querying refs', async field => {
    mock.operation.mockResolvedValue({ [field]: field === 'conflictedFiles' ? ['file.txt'] : true });
    await expect(cleanBranch('/repo')).rejects.toThrow('Finish or abort'); expect(mock.raw).not.toHaveBeenCalled();
  });
  it('requires a local branch and an entirely clean tracked/untracked working tree', async () => {
    mock.raw.mockResolvedValueOnce(''); await expect(cleanBranch('/repo')).rejects.toThrow('local branch');
    mock.raw.mockResolvedValueOnce('main\n').mockResolvedValueOnce('?? untracked.txt\n');
    await expect(cleanBranch('/repo')).rejects.toThrow('including untracked');
  });
  it('returns a trimmed branch and HEAD after all prerequisites pass', async () => {
    mock.raw.mockResolvedValueOnce(' main\n').mockResolvedValueOnce('').mockResolvedValueOnce('abc123\n');
    await expect(cleanBranch('/repo')).resolves.toEqual({ branch: 'main', head: 'abc123' });
  });
  it.each([null, 1, '', '   ', 'x'.repeat(4097)])('rejects invalid revision input %# without executing Git', async value => {
    await expect(resolveCommit('/repo', value as string)).rejects.toThrow('Choose a commit revision'); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it('resolves revisions using end-of-options so input cannot become a Git flag', async () => {
    const pending = resolveCommit('/repo', '--not-an-option');
    expect(mock.spawn.mock.calls[0][1]).toEqual(['rev-parse', '--verify', '--end-of-options', '--not-an-option^{commit}']);
    child.stdout.emit('data', Buffer.from('abc123\n')); child.emit('close', 0); await expect(pending).resolves.toBe('abc123');
  });
});
