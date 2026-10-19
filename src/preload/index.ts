import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args).then((result) => {
    if (result && typeof result === 'object' && '__error' in result) {
      throw new Error(String(result.__error));
    }
    return result as T;
  });

export type Api = import('../shared/types').AdvancedGitApi & {
  getAppUpdateState(): Promise<import('../shared/types').AppUpdateState>;
  checkForAppUpdates(): Promise<import('../shared/types').AppUpdateState>;
  downloadAppUpdate(): Promise<import('../shared/types').AppUpdateState>;
  installAppUpdate(): Promise<boolean>;
  openAppReleasePage(): Promise<void>;
  onAppUpdateState(cb: (state: import('../shared/types').AppUpdateState) => void): () => void;
  openRepo(path: string): Promise<{ ok: boolean; repo?: { path: string; name: string }; error?: string }>;
  openRepoDialog(): Promise<{ ok: boolean; repo?: { path: string; name: string }; error?: string }>;
  initRepo(opts: import('../shared/types').InitRepoOptions): Promise<{ ok: boolean; repo?: { path: string; name: string }; error?: string }>;
  selectDirectory(title?: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  recentRepos(): Promise<string[]>;
  removeRecentRepo(path: string): Promise<void>;
  getGitConfig(scope?: 'local' | 'global'): Promise<{ name: string; email: string }>;
  setGitConfig(config: { name?: string; email?: string; scope?: 'local' | 'global' }): Promise<{ ok: boolean; error?: string }>;
  getStatus(): Promise<import('../shared/types').GitStatus>;
  getLog(limit?: number): Promise<import('../shared/types').GraphResult>;
  getReflog(): Promise<import('../shared/types').ReflogEntry[]>;
  createRecoveryBranch(hash: string, branchName?: string): Promise<{ ok: boolean; branchName?: string; error?: string }>;
  restoreHeadFromReflog(hash: string): Promise<{ ok: boolean; branchName?: string; backupBranch?: string; error?: string }>;
  getBranches(): Promise<{ local: import('../shared/types').BranchInfo[]; remote: import('../shared/types').BranchInfo[] }>;
  getStashes(): Promise<import('../shared/types').StashInfo[]>;
  getCommitDetail(hash: string): Promise<import('../shared/types').CommitDetail | null>;
  getFileDiff(
    hash: string,
    filePath: string,
    opts?: { staged?: boolean; worktree?: boolean }
  ): Promise<import('../shared/types').FileDiff | null>;
  getStagedDiff(): Promise<{ ok: boolean; diff: string; error?: string }>;
  generateAiCommitMessage(params?: Partial<import('../shared/types').AiCommitConfig>): Promise<{ ok: boolean; message?: string; error?: string }>;
  stageFiles(paths: string[]): Promise<unknown>;
  unstageFiles(paths: string[]): Promise<unknown>;
  stageAll(): Promise<unknown>;
  unstageAll(): Promise<unknown>;
  discardFile(path: string): Promise<unknown>;
  commit(message: string, author?: { name: string; email: string }): Promise<{ ok: boolean }>;
  pull(): Promise<{ ok: boolean }>;
  push(): Promise<{ ok: boolean }>;
  fetch(remote?: string): Promise<{ ok: boolean }>;
  rebaseBranch(upstream: string): Promise<{ ok: boolean }>;
  mergeBranch(name: string): Promise<{ ok: boolean }>;
  checkoutBranch(name: string): Promise<{ ok: boolean }>;
  createBranch(name: string, atHash?: string): Promise<{ ok: boolean }>;
  deleteBranch(name: string, opts?: { local?: boolean; remote?: boolean; remoteName?: string; force?: boolean }): Promise<{ ok: boolean }>;
  renameBranch(name: string, newName: string): Promise<{ ok: boolean }>;
  checkoutCommit(hash: string): Promise<{ ok: boolean }>;
  createWorktree(hash: string, worktreePath: string): Promise<{ ok: boolean; error?: string }>;
  resetBranchTo(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ ok: boolean }>;
  editCommitMessage(hash: string, message: string): Promise<{ ok: boolean }>;
  revertCommit(hash: string): Promise<{ ok: boolean }>;
  dropCommit(hash: string): Promise<{ ok: boolean }>;
  applyPatchCommit(hash: string): Promise<{ ok: boolean }>;
  moveCommitDown(hash: string): Promise<{ ok: boolean }>;
  setUpstream(branch: string, upstream: string): Promise<{ ok: boolean }>;
  pushSetUpstream(branch: string): Promise<{ ok: boolean }>;
  stash(message?: string): Promise<{ ok: boolean }>;
  stashPop(index?: number): Promise<{ ok: boolean }>;
  stashApply(index?: number): Promise<{ ok: boolean }>;
  stashDrop(index?: number): Promise<{ ok: boolean }>;
  stageHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  unstageHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  discardHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  stageLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  unstageLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  discardLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  revertHunk(hash: string, filePath: string, hunkIndex: number): Promise<{ ok: boolean }>;
  blame(filePath: string): Promise<string>;
  getBlame(filePath: string): Promise<import('../shared/types').BlameLine[]>;
  getFileHistory(filePath: string): Promise<import('../shared/types').FileHistoryEntry[]>;
  getConflictFile(filePath: string): Promise<import('../shared/types').ConflictFileParsed>;
  resolveConflictFile(filePath: string, content: string, options?: import('../shared/types').ConflictResolutionOptions): Promise<{ ok: boolean; error?: string }>;
  getRepoOperationState(): Promise<import('../shared/types').RepoOperationState>;
  abortOperation(): Promise<{ ok: boolean; error?: string }>;
  continueOperation(): Promise<{ ok: boolean; error?: string }>;
  cherryPick(hash: string): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }>;
  getCommitsForRebase(baseHash: string): Promise<import('../shared/types').RebaseStep[]>;
  executeInteractiveRebase(baseHash: string, steps: import('../shared/types').RebaseStep[]): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }>;
  getTags(): Promise<import('../shared/types').TagInfo[]>;
  createTag(name: string, commitHash?: string, message?: string): Promise<{ ok: boolean; error?: string }>;
  deleteTag(name: string, deleteRemote?: boolean, remoteName?: string): Promise<{ ok: boolean; error?: string }>;
  pushTag(name: string, remoteName?: string): Promise<{ ok: boolean; error?: string }>;
  getRemotes(): Promise<import('../shared/types').RemoteInfo[]>;
  getPullRequestCredentialStatus(): Promise<import('../shared/types').PullRequestCredentialStatus>;
  savePullRequestCredential(provider: import('../shared/types').PullRequestProvider, credential: import('../shared/types').PullRequestCredential): Promise<{ ok: boolean; error?: string }>;
  removePullRequestCredential(provider: import('../shared/types').PullRequestProvider): Promise<{ ok: boolean; error?: string }>;
  getPullRequestContext(remoteName?: string, providerOverride?: import('../shared/types').PullRequestProvider): Promise<import('../shared/types').PullRequestContext>;
  createHostedPullRequest(params: { remoteName: string; title: string; description: string; targetBranch: string; providerOverride?: import('../shared/types').PullRequestProvider }): Promise<{ ok: boolean; pullRequest?: import('../shared/types').HostedPullRequest; error?: string }>;
  addRemote(name: string, url: string): Promise<{ ok: boolean; error?: string }>;
  renameRemote(oldName: string, newName: string): Promise<{ ok: boolean; error?: string }>;
  setRemoteUrl(name: string, url: string): Promise<{ ok: boolean; error?: string }>;
  removeRemote(name: string): Promise<{ ok: boolean; error?: string }>;
  pruneRemote(name: string): Promise<{ ok: boolean; error?: string }>;
  getSubmodules(): Promise<import('../shared/types').SubmoduleInfo[]>;
  updateSubmodules(path?: string): Promise<{ ok: boolean; error?: string }>;
  getWorktrees(): Promise<import('../shared/types').WorktreeInfo[]>;
  removeWorktree(worktreePath: string, force?: boolean): Promise<{ ok: boolean; error?: string }>;
  openTerminal(): Promise<{ ok: boolean; error?: string }>;
  runCommand(command: string): Promise<{ ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>;
  openInEditor(filePath: string): Promise<{ ok: boolean; error?: string }>;
  setActiveRepo(path: string | null): void;
  getGitFlowConfig(): Promise<import('../shared/types').GitFlowConfig>;
  initGitFlow(config?: Partial<import('../shared/types').GitFlowConfig>): Promise<{ ok: boolean; error?: string }>;
  startGitFlowBranch(params: import('../shared/types').GitFlowStartParams): Promise<{ ok: boolean; branchName?: string; error?: string }>;
  finishGitFlowBranch(params: import('../shared/types').GitFlowFinishParams): Promise<{ ok: boolean; error?: string }>;
  compareCommits(baseHash: string, targetHash: string): Promise<import('../shared/types').ComparisonResult | null>;
  getComparisonFileDiff(baseHash: string, targetHash: string, filePath: string): Promise<import('../shared/types').FileDiff | null>;
  getStashDetail(index: number): Promise<import('../shared/types').StashDetail | null>;
  getStashFileDiff(index: number, filePath: string): Promise<import('../shared/types').FileDiff | null>;
  applyStashFile(index: number, filePath: string): Promise<{ ok: boolean; error?: string }>;
  simulateMerge(targetBranch: string): Promise<import('../shared/types').MergeSimulationResult>;
  explainChanges(params: { diffText?: string; commitHash?: string; config?: Partial<import('../shared/types').AiCommitConfig> }): Promise<{ ok: boolean; explanation?: string; error?: string }>;
  startBisect(badCommit: string, goodCommit: string): Promise<{ ok: boolean; state?: import('../shared/types').BisectState; error?: string }>;
  stepBisect(verdict: 'good' | 'bad' | 'skip'): Promise<{ ok: boolean; state?: import('../shared/types').BisectState; error?: string }>;
  resetBisect(): Promise<{ ok: boolean; error?: string }>;
  getBisectState(): Promise<import('../shared/types').BisectState>;
  generateChangelog(fromRef?: string, toRef?: string): Promise<import('../shared/types').ChangelogResult>;
  exportPatch(commitHash: string, outputPath: string): Promise<{ ok: boolean; error?: string }>;
  applyPatch(patchPath: string): Promise<{ ok: boolean; error?: string }>;
  minimizeWindow(): Promise<boolean>;
  maximizeWindow(): Promise<boolean>;
  closeWindow(): Promise<boolean>;
  isWindowMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (isMax: boolean) => void): () => void;
  restartApp(): Promise<boolean>;
};

