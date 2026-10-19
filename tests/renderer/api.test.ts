// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../src/shared/ai', () => ({ generateCommitMessage: mock.generate }));
let client: typeof import('../../src/renderer/lib/api');
beforeEach(async () => {
  vi.resetModules(); delete (window as any).api;
  mock.generate.mockReset().mockImplementation(async value => ({ ok: true, message: value.diff }));
  client = await import('../../src/renderer/lib/api');
});
afterEach(() => { delete (window as any).api; vi.unstubAllGlobals(); });

describe('native renderer bridge', () => {
  it('binds native methods to their owning bridge and preserves non-function data', async () => {
    const native = { label: 'native', getStatus: vi.fn(function (this: any) { return this.label; }), generateAiCommitMessage: vi.fn().mockResolvedValue({ ok: true, message: 'native message' }) };
    (window as any).api = native; vi.resetModules(); const { api } = await import('../../src/renderer/lib/api');
    expect(api.getStatus()).toBe('native'); expect((api as any).label).toBe('native');
    expect(await api.generateAiCommitMessage()).toEqual({ ok: true, message: 'native message' });
    await expect(api.getBranches()).rejects.toThrow('Desktop API getBranches is unavailable');
  });
  it.each([null, undefined, false, 0, 'value', { ok: false }])('unwrap preserves normal values %#', async value => {
    await expect(client.unwrap(Promise.resolve(value))).resolves.toEqual(value);
  });
  it('unwrap raises explicit envelopes and preserves native rejections', async () => {
    await expect(client.unwrap(Promise.resolve({ __error: 'Permission denied' }))).rejects.toThrow('Permission denied');
    await expect(client.unwrap(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  });
});

describe('browser preview API', () => {
  it('exposes stable realistic repository data without requiring Electron', async () => {
    const { api } = client;
    expect(await api.openRepo('/preview/repository')).toMatchObject({ ok: true, repo: { name: 'repository' } });
    expect(await api.openRepo('/')).toMatchObject({ repo: { name: '/' } });
    expect(await api.initRepo({ path: '/preview/project' })).toMatchObject({ repo: { name: 'project' } });
    expect(await api.initRepo({ path: '/' })).toMatchObject({ repo: { name: '/' } });
    expect(await api.openRepoDialog()).toMatchObject({ ok: true }); expect(await api.selectDirectory()).toMatchObject({ ok: true });
    expect(await api.recentRepos()).toContain('/var/www/git-gui'); expect(await api.getGitConfig()).toHaveProperty('name');
    expect(await api.getStatus()).toMatchObject({ currentBranch: 'main', ahead: 1 });
    expect((await api.getLog()).commits).toHaveLength(4); expect((await api.getLog(1)).commits).toHaveLength(1);
    expect((await api.getBranches()).local[0].isCurrent).toBe(true); expect(await api.getStashes()).toHaveLength(1);
    expect(await api.getTags()).toHaveLength(2); expect(await api.getRemotes()).toHaveLength(2);
    expect(await api.getSubmodules()).toHaveLength(1); expect(await api.getWorktrees()).toHaveLength(2);
    expect(await api.getCommitDetail('abcdef1234')).toMatchObject({ hash: 'abcdef1234', shortHash: 'abcdef1' });
    expect(await api.getFileDiff('HEAD', 'file.txt')).toMatchObject({ oldPath: 'file.txt', newPath: 'file.txt', isBinary: false });
    expect(await api.getStagedDiff()).toMatchObject({ ok: true, diff: expect.stringContaining('diff --git') });
    expect(await api.getBlame('file.txt')).toHaveLength(2); expect(await api.blame('file.txt')).toContain('blame');
    expect(await api.getFileHistory('file.txt')).toHaveLength(1);
    expect(await api.getConflictFile('file.txt')).toMatchObject({ filePath: 'file.txt', kind: 'text', totalConflicts: 0 });
    expect(await api.getRepoOperationState()).toMatchObject({ inMerge: false, inRebase: false, conflictedFiles: [] });
    expect(await api.getGitFlowConfig()).toMatchObject({ initialized: true, developBranch: 'develop' });
    expect(await api.getReflog()).toHaveLength(4);
    expect(await api.createRecoveryBranch('abcdef123')).toMatchObject({ ok: true, branchName: expect.stringContaining('recovered/abcdef1') });
    expect(await api.createRecoveryBranch('abcdef123', 'custom')).toMatchObject({ branchName: 'custom' });
    expect(await api.restoreHeadFromReflog('abc')).toMatchObject({ ok: true });
    expect(await api.compareCommits('base123456', 'target123456')).toMatchObject({ baseHash: 'base123456', targetHash: 'target123456' });
    expect(await api.getComparisonFileDiff('base', 'target', 'file.txt')).toMatchObject({ filePath: 'file.txt' });
    expect(await api.getStashDetail(0)).toMatchObject({ index: 0 }); expect(await api.getStashFileDiff(0, 'file.txt')).toMatchObject({ filePath: 'file.txt' });
    expect(await api.simulateMerge('branch')).toMatchObject({ clean: true, conflicts: [] });
    expect(await api.startBisect('bad', 'good')).toMatchObject({ ok: true, state: { active: true } });
    expect(await api.stepBisect('good')).toMatchObject({ ok: true }); expect(await api.getBisectState()).toEqual({ active: false });
    expect(await api.generateChangelog('v1')).toMatchObject({ toRef: 'HEAD' }); expect(await api.generateChangelog('v1', 'v2')).toMatchObject({ toRef: 'v2' });
    expect((api as any).unknownMethod).toBeUndefined();
  });
  it('simulates request credentials per provider and creates visible requests', async () => {
    const { api } = client;
    expect((await api.getPullRequestContext()).credentialConfigured).toBe(false);
    for (const provider of ['github', 'gitlab', 'bitbucket'] as const) {
      await api.savePullRequestCredential(provider, { token: 'preview-only' });
      expect((await api.getPullRequestCredentialStatus())[provider]).toBe(true);
      expect(await api.getPullRequestContext('custom', provider)).toMatchObject({ provider, remoteName: 'custom', defaultBranch: 'main' });
      await api.removePullRequestCredential(provider); expect((await api.getPullRequestCredentialStatus())[provider]).toBe(false);
    }
    await api.savePullRequestCredential('github', { token: 'preview' });
    const created = await api.createHostedPullRequest({ remoteName: 'origin', title: 'Preview request', description: '', targetBranch: 'main' });
    expect(created).toMatchObject({ ok: true, pullRequest: { title: 'Preview request' } });
    expect((await api.getPullRequestContext()).pullRequests[0].title).toBe('Preview request');
  });
  it.each(['getAppUpdateState', 'checkForAppUpdates', 'downloadAppUpdate'])('%s explicitly reports unsupported browser updates', async name => {
    expect(await (client.api as any)[name]()).toMatchObject({ status: 'unsupported', canInstallInApp: false });
  });
  it('does not fake desktop-only advanced features as successful', async () => {
    const desktopOnly = ['getPullReview', 'submitPullReview', 'startGitHubSignIn', 'cancelGitHubSignIn', 'openGitHubSignInPage', 'copyGitHubSignInCode', 'refreshGitHubAccount',
      'getSparseCheckout', 'getSparseDirectories', 'previewSparseCheckout', 'applySparseCheckout', 'restoreSparseLayout', 'configureLfs', 'setLfsTracking', 'runLfsTransfer', 'cancelLfsTransfer',
      'setStackParent', 'previewStackRestack', 'resumeStackRestack', 'applyStackRestack', 'discardStackRestack', 'retargetPullRequest', 'getCommitSplit', 'previewCommitSplit', 'applyCommitSplit', 'discardCommitSplit',
      'openPullRequestWorktree', 'pinRepository', 'getRepositoryOverview', 'compareCommitRanges', 'deleteRewriteSession', 'setResolutionMemory', 'forgetResolution', 'createRestorePoint', 'restorePoint', 'deleteRestorePoint'];
    for (const name of desktopOnly) await expect((client.api as any)[name]()).rejects.toThrow(/desktop app/);
    expect(await client.api.getGitHubSignInState()).toMatchObject({ connected: false, configured: false });
    expect(await client.api.getLfsState()).toMatchObject({ installed: false }); expect(await client.api.getLfsTransfer()).toBeNull();
    expect(await client.api.getBranchStack()).toEqual({ links: [], branches: [], sessions: [] });
    expect(await client.api.getResolutionMemory()).toMatchObject({ enabled: false }); expect(await client.api.getResolutionSuggestion('file.txt')).toMatchObject({ content: null });
    for (const name of ['listPinnedRepos', 'listRewriteSessions', 'listRestorePoints', 'listCommitSplitPreviews']) expect(await (client.api as any)[name]()).toEqual([]);
    expect(await client.api.explainChanges({ diffText: '+line' })).toMatchObject({ ok: false });
  });
  it('keeps preview mutations deterministic and event subscriptions disposable', async () => {
    const simpleActions = ['removeRecentRepo', 'setGitConfig', 'createTag', 'deleteTag', 'pushTag', 'addRemote', 'renameRemote', 'setRemoteUrl', 'removeRemote', 'pruneRemote', 'updateSubmodules', 'removeWorktree',
      'stageHunk', 'unstageHunk', 'discardHunk', 'stageLines', 'unstageLines', 'discardLines', 'revertHunk', 'commit', 'pull', 'push', 'fetch', 'mergeBranch', 'rebaseBranch', 'checkoutBranch', 'createBranch', 'deleteBranch', 'renameBranch',
      'checkoutCommit', 'createWorktree', 'resetBranchTo', 'editCommitMessage', 'revertCommit', 'dropCommit', 'applyPatchCommit', 'moveCommitDown', 'setUpstream', 'pushSetUpstream', 'stash', 'stashPop', 'stashApply', 'stashDrop',
      'resolveConflictFile', 'abortOperation', 'continueOperation', 'cherryPick', 'executeInteractiveRebase', 'openTerminal', 'openInEditor', 'initGitFlow', 'finishGitFlowBranch', 'applyStashFile', 'resetBisect', 'exportPatch', 'applyPatch'];
    for (const name of simpleActions) expect(await (client.api as any)[name]()).toMatchObject({ ok: true });
    for (const name of ['stageFiles', 'unstageFiles', 'stageAll', 'unstageAll', 'discardFile']) expect(await (client.api as any)[name]()).toEqual({});
    for (const name of ['onAppUpdateState', 'onGitHubSignInState', 'onLfsTransfer']) expect((client.api as any)[name](() => {})()).toBeUndefined();
    expect(client.api.setActiveRepo(null)).toBeUndefined();
    expect(await client.api.getCommitsForRebase('base')).toEqual(expect.any(Array));
    expect(await client.api.startGitFlowBranch({ type: 'feature', name: 'preview' })).toMatchObject({ branchName: 'feature/preview' });
    expect(await client.api.installAppUpdate()).toBe(false); expect(await client.api.openAppReleasePage()).toBeUndefined();
    for (const name of ['minimizeWindow', 'maximizeWindow', 'closeWindow', 'restartApp']) expect(await (client.api as any)[name]()).toBe(true);
    expect(await client.api.isWindowMaximized()).toBe(false);
    expect(await client.api.runCommand('git status')).toMatchObject({ stdout: expect.stringContaining('main') });
    expect(await client.api.runCommand('git log')).toMatchObject({ stdout: expect.stringContaining('feat:') });
    expect(await client.api.runCommand('echo preview')).toMatchObject({ stdout: expect.stringContaining('echo preview') });
  });
});

describe('client-side AI generation fallback', () => {
  it('uses a late native generator and falls back from rejected or unsuccessful responses', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ok: true, message: 'native' }).mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('offline'));
    (window as any).api = { generateAiCommitMessage: generate, getStagedDiff: vi.fn().mockResolvedValue({ ok: true, diff: 'staged patch' }) };
    expect(await client.api.generateAiCommitMessage()).toEqual({ ok: true, message: 'native' });
    expect(await client.api.generateAiCommitMessage()).toEqual({ ok: true, message: 'staged patch' });
    vi.spyOn(console, 'warn').mockImplementation(() => {}); await client.api.generateAiCommitMessage(); expect(mock.generate).toHaveBeenLastCalledWith({ diff: 'staged patch' });
  });
  it('reconstructs staged files with old/new/context markers and limits the file count', async () => {
    const getFileDiff = vi.fn().mockResolvedValue({ hunks: [{ lines: [{ kind: 'add', content: 'new' }, { kind: 'del', content: 'old' }, { kind: 'context', content: 'keep' }] }] });
    (window as any).api = { getStagedDiff: vi.fn().mockRejectedValue(new Error('unavailable')), getStatus: vi.fn().mockResolvedValue({ staged: Array.from({ length: 12 }, (_, i) => ({ path: `file${i}.txt`, status: 'modified' })) }), getFileDiff };
    await client.api.generateAiCommitMessage({ provider: 'local' }); expect(getFileDiff).toHaveBeenCalledTimes(10);
    expect(mock.generate.mock.calls[0][0]).toMatchObject({ provider: 'local', diff: expect.stringContaining('+new\n-old\n keep') });
    expect(mock.generate.mock.calls[0][0].diff).not.toContain('file10.txt');
  });
  it.each([undefined, null, { hunks: [] }])('uses file summaries when detailed patches are missing %#', async value => {
    (window as any).api = { getStagedDiff: vi.fn().mockResolvedValue({ ok: false }), getStatus: vi.fn().mockResolvedValue({ staged: [{ path: 'new.txt', status: 'added' }] }), getFileDiff: vi.fn().mockResolvedValue(value) };
    await client.api.generateAiCommitMessage(); expect(mock.generate.mock.calls[0][0].diff).toContain('+ [added] new.txt');
  });
  it('survives failed patch/status retrieval and uses an explicit preview fallback', async () => {
    (window as any).api = { getStatus: vi.fn().mockResolvedValue({ staged: [{ path: 'new.txt', status: 'added' }] }), getFileDiff: vi.fn().mockRejectedValue(new Error('missing')) };
    await client.api.generateAiCommitMessage(); expect(mock.generate.mock.calls[0][0].diff).toContain('new.txt');
    (window as any).api = { getStatus: vi.fn().mockRejectedValue(new Error('offline')) };
    await client.api.generateAiCommitMessage(); expect(mock.generate.mock.calls[1][0].diff).toContain('update staged files');
    for (const status of [null, {}, { staged: [] }]) {
      (window as any).api = { getStatus: vi.fn().mockResolvedValue(status) }; await client.api.generateAiCommitMessage();
      expect(mock.generate.mock.calls.at(-1)![0].diff).toContain('update staged files');
    }
    (window as any).api = { getStatus: vi.fn().mockResolvedValue({ staged: [{ path: 'summary.txt', status: 'modified' }] }) };
    await client.api.generateAiCommitMessage(); expect(mock.generate.mock.calls.at(-1)![0].diff).toContain('summary.txt');
  });
});
