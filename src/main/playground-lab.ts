import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { playgroundLessons } from '../shared/playground-learning';
import type { PlaygroundEvidence } from '../shared/playground-learning';
import type { PlaygroundCommandResult, PlaygroundLabSnapshot, PlaygroundSession } from '../shared/types';
import { checkPlaygroundSession, playgroundGit, readPlaygroundAttempt, readPlaygroundSteps, savePlaygroundSteps } from './playground';

const pending = new Map<string, Promise<unknown>>();
const maximumFileSize = 20_000;
async function exclusive<T>(directory: string, id: string, task: (session: PlaygroundSession) => Promise<T>) {
  const key = `${directory}:${String(id)}`, previous = pending.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => task((await readPlaygroundAttempt(directory, id)).session));
  pending.set(key, current);
  try { return await current; }
  finally { if (pending.get(key) === current) pending.delete(key); }
}

/** A small argv parser, not a shell. Only the lesson Git grammar below is executable. */
export function parsePlaygroundCommand(command: string): string[] {
  if (typeof command !== 'string' || command.length > 2048 || /[\r\n\0]/.test(command)) throw new Error('Enter one Git command, up to 2,048 characters.');
  const tokens: string[] = [];
  let value = '', quote = '', started = false;
  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = ''; else value += character;
    } else if (character === '"' || character === "'") { quote = character; started = true; }
    else if (/\s/.test(character)) { if (started) { tokens.push(value); value = ''; started = false; } }
    else { value += character; started = true; }
  }
  if (quote) throw new Error('Close the quote around your commit or stash message.');
  if (started) tokens.push(value);
  if (tokens.shift() !== 'git' || !tokens.length) throw new Error('Start with git, followed by a lesson command. Try git status.');
  return tokens;
}

export function playgroundGitArguments(tokens: string[], files: string[]) {
  const [name, ...args] = tokens;
  const revision = (value: string) => /^(?:HEAD(?:[~^][0-9]+|@\{[0-9]+\})?|[a-zA-Z0-9][a-zA-Z0-9_./-]{0,100})$/.test(value);
  if (name === 'status' && (args.length === 0 || args.length === 1 && args[0] === '--short')) return ['status', ...args];
  if (name === 'log' && args.every(arg => arg === '--oneline' || arg === '--all')) return ['log', '--all', '--oneline', '--decorate', '-12'];
  if (name === 'diff' && (args.length === 0 || args.length === 1 && args[0] === '--staged')) return ['diff', '--no-ext-diff', '--no-textconv', ...args];
  if (name === 'add' && args.length && (args.length === 1 && args[0] === '.' || args.every(file => files.includes(file)))) return ['add', '--', ...(args[0] === '.' ? files : args)];
  if (name === 'restore' && args.length === 2 && args[0] === '--staged' && files.includes(args[1])) return ['restore', '--staged', '--', args[1]];
  if (name === 'commit' && args.length === 2 && args[0] === '-m' && args[1].trim()) return ['commit', '-m', args[1]];
  if (name === 'switch' && (args.length === 1 && revision(args[0]) || args.length === 2 && args[0] === '-c' && revision(args[1]))) return ['switch', ...args];
  if (name === 'branch' && (args.length === 0 || args.length <= 2 && args.every(revision))) return ['branch', ...args];
  if (name === 'merge' && args.length === 1 && revision(args[0])) return ['merge', '--no-edit', args[0]];
  if (name === 'cherry-pick' && args.length === 1 && revision(args[0])) return ['cherry-pick', args[0]];
  if (name === 'reflog' && !args.length) return ['reflog', '--oneline', '-12'];
  if (name === 'stash' && (args.length === 1 && ['list', 'push', 'pop'].includes(args[0]) || args.length === 3 && args[0] === 'push' && args[1] === '-m' && args[2].trim())) return ['stash', ...args];
  if (name === 'bisect' && (args.length === 1 && ['good', 'bad', 'skip', 'reset'].includes(args[0]) || args.length === 3 && args[0] === 'start' && args.slice(1).every(revision))) return ['bisect', ...args];
  throw new Error('That command is outside this practice prompt. Use the suggested Git commands; shell commands, external paths, configuration, and network operations are unavailable here.');
}

