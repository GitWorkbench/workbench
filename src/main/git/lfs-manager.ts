import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { LfsState, LfsTransfer } from '../../shared/types';
import { gitCommand, resolveCommit } from './advanced-process';
import { createRestorePoint } from './restore-points';
import { getRepoOperationState } from './conflicts-rebase';

export async function getLfsState(repo: string): Promise<LfsState> {
  const result: LfsState = { repo: await fs.realpath(repo), installed: false, configured: false, version: '', head: '', remotes: [], patterns: [], files: [], totalFiles: 0 };
  try { result.version = (await gitCommand(repo, ['lfs', 'version'])).trim(); result.installed = true; }
  catch { result.warning = 'Git LFS is not available on PATH. Install it from git-lfs.com, then refresh.'; return result; }
  result.head = await resolveCommit(repo, 'HEAD').catch(() => '');
  result.remotes = (await gitCommand(repo, ['remote'])).trim().split('\n').filter(Boolean);
  result.configured = !!(await gitCommand(repo, ['config', '--get', 'filter.lfs.process']).catch(() => '')).trim();
  try {
    result.patterns = JSON.parse(await gitCommand(repo, ['lfs', 'track', '--json'])).patterns || [];
    const files = JSON.parse(await gitCommand(repo, ['lfs', 'ls-files', '--json'])).files || [];
    result.totalFiles = files.length;
    result.files = files.slice(0, 10000).map((f: Record<string, any>) => ({ name: String(f.name), oid: String(f.oid), size: Number(f.size) || 0, downloaded: !!f.downloaded, checkout: !!f.checkout }));
    if (files.length > result.files.length) result.warning = 'Showing the first 10,000 LFS files. Transfers still use the complete current revision.';
  } catch (e) { result.warning = `Could not read all LFS details. A recent Git LFS with JSON output is required. ${String(e)}`; }
  return result;
}

export async function configureLfs(repo: string, skipSmudge: boolean) {
  try { await gitCommand(repo, ['lfs', 'install', '--local', ...(skipSmudge ? ['--skip-smudge'] : [])]); }
  catch (e) { throw new Error(`LFS setup did not finish. Filter configuration may have been written; an existing pre-push hook was not overwritten. Review 'git lfs install --manual' to integrate existing hooks. ${String(e)}`); }
  return getLfsState(repo);
}

export async function setLfsTracking(repo: string, pattern: string, tracked: boolean, literal = false) {
  if (typeof pattern !== 'string' || !pattern.trim() || pattern.length > 4096 || /[\0\r\n]/.test(pattern) || pattern.startsWith('!') || pattern.startsWith('-')) throw new Error('Enter one non-empty file pattern, such as *.psd or assets/**.');
  const attrs = await fs.lstat(path.join(repo, '.gitattributes')).catch(() => null);
  // lstat reports symbolic links as non-files, so this also rejects symlinks.
  if (attrs && !attrs.isFile()) throw new Error('.gitattributes must be a regular file in this repository.');
  await createRestorePoint(repo, `Before ${tracked ? 'tracking' : 'untracking'} LFS pattern: ${pattern}`);
  await gitCommand(repo, ['lfs', tracked ? 'track' : 'untrack', ...(tracked && literal ? ['--filename'] : []), '--', pattern]);
  return getLfsState(repo);
}

const transfers = new Map<string, { state: LfsTransfer; child: ChildProcess; cancel: () => void }>();
const recent = new Map<string, LfsTransfer>();
const safeError = (text: string) => text.replace(/(https?:\/\/)[^\s/@]+@/g, '$1[credentials]@').replace(/([?&](?:token|access_token|key)=)[^\s&]+/gi, '$1[redacted]').slice(-3000);
export function stopLfsTransfers() { for (const entry of transfers.values()) entry.cancel(); }
export async function getLfsTransfer(repo: string) { const key = await fs.realpath(repo); return transfers.get(key)?.state || recent.get(key) || null; }
export async function cancelLfsTransfer(repo: string, id: string) {
  const entry = transfers.get(await fs.realpath(repo));
  if (!entry || entry.state.id !== id) throw new Error('That transfer is no longer running.');
  entry.cancel(); return { ok: true };
}

