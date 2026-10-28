import { describe, expect, it } from 'vitest';
import { parsePlaygroundCommand, playgroundGitArguments } from '../../src/main/playground-lab';

describe('lesson command grammar', () => {
  it.each([
    ['git status', ['status']], ['  git  status --short ', ['status', '--short']],
    ['git commit -m "A friendly message"', ['commit', '-m', 'A friendly message']],
    ["git stash push -m 'My unfinished idea'", ['stash', 'push', '-m', 'My unfinished idea']],
    ['git commit -m "Say hello; no shell runs"', ['commit', '-m', 'Say hello; no shell runs']],
    ['git commit -m ""', ['commit', '-m', '']], ['git\tlog\t--oneline', ['log', '--oneline']]
  ])('parses %s into argv without shell evaluation', (input, expected) => expect(parsePlaygroundCommand(input)).toEqual(expected));
  it.each([null, 123, 'x'.repeat(2049), 'git status\nwhoami', 'git status\0', 'git status\r'])('rejects malformed input %j', command => expect(() => parsePlaygroundCommand(command as string)).toThrow('one Git command'));
  it.each(['', 'git', 'ls', 'echo hello'])('requires a Git command: %s', command => expect(() => parsePlaygroundCommand(command)).toThrow('Start with git'));
  it('explains unclosed quotes', () => expect(() => parsePlaygroundCommand('git commit -m "hello')).toThrow('Close the quote'));
  const files = ['notes.txt', 'draft.txt'];
  it.each([
    ['git status', ['status']], ['git status --short', ['status', '--short']],
    ['git log', ['log', '--all', '--oneline', '--decorate', '-12']], ['git log --oneline --all', ['log', '--all', '--oneline', '--decorate', '-12']],
    ['git diff', ['diff', '--no-ext-diff', '--no-textconv']], ['git diff --staged', ['diff', '--no-ext-diff', '--no-textconv', '--staged']],
    ['git add notes.txt draft.txt', ['add', '--', ...files]], ['git add .', ['add', '--', ...files]],
    ['git restore --staged notes.txt', ['restore', '--staged', '--', 'notes.txt']], ['git commit -m "Learn Git"', ['commit', '-m', 'Learn Git']],
    ['git switch main', ['switch', 'main']], ['git switch -c feature/hello', ['switch', '-c', 'feature/hello']],
    ['git branch', ['branch']], ['git branch rescue', ['branch', 'rescue']], ['git branch rescue HEAD@{1}', ['branch', 'rescue', 'HEAD@{1}']],
    ['git branch rescue HEAD~2', ['branch', 'rescue', 'HEAD~2']], ['git branch rescue HEAD^1', ['branch', 'rescue', 'HEAD^1']],
    ['git merge feature', ['merge', '--no-edit', 'feature']], ['git cherry-pick feature/note', ['cherry-pick', 'feature/note']],
    ['git reflog', ['reflog', '--oneline', '-12']], ['git stash list', ['stash', 'list']], ['git stash push', ['stash', 'push']], ['git stash pop', ['stash', 'pop']],
    ['git stash push -m "pause"', ['stash', 'push', '-m', 'pause']],
    ['git bisect start playground-bad playground-good', ['bisect', 'start', 'playground-bad', 'playground-good']],
    ...['good', 'bad', 'skip', 'reset'].map(value => [`git bisect ${value}`, ['bisect', value]])
  ])('permits the bounded lesson operation %s', (command, args) => expect(playgroundGitArguments(parsePlaygroundCommand(command as string), files)).toEqual(args));
  it.each([
    'git status --porcelain -z', 'git status --help', 'git log --output=/elsewhere', 'git diff --ext-diff',
    'git diff --staged --stat', 'git add', 'git add ../other', 'git add .git/config', 'git add --all',
    'git restore notes.txt', 'git restore --staged ../other', 'git restore --worktree notes.txt',
    'git commit -a -m hello', 'git commit -m ""', 'git commit --amend',
    'git switch', 'git switch --detach', 'git switch -c --other', 'git switch -C main',
    'git branch -D main', 'git branch x y z', 'git merge --abort', 'git merge feature extra',
    'git cherry-pick --continue', 'git cherry-pick', 'git reflog delete HEAD', 'git stash', 'git stash clear',
    'git stash push -m ""', 'git stash push --all text', 'git bisect run arbitrary-command', 'git bisect start x --bad',
    'git bisect start x', 'git bisect good revision', 'git remote add origin https://elsewhere.test',
    'git push', 'git fetch', 'git config core.hooksPath /elsewhere', 'git status ; rm file', 'git reset --hard', 'git switch /absolute'
  ])('blocks unsupported or external operations: %s', command => expect(() => playgroundGitArguments(parsePlaygroundCommand(command), files)).toThrow('outside this practice prompt'));
});
