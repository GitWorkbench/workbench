import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);

/** Every fixture lives outside the checkout and uses only local Git operations. */
export async function createGitFixture(initialFiles: Record<string, string | Buffer> = { 'readme.txt': 'baseline\n' }, commit = true) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-workbench-integration-')));
  const repo = path.join(root, 'repository');
  const hooks = path.join(root, 'empty-hooks');
  const config = path.join(root, 'empty.gitconfig');
  await Promise.all([mkdir(repo), mkdir(hooks)]);
  await writeFile(config, '');
  const git = async (...args: string[]) => (await execute('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
      GIT_AUTHOR_NAME: 'Git Workbench Test', GIT_AUTHOR_EMAIL: 'tests@git-workbench.invalid',
      GIT_COMMITTER_NAME: 'Git Workbench Test', GIT_COMMITTER_EMAIL: 'tests@git-workbench.invalid' }
  })).stdout;
  const write = async (file: string, content: string | Buffer) => {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await writeFile(path.join(repo, file), content);
  };
  const read = (file: string) => readFile(path.join(repo, file), 'utf8');
  const commitAll = async (message: string) => {
    await git('add', '--all');
    await git('commit', '-m', message);
    return (await git('rev-parse', 'HEAD')).trim();
  };
  await git('init', '--initial-branch=main');
  for (const [key, value] of Object.entries({ 'user.name': 'Git Workbench Test', 'user.email': 'tests@git-workbench.invalid',
    'commit.gpgsign': 'false', 'tag.gpgsign': 'false', 'core.hooksPath': hooks, 'core.autocrlf': 'false', 'core.quotePath': 'false', 'core.editor': 'true' })) {
    await git('config', '--local', key, value);
  }
  for (const [file, content] of Object.entries(initialFiles)) await write(file, content);
  const initialHash = commit ? await commitAll('Initial fixture') : '';
  return { root, repo, git, write, read, commitAll, initialHash, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export type GitFixture = Awaited<ReturnType<typeof createGitFixture>>;

export async function createMergeConflict(fixture: GitFixture, file = 'readme.txt') {
  await fixture.git('checkout', '-b', 'incoming');
  await fixture.write(file, 'incoming change\n');
  await fixture.commitAll('Incoming change');
  await fixture.git('checkout', 'main');
  await fixture.write(file, 'current change\n');
  await fixture.commitAll('Current change');
  await fixture.git('merge', 'incoming').catch(() => {});
}
