import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ gitCommand: vi.fn(), resolveCommit: vi.fn(), createRestorePoint: vi.fn(), getRepoOperationState: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('../../src/main/git/advanced-process', () => ({ gitCommand: mocks.gitCommand, resolveCommit: mocks.resolveCommit }));
vi.mock('../../src/main/git/restore-points', () => ({ createRestorePoint: mocks.createRestorePoint }));
vi.mock('../../src/main/git/conflicts-rebase', () => ({ getRepoOperationState: mocks.getRepoOperationState }));

import { cancelLfsTransfer, configureLfs, getLfsState, getLfsTransfer, runLfsTransfer, setLfsTracking, stopLfsTransfers } from '../../src/main/git/lfs-manager';
import type { LfsTransfer } from '../../src/shared/types';

class TransferProcess extends EventEmitter {
  pid = 912345;
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => true);
}

describe('Git LFS subprocess adapter', () => {
  let repo: string;
  let child: TransferProcess;
  const head = 'a'.repeat(40);
  beforeEach(async () => {
    repo = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-workbench-lfs-test-')));
    child = new TransferProcess();
    mocks.spawn.mockReturnValue(child);
    mocks.resolveCommit.mockResolvedValue(head);
    mocks.getRepoOperationState.mockResolvedValue({ inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: [] });
    mocks.createRestorePoint.mockResolvedValue({ id: 'snapshot' });
    mocks.gitCommand.mockImplementation(async (_repo: string, args: string[]) => {
      if (args[0] === 'remote') return 'origin\nbackup\n';
      if (args[0] === 'config') return 'git-lfs filter-process\n';
      if (args[1] === 'version') return 'git-lfs/3.6.1\n';
      if (args[1] === 'track' && args[2] === '--json') return JSON.stringify({ patterns: [{ pattern: '*.psd', source: '.gitattributes', lockable: false, tracked: true }] });
      if (args[1] === 'ls-files') return JSON.stringify({ files: [{ name: 'image.psd', oid: 'oid', size: 200, downloaded: true, checkout: false }] });
      return '';
    });
    vi.spyOn(process, 'kill').mockReturnValue(true);
  });
  afterEach(async () => {
    child.emit('close', 0);
    stopLfsTransfers();
    await rm(repo, { recursive: true, force: true });
    vi.restoreAllMocks(); vi.resetAllMocks(); vi.useRealTimers();
  });

  it('maps installed version, local configuration, remotes, patterns and file metadata', async () => {
    expect(await getLfsState(repo)).toMatchObject({ repo, installed: true, configured: true, version: 'git-lfs/3.6.1', head, remotes: ['origin', 'backup'], totalFiles: 1,
      patterns: [expect.objectContaining({ pattern: '*.psd' })], files: [{ name: 'image.psd', oid: 'oid', size: 200, downloaded: true, checkout: false }] });
  });

  it('returns actionable installation and malformed-output warnings', async () => {
    mocks.gitCommand.mockRejectedValueOnce(new Error('not installed'));
    expect(await getLfsState(repo)).toMatchObject({ installed: false, configured: false, files: [], warning: expect.stringContaining('Install it from git-lfs.com') });
    mocks.gitCommand.mockImplementation(async (_repo, args) => args[1] === 'track' ? 'not json' : args[0] === 'remote' ? 'origin' : 'git-lfs');
    expect(await getLfsState(repo)).toMatchObject({ installed: true, warning: expect.stringContaining('Could not read all LFS details') });
  });

  it('bounds the displayed LFS file list while retaining the complete count', async () => {
    const files = Array.from({ length: 10002 }, (_, i) => ({ name: `file-${i}`, size: 'invalid' }));
    mocks.gitCommand.mockImplementation(async (_repo, args) => args[1] === 'ls-files' ? JSON.stringify({ files }) : args[1] === 'track' ? '{}' : 'git-lfs');
    const state = await getLfsState(repo);
    expect(state.totalFiles).toBe(10002); expect(state.files).toHaveLength(10000);
    expect(state.files[0]).toEqual({ name: 'file-0', oid: 'undefined', size: 0, downloaded: false, checkout: false });
    expect(state.warning).toContain('first 10,000');
  });

  it('configures skip-smudge locally and explains hook integration failures', async () => {
    await configureLfs(repo, true);
    expect(mocks.gitCommand).toHaveBeenCalledWith(repo, ['lfs', 'install', '--local', '--skip-smudge']);
    await configureLfs(repo, false);
    expect(mocks.gitCommand).toHaveBeenCalledWith(repo, ['lfs', 'install', '--local']);
    mocks.gitCommand.mockRejectedValueOnce(new Error('existing hook'));
    await expect(configureLfs(repo, false)).rejects.toThrow('existing pre-push hook was not overwritten');
  });

  it('creates a restore point before adding literal or removing glob tracking patterns', async () => {
    await setLfsTracking(repo, 'design [draft].psd', true, true);
    expect(mocks.createRestorePoint).toHaveBeenCalledWith(repo, 'Before tracking LFS pattern: design [draft].psd');
    expect(mocks.gitCommand).toHaveBeenCalledWith(repo, ['lfs', 'track', '--filename', '--', 'design [draft].psd']);
    expect(mocks.createRestorePoint.mock.invocationCallOrder[0]).toBeLessThan(mocks.gitCommand.mock.invocationCallOrder[0]);
    await setLfsTracking(repo, '*.psd', false);
    expect(mocks.gitCommand).toHaveBeenCalledWith(repo, ['lfs', 'untrack', '--', '*.psd']);
  });

  it('refuses unavailable LFS, stale revisions, unknown remotes and active-operation population', async () => {
    const emit = vi.fn();
    mocks.gitCommand.mockRejectedValueOnce(new Error('missing'));
    await expect(runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, emit)).rejects.toThrow('not available');
    await expect(runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head: 'b'.repeat(40) }, emit)).rejects.toThrow('revision changed');
    await expect(runLfsTransfer(repo, { kind: 'fetch', remote: 'missing', head }, emit)).rejects.toThrow('configured Git remote');
    mocks.getRepoOperationState.mockResolvedValue({ inMerge: true, conflictedFiles: [] });
    await expect(runLfsTransfer(repo, { kind: 'pull', remote: 'origin', head }, emit)).rejects.toThrow('Finish the active Git operation');
    await expect(runLfsTransfer(repo, { kind: 'checkout', remote: '', head }, emit)).rejects.toThrow('Finish the active Git operation');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'pull', 'push', 'checkout'] as const)('runs %s with explicit args and emits a final completed state', async kind => {
    const events: LfsTransfer[] = [];
    const promise = runLfsTransfer(repo, { kind, remote: kind === 'checkout' ? '' : 'origin', head }, state => events.push(state));
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    expect(mocks.spawn).toHaveBeenCalledWith('git', ['lfs', kind, ...(kind === 'checkout' ? [] : ['origin']), ...(kind === 'fetch' || kind === 'push' ? [head] : [])], expect.objectContaining({ cwd: repo, env: expect.objectContaining({ GIT_TERMINAL_PROMPT: '0', GIT_LFS_FORCE_PROGRESS: '1' }) }));
    child.stdout.write('informational output'); child.emit('close', 0);
    const result = await promise;
    expect(result).toMatchObject({ state: 'completed', kind, repo });
    expect(events[0].state).toBe('running'); expect(events.at(-1)?.state).toBe('completed');
    expect(await getLfsTransfer(repo)).toEqual(result);
    if (kind === 'push') expect(result.message).toContain('Git branch refs were not pushed');
  });

  it('reads optional progress records and preserves completion status after the last read', async () => {
    const events: LfsTransfer[] = [];
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, state => events.push(state));
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    const progressFile = mocks.spawn.mock.calls[0][2].env.GIT_LFS_PROGRESS;
    await writeFile(progressFile, 'unrecognized progress\ndownload 1/2 100/300 assets/file one.psd\n');
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ current: 1, totalFiles: 2, bytes: 100, totalBytes: 300, file: 'assets/file one.psd' })));
    child.emit('close', 0);
    expect(await promise).toMatchObject({ state: 'completed', current: 1, message: 'LFS operation completed.' });
  });

  it('keeps the cancellation message when progress arrives before the child exits', async () => {
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    const progressFile = mocks.spawn.mock.calls[0][2].env.GIT_LFS_PROGRESS;
    const transfer = await getLfsTransfer(repo);
    expect(transfer).not.toBeNull();
    await cancelLfsTransfer(repo, transfer!.id);
    await writeFile(progressFile, 'download 1/2 100/300 assets/late.psd\n');
    await vi.waitFor(async () => expect(await getLfsTransfer(repo)).toMatchObject({ current: 1, message: 'Cancelling…' }));
    child.emit('close', 0);
    expect(await promise).toMatchObject({ state: 'cancelled', current: 1 });
  });

  it('redacts credentials from errors and records failed transfers', async () => {
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    child.stderr.write('failed https://secret@host.invalid/file?token=private&access_token=hidden&key=value'); child.emit('close', 1);
    const result = await promise;
    expect(result.state).toBe('failed');
    expect(result.message).toContain('[credentials]@host.invalid'); expect(result.message).toContain('token=[redacted]');
    expect(result.message).not.toContain('private'); expect(result.message).not.toContain('hidden');
  });

  it('blocks concurrent transfers and validates cancellation ids before killing a process group', async () => {
    const events: LfsTransfer[] = [];
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, state => events.push(state));
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    await expect(runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, vi.fn())).rejects.toThrow('already running');
    await expect(cancelLfsTransfer(repo, 'wrong-id')).rejects.toThrow('no longer running');
    expect(await cancelLfsTransfer(repo, events[0].id)).toEqual({ ok: true });
    if (process.platform !== 'win32') expect(process.kill).toHaveBeenCalledWith(-child.pid, 'SIGTERM');
    child.emit('close', null);
    expect(await promise).toMatchObject({ state: 'cancelled', message: expect.stringContaining('Objects already transferred are retained') });
    await expect(cancelLfsTransfer(repo, events[0].id)).rejects.toThrow('no longer running');
  });

  it('handles process spawn errors and supports cancelling all active transfers', async () => {
    let promise = runLfsTransfer(repo, { kind: 'checkout', remote: '', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    child.emit('error', new Error('cannot spawn git'));
    expect(await promise).toMatchObject({ state: 'failed', message: expect.stringContaining('cannot spawn git') });
    mocks.spawn.mockClear(); child = new TransferProcess(); mocks.spawn.mockReturnValue(child);
    promise = runLfsTransfer(repo, { kind: 'checkout', remote: '', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    stopLfsTransfers(); child.emit('close', 0);
    expect(await promise).toMatchObject({ state: 'cancelled' });
  });

  it('accepts empty optional JSON collections and reports no prior transfer', async () => {
    mocks.gitCommand.mockImplementation(async (_repo, args) => args[1] === 'ls-files' || args[1] === 'track' ? '{}' : args[0] === 'remote' ? '' : 'git-lfs');
    expect(await getLfsState(repo)).toMatchObject({ files: [], patterns: [], totalFiles: 0 });
    expect(await getLfsTransfer(repo)).toBeNull();
  });

  it('refuses non-file attribute entries before saving a snapshot', async () => {
    await fs.mkdir(path.join(repo, '.gitattributes'));
    await expect(setLfsTracking(repo, '*.png', true)).rejects.toThrow('regular file');
    expect(mocks.createRestorePoint).not.toHaveBeenCalled();
  });

  it('retains sanitized nonfatal stderr in successful transfer results', async () => {
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    expect(await getLfsTransfer(repo)).toMatchObject({ state: 'running' });
    child.stderr.write('Warning: https://secret@host.invalid/file?token=private'); child.emit('close', 0);
    const result = await promise;
    expect(result.message).toContain('Warning: https://[credentials]@host.invalid/file?token=[redacted]');
  });

  it('uses a useful exit-code error when Git LFS fails without stderr', async () => {
    const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    child.emit('close', 9);
    expect(await promise).toMatchObject({ state: 'failed', message: expect.stringContaining('code 9') });
  });

  it.each(['win32', 'linux', 'no-pid'])('bounds cancellation and escalates only its process tree: %s', async platform => {
    const originalPlatform = process.platform;
    const killer = new EventEmitter();
    Object.defineProperty(process, 'platform', { value: platform === 'no-pid' ? 'linux' : platform });
    if (platform === 'no-pid') child.pid = 0;
    mocks.spawn.mockImplementation((command: string) => command === 'taskkill' ? killer : child);
    vi.mocked(process.kill).mockImplementation(() => { throw new Error('process group unavailable'); });
    vi.useFakeTimers();
    try {
      const events: LfsTransfer[] = [];
      const promise = runLfsTransfer(repo, { kind: 'fetch', remote: 'origin', head }, state => events.push(state));
      await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
      const id = events[0].id;
      await cancelLfsTransfer(repo, id); await cancelLfsTransfer(repo, id);
      await vi.advanceTimersByTimeAsync(2500);
      if (platform === 'win32') {
        expect(mocks.spawn).toHaveBeenCalledWith('taskkill', ['/PID', String(child.pid), '/T'], { windowsHide: true, stdio: 'ignore' });
        expect(mocks.spawn).toHaveBeenCalledWith('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.emit('error', new Error('taskkill unavailable')); expect(child.kill).toHaveBeenCalled();
      } else if (platform === 'linux') {
        expect(process.kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
        expect(child.kill).toHaveBeenCalledTimes(2);
      } else expect(process.kill).not.toHaveBeenCalled();
      child.emit('error', new Error('stopped during cancellation'));
      expect(await promise).toMatchObject({ state: 'cancelled' });
    } finally { Object.defineProperty(process, 'platform', { value: originalPlatform }); }
  });

  it('keeps completion authoritative when progress cannot be read', async () => {
    const promise = runLfsTransfer(repo, { kind: 'checkout', remote: '', head }, vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    const file = mocks.spawn.mock.calls[0][2].env.GIT_LFS_PROGRESS;
    await fs.unlink(file); child.emit('close', 0);
    expect(await promise).toMatchObject({ state: 'completed', message: 'LFS operation completed.' });
  });

});
