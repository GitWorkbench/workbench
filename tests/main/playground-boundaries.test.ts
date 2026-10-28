import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as processAdapter from '../../src/main/git/advanced-process';
import { checkPlaygroundSession, createPlaygroundSession, listPlaygroundSessions, playgroundGit, readPlaygroundSteps, savePlaygroundSteps } from '../../src/main/playground';
import { getPlaygroundLab, runPlaygroundCommand } from '../../src/main/playground-lab';
let root: string;
beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-playground-boundary-'))); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
const error = (message: string, code: string) => Object.assign(new Error(message), { code });

it('propagates a non-conflict merge failure and keeps failed setup folders', async () => {
  const actual = processAdapter.gitWithEnvironment;
  vi.spyOn(processAdapter, 'gitWithEnvironment').mockImplementation((repo, env, timeout) => {
    const adapter = actual(repo, env, timeout);
    return { raw: args => args.includes('merge') ? Promise.reject(new Error('merge failed: disk full')) : adapter.raw(args) };
  });
  await expect(createPlaygroundSession(root, 'merge-conflict')).rejects.toThrow('disk full');
  const listed = await listPlaygroundSessions(root); expect(listed.sessions).toEqual([]); expect(listed.warnings).toHaveLength(1);
});
it('rejects a setup that did not leave the expected conflict', async () => {
  const actual = processAdapter.gitWithEnvironment;
  vi.spyOn(processAdapter, 'gitWithEnvironment').mockImplementation((repo, env, timeout) => {
    const adapter = actual(repo, env, timeout);
    return { raw: args => args.includes('merge') ? Promise.resolve('') : adapter.raw(args) };
  });
  await expect(createPlaygroundSession(root, 'merge-conflict')).rejects.toThrow('expected practice conflict');
});
it('reports inaccessible completion metadata', async () => {
  const attempt = await createPlaygroundSession(root, 'lost-commit');
  vi.spyOn(fs, 'stat').mockRejectedValueOnce(error('metadata access denied', 'EACCES'));
  await expect(checkPlaygroundSession(root, attempt.id)).rejects.toThrow('metadata access denied');
});
it('reports completion-write errors rather than awarding a non-persistent success', async () => {
  const attempt = await createPlaygroundSession(root, 'lost-commit');
  const adapter = processAdapter.gitWithEnvironment(attempt.path, {});
  await adapter.raw(['branch', 'rescued', 'HEAD@{1}']);
  vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(error('storage full', 'ENOSPC'));
  await expect(checkPlaygroundSession(root, attempt.id)).rejects.toThrow('storage full');
  expect((await listPlaygroundSessions(root)).sessions[0].completedAt).toBeUndefined();
});
it('tolerates another verifier creating the completion marker first', async () => {
  const attempt = await createPlaygroundSession(root, 'lost-commit');
  await processAdapter.gitWithEnvironment(attempt.path, {}).raw(['branch', 'rescued', 'HEAD@{1}']);
  const write = fs.writeFile.bind(fs);
  vi.spyOn(fs, 'writeFile').mockImplementationOnce(async (...args) => { await write(...args); throw error('already completed', 'EEXIST'); });
  expect((await checkPlaygroundSession(root, attempt.id)).session.completedAt).toBeTruthy();
});
it('rejects a replaced attempt folder before reading its contents', async () => {
  const attempt = await createPlaygroundSession(root, 'lost-commit');
  const folder = path.dirname(attempt.path), kept = path.join(root, 'kept');
  await fs.rename(folder, kept); await fs.symlink(kept, folder, 'junction');
  await expect(checkPlaygroundSession(root, attempt.id)).rejects.toThrow('moved or replaced');
  await fs.unlink(folder); await fs.writeFile(folder, 'not a folder');
  await expect(checkPlaygroundSession(root, attempt.id)).rejects.toThrow('moved or replaced');
});
it('validates persisted lesson milestones, drops unknown entries, and retains prior progress on a failed save', async () => {
  const attempt = await createPlaygroundSession(root, 'git-basics'), ledger = path.join(attempt.path, '..', 'learning.json');
  expect(await readPlaygroundSteps(attempt)).toEqual([]);
  for (const invalid of ['{', 'null', '{}', '[1]']) {
    await fs.writeFile(ledger, invalid);
    await expect(readPlaygroundSteps(attempt)).rejects.toThrow('progress file');
  }
  await fs.writeFile(ledger, '["read-status","unknown","read-status","read-history"]');
  expect(await readPlaygroundSteps(attempt)).toEqual(['read-status', 'read-history']);
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(error('disk full', 'ENOSPC'));
  await expect(savePlaygroundSteps(attempt, ['read-diff'])).rejects.toThrow('disk full');
  expect(await readPlaygroundSteps(attempt)).toEqual(['read-status', 'read-history']);
});
it('reports inaccessible lesson files and never awards completion after a missing or unreadable working file', async () => {
  const attempt = await createPlaygroundSession(root, 'unstage'), file = path.join(attempt.path, 'draft.txt');
  await fs.unlink(file);
  expect((await checkPlaygroundSession(root, attempt.id)).checks[1].passed).toBe(false);
  const read = fs.readFile.bind(fs);
  vi.spyOn(fs, 'readFile').mockImplementation((...args) => String(args[0]) === file ? Promise.reject(error('read denied', 'EACCES')) : read(...args));
  await expect(checkPlaygroundSession(root, attempt.id)).rejects.toThrow('read denied');
  await expect(getPlaygroundLab(root, attempt.id)).rejects.toThrow('read denied');
});
it('records stash milestones when the normal workspace, rather than the guided prompt, saves the stash', async () => {
  const attempt = await createPlaygroundSession(root, 'stash-changes'), run = playgroundGit(attempt.path);
  await run('stash', 'push');
  const parked = await checkPlaygroundSession(root, attempt.id);
  expect(parked.checks[0].passed).toBe(true); expect(parked.session.completedAt).toBeUndefined();
  await checkPlaygroundSession(root, attempt.id);
  await run('stash', 'pop'); expect((await checkPlaygroundSession(root, attempt.id)).session.completedAt).toBeTruthy();
});
it('bounds command output, reports non-Error Git failures, and releases a failed command queue', async () => {
  const attempt = await createPlaygroundSession(root, 'git-basics'), actual = processAdapter.gitWithEnvironment;
  let result: string | null = 'x'.repeat(25_000);
  vi.spyOn(processAdapter, 'gitWithEnvironment').mockImplementation((repo, env, timeout) => {
    const adapter = actual(repo, env, timeout);
    return { raw: args => args.slice(-2).join(' ') === 'status --short' ? result === null ? Promise.reject('Git process interrupted') : Promise.resolve(result) : adapter.raw(args) };
  });
  expect((await runPlaygroundCommand(root, attempt.id, 'git status --short')).output).toHaveLength(24_000);
  result = null;
  const failure = await runPlaygroundCommand(root, attempt.id, 'git status --short');
  expect(failure.ok).toBe(false); expect(failure.output).toBe('Git process interrupted');
  const queued = await Promise.allSettled([runPlaygroundCommand(root, attempt.id, 'git push'), runPlaygroundCommand(root, attempt.id, 'git status')]);
  expect(queued[0].status).toBe('rejected'); expect(queued[1].status).toBe('fulfilled');
});
