import React, { useState, useMemo } from 'react';
import {
  Undo2,
  Redo2,
  Download,
  Upload,
  GitBranch,
  Archive,
  ArrowUpFromLine,
  SquareTerminal,
  MoreHorizontal,
  Search,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  GitMerge,
  GitPullRequest,
  History,
  Settings,
  X,
  Terminal,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { useApp, WIP_HASH } from '../../store';
import { useSettings } from '../../store/settings';
import { Dropdown, MenuItem, MenuDivider } from '../ui/Dropdown';
import { api } from '../../lib/api';

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  highlight,
  loading,
  badge
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  highlight?: boolean;
  loading?: boolean;
  badge?: number;
}) {
  return (
    <button
      className={`relative flex flex-col items-center gap-0.5 px-2.5 py-1 rounded transition-colors disabled:opacity-35 disabled:pointer-events-none ${
        highlight
          ? 'text-accent hover:text-accent-hover hover:bg-accent/10 font-medium'
          : 'text-dim hover:text-fg hover:bg-panel2'
      }`}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
    >
      <span className={`text-fg/90 flex items-center justify-center h-4 w-4 ${loading ? 'animate-spin text-accent' : ''}`}>
        {loading ? <RefreshCw size={13} /> : icon}
      </span>
      <span className="text-[10px] leading-none flex items-center gap-1">
        {label}
        {badge !== undefined && badge > 0 ? (
          <span className="inline-flex items-center justify-center px-1 py-0.2 text-[9px] font-semibold rounded-full bg-accent/20 text-accent leading-none">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function Toolbar() {
  const {
    activeTab,
    status,
    log,
    runAndRefresh,
    notify,
    openRepoDialog,
    toggleTerminalDrawer,
    openCommandPalette
  } = useApp();
  const [branchQuery, setBranchQuery] = useState('');
  const [activeSync, setActiveSync] = useState<'fetch' | 'pull' | 'push' | null>(null);
  const branch = status?.currentBranch ?? '';
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasRepo = !!activeTab;
  const tabName = useApp.getState().tabs.find((t) => t.path === activeTab)?.name || 'No repo';

  const stagedCount = status?.staged?.length ?? 0;
  const unstagedCount = status?.unstaged?.length ?? 0;
  const uncommittedCount = stagedCount + unstagedCount;
  const hasUncommitted = uncommittedCount > 0;

  const act = (fn: () => Promise<unknown>, msg?: string) => () => void runAndRefresh(fn, msg);

  const handleFetch = async () => {
    if (activeSync) return;
    setActiveSync('fetch');
    try {
      const prevBehind = behind;
      const ok = await runAndRefresh(() => api.fetch());
      if (ok) {
        const nextStatus = useApp.getState().status;
        const newBehind = nextStatus?.behind ?? 0;
        if (newBehind > prevBehind) {
          notify('info', `Fetched remote updates: ${newBehind} incoming commit${newBehind > 1 ? 's' : ''} available to pull`);
        } else {
          notify('success', 'Fetched all remotes (repository up to date)');
        }
      }
    } finally {
      setActiveSync(null);
    }
  };

  const handlePull = async () => {
    if (activeSync) return;
    setActiveSync('pull');
    try {
      const currentBehind = behind;
      const ok = await runAndRefresh(() => api.pull());
      if (ok) {
        if (currentBehind > 0) {
          notify('success', `Pulled ${currentBehind} commit${currentBehind > 1 ? 's' : ''} from remote`);
        } else {
          notify('info', 'Already up to date. No new incoming changes from remote.');
        }
      }
    } finally {
      setActiveSync(null);
    }
  };

  const handlePush = async () => {
    if (activeSync) return;

    if (ahead === 0) {
      if (hasUncommitted) {
        notify(
          'error',
          `Cannot push: you have ${uncommittedCount} uncommitted file${uncommittedCount > 1 ? 's' : ''}. Commit them first before pushing.`
        );
      } else {
        notify('info', 'Branch is up to date with remote (0 local commits to push).');
      }
      return;
    }

    setActiveSync('push');
    try {
      const currentAhead = ahead;
      const ok = await runAndRefresh(() => api.push());
      if (ok) {
        notify('success', `Pushed ${currentAhead} commit${currentAhead > 1 ? 's' : ''} to remote`);
      }
    } finally {
      setActiveSync(null);
    }
  };

  return (
    <div className="relative z-30 flex items-center bg-panel border-b border-edge px-3 py-1 gap-2 shrink-0 h-10">
      {/* Left section: Repository & Branch dropdowns */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Repository dropdown */}
        <Dropdown
          trigger={
            <button className="btn gap-2 max-w-52" title="Switch repository">
              <FolderOpen size={13} className="text-accent shrink-0" />
              <span className="truncate">{tabName}</span>
              <ChevronDown size={12} className="text-dim" />
            </button>
          }
          width={280}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<FolderOpen size={14} />}
                label="Open Repository…"
                onClick={() => {
                  close();
                  void openRepoDialog();
                }}
              />
              <MenuItem
                icon={<FolderPlus size={14} className="text-accent" />}
                label="Create New Repository…"
                onClick={() => {
                  close();
                  useApp.getState().openCreateRepoModal();
                }}
              />
              <MenuDivider />
              {useApp.getState().recentRepos.map((r) => (
                <MenuItem
                  key={r}
                  label={r.split('/').pop() || r}
                  trailing={r}
                  onClick={() => {
                    close();
                    void useApp.getState().openRepo(r);
                  }}
                />
              ))}
            </>
          )}
        </Dropdown>

        {/* Branch dropdown */}
        <Dropdown
          trigger={
            <button className="btn gap-2 max-w-48" title="Switch branch" disabled={!hasRepo}>
              <GitBranch size={13} className="text-accent shrink-0" />
              <span className="truncate">{branch || '—'}</span>
              {ahead > 0 && <span className="text-xs text-dim">↑{ahead}</span>}
              {behind > 0 && <span className="text-xs text-dim">↓{behind}</span>}
              <ChevronDown size={12} className="text-dim" />
            </button>
          }
          width={280}
        >
          {(close) => {
            const { branches } = useApp.getState();
            const q = branchQuery.toLowerCase();
            return (
              <>
                <div className="px-2.5 pb-1.5 pt-1">
                  <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2 text-faint pointer-events-none" />
                    <input
                      placeholder="Filter branches…"
                      value={branchQuery}
                      onChange={(e) => setBranchQuery(e.target.value)}
                      className="w-full text-xs !pl-6.5 !pr-2 py-1"
                      autoFocus
                    />
                  </div>
                </div>
                {branches.local
                  .filter((b) => b.name.toLowerCase().includes(q))
                  .map((b) => (
                    <MenuItem
                      key={b.fullName}
                      icon={<GitBranch size={13} className={b.isCurrent ? 'text-accent' : 'text-dim'} />}
                      label={
                        <span className={b.isCurrent ? 'text-accent font-medium' : ''}>
                          {b.name}
                          {b.tracking ? <span className="text-faint text-xs"> · {b.tracking}</span> : null}
                        </span>
                      }
                      onClick={() => {
                        close();
                        if (!b.isCurrent) void runAndRefresh(() => api.checkoutBranch(b.fullName), `Checked out ${b.name}`);
                      }}
                      trailing={b.isCurrent ? '✓' : undefined}
                    />
                  ))}
              </>
            );
          }}
        </Dropdown>
      </div>

      {/* Center section: Action buttons strictly centered in the toolbar */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-auto">
        <ActionButton
          icon={<RefreshCw size={14} />}
          label="Fetch"
          disabled={!hasRepo}
          loading={activeSync === 'fetch'}
          onClick={handleFetch}
          title="Fetch latest updates from all remotes"
        />
        <ActionButton
          icon={<Download size={14} />}
          label="Pull"
          badge={behind}
          highlight={behind > 0}
          disabled={!hasRepo}
          loading={activeSync === 'pull'}
          onClick={handlePull}
          title={
            !hasRepo
              ? 'Pull'
              : behind > 0
              ? `Pull ${behind} incoming commit${behind > 1 ? 's' : ''} from remote`
              : 'Pull latest changes from remote (currently up to date)'
          }
        />
        <ActionButton
          icon={<Upload size={14} />}
          label="Push"
          badge={ahead}
          highlight={ahead > 0}
          disabled={!hasRepo}
          loading={activeSync === 'push'}
          onClick={handlePush}
          title={
            !hasRepo
              ? 'Push'
              : ahead > 0
              ? `Push ${ahead} outgoing commit${ahead > 1 ? 's' : ''} to remote`
              : hasUncommitted
              ? `No commits to push (${uncommittedCount} uncommitted file${uncommittedCount > 1 ? 's' : ''} need to be committed first)`
              : 'Branch is up to date with remote (0 commits to push)'
          }
        />
        <BranchMenu />
        <ActionButton
          icon={<GitMerge size={15} className="text-emerald-400" />}
          label="Git Flow"
          disabled={!hasRepo}
          onClick={() => useApp.getState().openGitFlowModal()}
          title="Git Flow (Start & Finish Features, Releases, Hotfixes)"
        />
        <ActionButton
          icon={<Archive size={15} />}
          label="Stash"
          disabled={!hasRepo}
          onClick={act(() => api.stash(), 'Changes stashed')}
          title="Stash changes"
        />
        <ActionButton
          icon={<ArrowUpFromLine size={15} />}
          label="Pop"
          disabled={!hasRepo || useApp.getState().stashes.length === 0}
          onClick={act(() => api.stashPop(), 'Stash popped')}
          title="Pop stash"
        />
        <ActionButton
          icon={<SquareTerminal size={15} />}
          label="Terminal"
          disabled={!hasRepo}
          onClick={() => toggleTerminalDrawer()}
          title="Toggle Embedded Terminal (Ctrl+`)"
        />
      </div>

      {/* Right section: Actions menu */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <Dropdown
          align="right"
          trigger={
            <button className="btn-icon" title="Actions">
              <MoreHorizontal size={16} />
            </button>
          }
          width={230}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Search size={14} />}
                label="Command Palette…"
                trailing="Ctrl+K"
                onClick={() => {
                  close();
                  openCommandPalette();
                }}
              />
              <MenuItem
                icon={<Terminal size={14} />}
                label="Toggle Terminal Drawer"
                trailing="Ctrl+`"
                onClick={() => {
                  close();
                  toggleTerminalDrawer();
                }}
              />
              <MenuDivider />
              <MenuItem
                icon={<Download size={14} />}
                label="Fetch All Remotes"
                onClick={() => {
                  close();
                  void runAndRefresh(() => api.fetch(), 'Fetched');
                }}
              />
              <MenuItem
                icon={<GitPullRequest size={14} className="text-accent" />}
                label="Pull Requests / Merge Requests…"
                disabled={!hasRepo}
                onClick={() => {
                  close();
                  useApp.getState().openPullRequestsModal();
                }}
              />
              <MenuItem
                icon={<GitMerge size={14} />}
                label="Merge into current branch…"
                onClick={() => {
                  close();
                  notify('info', 'Use a branch context menu to merge into the current branch');
                }}
              />
              <MenuItem
                icon={<History size={14} />}
                label="Reflog & Recovery…"
                disabled={!hasRepo}
                onClick={() => {
                  close();
                  useApp.getState().openReflogModal();
                }}
              />
              <MenuItem icon={<GitBranch size={14} />} label="Split Commit…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ commitSplitOpen: true }); }} />
              <MenuItem icon={<GitBranch size={14} />} label="Stacked Branches & PRs…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ branchStackOpen: true }); }} />
              <MenuItem icon={<Download size={14} />} label="Git LFS Manager…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ lfsManagerOpen: true }); }} />
              <MenuItem icon={<FolderOpen size={14} />} label="Sparse Checkout…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ sparseCheckoutOpen: true }); }} />
              <MenuItem icon={<Undo2 size={14} />} label="Restore Points…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ restorePointsOpen: true }); }} />
              <MenuItem icon={<GitMerge size={14} />} label="Conflict Resolution Memory…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ resolutionMemoryOpen: true }); }} />
              <MenuItem icon={<History size={14} />} label="Rebase & Rewrite Comparison…" disabled={!hasRepo} onClick={() => { close(); useApp.setState({ rangeComparisonOpen: true, rangeComparisonId: null }); }} />
              <MenuItem
                icon={<History size={14} />}
                label="Refresh"
                onClick={() => {
                  close();
                  void useApp.getState().refresh();
                }}
              />
              <MenuDivider />
              <MenuItem
                icon={<Settings size={14} />}
                label="Settings…"
                trailing="Ctrl+,"
                onClick={() => {
                  close();
                  useSettings.getState().openSettings();
                }}
              />
              <MenuItem
                icon={<GitMerge size={14} className="text-emerald-400" />}
                label="Git Flow Operations…"
                onClick={() => {
                  close();
                  useApp.getState().openGitFlowModal();
                }}
              />
              <MenuItem
                icon={<HelpCircle size={14} className="text-accent" />}
                label="Explore Git Workbench…"
                onClick={() => {
                  close();
                  useApp.getState().openUsageGuide();
                }}
              />
            </>
          )}
        </Dropdown>

        <SearchBox />
      </div>
    </div>
  );
}

