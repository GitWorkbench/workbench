import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { discardFile, getStatus, getWorkingDiffText, parseUnifiedDiff, unstageFiles } from '../../src/main/git/status-diff';
import { applyHunkPatch, discardHunk, discardLines, getBlameLines, getFileHistory, stageHunk, stageLines, unstageHunk, unstageLines, exportPatch, applyPatchFile } from '../../src/main/git/hunk-actions';
import { createGitFixture, type GitFixture } from './git-fixture';
import { revertHunk } from '../../src/main/git/branch-stash';
import { getCommitDiffText } from '../../src/main/git/commit-detail';

describe('working tree, staging and patch workflows with real Git', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('reports clean branch state and separates staged, unstaged and untracked changes', async () => {
    expect(await getStatus(fixture.repo)).toEqual({ currentBranch: 'main', ahead: 0, behind: 0, staged: [], unstaged: [] });
    await fixture.write('readme.txt', 'staged\n');
    await fixture.git('add', 'readme.txt');
    await fixture.write('readme.txt', 'working\n');
    await fixture.write('new file.txt', 'new\n');
    const status = await getStatus(fixture.repo);
    expect(status.staged).toContainEqual({ path: 'readme.txt', status: 'modified', staged: true, unstaged: false });
    expect(status.unstaged).toEqual(expect.arrayContaining([
      { path: 'readme.txt', status: 'modified', staged: false, unstaged: true },
      { path: 'new file.txt', status: 'untracked', staged: false, unstaged: true }
    ]));
  });

  it('reports staged renames and deleted working files', async () => {
    await fixture.git('mv', 'readme.txt', 'renamed file.txt');
    expect((await getStatus(fixture.repo)).staged).toContainEqual(expect.objectContaining({ path: 'renamed file.txt', status: 'renamed', renamedFrom: 'readme.txt' }));
    await rm(path.join(fixture.repo, 'renamed file.txt'));
    expect((await getStatus(fixture.repo)).unstaged).toContainEqual(expect.objectContaining({ path: 'renamed file.txt', status: 'deleted' }));
  });

  it('creates and parses diffs for new filenames containing spaces and pathspec metacharacters', async () => {
    const filename = '[draft] notes.txt';
    await fixture.write(filename, 'one\ntwo\n');
    const diff = await getWorkingDiffText(fixture.repo, filename);
    const parsed = parseUnifiedDiff(diff, filename);
    expect(parsed.insertions).toBe(2);
    expect(parsed.deletions).toBe(0);
    expect(parsed.hunks[0].lines.filter(line => line.kind === 'add').map(line => line.content)).toEqual(['one', 'two']);
    expect(await getWorkingDiffText(fixture.repo, filename, true)).toBe('');
    expect(await getWorkingDiffText(fixture.repo, 'missing.txt')).toBe('');
  });

  it('unstages selected paths and all paths while preserving working content', async () => {
    await fixture.write('readme.txt', 'modified\n');
    await fixture.write('other.txt', 'new\n');
    await fixture.git('add', '--all');
    await unstageFiles(fixture.repo, []);
    expect((await getStatus(fixture.repo)).staged).toHaveLength(2);
    await unstageFiles(fixture.repo, ['readme.txt']);
    expect((await getStatus(fixture.repo)).staged.map(file => file.path)).toEqual(['other.txt']);
    await unstageFiles(fixture.repo);
    expect((await getStatus(fixture.repo)).staged).toEqual([]);
    expect(await fixture.read('readme.txt')).toBe('modified\n');
    expect(await fixture.read('other.txt')).toBe('new\n');
  });

  it('unstages the initial index in an unborn repository without deleting files', async () => {
    const unborn = await createGitFixture({ '[new].txt': 'unborn\n' }, false);
    try {
      await unborn.git('add', '--all');
      await unstageFiles(unborn.repo, ['[new].txt']);
      expect((await getStatus(unborn.repo)).staged).toEqual([]);
      expect(await unborn.read('[new].txt')).toBe('unborn\n');
      await unborn.git('add', '--all');
      await unstageFiles(unborn.repo);
      expect((await getStatus(unborn.repo)).staged).toEqual([]);
    } finally { await unborn.cleanup(); }
  });

  it('discards unstaged changes against the index while retaining staged edits', async () => {
    await fixture.write('readme.txt', 'staged\n');
    await fixture.git('add', 'readme.txt');
    await fixture.write('readme.txt', 'discard me\n');
    await discardFile(fixture.repo, 'readme.txt');
    expect(await fixture.read('readme.txt')).toBe('staged\n');
    expect((await getStatus(fixture.repo)).staged).toHaveLength(1);
    await fixture.write('[new].txt', 'delete me\n');
    await fixture.write('n.txt', 'keep me\n');
    await discardFile(fixture.repo, '[new].txt');
    await expect(fixture.read('[new].txt')).rejects.toThrow();
    expect(await fixture.read('n.txt')).toBe('keep me\n');
  });

  it('stages and unstages a hunk without changing the working file', async () => {
    await fixture.write('readme.txt', 'replacement\nadded\n');
    await stageHunk(fixture.repo, 'readme.txt', 0);
    expect(await fixture.git('show', ':readme.txt')).toBe('replacement\nadded\n');
    expect(await getWorkingDiffText(fixture.repo, 'readme.txt')).toBe('');
    await unstageHunk(fixture.repo, 'readme.txt', 0);
    expect(await fixture.git('show', ':readme.txt')).toBe('baseline\n');
    expect(await fixture.read('readme.txt')).toBe('replacement\nadded\n');
  });

  it('stages a new file hunk and can reverse it from the index', async () => {
    await fixture.write('new file.txt', 'line one\nline two\n');
    await stageHunk(fixture.repo, 'new file.txt', 0);
    expect(await fixture.git('show', ':new file.txt')).toBe('line one\nline two\n');
    await unstageHunk(fixture.repo, 'new file.txt', 0);
    expect((await getStatus(fixture.repo)).unstaged).toContainEqual(expect.objectContaining({ path: 'new file.txt', status: 'untracked' }));
  });

  it('changes only the chosen separated hunk', async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    await fixture.write('readme.txt', lines.join('\n') + '\n');
    await fixture.commitAll('Long file');
    const edited = [...lines]; edited[1] = 'changed first'; edited[22] = 'changed last';
    await fixture.write('readme.txt', edited.join('\n') + '\n');
    const patch = await getWorkingDiffText(fixture.repo, 'readme.txt');
    expect(parseUnifiedDiff(patch, 'readme.txt').hunks).toHaveLength(2);
    await stageHunk(fixture.repo, 'readme.txt', 0);
    expect(await fixture.git('show', ':readme.txt')).toContain('changed first');
    expect(await fixture.git('show', ':readme.txt')).not.toContain('changed last');
    await discardHunk(fixture.repo, 'readme.txt', 0);
    expect(await fixture.read('readme.txt')).toBe((await fixture.git('show', ':readme.txt')));
  });

  it('stages, unstages and discards individual changed lines', async () => {
    await fixture.write('readme.txt', 'baseline\nfirst\nsecond\n');
    await stageLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.git('show', ':readme.txt')).toBe('baseline\nfirst\n');
    await unstageLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.git('show', ':readme.txt')).toBe('baseline\n');
    await discardLines(fixture.repo, 'readme.txt', 0, [2]);
    expect(await fixture.read('readme.txt')).toBe('baseline\nfirst\n');
  });

  it('keeps unselected additions when individually unstaging and discarding lines', async () => {
    await fixture.write('readme.txt', 'baseline\nfirst\nsecond\n'); await fixture.git('add', 'readme.txt');
    await unstageLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.git('show', ':readme.txt')).toBe('baseline\nsecond\n');
    await discardLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.read('readme.txt')).toBe('baseline\nsecond\n');
    expect(await fixture.git('show', ':readme.txt')).toBe('baseline\nsecond\n');
  });

  it('handles partial deletions while preserving unselected removed lines in the index', async () => {
    await fixture.write('readme.txt', 'one\ntwo\nthree\n'); await fixture.commitAll('Three lines');
    await fixture.write('readme.txt', 'one\n');
    await stageLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.git('show', ':readme.txt')).toBe('one\nthree\n');
    await unstageLines(fixture.repo, 'readme.txt', 0, [1]);
    expect(await fixture.git('show', ':readme.txt')).toBe('one\ntwo\nthree\n');
    await discardLines(fixture.repo, 'readme.txt', 0, [2]);
    expect(await fixture.read('readme.txt')).toBe('one\nthree\n');
  });

  it('stages selected lines of a new file without staging the other new content', async () => {
    await fixture.write('new file.txt', 'first\nsecond\n');
    await stageLines(fixture.repo, 'new file.txt', 0, [0]);
    expect(await fixture.git('show', ':new file.txt')).toBe('first\n');
    expect(await fixture.read('new file.txt')).toBe('first\nsecond\n');
    await expect(stageLines(fixture.repo, 'new file.txt', 4, [0])).rejects.toThrow('not found');
  });

  it('reverts one committed hunk into the working tree while retaining HEAD and index', async () => {
    await fixture.write('readme.txt', 'committed change\n'); const hash = await fixture.commitAll('Change to revert');
    await revertHunk(fixture.repo, await getCommitDiffText(fixture.repo, hash, 'readme.txt'), 0);
    expect(await fixture.read('readme.txt')).toBe('baseline\n');
    expect(await fixture.git('show', ':readme.txt')).toBe('committed change\n');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(hash);
  });

  it('rejects missing hunks and empty line selections without mutating state', async () => {
    await fixture.write('readme.txt', 'baseline\nadded\n');
    await expect(stageHunk(fixture.repo, 'readme.txt', 9)).rejects.toThrow('not found');
    await expect(unstageHunk(fixture.repo, 'readme.txt', 0)).rejects.toThrow('not found');
    await expect(discardHunk(fixture.repo, 'readme.txt', 9)).rejects.toThrow('not found');
    await expect(stageLines(fixture.repo, 'readme.txt', 0, [])).rejects.toThrow('Select at least one changed line');
    await expect(applyHunkPatch(fixture.repo, '', 0, [])).rejects.toThrow('not found');
    expect(await fixture.read('readme.txt')).toBe('baseline\nadded\n');
    expect((await getStatus(fixture.repo)).staged).toEqual([]);
  });

  it('reports binary diffs without trying to render text hunks', async () => {
    await fixture.write('binary.bin', Buffer.from([0, 1, 2]));
    await fixture.commitAll('Binary baseline');
    await fixture.write('binary.bin', Buffer.from([0, 4, 5]));
    expect(parseUnifiedDiff(await getWorkingDiffText(fixture.repo, 'binary.bin'), 'binary.bin')).toEqual({ path: 'binary.bin', hunks: [], insertions: 0, deletions: 0, isBinary: true });
  });

  it('returns blame and per-file history with real author and line metadata', async () => {
    await fixture.write('readme.txt', 'baseline\nnext\n');
    const latest = await fixture.commitAll('Append line');
    const blame = await getBlameLines(fixture.repo, 'readme.txt');
    expect(blame).toHaveLength(2);
    expect(blame[0]).toMatchObject({ lineNo: 1, commitHash: fixture.initialHash, author: 'Git Workbench Test', authorEmail: 'tests@git-workbench.invalid', content: 'baseline' });
    expect(blame[1]).toMatchObject({ lineNo: 2, commitHash: latest, summary: 'Append line', content: 'next' });
    expect((await getFileHistory(fixture.repo, 'readme.txt')).map(commit => commit.hash)).toEqual([latest, fixture.initialHash]);
    expect(await getBlameLines(fixture.repo, 'missing.txt')).toEqual([]);
    expect(await getFileHistory(fixture.repo, 'missing.txt')).toEqual([]);
  });

  it('exports a commit patch and reapplies it to its parent without changing HEAD', async () => {
    await fixture.write('patch.txt', 'exported content\n');
    const hash = await fixture.commitAll('Export change');
    const patchPath = path.join(fixture.root, 'commit.patch');
    await exportPatch(fixture.repo, hash, patchPath);
    await fixture.git('reset', '--hard', fixture.initialHash);
    await applyPatchFile(fixture.repo, patchPath);
    expect(await fixture.read('patch.txt')).toBe('exported content\n');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
    expect((await getStatus(fixture.repo)).staged).toEqual([]);
  });
});
