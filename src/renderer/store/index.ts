import { create } from 'zustand';
import { readAppStorage } from '../lib/appStorage';
import {
  BranchInfo,
  CommitDetail,
  FileDiff,
  FileStatusKind,
  GraphResult,
  GitStatus,
  StashInfo,
  DiffViewMode,
  DiffActiveTab,
  RepoOperationState,
  TagInfo,
  RemoteInfo,
  SubmoduleInfo,
  WorktreeInfo,
  ComparisonResult,
  StashDetail,
  MergeSimulationResult,
  BisectState,
  ChangelogResult
} from '../../shared/types';
import { api, unwrap } from '../lib/api';

export type ActivePane = 'workdir' | 'commit' | 'file';

export interface OpenedDiff {
  /** workdir file (staged+unstaged combined) or commit file; null => working directory */
  commitHash: string | null;
  filePath: string;
  worktree?: boolean;
  staged?: boolean;
  status?: FileStatusKind;
  compareCommits?: [string, string];
  stashIndex?: number;
}

export interface ToastItem {
  id: string;
  kind: 'info' | 'error' | 'success' | 'warn';
  title?: string;
  text: string;
  duration?: number;
  timestamp: number;
}

export type MilestoneKind = 'rebase' | 'conflicts-resolved';
export interface MilestoneCelebration { id: number; kind: MilestoneKind }

interface AppState {
  tabs: { path: string; name: string }[];
  activeTab: string | null;
  recentRepos: string[];
  status: GitStatus | null;
  log: GraphResult | null;
  branches: { local: BranchInfo[]; remote: BranchInfo[] };
  tags: TagInfo[];
  remotes: RemoteInfo[];
  submodules: SubmoduleInfo[];
  worktrees: WorktreeInfo[];
  stashes: StashInfo[];
  selectedCommit: string | null;
  commitDetail: CommitDetail | null;
  compareCommits: [string, string] | null;
  comparisonResult: ComparisonResult | null;
  selectedStashIndex: number | null;
  stashDetail: StashDetail | null;
  openDiff: OpenedDiff | null;
  fileDiff: FileDiff | null;
  detailLoading: boolean;
  diffLoading: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
  diffHeight: number;
  diffMaximized: boolean;
  diffViewMode: DiffViewMode;
  diffActiveTab: DiffActiveTab;
  operationState: RepoOperationState | null;
  conflictedFileToResolve: string | null;
  rebaseModalBaseCommit: string | null;
  tagModalCommit: string | null;
  addRemoteModalOpen: boolean;
  createRepoModalOpen: boolean;
  commandPaletteOpen: boolean;
  terminalDrawerOpen: boolean;
  terminalDrawerHeight: number;
  shortcutsModalOpen: boolean;
  usageGuideOpen: boolean;
  playgroundOpen: boolean;
  playgroundTabOpen: boolean;
  playgroundLocked: boolean;
  gitFlowModalOpen: boolean;
  bisectModalOpen: boolean;
  reflogModalOpen: boolean;
  restorePointsOpen: boolean;
  homeOpen: boolean;
  commitSplitOpen: boolean;
  branchStackOpen: boolean;
  lfsManagerOpen: boolean;
  sparseCheckoutOpen: boolean;
  resolutionMemoryOpen: boolean;
  rangeComparisonOpen: boolean;
  rangeComparisonId: string | null;
  pullRequestsModalOpen: boolean;
  pullRequestIntent: import('../../shared/types').PullRequestIntent | null;
  changelogModalOpen: boolean;
  simulateMergeBranch: string | null;
  worktreesModalOpen: boolean;
  toast: ToastItem | null;
  toasts: ToastItem[];
  filter: string;
  filterAuthor: string;
  filterDateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  filterFilePath: string;
  commitLimit: number;
  isLoadingMoreCommits: boolean;
  isOpeningRepo: boolean;
  openingRepoName: string | null;
  milestoneCelebration: MilestoneCelebration | null;
}

