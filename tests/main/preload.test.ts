import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), remove: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mock.expose },
  ipcRenderer: { invoke: mock.invoke, on: mock.on, removeListener: mock.remove, send: mock.send }
}));

// This is the expected public bridge contract, independent of implementation.
// Changes to a route or its argument order must be reviewed as API changes.
const routes = `
getGitHubSignInState github-auth:get 0
startGitHubSignIn github-auth:start 0
cancelGitHubSignIn github-auth:cancel 1
openGitHubSignInPage github-auth:open 1
copyGitHubSignInCode github-auth:copy 1
refreshGitHubAccount github-auth:refresh-account 0
getSparseCheckout git:sparse:get 0
getSparseDirectories git:sparse:directories 2
previewSparseCheckout git:sparse:preview 1
applySparseCheckout git:sparse:apply 1
restoreSparseLayout git:sparse:restore 3
getLfsState git:lfs-state 0
configureLfs git:lfs:configure 1
setLfsTracking git:lfs:track 3
runLfsTransfer git:lfs:transfer 1
getLfsTransfer git:lfs-transfer-state 0
cancelLfsTransfer git:lfs-cancel 1
getBranchStack git:stack:get 0
setStackParent git:stack:parent 3
previewStackRestack git:stack:preview 1
resumeStackRestack git:stack:resume 1
applyStackRestack git:stack:apply 1
discardStackRestack git:stack:discard 1
retargetPullRequest git:stack:retarget 1
getCommitSplit git:split:plan 1
listCommitSplitPreviews git:split:list 0
previewCommitSplit git:split:preview 1
applyCommitSplit git:split:apply 1
discardCommitSplit git:split:discard 1
openPullRequestWorktree git:pr-worktree:create 1
listPinnedRepos dashboard:pins 0
pinRepository dashboard:pin 2
getRepositoryOverview dashboard:overview 2
listRewriteSessions git:rewrite:list 0
compareCommitRanges git:rewrite:compare 1
deleteRewriteSession git:rewrite:delete 1
getResolutionMemory git:rerere:state 0
setResolutionMemory git:rerere:configure 1
getResolutionSuggestion git:rerere:suggestion 1
forgetResolution git:rerere:forget 1
listRestorePoints git:restore-points:list 0
createRestorePoint git:restore-points:create 1
restorePoint git:restore-points:restore 1
deleteRestorePoint git:restore-points:delete 1
getPullReview git:pull-review:get 1
submitPullReview git:pull-review:submit 1
getAppUpdateState app-update:get-state 0
checkForAppUpdates app-update:check 0
downloadAppUpdate app-update:download 0
installAppUpdate app-update:install 0
openAppReleasePage app-update:open-release-page 0
openRepo repo:open-path 1
openRepoDialog repo:open-dialog 0
initRepo repo:init 1
selectDirectory repo:select-directory 1
recentRepos repo:recent 0
removeRecentRepo repo:remove-recent 1
getGitConfig git:config-get 1
setGitConfig git:config-set 1
getStatus git:status 0
getLog git:log 1
getReflog git:reflog 0
createRecoveryBranch git:reflog-recover-branch 2
restoreHeadFromReflog git:reflog-restore-head 1
getBranches git:branches 0
getStashes git:stashes 0
getCommitDetail git:commit-detail 1
getFileDiff git:file-diff 3
getStagedDiff git:staged-diff 0
generateAiCommitMessage ai:generate-commit 1
stageFiles git:stage 1
unstageFiles git:unstage 1
stageAll git:stage-all 0
unstageAll git:unstage-all 0
discardFile git:discard 1
commit git:commit 2
pull git:pull 0
push git:push 0
fetch git:fetch 1
mergeBranch git:merge 1
rebaseBranch git:rebase-branch 1
checkoutBranch git:checkout 1
createBranch git:branch-create 2
deleteBranch git:branch-delete 2
renameBranch git:branch-rename 2
checkoutCommit git:checkout-commit 1
createWorktree git:worktree-create 2
resetBranchTo git:reset-branch 2
editCommitMessage git:edit-commit-message 2
revertCommit git:revert-commit 1
dropCommit git:drop-commit 1
applyPatchCommit git:apply-patch-commit 1
moveCommitDown git:move-commit-down 1
setUpstream git:set-upstream 2
pushSetUpstream git:push-set-upstream 1
stash git:stash 1
stashPop git:stash-pop 1
stashApply git:stash-apply 1
stashDrop git:stash-drop 1
stageHunk git:stage-hunk 2
unstageHunk git:unstage-hunk 2
discardHunk git:discard-hunk 2
stageLines git:stage-lines 3
unstageLines git:unstage-lines 3
discardLines git:discard-lines 3
revertHunk git:revert-hunk 3
blame git:blame 1
getBlame git:get-blame 1
getFileHistory git:get-file-history 1
getConflictFile git:get-conflict-file 1
resolveConflictFile git:resolve-conflict-file 3
getRepoOperationState git:get-operation-state 0
abortOperation git:abort-operation 0
continueOperation git:continue-operation 0
cherryPick git:cherry-pick 1
getCommitsForRebase git:get-commits-for-rebase 1
executeInteractiveRebase git:execute-interactive-rebase 2
getTags git:get-tags 0
createTag git:create-tag 3
deleteTag git:delete-tag 3
pushTag git:push-tag 2
getRemotes git:get-remotes 0
getPullRequestCredentialStatus git:pull-requests:credentials 0
savePullRequestCredential git:pull-requests:save-credential 2
removePullRequestCredential git:pull-requests:remove-credential 1
getPullRequestContext git:pull-requests:context 2
createHostedPullRequest git:pull-requests:create 1
addRemote git:add-remote 2
renameRemote git:rename-remote 2
setRemoteUrl git:set-remote-url 2
removeRemote git:remove-remote 1
pruneRemote git:prune-remote 1
getSubmodules git:get-submodules 0
updateSubmodules git:update-submodules 1
getWorktrees git:get-worktrees 0
removeWorktree git:remove-worktree 2
openTerminal app:open-terminal 0
runCommand app:run-command 1
openInEditor app:open-in-editor 1
getGitFlowConfig git:flow:get-config 0
initGitFlow git:flow:init 1
startGitFlowBranch git:flow:start 1
finishGitFlowBranch git:flow:finish 1
compareCommits git:compare-commits 2
getComparisonFileDiff git:compare-file-diff 3
getStashDetail git:stash-detail 1
getStashFileDiff git:stash-file-diff 2
applyStashFile git:stash-apply-file 2
simulateMerge git:simulate-merge 1
explainChanges ai:explain-changes 1
startBisect git:bisect-start 2
stepBisect git:bisect-step 1
resetBisect git:bisect-reset 0
getBisectState git:bisect-state 0
generateChangelog git:generate-changelog 2
exportPatch git:export-patch 2
applyPatch git:apply-patch 1
minimizeWindow window:minimize 0
maximizeWindow window:maximize 0
closeWindow window:close 0
isWindowMaximized window:is-maximized 0
restartApp app:restart 0
`.trim().split('\n').map(line => {
  const [name, channel, count] = line.split(' ');
  return { name, channel, count: Number(count) };
});
const subscriptions = [
  ['onGitHubSignInState', 'github-auth:state'], ['onLfsTransfer', 'git:lfs-progress'],
  ['onAppUpdateState', 'app-update:state'], ['onMaximizeChange', 'window:maximize-change']
];
let api: Record<string, (...args: any[]) => any>;
beforeAll(async () => {
  await import('../../src/preload/index');
  expect(mock.expose).toHaveBeenCalledTimes(1);
  expect(mock.expose.mock.calls[0][0]).toBe('api');
  api = mock.expose.mock.calls[0][1];
});
beforeEach(() => { mock.invoke.mockReset().mockResolvedValue({ ok: true }); mock.on.mockClear(); mock.remove.mockClear(); mock.send.mockClear(); });

