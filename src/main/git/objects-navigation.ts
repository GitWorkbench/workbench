import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { TagInfo, RemoteInfo, SubmoduleInfo, WorktreeInfo } from '../../shared/types';
import { withGit } from './core';

const execFileP = promisify(execFile);

// =================== TAGS ===================

export async function getTags(repoPath: string): Promise<TagInfo[]> {
  try {
    const { stdout } = await execFileP(
      'git',
      [
        'tag',
        '-l',
        '--sort=-creatordate',
        '--format=%(refname:short)%09%(objectname)%09%(objectname:short)%09%(creatordate:short)%09%(subject)'
      ],
      { cwd: repoPath }
    );
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const [name, hash, shortHash, date, message] = line.split('\t');
      return {
        name: name || '',
        hash: hash || '',
        shortHash: shortHash || '',
        date: date || '',
        message: message || ''
      };
    });
  } catch {
    return [];
  }
}

export async function createTag(
  repoPath: string,
  name: string,
  commitHash?: string,
  message?: string
): Promise<void> {
  const args = ['tag'];
  if (message && message.trim().length > 0) {
    args.push('-a', name, '-m', message.trim());
  } else {
    args.push(name);
  }
  if (commitHash) {
    args.push(commitHash);
  }
  await execFileP('git', args, { cwd: repoPath });
}

export async function deleteTag(
  repoPath: string,
  name: string,
  deleteRemote = false,
  remoteName = 'origin'
): Promise<void> {
  // Delete local tag
  await execFileP('git', ['tag', '-d', name], { cwd: repoPath });
  // Optionally delete remote tag
  if (deleteRemote) {
    try {
      await execFileP('git', ['push', remoteName, '--delete', name], { cwd: repoPath });
    } catch {}
  }
}

export async function pushTag(
  repoPath: string,
  name: string,
  remoteName = 'origin'
): Promise<void> {
  await execFileP('git', ['push', remoteName, name], { cwd: repoPath });
}

// =================== REMOTES ===================

export async function getRemotes(repoPath: string): Promise<RemoteInfo[]> {
  try {
    const { stdout } = await execFileP('git', ['remote', '-v'], { cwd: repoPath });
    const map = new Map<string, { fetchUrl: string; pushUrl: string }>();

    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Format: <name>\t<url> (fetch|push)
      const match = trimmed.match(/^([^\t\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/);
      if (match) {
        const [, name, url, type] = match;
        if (!map.has(name)) {
          map.set(name, { fetchUrl: '', pushUrl: '' });
        }
        const entry = map.get(name)!;
        if (type === 'fetch') entry.fetchUrl = url;
        if (type === 'push') entry.pushUrl = url;
      }
    }

    return Array.from(map.entries()).map(([name, urls]) => ({
      name,
      fetchUrl: urls.fetchUrl || urls.pushUrl,
      pushUrl: urls.pushUrl || urls.fetchUrl
    }));
  } catch {
    return [];
  }
}

export async function addRemote(repoPath: string, name: string, url: string): Promise<void> {
  await execFileP('git', ['remote', 'add', name, url], { cwd: repoPath });
}

export async function renameRemote(
  repoPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  await execFileP('git', ['remote', 'rename', oldName, newName], { cwd: repoPath });
}

export async function setRemoteUrl(repoPath: string, name: string, url: string): Promise<void> {
  await execFileP('git', ['remote', 'set-url', name, url], { cwd: repoPath });
}

export async function removeRemote(repoPath: string, name: string): Promise<void> {
  await execFileP('git', ['remote', 'remove', name], { cwd: repoPath });
}

export async function pruneRemote(repoPath: string, name: string): Promise<void> {
  await execFileP('git', ['remote', 'prune', name], { cwd: repoPath });
}

// =================== SUBMODULES ===================

export async function getSubmodules(repoPath: string): Promise<SubmoduleInfo[]> {
  try {
    const { stdout } = await execFileP('git', ['submodule', 'status'], { cwd: repoPath });
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const trimmed = line.trim();
      const statusChar = line[0] === ' ' ? ' ' : line[0];
      const rest = trimmed.replace(/^[-+U ]/, '').trim();
      const parts = rest.split(/\s+/);
      const hash = parts[0] || '';
      const subPath = parts[1] || '';
      const name = path.basename(subPath);

      return {
        name,
        path: subPath,
        hash,
        isInitialized: statusChar !== '-',
        isDirty: statusChar === 'U',
        isOutOfSync: statusChar === '+'
      };
    });
  } catch {
    return [];
  }
}

export async function updateSubmodules(repoPath: string, subPath?: string): Promise<void> {
  const args = ['submodule', 'update', '--init', '--recursive'];
  if (subPath) args.push(subPath);
  await execFileP('git', args, { cwd: repoPath });
}

// =================== WORKTREES ===================

export async function getWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execFileP('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath
    });
    const blocks = stdout.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
    const result: WorktreeInfo[] = [];

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let wtPath = '';
      let hash = '';
      let branch = '';
      let isBare = false;
      let isLocked = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.slice(9).trim();
        } else if (line.startsWith('HEAD ')) {
          hash = line.slice(5).trim();
        } else if (line.startsWith('branch ')) {
          branch = line.slice(7).replace(/^refs\/heads\//, '').trim();
        } else if (line.startsWith('bare')) {
          isBare = true;
        } else if (line.startsWith('locked')) {
          isLocked = true;
        }
      }

      if (wtPath) {
        result.push({
          path: wtPath,
          hash,
          branch: branch || '(detached)',
          isBare,
          isLocked
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<void> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  await execFileP('git', args, { cwd: repoPath });
}
