import fs from 'node:fs/promises';
import path from 'node:path';
import { gitFor } from './core';
import { gitWithEnvironment } from './advanced-process';
import { hasConflictMarkers } from '../../shared/conflicts';
import type { ResolutionMemoryState } from '../../shared/types';

export async function resolutionMemoryState(repo: string): Promise<ResolutionMemoryState> {
  const git = gitFor(repo);
  const [enabled, automatic, cachePath] = await Promise.all([
    git.raw(['config', '--bool', '--get', 'git-workbench.rerere']).catch(() => ''),
    git.raw(['config', '--bool', '--get', 'rerere.enabled']).catch(() => ''),
    git.raw(['rev-parse', '--git-path', 'rr-cache'])
  ]);
  const cache = path.resolve(repo, cachePath.trim());
  const entries = await fs.readdir(cache).catch(() => []);
  let remembered = 0;
  for (const entry of entries.filter(e => /^[a-f0-9]{40,64}$/.test(e))) {
    if ((await fs.readdir(path.join(cache, entry)).catch(() => [])).some(f => /^postimage(?:\.\d+)?$/.test(f))) remembered++;
  }
  return { enabled: enabled.trim() === 'true', gitAutomatic: automatic.trim() === 'true', remembered };
}

export async function setResolutionMemory(repo: string, enabled: boolean) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether conflict memory is enabled.');
  // An rr-cache directory can itself enable Git's automatic rerere by default.
  // Suggestion-only mode must explicitly disable automatic working-tree replay.
  await gitFor(repo).raw(['config', '--local', 'rerere.enabled', 'false']);
  await gitFor(repo).raw(['config', '--local', 'git-workbench.rerere', String(enabled)]);
  if (enabled) await captureResolutionMemory(repo);
  return resolutionMemoryState(repo);
}

/** Git may update rr-cache/MERGE_RR, but all file and index writes go to this disposable copy. */
export async function captureResolutionMemory(repo: string, forget?: string): Promise<Map<string, string>> {
  const git = gitFor(repo), results = new Map<string, string>();
  const enabled = await git.raw(['config', '--bool', '--get', 'git-workbench.rerere']).catch(() => '');
  if (enabled.trim() !== 'true') return results;
  const files = (await git.raw(['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
  if (!files.length) return results;
  if (forget && !files.includes(forget)) throw new Error('This file is no longer conflicted.');
  const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim();
  const indexPath = path.resolve(repo, (await git.raw(['rev-parse', '--git-path', 'index'])).trim());
  const temp = await fs.mkdtemp(path.join(gitDir, 'git-workbench-rerere-'));
  const tree = path.join(temp, 'worktree');
  const originals = new Map<string, Buffer>();
  try {
    await fs.mkdir(tree);
    await fs.copyFile(indexPath, path.join(temp, 'index'));
    // Split indexes may refer to shared index files beside the alternate index.
    for (const name of (await fs.readdir(path.dirname(indexPath))).filter(n => /^sharedindex\.[a-f0-9]+$/.test(n))) await fs.copyFile(path.join(path.dirname(indexPath), name), path.join(temp, name));
    const realRoot = await fs.realpath(repo);
    for (const file of files) {
      const source = path.resolve(repo, file), relative = path.relative(repo, source);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Invalid conflict path.');
      const stat = await fs.lstat(source).catch(() => null);
      if (!stat?.isFile() || stat.size > 20 * 1024 * 1024) continue;
      const realParent = await fs.realpath(path.dirname(source));
      const parentRelative = path.relative(realRoot, realParent);
      if (parentRelative === '..' || parentRelative.startsWith(`..${path.sep}`) || path.isAbsolute(parentRelative)) throw new Error('Conflict path leaves the repository.');
      const original = await fs.readFile(source);
      if (original.includes(0) || !Buffer.from(original.toString('utf8')).equals(original)) continue;
      const destination = path.join(tree, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, original);
      originals.set(file, original);
    }
    const shadow = gitWithEnvironment(tree, { GIT_INDEX_FILE: path.join(temp, 'index') });
    const options = ['--git-dir', gitDir, '--work-tree', tree, '-c', 'rerere.enabled=true', '-c', 'rerere.autoupdate=false'];
    await shadow.raw([...options, 'rerere']);
    if (forget) await shadow.raw([...options, 'rerere', 'forget', '--', `:(literal)${forget}`]);
    for (const [file, original] of originals) {
      const candidate = await fs.readFile(path.join(tree, file));
      if (!candidate.equals(original) && !hasConflictMarkers(candidate.toString('utf8'))) results.set(file, candidate.toString('utf8'));
    }
    return results;
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
