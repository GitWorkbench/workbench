import { Commit, CommitRef, GraphResult, GitStatus } from '../../shared/types';
import { isValidRepo } from './core';
import { gravatarHash } from './history';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileP = promisify(execFile);

const FIELD_SEP = '\u0001';
const REC_SEP = '\u001e';
const NUL = '\u0000';

// hash %P authorName authorEmail date subject body
const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%cI', '%s', '%b'].join(FIELD_SEP);

interface RawCommit {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  body: string;
  refs: CommitRef[];
}

/**
 * Convert a `%d` decoration string into refs.
 *
 * Remote-ness cannot be guessed from the label alone: `feature/x` is a plain
 * local branch while `origin/x` is remote-tracking, and both look like
 * `word/word`. So we resolve the repo's actual remote names (see getLog) and
 * only treat `<remote>/<branch>` as remote. `remotes` is null when `git remote`
 * could not be read, in which case we fall back to the old shape heuristic.
 */
function parseRefs(refsField: string, currentBranch: string, remotes: Set<string> | null): CommitRef[] {
  const looksRemote = (label: string): boolean => {
    const slash = label.indexOf('/');
    if (slash <= 0 || slash === label.length - 1) return false;
    if (remotes) return remotes.has(label.slice(0, slash));
    return /^[^/]+\/[^/]+$/.test(label);
  };
  return refsField
    .split(', ')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((raw) => {
      let label = raw;
      let kind: CommitRef['kind'] = 'branch';
      let isRemote = false;
      let isCurrent = false;
      if (raw.startsWith('tag: ')) {
        kind = 'tag';
        label = raw.slice(5);
      } else if (raw === 'HEAD') {
        kind = 'head';
        isCurrent = true;
        label = currentBranch;
      } else if (raw.includes(' -> ')) {
        const [from, to] = raw.split(' -> ');
        label = to;
        isRemote = from.startsWith('remotes/') || looksRemote(to);
        if (from === 'HEAD') isCurrent = true;
      } else {
        label = raw;
        isRemote = looksRemote(raw);
      }
      if (label === currentBranch) isCurrent = true;
      return { kind, label, isCurrent, isRemote };
    });
}

function parseLogOutput(stdout: string, currentBranch: string): RawCommit[] {
  const out: RawCommit[] = [];
  for (const rec of stdout.split(REC_SEP)) {
    const clean = rec.replace(/^\n+/, '').replace(/\n+$/, '');
    if (!clean.trim()) continue;
    const [hash, parents, authorName, authorEmail, date, subject, ...bodyRest] = clean.split(FIELD_SEP);
    if (!hash) continue;
    const body = bodyRest.join(FIELD_SEP);
    out.push({
      hash,
      parents: parents ? parents.trim().split(' ').filter(Boolean) : [],
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      date: date ?? '',
      message: subject ?? '',
      body,
      refs: []
    });
  }
  return out;
}

export interface LaneAssignment {
  lane: number;
  /** lane index per parent, same order as commit.parents */
  lanes: number[];
  /** routing hint for genuine merge rows: per-parent lane + return source */
  pl2?: { lane: number; bottom: 'v' | 'curve'; returnFrom?: number }[];
}

/**
 * Lane allocation: a commit occupies a column; its first parent continues in
 * the same lane, extra (merge) parents branch right into new/reserved lanes.
 * Lanes of finished branches are recycled.
 */
export function assignLanes(commits: RawCommit[]): LaneAssignment[] {
  const laneByHash = new Map<string, number>();
  const assignments: LaneAssignment[] = new Array(commits.length);
  const freeLanes: number[] = [];
  let nextLane = 0;

  const alloc = (): number => {
    if (freeLanes.length > 0) {
      freeLanes.sort((a, b) => a - b);
      return freeLanes.shift()!;
    }
    return nextLane++;
  };

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    let lane = laneByHash.get(c.hash);
    if (lane !== undefined) {
      laneByHash.delete(c.hash);
    } else {
      lane = alloc();
    }
    const parentLanes: number[] = [];
    let pl2: { lane: number; bottom: 'v' | 'curve'; returnFrom?: number }[] | undefined;

    if (c.parents.length > 1) {
      const seenParents = new Set<string>();
      const firstHash = c.parents[0]!;
      const firstOccupied = laneByHash.get(firstHash);
      // Place the merge node on the first parent's rail when one exists —
      // that rail is the "trunk" and must pass straight through the node.
      const nodeLane = firstOccupied ?? lane;
      // Reserve one free lane just right of the merge node for ALL
      // merge-parent columns.
      const used = new Set<number>([nodeLane, ...laneByHash.values()]);
      let mergeLane = nodeLane + 1;
      while (used.has(mergeLane)) mergeLane++;
      if (firstOccupied !== undefined && firstOccupied !== lane) {
        // The merge node arrived on a different rail than its parent
        // continues on: it joins the first parent's rail here. Free this
        // node's own reservation only if nobody else still holds it.
        let held = false;
        for (const l of laneByHash.values()) {
          if (l === lane) {
            held = true;
            break;
          }
        }
        if (!held) freeLanes.push(lane);
        lane = nodeLane;
      }

      for (let pi = 0; pi < c.parents.length; pi++) {
        const p = c.parents[pi]!;
        if (pi === 0) {
          const occupied = laneByHash.get(p);
          if (occupied !== undefined) {
            parentLanes.push(occupied);
          } else {
            laneByHash.set(p, lane);
            parentLanes.push(lane);
          }
        } else if (seenParents.has(p)) {
          // A repeated parent of the same merge joins the shared mergeLane.
          parentLanes.push(mergeLane);
        } else {
          seenParents.add(p);
          laneByHash.set(p, mergeLane);
          parentLanes.push(mergeLane);
        }
      }
      // Route hints: second parents stack vertically in the shared mergeLane
      // column, return-curve back into the merge node, and continue below in
      // the mergeLane column.
      pl2 = parentLanes.map((pl, pi) => {
        if (pi === 0) return { lane: pl, bottom: 'v' as const };
        return { lane: mergeLane, bottom: 'v' as const, returnFrom: mergeLane };
      });
    } else {
      c.parents.forEach((p) => {
        const existing = laneByHash.get(p);
        if (existing !== undefined) {
          parentLanes.push(existing);
          return;
        }
        laneByHash.set(p, lane!);
        parentLanes.push(lane!);
      });
    }
    assignments[i] = { lane: lane!, lanes: parentLanes, pl2 };
  }
  return assignments;
}

