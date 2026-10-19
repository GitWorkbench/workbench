import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gitFor } from './core';
import { gitWithEnvironment } from './advanced-process';
import type { RestorePoint } from '../../shared/types';

const namespace = 'refs/git-workbench/restore-points/';
const prefix = 'Git Workbench restore point: ';
const refFor = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid restore point.');
  return namespace + id;
};

/** Worktree-scoped storage; custom refs keep all saved blobs reachable through GC. */
export async function createRestorePoint(repo: string, label = 'Manual restore point'): Promise<RestorePoint> {
  const git = gitFor(repo);
  const gitDir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim();
  if ((await git.raw(['ls-files', '--unmerged', '-z'])).length) throw new Error('Resolve the unmerged index before saving a restore point. The requested destructive action was not started.');
  const worktree = await fs.realpath(repo);
  const id = randomUUID();
  const folder = await fs.mkdtemp(path.join(gitDir, 'git-workbench-snapshot-'));
  const identity = { GIT_AUTHOR_NAME: 'Git Workbench Restore', GIT_AUTHOR_EMAIL: 'restore@git-workbench.local', GIT_COMMITTER_NAME: 'Git Workbench Restore', GIT_COMMITTER_EMAIL: 'restore@git-workbench.local' };
  const writer = gitWithEnvironment(repo, identity);
  const treeCommit = async (tree: string, parents: string[], message: string) => (await writer.raw(['-c', 'commit.gpgsign=false', 'commit-tree', tree, ...parents.flatMap(p => ['-p', p]), '-m', message])).trim();
  const temp = gitWithEnvironment(repo, { ...identity, GIT_INDEX_FILE: path.join(folder, 'index') });
  try {
    let head = (await git.raw(['rev-parse', '--verify', 'HEAD']).catch(() => '')).trim();
    const originalHead = head;
    const unborn = !head;
    const indexTree = (await git.raw(['write-tree'])).trim();
    if (!head) {
      await temp.raw(['read-tree', '--empty']);
      head = await treeCommit((await temp.raw(['write-tree'])).trim(), [], 'Empty baseline for recovery before the first commit');
    }
    const untracked = (await git.raw(['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
    for (const file of untracked) {
      if ((await fs.lstat(path.join(repo, file))).isDirectory()) throw new Error(`Cannot snapshot the nested repository or directory ${file}. Save it separately first.`);
    }
    const index = await treeCommit(indexTree, [head], 'Saved index');
    await temp.raw(['read-tree', indexTree]);
    await temp.raw(['add', '-u', '--', '.']);
    const workTree = (await temp.raw(['write-tree'])).trim();
    const parents = [head, index];
    if (untracked.length) {
      await temp.raw(['read-tree', '--empty']);
      const pathsFile = path.join(folder, 'paths');
      await fs.writeFile(pathsFile, untracked.map(p => `:(literal)${p}\0`).join(''));
      await temp.raw(['add', `--pathspec-from-file=${pathsFile}`, '--pathspec-file-nul']);
      parents.push(await treeCommit((await temp.raw(['write-tree'])).trim(), [], 'Saved untracked files'));
    }
    const point: RestorePoint = { id, label: String(label).trim().slice(0, 180) || 'Manual restore point', createdAt: new Date().toISOString(),
      branch: (await git.raw(['branch', '--show-current'])).trim() || '(detached HEAD)', head, unborn, worktree,
      untrackedCount: untracked.length, status: (await git.raw(['status', '--short', '--untracked-files=all'])).slice(0, 100_000) };
    if ((await git.raw(['write-tree'])).trim() !== indexTree || (await git.raw(['rev-parse', '--verify', 'HEAD']).catch(() => '')).trim() !== originalHead) throw new Error('HEAD or the index changed while preparing the restore point. Retry the operation.');
    const hash = await treeCommit(workTree, parents, prefix + JSON.stringify(point));
    // Never use refs/stash: creating a point leaves the working tree and stash list alone.
    await git.raw(['update-ref', refFor(id), hash, '']);
    return point;
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
}

export async function listRestorePoints(repo: string): Promise<RestorePoint[]> {
  const worktree = await fs.realpath(repo);
  const output = await gitFor(repo).raw(['for-each-ref', '--format=%(contents:subject)', namespace]);
  return output.split('\n').flatMap(line => {
    if (!line.startsWith(prefix)) return [];
    try { const point = JSON.parse(line.slice(prefix.length)) as RestorePoint; return point.worktree === worktree ? [point] : []; } catch { return []; }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function savedPoint(repo: string, id: string) {
  refFor(id);
  const point = (await listRestorePoints(repo)).find(p => p.id === id);
  if (!point) throw new Error('Restore point not found for this worktree.');
  return point;
}

export async function deleteRestorePoint(repo: string, id: string) {
  await savedPoint(repo, id);
  const git = gitFor(repo), ref = refFor(id);
  const hash = (await git.raw(['rev-parse', '--verify', ref])).trim();
  await git.raw(['update-ref', '-d', ref, hash]);
}

export async function restorePoint(repo: string, id: string) {
  const point = await savedPoint(repo, id), git = gitFor(repo), ref = refFor(id);
  const dir = (await git.raw(['rev-parse', '--absolute-git-dir'])).trim();
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_START']) {
    if (await fs.stat(path.join(dir, marker)).then(() => true, () => false)) throw new Error('Finish or abort the active Git operation before restoring.');
  }
  if (!(await git.status()).isClean()) throw new Error('Commit or stash your current changes before restoring a point. No changes were made.');
  const hash = (await git.raw(['rev-parse', '--verify', ref])).trim();
  const untracked = await git.raw(['ls-tree', '-r', '--name-only', '-z', `${hash}^3`]).catch(() => '');
  for (const file of untracked.split('\0').filter(Boolean)) {
    const currentlyTracked = await git.raw(['ls-files', '--error-unmatch', '--', `:(literal)${file}`]).then(() => true, () => false);
    if (!currentlyTracked && await fs.lstat(path.join(repo, file)).then(() => true, () => false)) throw new Error(`The saved untracked file ${file} already exists. Move it aside before restoring.`);
  }
  const branch = `recovered/restore-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${id.slice(0, 8)}`;
  await git.raw(['-c', 'submodule.recurse=false', 'checkout', '--no-overwrite-ignore', '-b', branch, point.head]);
  try { await gitWithEnvironment(repo, {}).raw(['-c', 'submodule.recurse=false', 'stash', 'apply', '--index', hash]); }
  catch { throw new Error(`Recovery stopped on ${branch}. The restore point is retained. Review the working tree and any conflicts before continuing.`); }
  return { ok: true, branch };
}
