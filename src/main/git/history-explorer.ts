import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HistoryReplay, HistoryReplayCommit } from '../../shared/types';
import { isValidRepo } from './core';

const execFileP = promisify(execFile);
const HISTORY_LIMIT = 500;
const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u0000';

export function parseReplayLog(output: string): HistoryReplayCommit[] {
  return output.split(RECORD_SEPARATOR).map(record => record.replace(/^\n+|\n+$/g, ''))
    .filter(record => record.length > 0)
    .map(record => {
      const [hash = '', parents = '', authorName = '', authorEmail = '', date = '', summary = ''] = record.split(FIELD_SEPARATOR);
      return { hash, shortHash: hash.slice(0, 7), parents: parents ? parents.split(' ').filter(Boolean) : [], authorName, authorEmail, date, summary };
    }).filter(commit => /^[0-9a-f]{40,64}$/i.test(commit.hash));
}

export async function getHistoryReplay(repoPath: string, branch: string, remote = false): Promise<HistoryReplay> {
  if (!isValidRepo(repoPath)) throw new Error('Open a valid Git repository to replay its history.');
  if (typeof branch !== 'string' || !branch.trim() || branch.length > 255 || /[\0\r\n]/.test(branch)) {
    throw new Error('Choose a valid branch to replay.');
  }

  const ref = `refs/${remote ? 'remotes' : 'heads'}/${branch}`;
  const run = async (args: string[]) => {
    try {
      return (await execFileP('git', args, { cwd: repoPath, maxBuffer: 16 * 1024 * 1024 })).stdout;
    } catch {
      throw new Error('Git could not read this branch history. Refresh the branch list and try again.');
    }
  };

  await run(['check-ref-format', ref]);
  const resolved = (await run(['rev-parse', '--verify', `${ref}^{commit}`])).trim();
  if (!/^[0-9a-f]{40,64}$/i.test(resolved)) throw new Error('This branch does not point to a commit.');

  const [log, count] = await Promise.all([
    run(['log', '--topo-order', '--date-order', `--format=%H%x00%P%x00%an%x00%ae%x00%cI%x00%s%x1e`, '-n', String(HISTORY_LIMIT), resolved]),
    run(['rev-list', '--count', resolved])
  ]);
  const commits = parseReplayLog(log);
  const parsedCount = Number.parseInt(count.trim(), 10);
  const totalCommits = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : commits.length;
  return { branch, remote, commits, totalCommits, hasMore: totalCommits > commits.length };
}
