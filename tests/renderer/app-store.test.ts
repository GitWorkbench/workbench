// @vitest-environment jsdom
import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ api: Object.fromEntries(['recentRepos', 'openRepo', 'setActiveRepo', 'openRepoDialog', 'getStatus', 'getLog', 'getBranches', 'getStashes', 'getRepoOperationState', 'getTags', 'getRemotes', 'getSubmodules', 'getWorktrees', 'getCommitDetail', 'compareCommits', 'getStashDetail', 'getComparisonFileDiff', 'getStashFileDiff', 'getFileDiff', 'abortOperation', 'continueOperation', 'cherryPick'].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api, unwrap: async (promise: Promise<any>) => {
  const result = await promise;
  if (result && typeof result === 'object' && '__error' in result) throw new Error(String(result.__error));
  return result;
} }));
let useApp: typeof import('../../src/renderer/store').useApp;
const status = { staged: [{ path: 'staged.ts', status: 'modified' }], unstaged: [{ path: 'unstaged.ts', status: 'added' }], conflicted: [], ahead: 0, behind: 0, current: 'main' };
const log = { commits: [], hasMore: true, branches: [] };
const fileDiff = { path: 'file.ts', hunks: [], insertions: 2, deletions: 1 };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); localStorage.clear();
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.recentRepos.mockResolvedValue([]);
  mocks.api.openRepo.mockImplementation(async path => ({ ok: true, repo: { path, name: path.split('/').pop() || path } }));
  mocks.api.setActiveRepo.mockReturnValue(undefined);
  mocks.api.getStatus.mockResolvedValue(status); mocks.api.getLog.mockResolvedValue(log);
  mocks.api.getBranches.mockResolvedValue({ local: [], remote: [] }); mocks.api.getStashes.mockResolvedValue([]);
  mocks.api.getRepoOperationState.mockResolvedValue({ inMerge: false, inRebase: false, inCherryPick: false, conflictedFiles: [] });
  for (const name of ['getTags', 'getRemotes', 'getSubmodules', 'getWorktrees']) mocks.api[name].mockResolvedValue([]);
  mocks.api.getCommitDetail.mockImplementation(async hash => ({ hash, message: hash, files: [] }));
  mocks.api.compareCommits.mockResolvedValue({ baseHash: 'a', targetHash: 'b', files: [] });
  mocks.api.getStashDetail.mockImplementation(async index => ({ index, files: [] }));
  for (const name of ['getComparisonFileDiff', 'getStashFileDiff', 'getFileDiff']) mocks.api[name].mockResolvedValue(fileDiff);
  mocks.api.abortOperation.mockResolvedValue({ ok: true }); mocks.api.continueOperation.mockResolvedValue({ ok: true }); mocks.api.cherryPick.mockResolvedValue({ ok: true });
  useApp = (await import('../../src/renderer/store')).useApp;
});
const state = () => useApp.getState();

