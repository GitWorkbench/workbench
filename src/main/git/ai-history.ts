import type { AiCommitConfig, AiCommitDraft, BranchChangesExplanation, CommitRewordSnapshot } from '../../shared/types';
import { generateCommitMessage, explainCodeChanges } from '../ai';
import { cleanBranch, gitCommand, resolveCommit } from './advanced-process';

async function rewordTarget(repo: string, revision: string) {
  const current = await cleanBranch(repo);
  const commitHash = await resolveCommit(repo, revision);
  await gitCommand(repo, ['merge-base', '--is-ancestor', commitHash, current.head]).catch(() => {
    throw new Error('Choose a commit on the checked-out branch.');
  });
  const parents = (await gitCommand(repo, ['show', '-s', '--format=%P', commitHash, '--'])).trim().split(/\s+/).filter(Boolean);
  const merges = (await gitCommand(repo, ['rev-list', '--merges', `${commitHash}..${current.head}`, '--'])).trim();
  if (parents.length > 1 || merges) throw new Error('AI message rewriting requires linear history. This commit or its descendants contain a merge.');
  const count = Number((await gitCommand(repo, ['rev-list', '--count', `${commitHash}..${current.head}`, '--'])).trim());
  if (count >= 500) throw new Error('Choose a commit within the latest 500 commits on this branch.');
  return { ...current, commitHash };
}

export async function validateAiReword(repo: string, revision: string, message: string, expected: CommitRewordSnapshot) {
  if (!expected || typeof expected.head !== 'string' || typeof expected.branch !== 'string' || !/^[a-f0-9]{40,64}$/i.test(expected.head) || !expected.branch) throw new Error('Generate a fresh message draft before applying it.');
  if (typeof message !== 'string' || !message.trim() || message.length > 100_000 || message.includes('\0')) throw new Error('Enter a nonempty commit message under 100,000 characters.');
  const current = await rewordTarget(repo, revision);
  if (current.head !== expected.head || current.branch !== expected.branch) throw new Error('The checked-out branch or HEAD changed. Generate a fresh draft before applying.');
}

/** Recreate objects and move one branch atomically; never check out historical files. */
export async function applyAiReword(repo: string, revision: string, message: string, expected: CommitRewordSnapshot) {
  await validateAiReword(repo, revision, message, expected);
  const commit = await resolveCommit(repo, revision);
  const descendants = (await gitCommand(repo, ['rev-list', '--reverse', `${commit}..${expected.head}`, '--'])).trim().split('\n').filter(Boolean);
  let parent = '';
  for (const [index, hash] of [commit, ...descendants].entries()) {
    const raw = await gitCommand(repo, ['show', '-s', '--format=format:%T%x00%P%x00%an%x00%ae%x00%aI%x00%B', hash, '--']);
    const [tree, parents, name, email, date, ...body] = raw.split('\0');
    if (!/^[a-f0-9]{40,64}$/i.test(tree) || !name || !email || !date) throw new Error('Git returned incomplete commit metadata. No branch was changed.');
    if (index === 0) parent = parents.trim();
    parent = (await gitCommand(repo, ['-c', 'commit.gpgsign=false', 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-F', '-'],
      index === 0 ? message.trim() + '\n' : body.join('\0'),
      { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date })).trim();
  }
  const oldTree = (await gitCommand(repo, ['rev-parse', `${expected.head}^{tree}`])).trim();
  const newTree = (await gitCommand(repo, ['rev-parse', `${parent}^{tree}`])).trim();
  if (oldTree !== newTree) throw new Error('The rewritten tree differs from the original. No branch was changed.');
  await validateAiReword(repo, commit, message, expected);
  await gitCommand(repo, ['update-ref', '-m', 'Git Workbench: reword commit message', `refs/heads/${expected.branch}`, parent, expected.head]);
}

export async function recomposeCommitMessage(repo: string, revision: string, config?: Partial<AiCommitConfig>): Promise<AiCommitDraft> {
  const snapshot = await rewordTarget(repo, revision);
  const originalMessage = (await gitCommand(repo, ['show', '-s', '--format=%B', snapshot.commitHash, '--'])).trimEnd();
  const diff = await gitCommand(repo, ['show', '--format=', '--no-ext-diff', '--no-textconv', '--find-renames', snapshot.commitHash, '--']);
  if (!diff.trim()) throw new Error('This commit has no file changes to use for generation. Edit its message manually.');
  const result = await generateCommitMessage({ ...config, diff });
  if (!result.ok || !result.message?.trim()) throw new Error(result.error || 'The model returned an empty commit message.');
  return { ...snapshot, originalMessage, message: result.message.trim(), inputTruncated: diff.length > 8_000 && !!config?.provider && config.provider !== 'local' };
}

export async function explainBranchChanges(repo: string, base: string, tip: string, config?: Partial<AiCommitConfig>): Promise<BranchChangesExplanation> {
  const baseHash = await resolveCommit(repo, base), tipHash = await resolveCommit(repo, tip);
  const mergeBase = (await gitCommand(repo, ['merge-base', baseHash, tipHash]).catch(() => {
    throw new Error('The selected revisions have no common ancestor, or Git could not compare them. Choose a related base branch.');
  })).trim();
  if (!mergeBase) throw new Error('The selected revisions have no common ancestor. Choose a related base branch.');
  const commitCount = Number((await gitCommand(repo, ['rev-list', '--count', `${mergeBase}..${tipHash}`, '--'])).trim());
  const names = await gitCommand(repo, ['diff', '--name-only', '-z', mergeBase, tipHash, '--']);
  const filesChanged = names.split('\0').filter(Boolean).length;
  const diff = await gitCommand(repo, ['diff', '--no-ext-diff', '--no-textconv', '--find-renames', mergeBase, tipHash, '--']);
  if (!diff.trim()) return { baseHash, tipHash, mergeBase, commitCount, filesChanged, explanation: 'There are no file changes between the common ancestor and the selected tip.' };
  const result = await explainCodeChanges(diff, config);
  if (!result.ok || !result.explanation?.trim()) throw new Error(result.error || 'The model returned an empty explanation.');
  return { baseHash, tipHash, mergeBase, commitCount, filesChanged, explanation: result.explanation };
}
