// Shared types between main, preload and renderer processes.

export interface RepoSummary {
  path: string;
  name: string;
  currentBranch: string;
  headHash: string;
}

export type FileStatusKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface GitFileStatus {
  path: string;
  status: FileStatusKind;
  staged: boolean;
  unstaged: boolean;
  renamedFrom?: string;
}

export interface GitStatus {
  currentBranch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
}

export interface CommitRef {
  kind: 'branch' | 'tag' | 'head';
  label: string;
  isCurrent?: boolean;
  isRemote?: boolean;
  isTracking?: boolean;
}

export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  message: string;
  body: string;
  authorName: string;
  authorEmail: string;
  /** MD5 of the normalized author email — used for Gravatar avatars */
  avatarHash?: string;
  date: string;
  refs: CommitRef[];
  lanes: number[];
  lane: number;
  /** Per-parent lane routing for genuine merges (lane + return source) */
  pl2?: { lane: number; bottom: 'v' | 'curve'; returnFrom?: number }[];
}

export interface BranchInfo {
  name: string;
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommitDate?: string;
  tracking?: string;
}

export interface StashInfo {
  index: number;
  message: string;
  date: string;
}

export interface ReflogEntry {
  hash: string;
  shortHash: string;
  ref: string;
  action: string;
  subject: string;
  date: string;
}

export interface TagInfo {
  name: string;
  hash: string;
  shortHash: string;
  tagger?: string;
  date?: string;
  message?: string;
}

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export type PullRequestProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea';

export interface PullRequestCredential {
  token: string;
  /** GitLab or Gitea instance URL. Omitted for the GitLab.com connection. */
  serverUrl?: string;
  /** Bitbucket Cloud API tokens use the Atlassian account email as the Basic Auth username. */
  username?: string;
}

export type PullRequestCredentialStatus = Record<PullRequestProvider, boolean> & { gitlabServers?: string[]; giteaServers?: string[] };

export interface GitHubAccount {
  id: number;
  login: string;
  name?: string;
  avatarUrl?: string;
  installations?: number;
}

export interface GitHubSignInState {
  configured: boolean;
  connected: boolean;
  secureStorageAvailable: boolean;
  method: 'device' | 'token' | null;
  account?: GitHubAccount;
  needsSignIn: boolean;
  installationUrl?: string;
  phase: 'idle' | 'requesting' | 'waiting' | 'success' | 'error' | 'cancelled' | 'expired';
  flowId?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  message?: string;
}

