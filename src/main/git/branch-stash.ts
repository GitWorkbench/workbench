import { applyHunkPatch } from './hunk-actions';
import { getDiffSummary } from './diff-summary';
import { BranchInfo, StashInfo, StashDetail, FileDiff, FileChange } from '../../shared/types';
import { withGit, errorMessage } from './core';
import { parseUnifiedDiff } from './status-diff';
import { gitCommand } from './advanced-process';

export async function getBranches(repoPath: string): Promise<{ local: BranchInfo[]; remote: BranchInfo[] }> {
  try {
    return await withGit(repoPath, async (git) => {
      const res = await git.branch(['-vv', '-a']);
      const local: BranchInfo[] = [];
      const remote: BranchInfo[] = [];
      const seenLocal = new Set<string>();
      const seenRemote = new Set<string>();
      for (const [name, info] of Object.entries(res.branches)) {
        // simple-git BranchSummary has no `type` field — remote detection must use the `remotes/` prefix.
        const isRemote = name.startsWith('remotes/');
        const cleanName = name.replace(/^remotes\//, '');
        // simple-git can yield duplicate keys for the same tracking branch
        // (e.g. local branch named `origin/feature/lead` + `remotes/origin/feature/lead`,
        // fetch/prune edge-cases, or `origin/HEAD` symbolic ref); de-duplicate by fullName
        if (isRemote) {
          if (cleanName === 'origin/HEAD') continue;
          if (seenRemote.has(cleanName)) continue;
          seenRemote.add(cleanName);
        } else {
          if (seenLocal.has(cleanName)) continue;
          seenLocal.add(cleanName);
        }
        const b: BranchInfo = {
          name: isRemote ? cleanName.split('/').slice(1).join('/') || cleanName : cleanName,
          fullName: cleanName,
          isCurrent: !!(info as { current?: boolean }).current,
          isRemote,
          lastCommitDate: (info as { date?: string }).date,
          tracking: (info as { label?: string }).label?.match(/\[(.+?)\]/)?.[1]
        };
        if (isRemote) remote.push(b);
        else local.push(b);
      }
      local.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
      remote.sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { local, remote };
    });
  } catch (err) {
    console.error('getBranches failed:', errorMessage(err));
    return { local: [], remote: [] };
  }
}

export async function getStashes(repoPath: string): Promise<StashInfo[]> {
  try {
    return await withGit(repoPath, async (git) => {
      const out = await git.raw(['stash', 'list', '--pretty=format:%gd%x09%gs%x09%cI']);
      const stashes: StashInfo[] = [];
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        const [ref, msg, date] = line.split('\t');
        stashes.push({
          index: parseInt((ref || 'stash@{0}').match(/\{(\d+)\}/)?.[1] || '0', 10),
          message: (msg || '').replace(/^WIP on .*: /, ''),
          date: date || ''
        });
      }
      return stashes;
    });
  } catch (err) {
    console.error('getStashes failed:', errorMessage(err));
    return [];
  }
}

export async function checkoutBranch(repoPath: string, name: string): Promise<void> {
  await withGit(repoPath, (git) => git.checkout(name));
}

export async function createBranch(repoPath: string, name: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['branch', name]));
}

export async function deleteBranch(repoPath: string, name: string): Promise<void> {
  await withGit(repoPath, (git) => git.deleteLocalBranch(name));
}

export async function renameBranch(repoPath: string, name: string, newName: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['branch', '-m', name, newName]));
}

export async function stash(repoPath: string, message?: string): Promise<void> {
  await withGit(repoPath, (git) => git.stash(message ? ['push', '-m', message] : ['push']));
}

export async function stashPop(repoPath: string, index?: number): Promise<void> {
  // Git writes stash conflicts to stdout; simple-git's error detection can miss
  // their nonzero exit status when stderr is empty.
  await withGit(repoPath, () => gitCommand(repoPath, ['stash', 'pop', `stash@{${index ?? 0}}`]));
}

export async function stashApply(repoPath: string, index?: number): Promise<void> {
  await withGit(repoPath, () => gitCommand(repoPath, ['stash', 'apply', `stash@{${index ?? 0}}`]));
}

export async function stashDrop(repoPath: string, index?: number): Promise<void> {
  await withGit(repoPath, (git) => git.stash(['drop', `stash@{${index ?? 0}}`]));
}

/** Apply the inverse of a single hunk (Revert Hunk) via `git apply -R --cached`-less worktree patch. */
export async function revertHunk(repoPath: string, diffText: string, hunkIndex: number): Promise<void> {
  await applyHunkPatch(repoPath, diffText, hunkIndex, ['--reverse', '--whitespace=nowarn', '--recount']);
}

export async function mergeBranch(repoPath: string, branchName: string): Promise<void> {
  await withGit(repoPath, (git) => git.merge([branchName]));
}

export async function getStashDetail(repoPath: string, index: number): Promise<StashDetail | null> {
  return await withGit(repoPath, async (git) => {
    try {
      const ref = `stash@{${index}}`;
      const logOut = await git.raw(['log', '-1', '--format=%gs%x00%cr%x00%ci%x00%H', ref]);
      const [message, relativeDate, date, hash] = logOut.trim().split('\0');
      if (!hash) return null;

      const { files, insertions: totalAdditions, deletions: totalDeletions } = await getDiffSummary(git, `${ref}^1`, ref);

      return {
        index,
        hash,
        message: message || `stash@{${index}}`,
        date: date || relativeDate,
        files,
        insertions: totalAdditions,
        deletions: totalDeletions
      };
    } catch {
      return null;
    }
  });
}

export async function getStashFileDiff(repoPath: string, index: number, filePath: string): Promise<FileDiff | null> {
  return await withGit(repoPath, async (git) => {
    try {
      const ref = `stash@{${index}}`;
      const summary = await getDiffSummary(git, `${ref}^1`, ref);
      const file = summary.files.find(f => f.path === filePath);
      const paths = file?.renamedFrom ? [file.renamedFrom, filePath] : [filePath];
      const diffText = await git.raw(['diff', '-M', `${ref}^1`, ref, '--', ...paths]);
      return parseUnifiedDiff(diffText, filePath);
    } catch {
      return null;
    }
  });
}

export async function applyStashFile(repoPath: string, index: number, filePath: string): Promise<void> {
  await withGit(repoPath, async (git) => {
    const ref = `stash@{${index}}`;
    // Refuse overwriting either staged or unstaged work, including untracked files.
    const dirty = await git.raw(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', `:(literal)${filePath}`]);
    if (dirty) throw new Error(`Commit or stash local changes to ${filePath} before restoring it.`);
    await git.raw(['restore', `--source=${ref}`, '--worktree', '--', `:(literal)${filePath}`]);
  });
}
