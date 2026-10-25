import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mock = vi.hoisted(() => ({ handlers: new Map<string, (...a: any[]) => any>(), functions: {} as Record<string, any>, git: {} as Record<string, any>, repo: '' as string | null, win: null as any, exec: vi.fn(), spawn: vi.fn(), send: vi.fn(), open: vi.fn(), external: vi.fn(), reveal: vi.fn() }));
vi.mock('electron', () => ({ app: { once: vi.fn(), getPath: () => mock.repo, relaunch: vi.fn(), exit: vi.fn() }, ipcMain: { handle: (channel: string, fn: any) => mock.handlers.set(channel, fn) }, dialog: { showOpenDialog: vi.fn() }, shell: { openPath: mock.open, openExternal: mock.external, showItemInFolder: mock.reveal } }));
vi.mock('node:child_process', () => ({ exec: mock.exec, spawn: mock.spawn }));
vi.mock('simple-git', () => ({ default: () => mock.git }));
const modules: Record<string, string> = {
  'core': 'isValidRepo errorMessage withGit',
  'log': 'getLog repoDisplayName',
  'status-diff': 'getStatus unstageFiles discardFile',
  'commit-detail': 'getCommitDetail getFileDiff getCommitDiffText compareCommits getComparisonFileDiff',
  'branch-stash': 'getBranches getStashes checkoutBranch createBranch deleteBranch renameBranch stash stashPop stashApply stashDrop revertHunk mergeBranch getStashDetail getStashFileDiff applyStashFile',
  'ai-history': 'recomposeCommitMessage explainBranchChanges applyAiReword validateAiReword',
  'history': 'checkoutCommit createBranchAt createWorktree resetBranchTo editCommitMessage revertCommit dropCommit applyPatchCommit moveCommitDown setUpstream pushSetUpstream deleteBranchEx',
  'hunk-actions': 'stageHunk unstageHunk discardHunk stageLines unstageLines discardLines getBlameLines getFileHistory exportPatch applyPatchFile',
  'conflicts-rebase': 'getRepoOperationState getConflictFile resolveConflictFile abortOperation continueOperation cherryPick getCommitsForRebase executeInteractiveRebase simulateMerge',
  'objects-navigation': 'getTags createTag deleteTag pushTag getRemotes addRemote renameRemote setRemoteUrl removeRemote pruneRemote getSubmodules updateSubmodules getWorktrees removeWorktree',
  'gitflow': 'getGitFlowConfig initGitFlow startGitFlowBranch finishGitFlowBranch',
  'bisect': 'startBisect stepBisect resetBisect getBisectState',
  'changelog': 'generateChangelog', 'reflog': 'getReflog createRecoveryBranch restoreHeadFromReflog',
  'pull-requests': 'getPullRequestContext createHostedPullRequest testGitLabConnection testGiteaConnection', 'pull-request-review': 'getPullReview submitPullReview',
  'repository-dashboard': 'pinnedRepositories pinRepository repositoryOverview', 'pull-request-worktree': 'openPullRequestWorktree',
  'commit-split': 'getCommitSplit previewCommitSplit applyCommitSplit discardCommitSplit listCommitSplitPreviews',
  'branch-stacks': 'getBranchStack setStackParent previewStackRestack resumeStackRestack applyStackRestack discardStackRestack retargetPullRequest',
  'lfs-manager': 'getLfsState configureLfs setLfsTracking runLfsTransfer getLfsTransfer cancelLfsTransfer stopLfsTransfers',
  'sparse-checkout': 'getSparseCheckout getSparseDirectories previewSparseCheckout applySparseCheckout restoreSparseLayout',
  'github-auth': 'registerGitHubSignIn getGitHubSignInState startGitHubSignIn cancelGitHubSignIn openGitHubSignInPage copyGitHubSignInCode refreshGitHubAccount githubCredentialsChanged stopGitHubSignIn',
  'restore-points': 'createRestorePoint listRestorePoints restorePoint deleteRestorePoint',
  'resolution-memory': 'resolutionMemoryState setResolutionMemory captureResolutionMemory',
  'rewrite-comparison': 'beginRewrite finishRewrite listRewriteSessions compareCommitRanges deleteRewriteSession',
  'provider-credentials': 'getPullRequestCredential getPullRequestCredentialStatus removePullRequestCredential savePullRequestCredential'
};
const rewriteActions = new Set(['git:edit-commit-message', 'git:rebase-branch', 'git:execute-interactive-rebase', 'git:drop-commit', 'git:move-commit-down']);
let registerIpc: typeof import('../../src/main/ipc').registerIpc, root: string;
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', originalPlatform); vi.unstubAllEnvs(); });
const call = (channel: string, ...args: any[]) => mock.handlers.get(channel)!({}, ...args);
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-ipc-routing-'));
  vi.doMock('node:os', () => ({ default: { ...os, homedir: () => root } }));
  for (const [module, names] of Object.entries(modules)) {
    const exports = Object.fromEntries(names.split(' ').map(name => [name, mock.functions[name] = vi.fn()]));
    vi.doMock(`../../src/main/git/${module}`, () => module === 'rewrite-comparison' ? { ...exports, rewriteActions } : exports);
  }
  vi.doMock('../../src/main/ai', () => ({ generateCommitMessage: mock.functions.generateCommitMessage = vi.fn() }));
  vi.doMock('../../src/shared/ai', () => ({ explainCodeChanges: mock.functions.explainCodeChanges = vi.fn() }));
  ({ registerIpc } = await import('../../src/main/ipc'));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  for (const fn of Object.values(mock.functions)) fn.mockReset().mockResolvedValue('response');
  mock.functions.isValidRepo.mockReturnValue(true); mock.functions.errorMessage.mockImplementation((e: any) => e instanceof Error ? e.message : String(e)); mock.functions.withGit.mockImplementation(async (_repo: string, fn: (g: any) => any) => fn(mock.git));
  mock.functions.finishRewrite.mockResolvedValue(null); mock.functions.captureResolutionMemory.mockResolvedValue(new Map()); mock.functions.getStatus.mockResolvedValue({ staged: [], unstaged: [] }); mock.functions.getConflictFile.mockResolvedValue({ kind: 'text', snapshot: 'snapshot-1' }); mock.functions.resolutionMemoryState.mockResolvedValue({ enabled: true });
  mock.repo = root; mock.win = { isDestroyed: () => false, webContents: { send: mock.send } }; mock.handlers.clear(); mock.send.mockReset(); mock.open.mockReset(); mock.reveal.mockReset(); mock.exec.mockReset(); mock.spawn.mockReset().mockReturnValue({ unref: vi.fn() });
  for (const method of ['init', 'diff', 'commit', 'add', 'pull', 'push', 'getRemotes', 'status', 'fetch', 'rebase', 'raw', 'log', 'getConfig', 'addConfig']) mock.git[method] = vi.fn().mockResolvedValue('git-result'); mock.git.getRemotes.mockResolvedValue([{ name: 'origin' }]); mock.git.status.mockResolvedValue({ current: 'main' }); mock.git.getConfig.mockResolvedValue({ value: 'value' });
  registerIpc(() => mock.win, () => mock.repo);
});
// Expected route contract: main process must forward the captured repository
// and user arguments unchanged to the intended feature boundary.
const direct = `
git:status getStatus 0
git:rewrite:list listRewriteSessions 0
git:rewrite:compare compareCommitRanges 1
git:rerere:state resolutionMemoryState 0
git:rerere:configure setResolutionMemory 1
git:restore-points:list listRestorePoints 0
git:restore-points:create createRestorePoint 1
git:restore-points:restore restorePoint 1
git:branches getBranches 0
git:stashes getStashes 0
git:commit-detail getCommitDetail 1
git:file-diff getFileDiff 3
git:reflog getReflog 0
git:get-blame getBlameLines 1
git:get-file-history getFileHistory 1
git:get-conflict-file getConflictFile 1
git:get-operation-state getRepoOperationState 0
git:cherry-pick cherryPick 1
git:get-commits-for-rebase getCommitsForRebase 1
git:execute-interactive-rebase executeInteractiveRebase 2
git:get-tags getTags 0
git:split:plan getCommitSplit 1
git:stack:get getBranchStack 0
git:lfs-state getLfsState 0
git:sparse:get getSparseCheckout 0
git:sparse:directories getSparseDirectories 2
git:sparse:preview previewSparseCheckout 1
git:sparse:apply applySparseCheckout 1
git:sparse:restore restoreSparseLayout 3
git:lfs-transfer-state getLfsTransfer 0
git:lfs-cancel cancelLfsTransfer 1
git:stack:parent setStackParent 3
git:stack:preview previewStackRestack 1
git:stack:resume resumeStackRestack 1
git:stack:apply applyStackRestack 1
git:stack:discard discardStackRestack 1
git:split:list listCommitSplitPreviews 0
git:split:preview previewCommitSplit 1
git:split:apply applyCommitSplit 1
git:split:discard discardCommitSplit 1
git:get-remotes getRemotes 0
git:get-submodules getSubmodules 0
git:get-worktrees getWorktrees 0
git:flow:get-config getGitFlowConfig 0
git:flow:init initGitFlow 1
git:flow:start startGitFlowBranch 1
git:flow:finish finishGitFlowBranch 1
git:compare-commits compareCommits 2
git:compare-file-diff getComparisonFileDiff 3
git:stash-detail getStashDetail 1
git:stash-file-diff getStashFileDiff 2
git:simulate-merge simulateMerge 1
git:bisect-start startBisect 2
git:bisect-step stepBisect 1
git:bisect-reset resetBisect 0
git:bisect-state getBisectState 0
git:generate-changelog generateChangelog 2
`.trim().split('\n').map(line => { const [channel, fn, count] = line.split(' '); return { channel, fn, args: Array.from({ length: Number(count) }, (_, i) => `arg-${i}`) }; });
const mutations = `
git:rewrite:delete deleteRewriteSession 1
git:restore-points:delete deleteRestorePoint 1
git:merge mergeBranch 1
git:checkout checkoutBranch 1
git:checkout-commit checkoutCommit 1
git:reset-branch resetBranchTo 2
git:edit-commit-message editCommitMessage 2
git:revert-commit revertCommit 1
git:drop-commit dropCommit 1
git:apply-patch-commit applyPatchCommit 1
git:move-commit-down moveCommitDown 1
git:set-upstream setUpstream 2
git:push-set-upstream pushSetUpstream 1
git:branch-rename renameBranch 2
git:stash stash 1
git:stash-pop stashPop 1
git:stash-apply stashApply 1
git:stash-drop stashDrop 1
git:stage-hunk stageHunk 2
git:unstage-hunk unstageHunk 2
git:discard-hunk discardHunk 2
git:stage-lines stageLines 3
git:unstage-lines unstageLines 3
git:discard-lines discardLines 3
git:resolve-conflict-file resolveConflictFile 3
git:abort-operation abortOperation 0
git:continue-operation continueOperation 0
git:create-tag createTag 3
git:delete-tag deleteTag 3
git:push-tag pushTag 2
git:add-remote addRemote 2
git:rename-remote renameRemote 2
git:set-remote-url setRemoteUrl 2
git:remove-remote removeRemote 1
git:prune-remote pruneRemote 1
git:update-submodules updateSubmodules 1
git:remove-worktree removeWorktree 2
git:stash-apply-file applyStashFile 2
git:export-patch exportPatch 2
git:apply-patch applyPatchFile 1
`.trim().split('\n').map(line => { const [channel, fn, count] = line.split(' '); return { channel, fn, args: Array.from({ length: Number(count) }, (_, i) => `arg-${i}`) }; });
describe('main process feature routing', () => {
  it.each(direct)('$channel forwards its repository and argument order', async ({ channel, fn, args }) => { const result = await call(channel, ...args); expect(result).toEqual(fn === 'getStatus' ? { staged: [], unstaged: [] } : fn === 'getConflictFile' ? { kind: 'text', snapshot: 'snapshot-1' } : fn === 'resolutionMemoryState' ? { enabled: true } : 'response'); expect(mock.functions[fn]).toHaveBeenCalledWith(root, ...args); });
  it.each(mutations)('$channel awaits mutation before acknowledging success', async ({ channel, fn, args }) => { expect(await call(channel, ...args)).toEqual({ ok: true }); expect(mock.functions[fn]).toHaveBeenCalledWith(root, ...args); });
  it.each([['git:pull-review:get', 'getPullReview'], ['git:pull-review:submit', 'submitPullReview'], ['git:pr-worktree:create', 'openPullRequestWorktree'], ['git:stack:retarget', 'retargetPullRequest']])('%s supplies a credential lookup at the trusted boundary', async (channel, fn) => { const input = { provider: 'github', requestId: '12' }; expect(await call(channel, input)).toBe('response'); expect(mock.functions[fn]).toHaveBeenCalledWith(root, input, mock.functions.getPullRequestCredential); });
  it.each([['github-auth:get', 'getGitHubSignInState', []], ['github-auth:start', 'startGitHubSignIn', []], ['github-auth:cancel', 'cancelGitHubSignIn', ['id']], ['github-auth:open', 'openGitHubSignInPage', ['id']], ['github-auth:copy', 'copyGitHubSignInCode', ['id']], ['github-auth:refresh-account', 'refreshGitHubAccount', []]] as const)('%s forwards sign-in commands without requiring an open repository', async (channel, fn, args) => { mock.repo = null; expect(await call(channel, ...args)).toBe('response'); expect(mock.functions[fn]).toHaveBeenCalledWith(...args); });
  it('forwards progress only to live windows', async () => {
    const auth = mock.functions.registerGitHubSignIn.mock.calls[0][0]; const authState = { phase: 'connected' }; auth(authState); expect(mock.send).toHaveBeenCalledWith('github-auth:state', authState);
    mock.functions.runLfsTransfer.mockImplementation(async (_repo: string, _input: any, emit: any) => { emit({ phase: 'running' }); return 'transfer'; }); expect(await call('git:lfs:transfer', { kind: 'fetch' })).toBe('transfer'); expect(mock.send).toHaveBeenCalledWith('git:lfs-progress', { phase: 'running' });
    mock.send.mockClear(); mock.win.isDestroyed = () => true; auth(authState); await call('git:lfs:transfer', {}); mock.win = null; auth(authState); await call('git:lfs:transfer', {}); expect(mock.send).not.toHaveBeenCalled();
  });
  it('normalizes LFS boolean options and routes branch/worktree creation', async () => {
    await call('git:lfs:configure', 0); expect(mock.functions.configureLfs).toHaveBeenCalledWith(root, false); await call('git:lfs:track', '*.psd', 1); expect(mock.functions.setLfsTracking).toHaveBeenCalledWith(root, '*.psd', true, false);
    await call('git:branch-create', 'new'); expect(mock.functions.createBranch).toHaveBeenCalledWith(root, 'new'); await call('git:branch-create', 'at', 'hash'); expect(mock.functions.createBranchAt).toHaveBeenCalledWith(root, 'at', 'hash');
    await call('git:branch-delete', 'old', { remote: true }); expect(mock.functions.deleteBranchEx).toHaveBeenCalledWith(root, 'old', { local: true, remote: true }); await call('git:worktree-create', 'hash', '/worktree'); expect(mock.functions.createWorktree).toHaveBeenCalledWith(root, '/worktree', 'hash');
  });
  it('captures status for log limits and still loads history when status fails', async () => { await call('git:log'); expect(mock.functions.getLog).toHaveBeenCalledWith(root, { staged: [], unstaged: [] }, 300); mock.functions.getStatus.mockRejectedValue(new Error('status failed')); await call('git:log', 50); expect(mock.functions.getLog).toHaveBeenCalledWith(root, null, 50); });
  it('returns recovery metadata and obtains commit patches before reversing hunks', async () => { mock.functions.createRecoveryBranch.mockResolvedValue({ branchName: 'recovered' }); mock.functions.restoreHeadFromReflog.mockResolvedValue({ backupBranch: 'backup' }); expect(await call('git:reflog-recover-branch', 'hash', 'saved')).toEqual({ ok: true, branchName: 'recovered' }); expect(await call('git:reflog-restore-head', 'hash')).toEqual({ ok: true, backupBranch: 'backup' }); await call('git:revert-hunk', 'hash', 'file', 2); expect(mock.functions.getCommitDiffText).toHaveBeenCalledWith(root, 'hash', 'file'); expect(mock.functions.revertHunk).toHaveBeenCalledWith(root, 'response', 2); });
  it.each(['github', 'gitlab', 'bitbucket', 'gitea'])('manages %s credentials and only invalidates GitHub sign-in for GitHub', async provider => {
    const credential = { token: 'fake-test-token' }; expect(await call('git:pull-requests:save-credential', provider, credential)).toEqual({ ok: true }); expect(mock.functions.savePullRequestCredential).toHaveBeenCalledWith(provider, credential); expect(await call('git:pull-requests:remove-credential', provider)).toEqual({ ok: true }); expect(mock.functions.removePullRequestCredential).toHaveBeenCalledWith(provider, undefined); expect(mock.functions.cancelGitHubSignIn).toHaveBeenCalledTimes(provider === 'github' ? 2 : 0); expect(mock.functions.githubCredentialsChanged).toHaveBeenCalledTimes(provider === 'github' ? 2 : 0); expect(await call('git:pull-requests:credentials')).toBe('response');
  });
  it('routes provider context and creation and rejects invalid override values', async () => {
    expect(await call('git:pull-requests:context', 'origin', 'gitlab')).toBe('response'); expect(mock.functions.getPullRequestContext).toHaveBeenCalledWith(root, 'origin', 'gitlab', mock.functions.getPullRequestCredential); const params = { remoteName: 'origin', title: 'Title', description: 'Body', targetBranch: 'main' }; expect(await call('git:pull-requests:create', params)).toEqual({ ok: true, pullRequest: 'response' }); expect(mock.functions.createHostedPullRequest).toHaveBeenCalledWith(root, 'origin', 'Title', 'Body', 'main', undefined, mock.functions.getPullRequestCredential);
    expect(await call('git:pull-requests:context', 'origin', 'evil')).toEqual({ __error: 'Choose GitHub, GitLab, Bitbucket, or Gitea.' }); expect(await call('git:pull-requests:create', { ...params, providerOverride: 'evil' })).toHaveProperty('__error');
  });
  it('returns operation errors in the appropriate envelope', async () => { for (const [channel, fn] of [['git:export-patch', 'exportPatch'], ['git:apply-patch', 'applyPatchFile'], ['git:stash-apply-file', 'applyStashFile']]) { mock.functions[fn].mockRejectedValue(new Error('refused')); expect(await call(channel, 'arg')).toEqual({ ok: false, error: 'refused' }); } mock.functions.stageHunk.mockRejectedValue('unknown error'); expect(await call('git:stage-hunk', 'file', 0)).toEqual({ __error: 'unknown error' }); });
});

