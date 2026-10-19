import { getDiffSummary, getCommitBase } from './diff-summary';
import { CommitDetail, FileChange, FileDiff, ComparisonResult, FileStatusKind } from '../../shared/types';
import { withGit, errorMessage } from './core';
import { parseUnifiedDiff, getWorkingDiffText } from './status-diff';
import { gravatarHash } from './history';

/** Number stats per changed file for a commit. */
export async function getCommitDetail(repoPath: string, hash: string): Promise<CommitDetail | null> {
  try {
    return await withGit(repoPath, async (git) => {
      const meta = await git.raw([
        'show',
        '-s',
        '--pretty=format:%H%n%h%n%an%n%ae%n%cI%n%s%n%b%n%P',
        hash
      ]);
      const lines = meta.split('\n');
      const hashFull = lines[0];
      const short = lines[1];
      const name = lines[2];
      const email = lines[3];
      const date = lines[4];
      const subject = lines[5];
      const parentsLine = lines[lines.length - 1] || '';
      const body = lines.slice(6, lines.length - 1).join('\n').replace(/\n$/, '');

      const parents = parentsLine.trim() ? parentsLine.trim().split(' ') : [];
      const base = await getCommitBase(git, hash);
      const { files, insertions, deletions } = await getDiffSummary(git, base, hash);

      return {
        hash: hashFull,
        shortHash: short,
        parents,
        message: subject,
        body,
        authorName: name,
        authorEmail: email,
        avatarHash: email ? gravatarHash(email) : undefined,
        date,
        files,
        insertions,
        deletions
      };
    });
  } catch (err) {
    console.error('getCommitDetail failed:', errorMessage(err));
    return null;
  }
}

/** Unified diff of one file at a commit (vs first parent) or worktree modes. */
export async function getFileDiff(
  repoPath: string,
  hash: string,
  filePath: string,
  opts?: { staged?: boolean; worktree?: boolean }
): Promise<FileDiff | null> {
  try {
    return await withGit(repoPath, async (git) => {
      let diffText = '';
      if (opts?.staged || opts?.worktree) {
        diffText = await getWorkingDiffText(repoPath, filePath, opts.staged);
      } else {
        diffText = await getCommitDiffText(repoPath, hash, filePath);
      }

      const parsed = parseUnifiedDiff(diffText, filePath);
      return parsed;
    });
  } catch (err) {
    console.error('getFileDiff failed:', errorMessage(err));
    return null;
  }
}

/** Full diff text for a commit — used by revert-hunk and AI explainer. */
export async function getCommitDiffText(repoPath: string, hash: string, filePath?: string): Promise<string> {
  return withGit(repoPath, async (git) => {
    const base = await getCommitBase(git, hash);
    let paths: string[] = [];
    if (filePath) {
      const summary = await getDiffSummary(git, base, hash);
      const file = summary.files.find(f => f.path === filePath);
      paths = ['--', ...(file?.renamedFrom ? [file.renamedFrom, filePath] : [filePath])];
    }
    return git.diff(['-M', base, hash, ...paths]);
  });
}

/** Compare two arbitrary revisions (commits or tags) */
export async function compareCommits(
  repoPath: string,
  baseHash: string,
  targetHash: string
): Promise<ComparisonResult | null> {
  try {
    return await withGit(repoPath, async (git) => {
      const [baseMeta, targetMeta] = await Promise.all([
        git.raw(['show', '-s', '--pretty=format:%h%n%s%n%an%n%cI', baseHash]),
        git.raw(['show', '-s', '--pretty=format:%h%n%s%n%an%n%cI', targetHash])
      ]);

      const baseLines = baseMeta.trim().split('\n');
      const targetLines = targetMeta.trim().split('\n');

      const { files, insertions, deletions } = await getDiffSummary(git, baseHash, targetHash);

      return {
        baseHash,
        targetHash,
        baseSubject: baseLines[1] || baseLines[0] || baseHash.slice(0, 7),
        targetSubject: targetLines[1] || targetLines[0] || targetHash.slice(0, 7),
        files,
        insertions,
        deletions
      };
    });
  } catch (err) {
    console.error('compareCommits failed:', errorMessage(err));
    return null;
  }
}

/** Get unified diff between two arbitrary revisions for a specific file */
export async function getComparisonFileDiff(
  repoPath: string,
  baseHash: string,
  targetHash: string,
  filePath: string
): Promise<FileDiff | null> {
  try {
    return await withGit(repoPath, async (git) => {
      const comparison = await compareCommits(repoPath, baseHash, targetHash);
      const file = comparison?.files.find(f => f.path === filePath);
      const paths = file?.renamedFrom ? [file.renamedFrom, filePath] : [filePath];
      const diffText = await git.diff(['-M', baseHash, targetHash, '--', ...paths]);
      return parseUnifiedDiff(diffText, filePath);
    });
  } catch (err) {
    console.error('getComparisonFileDiff failed:', errorMessage(err));
    return null;
  }
}
