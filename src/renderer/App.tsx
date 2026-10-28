import React, { useEffect, useState } from 'react';
import { useApp } from './store';
import { useSettings } from './store/settings';
import { api } from './lib/api';
import { readAppStorage } from './lib/appStorage';
import { TabBar } from './components/TabBar/TabBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { CommitGraph } from './components/CommitGraph/CommitGraph';
import { CommitDetailPanel } from './components/CommitDetailPanel/CommitDetailPanel';
import { DiffViewer } from './components/DiffViewer/DiffViewer';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Home } from './components/Home/Home';
import { LfsManagerModal } from './components/Repository/LfsManagerModal';
import { SparseCheckoutModal } from './components/Repository/SparseCheckoutModal';
import { SettingsPage } from './components/Settings/SettingsPage';
import { AppLoadingScreen } from './components/Loading/AppLoadingScreen';
import { RepoOpeningAnimation } from './components/Loading/RepoOpeningAnimation';
import { ConflictBanner } from './components/ConflictResolver/ConflictBanner';
import { ConflictResolverModal } from './components/ConflictResolver/ConflictResolverModal';
import { ResolutionMemoryModal } from './components/ConflictResolver/ResolutionMemoryModal';
import { InteractiveRebaseModal } from './components/Rebase/InteractiveRebaseModal';
import { RangeComparisonModal } from './components/Rebase/RangeComparisonModal';
import { CommitSplitModal } from './components/Rebase/CommitSplitModal';
import { BranchStackModal } from './components/Rebase/BranchStackModal';
import { CreateTagModal } from './components/Sidebar/CreateTagModal';
import { AddRemoteModal } from './components/Sidebar/AddRemoteModal';
import { CreateRepoModal } from './components/Repository/CreateRepoModal';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { TerminalDrawer } from './components/TerminalDrawer/TerminalDrawer';
import { ShortcutsModal } from './components/Help/ShortcutsModal';
import { UsageGuideModal } from './components/Help/UsageGuideModal';
import { GitFlowModal } from './components/GitFlow/GitFlowModal';
import { MergeSimulationModal } from './components/ConflictResolver/MergeSimulationModal';
import { BisectModal } from './components/Bisect/BisectModal';
import { ReflogModal } from './components/Reflog/ReflogModal';
import { RestorePointsModal } from './components/Reflog/RestorePointsModal';
import { ChangelogModal } from './components/Changelog/ChangelogModal';
import { WorktreesModal } from './components/Worktrees/WorktreesModal';
import { PullRequestsModal } from './components/PullRequests/PullRequestsModal';
import { ToastContainer } from './components/Common/ToastContainer';
import { AppUpdateNotice } from './components/Updates/AppUpdateNotice';
import { SetupPage } from './components/Onboarding/SetupPage';
import { Playground } from './components/Playground/Playground';

