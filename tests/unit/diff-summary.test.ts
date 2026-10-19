import { describe, expect, it, vi } from 'vitest';
import type { SimpleGit } from 'simple-git';
import { getCommitBase, getDiffSummary } from '../../src/main/git/diff-summary';

function gitReturning(...results: string[]) {
  const raw = vi.fn();
  for (const result of results) raw.mockResolvedValueOnce(result);
  return { git: { raw } as unknown as SimpleGit, raw };
}
describe('getDiffSummary', () => {
  it('uses NUL-delimited Git output and preserves spaces, tabs, Unicode, and renamed paths', async () => {
    const names = ['A', 'new file.ts', 'D', 'removed.ts', 'M', 'src/with\ttab.ts', 'R100', 'old name.ts', '名前.ts', 'C80', 'original.ts', 'copy.ts', 'M', 'picture.png', ''].join('\0');
    const stats = ['3\t0\tnew file.ts', '0\t4\tremoved.ts', '2\t1\tsrc/with\ttab.ts', '1\t2\t', 'old name.ts', '名前.ts', '5\t0\tcopy.ts', '-\t-\tpicture.png', ''].join('\0');
    const { git, raw } = gitReturning(stats, names);
    expect(await getDiffSummary(git, 'base', 'target')).toEqual({
      files: [
        { path: 'new file.ts', renamedFrom: undefined, status: 'added', insertions: 3, deletions: 0 },
        { path: 'removed.ts', renamedFrom: undefined, status: 'deleted', insertions: 0, deletions: 4 },
        { path: 'src/with\ttab.ts', renamedFrom: undefined, status: 'modified', insertions: 2, deletions: 1 },
        { path: '名前.ts', renamedFrom: 'old name.ts', status: 'renamed', insertions: 1, deletions: 2 },
        { path: 'copy.ts', renamedFrom: 'original.ts', status: 'renamed', insertions: 5, deletions: 0 },
        { path: 'picture.png', renamedFrom: undefined, status: 'modified', insertions: undefined, deletions: undefined }
      ], insertions: 11, deletions: 7
    });
    expect(raw.mock.calls).toEqual([
      [['diff', '--numstat', '-z', '-M', 'base', 'target', '--']],
      [['diff', '--name-status', '-z', '-M', 'base', 'target', '--']]
    ]);
  });
  it('handles empty diffs, malformed stat rows and unmatched metadata safely', async () => {
    expect(await getDiffSummary(gitReturning('', '').git, 'a', 'b')).toEqual({ files: [], insertions: 0, deletions: 0 });
    const { git } = gitReturning('not valid\0' + '9\t2\tunlisted.ts\0', 'M\0listed.ts\0');
    expect(await getDiffSummary(git, 'a', 'b')).toEqual({ files: [{ path: 'listed.ts', renamedFrom: undefined, status: 'modified' }], insertions: 0, deletions: 0 });
  });
  it('propagates Git failures instead of returning fabricated statistics', async () => {
    const raw = vi.fn().mockRejectedValue(new Error('bad revision'));
    await expect(getDiffSummary({ raw } as unknown as SimpleGit, 'a', 'b')).rejects.toThrow('bad revision');
  });
});
describe('getCommitBase', () => {
  it('selects the first parent of a merge commit', async () => {
    const { git, raw } = gitReturning('merge first-parent second-parent\n');
    expect(await getCommitBase(git, 'merge')).toBe('first-parent');
    expect(raw).toHaveBeenCalledExactlyOnceWith(['rev-list', '--parents', '-n', '1', 'merge']);
  });
  it('uses the empty tree hash for root commits', async () => {
    const { git, raw } = gitReturning('root\n', 'empty-tree\n');
    expect(await getCommitBase(git, 'root')).toBe('empty-tree');
    expect(raw.mock.calls[1]).toEqual([['hash-object', '-t', 'tree', '/dev/null']]);
  });
});
