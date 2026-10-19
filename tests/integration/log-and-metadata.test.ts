import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getLog, repoDisplayName } from '../../src/main/git/log';
import { compareCommits, getCommitDetail, getCommitDiffText, getComparisonFileDiff, getFileDiff } from '../../src/main/git/commit-detail';
import { errorMessage, gitFor, isValidRepo, withGit } from '../../src/main/git/core';
import { getStatus } from '../../src/main/git/status-diff';
import { generateChangelog } from '../../src/main/git/changelog';
import { pinRepository, pinnedRepositories, repositoryOverview } from '../../src/main/git/repository-dashboard';
import { createGitFixture, type GitFixture } from './git-fixture';

describe('repository graph, commit metadata and dashboard', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); vi.restoreAllMocks(); });

  it('validates Git repositories and exposes helpful failure messages', async () => {
    expect(isValidRepo(fixture.repo)).toBe(true);
    expect(isValidRepo(path.join(fixture.root, 'missing'))).toBe(false);
    const invalid = path.join(fixture.root, 'invalid'); await mkdir(path.join(invalid, '.git'), { recursive: true });
    expect(isValidRepo(invalid)).toBe(false);
    await expect(withGit(invalid, async () => 'bad')).rejects.toThrow('Not a git repository');
    await expect(getLog(invalid, null)).rejects.toThrow('Not a git repository');
    expect((await withGit(fixture.repo, git => git.raw(['branch', '--show-current']))).trim()).toBe('main');
    expect((await gitFor(fixture.repo, { timeout: { block: 10_000 } }).raw(['rev-parse', 'HEAD'])).trim()).toBe(fixture.initialHash);
    expect(errorMessage(new Error('first line\n\nlast line\n'))).toBe('last line');
    expect(errorMessage(new Error(''))).toBe(''); expect(errorMessage('text')).toBe('text'); expect(errorMessage(null)).toBe('null');
    expect(repoDisplayName(fixture.repo)).toBe('repository'); expect(repoDisplayName('/')).toBe('/');
  });

  it('returns graph metadata, refs, limits and uncommitted state consistently', async () => {
    await fixture.write('readme.txt', 'second\n'); const second = await fixture.commitAll('feat: second');
    await fixture.git('tag', 'v1.0.0');
    await fixture.git('branch', 'feature/local');
    await fixture.git('remote', 'add', 'origin', path.join(fixture.root, 'unused.git'));
    await fixture.git('update-ref', 'refs/remotes/origin/main', second);
    await fixture.write('readme.txt', 'working\n');
    const graph = await getLog(fixture.repo, await getStatus(fixture.repo), 1);
    expect(graph).toMatchObject({ totalCommits: 2, hasMore: true, hasUncommittedChanges: true });
    expect(graph.commits).toHaveLength(1);
    expect(graph.commits[0]).toMatchObject({ hash: second, shortHash: second.slice(0, 7), parents: [fixture.initialHash], message: 'feat: second', authorName: 'Git Workbench Test', authorEmail: 'tests@git-workbench.invalid', lane: expect.any(Number), lanes: [expect.any(Number)] });
    expect(graph.commits[0].refs).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'main', kind: 'head', isCurrent: true, isRemote: false }),
      expect.objectContaining({ label: 'feature/local', kind: 'branch', isRemote: false }),
      expect.objectContaining({ label: 'origin/main', kind: 'branch', isRemote: true }),
      expect.objectContaining({ label: 'v1.0.0', kind: 'tag' })
    ]));
    const full = await getLog(fixture.repo, null);
    expect(full).toMatchObject({ totalCommits: 2, hasMore: false, hasUncommittedChanges: false });
  });

  it('returns a merge node with both parent edges and preserves commit body text', async () => {
    await fixture.git('checkout', '-b', 'feature/topic'); await fixture.write('feature.txt', 'feature\n'); const feature = await fixture.commitAll('Feature');
    await fixture.git('checkout', 'main'); await fixture.write('main.txt', 'main\n'); const main = await fixture.commitAll('Main');
    await fixture.git('merge', '--no-ff', 'feature/topic', '-m', 'Merge topic\n\nFull body\nWith details');
    const mergeHash = (await fixture.git('rev-parse', 'HEAD')).trim();
    const graph = await getLog(fixture.repo, null);
    // Equal committer timestamps can put another ref first in Git's date order.
    const merge = graph.commits.find(commit => commit.hash === mergeHash);
    expect(merge).toMatchObject({ message: 'Merge topic', body: expect.stringContaining('Full body'), parents: [main, feature] });
    expect(merge?.lanes).toHaveLength(2);
    expect(merge?.pl2).toHaveLength(2);
  });

  it('excludes unreachable Git Workbench recovery refs from normal graph results', async () => {
    await fixture.git('checkout', '-b', 'temporary'); await fixture.write('hidden.txt', 'hidden\n'); const hidden = await fixture.commitAll('Hidden recovery commit');
    await fixture.git('checkout', 'main'); await fixture.git('branch', '-D', 'temporary');
    await fixture.git('update-ref', 'refs/git-workbench/test-hidden', hidden);
    const graph = await getLog(fixture.repo, null);
    expect(graph.totalCommits).toBe(1);
    expect(graph.commits.map(commit => commit.hash)).toEqual([fixture.initialHash]);
  });

  it('reads root commit details and its initial-file diff against an empty tree', async () => {
    const detail = await getCommitDetail(fixture.repo, fixture.initialHash);
    expect(detail).toMatchObject({ hash: fixture.initialHash, parents: [], message: 'Initial fixture', files: [expect.objectContaining({ path: 'readme.txt', status: 'added', insertions: 1, deletions: 0 })], insertions: 1, deletions: 0 });
    expect(await getFileDiff(fixture.repo, fixture.initialHash, 'readme.txt')).toMatchObject({ path: 'readme.txt', insertions: 1, deletions: 0 });
    expect(await getCommitDiffText(fixture.repo, fixture.initialHash)).toContain('+baseline');
  });

  it('returns rename-aware commit comparisons and per-file patches', async () => {
    await fixture.git('mv', 'readme.txt', 'renamed.txt'); const renamed = await fixture.commitAll('Rename readme');
    expect(await getCommitDetail(fixture.repo, renamed)).toMatchObject({ parents: [fixture.initialHash], files: [expect.objectContaining({ path: 'renamed.txt', renamedFrom: 'readme.txt', status: 'renamed' })] });
    expect(await compareCommits(fixture.repo, fixture.initialHash, renamed)).toMatchObject({ baseHash: fixture.initialHash, targetHash: renamed, baseSubject: 'Initial fixture', targetSubject: 'Rename readme', files: [expect.objectContaining({ renamedFrom: 'readme.txt', path: 'renamed.txt' })], insertions: 0, deletions: 0 });
    expect(await getCommitDiffText(fixture.repo, renamed, 'renamed.txt')).toContain('rename from readme.txt');
    expect(await getComparisonFileDiff(fixture.repo, fixture.initialHash, renamed, 'renamed.txt')).toMatchObject({ path: 'renamed.txt', insertions: 0, deletions: 0, hunks: [] });
  });

  it('serves staged and working file diff modes independently', async () => {
    await fixture.write('readme.txt', 'staged\n'); await fixture.git('add', 'readme.txt'); await fixture.write('readme.txt', 'working\n');
    const staged = await getFileDiff(fixture.repo, '', 'readme.txt', { staged: true });
    const working = await getFileDiff(fixture.repo, '', 'readme.txt', { worktree: true });
    expect(staged?.hunks[0].lines.map(line => line.content)).toEqual(['baseline', 'staged']);
    expect(working?.hunks[0].lines.map(line => line.content)).toEqual(['staged', 'working']);
    expect(await getComparisonFileDiff(fixture.repo, fixture.initialHash, fixture.initialHash, 'readme.txt')).toMatchObject({ hunks: [], insertions: 0, deletions: 0 });
  });

  it('returns null for invalid commit queries without crashing the caller', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getCommitDetail(fixture.repo, 'missing')).toBeNull();
    expect(await getFileDiff(fixture.repo, 'missing', 'readme.txt')).toBeNull();
    expect(await compareCommits(fixture.repo, 'missing', 'HEAD')).toBeNull();
    expect(await getComparisonFileDiff(fixture.repo, 'missing', 'HEAD', 'readme.txt')).toBeNull();
  });

  it('groups conventional commits in changelog order and preserves unknown categories', async () => {
    for (const [index, subject] of ['docs: usage', 'fix(ui): readable buttons', 'feat!: redesign', 'custom: other work', 'plain subject'].entries()) {
      await fixture.write(`change-${index}.txt`, `${subject}\n`); await fixture.commitAll(subject);
    }
    const changelog = await generateChangelog(fixture.repo, fixture.initialHash);
    expect(changelog).toMatchObject({ fromRef: fixture.initialHash, toRef: 'HEAD', totalCommits: 5 });
    expect(changelog?.categories.map(category => category.title)).toEqual(['✨ Features', '🐛 Bug Fixes', '📝 Documentation', '📌 Other Changes']);
    expect(changelog?.categories.at(-1)?.items).toHaveLength(2);
    expect(changelog?.markdown).toContain('fix(ui): readable buttons');
    expect((await generateChangelog(fixture.repo, ''))?.totalCommits).toBe(6);
    expect((await generateChangelog(fixture.repo, fixture.initialHash, fixture.initialHash))?.categories).toEqual([]);
    expect(await generateChangelog(fixture.repo, 'bad-ref')).toBeNull();
  });

  it('summarizes local repository changes without fetching hosted context', async () => {
    await fixture.write('readme.txt', 'modified\n'); await fixture.git('add', 'readme.txt'); await fixture.write('new.txt', 'new\n');
    const credentials = vi.fn(() => null);
    const overview = await repositoryOverview(fixture.repo, false, credentials);
    expect(overview).toMatchObject({ path: fixture.repo, branch: 'main', changed: 2, staged: 1, conflicts: 0, ahead: 0, behind: 0 });
    expect(overview.error).toBeUndefined(); expect(credentials).not.toHaveBeenCalled();
    expect(await repositoryOverview(path.join(fixture.root, 'missing'), false, credentials)).toMatchObject({ error: expect.stringContaining('Not a git repository'), changed: 0 });
  });

  it('shows provider configuration guidance for a hosted remote without issuing authenticated requests', async () => {
    await fixture.git('remote', 'add', 'origin', 'https://github.com/example/fixture.git');
    const credentials = vi.fn(() => null);
    const overview = await repositoryOverview(fixture.repo, true, credentials);
    expect(overview).toMatchObject({ branch: 'main', changed: 0, hostedMessage: expect.stringMatching(/Configure|configured/i) });
    expect(overview.requests).toBeUndefined();
    expect(credentials).toHaveBeenCalledWith('github');
  });

  it('persists ordered unique pins, removes pins and filters malformed input', async () => {
    const config = path.join(fixture.root, 'config');
    expect(await pinnedRepositories(config)).toEqual([]);
    expect(await pinRepository(config, '/repo/a', true)).toEqual(['/repo/a']);
    expect(await pinRepository(config, '/repo/b', true)).toEqual(['/repo/a', '/repo/b']);
    expect(await pinRepository(config, '/repo/a', true)).toEqual(['/repo/b', '/repo/a']);
    expect(await pinRepository(config, '/repo/b', false)).toEqual(['/repo/a']);
    await writeFile(path.join(config, 'pinned-repositories.json'), JSON.stringify(['/repo/a', 5, null, '/repo/a', '/repo/b']));
    expect(await pinnedRepositories(config)).toEqual(['/repo/a', '/repo/b']);
    await writeFile(path.join(config, 'pinned-repositories.json'), '{broken'); expect(await pinnedRepositories(config)).toEqual([]);
    await writeFile(path.join(config, 'pinned-repositories.json'), '{}'); expect(await pinnedRepositories(config)).toEqual([]);
  });

  it('enforces the 50-repository pin limit while allowing an existing pin to move', async () => {
    const config = path.join(fixture.root, 'config'); await mkdir(config);
    const pins = Array.from({ length: 50 }, (_, index) => `/repo/${index}`);
    await writeFile(path.join(config, 'pinned-repositories.json'), JSON.stringify(pins));
    await expect(pinRepository(config, '/repo/extra', true)).rejects.toThrow('up to 50');
    expect(await pinnedRepositories(config)).toEqual(pins);
    expect((await pinRepository(config, '/repo/0', true)).at(-1)).toBe('/repo/0');
  });
});