function BranchMenu() {
  const { runAndRefresh } = useApp();
  const [name, setName] = useState('');
  return (
    <Dropdown
      trigger={
        <button className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-dim hover:text-fg hover:bg-panel2" title="Create branch">
          <span className="text-fg/90">
            <GitBranch size={15} />
          </span>
          <span className="text-[10px] leading-none">Branch</span>
        </button>
      }
      width={280}
    >
      {(close) => (
        <form
          className="px-3 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            close();
            void runAndRefresh(() => api.createBranch(name.trim()), `Created ${name.trim()}`);
            setName('');
          }}
        >
          <div className="text-xs text-dim mb-1.5">
            Create new branch from {useApp.getState().status?.currentBranch || 'HEAD'}
          </div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Branch name" className="w-full text-xs" />
        </form>
      )}
    </Dropdown>
  );
}

function SearchBox() {
  const filter = useApp((s) => s.filter);
  const setFilter = useApp((s) => s.setFilter);
  const log = useApp((s) => s.log);
  const openCommandPalette = useApp((s) => s.openCommandPalette);

  const totalCommits = log?.commits?.length || 0;
  const matchCount = useMemo(() => {
    if (!filter.trim() || !log?.commits) return 0;
    const q = filter.trim().toLowerCase();
    return log.commits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.hash.startsWith(q) ||
        c.authorName.toLowerCase().includes(q) ||
        c.refs.some((r) => r.label.toLowerCase().includes(q))
    ).length;
  }, [filter, log?.commits]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-2.5 text-faint pointer-events-none z-10" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter commits…"
          className="w-36 md:w-48 text-xs !pl-8 !pr-7 h-7"
        />
        {filter ? (
          <button
            onClick={() => setFilter('')}
            className="absolute right-1.5 text-faint hover:text-fg p-0.5 z-10"
            title="Clear filter"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {filter.trim() && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-panel3 text-accent border border-edge shrink-0 select-none">
          {matchCount}/{totalCommits}
        </span>
      )}

      <button
        onClick={openCommandPalette}
        className="flex items-center gap-1 px-2 h-7 rounded text-dim hover:text-fg hover:bg-panel2 border border-edge/60 text-xs shrink-0 select-none cursor-pointer"
        title="Command Palette (Ctrl+K / Cmd+K)"
      >
        <span className="text-[11px] font-mono text-faint">⌘K</span>
      </button>
    </div>
  );
}