describe('mutation safety and process boundaries', () => {
  it('falls back to legacy Git initialization and retains an initialized repo if its first commit fails', async () => {
    const directory = path.join(root, 'legacy-init'); mock.git.init.mockRejectedValueOnce(new Error('unknown option b')); mock.git.commit.mockRejectedValueOnce(new Error('identity missing')); expect(await call('repo:init', { path: directory, createReadme: true, initialCommitMessage: ' first commit ' })).toMatchObject({ ok: true }); expect(mock.git.init).toHaveBeenCalledWith(['-b', 'main']); expect(mock.git.init).toHaveBeenCalledWith(); expect(mock.git.commit).toHaveBeenCalledWith('first commit'); expect(fs.readFileSync(path.join(directory, 'README.md'), 'utf8')).toContain('# legacy-init');
  });
  it('reads and writes scoped identity settings and safely handles unavailable configuration', async () => {
    expect(await call('git:config-get')).toEqual({ name: 'value', email: 'value' }); expect(mock.git.getConfig).toHaveBeenCalledWith('user.name', 'global'); mock.git.getConfig.mockResolvedValue({ value: null }); expect(await call('git:config-get', 'local')).toEqual({ name: '', email: '' }); mock.git.getConfig.mockRejectedValue(new Error('config missing')); expect(await call('git:config-get', 'local')).toEqual({ name: '', email: '' }); expect(await call('git:config-set', { email: 'author@example.invalid' })).toEqual({ ok: true }); expect(mock.git.addConfig).toHaveBeenCalledWith('user.email', 'author@example.invalid', false, 'global');
  });
  it('snapshots protected edits and attaches completed rewrite comparisons', async () => { mock.functions.finishRewrite.mockResolvedValue({ id: 'rewrite-1', status: 'completed', oldTip: 'old', newTip: 'new' }); expect(await call('git:edit-commit-message', 'hash', 'message')).toEqual({ ok: true, rewriteId: 'rewrite-1' }); expect(mock.functions.createRestorePoint).toHaveBeenCalledWith(root, 'Before rewriting a commit message: hash'); expect(mock.functions.beginRewrite).toHaveBeenCalledWith(root, 'git:edit-commit-message', ['hash', 'message']); expect(mock.functions.captureResolutionMemory).toHaveBeenCalledTimes(2); });
  it('records failed and aborted rewrites without losing the underlying error', async () => { mock.functions.executeInteractiveRebase.mockResolvedValue({ ok: false }); expect(await call('git:execute-interactive-rebase', 'hash', [])).toEqual({ ok: false }); expect(mock.functions.finishRewrite).toHaveBeenCalledWith(root, { aborted: false, error: 'Operation did not complete.' }); await call('git:abort-operation'); expect(mock.functions.finishRewrite).toHaveBeenCalledWith(root, { aborted: true, error: undefined }); mock.functions.dropCommit.mockRejectedValueOnce(new Error('tip moved')); mock.functions.finishRewrite.mockRejectedValueOnce(new Error('metadata failure')); expect(await call('git:drop-commit', 'hash')).toEqual({ __error: 'tip moved' }); });
  it('keeps successful operations successful when comparison capture fails', async () => { vi.spyOn(console, 'warn').mockImplementation(() => {}); mock.functions.finishRewrite.mockRejectedValue(new Error('comparison unavailable')); expect(await call('git:continue-operation')).toEqual({ ok: true }); expect(console.warn).toHaveBeenCalledWith('Rewrite comparison:', 'comparison unavailable'); });
  it('validates the conflict snapshot before returning a remembered resolution', async () => { mock.functions.captureResolutionMemory.mockResolvedValue(new Map([['file', 'resolved content']])); expect(await call('git:rerere:suggestion', 'file')).toEqual({ enabled: true, content: 'resolved content', snapshot: 'snapshot-1' }); mock.functions.resolutionMemoryState.mockResolvedValue({ enabled: false }); expect(await call('git:rerere:suggestion', 'file')).toEqual({ enabled: false, content: null, snapshot: 'snapshot-1' }); mock.functions.getConflictFile.mockResolvedValueOnce({ snapshot: 'old' }).mockResolvedValueOnce({ snapshot: 'new' }); expect(await call('git:rerere:suggestion', 'file')).toHaveProperty('__error', expect.stringContaining('conflict changed')); expect(await call('git:rerere:forget', 'file')).toEqual({ ok: true }); expect(mock.functions.captureResolutionMemory).toHaveBeenCalledWith(root, 'file'); });
  it('provides staged diffs, staging commands, and explicit commit authors', async () => {
    expect(await call('git:staged-diff')).toEqual({ ok: true, diff: 'git-result' }); expect(mock.git.diff).toHaveBeenCalledWith(['--cached']); for (const [channel, args] of [['git:stage', [['file']]], ['git:unstage', [['file']]], ['git:stage-all', []], ['git:unstage-all', []], ['git:discard', ['file']]] as const) expect(await call(channel, ...args)).toEqual({ staged: [], unstaged: [] }); await call('git:commit', 'message', { name: 'Alice', email: 'alice@example.invalid' }); expect(mock.git.commit).toHaveBeenCalledWith('message', undefined, { '--author': '"Alice <alice@example.invalid>"' }); await call('git:commit', 'plain'); expect(mock.git.commit).toHaveBeenCalledWith('plain'); await call('git:rebase-branch', 'develop'); expect(mock.git.rebase).toHaveBeenCalledWith(['develop']);
  });
  it('falls back from staged to unstaged changes for AI and supports supplied diffs', async () => { mock.git.diff.mockResolvedValueOnce('').mockResolvedValueOnce('working diff'); expect(await call('ai:generate-commit', { tone: 'short' })).toBe('response'); expect(mock.functions.generateCommitMessage).toHaveBeenCalledWith({ tone: 'short', diff: 'working diff' }); await call('ai:generate-commit', { diff: 'supplied' }); expect(mock.functions.generateCommitMessage).toHaveBeenCalledWith({ diff: 'supplied' }); mock.git.diff.mockRejectedValue(new Error('no diff')); await call('ai:generate-commit'); expect(mock.functions.generateCommitMessage).toHaveBeenCalledWith({ diff: '' }); });
  it('explains supplied or loaded patches and reports missing/failed diffs', async () => { expect(await call('ai:explain-changes', {})).toEqual({ ok: false, error: 'No diff content found to explain' }); await call('ai:explain-changes', { diffText: 'diff', config: { model: 'model' } }); expect(mock.functions.explainCodeChanges).toHaveBeenCalledWith('diff', { model: 'model' }); await call('ai:explain-changes', { commitHash: 'hash' }); expect(mock.functions.getCommitDiffText).toHaveBeenCalledWith(root, 'hash'); mock.functions.getCommitDiffText.mockRejectedValue(new Error('missing commit')); expect(await call('ai:explain-changes', { commitHash: 'missing' })).toEqual({ ok: false, error: 'missing commit' }); });
  it('pulls without upstream using the current branch and explains unsafe local changes', async () => {
    mock.git.pull.mockRejectedValueOnce(new Error('no tracking information')); expect(await call('git:pull')).toEqual({ ok: true }); expect(mock.git.pull).toHaveBeenCalledWith('origin', 'main'); mock.git.pull.mockRejectedValueOnce(new Error('local changes to the following files')); expect(await call('git:pull')).toHaveProperty('__error', expect.stringContaining('stash or commit')); mock.git.status.mockResolvedValue({ current: null }); mock.git.pull.mockRejectedValueOnce(new Error('no upstream')); expect(await call('git:pull')).toEqual({ __error: 'no upstream' });
  });
  it('pushes with an inferred upstream and refuses missing remotes', async () => { mock.git.push.mockRejectedValueOnce(new Error('no upstream branch')); expect(await call('git:push')).toEqual({ ok: true }); expect(mock.git.push).toHaveBeenCalledWith(['--set-upstream', 'origin', 'main']); mock.git.getRemotes.mockResolvedValue([]); expect(await call('git:push')).toHaveProperty('__error', expect.stringContaining('No remote repository')); mock.git.getRemotes.mockResolvedValue([{}]); mock.git.push.mockRejectedValueOnce(new Error('--set-upstream')); await call('git:push'); expect(mock.git.push).toHaveBeenCalledWith(['--set-upstream', 'origin', 'main']); mock.git.status.mockResolvedValue({ current: null }); mock.git.push.mockRejectedValueOnce(new Error('no upstream branch')); expect(await call('git:push')).toHaveProperty('__error'); });
  it('fetches a selected remote or all configured remotes and ignores only missing-remote errors', async () => { expect(await call('git:fetch', 'upstream')).toEqual({ ok: true }); expect(mock.git.fetch).toHaveBeenCalledWith('upstream'); await call('git:fetch'); expect(mock.git.fetch).toHaveBeenCalledWith(['--all']); mock.git.getRemotes.mockResolvedValue([]); mock.git.fetch.mockClear(); await call('git:fetch'); expect(mock.git.fetch).not.toHaveBeenCalled(); mock.git.fetch.mockRejectedValueOnce(new Error('No remote repository specified')); expect(await call('git:fetch', 'origin')).toEqual({ ok: true }); mock.git.fetch.mockRejectedValueOnce(new Error('offline')); expect(await call('git:fetch', 'origin')).toEqual({ __error: 'offline' }); });
  it('returns bounded command output and numeric exit codes from the process callback', async () => { mock.exec.mockImplementation((_cmd, _opts, done) => done(null, Buffer.from('out'), Buffer.from('err'))); expect(await call('app:run-command', 'git status')).toEqual({ ok: true, stdout: 'out', stderr: 'err', exitCode: 0, error: undefined }); expect(mock.exec).toHaveBeenCalledWith('git status', { cwd: root, maxBuffer: 10 * 1024 * 1024 }, expect.any(Function)); mock.exec.mockImplementation((_cmd, _opts, done) => done(Object.assign(new Error('failed'), { code: 2 }), '', '')); expect(await call('app:run-command', 'bad')).toMatchObject({ ok: false, exitCode: 2, stdout: '', stderr: '', error: 'failed' }); mock.exec.mockImplementation((_cmd, _opts, done) => done(new Error('failed'), null, null)); expect(await call('app:run-command', 'bad')).toHaveProperty('exitCode', 1); });
  it('uses explicit Git blame/history arguments and absolute editor/reveal paths', async () => { await call('git:blame', 'file'); expect(mock.git.raw).toHaveBeenCalledWith(['blame', '--date=short', '--', 'file']); await call('git:file-history', 'file'); expect(mock.git.log).toHaveBeenCalledWith(['--pretty=format:%h%x09%s%x09%an', '--', 'file']); await call('app:open-in-editor', root); expect(mock.open).toHaveBeenCalledWith(root); await call('app:reveal-in-folder', root); expect(mock.reveal).toHaveBeenCalledWith(root); });
  it('handles supported, absent, and failing terminal launchers without running a shell', async () => { Object.defineProperty(process, 'platform', { value: 'linux', configurable: true }); const exists = vi.spyOn(fs, 'existsSync').mockImplementation(p => String(p) === '/usr/local/bin/gnome-terminal'); expect(await call('app:open-terminal')).toEqual({ ok: true }); expect(mock.spawn).toHaveBeenCalledWith('gnome-terminal', ['--working-directory', root], { detached: true, stdio: 'ignore' }); exists.mockReturnValue(false); expect(await call('app:open-terminal')).toEqual({ ok: false, error: 'No supported terminal emulator found' }); exists.mockReturnValue(true); mock.spawn.mockImplementation(() => { throw new Error('launch failed'); }); expect(await call('app:open-terminal')).toEqual({ ok: false, error: 'launch failed' }); });
  it.each(['bash', '/bin/zsh'])('passes the configured shell to the last supported terminal: %s', async shell => { Object.defineProperty(process, 'platform', { value: 'linux', configurable: true }); if (shell === 'bash') vi.stubEnv('SHELL', ''); else vi.stubEnv('SHELL', shell); vi.spyOn(fs, 'existsSync').mockImplementation(p => String(p) === '/usr/bin/xterm'); expect(await call('app:open-terminal')).toEqual({ ok: true }); expect(mock.spawn).toHaveBeenCalledWith('xterm', ['-e', `cd ${JSON.stringify(root)} && exec ${shell}`], { detached: true, stdio: 'ignore' }); });
  it('launches macOS Terminal through open', async () => { Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true }); expect(await call('app:open-terminal')).toEqual({ ok: true }); expect(mock.spawn).toHaveBeenCalledWith('open', ['-a', 'Terminal', root], { detached: true, stdio: 'ignore' }); });
  it('opens a Windows PowerShell console directly in the repository', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(await call('app:open-terminal')).toEqual({ ok: true });
    expect(mock.spawn).toHaveBeenCalledWith('powershell.exe', ['-NoLogo', '-NoExit'], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false });
  });
  it.each(['directory', 'pointer', 'missing', 'denied'])('checks macOS repository access for a %s git marker', async kind => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true }); const marker = path.join(root, '.git'); vi.spyOn(fs, 'statSync').mockImplementation(p => { if (String(p) === marker) { if (kind === 'missing') throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return { isDirectory: () => kind === 'directory' } as fs.Stats; } return { isDirectory: () => true } as fs.Stats; }); const access = vi.spyOn(fs, 'accessSync').mockImplementation(() => { if (kind === 'denied') throw Object.assign(new Error('denied'), { code: 'EACCES' }); }); const result = await call('repo:open-path', root); if (kind === 'denied') expect(result).toMatchObject({ ok: false, error: expect.stringContaining('macOS denied') }); else { expect(result).toMatchObject({ ok: true, repo: { path: root } }); expect(access).toHaveBeenCalledWith(marker, fs.constants.R_OK | (kind === 'directory' ? fs.constants.X_OK : 0)); }
  });
});