describe('repository opening and tab lifecycle', () => {
  it('opens a persistent Playground tab, leaves it available across navigation, and closes only when its work is settled', async () => {
    useApp.setState({ usageGuideOpen: true, commandPaletteOpen: true }); state().openPlayground();
    expect(state()).toMatchObject({ playgroundOpen: true, playgroundTabOpen: true, usageGuideOpen: false, commandPaletteOpen: false });
    state().openHome(); expect(state()).toMatchObject({ playgroundOpen: false, playgroundTabOpen: true, homeOpen: true });
    state().openPlayground(); useApp.setState({ playgroundLocked: true }); state().closePlayground(); expect(state().playgroundTabOpen).toBe(true);
    useApp.setState({ playgroundLocked: false }); state().closePlayground(); expect(state()).toMatchObject({ playgroundOpen: false, playgroundTabOpen: false });
    state().openPlayground(); await state().openRepo('/repo'); expect(state()).toMatchObject({ playgroundOpen: false, playgroundTabOpen: true });
    state().openPlayground(); state().setActiveTab('/repo'); expect(state().playgroundOpen).toBe(false);
    state().openPlayground(); state().setActiveTab('/other'); expect(state().playgroundOpen).toBe(false);
    await vi.runAllTimersAsync();
  });
  it('loads recent repositories silently at startup and survives an unavailable recent list', async () => {
    mocks.api.recentRepos.mockResolvedValue(['/work/project']);
    await state().init();
    expect(state()).toMatchObject({ recentRepos: ['/work/project'], activeTab: '/work/project', tabs: [{ path: '/work/project', name: 'project' }] });
    await vi.runAllTimersAsync();
    expect(state().toasts).toEqual([]);
    mocks.api.recentRepos.mockRejectedValue(new Error('Missing recent list'));
    await state().init(); expect(state().recentRepos).toEqual([]);
  });
  it('opens a repository, resets old views and delays the success toast until opening animations end', async () => {
    useApp.setState({ selectedCommit: 'old', homeOpen: true, openDiff: { commitHash: 'old', filePath: 'x' } });
    await state().openRepo('/work/project');
    expect(state()).toMatchObject({ activeTab: '/work/project', homeOpen: false, selectedCommit: null, openDiff: null, isOpeningRepo: true, openingRepoName: 'project', status });
    expect(mocks.api.setActiveRepo).toHaveBeenCalledWith('/work/project');
    await vi.advanceTimersByTimeAsync(599); expect(state().isOpeningRepo).toBe(true); expect(state().toasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); expect(state().isOpeningRepo).toBe(false);
    await vi.advanceTimersByTimeAsync(399); expect(state().toasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); expect(state().toast?.text).toBe('Opened project');
    await state().openRepo('/work/project'); expect(state().tabs).toHaveLength(1);
  });
  it.each([{ ok: false, error: 'Not a Git repository' }, { ok: false }, new Error('Permission denied'), { __error: 'Invalid directory' }])('reports open failures after the overlay closes', async result => {
    if (result instanceof Error) mocks.api.openRepo.mockRejectedValue(result); else mocks.api.openRepo.mockResolvedValue(result);
    await state().openRepo('/work/missing'); await vi.advanceTimersByTimeAsync(1000);
    expect(state().isOpeningRepo).toBe(false); expect(state().activeTab).toBeNull();
    expect(state().toast?.kind).toBe('error');
    expect(state().toast?.text).toBe(result instanceof Error ? result.message : '__error' in result ? result.__error : result.error || 'Failed to open repository');
  });
  it('ignores superseded open responses, errors and delayed notifications', async () => {
    const first = deferred<any>(); mocks.api.openRepo.mockImplementationOnce(() => first.promise);
    const pending = state().openRepo('/first');
    await state().openRepo('/second');
    first.resolve({ ok: true, repo: { path: '/first', name: 'first' } }); await pending;
    expect(state().activeTab).toBe('/second');
    await vi.advanceTimersByTimeAsync(600);
    await state().openRepo('/third');
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().toasts.map(t => t.text)).toEqual(['Opened third']);
    const failed = deferred<any>(); mocks.api.openRepo.mockImplementationOnce(() => failed.promise);
    const failedOpen = state().openRepo('/failed'); await state().openRepo('/latest', { notifyOnSuccess: false });
    failed.reject(new Error('Stale error')); await failedOpen;
    await vi.advanceTimersByTimeAsync(1000);
    expect(state().toasts.some(t => t.text.includes('Stale'))).toBe(false);
  });
  it('handles long opening operations without adding the minimum delay again', async () => {
    const pending = deferred<any>(); mocks.api.openRepo.mockImplementationOnce(() => pending.promise);
    const opening = state().openRepo('/slow/');
    await vi.advanceTimersByTimeAsync(1200);
    pending.resolve({ ok: true, repo: { path: '/slow', name: 'Slow' } }); await opening;
    await vi.advanceTimersByTimeAsync(0); expect(state().isOpeningRepo).toBe(false);
  });
  it.each([
    [{ ok: false, error: 'canceled by user' }, false], [{ ok: false }, true], [{ ok: false, error: 'Picker failure' }, true],
    [new Error('canceled'), false], [new Error('Picker failed'), true]
  ])('handles directory-picker outcome %s', async (result, notify) => {
    if (result instanceof Error) mocks.api.openRepoDialog.mockRejectedValue(result); else mocks.api.openRepoDialog.mockResolvedValue(result);
    await state().openRepoDialog(); expect(state().toasts.length > 0).toBe(notify);
  });
  it('opens a selected directory through the normal repository flow', async () => {
    mocks.api.openRepoDialog.mockResolvedValue({ ok: true, repo: { path: '/work/picked', name: 'picked' } });
    await state().openRepoDialog(); expect(mocks.api.openRepo).toHaveBeenCalledWith('/work/picked');
  });
  it('closes inactive and active tabs, reselects the last tab and clears views after closing the final tab', async () => {
    await state().openRepo('/a'); await state().openRepo('/b'); await state().openRepo('/c');
    state().closeTab('/a'); expect(state().tabs.map(t => t.path)).toEqual(['/b', '/c']); expect(state().activeTab).toBe('/c');
    state().closeTab('/c'); expect(state().activeTab).toBe('/b'); expect(mocks.api.setActiveRepo).toHaveBeenLastCalledWith('/b');
    state().closeTab('/b'); expect(state()).toMatchObject({ activeTab: null, tabs: [], status: null, log: null, remotes: [] });
    expect(mocks.api.setActiveRepo).toHaveBeenLastCalledWith(null);
  });
  it('switches active tabs, returns Home and does not refresh an unchanged tab', async () => {
    useApp.setState({ activeTab: '/a', homeOpen: true, selectedCommit: 'old' });
    state().setActiveTab('/a'); expect(state().homeOpen).toBe(false); expect(mocks.api.setActiveRepo).not.toHaveBeenCalled();
    state().setActiveTab('/b'); expect(state().selectedCommit).toBeNull(); expect(mocks.api.setActiveRepo).toHaveBeenCalledWith('/b');
    state().openHome(); expect(state().homeOpen).toBe(true);
    state().setActiveTab(null as any); expect(state().homeOpen).toBe(true);
    state().setActiveTab(null as any); expect(state().homeOpen).toBe(true);
  });
});

