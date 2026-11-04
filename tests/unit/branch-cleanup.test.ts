import { describe, expect, it } from 'vitest';
import type { BranchInfo, WorktreeInfo } from '../../src/shared/types';
import { classifyBranchesForCleanup } from '../../src/renderer/components/Sidebar/branch-cleanup';

const branch = (name: string, patch: Partial<BranchInfo> = {}): BranchInfo => ({
  name, fullName: name, isCurrent: false, isRemote: false, isMerged: true, ...patch
});
const worktree = (branchName: string): WorktreeInfo => ({ path: `/work/${branchName}`, hash: 'abc', branch: branchName });

describe('safe branch cleanup classification', () => {
  it('allows merged branches and protects current, default, linked, and unmerged branches', () => {
    const result = classifyBranchesForCleanup([
      branch('main', { isDefault: true }),
      branch('current', { isCurrent: true }),
      branch('linked'),
      branch('unmerged', { isMerged: false }),
      branch('ready'),
      branch('nested/ready')
    ], 'current', [worktree('linked')], 'origin/main');

    expect(result.eligible.map(item => item.name)).toEqual(['ready', 'nested/ready']);
    expect(result.protected.map(item => [item.branch.name, item.reason])).toEqual([
      ['main', 'Default branch'], ['current', 'Current branch'], ['linked', 'Checked out in a worktree'],
      ['unmerged', 'Not merged into origin/main']
    ]);
  });

  it('recognizes current and worktree branches by their full ref and handles empty lists', () => {
    const result = classifyBranchesForCleanup([
      branch('main', { fullName: 'refs/heads/main' }),
      branch('linked', { fullName: 'refs/heads/linked' })
    ], 'refs/heads/main', [worktree('refs/heads/linked')], 'HEAD');
    expect(result.eligible).toEqual([]);
    expect(result.protected.map(item => item.reason)).toEqual(['Current branch', 'Checked out in a worktree']);
    expect(classifyBranchesForCleanup([], 'main', [], 'HEAD')).toEqual({ eligible: [], protected: [] });
  });
});
