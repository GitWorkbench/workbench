import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finishGitFlowBranch, getGitFlowConfig, initGitFlow, startGitFlowBranch } from '../../src/main/git/gitflow';
import { captureResolutionMemory, resolutionMemoryState, setResolutionMemory } from '../../src/main/git/resolution-memory';
import { getConflictFile, resolveConflictFile } from '../../src/main/git/conflict-files';
import { createGitFixture, createMergeConflict, type GitFixture } from './git-fixture';

describe('Git Flow branch lifecycles', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('detects defaults and initializes a develop branch with local configuration', async () => {
    expect(await getGitFlowConfig(fixture.repo)).toEqual({ initialized: false, masterBranch: 'main', developBranch: 'develop', featurePrefix: 'feature/', releasePrefix: 'release/', hotfixPrefix: 'hotfix/', bugfixPrefix: 'bugfix/', supportPrefix: 'support/', versionTagPrefix: 'v' });
    expect(await initGitFlow(fixture.repo)).toEqual({ ok: true });
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('develop');
    expect(await getGitFlowConfig(fixture.repo)).toMatchObject({ initialized: true, masterBranch: 'main', developBranch: 'develop' });
    await initGitFlow(fixture.repo);
    expect((await fixture.git('branch', '--list', 'develop')).trim()).toBe('* develop');
  });

  it.each(['feature', 'bugfix'] as const)('starts, sanitizes and finishes %s branches into develop', async type => {
    await initGitFlow(fixture.repo);
    const started = await startGitFlowBranch(fixture.repo, { type, name: `${type}/Readable feature!` });
    expect(started).toEqual({ ok: true, branchName: `${type}/Readable-feature` });
    await fixture.write(`${type}.txt`, 'change\n'); const feature = await fixture.commitAll(`${type} work`);
    expect(await finishGitFlowBranch(fixture.repo, { branchName: started.branchName! })).toEqual({ ok: true });
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('develop');
    expect((await fixture.git('show', 'develop:' + `${type}.txt`))).toBe('change\n');
    await expect(fixture.git('rev-parse', '--verify', started.branchName!)).rejects.toThrow();
    expect((await fixture.git('show', '-s', '--format=%P', 'develop')).trim().split(' ')).toContain(feature);
  });

  it.each(['release', 'hotfix'] as const)('finishes %s branches into main and develop with annotated version tags', async type => {
    await initGitFlow(fixture.repo);
    const started = await startGitFlowBranch(fixture.repo, { type, name: '1.2.3' });
    await fixture.write(`${type}.txt`, `${type}\n`); await fixture.commitAll(`${type} work`);
    expect(await finishGitFlowBranch(fixture.repo, { branchName: started.branchName!, tagMessage: 'Published milestone', keepBranch: true })).toEqual({ ok: true });
    expect(await fixture.git('show', `main:${type}.txt`)).toBe(`${type}\n`);
    expect(await fixture.git('show', `develop:${type}.txt`)).toBe(`${type}\n`);
    expect((await fixture.git('cat-file', '-t', 'v1.2.3')).trim()).toBe('tag');
    expect((await fixture.git('for-each-ref', '--format=%(contents:subject)', 'refs/tags/v1.2.3')).trim()).toBe('Published milestone');
    expect((await fixture.git('branch', '--list', started.branchName!)).trim()).toBe(started.branchName);
  });

  it('retains support branches without merging or changing checkout', async () => {
    await initGitFlow(fixture.repo);
    const started = await startGitFlowBranch(fixture.repo, { type: 'support', name: 'legacy' });
    await fixture.write('support.txt', 'long term support\n'); const head = await fixture.commitAll('Support work');
    expect(await finishGitFlowBranch(fixture.repo, { branchName: started.branchName! })).toEqual({ ok: true });
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(head);
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('support/legacy');
    await expect(fixture.git('show', 'main:support.txt')).rejects.toThrow();
  });

  it('supports custom prefixes and bases, rejects blank names and missing finish branches', async () => {
    await initGitFlow(fixture.repo, { masterBranch: 'production', developBranch: 'integration', featurePrefix: 'work/', versionTagPrefix: '' });
    expect(await getGitFlowConfig(fixture.repo)).toMatchObject({ masterBranch: 'production', developBranch: 'integration', featurePrefix: 'work/', versionTagPrefix: '' });
    expect(await startGitFlowBranch(fixture.repo, { type: 'feature', name: '!? ' })).toEqual({ ok: false, error: 'Please enter a valid branch name' });
    expect(await startGitFlowBranch(fixture.repo, { type: 'feature', name: 'example', baseBranch: 'main' })).toEqual({ ok: true, branchName: 'work/example' });
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(fixture.initialHash);
    expect(await finishGitFlowBranch(fixture.repo, { branchName: 'missing' })).toMatchObject({ ok: false, error: expect.stringContaining('does not exist') });
  });

  it('falls back to current branch for missing base and finishes ordinary branches', async () => {
    await initGitFlow(fixture.repo);
    expect(await startGitFlowBranch(fixture.repo, { type: 'feature', name: 'fallback', baseBranch: 'missing' })).toEqual({ ok: true, branchName: 'feature/fallback' });
    await fixture.git('checkout', 'develop'); await fixture.git('checkout', '-b', 'plain');
    await fixture.write('plain.txt', 'plain\n'); await fixture.commitAll('Ordinary branch');
    expect(await finishGitFlowBranch(fixture.repo, { branchName: 'plain' })).toEqual({ ok: true });
    expect(await fixture.git('show', 'develop:plain.txt')).toBe('plain\n');
  });
});