describe('repository refresh and pagination', () => {
  it('does not refresh without a repository and tolerates optional metadata failures', async () => {
    await state().refresh(); expect(mocks.api.getStatus).not.toHaveBeenCalled();
    useApp.setState({ activeTab: '/repo', commitLimit: 0 });
    for (const name of ['getRepoOperationState', 'getTags', 'getRemotes', 'getSubmodules', 'getWorktrees']) mocks.api[name].mockRejectedValue(new Error('Optional unavailable'));
    await state().refresh();
    expect(mocks.api.getLog).toHaveBeenCalledWith(300);
    expect(state()).toMatchObject({ status, log, operationState: null, tags: [], remotes: [], submodules: [], worktrees: [] });
  });
  it('reports required refresh failures but ignores responses from older repository epochs', async () => {
    useApp.setState({ activeTab: '/a' }); mocks.api.getStatus.mockRejectedValueOnce(new Error('Git unavailable'));
    await state().refresh(); expect(state().toast?.text).toBe('Git unavailable');
    const stale = deferred<any>(); mocks.api.getStatus.mockImplementationOnce(() => stale.promise);
    const refresh = state().refresh(); state().setActiveTab('/b'); stale.resolve({ stale: true }); await refresh;
    expect(state().status).not.toEqual({ stale: true });
    const failure = deferred<any>(); mocks.api.getStatus.mockImplementationOnce(() => failure.promise);
    const old = state().refresh(); state().setActiveTab('/c'); failure.reject(new Error('Stale refresh')); await old;
    expect(state().toasts.some(t => t.text === 'Stale refresh')).toBe(false);
  });
  it('loads300 more commits at a time and blocks duplicate or exhausted requests', async () => {
    await state().loadMoreCommits(); expect(mocks.api.getLog).not.toHaveBeenCalled();
    useApp.setState({ activeTab: '/repo', log: null }); await state().loadMoreCommits();
    useApp.setState({ log: { ...log, hasMore: false } as any }); await state().loadMoreCommits();
    useApp.setState({ log: log as any, isLoadingMoreCommits: true }); await state().loadMoreCommits();
    expect(mocks.api.getLog).not.toHaveBeenCalled();
    useApp.setState({ isLoadingMoreCommits: false }); await state().loadMoreCommits();
    expect(mocks.api.getLog).toHaveBeenCalledWith(600); expect(state()).toMatchObject({ commitLimit: 600, isLoadingMoreCommits: false });
    mocks.api.getLog.mockRejectedValueOnce(new Error('Unable to load history'));
    await state().loadMoreCommits(); expect(state().isLoadingMoreCommits).toBe(false); expect(state().toast?.text).toMatch(/Failed to load more commits/);
  });
  it.each(['resolve', 'reject'])('ignores a stale pagination %s after switching repository', async outcome => {
    useApp.setState({ activeTab: '/a', log: log as any });
    const pending = deferred<any>(); mocks.api.getLog.mockImplementationOnce(() => pending.promise);
    const loading = state().loadMoreCommits(); state().setActiveTab('/b');
    if (outcome === 'resolve') pending.resolve({ stale: true }); else pending.reject(new Error('Stale log'));
    await loading; expect(state().commitLimit).toBe(300); expect(state().toasts).toEqual([]);
  });
});