interface AppActions {
  init(): Promise<void>;
  openRepo(path: string, options?: { notifyOnSuccess?: boolean }): Promise<void>;
  openRepoDialog(): Promise<void>;
  closeTab(path: string): void;
  setActiveTab(path: string): void;
  openHome(): void;
  openPlayground(): void;
  closePlayground(): void;
  refresh(): Promise<void>;
  loadMoreCommits(): Promise<void>;
  selectCommit(hash: string | null): Promise<void>;
  setCompareCommits(hashes: [string, string] | null): Promise<void>;
  inspectStash(index: number | null): Promise<void>;
  openFileDiff(d: OpenedDiff): Promise<void>;
  closeDiff(): void;
  setDiffHeight(h: number): void;
  toggleDiffMaximized(): void;
  setDiffViewMode(mode: DiffViewMode): void;
  setDiffActiveTab(tab: DiffActiveTab): void;
  reloadCurrentDiff(): Promise<void>;
  openConflictResolver(filePath: string): void;
  closeConflictResolver(): void;
  abortRepoOperation(): Promise<void>;
  continueRepoOperation(): Promise<void>;
  openRebaseModal(baseCommitHash: string): void;
  closeRebaseModal(): void;
  openCreateTagModal(commitHash?: string): void;
  closeCreateTagModal(): void;
  openAddRemoteModal(): void;
  closeAddRemoteModal(): void;
  openCreateRepoModal(): void;
  closeCreateRepoModal(): void;
  openCommandPalette(): void;
  closeCommandPalette(): void;
  toggleCommandPalette(): void;
  toggleTerminalDrawer(): void;
  setTerminalDrawerHeight(h: number): void;
  toggleShortcutsModal(): void;
  openUsageGuide(): void;
  closeUsageGuide(): void;
  openGitFlowModal(): void;
  closeGitFlowModal(): void;
  openBisectModal(): void;
  closeBisectModal(): void;
  openReflogModal(): void;
  closeReflogModal(): void;
  openPullRequestsModal(intent?: import('../../shared/types').PullRequestIntent): void;
  closePullRequestsModal(): void;
  openChangelogModal(): void;
  closeChangelogModal(): void;
  openSimulateMerge(branch: string): void;
  closeSimulateMerge(): void;
  openWorktreesModal(): void;
  closeWorktreesModal(): void;
  cherryPickCommit(hash: string): Promise<void>;
  setFilter(f: string): void;
  setFilterAuthor(a: string): void;
  setFilterDateRange(d: 'all' | 'today' | 'week' | 'month' | 'year'): void;
  setFilterFilePath(p: string): void;
  toggleSidebar(): void;
  setSidebarWidth(w: number): void;
  notify(kind: 'info' | 'error' | 'success' | 'warn', text: string, title?: string, duration?: number): void;
  dismissToast(id: string): void;
  clearToasts(): void;
  celebrateMilestone(kind: MilestoneKind): void;
  clearMilestoneCelebration(id: number): void;
  runAndRefresh(fn: () => Promise<unknown>, successMsg?: string): Promise<boolean>;
}

export type AppStore = AppState & AppActions;

export const WIP_HASH = '0000000-wip';
let milestoneId = 0;

// Invalidate in-flight reads when their selection, repository, or newer request changes.
let repositoryEpoch = 0;
let openingRequest = 0;
let refreshRequest = 0;
let logRequest = 0;
let detailRequest = 0;
let diffRequest = 0;
function resetRepositoryView(cancelOpening = true): Partial<AppState> {
  repositoryEpoch++;
  if (cancelOpening) openingRequest++;
  refreshRequest++;
  logRequest++;
  detailRequest++;
  diffRequest++;
  return {
    selectedCommit: null, commitDetail: null, compareCommits: null, comparisonResult: null,
    selectedStashIndex: null, stashDetail: null, openDiff: null, fileDiff: null,
    status: null, log: null, branches: { local: [], remote: [] }, stashes: [], tags: [],
    remotes: [], submodules: [], worktrees: [], operationState: null,
    detailLoading: false, diffLoading: false, isLoadingMoreCommits: false, commitLimit: 300,
    isOpeningRepo: false, openingRepoName: null,
    conflictedFileToResolve: null, rebaseModalBaseCommit: null, tagModalCommit: null,
    sparseCheckoutOpen: false, lfsManagerOpen: false, branchStackOpen: false, commitSplitOpen: false, bisectModalOpen: false, reflogModalOpen: false, restorePointsOpen: false, resolutionMemoryOpen: false, rangeComparisonOpen: false, rangeComparisonId: null, pullRequestsModalOpen: false, worktreesModalOpen: false, gitFlowModalOpen: false,
    changelogModalOpen: false, simulateMergeBranch: null, addRemoteModalOpen: false, pullRequestIntent: null
  };
}

