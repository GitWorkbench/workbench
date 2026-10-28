import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaygroundSession, checkPlaygroundSession, listPlaygroundSessions } from '../../src/main/playground';
import { getPlaygroundLab, runPlaygroundCommand, savePlaygroundFile } from '../../src/main/playground-lab';
import type { PlaygroundChallengeId } from '../../src/shared/types';
import { playgroundLessons } from '../../src/shared/playground-learning';
import { playgroundChallenges } from '../../src/shared/playground';
let root: string;
beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-learning-'))); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
const create = async (id: PlaygroundChallengeId) => {
  const session = await createPlaygroundSession(root, id);
  const command = (input: string) => runPlaygroundCommand(root, session.id, input);
  const save = async (file: string, content: string) => {
    const current = (await getPlaygroundLab(root, session.id)).files.find(item => item.path === file)!;
    return savePlaygroundFile(root, session.id, file, content, current.exists ? current.content : null);
  };
  return { session, command, save, snapshot: () => getPlaygroundLab(root, session.id) };
};
describe('guided lessons with real Git', () => {
  it('teaches status, log, editing and diff in order, retaining verified steps after reopening', async () => {
    const lab = await create('git-basics');
    expect((await lab.snapshot()).steps).toEqual([]);
    expect((await lab.command('git diff')).snapshot.steps).not.toContain('read-diff');
    expect((await lab.command('git status')).snapshot.steps).toContain('read-status');
    await lab.command('git log --oneline');
    const edited = await lab.save('notes.txt', 'Hello, Git!\nLearning by doing.\n');
    expect(edited.changed).toEqual(['notes.txt']); expect(edited.commits).toHaveLength(1); expect(edited.progress.session.completedAt).toBeUndefined();
    const result = await lab.command('git diff'); expect(result.output).toContain('+Learning by doing.');
    expect(result.snapshot.session.completedAt).toBeTruthy(); expect(result.snapshot.steps).toHaveLength(4);
    expect((await lab.snapshot()).session.completedAt).toBe(result.snapshot.session.completedAt);
  });
  it('teaches file staging and verifies the existing focused commit exercise', async () => {
    const lab = await create('first-commit');
    await lab.command('git status'); const staged = await lab.command('git add mission.txt');
    expect(staged.snapshot.staged).toEqual(['mission.txt']); expect(staged.snapshot.steps).toContain('stage');
    expect((await lab.command('git diff --staged')).output).toContain('focused commit');
    const completed = await lab.command('git commit -m "My first focused commit"');
    expect(completed.snapshot.session.completedAt).toBeTruthy(); expect(completed.snapshot.changed).toEqual(['scratch.txt']);
  });
  it('unstages without discarding the edit', async () => {
    const lab = await create('unstage'); expect((await lab.snapshot()).staged).toEqual(['draft.txt']);
    await lab.command('git diff --staged'); const result = await lab.command('git restore --staged draft.txt');
    expect(result.snapshot.session.completedAt).toBeTruthy(); expect(result.snapshot.staged).toEqual([]);
    expect(result.snapshot.files[0].content).toContain('Keep this edit');
  });
  it('creates a branch and its first file, while preserving main', async () => {
    const lab = await create('branches'); expect((await lab.snapshot()).files[0].exists).toBe(false);
    await lab.command('git switch -c feature/greeting');
    await lab.save('greeting.txt', 'Hello from my branch!\n'); await lab.command('git add greeting.txt');
    const result = await lab.command('git commit -m "Add greeting"');
    expect(result.snapshot.branch).toBe('feature/greeting'); expect(result.snapshot.session.completedAt).toBeTruthy();
  });
  it.each(['merge-branches', 'cherry-pick'] as const)('combines real history for %s', async id => {
    const lab = await create(id); expect((await lab.snapshot()).session.completedAt).toBeUndefined();
    await lab.command('git log --oneline --all');
    const result = await lab.command(id === 'merge-branches' ? 'git merge feature' : 'git cherry-pick feature/note');
    expect(result.ok).toBe(true); expect(result.snapshot.session.completedAt).toBeTruthy();
    expect(result.snapshot.files.every(file => file.exists)).toBe(true);
  });
  it('explains a failed command, resolves a prepared conflict, and finishes its merge', async () => {
    const lab = await create('merge-conflict');
    expect((await lab.snapshot()).conflicts).toEqual(['settings.json']);
    const blocked = await lab.command('git commit -m "Too early"'); expect(blocked.ok).toBe(false); expect(blocked.output).toContain('Git paused for a conflict');
    await lab.command('git status'); await lab.save('settings.json', '{"theme":"dark","notifications":true}\n');
    await lab.command('git add settings.json');
    expect((await lab.command('git commit -m "Combine both improvements"')).snapshot.session.completedAt).toBeTruthy();
  });
  it('tracks a stash round trip without awarding an untouched starting state', async () => {
    const lab = await create('stash-changes'); expect((await lab.snapshot()).session.completedAt).toBeUndefined();
    await lab.command('git diff'); const saved = await lab.command('git stash push -m "Pause"');
    expect(saved.snapshot.changed).toEqual([]); expect(saved.snapshot.steps).toContain('stash-saved');
    expect((await lab.command('git stash pop')).snapshot.session.completedAt).toBeTruthy();
  });
  it('recovers the hidden commit through the guided prompt', async () => {
    const lab = await create('lost-commit'); await lab.command('git reflog');
    expect((await lab.command('git branch recovered-treasure HEAD@{1}')).snapshot.session.completedAt).toBeTruthy();
  });
  it('teaches bisect with a live historical file and verifies the correct culprit', async () => {
    const lab = await create('bisect'); const started = await lab.command('git bisect start playground-bad playground-good');
    expect(started.snapshot.branch).toBe(''); expect(started.snapshot.steps).toContain('start');
    for (let index = 0; index < 4; index++) {
      const current = await lab.snapshot();
      const result = await lab.command(current.files[0].content.trim() === '42' ? 'git bisect good' : 'git bisect bad');
      if (result.snapshot.session.completedAt) break;
    }
    expect((await lab.snapshot()).session.completedAt).toBeTruthy();
    expect((await lab.command('git bisect reset')).snapshot.branch).toBe('main');
  });
  it('serializes concurrent commands so a commit cannot race ahead of staging', async () => {
    const lab = await create('first-commit');
    const results = await Promise.all([lab.command('git add mission.txt'), lab.command('git commit -m "Queued after staging"')]);
    expect(results.every(result => result.ok)).toBe(true); expect(results[1].snapshot.session.completedAt).toBeTruthy();
    await expect(lab.command('git push')).rejects.toThrow('outside this practice prompt');
    expect((await lab.command('git status')).ok).toBe(true);
  });
  it('rejects invalid paths, binary/oversized text, and stale editor snapshots while preserving files', async () => {
    const lab = await create('git-basics');
    for (const file of ['../outside', '.git/config', '/tmp/other']) await expect(savePlaygroundFile(root, lab.session.id, file, 'bad', null)).rejects.toThrow('practice files');
    for (const content of [null, 'a'.repeat(20_001), '\0']) await expect(savePlaygroundFile(root, lab.session.id, 'notes.txt', content as string, 'Hello, Git!\n')).rejects.toThrow('plain text');
    await fs.writeFile(path.join(lab.session.path, 'notes.txt'), 'External edit');
    await expect(savePlaygroundFile(root, lab.session.id, 'notes.txt', 'overwrite', 'Hello, Git!\n')).rejects.toThrow('changed since');
    expect(await fs.readFile(path.join(lab.session.path, 'notes.txt'), 'utf8')).toBe('External edit');
    await expect(savePlaygroundFile(root, lab.session.id, 12 as never, 'text', null)).rejects.toThrow('practice files');
  });
  it('rejects replaced, unreadable, or oversized files instead of following or truncating them', async () => {
    const lab = await create('git-basics'), file = path.join(lab.session.path, 'notes.txt');
    const target = path.join(root, 'outside'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'kept.txt'), 'keep'); await fs.unlink(file); await fs.symlink(target, file, 'junction');
    await expect(lab.snapshot()).rejects.toThrow('was replaced'); expect(await fs.readFile(path.join(target, 'kept.txt'), 'utf8')).toBe('keep');
    await fs.unlink(file); await fs.mkdir(file); await expect(lab.snapshot()).rejects.toThrow('was replaced');
    await fs.rmdir(file); await fs.writeFile(file, 'x'.repeat(20_001)); await expect(lab.snapshot()).rejects.toThrow('20 KB');
  });
  it('has a complete curriculum with unique goals, actionable steps, and valid comprehension questions', () => {
    expect(playgroundLessons).toHaveLength(10); expect(new Set(playgroundLessons.map(item => item.id)).size).toBe(10);
    for (const lesson of playgroundLessons) {
      expect(playgroundChallenges.find(item => item.id === lesson.id)).toBeTruthy();
      expect(lesson.steps.length).toBeGreaterThanOrEqual(2); expect(new Set(lesson.steps.map(step => step.id)).size).toBe(lesson.steps.length);
      expect(lesson.quiz.options[lesson.quiz.answer]).toBeTruthy(); expect(lesson.concept.length).toBeGreaterThan(50);
    }
  });
});