export function App() {
  const activeTab = useApp((s) => s.activeTab);
  const homeOpen = useApp(s => s.homeOpen);
  const init = useApp((s) => s.init);
  const usageGuideOpen = useApp((s) => s.usageGuideOpen);
  const gitFlowModalOpen = useApp((s) => s.gitFlowModalOpen);
  const openUsageGuide = useApp((s) => s.openUsageGuide);
  const closeUsageGuide = useApp((s) => s.closeUsageGuide);
  const closeGitFlowModal = useApp((s) => s.closeGitFlowModal);
  const [isReady, setIsReady] = useState(false);
  const setupCompleted = useSettings(s => s.setupCompleted);
  const setupOpen = isReady && setupCompleted === false;
  const updatePromptBlocked = useApp(s => [
    s.isOpeningRepo, s.usageGuideOpen, s.playgroundOpen, s.conflictedFileToResolve, s.rebaseModalBaseCommit,
    s.createRepoModalOpen, s.commandPaletteOpen, s.pullRequestsModalOpen, s.commitSplitOpen,
    s.branchStackOpen, s.restorePointsOpen, s.resolutionMemoryOpen, s.rangeComparisonOpen,
    s.lfsManagerOpen, s.sparseCheckoutOpen, s.gitFlowModalOpen, s.bisectModalOpen,
    s.reflogModalOpen, s.changelogModalOpen, s.worktreesModalOpen, s.simulateMergeBranch,
    s.tagModalCommit, s.addRemoteModalOpen, s.shortcutsModalOpen
  ].some(Boolean));

  const isSettingsOpen = useSettings((s) => s.isSettingsOpen);
  const autoFetch = useSettings((s) => s.autoFetch);
  const autoFetchInterval = useSettings((s) => s.autoFetchInterval);

  useEffect(() => {
    const startTime = Date.now();
    let active = true;
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    // The store reports initialization errors; readiness must still settle.
    void Promise.all([
      init().catch(() => {}),
      useSettings.getState().initializeAiSettings(),
      api.getSetupComplete().then(complete => {
        if (!active) return;
        if (complete) useSettings.setState({ setupCompleted: true });
        else if (useSettings.getState().setupCompleted) return api.completeSetup();
      }).catch(() => {})
    ]).finally(() => {
      if (!active) return;
      // Ensure the opening animation displays smoothly for at least 2400ms
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 2400 - elapsed);
      readinessTimer = setTimeout(() => {
        setIsReady(true);
      }, remaining);
    });
    return () => {
      active = false;
      if (readinessTimer !== undefined) clearTimeout(readinessTimer);
    };
  }, [init]);

  // Show the guide on first launch, without covering an active workflow.
  useEffect(() => {
    if (!isReady || setupCompleted === false) return;
    const completed = readAppStorage('guide_completed');
    if (completed === undefined || completed === 'true') return;
    const timer = setTimeout(() => {
      const state = useApp.getState();
      const activeDialogs = [
        state.usageGuideOpen, state.playgroundOpen, state.conflictedFileToResolve, state.rebaseModalBaseCommit,
        state.createRepoModalOpen, state.commandPaletteOpen, state.pullRequestsModalOpen,
        state.commitSplitOpen, state.branchStackOpen, state.restorePointsOpen,
        state.resolutionMemoryOpen, state.rangeComparisonOpen, state.lfsManagerOpen,
        state.sparseCheckoutOpen, state.gitFlowModalOpen, state.bisectModalOpen,
        state.reflogModalOpen, state.changelogModalOpen, state.worktreesModalOpen,
        state.simulateMergeBranch, state.tagModalCommit, state.addRemoteModalOpen,
        state.shortcutsModalOpen
      ];
      if (useSettings.getState().isSettingsOpen || state.isOpeningRepo || activeDialogs.some(Boolean)) return;
      const latest = readAppStorage('guide_completed');
      if (latest === undefined || latest === 'true') return;
      openUsageGuide();
    }, 450);
    return () => clearTimeout(timer);
  }, [isReady, setupCompleted, openUsageGuide]);

  // Periodic and on-focus background git fetch to keep repository and ahead/behind status updated
  useEffect(() => {
    if (!activeTab || !autoFetch) return;

    let inFlight = false;
    const runSilentFetch = async () => {
      if (inFlight) return;
      const tab = useApp.getState().activeTab;
      if (!tab) return;
      inFlight = true;
      try {
        const res = await api.fetch();
        if (res && res.ok) {
          await useApp.getState().refresh();
        }
      } catch {
        // Silently swallow network/remote errors in background so offline work isn't interrupted
      } finally {
        inFlight = false;
      }
    };

    // Initial silent check 2.5s after repo is loaded
    const initialTimer = setTimeout(() => {
      void runSilentFetch();
    }, 2500);

    // Periodic timer
    const intervalMs = Math.max(10, autoFetchInterval || 60) * 1000;
    const intervalTimer = setInterval(() => {
      void runSilentFetch();
    }, intervalMs);

    // Sync when returning to the window/tab
    const handleFocus = () => {
      if (document.visibilityState !== 'hidden') {
        void runSilentFetch();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [activeTab, autoFetch, autoFetchInterval]);

  // Global keyboard shortcuts:
  // - Ctrl+K / Cmd+K or Ctrl+P / Cmd+P: Command Palette
  // - Ctrl+T / Cmd+T: Home
  // - Ctrl+` / Cmd+`: Terminal Drawer
  // - Ctrl+, / Cmd+,: Settings
  // - Escape: Close command palette, modals, or open diff
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (useSettings.getState().setupCompleted === false) return;
      if (useApp.getState().usageGuideOpen || useApp.getState().playgroundOpen) return;
      // The merge editor owns shortcuts while a draft is open.
      if (useApp.getState().conflictedFileToResolve) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === 't') {
        e.preventDefault();
        useSettings.getState().closeSettings();
        useApp.getState().openHome();
      } else if (isMod && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault();
        useApp.getState().toggleCommandPalette();
      } else if (isMod && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        useApp.getState().toggleTerminalDrawer();
      } else if (isMod && e.key === 'b') {
        e.preventDefault();
        useApp.getState().toggleSidebar();
      } else if (isMod && e.key === 'f') {
        e.preventDefault();
        const state = useApp.getState();
        const selector = state.homeOpen || !state.activeTab ? 'input[aria-label="Search repositories"]' : 'input[placeholder*="Filter commits"]';
        const searchInput = document.querySelector<HTMLInputElement>(selector);
        searchInput?.focus();
        searchInput?.select();
      } else if (isMod && e.key === ',') {
        e.preventDefault();
        const settings = useSettings.getState();
        if (settings.isSettingsOpen) {
          settings.closeSettings();
        } else {
          settings.openSettings();
        }
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        useApp.getState().toggleShortcutsModal();
      } else if (e.key === 'Escape') {
        if (useSettings.getState().isSettingsOpen) {
          useSettings.getState().closeSettings();
        } else if (useApp.getState().shortcutsModalOpen) {
          useApp.setState({ shortcutsModalOpen: false });
        } else if (useApp.getState().commandPaletteOpen) {
          useApp.getState().closeCommandPalette();
        } else if (useApp.getState().openDiff) {
          useApp.getState().closeDiff();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="h-full flex flex-col bg-base overflow-hidden border border-edge/50">
      <TabBar />
      {isReady && !setupOpen && <Playground />}
      {setupOpen ? <SetupPage onComplete={openUsageGuide} /> : isSettingsOpen ? (
        <SettingsPage />
      ) : homeOpen || !activeTab ? (
        <Home />
      ) : (
        <div key={activeTab} className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
          <Toolbar />
          <ConflictBanner />
          <div className="flex-1 flex min-h-0">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
              <CommitGraph />
              <DiffViewer />
            </div>
            <CommitDetailPanel />
          </div>
          <TerminalDrawer />
        </div>
      )}
      <StatusBar />
      <ConflictResolverModal />
      <ResolutionMemoryModal />
      <InteractiveRebaseModal />
      <RangeComparisonModal />
      <CommitSplitModal />
      <BranchStackModal />
      <LfsManagerModal />
      <SparseCheckoutModal />
      <CreateTagModal />
      <AddRemoteModal />
      <CreateRepoModal />
      <CommandPalette />
      <ShortcutsModal />
      <MergeSimulationModal />
      <BisectModal />
      <ReflogModal />
      <RestorePointsModal />
      <ChangelogModal />
      <WorktreesModal />
      <PullRequestsModal />
      {usageGuideOpen && <UsageGuideModal onClose={closeUsageGuide} />}
      {gitFlowModalOpen && <GitFlowModal onClose={closeGitFlowModal} />}
      <RepoOpeningAnimation />
      <AppLoadingScreen isReady={isReady} />
      <AppUpdateNotice ready={isReady && !setupOpen && !updatePromptBlocked} />
      <ToastContainer />
    </div>
  );
}