describe('commit, comparison and stash selection', () => {
  it('clears selection and constructs WIP details from staged/unstaged files without a request', async () => {
    await state().selectCommit(null); expect(state().detailLoading).toBe(false);
    const { WIP_HASH } = await import('../../src/renderer/store');
    await state().selectCommit(WIP_HASH); expect(state().commitDetail?.files).toEqual([]);
    useApp.setState({ status: status as any }); await state().selectCommit(WIP_HASH);
    expect(state().commitDetail).toMatchObject({ hash: WIP_HASH, shortHash: 'WIP', message: 'Uncommitted changes', files: [{ path: 'staged.ts', status: 'modified' }, { path: 'unstaged.ts', status: 'added' }] });
    expect(mocks.api.getCommitDetail).not.toHaveBeenCalled();
  });
  it('loads selected details and reports empty or rejected responses', async () => {
    await state().selectCommit('a'); expect(state().commitDetail?.hash).toBe('a');
    mocks.api.getCommitDetail.mockResolvedValueOnce(null); await state().selectCommit('b'); expect(state().toast?.text).toBe('Failed to load commit details');
    mocks.api.getCommitDetail.mockRejectedValueOnce(new Error('Details unavailable')); await state().selectCommit('c'); expect(state().toast?.text).toBe('Error: Details unavailable');
    expect(state().detailLoading).toBe(false);
  });
  it('loads and clears a comparison and reports missing comparison responses', async () => {
    await state().setCompareCommits(['a', 'b']); expect(state().comparisonResult).toMatchObject({ baseHash: 'a' }); expect(state().selectedCommit).toBeNull();
    await state().setCompareCommits(null); expect(state().comparisonResult).toBeNull();
    mocks.api.compareCommits.mockResolvedValueOnce(null); await state().setCompareCommits(['a', 'c']); expect(state().toast?.text).toContain('Unable to load comparison');
  });
  it('loads and clears stash inspection including index0 and reports failures', async () => {
    await state().inspectStash(0); expect(state().stashDetail).toMatchObject({ index: 0 });
    await state().inspectStash(null); expect(state().selectedStashIndex).toBeNull();
    await state().inspectStash(undefined as any); expect(state().detailLoading).toBe(false);
    mocks.api.getStashDetail.mockRejectedValueOnce(new Error('Stash unavailable')); await state().inspectStash(1); expect(state().toast?.text).toContain('Failed to inspect stash');
  });
  it.each(['selectCommit', 'setCompareCommits', 'inspectStash'] as const)('ignores superseded %s responses and errors', async action => {
    const apiMethod = action === 'selectCommit' ? 'getCommitDetail' : action === 'setCompareCommits' ? 'compareCommits' : 'getStashDetail';
    for (const outcome of ['resolve', 'reject']) {
      const pending = deferred<any>(); mocks.api[apiMethod].mockImplementationOnce(() => pending.promise);
      const request = (state()[action] as any)(action === 'selectCommit' ? 'old' : action === 'setCompareCommits' ? ['old', 'new'] : 1);
      await state().selectCommit(null);
      if (outcome === 'resolve') pending.resolve({ stale: true }); else pending.reject(new Error('Stale detail'));
      await request;
      expect(state().commitDetail).toBeNull(); expect(state().comparisonResult).toBeNull(); expect(state().stashDetail).toBeNull();
    }
    expect(state().toasts).toEqual([]);
  });
});