it('preserves a non-Error rewrite failure when comparison cleanup also fails', async () => {
  mock.functions.editCommitMessage.mockRejectedValue('rewrite refused');
  mock.functions.finishRewrite.mockRejectedValue(new Error('comparison unavailable'));
  expect(await call('git:edit-commit-message', 'hash', 'message')).toEqual({ __error: 'rewrite refused' });
  expect(mock.functions.finishRewrite).toHaveBeenCalledWith(root, { error: 'rewrite refused' });
});

it('creates an empty repository without implicit scaffolding or an initial commit', async () => {
  const destination = path.join(root, 'empty-init');
  expect(await call('repo:init', { path: destination, createReadme: false })).toMatchObject({ ok: true });
  expect(mock.git.add).not.toHaveBeenCalled();
  expect(mock.git.commit).not.toHaveBeenCalled();
});

it('keeps initialization available if the optional scaffold commit fails', async () => {
  mock.git.commit.mockRejectedValue(new Error('identity missing'));
  expect(await call('repo:init', { path: path.join(root, 'scaffold-failure'), createReadme: true, initialCommitMessage: ' custom first commit ' })).toMatchObject({ ok: true });
  expect(mock.git.commit).toHaveBeenCalledWith('custom first commit');
});

it('reports empty global Git identity values as empty fields', async () => {
  mock.git.getConfig.mockResolvedValue({ value: null });
  expect(await call('git:config-get', 'global')).toEqual({ name: '', email: '' });
});