export async function runLfsTransfer(repo: string, input: { kind: LfsTransfer['kind']; remote: string; head: string }, emit: (state: LfsTransfer) => void): Promise<LfsTransfer> {
  if (!input || !['fetch', 'pull', 'push', 'checkout'].includes(input.kind)) throw new Error('Choose an LFS action.');
  const key = await fs.realpath(repo);
  if (transfers.has(key)) throw new Error('An LFS operation is already running for this repository.');
  const state = await getLfsState(repo);
  if (!state.installed) throw new Error(state.warning);
  if (!state.head || state.head !== input.head) throw new Error('The checked-out revision changed. Refresh LFS details first.');
  if (input.kind !== 'checkout' && (!state.remotes.includes(input.remote) || input.remote.startsWith('-'))) throw new Error('Select a configured Git remote.');
  const op = await getRepoOperationState(repo);
  if ((input.kind === 'pull' || input.kind === 'checkout') && (op.inMerge || op.inRebase || op.inCherryPick || op.conflictedFiles.length)) throw new Error('Finish the active Git operation before populating LFS working files. Fetch to cache is still available.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-lfs-')), progressFile = path.join(directory, 'progress');
  await fs.writeFile(progressFile, '');
  const args = ['lfs', input.kind, ...(input.kind === 'checkout' ? [] : [input.remote]), ...(input.kind === 'fetch' || input.kind === 'push' ? [state.head] : [])];
  const transfer: LfsTransfer = { id: randomUUID(), repo: key, kind: input.kind, state: 'running', current: 0, totalFiles: 0, bytes: 0, totalBytes: 0, file: '', message: input.kind === 'checkout' ? 'Populating files from the local cache…' : 'Connecting to the LFS server…' };
  let stderr = '', cancelled = false, finished = false, reading = false, position = 0, partial = '';
  const child = spawn('git', args, { cwd: repo, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_PROGRESS: progressFile, GIT_LFS_FORCE_PROGRESS: '1' } });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const kill = (force = false) => {
    if (!child.pid || finished) return;
    if (process.platform === 'win32') { const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill()); }
    else try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { child.kill(); }
  };
  const cancel = () => { if (cancelled) return; cancelled = true; transfer.message = 'Cancelling…'; emit({ ...transfer }); kill(); killTimer = setTimeout(() => kill(true), 2500); };
  transfers.set(key, { state: transfer, child, cancel }); emit({ ...transfer });
  const readProgress = async () => {
    if (reading) return; reading = true;
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      file = await fs.open(progressFile, 'r'); const data = Buffer.alloc(256 * 1024), read = await file.read(data, 0, data.length, position);
      position += read.bytesRead; partial += data.subarray(0, read.bytesRead).toString('utf8');
      const lines = partial.split('\n'); partial = lines.pop() || '';
      for (const line of lines) {
        const match = /^(checkout|download|upload) (\d+)\/(\d+) (\d+)\/(\d+) (.*)$/.exec(line.replace(/\r$/, ''));
        if (match) Object.assign(transfer, { current: Number(match[2]), totalFiles: Number(match[3]), bytes: Number(match[4]), totalBytes: Number(match[5]), file: match[6], ...(transfer.state === 'running' && !cancelled ? { message: `${match[1]} ${match[2]}/${match[3]} files` } : {}) });
      }
      if (lines.length) emit({ ...transfer });
    } catch { /* Progress is optional; process completion remains authoritative. */ }
    finally { await file?.close(); reading = false; }
  };
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000); });
  const poll = setInterval(() => void readProgress(), 250);
  const timeout = setTimeout(() => { transfer.message = 'LFS exceeded 30 minutes. Cancelling; retry to reuse downloaded objects.'; cancel(); }, 30 * 60_000);
  try {
    await new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 || cancelled ? resolve() : reject(new Error(safeError(stderr) || `Git LFS exited with code ${code}.`))); });
    transfer.state = cancelled ? 'cancelled' : 'completed';
    transfer.message = cancelled ? 'Cancelled. Objects already transferred are retained and may be reused on retry.' : `${input.kind === 'push' ? 'LFS objects uploaded; Git branch refs were not pushed.' : 'LFS operation completed.'}${stderr.trim() ? ` ${safeError(stderr)}` : ''}`;
  } catch (error) { transfer.state = cancelled ? 'cancelled' : 'failed'; transfer.message = safeError(String(error)); }
  finally {
    finished = true; clearInterval(poll); clearTimeout(timeout); if (killTimer) clearTimeout(killTimer);
    await readProgress();
    // Last progress messages must not replace the completion/error summary.
    transfers.delete(key); recent.set(key, { ...transfer }); emit({ ...transfer });
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
  return { ...transfer };
}
