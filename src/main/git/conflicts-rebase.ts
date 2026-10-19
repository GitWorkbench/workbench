import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  RepoOperationState,
  RebaseStep,
  MergeSimulationResult
} from '../../shared/types';
import { withGit } from './core';

const execFileP = promisify(execFile);

async function rebaseEditorDirectory(repoPath: string): Promise<string> {
  const { stdout } = await execFileP('git', ['rev-parse', '--absolute-git-dir'], { cwd: repoPath });
  return path.join(stdout.trim(), 'git-workbench-rebase-editor');
}

async function cleanupRebaseEditor(repoPath: string): Promise<void> {
  const directory = await rebaseEditorDirectory(repoPath);
  // Only files created by this application; never remove Git's rebase state.
  for (const name of ['todo.cjs', 'message.cjs']) {
    await fs.promises.unlink(path.join(directory, name)).catch(() => {});
  }
  await fs.promises.rmdir(directory).catch(() => {});
}

/** Check repository operation state (Merge, Rebase, Cherry-Pick, Conflicted files) */
export async function getRepoOperationState(repoPath: string): Promise<RepoOperationState> {
  const realGitDir = (await execFileP('git', ['rev-parse', '--absolute-git-dir'], { cwd: repoPath })).stdout.trim();

  const inMerge = fs.existsSync(path.join(realGitDir, 'MERGE_HEAD'));
  const inRebase =
    fs.existsSync(path.join(realGitDir, 'rebase-merge')) ||
    fs.existsSync(path.join(realGitDir, 'rebase-apply'));
  const inCherryPick = fs.existsSync(path.join(realGitDir, 'CHERRY_PICK_HEAD'));

  // Get list of conflicted files from git status
  const conflictedFiles: string[] = [];
  try {
    const { stdout } = await execFileP('git', ['diff', '--name-only', '--diff-filter=U', '-z'], { cwd: repoPath });
    conflictedFiles.push(...stdout.split('\0').filter(Boolean));
  } catch {}

  return {
    inMerge,
    inRebase,
    inCherryPick,
    conflictedFiles
  };
}

export { getConflictFile, resolveConflictFile } from './conflict-files';

/** Abort active merge, rebase, or cherry-pick operation */
export async function abortOperation(repoPath: string): Promise<void> {
  const state = await getRepoOperationState(repoPath);
  if (state.inRebase) {
    await execFileP('git', ['rebase', '--abort'], { cwd: repoPath });
    await cleanupRebaseEditor(repoPath);
  } else if (state.inMerge) {
    await execFileP('git', ['merge', '--abort'], { cwd: repoPath });
  } else if (state.inCherryPick) {
    await execFileP('git', ['cherry-pick', '--abort'], { cwd: repoPath });
  }
}

/** Continue active merge, rebase, or cherry-pick operation after conflicts resolved */
export async function continueOperation(repoPath: string): Promise<void> {
  const state = await getRepoOperationState(repoPath);
  if (state.inRebase) {
    const editor = path.join(await rebaseEditorDirectory(repoPath), 'message.cjs');
    await execFileP('git', ['rebase', '--continue'], {
      cwd: repoPath,
      env: { ...process.env, GIT_EDITOR: fs.existsSync(editor) ? `node ${JSON.stringify(editor)}` : 'true' }
    });
    if (!(await getRepoOperationState(repoPath)).inRebase) await cleanupRebaseEditor(repoPath);
  } else if (state.inMerge) {
    await execFileP('git', ['commit', '--no-edit'], { cwd: repoPath });
  } else if (state.inCherryPick) {
    await execFileP('git', ['cherry-pick', '--continue'], {
      cwd: repoPath,
      env: { ...process.env, GIT_EDITOR: 'true' }
    });
  }
}

