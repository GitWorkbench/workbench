import type { SimpleGit } from 'simple-git';
import type { FileChange } from '../../shared/types';

export async function getDiffSummary(git: SimpleGit, baseHash: string, targetHash: string) {
  // NUL-delimited output preserves tabs, Unicode, and rename source/target paths.
  const numstat = await git.raw(['diff', '--numstat', '-z', '-M', baseHash, targetHash, '--']);
  const nameStatus = await git.raw(['diff', '--name-status', '-z', '-M', baseHash, targetHash, '--']);
  const statuses = nameStatus.split('\0');
  const files: FileChange[] = [];
  for (let i = 0; i < statuses.length && statuses[i];) {
    const code = statuses[i++];
    const firstPath = statuses[i++];
    const renamed = code.startsWith('R') || code.startsWith('C');
    files.push({
      path: renamed ? statuses[i++] : firstPath,
      renamedFrom: renamed ? firstPath : undefined,
      status: code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : renamed ? 'renamed' : 'modified'
    });
  }
  const stats = numstat.split('\0');
  let insertions = 0;
  let deletions = 0;
  for (let i = 0; i < stats.length && stats[i];) {
    const record = stats[i++];
    const match = record.match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/);
    if (!match) continue;
    let filePath = match[3];
    if (!filePath) { i++; filePath = stats[i++]; }
    const file = files.find(f => f.path === filePath);
    if (!file) continue;
    file.insertions = match[1] === '-' ? undefined : Number(match[1]);
    file.deletions = match[2] === '-' ? undefined : Number(match[2]);
    insertions += file.insertions || 0;
    deletions += file.deletions || 0;
  }

  return { files, insertions, deletions };
}

export async function getCommitBase(git: SimpleGit, hash: string): Promise<string> {
  const parents = (await git.raw(['rev-list', '--parents', '-n', '1', hash])).trim().split(' ').slice(1);
  return parents[0] || (await git.raw(['hash-object', '-t', 'tree', '/dev/null'])).trim();
}
