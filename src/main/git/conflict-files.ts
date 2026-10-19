import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ConflictFileParsed, ConflictResolutionOptions } from '../../shared/types';
import { hasConflictMarkers, parseConflictSections } from '../../shared/conflicts';
import { captureResolutionMemory } from './resolution-memory';

const execFileP = promisify(execFile);
const maxBuffer = 20 * 1024 * 1024;
type Stage = { mode: string; hash: string; stage: number };

async function conflictPath(repoPath: string, filePath: string): Promise<string> {
  const root = path.resolve(repoPath);
  const fullPath = path.resolve(root, filePath);
  const relative = path.relative(root, fullPath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('The conflict file must be inside the open repository.');
  }
  // A tracked directory may have been replaced by a link in the working tree.
  let parent = path.dirname(fullPath);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const [realRoot, realParent] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(parent)]);
  const realRelative = path.relative(realRoot, realParent);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error('The conflict path points outside the repository.');
  }
  return fullPath;
}

async function readStages(repoPath: string, filePath: string): Promise<Stage[]> {
  const { stdout } = await execFileP('git', ['ls-files', '--unmerged', '-z', '--', `:(literal)${filePath}`], { cwd: repoPath, maxBuffer });
  return stdout.split('\0').filter(Boolean).map(entry => {
    const match = /^(\d+) ([0-9a-f]+) ([123])\t/.exec(entry);
    if (!match) throw new Error('Could not read the conflicted Git index.');
    return { mode: match[1], hash: match[2], stage: Number(match[3]) };
  });
}

async function readWorkingFile(fullPath: string): Promise<{ content: Buffer; exists: boolean; symlink: boolean }> {
  try {
    const stat = await fs.promises.lstat(fullPath);
    if (stat.isDirectory()) return { content: Buffer.alloc(0), exists: true, symlink: false };
    if (stat.size > maxBuffer) throw new Error('This file is too large for the merge editor. Resolve it in an external editor, then stage it.');
    const symlink = stat.isSymbolicLink();
    const content = symlink ? Buffer.from(await fs.promises.readlink(fullPath)) : await fs.promises.readFile(fullPath);
    return { content, exists: true, symlink };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { content: Buffer.alloc(0), exists: false, symlink: false };
    throw error;
  }
}

function snapshot(fullPath: string, stages: Stage[], working: { content: Buffer; exists: boolean; symlink: boolean }): string {
  return createHash('sha256').update(fullPath).update(JSON.stringify(stages)).update(String(working.exists))
    .update(String(working.symlink)).update(working.content).digest('hex');
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0) || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
}

/** Read all three Git index versions without checking out or changing the file. */
export async function getConflictFile(repoPath: string, filePath: string): Promise<ConflictFileParsed> {
  const fullPath = await conflictPath(repoPath, filePath);
  const [stages, working] = await Promise.all([readStages(repoPath, filePath), readWorkingFile(fullPath)]);
  if (!stages.length) throw new Error('This file is no longer conflicted. Refresh the repository to see its current status.');
  const versions = await Promise.all([1, 2, 3].map(async number => {
    const stage = stages.find(s => s.stage === number);
    if (!stage || stage.mode === '160000') return null;
    const { stdout } = await execFileP('git', ['cat-file', 'blob', stage.hash], { cwd: repoPath, encoding: 'buffer', maxBuffer });
    return stdout;
  }));
  const kind = stages.some(s => s.mode === '160000') ? 'submodule'
    : working.symlink || stages.some(s => s.mode === '120000') ? 'symlink'
    : [working.content, ...versions.filter((v): v is Buffer => v !== null)].some(isBinary) ? 'binary' : 'text';
  const rawContent = kind === 'text' ? working.content.toString('utf8') : '';
  let sections: ConflictFileParsed['sections'] = [];
  let parseWarning: string | undefined;
  if (kind === 'text') {
    try { sections = parseConflictSections(rawContent); }
    catch {
      sections = [{ type: 'text', lines: rawContent.replace(/\r\n/g, '\n').split('\n') }];
      parseWarning = 'The conflict markers are incomplete. Edit the result to remove them, or choose a complete file version.';
    }
  }
  const conflicts = sections.flatMap(section => section.type === 'conflict' ? [section.conflict] : []);
  const { stdout: branch } = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
  const currentLabel = conflicts[0]?.currentLabel || branch.trim() || 'Current';
  const incomingLabel = conflicts[0]?.incomingLabel || 'Incoming';
  const reference = rawContent || versions[1]?.toString('utf8') || versions[2]?.toString('utf8') || '';
  return {
    filePath, rawContent, sections, totalConflicts: conflicts.length,
    baseContent: versions[0] === null ? null : kind === 'binary' ? '' : versions[0].toString('utf8'),
    currentContent: versions[1] === null ? null : kind === 'binary' ? '' : versions[1].toString('utf8'),
    incomingContent: versions[2] === null ? null : kind === 'binary' ? '' : versions[2].toString('utf8'),
    currentLabel, incomingLabel, kind,
    lineEnding: reference.includes('\r\n') ? '\r\n' : '\n',
    workingTreeExists: working.exists, parseWarning,
    snapshot: snapshot(fullPath, stages, working)
  };
}