it('generates commit messages from the worktree when the staged diff is empty', async () => {
  mock.git.diff.mockResolvedValueOnce('   ').mockResolvedValueOnce('working patch');
  await call('ai:generate-commit');
  expect(mock.functions.generateCommitMessage).toHaveBeenCalledWith({ diff: 'working patch' });
});

it.each(['git:pull', 'git:push'])('does not invent an upstream branch for detached HEAD during %s', async channel => {
  mock.git.status.mockResolvedValue({ current: null });
  mock.git[channel === 'git:pull' ? 'pull' : 'push'].mockRejectedValue(new Error('no upstream branch'));
  expect(await call(channel)).toEqual({ __error: 'no upstream branch' });
  expect(mock.git[channel === 'git:pull' ? 'pull' : 'push']).toHaveBeenCalledExactlyOnceWith();
});

it('explains macOS EPERM access denials without starting Git operations', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  vi.spyOn(fs, 'accessSync').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
  expect(await call('repo:open-path', root)).toMatchObject({ ok: false, error: expect.stringContaining('macOS denied') });
});

it('shares a canonical write queue across aliases while other repositories keep progressing', async () => {
  const other = path.join(root, 'independent'); fs.mkdirSync(other, { recursive: true });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  mock.git.add.mockImplementation(async (paths: string[]) => { if (paths[0] === 'blocked') await blocked; });
  const first = call('git:stage', ['blocked']);
  await vi.waitFor(() => expect(mock.git.add).toHaveBeenCalledWith(['blocked']));
  mock.repo = `${root}${path.sep}.`;
  const alias = call('git:stage', ['alias']);
  mock.repo = other;
  try {
    expect(await call('git:stage', ['independent'])).toEqual({ staged: [], unstaged: [] });
    expect(mock.git.add).not.toHaveBeenCalledWith(['alias']);
    expect(mock.functions.getStatus).toHaveBeenCalledWith(other);
  } finally { release(); await Promise.all([first, alias]); }
  expect(mock.git.add.mock.calls.map(([paths]) => paths[0])).toEqual(['blocked', 'independent', 'alias']);
  expect(mock.functions.getStatus).toHaveBeenCalledWith(`${root}${path.sep}.`);
});
it('keeps write admission usable after a missing repository and after a failed mutation', async () => {
  mock.repo = path.join(root, 'missing-repository');
  expect(await call('git:stage', ['missing'])).toHaveProperty('__error');
  mock.repo = root;
  mock.git.add.mockRejectedValueOnce(new Error('index locked'));
  const [failed, recovered] = await Promise.all([call('git:stage', ['first']), call('git:stage', ['second'])]);
  expect(failed).toEqual({ __error: 'index locked' });
  expect(recovered).toEqual({ staged: [], unstaged: [] });
  expect(mock.git.add.mock.calls.map(([paths]) => paths[0])).toEqual(['first', 'second']);
});