export interface HostedPullRequest {
  id: string;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PullRequestContext {
  provider: PullRequestProvider | null;
  remoteName: string | null;
  remoteUrl?: string;
  repository?: string;
  repositoryUrl?: string;
  currentBranch: string;
  defaultBranch: string;
  credentialConfigured: boolean;
  pullRequests: HostedPullRequest[];
  error?: string;
}

export interface PullReviewTarget {
  remoteName: string;
  provider: PullRequestProvider;
  requestId: string;
}
export interface PullReviewFile {
  path: string;
  oldPath: string;
  status: string;
  patch: string;
  unavailable?: boolean;
}
export interface PullReviewComment {
  id: string;
  threadId?: string;
  author: string;
  body: string;
  path?: string;
  line?: number;
  side?: 'old' | 'new';
  state?: string;
  resolved?: boolean;
  createdAt?: string;
}
export interface PullReviewCheck {
  name: string;
  state: string;
  url?: string;
}
export interface PullReviewDetail {
  head: string;
  base: string;
  start: string;
  description: string;
  files: PullReviewFile[];
  comments: PullReviewComment[];
  checks: PullReviewCheck[];
  warnings: string[];
  changeRequestMode: 'native' | 'discussion';
}
export interface PullReviewSubmission extends PullReviewTarget {
  head: string;
  action: 'comment' | 'approve' | 'request-changes';
  body: string;
  changeRequestMode?: 'native' | 'discussion';
  inline?: { path: string; line: number; side: 'old' | 'new' };
  replyTo?: { id: string; threadId?: string };
}
export interface AdvancedGitApi {
  getGitHubSignInState(): Promise<GitHubSignInState>;
  startGitHubSignIn(): Promise<GitHubSignInState>;
  cancelGitHubSignIn(flowId: string): Promise<GitHubSignInState>;
  openGitHubSignInPage(flowId: string): Promise<void>;
  copyGitHubSignInCode(flowId: string): Promise<void>;
  refreshGitHubAccount(): Promise<GitHubSignInState>;
  onGitHubSignInState(callback: (state: GitHubSignInState) => void): () => void;
  getSparseCheckout(): Promise<SparseCheckoutState>;
  getSparseDirectories(prefix: string, head: string): Promise<string[]>;
  previewSparseCheckout(input: SparseSelection): Promise<SparsePreview>;
  applySparseCheckout(input: SparseSelection): Promise<SparseCheckoutState>;
  restoreSparseLayout(id: string, head: string, fingerprint: string): Promise<SparseCheckoutState>;
  getLfsState(): Promise<LfsState>;
  configureLfs(skipSmudge: boolean): Promise<LfsState>;
  setLfsTracking(pattern: string, tracked: boolean, literal?: boolean): Promise<LfsState>;
  runLfsTransfer(input: { kind: LfsTransfer['kind']; remote: string; head: string }): Promise<LfsTransfer>;
  getLfsTransfer(): Promise<LfsTransfer | null>;
  cancelLfsTransfer(id: string): Promise<{ ok: boolean }>;
  onLfsTransfer(callback: (state: LfsTransfer) => void): () => void;
  getBranchStack(): Promise<BranchStackState>;
  setStackParent(branch: string, parent: string | null, resetBoundary?: boolean): Promise<BranchStackState>;
  previewStackRestack(root: string): Promise<StackRestackSession>;
  resumeStackRestack(id: string): Promise<StackRestackSession>;
  applyStackRestack(id: string): Promise<{ ok: boolean; warning?: string }>;
  discardStackRestack(id: string): Promise<{ ok: boolean }>;
  retargetPullRequest(input: PullReviewTarget & { head: string; previousTarget: string; newTarget: string }): Promise<{ ok: boolean }>;
  getCommitSplit(hash: string): Promise<CommitSplitPlan>;
  listCommitSplitPreviews(): Promise<CommitSplitPreview[]>;
  previewCommitSplit(input: CommitSplitInput): Promise<CommitSplitPreview>;
  applyCommitSplit(id: string): Promise<{ ok: boolean; rewriteId?: string; warning?: string }>;
  discardCommitSplit(id: string): Promise<{ ok: boolean }>;
  openPullRequestWorktree(input: PullReviewTarget & { head: string; directory: string; branch: string }): Promise<{ ok: boolean; path: string; branch: string }>;
  listPinnedRepos(): Promise<string[]>;
  pinRepository(repoPath: string, pinned: boolean): Promise<string[]>;
  getRepositoryOverview(repoPath: string, hosted?: boolean): Promise<RepositoryOverview>;
  listRewriteSessions(): Promise<RewriteSession[]>;
  compareCommitRanges(input: RangeComparisonInput): Promise<RangeComparison>;
  deleteRewriteSession(id: string): Promise<{ ok: boolean }>;
  getResolutionMemory(): Promise<ResolutionMemoryState>;
  setResolutionMemory(enabled: boolean): Promise<ResolutionMemoryState>;
  getResolutionSuggestion(filePath: string): Promise<{ enabled: boolean; content: string | null; snapshot: string }>;
  forgetResolution(filePath: string): Promise<{ ok: boolean }>;
  listRestorePoints(): Promise<RestorePoint[]>;
  createRestorePoint(label?: string): Promise<RestorePoint>;
  restorePoint(id: string): Promise<{ ok: boolean; branch: string }>;
  deleteRestorePoint(id: string): Promise<{ ok: boolean }>;
  getPullReview(target: PullReviewTarget): Promise<PullReviewDetail>;
  submitPullReview(params: PullReviewSubmission): Promise<{ ok: boolean; message: string }>;
}

export interface SparseLayoutSummary { id: string; createdAt: string; head: string; enabled: boolean; cone: boolean; directories: string[] }
export interface SparseCheckoutState {
  repo: string; version: string; supported: boolean; head: string; fingerprint: string; enabled: boolean; cone: boolean; ignoreCase: boolean;
  directories: string[]; rawPatterns: string; backups: SparseLayoutSummary[]; warning?: string;
}
export interface SparseSelection { head: string; fingerprint: string; directories: string[]; disable: boolean }
export interface SparsePreview extends SparseSelection { total: number; included: number; excluded: number; removed: number; added: number; removedExamples: string[]; addedExamples: string[]; blockers: string[] }

export interface LfsState {
  repo: string; installed: boolean; version: string; configured: boolean; head: string; remotes: string[];
  patterns: { pattern: string; source: string; lockable: boolean; tracked: boolean }[];
  files: { name: string; oid: string; size: number; downloaded: boolean; checkout: boolean }[]; totalFiles: number; warning?: string;
}
export interface LfsTransfer {
  id: string; repo: string; kind: 'fetch' | 'pull' | 'push' | 'checkout'; state: 'running' | 'completed' | 'cancelled' | 'failed';
  current: number; totalFiles: number; bytes: number; totalBytes: number; file: string; message: string;
}

export interface BranchStackLink { id: string; branch: string; parent: string; base: string; head?: string; parentHead?: string; commits?: number; error?: string }
export interface StackRestackSession {
  id: string; root: string; rootHead: string; path: string; state: 'building' | 'paused' | 'ready' | 'applied'; index: number; error?: string;
  steps: { id: string; branch: string; parent: string; base: string; oldHead: string; newHead?: string; onto?: string; commits: number }[];
}
export interface BranchStackState { links: BranchStackLink[]; branches: string[]; sessions: StackRestackSession[] }

export interface CommitSplitPlan {
  hash: string; head: string; branch: string; parent: string; message: string; descendantCount: number;
  units: { id: string; file: string; label: string; patch: string }[];
}
export interface CommitSplitInput { hash: string; head: string; groups: { message: string; units: string[] }[] }
export interface CommitSplitPreview { id: string; oldHead: string; newHead: string; branch: string; descendantCount: number; commits: { hash: string; message: string; files: string[] }[] }

export interface RepositoryOverview {
  path: string; branch: string; changed: number; staged: number; conflicts: number;
  ahead: number; behind: number; checkedAt: string;
  requests?: { id: string; title: string; url: string }[];
  hostedMessage?: string; error?: string;
}

export interface ResolutionMemoryState { enabled: boolean; gitAutomatic: boolean; remembered: number }

export interface RangeComparisonInput { oldBase: string; oldTip: string; newBase: string; newTip: string }
export interface RewriteSession extends Omit<RangeComparisonInput, 'newTip'> {
  id: string; worktree: string; branch: string; operation: string; createdAt: string;
  status: 'running' | 'paused' | 'completed' | 'aborted' | 'failed' | 'ended';
  newTip?: string; newBaseRef?: string; finishedAt?: string; error?: string;
}
export interface RangeComparison extends RangeComparisonInput {
  entries: { before: number | null; after: number | null; oldHash?: string; newHash?: string; kind: 'unchanged' | 'changed' | 'added' | 'removed'; subject: string; patch: string }[];
  raw: string; warning: string; beforeCount: number; afterCount: number;
}

export interface RestorePoint {
  id: string;
  label: string;
  createdAt: string;
  branch: string;
  head: string;
  unborn: boolean;
  worktree: string;
  untrackedCount: number;
  status: string;
}

export interface SubmoduleInfo {
  name: string;
  path: string;
  hash: string;
  isInitialized: boolean;
  isDirty: boolean;
  isOutOfSync: boolean;
}

export interface WorktreeInfo {
  path: string;
  hash: string;
  branch: string;
  isBare?: boolean;
  isLocked?: boolean;
}

export interface FileChange {
  path: string;
  status: FileStatusKind;
  insertions?: number;
  deletions?: number;
  renamedFrom?: string;
}

export interface CommitDetail {
  hash: string;
  shortHash: string;
  parents: string[];
  message: string;
  body: string;
  authorName: string;
  authorEmail: string;
  /** MD5 of the normalized author email — used for Gravatar avatars */
  avatarHash?: string;
  date: string;
  files: FileChange[];
  insertions: number;
  deletions: number;
}

export type DiffLineKind = 'add' | 'del' | 'context' | 'hunk';

export interface DiffLine {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  insertions: number;
  deletions: number;
  isBinary?: boolean;
}

export interface ComparisonResult {
  baseHash: string;
  targetHash: string;
  baseSubject: string;
  targetSubject: string;
  files: FileChange[];
  insertions: number;
  deletions: number;
}

export interface StashDetail {
  index: number;
  message: string;
  date: string;
  files: FileChange[];
  insertions: number;
  deletions: number;
}

export interface MergeSimulationResult {
  clean: boolean;
  conflicts: string[];
  message: string;
}

export interface BisectState {
  active: boolean;
  needsGood?: boolean;
  needsBad?: boolean;
  ambiguousCommits?: string[];
  currentCommit?: {
    hash: string;
    shortHash: string;
    message: string;
    authorName: string;
    date: string;
  };
  stepInfo?: string;
  culpritCommit?: {
    hash: string;
    shortHash: string;
    message: string;
    body: string;
    authorName: string;
    authorEmail: string;
    date: string;
  };
  log?: string[];
}

export interface ChangelogCategory {
  title: string;
  items: { hash: string; shortHash: string; message: string; author: string }[];
}

export interface ChangelogResult {
  fromRef: string;
  toRef: string;
  categories: ChangelogCategory[];
  totalCommits: number;
  markdown: string;
}

export interface GraphResult {
  commits: Commit[];
  hasUncommittedChanges: boolean;
  totalCommits: number;
  hasMore?: boolean;
}

export interface DiffRange {
  hash: string;
  /** null means HEAD for worktree diffs */
  compareWith?: string | null;
  filePath?: string;
  /** diff between commit and its working directory (unstaged) */
  worktree?: boolean;
  staged?: boolean;
}

export interface BlameLine {
  lineNo: number;
  commitHash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  summary: string;
  content: string;
}

export interface FileHistoryEntry {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  summary: string;
}

export interface ConflictSection {
  id: string;
  startLine: number;
  endLine: number;
  currentLabel: string;
  currentLines: string[];
  incomingLabel: string;
  incomingLines: string[];
  baseLines?: string[];
  startOffset: number;
  endOffset: number;
  hasTrailingNewline: boolean;
  resolvedChoice?: 'current' | 'incoming' | 'both';
}

export interface ConflictFileParsed {
  filePath: string;
  sections: Array<
    | { type: 'text'; lines: string[] }
    | { type: 'conflict'; conflict: ConflictSection }
  >;
  totalConflicts: number;
  rawContent: string;
  currentContent: string | null;
  incomingContent: string | null;
  baseContent: string | null;
  currentLabel: string;
  incomingLabel: string;
  kind: 'text' | 'binary' | 'symlink' | 'submodule';
  lineEnding: '\n' | '\r\n';
  snapshot: string;
  workingTreeExists: boolean;
  parseWarning?: string;
}

export interface ConflictResolutionOptions {
  expectedSnapshot: string;
  action?: 'result' | 'current' | 'incoming' | 'delete';
}

export interface RepoOperationState {
  inMerge: boolean;
  inRebase: boolean;
  inCherryPick: boolean;
  conflictedFiles: string[];
}

export type RebaseActionKind = 'pick' | 'squash' | 'fixup' | 'reword' | 'drop';

export interface RebaseStep {
  hash: string;
  shortHash: string;
  action: RebaseActionKind;
  message: string;
  author: string;
}

export interface InitRepoOptions {
  path: string;
  initialBranch?: string;
  createReadme?: boolean;
  gitignoreTemplate?: string;
  initialCommitMessage?: string;
}

export interface CommitProfile {
  id: string;
  name: string;
  authorName: string;
  authorEmail: string;
  signingKey?: string;
}

export interface AiCommitConfig {
  provider: 'local' | 'pollinations' | 'openrouter' | 'groq' | 'gemini' | 'ollama' | 'custom';
  model: string;
  apiKey: string;
  endpoint: string;
  promptStyle: 'conventional' | 'simple' | 'detailed' | 'gitmoji';
}

export type DiffViewMode = 'unified' | 'split';
export interface CommitRewordSnapshot { head: string; branch: string }
export interface AiCommitDraft extends CommitRewordSnapshot {
  commitHash: string;
  originalMessage: string;
  message: string;
  inputTruncated: boolean;
}
export interface BranchChangesExplanation {
  baseHash: string;
  tipHash: string;
  mergeBase: string;
  commitCount: number;
  filesChanged: number;
  explanation: string;
}
export interface PullRequestIntent { remoteName?: string; requestId?: string; mode?: 'create' | 'review' }
export type DiffActiveTab = 'diff' | 'blame' | 'history';

export interface GitFlowConfig {
  initialized: boolean;
  masterBranch: string;
  developBranch: string;
  featurePrefix: string;
  releasePrefix: string;
  hotfixPrefix: string;
  bugfixPrefix: string;
  supportPrefix: string;
  versionTagPrefix: string;
}

export type GitFlowBranchType = 'feature' | 'release' | 'hotfix' | 'bugfix' | 'support';

export interface GitFlowStartParams {
  type: GitFlowBranchType;
  name: string;
  baseBranch?: string;
}

export interface GitFlowFinishParams {
  branchName: string;
  tagMessage?: string;
  keepBranch?: boolean;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'unsupported';

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
  /** Identify the failed update step so installation recovery can keep the download. */
  errorStage?: 'check' | 'download' | 'install';
  /** Windows and Linux packages support in-app installation; unsigned macOS builds use the release page. */
  canInstallInApp: boolean;
}

// IPC API exposed via contextBridge
export interface GitWorkbenchApi extends AdvancedGitApi {
  getAppUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdates(): Promise<AppUpdateState>;
  downloadAppUpdate(): Promise<AppUpdateState>;
  installAppUpdate(): Promise<boolean>;
  openAppReleasePage(): Promise<void>;
  openExternal(url: string): Promise<void>;
  onAppUpdateState(cb: (state: AppUpdateState) => void): () => void;
  openRepo(path: string): Promise<{ ok: boolean; repo?: RepoSummary; error?: string }>;
  initRepo(opts: InitRepoOptions): Promise<{ ok: boolean; repo?: RepoSummary; error?: string }>;
  selectDirectory(title?: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  recentRepos(): Promise<string[]>;
  removeRecentRepo(path: string): Promise<void>;
  getGitConfig(scope?: 'local' | 'global'): Promise<{ name: string; email: string }>;
  setGitConfig(config: { name?: string; email?: string; scope?: 'local' | 'global' }): Promise<{ ok: boolean; error?: string }>;
  getStatus(): Promise<GitStatus | null>;
  getLog(limit?: number): Promise<GraphResult>;
  getReflog(): Promise<ReflogEntry[]>;
  createRecoveryBranch(hash: string, branchName?: string): Promise<{ ok: boolean; branchName?: string; error?: string }>;
  restoreHeadFromReflog(hash: string): Promise<{ ok: boolean; branchName?: string; backupBranch?: string; error?: string }>;
  getBranches(): Promise<{ local: BranchInfo[]; remote: BranchInfo[] }>;
  getStashes(): Promise<StashInfo[]>;
  getCommitDetail(hash: string): Promise<CommitDetail | null>;
  getFileDiff(hash: string, filePath: string, opts?: { staged?: boolean; worktree?: boolean }): Promise<FileDiff | null>;
  getStagedDiff(): Promise<{ ok: boolean; diff: string; error?: string }>;
  generateAiCommitMessage(params?: Partial<AiCommitConfig>): Promise<{ ok: boolean; message?: string; error?: string }>;
  stageFiles(paths: string[]): Promise<GitStatus>;
  unstageFiles(paths: string[]): Promise<GitStatus>;
  stageAll(): Promise<GitStatus>;
  unstageAll(): Promise<GitStatus>;
  discardFile(path: string): Promise<GitStatus>;
  stageHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  unstageHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  discardHunk(filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  stageLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  unstageLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  discardLines(filePath: string, hunkIndex: number, lineIndices: number[]): Promise<{ ok: boolean; error?: string }>;
  commit(message: string, author?: { name: string; email: string }): Promise<{ ok: boolean; error?: string }>;
  pull(): Promise<{ ok: boolean; error?: string }>;
  push(): Promise<{ ok: boolean; error?: string }>;
  fetch(remote?: string): Promise<{ ok: boolean; error?: string }>;
  mergeBranch(name: string): Promise<{ ok: boolean; error?: string }>;
  rebaseBranch(upstream: string): Promise<{ ok: boolean; error?: string }>;
  checkoutBranch(name: string): Promise<{ ok: boolean; error?: string }>;
  createBranch(name: string, atHash?: string): Promise<{ ok: boolean; error?: string }>;
  deleteBranch(name: string, opts?: { local?: boolean; remote?: boolean; remoteName?: string; force?: boolean }): Promise<{ ok: boolean; error?: string }>;
  renameBranch(name: string, newName: string): Promise<{ ok: boolean; error?: string }>;
  checkoutCommit(hash: string): Promise<{ ok: boolean; error?: string }>;
  createWorktree(hash: string, worktreePath: string): Promise<{ ok: boolean; error?: string }>;
  resetBranchTo(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ ok: boolean; error?: string }>;
  editCommitMessage(hash: string, message: string, expected?: CommitRewordSnapshot): Promise<{ ok: boolean; error?: string }>;
  recomposeCommitMessage(hash: string, config?: Partial<AiCommitConfig>): Promise<AiCommitDraft>;
  explainBranchChanges(base: string, tip: string, config?: Partial<AiCommitConfig>): Promise<BranchChangesExplanation>;
  revertCommit(hash: string): Promise<{ ok: boolean; error?: string }>;
  dropCommit(hash: string): Promise<{ ok: boolean; error?: string }>;
  applyPatchCommit(hash: string): Promise<{ ok: boolean; error?: string }>;
  moveCommitDown(hash: string): Promise<{ ok: boolean; error?: string }>;
  setUpstream(branch: string, upstream: string): Promise<{ ok: boolean; error?: string }>;
  pushSetUpstream(branch: string): Promise<{ ok: boolean; error?: string }>;
  stash(message?: string): Promise<{ ok: boolean; error?: string }>;
  stashPop(index?: number): Promise<{ ok: boolean; error?: string }>;
  stashApply(index?: number): Promise<{ ok: boolean; error?: string }>;
  stashDrop(index?: number): Promise<{ ok: boolean; error?: string }>;
  revertHunk(hash: string, filePath: string, hunkIndex: number): Promise<{ ok: boolean; error?: string }>;
  blame(filePath: string): Promise<string>;
  getBlame(filePath: string): Promise<BlameLine[]>;
  getFileHistory(filePath: string): Promise<FileHistoryEntry[]>;
  getConflictFile(filePath: string): Promise<ConflictFileParsed>;
  resolveConflictFile(filePath: string, content: string, options?: ConflictResolutionOptions): Promise<{ ok: boolean; error?: string }>;
  getRepoOperationState(): Promise<RepoOperationState>;
  abortOperation(): Promise<{ ok: boolean; error?: string }>;
  continueOperation(): Promise<{ ok: boolean; error?: string }>;
  cherryPick(hash: string): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }>;
  getCommitsForRebase(baseHash: string): Promise<RebaseStep[]>;
  executeInteractiveRebase(baseHash: string, steps: RebaseStep[]): Promise<{ ok: boolean; hasConflicts?: boolean; error?: string }>;
  getTags(): Promise<TagInfo[]>;
  createTag(name: string, commitHash?: string, message?: string): Promise<{ ok: boolean; error?: string }>;
  deleteTag(name: string, deleteRemote?: boolean, remoteName?: string): Promise<{ ok: boolean; error?: string }>;
  pushTag(name: string, remoteName?: string): Promise<{ ok: boolean; error?: string }>;
  getRemotes(): Promise<RemoteInfo[]>;
  getPullRequestCredentialStatus(): Promise<PullRequestCredentialStatus>;
  savePullRequestCredential(provider: PullRequestProvider, credential: PullRequestCredential): Promise<{ ok: boolean; error?: string }>;
  removePullRequestCredential(provider: PullRequestProvider, serverUrl?: string): Promise<{ ok: boolean; error?: string }>;
  testGitLabConnection(serverUrl: string, token?: string): Promise<{ ok: boolean; username?: string; error?: string }>;
  testGiteaConnection(serverUrl: string, token?: string): Promise<{ ok: boolean; username?: string; error?: string }>;
  getPullRequestContext(remoteName?: string, providerOverride?: PullRequestProvider): Promise<PullRequestContext>;
  createHostedPullRequest(params: { remoteName: string; title: string; description: string; targetBranch: string; providerOverride?: PullRequestProvider }): Promise<{ ok: boolean; pullRequest?: HostedPullRequest; error?: string }>;
  addRemote(name: string, url: string): Promise<{ ok: boolean; error?: string }>;
  renameRemote(oldName: string, newName: string): Promise<{ ok: boolean; error?: string }>;
  setRemoteUrl(name: string, url: string): Promise<{ ok: boolean; error?: string }>;
  removeRemote(name: string): Promise<{ ok: boolean; error?: string }>;
  pruneRemote(name: string): Promise<{ ok: boolean; error?: string }>;
  getSubmodules(): Promise<SubmoduleInfo[]>;
  updateSubmodules(path?: string): Promise<{ ok: boolean; error?: string }>;
  getWorktrees(): Promise<WorktreeInfo[]>;
  removeWorktree(worktreePath: string, force?: boolean): Promise<{ ok: boolean; error?: string }>;
  openTerminal(): Promise<{ ok: boolean; error?: string }>;
  runCommand(command: string): Promise<{ ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>;
  openInEditor(filePath: string): Promise<{ ok: boolean; error?: string }>;
  minimizeWindow(): Promise<boolean>;
  maximizeWindow(): Promise<boolean>;
  closeWindow(): Promise<boolean>;
  isWindowMaximized(): Promise<boolean>;
  onMaximizeChange?(cb: (isMax: boolean) => void): () => void;
  getGitFlowConfig(): Promise<GitFlowConfig>;
  initGitFlow(config?: Partial<GitFlowConfig>): Promise<{ ok: boolean; error?: string }>;
  startGitFlowBranch(params: GitFlowStartParams): Promise<{ ok: boolean; branchName?: string; error?: string }>;
  finishGitFlowBranch(params: GitFlowFinishParams): Promise<{ ok: boolean; error?: string }>;
  compareCommits(baseHash: string, targetHash: string): Promise<ComparisonResult | null>;
  getComparisonFileDiff(baseHash: string, targetHash: string, filePath: string): Promise<FileDiff | null>;
  getStashDetail(index: number): Promise<StashDetail | null>;
  getStashFileDiff(index: number, filePath: string): Promise<FileDiff | null>;
  applyStashFile(index: number, filePath: string): Promise<{ ok: boolean; error?: string }>;
  simulateMerge(targetBranch: string): Promise<MergeSimulationResult>;
  explainChanges(params: { diffText?: string; commitHash?: string; config?: Partial<AiCommitConfig> }): Promise<{ ok: boolean; explanation?: string; error?: string }>;
  startBisect(badCommit?: string, goodCommit?: string): Promise<{ ok: boolean; state?: BisectState; error?: string }>;
  stepBisect(verdict: 'good' | 'bad' | 'skip'): Promise<{ ok: boolean; state?: BisectState; error?: string }>;
  resetBisect(): Promise<{ ok: boolean; error?: string }>;
  getBisectState(): Promise<BisectState>;
  generateChangelog(fromRef: string, toRef?: string): Promise<ChangelogResult | null>;
  exportPatch(commitHash: string, outputPath: string): Promise<{ ok: boolean; error?: string }>;
  applyPatch(patchPath: string): Promise<{ ok: boolean; error?: string }>;
  restartApp?(): Promise<boolean>;
}

export type ApiEvent = 'repo-updated';