export async function getLog(repoPath: string, status: GitStatus | null, limit = 300): Promise<GraphResult> {
  if (!isValidRepo(repoPath)) throw new Error(`Not a git repository: ${repoPath}`);

  const base = { cwd: repoPath, maxBuffer: 64 * 1024 * 1024 };
  const [logOut, headOut, countOut] = await Promise.all([
    execFileP(
      'git',
      ['log', `--pretty=tformat:${LOG_FORMAT}${REC_SEP}`, '--exclude=refs/git-workbench/*', '--all', '-n', String(limit)],
      base
    ),
    execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath }).catch(
      () => ({ stdout: '' })
    ),
    execFileP('git', ['rev-list', '--count', '--exclude=refs/git-workbench/*', '--all'], { cwd: repoPath }).catch(
      () => ({ stdout: '' })
    )
  ]);

  const currentBranch = headOut.stdout.trim();
  const totalInRepo = parseInt(countOut.stdout.trim(), 10) || 0;

  const raw = parseLogOutput(logOut.stdout.replace(new RegExp(REC_SEP + '$'), ''), currentBranch);

  // Decorations (%d) give us branches/tags/HEAD per commit (tab-separated; NUL not allowed in execFile args)
  const dec = await execFileP(
    'git',
    ['log', '--pretty=format:%H%x09%d', '--exclude=refs/git-workbench/*', '--all', '-n', String(limit)],
    base
  ).catch(() => ({ stdout: '' }));
  const refMap = new Map<string, string>();
  for (const line of dec.stdout.split('\n')) {
    const idx = line.indexOf('\t');
    if (idx > 0) refMap.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^\(|\)$/g, ''));
  }
  // Decoration labels like `feature/x` are local branches while `origin/x` are
  // remote-tracking; resolve the real remote names so we can tell them apart.
  const remotesOut = await execFileP('git', ['remote'], { cwd: repoPath }).catch(() => null);
  const remoteNames = remotesOut
    ? new Set(remotesOut.stdout.split('\n').map((s) => s.trim()).filter(Boolean))
    : null;

  raw.forEach((c) => {
    const refs = refMap.get(c.hash);
    if (refs) c.refs = parseRefs(refs, currentBranch, remoteNames);
    c.refs.forEach((r) => {
      if (r.label === currentBranch && r.kind !== 'tag') {
        r.isCurrent = true;
        if (!r.isRemote) r.kind = 'head';
      }
    });
  });

  const assignments = assignLanes(raw);
  const commits: Commit[] = raw.map((c, i) => ({
    hash: c.hash,
    shortHash: c.hash.slice(0, 7),
    parents: c.parents,
    message: c.message,
    body: c.body,
    authorName: c.authorName,
    authorEmail: c.authorEmail,
    avatarHash: c.authorEmail ? gravatarHash(c.authorEmail) : undefined,
    date: c.date,
    refs: c.refs,
    lane: assignments[i].lane,
    lanes: assignments[i].lanes,
    pl2: assignments[i].pl2
  }));

  const totalCommits = totalInRepo > 0 ? totalInRepo : commits.length;

  return {
    commits,
    hasUncommittedChanges: !!status && (status.staged.length > 0 || status.unstaged.length > 0),
    totalCommits,
    hasMore: commits.length < totalCommits
  };
}

/** Resolve repo display name from path. */
export function repoDisplayName(repoPath: string): string {
  return path.basename(repoPath) || repoPath;
}
