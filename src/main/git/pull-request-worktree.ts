import { pullRequestProviders } from '../../shared/hosting-provider';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PullReviewTarget, PullRequestCredential, PullRequestProvider } from '../../shared/types';
import { gitWithEnvironment } from './advanced-process';
import { apiPath, hostedReviewClient, requestJson } from './pull-requests';
import { getRemotes } from './objects-navigation';

export async function openPullRequestWorktree(repo: string, input: PullReviewTarget & { head: string; directory: string; branch: string }, credentials: (p: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null) {
  if (!input || !pullRequestProviders.includes(input.provider) || !/^\d+$/.test(input.requestId) || !/^[a-f0-9]{40,64}$/i.test(input.head)) throw new Error('Load the current request revision before opening a worktree.');
  const git = gitWithEnvironment(repo, { GIT_LFS_SKIP_SMUDGE: '1' }, 120_000);
  if (!input.branch || input.branch.startsWith('-')) throw new Error('Enter a new local review branch name.');
  await git.raw(['check-ref-format', `refs/heads/${input.branch}`]);
  if (await git.raw(['show-ref', '--verify', `refs/heads/${input.branch}`]).then(() => true, () => false)) throw new Error('That branch already exists. Choose a new review branch name.');
  if (!path.isAbsolute(input.directory)) throw new Error('Select an absolute worktree destination.');
  const parent = await fs.realpath(path.dirname(input.directory));
  const destination = path.join(parent, path.basename(input.directory));
  if (await fs.lstat(destination).then(() => true, () => false)) throw new Error('The destination already exists. Choose a new folder name.');
  const root = await fs.realpath(repo);
  const relative = path.relative(root, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Choose a destination outside the current repository.');
  const { config, credential } = await hostedReviewClient(repo, input.remoteName, input.provider, credentials);
  const remote = (await getRemotes(repo)).find(r => r.name === input.remoteName);
  if (!remote) throw new Error('The selected remote no longer exists.');
  const endpoint = `${apiPath(config)}/${(input.provider === 'github' || input.provider === 'gitea') ? 'pulls' : input.provider === 'gitlab' ? 'merge_requests' : 'pullrequests'}/${input.requestId}`;
  const pr = await requestJson<Record<string, any>>(config, credential, endpoint, 'GET');
  const currentHead = (input.provider === 'github' || input.provider === 'gitea') ? pr.head?.sha : input.provider === 'gitlab' ? pr.diff_refs?.head_sha || pr.sha : pr.source?.commit?.hash;
  if (currentHead !== input.head) throw new Error('The request has new commits. Refresh the review and try again.');
  let source = remote.name;
  let ref = (input.provider === 'github' || input.provider === 'gitea') ? `refs/pull/${input.requestId}/head` : `refs/merge-requests/${input.requestId}/head`;
  if (input.provider === 'bitbucket') {
    const fullName = pr.source?.repository?.full_name;
    const branch = pr.source?.branch?.name;
    if (typeof fullName !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(fullName) || fullName.split('/').some(part => part === '.' || part === '..') || typeof branch !== 'string') throw new Error('The Bitbucket source repository or branch is unavailable.');
    await git.raw(['check-ref-format', `refs/heads/${branch}`]);
    source = /^(git@|ssh:)/.test(remote.fetchUrl) ? `git@bitbucket.org:${fullName}.git` : `https://bitbucket.org/${fullName}.git`;
    ref = `refs/heads/${branch}`;
  }
  const savedRef = `refs/git-workbench/reviews/${crypto.randomUUID()}`;
  const noHooks = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-review-hooks-'));
  try {
    await git.raw(['-c', 'fetch.recurseSubmodules=false', 'fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--', source, `${ref}:${savedRef}`]);
    const fetched = (await git.raw(['rev-parse', '--verify', `${savedRef}^{commit}`])).trim();
    if (fetched !== input.head) throw new Error('The request changed during fetch. Refresh the review before opening it.');
    try {
      await git.raw(['-c', `core.hooksPath=${noHooks}`, '-c', 'submodule.recurse=false', 'worktree', 'add', '-b', input.branch, '--', destination, fetched]);
    } catch (error) {
      // Git can leave a registered worktree or a new branch after a checkout/filter failure.
      // Never remove partially populated files automatically.
      const registered = (await git.raw(['worktree', 'list', '--porcelain', '-z']).catch(() => '')).split('\0').some(line => line === `worktree ${destination}`);
      const exists = await fs.lstat(destination).then(() => true, () => false);
      if (!registered && !exists) await git.raw(['update-ref', '-d', `refs/heads/${input.branch}`, fetched]).catch(() => {});
      throw new Error(`${String(error).split('\n').filter(Boolean).slice(-1)[0] || 'Checkout failed.'} ${registered || exists ? `A partial checkout may remain at ${destination}. Inspect it in Actions → Worktrees before retrying; your original checkout is unchanged.` : 'The original checkout is unchanged. Correct the Git error and try again.'}`);
    }
    return { ok: true, path: destination, branch: input.branch };
  } finally {
    await git.raw(['update-ref', '-d', savedRef]).catch(() => {});
    await fs.rm(noHooks, { recursive: true, force: true });
  }
}
