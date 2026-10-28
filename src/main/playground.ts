import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gitWithEnvironment } from './git/advanced-process';
import { playgroundChallenges } from '../shared/playground';
import { playgroundLessons } from '../shared/playground-learning';
import type { PlaygroundChallengeId, PlaygroundProgress, PlaygroundSession } from '../shared/types';

interface Attempt {
  schema: 1; id: string; challengeId: PlaygroundChallengeId; createdAt: string;
  initial: string; target: string;
}
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hashPattern = /^[a-f0-9]{40,64}$/;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const mission = 'Welcome to Git Playground.\nI can build a focused commit.\n';
const scratch = 'Scratch work: keep this file untracked.\n';

/** Ignore inherited repository/index/config overrides and never run hooks. */
export function playgroundGit(repo: string) {
  const raw = gitWithEnvironment(repo, {
    GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_COMMON_DIR: undefined, GIT_INDEX_FILE: undefined,
    GIT_OBJECT_DIRECTORY: undefined, GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
    GIT_CONFIG_COUNT: undefined, GIT_CONFIG_PARAMETERS: undefined, GIT_CONFIG_NOSYSTEM: '1', GIT_EXTERNAL_DIFF: undefined,
    GIT_CONFIG_GLOBAL: path.join(repo, '.git', 'playground-global-config'),
    GIT_AUTHOR_NAME: 'Git Workbench Guide', GIT_AUTHOR_EMAIL: 'guide@git-workbench.invalid',
    GIT_COMMITTER_NAME: 'Git Workbench Guide', GIT_COMMITTER_EMAIL: 'guide@git-workbench.invalid'
  });
  return async (...args: string[]) => (await raw.raw(['-c', `core.hooksPath=${path.join(repo, '.git', 'playground-hooks')}`, '-c', `core.worktree=${repo}`, '-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...args])).trim();
}

async function directoryRoot(directory: string) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('The Playground folder must not be a symbolic link.');
  return fs.realpath(directory);
}
export async function readPlaygroundAttempt(directory: string, id: string): Promise<{ attempt: Attempt; session: PlaygroundSession }> {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Choose a valid Playground attempt.');
  const root = await directoryRoot(directory), folder = path.join(root, id);
  if (!(await fs.lstat(folder)).isDirectory() || await fs.realpath(folder) !== folder) throw new Error('This Playground attempt was moved or replaced. Its files have been kept.');
  const attempt: Attempt = JSON.parse(await fs.readFile(path.join(folder, 'attempt.json'), 'utf8'));
  if (!attempt || attempt.schema !== 1 || attempt.id !== id || !playgroundChallenges.some(c => c.id === attempt.challengeId) ||
      typeof attempt.createdAt !== 'string' || !Number.isFinite(Date.parse(attempt.createdAt)) ||
      typeof attempt.initial !== 'string' || !hashPattern.test(attempt.initial) || typeof attempt.target !== 'string' || !hashPattern.test(attempt.target)) {
    throw new Error('This Playground attempt has invalid metadata. Its files have been kept.');
  }
  const repo = path.join(folder, attempt.challengeId);
  // Reject a moved/symlinked checkout or .git pointer before looking at its Git state.
  for (const candidate of [repo, path.join(repo, '.git')]) {
    if (!(await fs.lstat(candidate)).isDirectory() || await fs.realpath(candidate) !== candidate) throw new Error('This Playground attempt was moved or replaced. Its files have been kept.');
  }
  let completedAt: string | undefined;
  try { completedAt = (await fs.stat(path.join(folder, 'completed'))).mtime.toISOString(); }
  catch (error) { if (!missing(error)) throw error; }
  return { attempt, session: { id, path: repo, challengeId: attempt.challengeId, createdAt: attempt.createdAt, completedAt } };
}

export async function listPlaygroundSessions(directory: string) {
  const root = await directoryRoot(directory), sessions: PlaygroundSession[] = [], warnings: string[] = [];
  for (const entry of await fs.readdir(root)) {
    if (!idPattern.test(entry)) continue;
    try { sessions.push((await readPlaygroundAttempt(root, entry)).session); }
    catch { warnings.push(`Attempt ${entry.slice(0, 8)} could not be loaded. Its folder has been kept at ${path.join(root, entry)}.`); }
  }
  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { sessions, warnings };
}

/** Every start/reset allocates a new folder; existing attempts are never overwritten. */
export async function createPlaygroundSession(directory: string, challengeId: PlaygroundChallengeId): Promise<PlaygroundSession> {
  const challenge = playgroundChallenges.find(c => c.id === challengeId);
  if (!challenge) throw new Error('Choose a known Playground challenge.');
  const root = await directoryRoot(directory), id = randomUUID(), folder = path.join(root, id), repo = path.join(folder, challenge.id);
  await fs.mkdir(folder);
  await fs.mkdir(repo);
  const run = playgroundGit(repo);
  await run('init', '--template=', '--initial-branch=main');
  for (const [key, value] of Object.entries({ 'user.name': 'Git Workbench Guide', 'user.email': 'guide@git-workbench.invalid', 'core.hooksPath': path.join(repo, '.git', 'playground-hooks'), 'commit.gpgsign': 'false', 'tag.gpgsign': 'false', 'core.autocrlf': 'false' })) await run('config', '--local', key, value);
  await fs.writeFile(path.join(repo, 'README.md'), `# Git Playground: ${challenge.title}\n\n${challenge.goal}\n\n${challenge.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\nThis is a disposable local practice repository. No remote is configured. Start fresh from Git Playground to create another attempt; this folder is kept.\n`);
  const commit = async (message: string) => { await run('add', '--all'); await run('commit', '-m', message); return run('rev-parse', 'HEAD'); };
  let initial: string, target: string;
  if (challengeId === 'git-basics') {
    await fs.writeFile(path.join(repo, 'notes.txt'), 'Hello, Git!\n');
    initial = target = await commit('Your first snapshot');
  } else if (challengeId === 'unstage') {
    await fs.writeFile(path.join(repo, 'draft.txt'), 'Draft in progress.\n');
    initial = target = await commit('Start a draft');
    await fs.writeFile(path.join(repo, 'draft.txt'), 'Draft in progress.\nKeep this edit without staging it.\n');
    await run('add', 'draft.txt');
  } else if (challengeId === 'branches') {
    initial = target = await commit('Keep main at the starting point');
  } else if (challengeId === 'merge-branches' || challengeId === 'cherry-pick') {
    await commit('A shared starting point');
    const source = challengeId === 'merge-branches' ? 'feature' : 'feature/note';
    await run('checkout', '-b', source);
    await fs.writeFile(path.join(repo, challengeId === 'merge-branches' ? 'feature.txt' : 'note.txt'), challengeId === 'merge-branches' ? 'A useful feature.\n' : 'One commit, borrowed.\n');
    target = await commit('Add a useful change');
    await run('checkout', 'main');
    await fs.writeFile(path.join(repo, 'main.txt'), 'A stable foundation.\n');
    initial = await commit('Main continues its own work');
  } else if (challengeId === 'stash-changes') {
    await fs.writeFile(path.join(repo, 'draft.txt'), 'A saved starting point.\n');
    initial = target = await commit('Start an idea');
    await fs.writeFile(path.join(repo, 'draft.txt'), 'A saved starting point.\nAn unfinished idea.\n');
  } else if (challengeId === 'first-commit') {
    await fs.writeFile(path.join(repo, 'mission.txt'), 'Welcome to Git Playground.\n');
    initial = target = await commit('Prepare a focused commit');
    await fs.writeFile(path.join(repo, 'mission.txt'), mission);
    await fs.writeFile(path.join(repo, 'scratch.txt'), scratch);
  } else if (challengeId === 'merge-conflict') {
    const file = path.join(repo, 'settings.json');
    await fs.writeFile(file, '{"theme":"light","notifications":false}\n');
    await commit('Start with light theme and quiet notifications');
    await run('checkout', '-b', 'incoming');
    await fs.writeFile(file, '{"theme":"light","notifications":true}\n');
    target = await commit('Enable notifications');
    await run('checkout', 'main');
    await fs.writeFile(file, '{"theme":"dark","notifications":false}\n');
    initial = await commit('Choose the dark theme');
    try { await run('merge', '--no-edit', 'incoming'); }
    catch (error) { if (!(await run('ls-files', '--unmerged'))) throw error; }
    if (!(await run('ls-files', '--unmerged'))) throw new Error('Git did not prepare the expected practice conflict. Start a fresh attempt.');
  } else if (challengeId === 'lost-commit') {
    initial = await commit('Start the treasure hunt');
    await fs.writeFile(path.join(repo, 'treasure.txt'), 'You found it. Keep this commit on a branch!\n');
    target = await commit('Add the lost treasure');
    await run('reset', '--hard', initial);
  } else {
    initial = target = '';
    for (let index = 0; index < 7; index++) {
      await fs.writeFile(path.join(repo, 'answer.txt'), index < 3 ? '42\n' : '41\n');
      // An empty commit still represents a revision the learner can test.
      await run('add', '--all'); await run('commit', '--allow-empty', '-m', `Experiment ${index + 1}`);
      const head = await run('rev-parse', 'HEAD');
      if (index === 0) initial = head;
      if (index === 3) target = head;
    }
    await run('tag', 'playground-good', initial);
    await run('tag', 'playground-bad');
  }
  const attempt: Attempt = { schema: 1, id, challengeId, createdAt: new Date().toISOString(), initial, target };
  await fs.writeFile(path.join(folder, 'attempt.json'), JSON.stringify(attempt), { flag: 'wx' });
  return { id, challengeId, createdAt: attempt.createdAt, path: repo };
}

export async function checkPlaygroundSession(directory: string, id: string): Promise<PlaygroundProgress> {
  const { attempt, session } = await readPlaygroundAttempt(directory, id), run = playgroundGit(session.path);
  const challenge = playgroundChallenges.find(c => c.id === session.challengeId)!;
  if (session.completedAt) return { session, checks: challenge.checks.map(label => ({ label, passed: true })), observation: 'Challenge completed. You can keep experimenting or start a fresh attempt.' };
  let passed: boolean[], observation = '';
  if (attempt.challengeId === 'git-basics') {
    const steps = await readPlaygroundSteps(session);
    passed = [steps.includes('read-status'), steps.includes('read-history'), !!await run('diff', '--name-only', 'HEAD', '--', 'notes.txt'), steps.includes('read-diff')];
  } else if (attempt.challengeId === 'unstage') {
    passed = [!(await run('diff', '--cached', '--name-only')), await workingText(session, 'draft.txt') === 'Draft in progress.\nKeep this edit without staging it.\n', await run('rev-parse', 'HEAD') === attempt.initial];
  } else if (attempt.challengeId === 'branches') {
    passed = [await run('branch', '--show-current') === 'feature/greeting', await committedText(session, 'greeting.txt') === 'Hello from my branch!', await run('rev-parse', 'refs/heads/main') === attempt.initial];
  } else if (attempt.challengeId === 'merge-branches') {
    const parents = (await run('show', '-s', '--format=%P', 'HEAD')).split(' ');
    passed = [await run('branch', '--show-current') === 'main' && parents.includes(attempt.initial) && parents.includes(attempt.target), await committedText(session, 'main.txt') === 'A stable foundation.' && await committedText(session, 'feature.txt') === 'A useful feature.'];
  } else if (attempt.challengeId === 'cherry-pick') {
    passed = [await run('branch', '--show-current') === 'main' && await run('show', '-s', '--format=%P', 'HEAD') === attempt.initial, await committedText(session, 'main.txt') === 'A stable foundation.' && await committedText(session, 'note.txt') === 'One commit, borrowed.', await run('rev-parse', 'refs/heads/feature/note') === attempt.target];
  } else if (attempt.challengeId === 'stash-changes') {
    const stashes = await run('stash', 'list'), dirty = await run('status', '--porcelain');
    const steps = await readPlaygroundSteps(session);
    if (stashes && !dirty && !steps.includes('stash-saved')) { steps.push('stash-saved'); await savePlaygroundSteps(session, steps); }
    passed = [steps.includes('stash-saved'), await workingText(session, 'draft.txt') === 'A saved starting point.\nAn unfinished idea.\n', !stashes];
  } else if (attempt.challengeId === 'first-commit') {
    const content = await run('show', 'HEAD:mission.txt');
    const changed = await run('diff', '--name-only', attempt.initial, 'HEAD');
    const untracked = await run('ls-files', '--others', '--exclude-standard', '--', 'scratch.txt');
    const intact = await fs.readFile(path.join(session.path, 'scratch.txt'), 'utf8').catch(error => { if (missing(error)) return ''; throw error; });
    passed = [content === mission.trim(), changed === 'mission.txt', untracked === 'scratch.txt' && intact === scratch];
  } else if (attempt.challengeId === 'merge-conflict') {
    const parents = (await run('show', '-s', '--format=%P', 'HEAD')).split(' ');
    const unmerged = await run('ls-files', '--unmerged');
    const content = await run('show', 'HEAD:settings.json');
    let result: unknown;
    try { result = JSON.parse(content); } catch { result = null; }
    passed = [!unmerged && parents.includes(attempt.initial) && parents.includes(attempt.target),
      !!result && typeof result === 'object' && 'theme' in result && result.theme === 'dark' && 'notifications' in result && result.notifications === true];
  } else if (attempt.challengeId === 'lost-commit') {
    passed = [!!await run('for-each-ref', `--contains=${attempt.target}`, '--format=%(refname)', 'refs/heads/')];
  } else {
    const log = await fs.readFile(path.join(session.path, '.git', 'BISECT_LOG'), 'utf8').catch(error => { if (missing(error)) return ''; throw error; });
    passed = [new RegExp(`^# first ['"]?bad['"]? commit: \\[${attempt.target}\\]`, 'm').test(log)];
    observation = `answer.txt at the current revision: ${await run('show', 'HEAD:answer.txt')}. Mark Good for 42 or Bad for 41.`;
  }
  if (passed.every(Boolean)) {
    try { await fs.writeFile(path.join(session.path, '..', 'completed'), '', { flag: 'wx' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    session.completedAt = (await fs.stat(path.join(session.path, '..', 'completed'))).mtime.toISOString();
  }
  return { session, checks: challenge.checks.map((label, index) => ({ label, passed: passed[index] })), observation };
}

async function workingText(session: PlaygroundSession, file: string) {
  try { return await fs.readFile(path.join(session.path, file), 'utf8'); }
  catch (error) { if (missing(error)) return ''; throw error; }
}
async function committedText(session: PlaygroundSession, file: string) {
  const run = playgroundGit(session.path);
  return await run('ls-tree', '--name-only', 'HEAD', '--', file) ? run('show', `HEAD:${file}`) : '';
}
export async function readPlaygroundSteps(session: PlaygroundSession): Promise<string[]> {
  let saved: unknown;
  try { saved = JSON.parse(await fs.readFile(path.join(session.path, '..', 'learning.json'), 'utf8')); }
  catch (error) { if (missing(error)) return []; throw new Error('The lesson progress file could not be read. Your practice work has been kept.'); }
  if (!Array.isArray(saved) || saved.some(value => typeof value !== 'string')) throw new Error('The lesson progress file is invalid. Your practice work has been kept.');
  const known = new Set(playgroundLessons.find(lesson => lesson.id === session.challengeId)!.steps.map(step => step.id));
  return [...new Set(saved.filter(value => known.has(value)))];
}
export async function savePlaygroundSteps(session: PlaygroundSession, steps: string[]) {
  const temporary = path.join(session.path, '..', `learning-${randomUUID()}.json`);
  await fs.writeFile(temporary, JSON.stringify(steps), { flag: 'wx' });
  await fs.rename(temporary, path.join(session.path, '..', 'learning.json'));
}