async function lessonFile(session: PlaygroundSession, file: string) {
  const lesson = playgroundLessons.find(item => item.id === session.challengeId)!;
  if (typeof file !== 'string' || !lesson.files.includes(file)) throw new Error('Choose one of this lesson’s practice files.');
  const target = path.join(session.path, file);
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The practice file was replaced. Start fresh or restore it before editing.');
    if (stat.size > maximumFileSize) throw new Error('The practice editor supports files up to 20 KB. Your file has been kept.');
    return { path: file, content: await fs.readFile(target, 'utf8'), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: file, content: '', exists: false };
    throw error;
  }
}

async function snapshot(directory: string, session: PlaygroundSession, activity = ''): Promise<PlaygroundLabSnapshot> {
  const run = playgroundGit(session.path), lesson = playgroundLessons.find(item => item.id === session.challengeId)!;
  const status = await run('status', '--porcelain=v1', '--untracked-files=all');
  // Separate queries avoid relying on trimmed porcelain whitespace for status columns.
  const changed = (await run('diff', '--no-ext-diff', '--name-only')).split('\n').filter(Boolean);
  const untracked = (await run('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean);
  const staged = (await run('diff', '--cached', '--no-ext-diff', '--name-only')).split('\n').filter(Boolean);
  const conflicts = (await run('diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean);
  const files = await Promise.all(lesson.files.map(file => lessonFile(session, file)));
  const branch = await run('branch', '--show-current');
  const commits = (await run('log', '--all', '-12', '--format=%h%x09%s')).split('\n').map(line => { const [hash, ...subject] = line.split('\t'); return { hash, subject: subject.join('\t') }; });
  const steps = await readPlaygroundSteps(session);
  const evidence: Record<PlaygroundEvidence, boolean> = {
    status: activity === 'status', log: activity === 'log', diff: activity === 'diff' && (session.challengeId !== 'git-basics' || !!changed.length),
    edited: !!changed.length || !!untracked.length, staged: !!staged.length && !conflicts.length,
    unstaged: !staged.length && !!changed.length, branch: branch === 'feature/greeting',
    'stash-saved': !!await run('stash', 'list') && !status,
    reflog: activity === 'reflog', 'bisect-started': activity === 'bisect start',
    'bisect-judged': activity === 'bisect good' || activity === 'bisect bad', complete: false
  };
  for (const step of lesson.steps) if (evidence[step.evidence] && !steps.includes(step.id)) steps.push(step.id);
  await savePlaygroundSteps(session, steps);
  const progress = await checkPlaygroundSession(directory, session.id);
  if (progress.session.completedAt) {
    for (const step of lesson.steps) if (!steps.includes(step.id)) steps.push(step.id);
    await savePlaygroundSteps(session, steps);
  }
  return { session: progress.session, branch, changed: [...new Set([...changed, ...untracked])], staged, conflicts, files, commits, steps, progress };
}

export function getPlaygroundLab(directory: string, id: string) {
  return exclusive(directory, id, session => snapshot(directory, session));
}
export function runPlaygroundCommand(directory: string, id: string, command: string): Promise<PlaygroundCommandResult> {
  return exclusive(directory, id, async session => {
    const tokens = parsePlaygroundCommand(command), files = playgroundLessons.find(item => item.id === session.challengeId)!.files;
    const args = playgroundGitArguments(tokens, files);
    let ok = true, output: string;
    try { output = await playgroundGit(session.path)(...args); }
    catch (error) { ok = false; output = error instanceof Error ? error.message : String(error); }
    const activity = ok ? tokens[0] === 'bisect' ? `${tokens[0]} ${tokens[1]}` : tokens[0] : '';
    const state = await snapshot(directory, session, activity);
    if (!ok && state.conflicts.length) output += '\nGit paused for a conflict. Edit the marked file, save it, stage it, then commit the combined result.';
    return { ok, output: output.slice(0, 24_000) || 'Done. The repository state is shown above.', snapshot: state };
  });
}
export function savePlaygroundFile(directory: string, id: string, file: string, content: string, expectedContent: string | null) {
  return exclusive(directory, id, async session => {
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > maximumFileSize || content.includes('\0')) throw new Error('Use plain text up to 20 KB in the practice editor.');
    const previous = await lessonFile(session, file);
    if ((previous.exists ? previous.content : null) !== expectedContent) throw new Error('This file changed since you loaded it. Revert the editor draft and refresh before saving.');
    const temporary = path.join(session.path, `.playground-edit-${randomUUID()}`);
    await fs.writeFile(temporary, content, { flag: 'wx' });
    // Replacing the directory entry does not follow a newly introduced symlink.
    await fs.rename(temporary, path.join(session.path, file));
    return snapshot(directory, session);
  });
}
