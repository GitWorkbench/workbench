import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { withGit } from './core';

const execFileP = promisify(execFile);

/** Write a temporary editor script git can run as $GIT_SEQUENCE_EDITOR. */
function tmpScript(name: string, code: string): string {
  const file = path.join(os.tmpdir(), `git-workbench-${name}-${crypto.randomBytes(4).toString('hex')}.cjs`);
  require('node:fs').writeFileSync(file, code);
  return file;
}

/** Resolve the rebase base for a commit: its parent, or --root for root commits. */
async function rebaseBase(repoPath: string, hash: string): Promise<string> {
  const check = await execFileP('git', ['rev-parse', '--verify', `${hash}^`], { cwd: repoPath }).catch(() => null);
  return check ? `${hash}^` : '--root';
}

/** Run an interactive rebase from <base> with a script-driven todo editor.
 * The editor script receives the todo file as argv[2] and mutates it. */
async function interactiveRebase(
  repoPath: string,
  base: string,
  todoScript: string,
  messageScript?: string
): Promise<void> {
  const todoFile = tmpScript('todo', todoScript);
  const msgFile = messageScript ? tmpScript('msg', messageScript) : '/bin/true';
  const env = {
    ...process.env,
    GIT_SEQUENCE_EDITOR: `node ${JSON.stringify(todoFile)}`,
    GIT_EDITOR: messageScript ? `node ${JSON.stringify(msgFile)}` : '/bin/true'
  };
  try {
    await execFileP('git', ['rebase', '-i', base], { cwd: repoPath, env, maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    // Leave the repo in a clean state instead of mid-rebase
    await execFileP('git', ['rebase', '--abort'], { cwd: repoPath }).catch(() => {});
    throw err;
  } finally {
    void fsp.unlink(todoFile).catch(() => {});
    if (messageScript) void fsp.unlink(msgFile).catch(() => {});
  }
}

/** Checkout a commit as detached HEAD. Always uses --detach so that checking
 *  out a commit whose hash matches a branch tip (e.g. HEAD of main/master) still
 *  produces a detached HEAD rather than silently switching to that branch. */
export async function checkoutCommit(repoPath: string, hash: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['checkout', '--detach', hash]));
}

/** Create a branch pointing at an arbitrary commit. */
export async function createBranchAt(repoPath: string, name: string, hash: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['branch', name, hash]));
}

/** Reset the current branch to a commit. */
export async function resetBranchTo(
  repoPath: string,
  hash: string,
  mode: 'soft' | 'mixed' | 'hard'
): Promise<void> {
  await withGit(repoPath, (git) =>
    git.reset([mode === 'hard' ? '--hard' : mode === 'soft' ? '--soft' : '--mixed', hash])
  );
}

/** Create a worktree at `worktreePath` checked out at `hash`. */
export async function createWorktree(repoPath: string, worktreePath: string, hash: string): Promise<void> {
  const abs = path.isAbsolute(worktreePath) ? worktreePath : path.join(repoPath, worktreePath);
  await withGit(repoPath, (git) => git.raw(['worktree', 'add', abs, hash]));
}

/**
 * Edit a commit message. HEAD commits are amended directly; older commits are
 * reworded through an interactive rebase (reword todo line).
 */
export async function editCommitMessage(repoPath: string, hash: string, message: string): Promise<void> {
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
  if (stdout.trim() === hash) {
    await withGit(repoPath, (git) => git.raw(['commit', '--amend', '--only', '-m', message]));
    return;
  }
  const short = hash.slice(0, 7);
  const todoScript = [
    "const todo = process.argv[2];",
    "const fs = require('node:fs');",
    "const lines = fs.readFileSync(todo, 'utf8').split('\\n');",
    "const out = lines.map((l) =>",
    `  l.startsWith('pick ') && l.slice(4).trim().startsWith('${short}') ? l.replace(/^pick /, 'reword ') : l`,
    ");",
    "fs.writeFileSync(todo, out.join('\\n'));"
  ].join('\n');
  const messageScript = [
    "const fs = require('node:fs');",
    `fs.writeFileSync(process.argv[2], ${JSON.stringify(message)});`
  ].join('\n');
  await interactiveRebase(repoPath, await rebaseBase(repoPath, hash), todoScript, messageScript);
}

