import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';

/** Timeout is an instance option in simple-git, not a chainable method. */
export function gitFor(repoPath: string, options: Pick<SimpleGitOptions, 'timeout'> = {}): SimpleGit {
  const opts: Partial<SimpleGitOptions> = {
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
    ...options
  };
  return simpleGit(opts);
}

export function isValidRepo(repoPath: string): boolean {
  try {
    if (!fs.existsSync(repoPath)) return false;
    const dotGit = path.join(repoPath, '.git');
    if (!fs.existsSync(dotGit)) return false;
    // Support worktrees/submodules where .git is a file pointer.
    const st = fs.statSync(dotGit);
    if (st.isDirectory()) return fs.existsSync(path.join(dotGit, 'HEAD'));
    return st.isFile();
  } catch {
    return false;
  }
}

/** Wraps a git operation, converting errors to a friendly single-line message. */
export async function withGit<T>(repoPath: string, fn: (git: SimpleGit) => Promise<T>, options: Pick<SimpleGitOptions, 'timeout'> = {}): Promise<T> {
  if (!isValidRepo(repoPath)) throw new Error(`Not a git repository: ${repoPath}`);
  return fn(gitFor(repoPath, options));
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.split('\n').filter(Boolean).slice(-1)[0] || err.message;
  return String(err);
}
