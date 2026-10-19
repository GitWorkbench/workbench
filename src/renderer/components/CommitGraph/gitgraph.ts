import { GitgraphCore, templateExtend, TemplateName, MergeStyle, toSvgPath } from '@gitgraph/core';
import type { Commit } from '../../../shared/types';
import { LANE_W, ROW_H } from './lanes';

export interface RenderedGraphCommit {
  hash: string;
  shortHash: string;
  x: number;
  y: number;
  color: string;
  authorName?: string;
  authorEmail?: string;
  avatarHash?: string;
  hasRefs?: boolean;
}

export interface RenderedGraphBranchPath {
  name: string;
  color: string;
  d: string;
}

export interface GitGraphData {
  commits: RenderedGraphCommit[];
  branchesPaths: RenderedGraphBranchPath[];
  width: number;
  height: number;
}

const PALETTE = [
  '#26c6da',
  '#4f8cff',
  '#9b7bff',
  '#66bb6a',
  '#ffb74d',
  '#ef6c9a',
  '#ab47bc',
  '#ff8a65',
  '#aed581'
];

/**
 * Builds a GitGraph model from git log commits (newest first).
 * Replays commits in reverse order (oldest first) so that parent commits
 * exist when branching and merging.
 */
export function buildGitGraph(
  commits: Commit[],
  options: { rowH?: number; laneW?: number } = {}
): GitGraphData {
  const rowH = options.rowH ?? ROW_H;
  const laneW = options.laneW ?? LANE_W;

  if (!commits || commits.length === 0) {
    return { commits: [], branchesPaths: [], width: 80, height: rowH };
  }

  const commitMap = new Map(commits.map((c) => [c.hash, c]));

  // Identify trunk commits: trace first-parent chain from HEAD (commits[0])
  const trunkSet = new Set<string>();
  let cur: string | undefined = commits[0]?.hash;
  while (cur) {
    trunkSet.add(cur);
    const parentHash: string | undefined = commitMap.get(cur)?.parents?.[0];
    cur = parentHash;
  }

  // Precompute primary child for each parent:
  // Trunk children get absolute priority; otherwise the first-seen child continues the branch.
  const primaryChildOf = new Map<string, string>();
  for (const c of commits) {
    for (let pi = 0; pi < c.parents.length; pi++) {
      const p = c.parents[pi];
      if (!primaryChildOf.has(p)) {
        primaryChildOf.set(p, c.hash);
      } else if (trunkSet.has(c.hash) && !trunkSet.has(primaryChildOf.get(p)!)) {
        primaryChildOf.set(p, c.hash);
      }
    }
  }

  const template = templateExtend(TemplateName.Metro, {
    colors: PALETTE,
    branch: {
      spacing: laneW,
      lineWidth: 2,
      mergeStyle: MergeStyle.Bezier,
      label: { display: false }
    },
    commit: {
      spacing: rowH,
      message: { display: false },
      dot: { size: 5, strokeWidth: 2 }
    }
  });

  const branchIndex = (name: string): number => {
    if (name === 'trunk') return 0;
    const m = name.match(/^side-(\d+)$/);
    return m ? parseInt(m[1], 10) : 999;
  };

  const core = new GitgraphCore({
    template,
    compareBranchesOrder: (a, b) => branchIndex(a) - branchIndex(b)
  });
  const gitgraph = core.getUserApi();

  // Side-branch name pool to recycle lane numbers
  const freeSideLanes: number[] = [];
  let maxSideLane = 0;
  const allocSideName = (): string => {
    if (freeSideLanes.length > 0) {
      freeSideLanes.sort((a, b) => a - b);
      return `side-${freeSideLanes.shift()!}`;
    }
    maxSideLane++;
    return `side-${maxSideLane}`;
  };
  const releaseSideName = (name: string): void => {
    const m = name.match(/^side-(\d+)$/);
    if (m) freeSideLanes.push(parseInt(m[1], 10));
  };

  type BranchHandle = { branch: ReturnType<typeof gitgraph.branch>; name: string };
  const branchAtTip = new Map<string, BranchHandle>();
  const commitBranch = new Map<string, BranchHandle>();

  // Commit list is newest first; replay oldest first
  const oldestFirst = [...commits].reverse();

  for (const c of oldestFirst) {
    const isTrunk = trunkSet.has(c.hash);
    const parents = c.parents || [];

    if (parents.length === 0) {
      // Root commit
      const name = isTrunk ? 'trunk' : allocSideName();
      const b = gitgraph.branch(name);
      b.commit({ hash: c.hash, subject: c.message });
      const handle = { branch: b, name };
      branchAtTip.set(c.hash, handle);
      commitBranch.set(c.hash, handle);
    } else if (parents.length === 1) {
      const p = parents[0];
      const tip = branchAtTip.get(p);
      const isPrimary = primaryChildOf.get(p) === c.hash;

      if (tip && (isPrimary || (tip.name === 'trunk' && isTrunk))) {
        tip.branch.commit({ hash: c.hash, subject: c.message });
        branchAtTip.delete(p);
        branchAtTip.set(c.hash, tip);
        commitBranch.set(c.hash, tip);
      } else {
        // Fork from an existing commit
        const name = isTrunk ? 'trunk' : allocSideName();
        const b = gitgraph.branch({ name, from: p });
        b.commit({ hash: c.hash, subject: c.message });
        const handle = { branch: b, name };
        branchAtTip.set(c.hash, handle);
        commitBranch.set(c.hash, handle);
      }
    } else {
      // Merge commit (2 or more parents)
      const p1 = parents[0];
      let tip1 = branchAtTip.get(p1);
      if (!tip1) {
        const name = isTrunk ? 'trunk' : allocSideName();
        const b = gitgraph.branch({ name, from: p1 });
        tip1 = { branch: b, name };
      } else {
        branchAtTip.delete(p1);
      }

      const p2 = parents[1];
      const tip2 = commitBranch.get(p2);
      if (tip2 && tip2.branch !== tip1.branch) {
        try {
          tip1.branch.merge({ branch: tip2.branch, commitOptions: { hash: c.hash, subject: c.message } });
          releaseSideName(tip2.name);
        } catch {
          tip1.branch.commit({ hash: c.hash, subject: c.message });
        }
      } else {
        tip1.branch.commit({ hash: c.hash, subject: c.message });
      }

      branchAtTip.set(c.hash, tip1);
      commitBranch.set(c.hash, tip1);
    }
  }

  const data = core.getRenderedData();
  const commitsByHash = new Map(data.commits.map((c) => [c.hash, c]));

  let minX = Infinity;
  let maxX = 0;
  const renderedCommits: RenderedGraphCommit[] = commits.map((c, i) => {
    const rc = commitsByHash.get(c.hash);
    const x = rc ? rc.x : 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    return {
      hash: c.hash,
      shortHash: c.shortHash,
      x,
      y: i * rowH,
      color: rc?.style?.color || PALETTE[0],
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      avatarHash: c.avatarHash,
      hasRefs: (c.refs && c.refs.length > 0) || false
    };
  });

  // Normalize x if all commits are offset
  if (minX > 0 && minX !== Infinity) {
    for (const c of renderedCommits) {
      c.x -= minX;
    }
    maxX = Math.max(0, maxX - minX);
  }

  const branchesPaths: RenderedGraphBranchPath[] = [];
  for (const [branch, paths] of data.branchesPaths) {
    if (paths && paths.length > 0) {
      try {
        const d = toSvgPath(paths, true, true);
        if (d) {
          branchesPaths.push({
            name: branch.name,
            color: branch.computedColor || PALETTE[0],
            d
          });
        }
      } catch {
        // Fall back gracefully if a malformed path cannot be converted
      }
    }
  }

  return {
    commits: renderedCommits,
    branchesPaths,
    width: Math.max(maxX + laneW + 20, 36),
    height: commits.length * rowH
  };
}
