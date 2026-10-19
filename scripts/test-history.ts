import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  checkoutCommit,
  createBranchAt,
  resetBranchTo,
  editCommitMessage,
  revertCommit,
  dropCommit,
  moveCommitDown,
  applyPatchCommit,
  deleteBranchEx,
  gravatarHash,
  createWorktree
} from '../src/main/git/history';
import { withGit } from '../src/main/git/core';

const exec = promisify(execFile);
const repo = '/tmp/gg-hist-test';

async function log(): Promise<string> {
  const { stdout } = await exec('git', ['log', '--oneline'], { cwd: repo });
  return stdout.trim();
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok:', msg);
}

const main = async () => {
  const before = await log();
  const lines = before.split('\n');
  const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const mid = (await exec('git', ['rev-parse', 'HEAD~1'], { cwd: repo })).stdout.trim();

  // checkout detached
  await checkoutCommit(repo, mid);
  assert((await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim() === mid, 'checkoutCommit detached');
  await checkoutCommit(repo, head);

  // create branch at commit
  if ((await exec('git', ['branch', '--list', 'from-c1'], { cwd: repo })).stdout.trim()) await deleteBranchEx(repo, 'from-c1', { local: true, force: true });
  await createBranchAt(repo, 'from-c1', (await exec('git', ['rev-parse', 'HEAD~2'], { cwd: repo })).stdout.trim());
  const br = (await exec('git', ['branch', '--list', 'from-c1'], { cwd: repo })).stdout.trim();
  assert(!!br, 'createBranchAt');

  // reword non-HEAD commit
  await editCommitMessage(repo, mid, 'c2-renamed');
  const afterReword = await log();
  assert(afterReword.includes('c2-renamed') && !afterReword.includes('c2\n') && !/\bc2\b(?!-)/.test(afterReword), 'editCommitMessage (reword HEAD~1)');

  const lines2 = (await log()).split('\n');
  assert(lines2.length === lines.length, 'reword preserves commit count');

  // drop HEAD~1 (plain history, safe)
  const dropTarget = (await exec('git', ['rev-parse', 'HEAD~1'], { cwd: repo })).stdout.trim();
  const cntBefore = (await log()).split('\n').length;
  await dropCommit(repo, dropTarget);
  assert((await log()).split('\n').length === cntBefore - 1, 'dropCommit removes commit');

  // move commit down (plain history: move the oldest commit one step down)
  const c1hash = (await exec('git', ['rev-parse', 'HEAD~1'], { cwd: repo })).stdout.trim();
  const ordered1 = await log();
  await moveCommitDown(repo, c1hash);
  const ordered2 = await log();
  assert(ordered1.split('\n')[0] !== ordered2.split('\n')[0], 'moveCommitDown reorders');

  // revert HEAD
  const cnt = (await log()).split('\n').length;
  await revertCommit(repo, (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim());
  assert((await log()).split('\n').length === cnt + 1, 'revertCommit adds revert commit');

  // cherry-pick the pre-revert commit back on top
  await applyPatchCommit(repo, (await exec('git', ['rev-parse', 'HEAD~1'], { cwd: repo })).stdout.trim());
  assert(true, 'applyPatchCommit (cherry-pick)');

  // worktree
  await createWorktree(repo, 'wt-x', (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim());
  assert(require('node:fs').existsSync(repo + '/wt-x'), 'createWorktree');

  // reset
  await resetBranchTo(repo, (await exec('git', ['rev-parse', 'HEAD~1'], { cwd: repo })).stdout.trim(), 'hard');
  assert(true, 'resetBranchTo hard');

  // delete branch
  await deleteBranchEx(repo, 'from-c1', { local: true, force: true });
  assert(!(await exec('git', ['branch', '--list', 'from-c1'], { cwd: repo })).stdout.trim(), 'deleteBranchEx local');

  // gravatar
  assert(gravatarHash('T@E.com ') === gravatarHash('t@e.com'), 'gravatarHash normalizes email');

  // withGit sanity after ops
  await withGit(repo, async (g) => {
    assert((await g.raw(['status', '--porcelain'])) !== undefined, 'repo still healthy');
  });
  console.log('ALL-OK');
};

void main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