const api: Api = {
  getGitHubSignInState: () => call('github-auth:get'),
  startGitHubSignIn: () => call('github-auth:start'),
  cancelGitHubSignIn: id => call('github-auth:cancel', id),
  openGitHubSignInPage: id => call('github-auth:open', id),
  copyGitHubSignInCode: id => call('github-auth:copy', id),
  refreshGitHubAccount: () => call('github-auth:refresh-account'),
  onGitHubSignInState: cb => {
    const listener = (_event: IpcRendererEvent, state: import('../shared/types').GitHubSignInState) => cb(state);
    ipcRenderer.on('github-auth:state', listener);
    return () => ipcRenderer.removeListener('github-auth:state', listener);
  },
  getSparseCheckout: () => call('git:sparse:get'),
  getSparseDirectories: (prefix, head) => call('git:sparse:directories', prefix, head),
  previewSparseCheckout: input => call('git:sparse:preview', input),
  applySparseCheckout: input => call('git:sparse:apply', input),
  restoreSparseLayout: (id, head, fingerprint) => call('git:sparse:restore', id, head, fingerprint),
  getLfsState: () => call('git:lfs-state'),
  configureLfs: skip => call('git:lfs:configure', skip),
  setLfsTracking: (pattern, tracked, literal) => call('git:lfs:track', pattern, tracked, literal),
  runLfsTransfer: input => call('git:lfs:transfer', input),
  getLfsTransfer: () => call('git:lfs-transfer-state'),
  cancelLfsTransfer: id => call('git:lfs-cancel', id),
  onLfsTransfer: cb => {
    const listener = (_event: IpcRendererEvent, state: import('../shared/types').LfsTransfer) => cb(state);
    ipcRenderer.on('git:lfs-progress', listener);
    return () => ipcRenderer.removeListener('git:lfs-progress', listener);
  },
  getBranchStack: () => call('git:stack:get'),
  setStackParent: (branch, parent, reset) => call('git:stack:parent', branch, parent, reset),
  previewStackRestack: root => call('git:stack:preview', root),
  resumeStackRestack: id => call('git:stack:resume', id),
  applyStackRestack: id => call('git:stack:apply', id),
  discardStackRestack: id => call('git:stack:discard', id),
  retargetPullRequest: input => call('git:stack:retarget', input),
  getCommitSplit: hash => call('git:split:plan', hash),
  listCommitSplitPreviews: () => call('git:split:list'),
  previewCommitSplit: input => call('git:split:preview', input),
  applyCommitSplit: id => call('git:split:apply', id),
  discardCommitSplit: id => call('git:split:discard', id),
  openPullRequestWorktree: input => call('git:pr-worktree:create', input),
  listPinnedRepos: () => call('dashboard:pins'),
  pinRepository: (repo, pinned) => call('dashboard:pin', repo, pinned),
  getRepositoryOverview: (repo, hosted) => call('dashboard:overview', repo, hosted),
  listRewriteSessions: () => call('git:rewrite:list'),
  compareCommitRanges: (input) => call('git:rewrite:compare', input),
  deleteRewriteSession: (id) => call('git:rewrite:delete', id),
  getResolutionMemory: () => call('git:rerere:state'),
  setResolutionMemory: (enabled) => call('git:rerere:configure', enabled),
  getResolutionSuggestion: (filePath) => call('git:rerere:suggestion', filePath),
  forgetResolution: (filePath) => call('git:rerere:forget', filePath),
  listRestorePoints: () => call('git:restore-points:list'),
  createRestorePoint: (label) => call('git:restore-points:create', label),
  restorePoint: (id) => call('git:restore-points:restore', id),
  deleteRestorePoint: (id) => call('git:restore-points:delete', id),
  getPullReview: (target) => call('git:pull-review:get', target),
  submitPullReview: (params) => call('git:pull-review:submit', params),
  getAppUpdateState: () => call('app-update:get-state'),
  checkForAppUpdates: () => call('app-update:check'),
  downloadAppUpdate: () => call('app-update:download'),
  installAppUpdate: () => call('app-update:install'),
  openAppReleasePage: () => call('app-update:open-release-page'),
  onAppUpdateState: (cb) => {
    const handler = (_e: IpcRendererEvent, next: import('../shared/types').AppUpdateState) => cb(next);
    ipcRenderer.on('app-update:state', handler);
    return () => ipcRenderer.removeListener('app-update:state', handler);
  },
  openRepo: (path) => call('repo:open-path', path),
  openRepoDialog: () => call('repo:open-dialog'),
  initRepo: (opts) => call('repo:init', opts),
  selectDirectory: (title) => call('repo:select-directory', title),
  recentRepos: () => call('repo:recent'),
  removeRecentRepo: (path) => call('repo:remove-recent', path),
  getGitConfig: (scope) => call('git:config-get', scope),
  setGitConfig: (config) => call('git:config-set', config),
  getStatus: () => call('git:status'),
  getLog: (limit) => call('git:log', limit),
  getReflog: () => call('git:reflog'),
  createRecoveryBranch: (hash, branchName) => call('git:reflog-recover-branch', hash, branchName),
  restoreHeadFromReflog: (hash) => call('git:reflog-restore-head', hash),
  getBranches: () => call('git:branches'),
  getStashes: () => call('git:stashes'),
  getCommitDetail: (hash) => call('git:commit-detail', hash),
  getFileDiff: (hash, filePath, opts) => call('git:file-diff', hash, filePath, opts),
  getStagedDiff: () => call('git:staged-diff'),
  generateAiCommitMessage: (params) => call('ai:generate-commit', params),
  stageFiles: (paths) => call('git:stage', paths),
  unstageFiles: (paths) => call('git:unstage', paths),
  stageAll: () => call('git:stage-all'),
  unstageAll: () => call('git:unstage-all'),
  discardFile: (path) => call('git:discard', path),
  commit: (message, author) => call('git:commit', message, author),
  pull: () => call('git:pull'),
  push: () => call('git:push'),
  fetch: (remote?: string) => call('git:fetch', remote) as Promise<{ ok: boolean }>,
  mergeBranch: (name) => call('git:merge', name),
  rebaseBranch: (upstream: string) => call('git:rebase-branch', upstream) as Promise<{ ok: boolean }>,
  checkoutBranch: (name) => call('git:checkout', name),
  createBranch: (name, atHash) => call('git:branch-create', name, atHash),
  deleteBranch: (name, opts) => call('git:branch-delete', name, opts),
  renameBranch: (name, newName) => call('git:branch-rename', name, newName),
  checkoutCommit: (hash) => call('git:checkout-commit', hash),
  createWorktree: (hash, worktreePath) => call('git:worktree-create', hash, worktreePath),
  resetBranchTo: (hash, mode) => call('git:reset-branch', hash, mode),
  editCommitMessage: (hash, message) => call('git:edit-commit-message', hash, message),
  revertCommit: (hash) => call('git:revert-commit', hash),
  dropCommit: (hash) => call('git:drop-commit', hash),
  applyPatchCommit: (hash) => call('git:apply-patch-commit', hash),
  moveCommitDown: (hash) => call('git:move-commit-down', hash),
  setUpstream: (branch, upstream) => call('git:set-upstream', branch, upstream),
  pushSetUpstream: (branch) => call('git:push-set-upstream', branch),
  stash: (message) => call('git:stash', message),
  stashPop: (index) => call('git:stash-pop', index),
  stashApply: (index) => call('git:stash-apply', index),
  stashDrop: (index) => call('git:stash-drop', index),
  stageHunk: (filePath, hunkIndex) => call('git:stage-hunk', filePath, hunkIndex),
  unstageHunk: (filePath, hunkIndex) => call('git:unstage-hunk', filePath, hunkIndex),
  discardHunk: (filePath, hunkIndex) => call('git:discard-hunk', filePath, hunkIndex),
  stageLines: (filePath, hunkIndex, lineIndices) => call('git:stage-lines', filePath, hunkIndex, lineIndices),
  unstageLines: (filePath, hunkIndex, lineIndices) => call('git:unstage-lines', filePath, hunkIndex, lineIndices),
  discardLines: (filePath, hunkIndex, lineIndices) => call('git:discard-lines', filePath, hunkIndex, lineIndices),
  revertHunk: (hash, filePath, hunkIndex) => call('git:revert-hunk', hash, filePath, hunkIndex),
  blame: (filePath) => call('git:blame', filePath),
  getBlame: (filePath) => call('git:get-blame', filePath),
  getFileHistory: (filePath) => call('git:get-file-history', filePath),
  getConflictFile: (filePath) => call('git:get-conflict-file', filePath),
  resolveConflictFile: (filePath, content, options) => call('git:resolve-conflict-file', filePath, content, options),
  getRepoOperationState: () => call('git:get-operation-state'),
  abortOperation: () => call('git:abort-operation'),
  continueOperation: () => call('git:continue-operation'),
  cherryPick: (hash) => call('git:cherry-pick', hash),
  getCommitsForRebase: (baseHash) => call('git:get-commits-for-rebase', baseHash),
  executeInteractiveRebase: (baseHash, steps) => call('git:execute-interactive-rebase', baseHash, steps),
  getTags: () => call('git:get-tags'),
  createTag: (name, commitHash, message) => call('git:create-tag', name, commitHash, message),
  deleteTag: (name, deleteRemote, remoteName) => call('git:delete-tag', name, deleteRemote, remoteName),
  pushTag: (name, remoteName) => call('git:push-tag', name, remoteName),
  getRemotes: () => call('git:get-remotes'),
  getPullRequestCredentialStatus: () => call('git:pull-requests:credentials'),
  savePullRequestCredential: (provider, credential) => call('git:pull-requests:save-credential', provider, credential),
  removePullRequestCredential: (provider) => call('git:pull-requests:remove-credential', provider),
  getPullRequestContext: (remoteName, providerOverride) => call('git:pull-requests:context', remoteName, providerOverride),
  createHostedPullRequest: (params) => call('git:pull-requests:create', params),
  addRemote: (name, url) => call('git:add-remote', name, url),
  renameRemote: (oldName, newName) => call('git:rename-remote', oldName, newName),
  setRemoteUrl: (name, url) => call('git:set-remote-url', name, url),
  removeRemote: (name) => call('git:remove-remote', name),
  pruneRemote: (name) => call('git:prune-remote', name),
  getSubmodules: () => call('git:get-submodules'),
  updateSubmodules: (path?: string) => call('git:update-submodules', path) as Promise<{ ok: boolean; error?: string }>,
  getWorktrees: () => call('git:get-worktrees'),
  removeWorktree: (worktreePath, force) => call('git:remove-worktree', worktreePath, force),
  openTerminal: () => call('app:open-terminal'),
  runCommand: (command: string) => call('app:run-command', command) as Promise<{ ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>,
  openInEditor: (filePath) => call('app:open-in-editor', filePath),
  setActiveRepo: (path: string | null) => ipcRenderer.send('repo:set-active', path),
  getGitFlowConfig: () => call('git:flow:get-config'),
  initGitFlow: (config) => call('git:flow:init', config),
  startGitFlowBranch: (params) => call('git:flow:start', params),
  finishGitFlowBranch: (params) => call('git:flow:finish', params),
  compareCommits: (baseHash, targetHash) => call('git:compare-commits', baseHash, targetHash),
  getComparisonFileDiff: (baseHash, targetHash, filePath) => call('git:compare-file-diff', baseHash, targetHash, filePath),
  getStashDetail: (index) => call('git:stash-detail', index),
  getStashFileDiff: (index, filePath) => call('git:stash-file-diff', index, filePath),
  applyStashFile: (index, filePath) => call('git:stash-apply-file', index, filePath),
  simulateMerge: (targetBranch) => call('git:simulate-merge', targetBranch),
  explainChanges: (params) => call('ai:explain-changes', params),
  startBisect: (badCommit, goodCommit) => call('git:bisect-start', badCommit, goodCommit),
  stepBisect: (verdict) => call('git:bisect-step', verdict),
  resetBisect: () => call('git:bisect-reset'),
  getBisectState: () => call('git:bisect-state'),
  generateChangelog: (fromRef, toRef) => call('git:generate-changelog', fromRef, toRef),
  exportPatch: (commitHash, outputPath) => call('git:export-patch', commitHash, outputPath),
  applyPatch: (patchPath) => call('git:apply-patch', patchPath),
  minimizeWindow: () => call('window:minimize'),
  maximizeWindow: () => call('window:maximize'),
  closeWindow: () => call('window:close'),
  isWindowMaximized: () => call('window:is-maximized'),
  onMaximizeChange: (cb: (isMax: boolean) => void) => {
    const handler = (_e: IpcRendererEvent, isMax: boolean) => cb(isMax);
    ipcRenderer.on('window:maximize-change', handler);
    return () => {
      ipcRenderer.removeListener('window:maximize-change', handler);
    };
  },
  restartApp: () => call('app:restart')
};

contextBridge.exposeInMainWorld('api', api);
