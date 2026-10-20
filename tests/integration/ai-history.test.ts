import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitFixture, type GitFixture } from './git-fixture';
const mock = vi.hoisted(() => ({ generate: vi.fn(), explain: vi.fn() }));
vi.mock('../../src/main/ai', () => ({ generateCommitMessage: mock.generate, explainCodeChanges: mock.explain }));
import { applyAiReword, explainBranchChanges, recomposeCommitMessage } from '../../src/main/git/ai-history';

let fixture: GitFixture;
beforeEach(async () => {
  fixture = await createGitFixture();
  mock.generate.mockReset().mockResolvedValue({ ok: true, message: 'feat: rewritten root message' });
  mock.explain.mockReset().mockResolvedValue({ ok: true, explanation: 'The feature adds a second file.' });
});
afterEach(async () => { await fixture.cleanup(); });

describe('real Git AI history behavior', () => {
  it('rewrites a root message and descendant parents while preserving all trees, author metadata, messages, and files', async () => {
    await fixture.write('next.txt', 'second file\n'); const oldHead = await fixture.commitAll('Second subject\n\nSecond body');
    const oldRoot = fixture.initialHash;
    const tree = (await fixture.git('rev-parse', `${oldHead}^{tree}`)).trim();
    const originalAuthor = await fixture.git('show', '-s', '--format=%an%x00%ae%x00%aI', oldRoot);
    const childMessage = await fixture.git('show', '-s', '--format=%B', oldHead);
    const draft = await recomposeCommitMessage(fixture.repo, oldRoot);
    expect(draft).toMatchObject({ commitHash: oldRoot, head: oldHead, branch: 'main' });
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(oldHead);
    await applyAiReword(fixture.repo, oldRoot, draft.message, draft);
    const newHead = (await fixture.git('rev-parse', 'HEAD')).trim();
    expect(newHead).not.toBe(oldHead);
    expect((await fixture.git('rev-parse', `${newHead}^{tree}`)).trim()).toBe(tree);
    expect(await fixture.git('status', '--porcelain=v1', '--untracked-files=all')).toBe('');
    expect(await fixture.git('show', '-s', '--format=%B', newHead)).toBe(childMessage);
    const newRoot = (await fixture.git('rev-list', '--max-parents=0', newHead)).trim();
    expect((await fixture.git('show', '-s', '--format=%B', newRoot)).trim()).toBe(draft.message);
    expect(await fixture.git('show', '-s', '--format=%an%x00%ae%x00%aI', newRoot)).toBe(originalAuthor);
    expect((await fixture.git('rev-parse', `${newRoot}^{tree}`)).trim()).toBe((await fixture.git('rev-parse', `${oldRoot}^{tree}`)).trim());
    expect(await fixture.read('next.txt')).toBe('second file\n');
  });
  it('preserves dirty and untracked files and rejects a stale generated snapshot', async () => {
    const draft = await recomposeCommitMessage(fixture.repo, fixture.initialHash);
    await fixture.write('readme.txt', 'unstaged draft\n'); await fixture.write('private.txt', 'untracked draft\n');
    await expect(applyAiReword(fixture.repo, fixture.initialHash, draft.message, draft)).rejects.toThrow('including untracked');
    expect(await fixture.read('readme.txt')).toBe('unstaged draft\n'); expect(await fixture.read('private.txt')).toBe('untracked draft\n');
    const newer = await fixture.commitAll('New commit after generation');
    await expect(applyAiReword(fixture.repo, fixture.initialHash, draft.message, draft)).rejects.toThrow('HEAD changed');
    expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(newer);
  });
  it('explains committed branch changes without changing the current checkout or staging files', async () => {
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('feature.txt', 'feature file\n'); const tip = await fixture.commitAll('Feature');
    await fixture.git('checkout', 'main'); await fixture.write('readme.txt', 'local unsaved draft\n');
    const result = await explainBranchChanges(fixture.repo, 'main', 'feature');
    expect(result).toMatchObject({ baseHash: fixture.initialHash, tipHash: tip, mergeBase: fixture.initialHash, commitCount: 1, filesChanged: 1, explanation: 'The feature adds a second file.' });
    expect(mock.explain).toHaveBeenCalledWith(expect.stringContaining('+feature file'), undefined);
    expect((await fixture.git('branch', '--show-current')).trim()).toBe('main');
    expect(await fixture.read('readme.txt')).toBe('local unsaved draft\n');
    expect((await fixture.git('diff', '--cached')).trim()).toBe('');
  });
  it('refuses a selected merge commit and its descendants before model access', async () => {
    await fixture.git('checkout', '-b', 'feature'); await fixture.write('feature.txt', 'feature\n'); await fixture.commitAll('Feature');
    await fixture.git('checkout', 'main'); await fixture.write('main.txt', 'main\n'); await fixture.commitAll('Main');
    await fixture.git('merge', '--no-ff', 'feature', '-m', 'Merge feature');
    const head = (await fixture.git('rev-parse', 'HEAD')).trim();
    await expect(recomposeCommitMessage(fixture.repo, head)).rejects.toThrow('linear history');
    await expect(recomposeCommitMessage(fixture.repo, fixture.initialHash)).rejects.toThrow('linear history');
    expect(mock.generate).not.toHaveBeenCalled(); expect((await fixture.git('rev-parse', 'HEAD')).trim()).toBe(head);
  });
});