describe('typed preload routes', () => {
  it.each(routes)('$name sends arguments unchanged to $channel', async ({ name, channel, count }) => {
    const args = [{ value: 'one' }, ['two'], { value: 'three' }].slice(0, count);
    await expect(api[name](...args)).resolves.toEqual({ ok: true });
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith(channel, ...args);
  });
  it('does not expose unreviewed bridge methods or raw IPC', () => {
    expect(Object.keys(api).sort()).toEqual([...routes.map(route => route.name), ...subscriptions.map(([name]) => name), 'setActiveRepo'].sort());
  });
  it.each(subscriptions)('%s forwards payloads and unsubscribes exactly its listener', (name, channel) => {
    const callback = vi.fn(), dispose = api[name](callback);
    const [registeredChannel, listener] = mock.on.mock.calls[0];
    expect(registeredChannel).toBe(channel);
    const payload = { status: 'available' }; listener({ sender: 'private' }, payload);
    expect(callback).toHaveBeenCalledExactlyOnceWith(payload);
    dispose(); expect(mock.remove).toHaveBeenCalledExactlyOnceWith(channel, listener);
  });
  it('sends active repository changes without invoking a request', () => {
    api.setActiveRepo('/temporary/repository'); api.setActiveRepo(null);
    expect(mock.send.mock.calls).toEqual([['repo:set-active', '/temporary/repository'], ['repo:set-active', null]]);
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each([null, undefined, false, 0, 'text', { ok: false }])('preserves normal IPC results %#', async result => {
    mock.invoke.mockResolvedValue(result);
    await expect(api.getStatus()).resolves.toEqual(result);
  });
  it('unwraps main-process error envelopes and preserves native IPC rejections', async () => {
    mock.invoke.mockResolvedValue({ __error: 'No repository open' });
    await expect(api.getStatus()).rejects.toThrow('No repository open');
    mock.invoke.mockRejectedValue(new Error('IPC disconnected'));
    await expect(api.getStatus()).rejects.toThrow('IPC disconnected');
  });
});
