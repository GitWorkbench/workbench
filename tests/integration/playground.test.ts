import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaygroundSession, listPlaygroundSessions, checkPlaygroundSession } from '../../src/main/playground';
import { playgroundChallenges } from '../../src/shared/playground';
import type { PlaygroundSession } from '../../src/shared/types';

const execute = promisify(execFile);
let root: string;
const run = async (session: PlaygroundSession, ...args: string[]) => (await execute('git', args, { cwd: session.path, encoding: 'utf8' })).stdout.trim();
const file = (session: PlaygroundSession, name: string) => path.join(session.path, name);
const completeCommit = async (session: PlaygroundSession) => { await run(session, 'add', 'mission.txt'); await run(session, 'commit', '-m', 'Complete the mission'); };
beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-playground-'))); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

describe('real Git Playground challenges', () => {
  it('creates isolated repositories, verifies a focused commit, keeps old attempts, and persists completion', async () => {
    const session = await createPlaygroundSession(root, 'first-commit');
    expect(await run(session, 'remote')).toBe('');
    expect(await run(session, 'config', 'user.email')).toBe('guide@git-workbench.invalid');
    expect(await run(session, 'config', '--local', 'core.hooksPath')).toBe(file(session, '.git/playground-hooks'));
    expect((await checkPlaygroundSession(root, session.id)).checks.map(c => c.passed)).toEqual([false, false, true]);
    await completeCommit(session);
    const result = await checkPlaygroundSession(root, session.id);
    expect(result.checks.every(c => c.passed)).toBe(true); expect(result.session.completedAt).toBeTruthy();
    const again = await checkPlaygroundSession(root, session.id);
    expect(again.session.completedAt).toBe(result.session.completedAt); expect(again.observation).toContain('Challenge completed');
    await fs.writeFile(file(session, 'my-experiment.txt'), 'keep this');
    const fresh = await createPlaygroundSession(root, 'first-commit');
    expect(fresh.path).not.toBe(session.path); expect(await fs.readFile(file(session, 'my-experiment.txt'), 'utf8')).toBe('keep this');
    const listed = await listPlaygroundSessions(root);
    expect(listed.warnings).toEqual([]); expect(listed.sessions.map(s => s.id)).toEqual([fresh.id, session.id]);
    expect(listed.sessions[1].completedAt).toBe(result.session.completedAt);
  });
  it('does not award a commit that includes scratch work or loses the scratch file', async () => {
    const session = await createPlaygroundSession(root, 'first-commit');
    await run(session, 'add', '--all'); await run(session, 'commit', '-m', 'Too much');
    expect((await checkPlaygroundSession(root, session.id)).checks.map(c => c.passed)).toEqual([true, false, false]);
    const fresh = await createPlaygroundSession(root, 'first-commit');
    await completeCommit(fresh); await fs.unlink(file(fresh, 'scratch.txt'));
    expect((await checkPlaygroundSession(root, fresh.id)).checks.map(c => c.passed)).toEqual([true, true, false]);
    const original = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]).endsWith('scratch.txt')) return Promise.reject(Object.assign(new Error('scratch access denied'), { code: 'EACCES' }));
      return original(...args);
    }) as typeof fs.readFile);
    await expect(checkPlaygroundSession(root, fresh.id)).rejects.toThrow('scratch access denied');
  });
  it('requires the merge parents and the combined result, then recognizes the completed merge', async () => {
    const session = await createPlaygroundSession(root, 'merge-conflict');
    expect(await run(session, 'ls-files', '--unmerged')).toContain('settings.json');
    expect((await checkPlaygroundSession(root, session.id)).checks.map(c => c.passed)).toEqual([false, false]);
    await fs.writeFile(file(session, 'settings.json'), '{"theme":"dark","notifications":true}\n');
    await run(session, 'add', 'settings.json'); await run(session, 'commit', '-m', 'Combine both improvements');
    const result = await checkPlaygroundSession(root, session.id);
    expect(result.checks.map(c => c.passed)).toEqual([true, true]); expect(result.session.completedAt).toBeTruthy();
  });
  it.each(['invalid JSON', 'null', '{}', '{"theme":"light","notifications":true}', '{"theme":"dark"}', '{"theme":"dark","notifications":false}'])('rejects a wrong conflict result: %s', async content => {
    const session = await createPlaygroundSession(root, 'merge-conflict');
    await fs.writeFile(file(session, 'settings.json'), content);
    await run(session, 'add', 'settings.json'); await run(session, 'commit', '-m', 'Incomplete resolution');
    expect((await checkPlaygroundSession(root, session.id)).checks.map(c => c.passed)).toEqual([true, false]);
  });
  it('recovers a truly unreachable commit with a local branch', async () => {
    const session = await createPlaygroundSession(root, 'lost-commit');
    expect((await checkPlaygroundSession(root, session.id)).checks[0].passed).toBe(false);
    expect(await fs.readFile(file(session, 'treasure.txt'), 'utf8').catch(() => 'missing')).toBe('missing');
    const hash = await run(session, 'rev-parse', 'HEAD@{1}');
    await run(session, 'branch', 'recovered-treasure', hash);
    expect((await checkPlaygroundSession(root, session.id)).session.completedAt).toBeTruthy();
    expect(await run(session, 'show', 'recovered-treasure:treasure.txt')).toContain('You found it');
  });
  it('finds the actual regression through Git bisect and retains the award after resetting', async () => {
    const session = await createPlaygroundSession(root, 'bisect');
    const initial = await checkPlaygroundSession(root, session.id);
    expect(initial.checks[0].passed).toBe(false); expect(initial.observation).toContain('41');
    await run(session, 'bisect', 'start', 'playground-bad', 'playground-good');
    for (let count = 0; count < 5; count++) {
      const answer = await fs.readFile(file(session, 'answer.txt'), 'utf8');
      const output = await run(session, 'bisect', answer.trim() === '42' ? 'good' : 'bad');
      if (output.includes('is the first')) break;
    }
    const result = await checkPlaygroundSession(root, session.id);
    expect(result.checks[0].passed, await fs.readFile(file(session, '.git/BISECT_LOG'), 'utf8')).toBe(true); expect(result.session.completedAt).toBeTruthy();
    await run(session, 'bisect', 'reset');
    expect((await checkPlaygroundSession(root, session.id)).session.completedAt).toBe(result.session.completedAt);
  });
  it('rejects a falsely identified regression and propagates unreadable bisect logs', async () => {
    const session = await createPlaygroundSession(root, 'bisect');
    await fs.writeFile(file(session, '.git/BISECT_LOG'), `# first bad commit: [${await run(session, 'rev-parse', 'HEAD')}]\n`);
    expect((await checkPlaygroundSession(root, session.id)).checks[0].passed).toBe(false);
    const original = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]).endsWith('BISECT_LOG')) return Promise.reject(Object.assign(new Error('bisect access denied'), { code: 'EACCES' }));
      return original(...args);
    }) as typeof fs.readFile);
    await expect(checkPlaygroundSession(root, session.id)).rejects.toThrow('bisect access denied');
  });
  it('reports broken attempts while retaining valid sessions and ignoring unrelated files', async () => {
    const session = await createPlaygroundSession(root, 'lost-commit');
    const broken = await createPlaygroundSession(root, 'first-commit');
    await fs.writeFile(path.join(root, broken.id, 'attempt.json'), '{broken');
    await fs.writeFile(path.join(root, 'unrelated.txt'), 'keep');
    const result = await listPlaygroundSessions(root);
    expect(result.sessions.map(s => s.id)).toEqual([session.id]); expect(result.warnings).toHaveLength(1); expect(result.warnings[0]).toContain(broken.id.slice(0, 8));
    expect(await fs.readFile(path.join(root, 'unrelated.txt'), 'utf8')).toBe('keep');
  });
  it.each([null, {}, { schema: 2 }, { id: 'wrong' }, { challengeId: 'unknown' }, { createdAt: 12 }, { createdAt: 'invalid' }, { initial: 12 }, { initial: 'invalid' }, { target: 12 }, { target: 'invalid' }])('rejects invalid attempt metadata %j', async patch => {
    const session = await createPlaygroundSession(root, 'lost-commit');
    const metadata = path.join(root, session.id, 'attempt.json');
    const saved = JSON.parse(await fs.readFile(metadata, 'utf8'));
    await fs.writeFile(metadata, JSON.stringify(patch === null ? null : Object.keys(patch).length ? { ...saved, ...patch } : {}));
    await expect(checkPlaygroundSession(root, session.id)).rejects.toThrow('invalid metadata');
  });
  it('rejects unknown challenges, invalid IDs, and replaced Git directories', async () => {
    await expect(createPlaygroundSession(root, 'unknown' as never)).rejects.toThrow('known Playground challenge');
    for (const id of ['../escape', '', 12]) await expect(checkPlaygroundSession(root, id as string)).rejects.toThrow('valid Playground attempt');
    const session = await createPlaygroundSession(root, 'lost-commit');
    await fs.rename(file(session, '.git'), file(session, 'original-git'));
    await fs.writeFile(file(session, '.git'), 'gitdir: /elsewhere');
    await expect(checkPlaygroundSession(root, session.id)).rejects.toThrow('moved or replaced');
    expect(await fs.readFile(file(session, '.git'), 'utf8')).toContain('/elsewhere');
  });
  it('rejects symlinked storage and attempts without following them', async () => {
    const external = path.join(root, 'external'); await fs.mkdir(external);
    const linkedRoot = path.join(root, 'linked'); await fs.symlink(external, linkedRoot, 'junction');
    await expect(listPlaygroundSessions(linkedRoot)).rejects.toThrow('symbolic link');
    const session = await createPlaygroundSession(root, 'lost-commit');
    await fs.rename(session.path, path.join(root, 'kept-repository'));
    await fs.symlink(path.join(root, 'kept-repository'), session.path, 'junction');
    await expect(checkPlaygroundSession(root, session.id)).rejects.toThrow('moved or replaced');
  });
  it('ignores inherited Git repository and index overrides during creation and verification', async () => {
    const original = await createPlaygroundSession(root, 'lost-commit');
    const head = await run(original, 'rev-parse', 'HEAD');
    vi.stubEnv('GIT_DIR', file(original, '.git')); vi.stubEnv('GIT_WORK_TREE', original.path); vi.stubEnv('GIT_INDEX_FILE', file(original, '.git/index'));
    const fresh = await createPlaygroundSession(root, 'first-commit');
    expect((await checkPlaygroundSession(root, fresh.id)).checks.map(c => c.passed)).toEqual([false, false, true]);
    vi.unstubAllEnvs(); expect(await run(original, 'rev-parse', 'HEAD')).toBe(head);
    expect(await fs.readFile(file(fresh, 'README.md'), 'utf8')).toContain('One focused commit');
  });
  it('exposes ten distinct challenges with actionable instructions and checks', () => {
    expect(new Set(playgroundChallenges.map(c => c.id)).size).toBe(10);
    expect(playgroundChallenges.every(c => c.steps.length >= 3 && c.checks.length && c.hint && c.tool)).toBe(true);
  });
});
