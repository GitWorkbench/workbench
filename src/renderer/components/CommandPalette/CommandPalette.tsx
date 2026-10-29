import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Terminal,
  GitBranch,
  Tag as TagIcon,
  GitCommit,
  FileText,
  Download,
  Upload,
  Archive,
  RefreshCw,
  Settings,
  List,
  Plus,
  Globe,
  Boxes,
  Keyboard,
  FolderPlus,
  FolderOpen,
  X,
  GitMerge,
  GitPullRequest,
  Sparkles,
  GitCompare,
  Target,
  FolderGit2,
  History
} from 'lucide-react';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { api } from '../../lib/api';

type PaletteCategory = 'Commands' | 'Branches' | 'Tags' | 'Commits' | 'Files';

interface PaletteItem {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  action: () => void | Promise<unknown>;
}

const QUERY_SCOPE_PREFIX = /^([>@#]|(cmd|branch|tag|commit|file|c|f):)/i;

function highlightMatch(text: string, query: string) {
  const cleanQ = query.trim().replace(QUERY_SCOPE_PREFIX, '').trim();
  if (!cleanQ) return <span>{text}</span>;
  try {
    const parts = text.split(new RegExp(`(${cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((p, i) =>
          p.toLowerCase() === cleanQ.toLowerCase() ? (
            <span key={i} className="text-cyan-400 font-bold bg-cyan-950/60 rounded px-0.5">
              {p}
            </span>
          ) : (
            p
          )
        )}
      </span>
    );
  } catch {
    return <span>{text}</span>;
  }
}

export function CommandPalette() {
  const isOpen = useApp((s) => s.commandPaletteOpen);
  const close = () => useApp.setState({ commandPaletteOpen: false });

  const activeTab = useApp((s) => s.activeTab);
  const status = useApp((s) => s.status);
  const branches = useApp((s) => s.branches);
  const tags = useApp((s) => s.tags);
  const log = useApp((s) => s.log);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const selectCommit = useApp((s) => s.selectCommit);
  const openFileDiff = useApp((s) => s.openFileDiff);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const toggleTerminalDrawer = useApp((s) => s.toggleTerminalDrawer);
  const openCreateTagModal = useApp((s) => s.openCreateTagModal);
  const openAddRemoteModal = useApp((s) => s.openAddRemoteModal);
  const openCreateRepoModal = useApp((s) => s.openCreateRepoModal);
  const openRepoDialog = useApp((s) => s.openRepoDialog);
  const toggleShortcutsModal = useApp((s) => s.toggleShortcutsModal);
  const refresh = useApp((s) => s.refresh);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'All' | PaletteCategory>('All');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory('All');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!isOpen) return [];

    const list: PaletteItem[] = [
      { id: 'cmd-playground', category: 'Commands', title: 'Git Playground…', subtitle: 'Ten guided Git lessons with real commands, practice files, and hints', icon: <Target size={14} />, action: () => { useSettings.getState().closeSettings(); useApp.getState().openPlayground(); } },
      // 1. Built-in Commands
      {
        id: 'cmd-fetch',
        category: 'Commands',
        title: 'Fetch All Remotes',
        subtitle: 'Download objects and refs from all remotes',
        icon: <Download size={14} className="text-sky-400" />,
        action: () => runAndRefresh(() => api.fetch(), 'Fetched from all remotes')
      },
      {
        id: 'cmd-pull-requests',
        category: 'Commands',
        title: 'Open Requests…',
        subtitle: 'View or create GitHub, GitLab, Bitbucket, and Gitea requests for this branch',
        icon: <GitPullRequest size={14} className="text-accent" />,
        action: () => useApp.getState().openPullRequestsModal()
      },
      {
        id: 'cmd-pull',
        category: 'Commands',
        title: 'Pull from Upstream',
        subtitle: 'Fetch and fast-forward current branch',
        icon: <Download size={14} className="text-emerald-400" />,
        action: () => runAndRefresh(() => api.pull(), 'Pull complete')
      },
      {
        id: 'cmd-push',
        category: 'Commands',
        title: 'Push to Remote',
        subtitle: 'Push current branch commits to tracking remote',
        icon: <Upload size={14} className="text-accent" />,
        action: () => runAndRefresh(() => api.push(), 'Push complete')
      },
      {
        id: 'cmd-stash',
        category: 'Commands',
        title: 'Stash Working Changes',
        subtitle: 'Save modified and staged files aside',
        icon: <Archive size={14} className="text-amber-400" />,
        action: () => runAndRefresh(() => api.stash(), 'Changes stashed')
      },
      {
        id: 'cmd-stash-pop',
        category: 'Commands',
        title: 'Pop Latest Stash',
        subtitle: 'Apply stash #0 and remove it from list',
        icon: <Archive size={14} className="text-amber-300" />,
        action: () => runAndRefresh(() => api.stashPop(0), 'Popped stash #0')
      },
      {
        id: 'cmd-create-repo',
        category: 'Commands',
        title: 'Create / Initialize Repository…',
        subtitle: 'Initialize a new Git repository in a folder',
        icon: <FolderPlus size={14} className="text-accent" />,
        action: () => openCreateRepoModal()
      },
      {
        id: 'cmd-open-repo',
        category: 'Commands',
        title: 'Open Repository…',
        subtitle: 'Select and open an existing Git repository folder',
        icon: <FolderOpen size={14} className="text-accent" />,
        action: () => void openRepoDialog()
      },
      {
        id: 'cmd-create-tag',
        category: 'Commands',
        title: 'Create Tag…',
        subtitle: 'Tag current HEAD or commit',
        icon: <TagIcon size={14} className="text-amber-400" />,
        action: () => openCreateTagModal('HEAD')
      },
      {
        id: 'cmd-add-remote',
        category: 'Commands',
        title: 'Add Remote…',
        subtitle: 'Connect a new remote git repository URL',
        icon: <Globe size={14} className="text-sky-400" />,
        action: () => openAddRemoteModal()
      },
      {
        id: 'cmd-update-submodules',
        category: 'Commands',
        title: 'Update / Sync Submodules',
        subtitle: 'Initialize and recursively update submodules',
        icon: <Boxes size={14} className="text-emerald-400" />,
        action: () => runAndRefresh(() => api.updateSubmodules(), 'Submodules updated')
      },
      {
        id: 'cmd-toggle-terminal',
        category: 'Commands',
        title: 'Toggle Terminal Drawer',
        subtitle: 'Open or close embedded bottom terminal (Ctrl+`)',
        icon: <Terminal size={14} className="text-purple-400" />,
        action: () => toggleTerminalDrawer()
      },
      {
        id: 'cmd-open-ext-terminal',
        category: 'Commands',
        title: 'Open External Terminal',
        subtitle: 'Launch system terminal at repo root',
        icon: <Terminal size={14} className="text-dim" />,
        action: () => api.openTerminal()
      },
      {
        id: 'cmd-toggle-sidebar',
        category: 'Commands',
        title: 'Toggle Sidebar',
        subtitle: 'Show or hide left repository navigation sidebar',
        icon: <List size={14} className="text-dim" />,
        action: () => toggleSidebar()
      },
      {
        id: 'cmd-shortcuts',
        category: 'Commands',
        title: 'Keyboard Shortcuts Cheatsheet…',
        subtitle: 'View all keyboard shortcuts and productivity tips (?)',
        icon: <Keyboard size={14} className="text-accent" />,
        action: () => toggleShortcutsModal()
      },
      {
        id: 'cmd-refresh',
        category: 'Commands',
        title: 'Refresh Repository',
        subtitle: 'Reload status, log, branches, and tags',
        icon: <RefreshCw size={14} className="text-dim" />,
        action: () => refresh()
      },
      {
        id: 'cmd-settings',
        category: 'Commands',
        title: 'Open Settings…',
        subtitle: 'Configure fonts, layout, and preferences (Ctrl+,)',
        icon: <Settings size={14} className="text-dim" />,
        action: () => useSettings.getState().openSettings()
      },
      {
        id: 'cmd-git-flow',
        category: 'Commands',
        title: 'Git Flow Operations…',
        subtitle: 'Start or finish feature, release, and hotfix branches',
        icon: <GitMerge size={14} className="text-emerald-400" />,
        action: () => useApp.getState().openGitFlowModal()
      },
      {
        id: 'cmd-usage-guide',
        category: 'Commands',
        title: 'Explore Git Workbench…',
        subtitle: 'Search in-depth guides for Git workflows, recovery, reviews, and workspace tools',
        icon: <Sparkles size={14} className="text-accent" />,
        action: () => useApp.getState().openUsageGuide()
      },
      {
        id: 'cmd-bisect',
        category: 'Commands',
        title: 'Git Bisect Wizard…',
        subtitle: 'Interactively track down bug regression commits using binary search',
        icon: <Target size={14} className="text-rose-400" />,
        action: () => useApp.getState().openBisectModal()
      },
      {
        id: 'cmd-reflog',
        category: 'Commands',
        title: 'Reflog & Recovery…',
        subtitle: 'Find commits and branches moved by reset, rebase, or deletion',
        icon: <History size={14} className="text-amber-400" />,
        action: () => useApp.getState().openReflogModal()
      },
      { id: 'cmd-split-commit', category: 'Commands', title: 'Split Commit…', subtitle: 'Assign files and hunks to smaller commits, preview, then apply', icon: <GitBranch size={14} />, action: () => useApp.setState({ commitSplitOpen: true }) },
      { id: 'cmd-branch-stack', category: 'Commands', title: 'Stacked Branches & Requests…', subtitle: 'Link dependent branches, preview restacks, and retarget requests', icon: <GitBranch size={14} />, action: () => useApp.setState({ branchStackOpen: true }) },
      { id: 'cmd-lfs', category: 'Commands', title: 'Git LFS Manager…', subtitle: 'Track large assets, inspect local objects, and transfer with progress', icon: <Download size={14} />, action: () => useApp.setState({ lfsManagerOpen: true }) },
      { id: 'cmd-sparse', category: 'Commands', title: 'Sparse Checkout…', subtitle: 'Choose folders, preview file changes, and save checkout layouts', icon: <FolderOpen size={14} />, action: () => useApp.setState({ sparseCheckoutOpen: true }) },
      { id: 'cmd-home', category: 'Commands', title: 'Go Home — Repositories & Dashboard', subtitle: 'Open projects, recent repositories, pinned status and hosted requests', icon: <FolderGit2 size={14} />, action: () => { useSettings.getState().closeSettings(); useApp.getState().openHome(); } },
      { id: 'cmd-restore-points', category: 'Commands', title: 'Restore Points…', subtitle: 'Save and recover HEAD, staged, unstaged, and untracked changes', icon: <History size={14} />, action: () => useApp.setState({ restorePointsOpen: true }) },
      { id: 'cmd-resolution-memory', category: 'Commands', title: 'Conflict Resolution Memory…', subtitle: 'Remember reviewed resolutions and preview suggestions', icon: <GitMerge size={14} />, action: () => useApp.setState({ resolutionMemoryOpen: true }) },
      { id: 'cmd-range-comparison', category: 'Commands', title: 'Rebase & Rewrite Comparison…', subtitle: 'Compare patches before and after a rebase, squash, drop, or reword', icon: <GitCompare size={14} />, action: () => useApp.setState({ rangeComparisonOpen: true, rangeComparisonId: null }) },
      {
        id: 'cmd-changelog',
        category: 'Commands',
        title: 'Generate Release Changelog…',
        subtitle: 'Synthesize conventional commits into grouped release notes with Markdown/JSON export',
        icon: <FileText size={14} className="text-cyan-400" />,
        action: () => useApp.getState().openChangelogModal()
      },
      {
        id: 'cmd-worktrees',
        category: 'Commands',
        title: 'Manage Git Worktrees…',
        subtitle: 'View, add, switch, or remove parallel working trees for active branches',
        icon: <FolderGit2 size={14} className="text-amber-400" />,
        action: () => useApp.getState().openWorktreesModal()
      },
      {
        id: 'cmd-compare-commits',
        category: 'Commands',
        title: 'Compare Two Commits…',
        subtitle: 'Ctrl+Click two commits in the commit graph to view a 2-point diff (A..B)',
        icon: <GitCompare size={14} className="text-cyan-400" />,
        action: () => {
          useApp.getState().notify(
            'info',
            'Ctrl+Click (or Cmd+Click) any two commits in the graph to compare them.',
            'Commit Comparison'
          );
        }
      }
    ];

    // 2. Branches
    const currentBranch = status?.currentBranch;
    for (const b of branches.local) {
      list.push({
        id: `branch-${b.fullName}`,
        category: 'Branches',
        title: `Checkout "${b.name}"`,
        subtitle: b.isCurrent ? 'Currently checked out' : `Local branch ${b.tracking ? `→ ${b.tracking}` : ''}`,
        badge: b.isCurrent ? 'HEAD' : 'local',
        icon: <GitBranch size={14} className={b.isCurrent ? 'text-accent' : 'text-fg/80'} />,
        action: () => {
          if (!b.isCurrent) {
            void runAndRefresh(() => api.checkoutBranch(b.fullName), `Checked out ${b.name}`);
          }
        }
      });
    }

    // 3. Tags
    for (const t of tags) {
      list.push({
        id: `tag-${t.name}`,
        category: 'Tags',
        title: `Tag: ${t.name}`,
        subtitle: `${t.shortHash} · ${t.message || 'Lightweight tag'}`,
        badge: t.shortHash,
        icon: <TagIcon size={14} className="text-amber-400" />,
        action: () => {
          void selectCommit(t.hash);
        }
      });
    }

    // 4. Recent Commits
    if (log?.commits) {
      const recent = log.commits.slice(0, 30);
      for (const c of recent) {
        list.push({
          id: `commit-${c.hash}`,
          category: 'Commits',
          title: c.message,
          subtitle: `${c.shortHash} by ${c.authorName} · ${c.date.slice(0, 10)}`,
          badge: c.shortHash,
          icon: <GitCommit size={14} className="text-dim" />,
          action: () => {
            void selectCommit(c.hash);
          }
        });
      }
    }

    // 5. Working Tree Files
    if (status) {
      const allFiles = [...status.staged, ...status.unstaged];
      const seen = new Set<string>();
      for (const f of allFiles) {
        if (seen.has(f.path)) continue;
        seen.add(f.path);
        list.push({
          id: `file-${f.path}`,
          category: 'Files',
          title: f.path,
          subtitle: `Working tree modified file (${f.status})`,
          badge: f.status,
          icon: <FileText size={14} className="text-accent" />,
          action: () => {
            void openFileDiff({
              commitHash: null,
              filePath: f.path,
              status: f.status
            });
          }
        });
      }
    }

    return list;
  }, [
    isOpen,
    status,
    branches,
    tags,
    log,
    runAndRefresh,
    selectCommit,
    openFileDiff,
    toggleSidebar,
    toggleTerminalDrawer,
    openCreateTagModal,
    openAddRemoteModal,
    toggleShortcutsModal,
    refresh
  ]);

  // Handle prefix scope detection in query
  const effectiveCategory = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (raw.startsWith('>') || raw.startsWith('cmd:')) return 'Commands';
    if (raw.startsWith('@') || raw.startsWith('branch:')) return 'Branches';
    if (raw.startsWith('#') || raw.startsWith('tag:')) return 'Tags';
    if (raw.startsWith('c:') || raw.startsWith('commit:')) return 'Commits';
    if (raw.startsWith('f:') || raw.startsWith('file:')) return 'Files';
    return activeCategory;
  }, [query, activeCategory]);

  const cleanQuery = useMemo(() => {
    return query.trim().replace(QUERY_SCOPE_PREFIX, '').trim().toLowerCase();
  }, [query]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (effectiveCategory !== 'All') {
      list = list.filter((i) => i.category === effectiveCategory);
    }
    if (!cleanQuery) return list;
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(cleanQuery) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(cleanQuery)) ||
        (item.badge && item.badge.toLowerCase().includes(cleanQuery))
    );
  }, [items, effectiveCategory, cleanQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) {
          close();
          selected.action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-xs p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-panel border border-edge rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="relative flex items-center px-4 py-3 border-b border-edge bg-panel2/70">
          <Search size={16} className="text-accent shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, or prefix >commands, @branches, #tags, c:commits, f:files…"
            className="w-full bg-transparent text-sm text-fg placeholder:text-dim outline-hidden border-none p-0 focus:ring-0"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-dim hover:text-fg p-1 rounded"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <span className="ml-2 font-mono text-[10px] text-faint border border-edge rounded px-1.5 py-0.5 select-none shrink-0">
            Esc
          </span>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 px-4 py-1.5 bg-panel2/40 border-b border-edge/60 overflow-x-auto select-none">
          {(['All', 'Commands', 'Branches', 'Tags', 'Commits', 'Files'] as const).map((cat) => {
            const isActive = effectiveCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-accent/20 text-accent font-semibold border border-accent/40'
                    : 'text-dim hover:text-fg hover:bg-panel3 border border-transparent'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-96 overflow-y-auto p-1.5 divide-y divide-edge/20">
          {filteredItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                onClick={() => {
                  close();
                  item.action();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors select-none ${
                  isSelected ? 'bg-accent/15 text-fg' : 'text-fg/80 hover:bg-panel2'
                }`}
              >
                <div className="shrink-0 p-1.5 rounded-md bg-panel3 border border-edge/60">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-fg">
                      {highlightMatch(item.title, cleanQuery)}
                    </span>
                    {item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-panel3 text-dim border border-edge">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.subtitle && (
                    <div className="text-[11px] text-dim truncate mt-0.5">{item.subtitle}</div>
                  )}
                </div>
                <span className="text-[10px] text-faint uppercase tracking-wider font-semibold shrink-0">
                  {item.category}
                </span>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-8 text-center text-xs text-dim">
              No matching {effectiveCategory !== 'All' ? effectiveCategory.toLowerCase() : 'items'} found for "{cleanQuery}"
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-edge bg-panel2/40 flex items-center justify-between text-[11px] text-dim select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-panel3 border border-edge font-mono text-[10px] mr-1">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-panel3 border border-edge font-mono text-[10px] mr-1">↓</kbd>
              navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-panel3 border border-edge font-mono text-[10px] mr-1">↵</kbd>
              run
            </span>
          </div>
          <span>{filteredItems.length} result{filteredItems.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