it('completes pull and push with existing upstreams without fallback commands', async () => {
  expect(await call('git:pull')).toEqual({ ok: true });
  expect(mock.git.pull).toHaveBeenCalledExactlyOnceWith();
  expect(await call('git:push')).toEqual({ ok: true });
  expect(mock.git.push).toHaveBeenCalledExactlyOnceWith();
});
it('creates an initial commit for a gitignore-only scaffold', async () => {
  const directory = path.join(root, 'ignore-only');
  expect(await call('repo:init', { path: directory, gitignoreTemplate: 'node', createReadme: false })).toMatchObject({ ok: true });
  expect(mock.git.add).toHaveBeenCalledWith('.'); expect(mock.git.commit).toHaveBeenCalledWith('Initial commit');
  expect(fs.existsSync(path.join(directory, 'README.md'))).toBe(false);
  expect(fs.readFileSync(path.join(directory, '.gitignore'), 'utf8')).toContain('node_modules');
});


it.each(['gitlab', 'gitea'])('tests a %s connection at the main boundary and refuses saved token mismatches', async provider => {
  const channel = `git:pull-requests:test-${provider}`;
  const test = mock.functions[provider === 'gitlab' ? 'testGitLabConnection' : 'testGiteaConnection'];
  test.mockResolvedValue('alice');
  expect(await call(channel, 'https://code.example/forge/', 'draft-token')).toEqual({ ok: true, username: 'alice' });
  expect(test).toHaveBeenCalledWith('https://code.example/forge', { token: 'draft-token', serverUrl: 'https://code.example/forge' });
  mock.functions.getPullRequestCredential.mockReturnValue({ token: 'saved-token', serverUrl: 'https://code.example/forge' });
  expect(await call(channel, 'https://code.example/forge')).toEqual({ ok: true, username: 'alice' });
  expect(mock.functions.getPullRequestCredential).toHaveBeenCalledWith(provider, 'https://code.example/forge/');
  mock.functions.getPullRequestCredential.mockReturnValue({ token: 'wrong-token', serverUrl: 'https://other.example' });
  expect(await call(channel, 'https://code.example/forge')).toHaveProperty('__error', `Connect this ${provider === 'gitea' ? 'Gitea' : 'GitLab'} server first.`);
  expect(await call(channel, 'http://code.example', 'token')).toHaveProperty('__error', expect.stringContaining('HTTPS'));
  expect(await call(channel, 'https://code.example', 123)).toHaveProperty('__error', expect.stringContaining('valid'));
  expect(test).toHaveBeenCalledTimes(2);
});