describe('diff loading', () => {
  const variants = [
    { commitHash: 'commit', filePath: 'file.ts', compareCommits: ['a', 'b'] as [string, string] },
    { commitHash: null, filePath: 'file.ts', stashIndex: 0 },
    { commitHash: 'commit', filePath: 'file.ts', staged: true, worktree: false },
    { commitHash: null, filePath: 'file.ts' }
  ];
  it.each(variants)('loads and reloads diff variant %s', async diff => {
    await state().openFileDiff(diff);
    expect(state()).toMatchObject({ openDiff: diff, fileDiff, diffLoading: false, diffMaximized: true });
    await state().reloadCurrentDiff();
    if (diff.compareCommits) expect(mocks.api.getComparisonFileDiff).toHaveBeenCalledWith('a', 'b', 'file.ts');
    else if (diff.stashIndex !== undefined) expect(mocks.api.getStashFileDiff).toHaveBeenCalledWith(0, 'file.ts');
    else expect(mocks.api.getFileDiff).toHaveBeenCalledWith(diff.commitHash ?? '', 'file.ts', { staged: diff.staged, worktree: diff.worktree ?? diff.commitHash === null });
    state().closeDiff(); expect(state()).toMatchObject({ openDiff: null, fileDiff: null, diffLoading: false, diffMaximized: true });
    await state().reloadCurrentDiff();
  });
  it('creates an empty diff for absent patches and reports load/reload failures appropriately', async () => {
    mocks.api.getFileDiff.mockResolvedValue(null);
    const diff = { commitHash: null, filePath: 'empty' };
    await state().openFileDiff(diff); expect(state().fileDiff).toEqual({ path: 'empty', hunks: [], insertions: 0, deletions: 0 });
    await state().reloadCurrentDiff(); expect(state().diffLoading).toBe(false);
    mocks.api.getFileDiff.mockRejectedValue(new Error('Cannot read patch'));
    await state().openFileDiff(diff); expect(state().toast?.text).toBe('Cannot read patch');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await state().reloadCurrentDiff(); expect(error).toHaveBeenCalledWith('Failed to reload diff:', expect.any(Error));
  });
  it.each(['openFileDiff', 'reloadCurrentDiff'] as const)('ignores stale %s responses and errors after closing a diff', async action => {
    for (const outcome of ['resolve', 'reject']) {
      const pending = deferred<any>(); mocks.api.getFileDiff.mockImplementationOnce(() => pending.promise);
      if (action === 'reloadCurrentDiff') useApp.setState({ openDiff: { commitHash: 'a', filePath: 'a' } });
      const request = action === 'openFileDiff' ? state().openFileDiff({ commitHash: 'a', filePath: 'a' }) : state().reloadCurrentDiff();
      state().closeDiff();
      if (outcome === 'resolve') pending.resolve(fileDiff); else pending.reject(new Error('Stale diff'));
      if (action === 'reloadCurrentDiff') vi.spyOn(console, 'error').mockImplementation(() => {});
      await request; expect(state().fileDiff).toBeNull(); expect(state().toasts).toEqual([]);
    }
  });
});