describe('suggestion-only conflict resolution memory', () => {
  let fixture: GitFixture;
  beforeEach(async () => { fixture = await createGitFixture(); });
  afterEach(async () => { await fixture.cleanup(); });

  it('toggles application memory independently of Git automatic replay', async () => {
    expect(await resolutionMemoryState(fixture.repo)).toEqual({ enabled: false, gitAutomatic: false, remembered: 0 });
    await fixture.git('config', 'rerere.enabled', 'true');
    expect(await setResolutionMemory(fixture.repo, true)).toEqual({ enabled: true, gitAutomatic: false, remembered: 0 });
    expect(await setResolutionMemory(fixture.repo, false)).toEqual({ enabled: false, gitAutomatic: false, remembered: 0 });
    expect(await captureResolutionMemory(fixture.repo)).toEqual(new Map());
    await expect(setResolutionMemory(fixture.repo, 'true' as unknown as boolean)).rejects.toThrow('Choose whether');
  });

  it('learns a reviewed result and suggests it for repeated conflicts without rewriting files or staging', async () => {
    await setResolutionMemory(fixture.repo, true);
    await createMergeConflict(fixture);
    const original = await fixture.read('readme.txt');
    const index = await fixture.git('ls-files', '--unmerged');
    expect(await captureResolutionMemory(fixture.repo)).toEqual(new Map());
    expect(await fixture.read('readme.txt')).toBe(original); expect(await fixture.git('ls-files', '--unmerged')).toBe(index);
    const conflict = await getConflictFile(fixture.repo, 'readme.txt');
    await resolveConflictFile(fixture.repo, 'readme.txt', 'reviewed combined result\n', { expectedSnapshot: conflict.snapshot, action: 'result' });
    expect(await resolutionMemoryState(fixture.repo)).toMatchObject({ enabled: true, gitAutomatic: false, remembered: 1 });
    await fixture.git('merge', '--abort'); await fixture.git('merge', 'incoming').catch(() => {});
    const nextOriginal = await fixture.read('readme.txt'); const nextIndex = await fixture.git('ls-files', '--unmerged');
    expect(await captureResolutionMemory(fixture.repo)).toEqual(new Map([['readme.txt', 'reviewed combined result\n']]));
    expect(await fixture.read('readme.txt')).toBe(nextOriginal); expect(await fixture.git('ls-files', '--unmerged')).toBe(nextIndex);
    expect(nextOriginal).toContain('<<<<<<<');
    await expect(captureResolutionMemory(fixture.repo, 'missing.txt')).rejects.toThrow('no longer conflicted');
  });

  it('counts only valid cache directories with resolved postimages', async () => {
    const cache = path.join(fixture.repo, '.git', 'rr-cache');
    for (const [name, file] of [['a'.repeat(40), 'postimage'], ['b'.repeat(40), 'postimage.2'], ['c'.repeat(40), 'preimage'], ['invalid', 'postimage']]) {
      await mkdir(path.join(cache, name), { recursive: true }); await writeFile(path.join(cache, name, file), 'data');
    }
    expect(await resolutionMemoryState(fixture.repo)).toMatchObject({ remembered: 2 });
  });
});