/** Only Apply writes the reviewed result and stages this file. */
export async function resolveConflictFile(repoPath: string, filePath: string, content: string, options?: ConflictResolutionOptions): Promise<void> {
  const fullPath = await conflictPath(repoPath, filePath);
  const [stages, working] = await Promise.all([readStages(repoPath, filePath), readWorkingFile(fullPath)]);
  if (!stages.length) throw new Error('This file is no longer conflicted. Reopen the resolver after refreshing.');
  if (options && snapshot(fullPath, stages, working) !== options.expectedSnapshot) {
    throw new Error('This file or its Git index changed outside the merge editor. Reload the file before applying your result.');
  }
  if (stages.some(s => s.mode === '160000')) throw new Error('Resolve this submodule conflict with Git, then refresh the repository.');
  const action = options?.action || 'result';
  const literalPath = `:(literal)${filePath}`;
  if (action === 'delete' || ((action === 'current' || action === 'incoming') && !stages.some(s => s.stage === (action === 'current' ? 2 : 3)))) {
    await execFileP('git', ['rm', '-f', '--', literalPath], { cwd: repoPath });
    return;
  }
  if (action === 'current' || action === 'incoming') {
    await execFileP('git', ['checkout', action === 'current' ? '--ours' : '--theirs', '--', literalPath], { cwd: repoPath });
  } else {
    if (working.symlink || stages.some(s => s.mode === '120000') || isBinary(working.content)) {
      throw new Error('Choose a complete side to resolve this binary file or symbolic link.');
    }
    if (hasConflictMarkers(content)) throw new Error('Remove all conflict markers from the result before applying it.');
    const temporary = `${fullPath}.git-workbench-merge-${randomUUID()}`;
    try {
      const mode = working.exists ? (await fs.promises.stat(fullPath)).mode : stages.find(s => s.stage === 2 || s.stage === 3)?.mode === '100755' ? 0o755 : 0o644;
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode });
      // Do not replace edits made by an external editor while preparing the save.
      if (options) {
        const [latestStages, latestWorking] = await Promise.all([readStages(repoPath, filePath), readWorkingFile(fullPath)]);
        if (snapshot(fullPath, latestStages, latestWorking) !== options.expectedSnapshot) {
          throw new Error('This file changed outside the merge editor. Reload it before applying your result.');
        }
      }
      await fs.promises.rename(temporary, fullPath);
    } finally {
      await fs.promises.unlink(temporary).catch(() => {});
    }
  }
  // Learn the reviewed result while its index stages still identify the conflict.
  // Cache failure must not prevent saving an otherwise valid resolution.
  await captureResolutionMemory(repoPath).catch(error => console.warn('Conflict memory:', error.message));
  await execFileP('git', ['add', '--', literalPath], { cwd: repoPath });
}