describe('workspace settings and modal actions', () => {
  it('opens/closes every modal, activates the guide without obstructing launchers and stores selected targets', () => {
    const pairs = [
      ['openAddRemoteModal', 'closeAddRemoteModal', 'addRemoteModalOpen'], ['openCreateRepoModal', 'closeCreateRepoModal', 'createRepoModalOpen'],
      ['openCommandPalette', 'closeCommandPalette', 'commandPaletteOpen'], ['openUsageGuide', 'closeUsageGuide', 'usageGuideOpen'],
      ['openGitFlowModal', 'closeGitFlowModal', 'gitFlowModalOpen'], ['openBisectModal', 'closeBisectModal', 'bisectModalOpen'],
      ['openReflogModal', 'closeReflogModal', 'reflogModalOpen'], ['openPullRequestsModal', 'closePullRequestsModal', 'pullRequestsModalOpen'],
      ['openChangelogModal', 'closeChangelogModal', 'changelogModalOpen'], ['openWorktreesModal', 'closeWorktreesModal', 'worktreesModalOpen']
    ];
    for (const [open, close, field] of pairs) { (state() as any)[open](); expect((state() as any)[field]).toBe(true); (state() as any)[close](); expect((state() as any)[field]).toBe(false); }
    state().openConflictResolver('file'); expect(state().conflictedFileToResolve).toBe('file'); state().closeConflictResolver(); expect(state().conflictedFileToResolve).toBeNull();
    state().openRebaseModal('base'); expect(state().rebaseModalBaseCommit).toBe('base'); state().closeRebaseModal(); expect(state().rebaseModalBaseCommit).toBeNull();
    state().openCreateTagModal(); expect(state().tagModalCommit).toBe('HEAD'); state().openCreateTagModal('commit'); expect(state().tagModalCommit).toBe('commit'); state().closeCreateTagModal(); expect(state().tagModalCommit).toBeNull();
    state().openSimulateMerge('feature'); expect(state().simulateMergeBranch).toBe('feature'); state().closeSimulateMerge(); expect(state().simulateMergeBranch).toBeNull();
    for (const [method, field] of [['toggleCommandPalette', 'commandPaletteOpen'], ['toggleTerminalDrawer', 'terminalDrawerOpen'], ['toggleShortcutsModal', 'shortcutsModalOpen'], ['toggleSidebar', 'sidebarVisible'], ['toggleDiffMaximized', 'diffMaximized']]) {
      const before = (state() as any)[field]; (state() as any)[method](); expect((state() as any)[field]).toBe(!before); (state() as any)[method](); expect((state() as any)[field]).toBe(before);
    }
  });
  it('clamps panel sizes, persists diff mode and updates filters/tabs', () => {
    state().setDiffHeight(-1); expect(state().diffHeight).toBe(120); state().setDiffHeight(9999); expect(state().diffHeight).toBe(window.innerHeight - 150);
    state().setSidebarWidth(1); expect(state().sidebarWidth).toBe(52); state().setSidebarWidth(9999); expect(state().sidebarWidth).toBe(480);
    state().setTerminalDrawerHeight(1); expect(state().terminalDrawerHeight).toBe(120); state().setTerminalDrawerHeight(9999); expect(state().terminalDrawerHeight).toBe(600);
    state().setDiffViewMode('split'); expect(localStorage.getItem('git-workbench:diffViewMode')).toBe('split');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); }); state().setDiffViewMode('unified'); expect(state().diffViewMode).toBe('unified');
    state().setDiffActiveTab('blame'); state().setFilter('message'); state().setFilterAuthor('Alice'); state().setFilterDateRange('week'); state().setFilterFilePath('src');
    expect(state()).toMatchObject({ diffActiveTab: 'blame', filter: 'message', filterAuthor: 'Alice', filterDateRange: 'week', filterFilePath: 'src' });
  });
  it('tracks milestone notices and ignores a timeout from an older milestone', () => {
    state().celebrateMilestone('rebase');
    const first = state().milestoneCelebration;
    expect(first).toMatchObject({ kind: 'rebase' });
    state().celebrateMilestone('conflicts-resolved');
    const latest = state().milestoneCelebration;
    expect(latest).toMatchObject({ kind: 'conflicts-resolved' });
    state().clearMilestoneCelebration(first.id);
    expect(state().milestoneCelebration).toEqual(latest);
    state().clearMilestoneCelebration(latest.id);
    expect(state().milestoneCelebration).toBeNull();
  });
  it('uses a bounded diff size when window geometry is unavailable', () => {
    const browserWindow = window;
    vi.stubGlobal('window', undefined);
    try { state().setDiffHeight(1000); expect(state().diffHeight).toBe(800); }
    finally { vi.stubGlobal('window', browserWindow); }
  });
  it('limits notifications to five, supports sticky errors and dismisses after their duration', async () => {
    for (let index = 0; index < 7; index++) state().notify('info', `item ${index}`, index === 6 ? 'Last' : '', -1);
    expect(state().toasts).toHaveLength(5); expect(state().toast).toMatchObject({ text: 'item 6', title: 'Last' });
    const last = state().toast!.id; state().dismissToast(last); expect(state().toast?.text).toBe('item 5');
    state().clearToasts(); expect(state()).toMatchObject({ toasts: [], toast: null });
    state().notify('success', 'Done'); await vi.advanceTimersByTimeAsync(4000); expect(state().toasts).toEqual([]);
    state().notify('error', 'Sticky', undefined, 0); await vi.advanceTimersByTimeAsync(9999); expect(state().toast?.text).toBe('Sticky');
  });
});