it('validates external web links before invoking the native shell', async () => {
  mock.external.mockReset().mockResolvedValue(undefined);
  expect(await call('app:open-external', 'https://example.com/project')).toBeUndefined();
  expect(mock.external).toHaveBeenCalledExactlyOnceWith('https://example.com/project');
  expect(await call('app:open-external', 'file:///secret')).toHaveProperty('__error', expect.stringContaining('HTTP or HTTPS'));
  expect(mock.external).toHaveBeenCalledTimes(1);
});
it('routes generated message application through the protected rewrite handler and forwards only its snapshot', async () => {
  const expected = { head: 'a'.repeat(40), branch: 'main' };
  expect(await call('git:edit-commit-message', 'hash', 'Message', expected)).toEqual({ ok: true });
  expect(mock.functions.applyAiReword).toHaveBeenCalledWith(root, 'hash', 'Message', expected);
  expect(mock.functions.editCommitMessage).not.toHaveBeenCalled();
  expect(mock.functions.createRestorePoint).toHaveBeenCalled();
});
it.each(['gitlab', 'gitea'])('refuses a missing saved %s token at the native boundary', async provider => {
  mock.functions.getPullRequestCredential.mockReturnValue(null);
  expect(await call(`git:pull-requests:test-${provider}`, 'https://code.example')).toHaveProperty('__error', expect.stringContaining('Connect this'));
  const test = mock.functions[provider === 'gitlab' ? 'testGitLabConnection' : 'testGiteaConnection'];
  expect(test).not.toHaveBeenCalled();
});

it('scopes a saved GitLab token without an instance to GitLab.com only', async () => {
  mock.functions.getPullRequestCredential.mockReturnValue({ token: 'cloud-token' });
  mock.functions.testGitLabConnection.mockResolvedValue('alice');
  expect(await call('git:pull-requests:test-gitlab', 'https://gitlab.com')).toEqual({ ok: true, username: 'alice' });
  expect(await call('git:pull-requests:test-gitlab', 'https://code.example')).toHaveProperty('__error', 'Connect this GitLab server first.');
  expect(mock.functions.testGitLabConnection).toHaveBeenCalledOnce();
});
it('rejects saved Gitea tokens without a configured instance', async () => {
  mock.functions.getPullRequestCredential.mockReturnValue({ token: 'unscoped-token' });
  expect(await call('git:pull-requests:test-gitea', 'https://code.example')).toHaveProperty('__error', expect.stringContaining('URL'));
  expect(mock.functions.testGiteaConnection).not.toHaveBeenCalled();
});
