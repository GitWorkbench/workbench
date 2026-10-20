import { AsyncLocalStorage } from 'node:async_hooks';
import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import simpleGit from 'simple-git';
import { generateCommitMessage } from './ai';
import {
  GitWorkbenchApi,
  GitStatus,
  GraphResult,
  BranchInfo,
  StashInfo,
  CommitDetail,
  FileDiff,
  RebaseStep,
  ConflictResolutionOptions,
  PullRequestCredential,
  PullRequestProvider
} from '../shared/types';
import { isValidRepo, errorMessage, withGit } from './git/core';
import { getLog, repoDisplayName } from './git/log';
import { getStatus, unstageFiles, discardFile } from './git/status-diff';
import { getCommitDetail, getFileDiff, getCommitDiffText, compareCommits, getComparisonFileDiff } from './git/commit-detail';
import {
  getBranches,
  getStashes,
  checkoutBranch,
  createBranch,
  deleteBranch,
  renameBranch,
  stash as stashChanges,
  stashPop,
  stashApply,
  stashDrop,
  revertHunk,
  mergeBranch,
  getStashDetail,
  getStashFileDiff,
  applyStashFile
} from './git/branch-stash';
import {
  checkoutCommit,
  createBranchAt,
  createWorktree,
  resetBranchTo,
  editCommitMessage,
  revertCommit,
  dropCommit,
  applyPatchCommit,
  moveCommitDown,
  setUpstream,
  pushSetUpstream,
  deleteBranchEx
} from './git/history';
import {
  stageHunk,
  unstageHunk,
  discardHunk,
  stageLines,
  unstageLines,
  discardLines,
  getBlameLines,
  getFileHistory,
  exportPatch,
  applyPatchFile
} from './git/hunk-actions';
import {
  getRepoOperationState,
  getConflictFile,
  resolveConflictFile,
  abortOperation,
  continueOperation,
  cherryPick,
  getCommitsForRebase,
  executeInteractiveRebase,
  simulateMerge
} from './git/conflicts-rebase';
import {
  getTags,
  createTag,
  deleteTag,
  pushTag,
  getRemotes,
  addRemote,
  renameRemote,
  setRemoteUrl,
  removeRemote,
  pruneRemote,
  getSubmodules,
  updateSubmodules,
  getWorktrees,
  removeWorktree
} from './git/objects-navigation';
import {
  getGitFlowConfig,
  initGitFlow,
  startGitFlowBranch,
  finishGitFlowBranch
} from './git/gitflow';
import { startBisect, stepBisect, resetBisect, getBisectState } from './git/bisect';
import { generateChangelog } from './git/changelog';
import { getReflog, createRecoveryBranch, restoreHeadFromReflog } from './git/reflog';
import { getPullRequestContext, createHostedPullRequest, testGitLabConnection, testGiteaConnection } from './git/pull-requests';
import { normalizeGitLabServer } from '../shared/gitlab-server';
import { normalizeHostingServer, pullRequestProviders } from '../shared/hosting-provider';
import { externalWebUrl } from '../shared/external-url';
import { getPullReview, submitPullReview } from './git/pull-request-review';
import { pinnedRepositories, pinRepository, repositoryOverview } from './git/repository-dashboard';
import { openPullRequestWorktree } from './git/pull-request-worktree';
import { getCommitSplit, previewCommitSplit, applyCommitSplit, discardCommitSplit, listCommitSplitPreviews } from './git/commit-split';
import { getBranchStack, setStackParent, previewStackRestack, resumeStackRestack, applyStackRestack, discardStackRestack, retargetPullRequest } from './git/branch-stacks';
import { getLfsState, configureLfs, setLfsTracking, runLfsTransfer, getLfsTransfer, cancelLfsTransfer, stopLfsTransfers } from './git/lfs-manager';
import { getSparseCheckout, getSparseDirectories, previewSparseCheckout, applySparseCheckout, restoreSparseLayout } from './git/sparse-checkout';
import { registerGitHubSignIn, getGitHubSignInState, startGitHubSignIn, cancelGitHubSignIn, openGitHubSignInPage, copyGitHubSignInCode, refreshGitHubAccount, githubCredentialsChanged, stopGitHubSignIn } from './git/github-auth';
import { createRestorePoint, listRestorePoints, restorePoint, deleteRestorePoint } from './git/restore-points';
import { resolutionMemoryState, setResolutionMemory, captureResolutionMemory } from './git/resolution-memory';
import { beginRewrite, finishRewrite, rewriteActions, listRewriteSessions, compareCommitRanges, deleteRewriteSession } from './git/rewrite-comparison';
import {
  getPullRequestCredential,
  getPullRequestCredentialStatus,
  removePullRequestCredential,
  savePullRequestCredential
} from './git/provider-credentials';
import { explainCodeChanges } from '../shared/ai';

const isPullRequestProvider = (value: unknown): value is PullRequestProvider =>
  typeof value === 'string' && pullRequestProviders.includes(value as PullRequestProvider);

/** Recently opened repos persisted in the user config dir. */
const recentFile = () => path.join(os.homedir(), '.config', 'git-workbench', 'recent-repos.json');