describe('Git operation wrappers', () => {
  it('refreshes successful operations, opens rewrite comparisons and reports clear operation failures', async () => {
    useApp.setState({ activeTab: '/repo' });
    expect(await state().runAndRefresh(async () => ({ ok: true, rewriteId: 'rewrite-1' }), 'Rebased')).toBe(true);
    expect(state()).toMatchObject({ rangeComparisonOpen: true, rangeComparisonId: 'rewrite-1' }); expect(state().toast?.text).toBe('Rebased');
    expect(await state().runAndRefresh(async () => ({ ok: false, error: 'Conflicted' }))).toBe(false); expect(state().toast?.text).toBe('Conflicted');
    expect(await state().runAndRefresh(async () => ({ ok: false }))).toBe(false); expect(state().toast?.text).toBe('The Git operation did not complete.');
    expect(await state().runAndRefresh(async () => undefined)).toBe(true);
  });
  it('does not open stale rewrite comparisons after repository changes or refresh on stale operation failure', async () => {
    useApp.setState({ activeTab: '/a' });
    const task = deferred<any>(); const operation = state().runAndRefresh(() => task.promise);
    useApp.setState({ activeTab: '/b' }); task.resolve({ ok: true, rewriteId: 'old' }); await operation;
    expect(state().rangeComparisonOpen).toBe(false);
    const failed = deferred<any>(); const pending = state().runAndRefresh(() => failed.promise);
    useApp.setState({ activeTab: '/c' }); mocks.api.getStatus.mockClear(); failed.reject(new Error('Operation failed')); await pending;
    expect(mocks.api.getStatus).not.toHaveBeenCalled();
  });
  it('aborts and continues active operations and clears the conflict editor', async () => {
    useApp.setState({ conflictedFileToResolve: 'file' }); await state().abortRepoOperation();
    expect(mocks.api.abortOperation).toHaveBeenCalledOnce(); expect(state().conflictedFileToResolve).toBeNull();
    useApp.setState({ conflictedFileToResolve: 'file' }); await state().continueRepoOperation();
    expect(mocks.api.continueOperation).toHaveBeenCalledOnce(); expect(state().conflictedFileToResolve).toBeNull();
  });
  it.each([{ ok: true }, { ok: false, error: 'Rejected cherry-pick' }, { ok: false }, { ok: false, hasConflicts: true }])('handles cherry-pick result %s', async result => {
    mocks.api.cherryPick.mockResolvedValue(result);
    mocks.api.getRepoOperationState.mockResolvedValue({ conflictedFiles: ['file.ts'] });
    await state().cherryPickCommit('hash'); expect(mocks.api.cherryPick).toHaveBeenCalledWith('hash');
    if (result.ok) expect(state().toast?.text).toBe('Commit cherry-picked');
    else if (result.hasConflicts) { expect(state().conflictedFileToResolve).toBe('file.ts'); expect(state().toast?.text).toMatch(/Please resolve conflicts/); }
    else expect(state().toast?.text).toBe(result.error || 'Cherry-pick failed');
  });
});