/** Cherry-pick a commit onto current branch */
export async function cherryPick(
  repoPath: string,
  hash: string
): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }> {
  try {
    await execFileP('git', ['cherry-pick', hash], { cwd: repoPath });
    return { ok: true };
  } catch (err: unknown) {
    const state = await getRepoOperationState(repoPath);
    if (state.inCherryPick || state.conflictedFiles.length > 0) {
      return { ok: false, hasConflicts: true, error: 'Conflicts encountered during cherry-pick' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/** Get list of commits between a base hash and HEAD for interactive rebase */
export async function getCommitsForRebase(repoPath: string, baseHash: string): Promise<RebaseStep[]> {
  try {
    const { stdout } = await execFileP(
      'git',
      ['log', '--no-merges', '--pretty=format:%H%x09%h%x09%an%x09%s', '--reverse', `${baseHash}..HEAD`],
      { cwd: repoPath }
    );
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const [hash, shortHash, author, message] = line.split('\t');
      return {
        hash: hash || '',
        shortHash: shortHash || '',
        action: 'pick' as const,
        message: message || '',
        author: author || 'Unknown'
      };
    });
  } catch {
    return [];
  }
}

/** Execute interactive rebase with customized steps */
export async function executeInteractiveRebase(
  repoPath: string,
  baseHash: string,
  steps: RebaseStep[]
): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }> {
  const state = await getRepoOperationState(repoPath);
  if (state.inRebase || state.inMerge || state.inCherryPick) {
    return { ok: false, error: 'Finish or abort the current Git operation before starting a rebase.' };
  }
  if (!steps.length || steps.some(step => !['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'].includes(step.action) || !/^[a-f0-9]{40,64}$/.test(step.hash))) {
    return { ok: false, error: 'Invalid or empty rebase plan.' };
  }
  const todoLines: string[] = [];
  const rewordMap: Record<string, string> = {};

  for (const step of steps) {
    todoLines.push(`${step.action} ${step.hash} ${step.message.split('\n')[0]}`);
    if (step.action === 'reword') {
      rewordMap[step.hash] = step.message;
    }
  }

  const todoContent = todoLines.join('\n') + '\n';
  const todoScript = [
    "const fs = require('node:fs');",
    "const file = process.argv[2];",
    `fs.writeFileSync(file, ${JSON.stringify(todoContent)});`
  ].join('\n');

  // Script to supply customized reword messages automatically if needed
  const msgScript = [
    "const fs = require('node:fs');",
    "const file = process.argv[2];",
    `const rewords = ${JSON.stringify(rewordMap)};`,
    "const { execFileSync } = require('node:child_process');",
    "const donePath = execFileSync('git', ['rev-parse', '--git-path', 'rebase-merge/done'], { encoding: 'utf8' }).trim();",
    "const last = fs.readFileSync(donePath, 'utf8').trim().split('\\n').pop();",
    "const match = last.match(/^(?:reword|r) ([a-f0-9]+)/);",
    "const key = match && Object.keys(rewords).find(hash => hash.startsWith(match[1]));",
    "const message = key ? rewords[key] : undefined;",
    "if (message !== undefined) fs.writeFileSync(file, message);"
  ].join('\n');

  const directory = await rebaseEditorDirectory(repoPath);
  await fs.promises.mkdir(directory, { recursive: true });
  const todoFile = path.join(directory, 'todo.cjs');
  const msgFile = path.join(directory, 'message.cjs');
  await fs.promises.writeFile(todoFile, todoScript);
  await fs.promises.writeFile(msgFile, msgScript);

  try {
    await execFileP('git', ['rebase', '-i', baseHash], {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_SEQUENCE_EDITOR: `node ${JSON.stringify(todoFile)}`,
        GIT_EDITOR: Object.keys(rewordMap).length > 0 ? `node ${JSON.stringify(msgFile)}` : '/bin/true'
      }
    });
    return { ok: true };
  } catch (err: unknown) {
    const state = await getRepoOperationState(repoPath);
    if (state.inRebase || state.conflictedFiles.length > 0) {
      return { ok: false, hasConflicts: true, error: err instanceof Error ? err.message : String(err) };
    }
    // If not in rebase conflict, attempt abort to leave repo clean
    await execFileP('git', ['rebase', '--abort'], { cwd: repoPath }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    if (!(await getRepoOperationState(repoPath)).inRebase) await cleanupRebaseEditor(repoPath);
  }
}

/** Pre-flight check simulating merge without touching working tree or index */
export async function simulateMerge(repoPath: string, targetBranch: string): Promise<MergeSimulationResult> {
  return await withGit(repoPath, async () => {
    try {
      await execFileP('git', ['merge-tree', '--write-tree', 'HEAD', targetBranch], { cwd: repoPath });
      return {
        clean: true,
        conflicts: [],
        message: `Merge with ${targetBranch} can be performed cleanly without conflicts.`
      };
    } catch (err: unknown) {
      const errorOutput =
        (err && typeof err === 'object' && 'stdout' in err ? String(err.stdout) : '') +
        '\n' +
        (err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '');
      const conflictFiles = new Set<string>();

      const lines = errorOutput.split('\n');
      for (const line of lines) {
        const m1 = line.match(/CONFLICT \([^)]+\): Merge conflict in (.+)/i);
        if (m1) {
          conflictFiles.add(m1[1].trim());
          continue;
        }
        const m2 = line.match(/CONFLICT \([^)]+\): (.+)/i);
        if (m2) {
          const fileMatch = m2[1].match(/(?:in |delete |modified )?([^\s,]+)/);
          if (fileMatch && fileMatch[1]) conflictFiles.add(fileMatch[1].trim());
        }
      }

      const files = Array.from(conflictFiles);
      return {
        clean: false,
        conflicts: files,
        message:
          files.length > 0
            ? `Conflicts detected in ${files.length} file(s) when merging ${targetBranch}.`
            : `Merge with ${targetBranch} will encounter conflicts.`
      };
    }
  });
}
