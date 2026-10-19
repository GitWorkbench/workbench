import { spawn } from 'node:child_process';
import { gitFor } from './core';
import { getRepoOperationState } from './conflicts-rebase';

/** Argument-only Git execution with bounded output, stdin, and no interactive prompts. */
export function gitCommand(repo: string, args: string[], input?: string, env?: NodeJS.ProcessEnv, timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repo, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0, failure = '';
    const timer = setTimeout(() => { failure = 'Git timed out. Try a smaller operation.'; child.kill(); }, timeout);
    for (const [stream, target] of [[child.stdout, stdout], [child.stderr, stderr]] as const) stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) { failure = 'Git output exceeded 32 MB. Choose a smaller operation.'; child.kill(); }
      else target.push(chunk);
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); const output = Buffer.concat(stdout).toString('utf8'); if (code === 0 && !failure) resolve(output); else reject(new Error(failure || Buffer.concat(stderr).toString('utf8').trim() || `Git exited with code ${code}.`)); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** Internal environment overrides must preserve the host environment. */
export function gitWithEnvironment(repo: string, env: NodeJS.ProcessEnv, timeout = 30_000) {
  return { raw: (args: string[]) => gitCommand(repo, args, undefined, env, timeout) };
}

export async function cleanBranch(repo: string): Promise<{ branch: string; head: string }> {
  const git = gitFor(repo), operation = await getRepoOperationState(repo);
  if (operation.inMerge || operation.inRebase || operation.inCherryPick || operation.conflictedFiles.length) throw new Error('Finish or abort the active Git operation first.');
  const branch = (await git.raw(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  if (!branch) throw new Error('Check out a local branch first.');
  if ((await git.raw(['status', '--porcelain=v1', '--untracked-files=all'])).trim()) throw new Error('Commit or stash all changes, including untracked files, before continuing.');
  return { branch, head: (await git.raw(['rev-parse', '--verify', 'HEAD'])).trim() };
}

export async function resolveCommit(repo: string, revision: string): Promise<string> {
  if (typeof revision !== 'string' || !revision.trim() || revision.length > 4096) throw new Error('Choose a commit revision.');
  return (await gitCommand(repo, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`])).trim();
}
