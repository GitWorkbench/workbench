import { withGit } from './core';
import { getRepoOperationState } from './conflicts-rebase';
import type { ReflogEntry } from '../../shared/types';

const reflogFormat = '%H%x00%gD%x00%gs%x00%s%x00%ct';
const hashPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

function parseReflog(output: string): ReflogEntry[] {
  return output
    .split('\n')
    .map((line) => {
      const [hash, selector, action, subject, commitTimestamp] = line.replace(/\r$/, '').split('\0');
      if (!hashPattern.test(hash || '') || !selector) return null;

      const ref = selector.split('@{', 1)[0] || 'HEAD';
      const dateText = selector.match(/@\{(.+)\}$/)?.[1];
      const selectorDate = dateText ? Date.parse(dateText) : Number.NaN;
      const fallbackDate = Number(commitTimestamp) * 1000;
      const timestamp = Number.isFinite(selectorDate)
        ? selectorDate
        : Number.isFinite(fallbackDate)
          ? fallbackDate
          : 0;

      return {
        hash,
        shortHash: hash.slice(0, 7),
        ref,
        action: action || 'Updated reference',
        subject: subject || '(no commit message)',
        date: timestamp ? new Date(timestamp).toISOString() : ''
      } satisfies ReflogEntry;
    })
    .filter((entry): entry is ReflogEntry => entry !== null);
}

async function verifyCommit(repoPath: string, hash: string): Promise<string> {
  const normalized = hash.trim();
  if (!hashPattern.test(normalized)) throw new Error('Choose a valid commit from the reflog.');
  await withGit(repoPath, (git) => git.raw(['cat-file', '-e', `${normalized}^{commit}`]));
  return normalized;
}

export async function getReflog(repoPath: string): Promise<ReflogEntry[]> {
  return withGit(repoPath, async (git) => {
    // Include HEAD explicitly so branch checkouts and resets remain visible even
    // when a Git version does not include its pseudo-ref in --all.
    const readReflog = (args: string[]) => git.raw(args).catch((error: unknown) => {
      if (/does not have any commits yet|unknown revision|bad revision/i.test(String(error))) return '';
      throw error;
    });
    const [headOutput, refsOutput] = await Promise.all([
      readReflog(['reflog', 'show', 'HEAD', '--date=iso-strict', `--format=${reflogFormat}`, '-n', '250']),
      readReflog(['reflog', 'show', '--all', '--date=iso-strict', `--format=${reflogFormat}`, '-n', '250'])
    ]);

    const entries = new Map<string, ReflogEntry>();
    for (const entry of [...parseReflog(headOutput), ...parseReflog(refsOutput)]) {
      entries.set(`${entry.ref}\0${entry.date}\0${entry.hash}\0${entry.action}`, entry);
    }
    return [...entries.values()]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 400);
  });
}

async function uniqueBranchName(repoPath: string, baseName: string): Promise<string> {
  const refs = await withGit(repoPath, (git) => git.branchLocal());
  const existing = new Set(refs.all);
  let candidate = baseName;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${baseName}-${suffix++}`;
  return candidate;
}

export async function createRecoveryBranch(
  repoPath: string,
  hash: string,
  requestedName?: string
): Promise<{ branchName: string }> {
  const commit = await verifyCommit(repoPath, hash);
  return withGit(repoPath, async (git) => {
    const baseName = `recovered/${commit.slice(0, 7)}-${new Date().toISOString().slice(0, 10)}`;
    const customName = requestedName?.trim();
    if (customName?.startsWith('-')) throw new Error('Branch names cannot start with a hyphen.');
    const branchName = customName || await uniqueBranchName(repoPath, baseName);
    await git.raw(['check-ref-format', '--branch', branchName]);
    const branches = await git.branchLocal();
    if (branches.all.includes(branchName)) throw new Error(`Branch '${branchName}' already exists.`);
    await git.raw(['branch', branchName, commit]);
    return { branchName };
  });
}

export async function restoreHeadFromReflog(
  repoPath: string,
  hash: string
): Promise<{ branchName: string; backupBranch: string }> {
  const commit = await verifyCommit(repoPath, hash);
  return withGit(repoPath, async (git) => {
    const branchName = (await git.raw(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim();
    if (!branchName) throw new Error('Check out a local branch before restoring HEAD.');

    const operation = await getRepoOperationState(repoPath);
    if (operation.inMerge || operation.inRebase || operation.inCherryPick) {
      throw new Error('Finish or abort the active merge, rebase, or cherry-pick before restoring HEAD.');
    }

    const status = await git.status();
    if (!status.isClean()) {
      throw new Error('Commit, stash, or discard working tree changes before restoring. No changes were made.');
    }

    const currentHead = (await git.raw(['rev-parse', 'HEAD'])).trim();
    if (currentHead === commit) throw new Error('This reflog entry is already the current commit.');

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const backupBranch = await uniqueBranchName(repoPath, `git-workbench-recovery-backup-${stamp}-${currentHead.slice(0, 7)}`);
    await git.raw(['branch', backupBranch, currentHead]);
    await git.raw(['reset', '--keep', commit]);
    return { branchName, backupBranch };
  });
}