function readRecent(): string[] {
  try {
    if (fs.existsSync(recentFile())) {
      const stored: unknown = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
      if (Array.isArray(stored) && stored.every(value => typeof value === 'string')) return stored;
    }
    return [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  const dir = path.dirname(recentFile());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(recentFile(), JSON.stringify(list, null, 2));
}

export function registerIpc(getWin: () => BrowserWindow | null, getRepo: () => string | null) {
  app.once('before-quit', stopLfsTransfers);
  app.once('before-quit', stopGitHubSignIn);
  registerGitHubSignIn(state => { const win = getWin(); if (win && !win.isDestroyed()) win.webContents.send('github-auth:state', state); });
  const requestRepo = new AsyncLocalStorage<string | null>();
  const protectedActions: Record<string, string> = {
    'git:reset-branch': 'Before reset', 'git:discard': 'Before discarding a file',
    'git:discard-hunk': 'Before discarding a hunk', 'git:discard-lines': 'Before discarding lines',
    'git:revert-hunk': 'Before reverting a hunk', 'git:stash-apply-file': 'Before applying a stashed file',
    'git:rebase-branch': 'Before branch rebase', 'git:execute-interactive-rebase': 'Before interactive rebase',
    'git:drop-commit': 'Before dropping a commit', 'git:move-commit-down': 'Before reordering a commit',
    'git:edit-commit-message': 'Before rewriting a commit message', 'git:pull': 'Before pull'
  };
  const writes = new Set(['git:stage', 'git:unstage', 'git:stage-all', 'git:unstage-all', 'git:commit', 'git:merge', 'git:checkout', 'git:checkout-commit', 'git:stash', 'git:stash-pop', 'git:stash-apply', 'git:stage-hunk', 'git:unstage-hunk', 'git:stage-lines', 'git:unstage-lines', 'git:resolve-conflict-file', 'git:abort-operation', 'git:continue-operation', 'git:cherry-pick', 'git:reflog-restore-head', 'git:revert-commit', 'git:apply-patch-commit', 'git:apply-patch', 'git:flow:init', 'git:flow:start', 'git:flow:finish', 'git:branch-create', 'git:branch-delete', 'git:branch-rename', ...Object.keys(protectedActions)]);
  const pendingWrites = new Map<string, Promise<unknown>>();
  let writeAdmissions: Promise<unknown> = Promise.resolve();
  type Handler = (...args: any[]) => Promise<unknown>;
  const handle = (channel: string, fn: Handler) => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await requestRepo.run(getRepo(), async () => {
          const repo = requestRepo.getStore();
          const run = async () => {
            if (repo && protectedActions[channel]) await createRestorePoint(repo, `${protectedActions[channel]}${typeof args[0] === 'string' ? `: ${args[0]}` : ''}`);
            const trackRewrite = repo && (rewriteActions.has(channel) || channel === 'git:continue-operation' || channel === 'git:abort-operation');
            if (repo && rewriteActions.has(channel)) await beginRewrite(repo, channel, args);
            if (repo && writes.has(channel)) await captureResolutionMemory(repo).catch(() => {});
            const execute = async () => {
              const result = await fn(...args);
              const failure = result && typeof result === 'object' && 'ok' in result && result.ok === false;
              const session = trackRewrite && repo ? await finishRewrite(repo, { aborted: channel === 'git:abort-operation', error: failure ? String((result as { error?: string }).error || 'Operation did not complete.') : undefined }).catch(error => { console.warn('Rewrite comparison:', error.message); return null; }) : null;
              return session?.status === 'completed' && session.oldTip !== session.newTip && result && typeof result === 'object' ? { ...result, rewriteId: session.id } : result;
            };
            return execute().catch(async (error: unknown) => {
              if (trackRewrite && repo) await finishRewrite(repo, { error: error instanceof Error ? error.message : String(error) }).catch(() => {});
              throw error;
            }).finally(async () => { if (repo && writes.has(channel)) await captureResolutionMemory(repo).catch(() => {}); });
          };
          if (!repo || !(writes.has(channel) || /^git:(restore-points|rerere|rewrite|pr-worktree|split|stack|lfs|sparse):/.test(channel))) return run();
          // Snapshot and its action share one write queue, including staging operations.
          // Reserve a place before resolving aliases: filesystem completions can
          // arrive out of order. Only admission is global; independent repositories
          // can still run their mutations concurrently.
          const admission = writeAdmissions.catch(() => {}).then(async () => {
            const lockKey = await fs.promises.realpath(repo);
            const previous = pendingWrites.get(lockKey) || Promise.resolve();
            const current = previous.catch(() => {}).then(run);
            pendingWrites.set(lockKey, current);
            return { lockKey, current };
          });
          writeAdmissions = admission;
          const { lockKey, current } = await admission;
          try { return await current; }
          finally { if (pendingWrites.get(lockKey) === current) pendingWrites.delete(lockKey); }
        });
      } catch (err) {
        return { __error: errorMessage(err) };
      }
    });
  };

  const requireRepo = (): string => {
    const repo = requestRepo.getStore();
    if (!repo || !isValidRepo(repo)) throw new Error('No repository open');
    return repo;
  };

  handle('github-auth:get', async () => getGitHubSignInState());
  handle('github-auth:start', async () => startGitHubSignIn());
  handle('github-auth:cancel', async (id: string) => cancelGitHubSignIn(id));
  handle('github-auth:open', async (id: string) => openGitHubSignInPage(id));
  handle('github-auth:copy', async (id: string) => copyGitHubSignInCode(id));
  handle('github-auth:refresh-account', async () => refreshGitHubAccount());

  handle('app:open-external', async (url: unknown) => {
    await shell.openExternal(externalWebUrl(url));
  });

  handle('repo:open-dialog', async () => {
    const win = getWin();
    if (!win) return { ok: false, error: 'no window' };
    const res = await dialog.showOpenDialog(win, {
      title: 'Open Repository',
      message: 'Select a git repository folder',
      properties: ['openDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'canceled' };
    return openRepoPath(res.filePaths[0]);
  });

  function getGitignoreTemplate(template?: string): string {
    switch (template?.toLowerCase()) {
      case 'node':
        return `node_modules/\ndist/\nout/\n.env\n.env.local\n*.log\n.DS_Store\ncoverage/\n`;
      case 'python':
        return `__pycache__/\n*.py[cod]\n*$py.class\nvenv/\n.venv/\nenv/\n.env\n.pytest_cache/\n.DS_Store\n`;
      case 'go':
        return `/bin/\n/pkg/\n*.exe\n.env\n.DS_Store\n`;
      case 'rust':
        return `/target/\n**/*.rs.bk\nCargo.lock\n.env\n.DS_Store\n`;
      case 'general':
        return `.DS_Store\nThumbs.db\n.env\n*.log\nnode_modules/\n`;
      default:
        return `.DS_Store\nnode_modules/\n.env\n`;
    }
  }

  handle('repo:select-directory', async (title?: string) => {
    const win = getWin();
    if (!win) return { ok: false, error: 'no window' };
    const res = await dialog.showOpenDialog(win, {
      title: title || 'Select Folder for Repository',
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'canceled' };
    return { ok: true, path: res.filePaths[0] };
  });

  handle('repo:init', async (opts: {
    path: string;
    initialBranch?: string;
    createReadme?: boolean;
    gitignoreTemplate?: string;
    initialCommitMessage?: string;
  }) => {
    const targetDir = path.resolve(opts.path);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const branch = opts.initialBranch?.trim() || 'main';
    const git = simpleGit(targetDir);
    try {
      await git.init(['-b', branch]);
    } catch {
      await git.init();
    }

    if (opts.createReadme) {
      const readmePath = path.join(targetDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        const repoName = path.basename(targetDir);
        fs.writeFileSync(readmePath, `# ${repoName}\n\nInitialized with Git Workbench.\n`, 'utf8');
      }
    }

    if (opts.gitignoreTemplate && opts.gitignoreTemplate !== 'None') {
      const gitignorePath = path.join(targetDir, '.gitignore');
      if (!fs.existsSync(gitignorePath)) {
        const tpl = getGitignoreTemplate(opts.gitignoreTemplate);
        fs.writeFileSync(gitignorePath, tpl, 'utf8');
      }
    }

    if (opts.createReadme || (opts.gitignoreTemplate && opts.gitignoreTemplate !== 'None')) {
      const commitMsg = opts.initialCommitMessage?.trim() || 'Initial commit';
      try {
        await git.add('.');
        await git.commit(commitMsg);
      } catch {
        // Continue even if initial commit failed
      }
    }

    return openRepoPath(targetDir);
  });

  handle('repo:open-path', async (p: string) => openRepoPath(p));

  async function openRepoPath(p: string) {
    const abs = path.resolve(p);
    if (process.platform === 'darwin') {
      const gitMarker = path.join(abs, '.git');
      const candidates: Array<{ path: string; mode: number }> = [
        { path: abs, mode: fs.constants.R_OK | fs.constants.X_OK }
      ];
      try {
        const stat = fs.statSync(gitMarker);
        candidates.push({
          path: gitMarker,
          mode: fs.constants.R_OK | (stat.isDirectory() ? fs.constants.X_OK : 0)
        });
      } catch {
        candidates.push({ path: gitMarker, mode: fs.constants.R_OK });
      }

      for (const candidate of candidates) {
        try {
          fs.accessSync(candidate.path, candidate.mode);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if (code === 'EACCES' || code === 'EPERM') {
            return {
              ok: false,
              error: `macOS denied Git Workbench access to "${candidate.path}". In System Settings → Privacy & Security → Files & Folders, allow Git Workbench to access this folder, then try again.`
            };
          }
        }
      }
    }
    if (!isValidRepo(abs)) return { ok: false, error: `${abs} is not a git repository` };
    const list = readRecent().filter((r) => r !== abs);
    list.unshift(abs);
    writeRecent(list.slice(0, 12));
    return {
      ok: true,
      repo: { path: abs, name: repoDisplayName(abs), currentBranch: '', headHash: '' }
    };
  }

  handle('repo:recent', async () => readRecent());
  const dashboardDirectory = () => path.join(app.getPath('userData'), 'dashboard');
  const knownRepository = async (repo: string) => {
    if (typeof repo !== 'string' || ![...readRecent(), ...await pinnedRepositories(dashboardDirectory())].includes(repo)) throw new Error('Open this repository once before adding it to the dashboard.');
    return repo;
  };
  let pinWrite: Promise<unknown> = Promise.resolve();
  handle('dashboard:pins', async () => pinnedRepositories(dashboardDirectory()));
  handle('dashboard:pin', async (repo: string, pinned: boolean) => {
    await knownRepository(repo);
    const next = pinWrite.catch(() => {}).then(() => pinRepository(dashboardDirectory(), repo, !!pinned));
    pinWrite = next;
    return next;
  });
  handle('dashboard:overview', async (repo: string, hosted?: boolean) => repositoryOverview(await knownRepository(repo), !!hosted, getPullRequestCredential));
  handle('repo:remove-recent', async (p: string) => {
    writeRecent(readRecent().filter((r) => r !== p));
  });

  handle('git:config-get', async (scope?: 'local' | 'global') => {
    let name = '';
    let email = '';
    try {
      const repo = requestRepo.getStore();
      if (scope === 'local' && repo && isValidRepo(repo)) {
        const g = simpleGit(repo);
        name = (await g.getConfig('user.name', 'local')).value || '';
        email = (await g.getConfig('user.email', 'local')).value || '';
      } else {
        const g = simpleGit();
        name = (await g.getConfig('user.name', 'global')).value || '';
        email = (await g.getConfig('user.email', 'global')).value || '';
      }
    } catch {}
    return { name, email };
  });

  handle('git:config-set', async (cfg: { name?: string; email?: string; scope?: 'local' | 'global' }) => {
    const scope = cfg.scope || 'global';
    const repo = requestRepo.getStore();
    const g = scope === 'local' && repo && isValidRepo(repo) ? simpleGit(repo) : simpleGit();
    if (cfg.name !== undefined) {
      await g.addConfig('user.name', cfg.name, false, scope);
    }
    if (cfg.email !== undefined) {
      await g.addConfig('user.email', cfg.email, false, scope);
    }
    return { ok: true };
  });

  handle('git:status', async (): Promise<GitStatus> => getStatus(requireRepo()));
  handle('git:rewrite:list', async () => listRewriteSessions(requireRepo()));
  handle('git:rewrite:compare', async (input: import('../shared/types').RangeComparisonInput) => compareCommitRanges(requireRepo(), input));
  handle('git:rewrite:delete', async (id: string) => { await deleteRewriteSession(requireRepo(), id); return { ok: true }; });
  handle('git:rerere:state', async () => resolutionMemoryState(requireRepo()));
  handle('git:rerere:configure', async (enabled: boolean) => setResolutionMemory(requireRepo(), enabled));
  handle('git:rerere:suggestion', async (filePath: string) => {
    const repo = requireRepo(), before = await getConflictFile(repo, filePath);
    const state = await resolutionMemoryState(repo);
    const suggestions = state.enabled && before.kind === 'text' ? await captureResolutionMemory(repo) : new Map<string, string>();
    if ((await getConflictFile(repo, filePath)).snapshot !== before.snapshot) throw new Error('The conflict changed while preparing the suggestion. Reload the file.');
    return { enabled: state.enabled, content: suggestions.get(filePath) ?? null, snapshot: before.snapshot };
  });
  handle('git:rerere:forget', async (filePath: string) => {
    await getConflictFile(requireRepo(), filePath);
    await captureResolutionMemory(requireRepo(), filePath);
    return { ok: true };
  });
  handle('git:restore-points:list', async () => listRestorePoints(requireRepo()));
  handle('git:restore-points:create', async (label?: string) => createRestorePoint(requireRepo(), label));
  handle('git:restore-points:restore', async (id: string) => restorePoint(requireRepo(), id));
  handle('git:restore-points:delete', async (id: string) => { await deleteRestorePoint(requireRepo(), id); return { ok: true }; });
  handle('git:log', async (limit?: number): Promise<GraphResult> => {
    const repo = requireRepo();
    const st = await getStatus(repo).catch(() => null);
    return getLog(repo, st, limit ?? 300);
  });
  handle('git:branches', async () => getBranches(requireRepo()));
  handle('git:stashes', async (): Promise<StashInfo[]> => getStashes(requireRepo()));
  handle('git:commit-detail', async (hash: string): Promise<CommitDetail | null> =>
    getCommitDetail(requireRepo(), hash)
  );
  handle(
    'git:file-diff',
    async (hash: string, filePath: string, opts?: { staged?: boolean; worktree?: boolean }): Promise<FileDiff | null> =>
      getFileDiff(requireRepo(), hash, filePath, opts)
  );
  handle('git:staged-diff', async () => {
    const diff = await withGit(requireRepo(), (g) => g.diff(['--cached']));
    return { ok: true, diff };
  });

  handle('ai:generate-commit', async (params?: any) => {
    let diff = params?.diff;
    if (!diff) {
      diff = await withGit(requireRepo(), (g) => g.diff(['--cached'])).catch(() => '');
      if (!diff || !diff.trim()) {
        diff = await withGit(requireRepo(), (g) => g.diff()).catch(() => '');
      }
    }
    return generateCommitMessage({ ...params, diff });
  });

  const mutate = async (fn: () => Promise<unknown>) => {
    await fn();
    return getStatus(requireRepo());
  };

  handle('git:stage', async (paths: string[]) =>
    mutate(() => withGit(requireRepo(), (g) => g.add(paths)))
  );
  handle('git:unstage', async (paths: string[]) =>
    mutate(() => unstageFiles(requireRepo(), paths))
  );
  handle('git:stage-all', async () => mutate(() => withGit(requireRepo(), (g) => g.add('-A'))));
  handle('git:unstage-all', async () => mutate(() => unstageFiles(requireRepo())));
  handle('git:discard', async (p: string) =>
    mutate(() => discardFile(requireRepo(), p))
  );
  handle('git:commit', async (message: string, author?: { name: string; email: string }) => {
    await withGit(requireRepo(), (g) => {
      if (author && author.name && author.email) {
        return g.commit(message, undefined, { '--author': `"${author.name} <${author.email}>"` });
      }
      return g.commit(message);
    });
    return { ok: true };
  });

  handle('git:pull', async () => {
    await withGit(requireRepo(), async (g) => {
      try {
        await g.pull();
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes('no tracking information') || msg.includes('no upstream')) {
          const status = await g.status();
          const current = status.current;
          if (current) {
            await g.pull('origin', current);
            return;
          }
        }
        if (msg.includes('overwritten by merge') || msg.includes('local changes to the following files')) {
          throw new Error('Your uncommitted local changes would be overwritten by pull. Please stash or commit them first.');
        }
        throw err;
      }
    });
    return { ok: true };
  });

  handle('git:push', async () => {
    await withGit(requireRepo(), async (g) => {
      const remotes = await g.getRemotes();
      if (!remotes || remotes.length === 0) {
        throw new Error('No remote repository configured. Add a remote in the sidebar first.');
      }
      try {
        await g.push();
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes('no upstream branch') || msg.includes('--set-upstream')) {
          const status = await g.status();
          const current = status.current;
          if (current) {
            const defaultRemote = remotes[0]?.name || 'origin';
            await g.push(['--set-upstream', defaultRemote, current]);
            return;
          }
        }
        throw err;
      }
    });
    return { ok: true };
  });
  handle('git:fetch', async (remote?: string) => {
    await withGit(requireRepo(), async (g) => {
      try {
        if (remote) {
          await g.fetch(remote);
        } else {
          const remotes = await g.getRemotes();
          if (!remotes || remotes.length === 0) {
            return;
          }
          await g.fetch(['--all']);
        }
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes('No remote repository specified') || msg.includes('no remotes')) {
          return;
        }
        throw err;
      }
    });
    return { ok: true };
  });
  handle('git:rebase-branch', async (upstream: string) => {
    await withGit(requireRepo(), (g) => g.rebase([upstream]));
    return { ok: true };
  });
  handle('git:merge', async (branchName: string) => {
    await mergeBranch(requireRepo(), branchName);
    return { ok: true };
  });

  handle('git:checkout', async (name: string) => {
    await checkoutBranch(requireRepo(), name);
    return { ok: true };
  });
  handle('git:branch-create', async (name: string, atHash?: string) => {
    if (atHash) await createBranchAt(requireRepo(), name, atHash);
    else await createBranch(requireRepo(), name);
    return { ok: true };
  });
  handle('git:branch-delete', async (name: string, opts?: { local?: boolean; remote?: boolean; force?: boolean }) => {
    await deleteBranchEx(requireRepo(), name, { local: true, ...opts });
    return { ok: true };
  });
  handle('git:checkout-commit', async (hash: string) => {
    await checkoutCommit(requireRepo(), hash);
    return { ok: true };
  });
  handle('git:worktree-create', async (hash: string, worktreePath: string) => {
    await createWorktree(requireRepo(), worktreePath, hash);
    return { ok: true };
  });
  handle('git:reset-branch', async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    await resetBranchTo(requireRepo(), hash, mode);
    return { ok: true };
  });
  handle('git:reflog', async () => getReflog(requireRepo()));
  handle('git:reflog-recover-branch', async (hash: string, branchName?: string) => ({
    ok: true,
    ...(await createRecoveryBranch(requireRepo(), hash, branchName))
  }));
  handle('git:reflog-restore-head', async (hash: string) => ({
    ok: true,
    ...(await restoreHeadFromReflog(requireRepo(), hash))
  }));
  handle('git:edit-commit-message', async (hash: string, message: string) => {
    await editCommitMessage(requireRepo(), hash, message);
    return { ok: true };
  });
  handle('git:revert-commit', async (hash: string) => {
    await revertCommit(requireRepo(), hash);
    return { ok: true };
  });
  handle('git:drop-commit', async (hash: string) => {
    await dropCommit(requireRepo(), hash);
    return { ok: true };
  });
  handle('git:apply-patch-commit', async (hash: string) => {
    await applyPatchCommit(requireRepo(), hash);
    return { ok: true };
  });
  handle('git:move-commit-down', async (hash: string) => {
    await moveCommitDown(requireRepo(), hash);
    return { ok: true };
  });
  handle('git:set-upstream', async (branch: string, upstream: string) => {
    await setUpstream(requireRepo(), branch, upstream);
    return { ok: true };
  });
  handle('git:push-set-upstream', async (branch: string) => {
    await pushSetUpstream(requireRepo(), branch);
    return { ok: true };
  });
  handle('git:branch-rename', async (name: string, newName: string) => {
    await renameBranch(requireRepo(), name, newName);
    return { ok: true };
  });

  handle('git:stash', async (message?: string) => {
    await stashChanges(requireRepo(), message);
    return { ok: true };
  });
  handle('git:stash-pop', async (index?: number) => {
    await stashPop(requireRepo(), index);
    return { ok: true };
  });
  handle('git:stash-apply', async (index?: number) => {
    await stashApply(requireRepo(), index);
    return { ok: true };
  });
  handle('git:stash-drop', async (index?: number) => {
    await stashDrop(requireRepo(), index);
    return { ok: true };
  });

  handle('git:revert-hunk', async (hash: string, filePath: string, hunkIndex: number) => {
    const repo = requireRepo();
    const diffText = await getCommitDiffText(repo, hash, filePath);
    await revertHunk(repo, diffText, hunkIndex);
    return { ok: true };
  });

  handle('git:stage-hunk', async (filePath: string, hunkIndex: number) => {
    await stageHunk(requireRepo(), filePath, hunkIndex);
    return { ok: true };
  });

  handle('git:unstage-hunk', async (filePath: string, hunkIndex: number) => {
    await unstageHunk(requireRepo(), filePath, hunkIndex);
    return { ok: true };
  });

  handle('git:discard-hunk', async (filePath: string, hunkIndex: number) => {
    await discardHunk(requireRepo(), filePath, hunkIndex);
    return { ok: true };
  });

  handle('git:stage-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    await stageLines(requireRepo(), filePath, hunkIndex, lineIndices);
    return { ok: true };
  });

  handle('git:unstage-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    await unstageLines(requireRepo(), filePath, hunkIndex, lineIndices);
    return { ok: true };
  });

  handle('git:discard-lines', async (filePath: string, hunkIndex: number, lineIndices: number[]) => {
    await discardLines(requireRepo(), filePath, hunkIndex, lineIndices);
    return { ok: true };
  });

  handle('git:blame', async (filePath: string) => {
    return withGit(requireRepo(), (g) => g.raw(['blame', '--date=short', '--', filePath]));
  });
  handle('git:get-blame', async (filePath: string) => {
    return getBlameLines(requireRepo(), filePath);
  });
  handle('git:file-history', async (filePath: string) => {
    return withGit(requireRepo(), (g) =>
      g.log(['--pretty=format:%h%x09%s%x09%an', '--', filePath])
    );
  });
  handle('git:get-file-history', async (filePath: string) => {
    return getFileHistory(requireRepo(), filePath);
  });

  handle('git:get-conflict-file', async (filePath: string) => {
    return getConflictFile(requireRepo(), filePath);
  });

  handle('git:resolve-conflict-file', async (filePath: string, content: string, options?: ConflictResolutionOptions) => {
    await resolveConflictFile(requireRepo(), filePath, content, options);
    return { ok: true };
  });

  handle('git:get-operation-state', async () => {
    return getRepoOperationState(requireRepo());
  });

  handle('git:abort-operation', async () => {
    await abortOperation(requireRepo());
    return { ok: true };
  });

  handle('git:continue-operation', async () => {
    await continueOperation(requireRepo());
    return { ok: true };
  });

  handle('git:cherry-pick', async (hash: string) => {
    return cherryPick(requireRepo(), hash);
  });

  handle('git:get-commits-for-rebase', async (baseHash: string) => {
    return getCommitsForRebase(requireRepo(), baseHash);
  });

  handle('git:execute-interactive-rebase', async (baseHash: string, steps: RebaseStep[]) => {
    return executeInteractiveRebase(requireRepo(), baseHash, steps);
  });

  // Tags
  handle('git:get-tags', async () => {
    return getTags(requireRepo());
  });

  handle('git:create-tag', async (name: string, commitHash?: string, message?: string) => {
    await createTag(requireRepo(), name, commitHash, message);
    return { ok: true };
  });

  handle('git:delete-tag', async (name: string, deleteRemote?: boolean, remoteName?: string) => {
    await deleteTag(requireRepo(), name, deleteRemote, remoteName);
    return { ok: true };
  });

  handle('git:push-tag', async (name: string, remoteName?: string) => {
    await pushTag(requireRepo(), name, remoteName);
    return { ok: true };
  });

  // Hosted pull request / merge request providers
  handle('git:pull-review:get', async (target: import('../shared/types').PullReviewTarget) => getPullReview(requireRepo(), target, getPullRequestCredential));
  handle('git:pr-worktree:create', async (input: import('../shared/types').PullReviewTarget & { head: string; directory: string; branch: string }) => openPullRequestWorktree(requireRepo(), input, getPullRequestCredential));
  handle('git:split:plan', async (hash: string) => getCommitSplit(requireRepo(), hash));
  handle('git:stack:get', async () => getBranchStack(requireRepo()));
  handle('git:lfs-state', async () => getLfsState(requireRepo()));
  handle('git:sparse:get', async () => getSparseCheckout(requireRepo()));
  handle('git:sparse:directories', async (prefix: string, head: string) => getSparseDirectories(requireRepo(), prefix, head));
  handle('git:sparse:preview', async (input: import('../shared/types').SparseSelection) => previewSparseCheckout(requireRepo(), input));
  handle('git:sparse:apply', async (input: import('../shared/types').SparseSelection) => applySparseCheckout(requireRepo(), input));
  handle('git:sparse:restore', async (id: string, head: string, fingerprint: string) => restoreSparseLayout(requireRepo(), id, head, fingerprint));
  handle('git:lfs-transfer-state', async () => getLfsTransfer(requireRepo()));
  handle('git:lfs-cancel', async (id: string) => cancelLfsTransfer(requireRepo(), id));
  handle('git:lfs:configure', async (skip: boolean) => configureLfs(requireRepo(), !!skip));
  handle('git:lfs:track', async (pattern: string, tracked: boolean, literal?: boolean) => setLfsTracking(requireRepo(), pattern, !!tracked, !!literal));
  handle('git:lfs:transfer', async (input: { kind: import('../shared/types').LfsTransfer['kind']; remote: string; head: string }) => runLfsTransfer(requireRepo(), input, state => { const win = getWin(); if (win && !win.isDestroyed()) win.webContents.send('git:lfs-progress', state); }));
  handle('git:stack:parent', async (branch: string, parent: string | null, reset?: boolean) => setStackParent(requireRepo(), branch, parent, reset));
  handle('git:stack:preview', async (root: string) => previewStackRestack(requireRepo(), root));
  handle('git:stack:resume', async (id: string) => resumeStackRestack(requireRepo(), id));
  handle('git:stack:apply', async (id: string) => applyStackRestack(requireRepo(), id));
  handle('git:stack:discard', async (id: string) => discardStackRestack(requireRepo(), id));
  handle('git:stack:retarget', async (input: import('../shared/types').PullReviewTarget & { head: string; previousTarget: string; newTarget: string }) => retargetPullRequest(requireRepo(), input, getPullRequestCredential));
  handle('git:split:list', async () => listCommitSplitPreviews(requireRepo()));
  handle('git:split:preview', async (input: import('../shared/types').CommitSplitInput) => previewCommitSplit(requireRepo(), input));
  handle('git:split:apply', async (id: string) => applyCommitSplit(requireRepo(), id));
  handle('git:split:discard', async (id: string) => discardCommitSplit(requireRepo(), id));
  handle('git:pull-review:submit', async (params: import('../shared/types').PullReviewSubmission) => submitPullReview(requireRepo(), params, getPullRequestCredential));
  handle('git:pull-requests:credentials', async () => getPullRequestCredentialStatus());

  handle('git:pull-requests:save-credential', async (provider: unknown, credential: PullRequestCredential) => {
    if (!isPullRequestProvider(provider)) throw new Error('Choose GitHub, GitLab, Bitbucket, or Gitea.');
    if (provider === 'github') cancelGitHubSignIn();
    savePullRequestCredential(provider, credential);
    if (provider === 'github') githubCredentialsChanged();
    return { ok: true };
  });

  handle('git:pull-requests:test-gitlab', async (serverUrl: string, token?: string) => {
    const server = normalizeGitLabServer(serverUrl);
    if (token !== undefined && typeof token !== 'string') throw new Error('Enter a valid GitLab access token.');
    const credential = token !== undefined ? { token, serverUrl: server } : getPullRequestCredential('gitlab', `${server}/`);
    if (!credential || (token === undefined && normalizeGitLabServer(credential.serverUrl ?? 'https://gitlab.com') !== server)) throw new Error('Connect this GitLab server first.');
    const username = await testGitLabConnection(server, credential);
    return { ok: true, username };
  });

  handle('git:pull-requests:test-gitea', async (serverUrl: string, token?: string) => {
    const server = normalizeHostingServer(serverUrl, 'Gitea');
    if (token !== undefined && typeof token !== 'string') throw new Error('Enter a valid Gitea access token.');
    const credential = token !== undefined ? { token, serverUrl: server } : getPullRequestCredential('gitea', `${server}/`);
    if (!credential || (token === undefined && normalizeHostingServer(credential.serverUrl ?? '', 'Gitea') !== server)) throw new Error('Connect this Gitea server first.');
    const username = await testGiteaConnection(server, credential);
    return { ok: true, username };
  });

  handle('git:pull-requests:remove-credential', async (provider: unknown, serverUrl?: string) => {
    if (!isPullRequestProvider(provider)) throw new Error('Choose GitHub, GitLab, Bitbucket, or Gitea.');
    if (provider === 'github') cancelGitHubSignIn();
    removePullRequestCredential(provider, serverUrl);
    if (provider === 'github') githubCredentialsChanged();
    return { ok: true };
  });

  handle('git:pull-requests:context', async (remoteName?: string, providerOverride?: PullRequestProvider) => {
    if (providerOverride && !isPullRequestProvider(providerOverride)) throw new Error('Choose GitHub, GitLab, Bitbucket, or Gitea.');
    return getPullRequestContext(requireRepo(), remoteName, providerOverride, getPullRequestCredential);
  });

  handle('git:pull-requests:create', async (params: {
    remoteName: string;
    title: string;
    description: string;
    targetBranch: string;
    providerOverride?: PullRequestProvider;
  }) => {
    if (params.providerOverride && !isPullRequestProvider(params.providerOverride)) throw new Error('Choose GitHub, GitLab, Bitbucket, or Gitea.');
    const pullRequest = await createHostedPullRequest(
      requireRepo(), params.remoteName, params.title, params.description,
      params.targetBranch, params.providerOverride, getPullRequestCredential
    );
    return { ok: true, pullRequest };
  });

  // Remotes
  handle('git:get-remotes', async () => {
    return getRemotes(requireRepo());
  });

  handle('git:add-remote', async (name: string, url: string) => {
    await addRemote(requireRepo(), name, url);
    return { ok: true };
  });

  handle('git:rename-remote', async (oldName: string, newName: string) => {
    await renameRemote(requireRepo(), oldName, newName);
    return { ok: true };
  });

  handle('git:set-remote-url', async (name: string, url: string) => {
    await setRemoteUrl(requireRepo(), name, url);
    return { ok: true };
  });

  handle('git:remove-remote', async (name: string) => {
    await removeRemote(requireRepo(), name);
    return { ok: true };
  });

  handle('git:prune-remote', async (name: string) => {
    await pruneRemote(requireRepo(), name);
    return { ok: true };
  });

  // Submodules
  handle('git:get-submodules', async () => {
    return getSubmodules(requireRepo());
  });

  handle('git:update-submodules', async (subPath?: string) => {
    await updateSubmodules(requireRepo(), subPath);
    return { ok: true };
  });

  // Worktrees
  handle('git:get-worktrees', async () => {
    return getWorktrees(requireRepo());
  });

  handle('git:remove-worktree', async (worktreePath: string, force?: boolean) => {
    await removeWorktree(requireRepo(), worktreePath, force);
    return { ok: true };
  });

  handle('app:open-terminal', async () => {
    const repo = requireRepo();
    const plat = process.platform;
    try {
      if (plat === 'darwin') {
        spawn('open', ['-a', 'Terminal', repo], { detached: true, stdio: 'ignore' }).unref();
      } else {
        // Linux: try common terminals in order
        for (const term of [
          { cmd: 'x-terminal-emulator', args: ['--working-directory', repo] },
          { cmd: 'gnome-terminal', args: ['--working-directory', repo] },
          { cmd: 'konsole', args: ['--workdir', repo] },
          { cmd: 'xfce4-terminal', args: ['--working-directory', repo] },
          { cmd: 'xterm', args: ['-e', `cd ${JSON.stringify(repo)} && exec ${process.env.SHELL || 'bash'}`] }
        ]) {
          if (fs.existsSync(`/usr/bin/${term.cmd}`) || fs.existsSync(`/usr/local/bin/${term.cmd}`)) {
            spawn(term.cmd, term.args, { detached: true, stdio: 'ignore' }).unref();
            return { ok: true };
          }
        }
        return { ok: false, error: 'No supported terminal emulator found' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  handle('app:run-command', async (command: string) => {
    const repo = requireRepo();
    return new Promise<{ ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>((resolve) => {
      exec(command, { cwd: repo, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout ? stdout.toString() : '',
          stderr: stderr ? stderr.toString() : '',
          exitCode: error ? ((error as unknown as { code?: number }).code ?? 1) : 0,
          error: error ? error.message : undefined
        });
      });
    });
  });

  handle('app:open-in-editor', async (filePath: string) => {
    const repo = requireRepo();
    const abs = path.isAbsolute(filePath) ? filePath : path.join(repo, filePath);
    if (!fs.existsSync(abs)) return { ok: false, error: 'File not found on disk' };
    await shell.openPath(abs);
    return { ok: true };
  });

  handle('app:reveal-in-folder', async (filePath: string) => {
    const repo = requireRepo();
    const abs = path.isAbsolute(filePath) ? filePath : path.join(repo, filePath);
    shell.showItemInFolder(abs);
    return { ok: true };
  });

  // Git Flow handlers
  handle('git:flow:get-config', async () => {
    return getGitFlowConfig(requireRepo());
  });

  handle('git:flow:init', async (config?: any) => {
    return initGitFlow(requireRepo(), config);
  });

  handle('git:flow:start', async (params: any) => {
    return startGitFlowBranch(requireRepo(), params);
  });

  handle('git:flow:finish', async (params: any) => {
    return finishGitFlowBranch(requireRepo(), params);
  });

  // Commit Comparison
  handle('git:compare-commits', async (baseHash: string, targetHash: string) => {
    return compareCommits(requireRepo(), baseHash, targetHash);
  });

  handle('git:compare-file-diff', async (baseHash: string, targetHash: string, filePath: string) => {
    return getComparisonFileDiff(requireRepo(), baseHash, targetHash, filePath);
  });

  // Stash Inspector & Selective Apply
  handle('git:stash-detail', async (index: number) => {
    return getStashDetail(requireRepo(), index);
  });

  handle('git:stash-file-diff', async (index: number, filePath: string) => {
    return getStashFileDiff(requireRepo(), index, filePath);
  });

  handle('git:stash-apply-file', async (index: number, filePath: string) => {
    try {
      await applyStashFile(requireRepo(), index, filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Conflict Pre-Flight Simulation
  handle('git:simulate-merge', async (targetBranch: string) => {
    return simulateMerge(requireRepo(), targetBranch);
  });

  // AI Code Review & Explainer
  handle('ai:explain-changes', async (params: { diffText?: string; commitHash?: string; config?: Partial<import('../shared/types').AiCommitConfig> }) => {
    try {
      let diff = params.diffText;
      if (!diff && params.commitHash) {
        diff = await getCommitDiffText(requireRepo(), params.commitHash);
      }
      if (!diff) {
        return { ok: false, error: 'No diff content found to explain' };
      }
      return explainCodeChanges(diff, params.config);
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  // Git Bisect Wizard
  handle('git:bisect-start', async (badCommit?: string, goodCommit?: string) => {
    return startBisect(requireRepo(), badCommit, goodCommit);
  });

  handle('git:bisect-step', async (verdict: 'good' | 'bad' | 'skip') => {
    return stepBisect(requireRepo(), verdict);
  });

  handle('git:bisect-reset', async () => {
    return resetBisect(requireRepo());
  });

  handle('git:bisect-state', async () => {
    return getBisectState(requireRepo());
  });

  // Changelog & Release Notes Generator
  handle('git:generate-changelog', async (fromRef: string, toRef?: string) => {
    return generateChangelog(requireRepo(), fromRef, toRef);
  });

  // Patch Export & Apply
  handle('git:export-patch', async (commitHash: string, outputPath: string) => {
    try {
      await exportPatch(requireRepo(), commitHash, outputPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  handle('git:apply-patch', async (patchPath: string) => {
    try {
      await applyPatchFile(requireRepo(), patchPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  });

  handle('window:minimize', async () => {
    getWin()?.minimize();
    return true;
  });

  handle('window:maximize', async () => {
    const win = getWin();
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  handle('window:close', async () => {
    getWin()?.close();
    return true;
  });

  handle('window:is-maximized', async () => {
    return getWin()?.isMaximized() ?? false;
  });

  handle('app:restart', async () => {
    app.relaunch();
    app.exit(0);
    return true;
  });
}