export const useApp = create<AppStore>((set, get) => ({
  tabs: [],
  activeTab: null,
  recentRepos: [],
  status: null,
  log: null,
  branches: { local: [], remote: [] },
  tags: [],
  remotes: [],
  submodules: [],
  worktrees: [],
  stashes: [],
  selectedCommit: null,
  commitDetail: null,
  compareCommits: null,
  comparisonResult: null,
  selectedStashIndex: null,
  stashDetail: null,
  openDiff: null,
  fileDiff: null,
  detailLoading: false,
  diffLoading: false,
  sidebarVisible: true,
  sidebarWidth: 240,
  diffHeight: 360,
  diffMaximized: true,
  diffViewMode: (readAppStorage('diffViewMode') as DiffViewMode) || 'unified',
  diffActiveTab: 'diff',
  operationState: null,
  conflictedFileToResolve: null,
  rebaseModalBaseCommit: null,
  tagModalCommit: null,
  addRemoteModalOpen: false,
  createRepoModalOpen: false,
  commandPaletteOpen: false,
  terminalDrawerOpen: false,
  terminalDrawerHeight: 220,
  shortcutsModalOpen: false,
  usageGuideOpen: false,
  playgroundOpen: false,
  playgroundTabOpen: false,
  playgroundLocked: false,
  gitFlowModalOpen: false,
  bisectModalOpen: false,
  reflogModalOpen: false,
  restorePointsOpen: false,
  homeOpen: false,
  commitSplitOpen: false,
  branchStackOpen: false,
  lfsManagerOpen: false,
  sparseCheckoutOpen: false,
  resolutionMemoryOpen: false,
  rangeComparisonOpen: false,
  rangeComparisonId: null,
  pullRequestsModalOpen: false,
  pullRequestIntent: null,
  changelogModalOpen: false,
  simulateMergeBranch: null,
  worktreesModalOpen: false,
  toast: null,
  toasts: [],
  filter: '',
  filterAuthor: '',
  filterDateRange: 'all',
  filterFilePath: '',
  commitLimit: 300,
  isLoadingMoreCommits: false,
  isOpeningRepo: false,
  openingRepoName: null,
  milestoneCelebration: null,

  async init() {
    const recent = (await unwrap(api.recentRepos()).catch(() => [])) as string[];
    set({ recentRepos: recent });
    if (recent.length > 0) await get().openRepo(recent[0], { notifyOnSuccess: false });
  },

  async openRepo(p, options) {
    const request = ++openingRequest;
    const targetName = p.split('/').pop() || p;
    set({ isOpeningRepo: true, openingRepoName: targetName });
    const startTime = Date.now();
    let pendingNotification: { kind: 'success' | 'error'; message: string } | null = null;
    try {
      const res = (await unwrap(api.openRepo(p))) as {
        ok: boolean;
        repo?: { path: string; name: string };
        error?: string;
      };
      if (request !== openingRequest) return;
      if (!res.ok || !res.repo) {
        pendingNotification = { kind: 'error', message: res.error || 'Failed to open repository' };
        return;
      }
      api.setActiveRepo(res.repo.path);
      const repo = res.repo;
      const tabs = [...get().tabs.filter((t) => t.path !== repo.path), { path: repo.path, name: repo.name }];
      const reset = resetRepositoryView(false);
      set({ ...reset, tabs, activeTab: repo.path, homeOpen: false, playgroundOpen: false, openingRepoName: repo.name, isOpeningRepo: true });
      await get().refresh();
      if (request === openingRequest && options?.notifyOnSuccess !== false) {
        pendingNotification = { kind: 'success', message: `Opened ${repo.name}` };
      }
    } catch (err) {
      if (request !== openingRequest) return;
      pendingNotification = { kind: 'error', message: String(err).replace('Error: ', '') };
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeout(() => {
        if (request !== openingRequest) return;
        set({ isOpeningRepo: false, openingRepoName: null });
        if (pendingNotification) {
          // Let RepoOpeningAnimation finish its 350ms exit before showing the
          // toast, so the notification does not cover the repository transition.
          setTimeout(() => {
            if (request !== openingRequest || !pendingNotification) return;
            get().notify(pendingNotification.kind, pendingNotification.message);
          }, 400);
        }
      }, remaining);
    }
  },

  async openRepoDialog() {
    try {
      const res = (await unwrap(api.openRepoDialog())) as {
        ok: boolean;
        repo?: { path: string; name: string };
        error?: string;
      };
      if (res.ok && res.repo) {
        await get().openRepo(res.repo.path);
      } else if (!res.error?.toLowerCase().includes('canceled')) {
        get().notify('error', res.error || 'Could not open the selected repository. Choose its root folder and try again.');
      }
    } catch (err) {
      if (String(err).includes('canceled')) return;
      get().notify('error', String(err).replace('Error: ', ''));
    }
  },

  closeTab(p) {
    const tabs = get().tabs.filter((t) => t.path !== p);
    let activeTab = get().activeTab;
    if (activeTab === p) activeTab = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
    if (get().activeTab !== p) { set({ tabs }); return; }
    set({ ...resetRepositoryView(), tabs, activeTab });
    api.setActiveRepo(activeTab);
    if (activeTab) {
      void get().refresh();
    } else {
      set({
        status: null,
        log: null,
        branches: { local: [], remote: [] },
        tags: [],
        remotes: [],
        submodules: [],
        worktrees: [],
        stashes: []
      });
    }
  },

  setActiveTab(p) {
    if (get().activeTab === p) { set({ homeOpen: !p, playgroundOpen: false }); return; }
    set({ ...resetRepositoryView(), activeTab: p, homeOpen: !p, playgroundOpen: false });
    api.setActiveRepo(p);
    void get().refresh();
  },

  openHome() {
    set({ homeOpen: true, playgroundOpen: false });
  },

  openPlayground() {
    set({ playgroundOpen: true, playgroundTabOpen: true, usageGuideOpen: false, commandPaletteOpen: false });
  },

  closePlayground() {
    if (get().playgroundLocked) return;
    set({ playgroundOpen: false, playgroundTabOpen: false });
  },

  async refresh() {
    const request = ++refreshRequest;
    const epoch = repositoryEpoch;
    const repo = get().activeTab;
    if (!repo) return;
    const limit = get().commitLimit || 300;
    try {
      const [status, log, branches, stashes, operationState, tags, remotes, submodules, worktrees] = await Promise.all([
        unwrap(api.getStatus()),
        unwrap(api.getLog(limit)),
        unwrap(api.getBranches()),
        unwrap(api.getStashes()),
        unwrap(api.getRepoOperationState()).catch(() => null),
        unwrap(api.getTags()).catch(() => []),
        unwrap(api.getRemotes()).catch(() => []),
        unwrap(api.getSubmodules()).catch(() => []),
        unwrap(api.getWorktrees()).catch(() => [])
      ]);
      if (epoch !== repositoryEpoch || request !== refreshRequest) return;
      set({ status, log, branches, stashes, operationState, tags, remotes, submodules, worktrees });
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== refreshRequest) return;
      get().notify('error', String(err).replace('Error: ', ''));
    }
  },

  async loadMoreCommits() {
    const { activeTab, log, commitLimit, isLoadingMoreCommits } = get();
    if (!activeTab || isLoadingMoreCommits) return;
    if (!log || !log.hasMore) return;

    const epoch = repositoryEpoch;
    const request = ++logRequest;
    const newLimit = commitLimit + 300;
    set({ isLoadingMoreCommits: true });
    try {
      const nextLog = await unwrap(api.getLog(newLimit));
      if (epoch !== repositoryEpoch || request !== logRequest) return;
      set({
        log: nextLog,
        commitLimit: newLimit,
        isLoadingMoreCommits: false
      });
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== logRequest) return;
      set({ isLoadingMoreCommits: false });
      get().notify('error', `Failed to load more commits: ${String(err)}`);
    }
  },

  async selectCommit(hash) {
    const request = ++detailRequest;
    const epoch = repositoryEpoch;
    set({ selectedCommit: hash, commitDetail: null, compareCommits: null, comparisonResult: null, selectedStashIndex: null, stashDetail: null, detailLoading: true });
    if (!hash) {
      set({ detailLoading: false });
      return;
    }
    if (hash === WIP_HASH) {
      const status = get().status;
      const files = [
        ...(status?.staged || []).map((f) => ({ path: f.path, status: f.status })),
        ...(status?.unstaged || []).map((f) => ({ path: f.path, status: f.status }))
      ];
      set({
        commitDetail: {
          hash: WIP_HASH,
          shortHash: 'WIP',
          parents: [],
          message: 'Uncommitted changes',
          body: 'Working directory changes not yet committed',
          authorName: '',
          authorEmail: '',
          date: new Date().toISOString(),
          files,
          insertions: 0,
          deletions: 0
        },
        detailLoading: false
      });
      return;
    }
    try {
      const detail = await api.getCommitDetail(hash);
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      set({ commitDetail: detail, detailLoading: false });
      if (!detail) get().notify('error', 'Failed to load commit details');
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      set({ detailLoading: false });
      get().notify('error', String(err));
    }
  },

  async setCompareCommits(hashes) {
    const request = ++detailRequest;
    const epoch = repositoryEpoch;
    if (!hashes) {
      set({ compareCommits: null, comparisonResult: null, detailLoading: false });
      return;
    }
    set({
      compareCommits: hashes,
      comparisonResult: null,
      selectedCommit: null,
      commitDetail: null,
      selectedStashIndex: null,
      stashDetail: null,
      detailLoading: true
    });
    try {
      const res = await api.compareCommits(hashes[0], hashes[1]);
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      if (!res) throw new Error('Unable to load comparison');
      set({ comparisonResult: res, detailLoading: false });
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      set({ detailLoading: false });
      get().notify('error', `Failed to compare commits: ${String(err)}`);
    }
  },

  async inspectStash(index) {
    const request = ++detailRequest;
    const epoch = repositoryEpoch;
    if (index === null || index === undefined) {
      set({ selectedStashIndex: null, stashDetail: null, detailLoading: false });
      return;
    }
    set({
      selectedStashIndex: index,
      stashDetail: null,
      selectedCommit: null,
      commitDetail: null,
      compareCommits: null,
      comparisonResult: null,
      detailLoading: true
    });
    try {
      const detail = await api.getStashDetail(index);
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      set({ stashDetail: detail, detailLoading: false });
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== detailRequest) return;
      set({ detailLoading: false });
      get().notify('error', `Failed to inspect stash: ${String(err)}`);
    }
  },

  async openFileDiff(d) {
    const request = ++diffRequest;
    const epoch = repositoryEpoch;
    set({ openDiff: d, fileDiff: null, diffLoading: true, diffMaximized: true });
    try {
      let diff: FileDiff | null = null;
      if (d.compareCommits) {
        diff = await api.getComparisonFileDiff(d.compareCommits[0], d.compareCommits[1], d.filePath);
      } else if (d.stashIndex !== undefined) {
        diff = await api.getStashFileDiff(d.stashIndex, d.filePath);
      } else {
        diff = await api.getFileDiff(d.commitHash ?? '', d.filePath, {
          staged: d.staged,
          worktree: d.worktree ?? d.commitHash === null
        });
      }
      if (epoch !== repositoryEpoch || request !== diffRequest || get().openDiff !== d) return;
      set({
        fileDiff: diff ?? { path: d.filePath, hunks: [], insertions: 0, deletions: 0 },
        diffLoading: false
      });
    } catch (err) {
      if (epoch !== repositoryEpoch || request !== diffRequest) return;
      set({ diffLoading: false });
      get().notify('error', String(err).replace('Error: ', ''));
    }
  },

  closeDiff() {
    diffRequest++;
    set({ openDiff: null, fileDiff: null, diffLoading: false, diffMaximized: true });
  },

  setDiffHeight(h) {
    const minH = 120;
    const maxH = typeof window !== 'undefined' ? Math.max(minH, window.innerHeight - 150) : 800;
    set({ diffHeight: Math.max(minH, Math.min(maxH, h)) });
  },

  toggleDiffMaximized() {
    set({ diffMaximized: !get().diffMaximized });
  },

  setDiffViewMode(mode) {
    try {
      localStorage.setItem('git-workbench:diffViewMode', mode);
    } catch {}
    set({ diffViewMode: mode });
  },

  setDiffActiveTab(tab) {
    set({ diffActiveTab: tab });
  },

  async reloadCurrentDiff() {
    const request = ++diffRequest;
    const epoch = repositoryEpoch;
    const d = get().openDiff;
    if (!d) return;
    try {
      let diff: FileDiff | null = null;
      if (d.compareCommits) {
        diff = await api.getComparisonFileDiff(d.compareCommits[0], d.compareCommits[1], d.filePath);
      } else if (d.stashIndex !== undefined) {
        diff = await api.getStashFileDiff(d.stashIndex, d.filePath);
      } else {
        diff = await api.getFileDiff(d.commitHash ?? '', d.filePath, {
          staged: d.staged,
          worktree: d.worktree ?? d.commitHash === null
        });
      }
      if (epoch !== repositoryEpoch || request !== diffRequest || get().openDiff !== d) return;
      set({
        fileDiff: diff ?? { path: d.filePath, hunks: [], insertions: 0, deletions: 0 }, diffLoading: false
      });
    } catch (err) {
      console.error('Failed to reload diff:', err);
    }
  },

  openConflictResolver(filePath) {
    set({ conflictedFileToResolve: filePath });
  },

  closeConflictResolver() {
    set({ conflictedFileToResolve: null });
  },

  async abortRepoOperation() {
    await get().runAndRefresh(async () => {
      await api.abortOperation();
      set({ conflictedFileToResolve: null });
    }, 'Operation aborted');
  },

  async continueRepoOperation() {
    await get().runAndRefresh(async () => {
      const result = await api.continueOperation();
      set({ conflictedFileToResolve: null });
      return result;
    }, 'Operation continued');
  },

  openRebaseModal(baseCommitHash) {
    set({ rebaseModalBaseCommit: baseCommitHash });
  },

  closeRebaseModal() {
    set({ rebaseModalBaseCommit: null });
  },

  openCreateTagModal(commitHash = 'HEAD') {
    set({ tagModalCommit: commitHash });
  },

  closeCreateTagModal() {
    set({ tagModalCommit: null });
  },

  openAddRemoteModal() {
    set({ addRemoteModalOpen: true });
  },

  closeAddRemoteModal() {
    set({ addRemoteModalOpen: false });
  },

  openCreateRepoModal() {
    set({ createRepoModalOpen: true });
  },

  closeCreateRepoModal() {
    set({ createRepoModalOpen: false });
  },

  openCommandPalette() {
    set({ commandPaletteOpen: true });
  },

  closeCommandPalette() {
    set({ commandPaletteOpen: false });
  },

  toggleCommandPalette() {
    set({ commandPaletteOpen: !get().commandPaletteOpen });
  },

  toggleTerminalDrawer() {
    set({ terminalDrawerOpen: !get().terminalDrawerOpen });
  },

  setTerminalDrawerHeight(h) {
    set({ terminalDrawerHeight: Math.max(120, Math.min(600, h)) });
  },

  toggleShortcutsModal() {
    set({ shortcutsModalOpen: !get().shortcutsModalOpen });
  },

  openUsageGuide() {
    set({ usageGuideOpen: true, commandPaletteOpen: false, shortcutsModalOpen: false });
  },

  closeUsageGuide() {
    set({ usageGuideOpen: false });
  },

  openGitFlowModal() {
    set({ gitFlowModalOpen: true });
  },

  closeGitFlowModal() {
    set({ gitFlowModalOpen: false });
  },

  openBisectModal() {
    set({ bisectModalOpen: true });
  },

  closeBisectModal() {
    set({ bisectModalOpen: false });
  },

  openReflogModal() {
    set({ reflogModalOpen: true });
  },

  closeReflogModal() {
    set({ reflogModalOpen: false });
  },

  openPullRequestsModal(intent) {
    set({ pullRequestsModalOpen: true, pullRequestIntent: intent || null });
  },

  closePullRequestsModal() {
    set({ pullRequestsModalOpen: false, pullRequestIntent: null });
  },

  openChangelogModal() {
    set({ changelogModalOpen: true });
  },

  closeChangelogModal() {
    set({ changelogModalOpen: false });
  },

  openSimulateMerge(branch: string) {
    set({ simulateMergeBranch: branch });
  },

  closeSimulateMerge() {
    set({ simulateMergeBranch: null });
  },

  openWorktreesModal() {
    set({ worktreesModalOpen: true });
  },

  closeWorktreesModal() {
    set({ worktreesModalOpen: false });
  },

  setFilterAuthor(a: string) {
    set({ filterAuthor: a });
  },

  setFilterDateRange(d: 'all' | 'today' | 'week' | 'month' | 'year') {
    set({ filterDateRange: d });
  },

  setFilterFilePath(p: string) {
    set({ filterFilePath: p });
  },

  async cherryPickCommit(hash) {
    await get().runAndRefresh(async () => {
      const res = await api.cherryPick(hash);
      if (!res.ok) {
        if (res.hasConflicts) {
          const op = await api.getRepoOperationState();
          if (op.conflictedFiles.length > 0) {
            get().openConflictResolver(op.conflictedFiles[0]);
          }
          throw new Error('Cherry-pick produced merge conflicts. Please resolve conflicts.');
        }
        throw new Error(res.error || 'Cherry-pick failed');
      }
    }, 'Commit cherry-picked');
  },

  setFilter(f) {
    set({ filter: f });
  },

  toggleSidebar() {
    set({ sidebarVisible: !get().sidebarVisible });
  },

  setSidebarWidth(w) {
    set({ sidebarWidth: Math.max(52, Math.min(480, w)) });
  },

  notify(kind, text, title, duration = 4000) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      id,
      kind,
      title: title || undefined,
      text,
      duration,
      timestamp: Date.now()
    };
    const updated = [...get().toasts.slice(-4), newToast];
    set({ toasts: updated, toast: newToast });

    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
  },

  dismissToast(id) {
    const updated = get().toasts.filter((t) => t.id !== id);
    set({
      toasts: updated,
      toast: updated.length > 0 ? updated[updated.length - 1] : null
    });
  },

  clearToasts() {
    set({ toasts: [], toast: null });
  },

  celebrateMilestone(kind) {
    set({ milestoneCelebration: { id: ++milestoneId, kind } });
  },

  clearMilestoneCelebration(id) {
    if (get().milestoneCelebration?.id === id) set({ milestoneCelebration: null });
  },

  async runAndRefresh(fn, successMsg) {
    const repo = get().activeTab;
    try {
      const result = await unwrap(fn());
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) throw new Error(String((result as { error?: string }).error || 'The Git operation did not complete.'));
      await get().refresh();
      if (get().activeTab === repo && result && typeof result === 'object' && 'rewriteId' in result && typeof result.rewriteId === 'string') set({ rangeComparisonOpen: true, rangeComparisonId: result.rewriteId });
      if (successMsg) get().notify('success', successMsg);
      return true;
    } catch (err) {
      // Git may have changed the index before reporting a merge, stash, or rebase conflict.
      if (get().activeTab === repo) await get().refresh();
      get().notify('error', String(err).replace('Error: ', ''));
      return false;
    }
  }
}));
