import type { BranchInfo, WorktreeInfo } from '../../../shared/types';

export interface ProtectedBranch {
  branch: BranchInfo;
  reason: string;
}

export function classifyBranchesForCleanup(
  branches: BranchInfo[],
  currentBranch: string,
  worktrees: WorktreeInfo[],
  cleanupTarget: string
): { eligible: BranchInfo[]; protected: ProtectedBranch[] } {
  const checkedOut = new Set(worktrees.map(worktree => worktree.branch));
  const eligible: BranchInfo[] = [];
  const protectedBranches: ProtectedBranch[] = [];

  for (const branch of branches) {
    const isCurrent = branch.isCurrent || branch.name === currentBranch || branch.fullName === currentBranch;
    const isCheckedOut = checkedOut.has(branch.name) || checkedOut.has(branch.fullName);
    const reason = isCurrent
      ? 'Current branch'
      : branch.isDefault
      ? 'Default branch'
      : isCheckedOut
      ? 'Checked out in a worktree'
      : !branch.isMerged
      ? `Not merged into ${cleanupTarget}`
      : '';

    if (reason) protectedBranches.push({ branch, reason });
    else eligible.push(branch);
  }

  return { eligible, protected: protectedBranches };
}