/** Revert a commit (--no-edit). */
export async function revertCommit(repoPath: string, hash: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['revert', '--no-edit', hash]));
}

/** Drop a commit from history via an interactive rebase. */
export async function dropCommit(repoPath: string, hash: string): Promise<void> {
  const short = hash.slice(0, 7);
  const todoScript = [
    "const todo = process.argv[2];",
    "const fs = require('node:fs');",
    "const lines = fs.readFileSync(todo, 'utf8').split('\\n').filter(",
    `  (l) => !(l.startsWith('pick ') && l.slice(4).trim().startsWith('${short}'))`,
    ");",
    "fs.writeFileSync(todo, lines.join('\\n'));"
  ].join('\n');
  await interactiveRebase(repoPath, await rebaseBase(repoPath, hash), todoScript).catch((err) => {
    if (/nothing to do/i.test(String(err?.message ?? err))) {
      throw new Error('Cannot drop this commit — it is the only commit in its history range.');
    }
    throw err;
  });
}

/** Cherry-pick (apply) a commit's patch onto the current branch. */
export async function applyPatchCommit(repoPath: string, hash: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['cherry-pick', hash]));
}

/** Move a commit one step down (towards older commits) via an interactive rebase. */
export async function moveCommitDown(repoPath: string, hash: string): Promise<void> {
  const parent = await execFileP('git', ['rev-parse', '--verify', `${hash}^`], { cwd: repoPath }).catch(() => null);
  if (!parent) throw new Error('The root commit cannot move further down.');
  const short = hash.slice(0, 7);
  const todoScript = [
    "const todo = process.argv[2];",
    "const fs = require('node:fs');",
    "const lines = fs.readFileSync(todo, 'utf8').split('\\n');",
    `const idx = lines.findIndex(l => l.startsWith('pick ') && l.slice(4).trim().startsWith('${short}'));`,
    "if (idx < 1 || !lines[idx - 1].startsWith('pick ')) throw new Error('Commit cannot be moved down');",
    "[lines[idx - 1], lines[idx]] = [lines[idx], lines[idx - 1]];",
    "fs.writeFileSync(todo, lines.join('\\n'));"
  ].join('\n');
  await interactiveRebase(repoPath, await rebaseBase(repoPath, parent.stdout.trim()), todoScript);
}

/** Set a local branch's upstream tracking branch. */
export async function setUpstream(repoPath: string, branch: string, upstream: string): Promise<void> {
  await withGit(repoPath, (git) => git.raw(['branch', '--set-upstream-to', upstream, branch]));
}

/** Push and set upstream in one step. */
export async function pushSetUpstream(repoPath: string, branch: string, remote = 'origin'): Promise<void> {
  await withGit(repoPath, (git) => git.push(['--set-upstream', remote, branch]));
}

/** Delete a local branch, a remote branch, or both. */
export async function deleteBranchEx(
  repoPath: string,
  name: string,
  opts: { local?: boolean; remote?: boolean; remoteName?: string; force?: boolean }
): Promise<void> {
  const remoteName = opts.remoteName || 'origin';
  await withGit(repoPath, async (git) => {
    if (opts.local) {
      try {
        await git.deleteLocalBranch(name, !!opts.force);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!opts.force && /not fully merged/i.test(message)) {
          throw new Error(`Branch '${name}' is not fully merged. Use "force delete" to discard its commits.`);
        }
        throw err;
      }
    }
    if (opts.remote) {
      await git.raw(['push', remoteName, '--delete', name]);
    }
  });
}

/** MD5 hash for Gravatar avatars (email normalized per Gravatar rules). */
export function gravatarHash(email: string): string {
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}
