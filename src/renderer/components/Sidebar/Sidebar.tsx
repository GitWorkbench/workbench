import React, { useState } from 'react';
import {
  List as ListIcon,
  Bot,
  GitBranch,
  Archive,
  Trash2,
  Play,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  GitMerge,
  ArrowUpFromLine,
  ArrowDownToLine,
  ArrowUp,
  Plus,
  RefreshCw,
  Tag as TagIcon,
  Globe,
  Boxes,
  FolderGit2,
  ExternalLink,
  RotateCcw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { CheckoutBranchModal, CheckoutTarget } from './CheckoutBranchModal';
import {
  BranchInfo,
  StashInfo,
  TagInfo,
  RemoteInfo,
  SubmoduleInfo,
  WorktreeInfo
} from '../../../shared/types';

function Section({
  title,
  count,
  children,
  defaultOpen = true,
  action,
  onContextMenu
}: {
  title: string;
  count: number;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-edge/60">
      <div className="flex items-center hover:bg-panel2/40 group">
        <button
          className="flex flex-1 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide text-dim hover:text-fg select-none"
          onClick={() => setOpen((o) => !o)}
          onContextMenu={onContextMenu}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="flex-1 text-left">{title}</span>
          <span className="rounded bg-panel3 px-1.5 text-[10px] text-dim">{count}</span>
        </button>
        {action && <div className="pr-2">{action}</div>}
      </div>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

function BranchRow({
  name,
  current,
  tracking,
  remote,
  onClick,
  onDoubleClick,
  onContextMenu
}: {
  name: string;
  current?: boolean;
  tracking?: string;
  remote?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`group flex w-full items-center gap-2 px-3 py-1 text-sm text-left hover:bg-panel2 select-none cursor-pointer ${
        current ? 'text-accent font-medium' : 'text-fg/90'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={
        current
          ? `${name} (Active branch — click to inspect, right-click for actions)`
          : tracking
          ? `${name} → ${tracking} (Double-click to checkout, right-click for actions)`
          : `${name} (Double-click to checkout, right-click for actions)`
      }
    >
      <GitBranch
        size={12}
        className={`shrink-0 ${current ? 'text-accent' : 'text-faint'}`}
        style={{ transform: remote ? 'rotate(90deg)' : undefined }}
      />
      <span className="truncate flex-1">{name}</span>
      {current && <span className="text-accent text-xs">✓</span>}
    </button>
  );
}

function StashRow({
  stash,
  onContextMenu
}: {
  stash: StashInfo;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const inspectStash = useApp((s) => s.inspectStash);
  const selectedStashIndex = useApp((s) => s.selectedStashIndex);
  const { index, message } = stash;
  const isSelected = selectedStashIndex === index;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1 text-sm select-none cursor-pointer transition-colors ${
        isSelected ? 'bg-purple-500/20 text-purple-300 font-medium' : 'text-fg/90 hover:bg-panel2'
      }`}
      title={`${message} (Click to inspect files, right click for options)`}
      onClick={() => void inspectStash(index)}
      onContextMenu={onContextMenu}
    >
      <Archive size={12} className={`shrink-0 ${isSelected ? 'text-purple-400' : 'text-faint'}`} />
      <span className="truncate flex-1 text-xs">
        #{index} {message}
      </span>
      <span className="flex w-16 shrink-0 justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
        <button
          className="btn-icon !w-5 !h-5"
          title="Pop stash"
          onClick={(e) => {
            e.stopPropagation();
            void runAndRefresh(() => api.stashPop(index), `Popped stash #${index}`);
          }}
        >
          <Play size={11} />
        </button>
        <button
          className="btn-icon !w-5 !h-5"
          title="Apply stash (keep entry)"
          onClick={(e) => {
            e.stopPropagation();
            void runAndRefresh(() => api.stashApply(index), `Applied stash #${index}`);
          }}
        >
          <UploadCloud size={11} />
        </button>
        <button
          className="btn-icon !w-5 !h-5 hover:!text-del"
          title="Drop stash"
          onClick={(e) => {
            e.stopPropagation();
            void runAndRefresh(() => api.stashDrop(index), `Dropped stash #${index}`);
          }}
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}

function TagRow({
  tag,
  onClick,
  onContextMenu
}: {
  tag: TagInfo;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className="group flex w-full items-center gap-2 px-3 py-1 text-sm text-left hover:bg-panel2 select-none text-fg/90"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${tag.name} (${tag.shortHash}) ${tag.message || ''}`}
    >
      <TagIcon size={12} className="shrink-0 text-amber-400/80" />
      <span className="truncate flex-1 font-mono text-xs">{tag.name}</span>
      <span className="text-[10px] text-dim font-mono">{tag.shortHash}</span>
    </button>
  );
}

function RemoteRow({
  remote,
  onContextMenu
}: {
  remote: RemoteInfo;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="group flex flex-col px-3 py-1 text-sm hover:bg-panel2 select-none cursor-pointer text-fg/90"
      onContextMenu={onContextMenu}
      title={`${remote.name} → ${remote.fetchUrl || remote.pushUrl}`}
    >
      <div className="flex items-center gap-2">
        <Globe size={12} className="shrink-0 text-sky-400/80" />
        <span className="truncate flex-1 font-medium text-xs text-sky-300">{remote.name}</span>
      </div>
      <span className="truncate text-[10px] text-faint pl-5 font-mono">
        {remote.fetchUrl || remote.pushUrl}
      </span>
    </div>
  );
}

function SubmoduleRow({
  submodule,
  onClick,
  onContextMenu
}: {
  submodule: SubmoduleInfo;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="group flex items-center gap-2 px-3 py-1 text-sm hover:bg-panel2 select-none cursor-pointer text-fg/90"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${submodule.path} (${submodule.hash.slice(0, 7)})`}
    >
      <Boxes size={12} className="shrink-0 text-emerald-400/80" />
      <span className="truncate flex-1 text-xs font-mono">{submodule.path}</span>
      {submodule.isDirty && (
        <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded font-sans">dirty</span>
      )}
      {!submodule.isInitialized && (
        <span className="text-[9px] px-1 bg-del/20 text-del rounded font-sans">uninit</span>
      )}
      {submodule.isOutOfSync && (
        <span className="text-[9px] px-1 bg-accent/20 text-accent rounded font-sans">sync</span>
      )}
    </div>
  );
}

function WorktreeRow({
  worktree,
  isMain,
  onClick,
  onContextMenu
}: {
  worktree: WorktreeInfo;
  isMain: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const displayName = worktree.branch || worktree.path.split(/[/\\]/).pop() || worktree.path;
  return (
    <div
      className="group flex items-center gap-2 px-3 py-1 text-sm hover:bg-panel2 select-none cursor-pointer text-fg/90"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${worktree.path} (${worktree.branch || 'detached'})`}
    >
      <FolderGit2 size={12} className={`shrink-0 ${isMain ? 'text-accent' : 'text-purple-400/80'}`} />
      <span className="truncate flex-1 text-xs">{displayName}</span>
      {isMain ? (
        <span className="text-[9px] px-1 bg-accent/20 text-accent rounded">main</span>
      ) : (
        <span className="text-[9px] text-dim font-mono">{worktree.hash.slice(0, 7)}</span>
      )}
    </div>
  );
}

export function Sidebar() {
  const visible = useApp((s) => s.sidebarVisible);
  const width = useApp((s) => s.sidebarWidth);
  const branches = useApp((s) => s.branches);
  const tags = useApp((s) => s.tags);
  const remotes = useApp((s) => s.remotes);
  const submodules = useApp((s) => s.submodules);
  const worktrees = useApp((s) => s.worktrees);
  const stashes = useApp((s) => s.stashes);
  const filter = useApp((s) => s.filter);
  const status = useApp((s) => s.status);
  const activeTab = useApp((s) => s.activeTab);

  if (!visible) {
    return (
      <div className="w-10 bg-panel border-r border-edge flex flex-col items-center py-2 shrink-0">
        <button className="btn-icon" title="Show sidebar" onClick={() => useApp.setState({ sidebarVisible: true })}>
          <ListIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <SidebarFull
      width={width}
      branches={branches}
      tags={tags}
      remotes={remotes}
      submodules={submodules}
      worktrees={worktrees}
      stashes={stashes}
      filter={filter}
      status={status}
      activeTab={activeTab}
    />
  );
}

function SidebarFull({
  width,
  branches,
  tags,
  remotes,
  submodules,
  worktrees,
  stashes,
  filter,
  status,
  activeTab
}: {
  width: number;
  branches: ReturnType<typeof useApp.getState>['branches'];
  tags: TagInfo[];
  remotes: RemoteInfo[];
  submodules: SubmoduleInfo[];
  worktrees: WorktreeInfo[];
  stashes: ReturnType<typeof useApp.getState>['stashes'];
  filter: string;
  status: ReturnType<typeof useApp.getState>['status'];
  activeTab: string | null;
}) {
  const q = filter.toLowerCase();
  const locals = [...new Map(branches.local.map((b) => [b.fullName, b] as const)).values()].filter((b) =>
    b.name.toLowerCase().includes(q)
  );
  const remoteBranches = [...new Map(branches.remote.map((b) => [b.fullName, b] as const)).values()].filter((b) =>
    b.fullName.toLowerCase().includes(q)
  );
  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(q));
  const filteredRemotes = remotes.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.fetchUrl && r.fetchUrl.toLowerCase().includes(q))
  );
  const filteredSubmodules = submodules.filter(
    (s) => s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q)
  );
  const filteredWorktrees = worktrees.filter(
    (w) => (w.branch && w.branch.toLowerCase().includes(q)) || w.path.toLowerCase().includes(q)
  );

  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);
  const setFilter = useApp((s) => s.setFilter);
  const setSidebarWidth = useApp((s) => s.setSidebarWidth);
  const openCreateTagModal = useApp((s) => s.openCreateTagModal);
  const openAddRemoteModal = useApp((s) => s.openAddRemoteModal);
  const openWorktreesModal = useApp((s) => s.openWorktreesModal);
  const openSimulateMerge = useApp((s) => s.openSimulateMerge);
  const openRepo = useApp((s) => s.openRepo);
  const selectCommit = useApp((s) => s.selectCommit);
  const log = useApp((s) => s.log);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  const currentBranchName = status?.currentBranch || 'HEAD';
  const isCurrentLocalBranch = (branch: BranchInfo) => branch.isCurrent || branch.name === currentBranchName;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => setSidebarWidth(startW + ev.clientX - startX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Local Branch Context Menu
  const handleLocalBranchContextMenu = (e: React.MouseEvent, b: BranchInfo) => {
    e.preventDefault();
    e.stopPropagation();
    const isCurrent = isCurrentLocalBranch(b);

    const items: ContextMenuItem[] = [
      {
        label: isCurrent ? `Checkout "${b.name}" (Active)` : `Checkout "${b.name}"`,
        icon: <GitBranch size={13} />,
        disabled: isCurrent,
        onClick: () => {
          if (!isCurrent) {
            void runAndRefresh(() => api.checkoutBranch(b.fullName), `Checked out ${b.name}`);
          }
        }
      },
      {
        label: `Create Branch from "${b.name}"…`,
        icon: <Plus size={13} />,
        prompt: {
          placeholder: 'New branch name',
          submitLabel: 'Create Branch',
          onSubmit: (newName) => {
            void runAndRefresh(() => api.createBranch(newName, b.fullName), `Created branch ${newName}`);
          }
        }
      },
      {
        label: `Rename "${b.name}"…`,
        icon: <Pencil size={13} />,
        prompt: {
          placeholder: 'New branch name',
          initial: b.name,
          submitLabel: 'Rename',
          onSubmit: (newName) => {
            void runAndRefresh(() => api.renameBranch(b.name, newName), `Renamed branch to ${newName}`);
          }
        }
      },
      {
        label: `Merge "${b.name}" into "${currentBranchName}"`,
        icon: <GitMerge size={13} />,
        disabled: isCurrent,
        onClick: () => {
          void runAndRefresh(() => api.mergeBranch(b.name), `Merged ${b.name} into ${currentBranchName}`);
        }
      },
      {
        label: `Simulate Merge (Pre-Flight Conflict Check)`,
        icon: <Sparkles size={13} className="text-cyan-400" />,
        disabled: isCurrent,
        onClick: () => {
          openSimulateMerge(b.name);
        }
      },
      {
        label: `Rebase "${currentBranchName}" onto "${b.name}"`,
        icon: <RotateCcw size={13} />,
        disabled: isCurrent,
        onClick: () => {
          void runAndRefresh(() => api.rebaseBranch(b.name), `Rebased ${currentBranchName} onto ${b.name}`);
        }
      },
      { label: '', divider: true },
      {
        label: `Push "${b.name}" to Origin`,
        icon: <ArrowUpFromLine size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.pushSetUpstream(b.name), `Pushed ${b.name}`);
        }
      },
      {
        label: 'Set Upstream…',
        icon: <ArrowUp size={13} />,
        prompt: {
          placeholder: `Upstream (e.g. origin/${b.name})`,
          initial: b.tracking || `origin/${b.name}`,
          submitLabel: 'Set Upstream',
          onSubmit: (u) => {
            void runAndRefresh(() => api.setUpstream(b.name, u), `Upstream set to ${u}`);
          }
        }
      },
      { label: '', divider: true },
      {
        label: `Delete "${b.name}"`,
        icon: <Trash2 size={13} />,
        danger: true,
        disabled: isCurrent,
        onClick: () => {
          void runAndRefresh(() => api.deleteBranch(b.name, { local: true }), `Deleted ${b.name}`);
        }
      },
      {
        label: `Force Delete "${b.name}"`,
        icon: <Trash2 size={13} />,
        danger: true,
        disabled: isCurrent,
        onClick: () => {
          void runAndRefresh(() => api.deleteBranch(b.name, { local: true, force: true }), `Force deleted ${b.name}`);
        }
      },
      { label: '', divider: true },
      {
        label: 'Copy Branch Name',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(b.name);
          notify('info', `Copied "${b.name}" to clipboard`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Remote Branch Context Menu
  const handleRemoteBranchContextMenu = (e: React.MouseEvent, b: BranchInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const shortName = b.name.includes('/') ? b.name.split('/').slice(1).join('/') : b.name;
    const remoteName = b.name.split('/')[0] || 'origin';

    const items: ContextMenuItem[] = [
      {
        label: `Checkout as Local "${shortName}"`,
        icon: <GitBranch size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.checkoutBranch(b.name), `Checked out ${shortName}`);
        }
      },
      {
        label: `Pull "${b.name}" into "${currentBranchName}"`,
        icon: <ArrowDownToLine size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.pull(), `Pulled from ${b.name}`);
        }
      },
      { label: '', divider: true },
      {
        label: `Delete Remote Branch "${b.name}"`,
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => {
          void runAndRefresh(
            () => api.deleteBranch(shortName, { local: false, remote: true, remoteName, force: true }),
            `Deleted remote branch ${b.name}`
          );
        }
      },
      {
        label: 'Copy Branch Name',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(b.fullName);
          notify('info', `Copied "${b.fullName}" to clipboard`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Tag Context Menu
  const handleTagContextMenu = (e: React.MouseEvent, tag: TagInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const defaultRemote = remotes[0]?.name || 'origin';

    const items: ContextMenuItem[] = [
      {
        label: `Checkout Tag "${tag.name}"`,
        icon: <GitBranch size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.checkoutBranch(tag.name), `Checked out tag ${tag.name} (detached HEAD)`);
        }
      },
      {
        label: `Push Tag "${tag.name}" to Remote…`,
        icon: <ArrowUpFromLine size={13} />,
        prompt: {
          placeholder: 'Remote name (e.g. origin)',
          initial: defaultRemote,
          submitLabel: 'Push Tag',
          onSubmit: (rem) => {
            void runAndRefresh(() => api.pushTag(tag.name, rem || defaultRemote), `Pushed tag ${tag.name} to ${rem || defaultRemote}`);
          }
        }
      },
      {
        label: 'Select in Commit Graph',
        icon: <TagIcon size={13} />,
        onClick: () => {
          void selectCommit(tag.hash);
        }
      },
      { label: '', divider: true },
      {
        label: `Delete Tag "${tag.name}" (Local)`,
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => {
          void runAndRefresh(() => api.deleteTag(tag.name, false), `Deleted tag ${tag.name}`);
        }
      },
      {
        label: `Delete Tag "${tag.name}" on Remote…`,
        icon: <Trash2 size={13} />,
        danger: true,
        prompt: {
          placeholder: 'Remote name (e.g. origin)',
          initial: defaultRemote,
          submitLabel: 'Delete Remote Tag',
          onSubmit: (rem) => {
            void runAndRefresh(
              () => api.deleteTag(tag.name, true, rem || defaultRemote),
              `Deleted tag ${tag.name} on remote ${rem || defaultRemote}`
            );
          }
        }
      },
      { label: '', divider: true },
      {
        label: 'Copy Tag Name',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(tag.name);
          notify('info', `Copied tag "${tag.name}" to clipboard`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Remote Context Menu
  const handleRemoteContextMenu = (e: React.MouseEvent, remote: RemoteInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: `Fetch from "${remote.name}"`,
        icon: <RefreshCw size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.fetch(remote.name), `Fetched from ${remote.name}`);
        }
      },
      {
        label: `Prune Stale Branches on "${remote.name}"`,
        icon: <Trash2 size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.pruneRemote(remote.name), `Pruned stale branches for ${remote.name}`);
        }
      },
      {
        label: `Edit URL for "${remote.name}"…`,
        icon: <Pencil size={13} />,
        prompt: {
          placeholder: 'New remote URL',
          initial: remote.fetchUrl || remote.pushUrl,
          submitLabel: 'Save URL',
          onSubmit: (newUrl) => {
            void runAndRefresh(() => api.setRemoteUrl(remote.name, newUrl), `Updated URL for ${remote.name}`);
          }
        }
      },
      {
        label: `Rename "${remote.name}"…`,
        icon: <Pencil size={13} />,
        prompt: {
          placeholder: 'New remote name',
          initial: remote.name,
          submitLabel: 'Rename',
          onSubmit: (newName) => {
            void runAndRefresh(() => api.renameRemote(remote.name, newName), `Renamed remote to ${newName}`);
          }
        }
      },
      { label: '', divider: true },
      {
        label: `Remove Remote "${remote.name}"`,
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => {
          void runAndRefresh(() => api.removeRemote(remote.name), `Removed remote ${remote.name}`);
        }
      },
      {
        label: 'Copy Remote URL',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(remote.fetchUrl || remote.pushUrl);
          notify('info', `Copied URL for ${remote.name}`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Submodule Context Menu
  const handleSubmoduleContextMenu = (e: React.MouseEvent, sm: SubmoduleInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: `Open Submodule in New Tab`,
        icon: <ExternalLink size={13} />,
        onClick: () => {
          const fullPath = activeTab ? `${activeTab}/${sm.path}` : sm.path;
          void openRepo(fullPath);
        }
      },
      {
        label: `Update / Sync "${sm.name}"`,
        icon: <RefreshCw size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.updateSubmodules(sm.path), `Updated submodule ${sm.name}`);
        }
      },
      { label: '', divider: true },
      {
        label: 'Copy Submodule Path',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(sm.path);
          notify('info', `Copied submodule path "${sm.path}"`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Worktree Context Menu
  const handleWorktreeContextMenu = (e: React.MouseEvent, wt: WorktreeInfo, isMain: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Open Worktree in New Tab',
        icon: <ExternalLink size={13} />,
        onClick: () => {
          void openRepo(wt.path);
        }
      },
      { label: '', divider: true },
      {
        label: 'Remove Worktree',
        icon: <Trash2 size={13} />,
        danger: true,
        disabled: isMain,
        onClick: () => {
          void runAndRefresh(() => api.removeWorktree(wt.path), `Removed worktree at ${wt.path}`);
        }
      },
      {
        label: 'Copy Worktree Path',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(wt.path);
          notify('info', `Copied worktree path "${wt.path}"`);
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Stash Context Menu
  const handleStashContextMenu = (e: React.MouseEvent, s: StashInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: `Pop Stash #${s.index}`,
        icon: <Play size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.stashPop(s.index), `Popped stash #${s.index}`);
        }
      },
      {
        label: `Apply Stash #${s.index}`,
        icon: <UploadCloud size={13} />,
        onClick: () => {
          void runAndRefresh(() => api.stashApply(s.index), `Applied stash #${s.index}`);
        }
      },
      { label: '', divider: true },
      {
        label: `Drop Stash #${s.index}`,
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: () => {
          void runAndRefresh(() => api.stashDrop(s.index), `Dropped stash #${s.index}`);
        }
      },
      {
        label: 'Copy Stash Message',
        icon: <Copy size={13} />,
        onClick: () => {
          void navigator.clipboard.writeText(s.message);
          notify('info', 'Copied stash message');
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleLocalSectionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: 'Create New Branch…',
        icon: <Plus size={13} />,
        prompt: {
          placeholder: 'Branch name',
          submitLabel: 'Create Branch',
          onSubmit: (name) => {
            void runAndRefresh(() => api.createBranch(name), `Created branch ${name}`);
          }
        }
      }
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const totalVisibleCount =
    locals.length +
    remoteBranches.length +
    filteredTags.length +
    filteredRemotes.length +
    filteredSubmodules.length +
    filteredWorktrees.length +
    stashes.length;

  return (
    <div className="relative flex flex-col bg-panel border-r border-edge shrink-0 min-h-0" style={{ width }}>
      {/* List / Agents toggle */}
      <div className="flex items-center gap-1 p-1.5 border-b border-edge">
        <div className="flex rounded bg-panel2 p-0.5 flex-1">
          <button className="flex-1 flex items-center justify-center gap-1 rounded bg-panel3 px-2 py-1 text-xs text-fg font-medium">
            <ListIcon size={12} /> List
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 rounded px-2 py-1 text-xs text-dim hover:text-fg"
            onClick={() => notify('info', 'Agents is a placeholder for a future feature')}
          >
            <Bot size={12} /> Agents
          </button>
        </div>
        <button className="btn-icon" title="Hide sidebar" onClick={() => useApp.setState({ sidebarVisible: false })}>
          <ListIcon size={14} />
        </button>
      </div>

      {/* Filter branches, tags, remotes */}
      <div className="p-1.5 border-b border-edge">
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-faint pointer-events-none" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter branches, tags, remotes…"
            className="w-full text-xs !pl-6.5 !pr-6 py-1 h-7"
          />
          {filter ? (
            <button
              onClick={() => setFilter('')}
              className="absolute right-1.5 text-faint hover:text-fg p-0.5"
              title="Clear filter"
            >
              <X size={11} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* LOCAL BRANCHES */}
        <Section
          title="LOCAL"
          count={locals.length}
          onContextMenu={handleLocalSectionContextMenu}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Create branch"
              onClick={(e) => {
                e.stopPropagation();
                handleLocalSectionContextMenu(e);
              }}
            >
              <Plus size={11} />
            </button>
          }
        >
          {locals.map((b, i) => (
            <BranchRow
              key={`local:${b.fullName}:${i}`}
              name={b.name}
              current={isCurrentLocalBranch(b)}
              tracking={b.tracking}
              onClick={() => {
                const targetCommit = log?.commits?.find((c) =>
                  c.refs?.some((r) => r.label === b.name || r.label === b.fullName)
                );
                if (targetCommit) void selectCommit(targetCommit.hash);
                if (isCurrentLocalBranch(b)) {
                  setCheckoutTarget(null);
                  return;
                }
                setCheckoutTarget({
                  name: b.name,
                  fullName: b.fullName,
                  tracking: b.tracking,
                  isRemote: false,
                  branchObj: b
                });
              }}
              onDoubleClick={() => {
                setCheckoutTarget(null);
                if (!isCurrentLocalBranch(b)) {
                  void runAndRefresh(() => api.checkoutBranch(b.fullName), `Checked out ${b.name}`);
                }
              }}
              onContextMenu={(e) => handleLocalBranchContextMenu(e, b)}
            />
          ))}
        </Section>

        {/* REMOTE BRANCHES */}
        <Section
          title="REMOTE BRANCHES"
          count={remoteBranches.length}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Fetch all remotes"
              onClick={(e) => {
                e.stopPropagation();
                void runAndRefresh(() => api.fetch(), 'Fetched from all remotes');
              }}
            >
              <RefreshCw size={11} />
            </button>
          }
        >
          {remoteBranches.map((b, i) => {
            const shortName = b.name.replace(/^remotes\/[^/]+\//, '').replace(/^[^/]+\//, '');
            return (
              <BranchRow
                key={`remote:${b.fullName}:${i}`}
                name={b.fullName}
                remote
                onClick={() => {
                  const targetCommit = log?.commits?.find((c) =>
                    c.refs?.some((r) => r.label === b.name || r.label === b.fullName || r.label.endsWith(shortName))
                  );
                  if (targetCommit) void selectCommit(targetCommit.hash);
                  setCheckoutTarget({
                    name: shortName,
                    fullName: b.fullName,
                    isRemote: true,
                    branchObj: b
                  });
                }}
                onDoubleClick={() => {
                  setCheckoutTarget(null);
                  void runAndRefresh(
                    () => api.checkoutBranch(b.name),
                    `Checked out ${shortName}`
                  );
                }}
                onContextMenu={(e) => handleRemoteBranchContextMenu(e, b)}
              />
            );
          })}
        </Section>

        {/* TAGS */}
        <Section
          title="TAGS"
          count={filteredTags.length}
          defaultOpen={filteredTags.length > 0}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Create tag"
              onClick={(e) => {
                e.stopPropagation();
                openCreateTagModal('HEAD');
              }}
            >
              <Plus size={11} />
            </button>
          }
        >
          {filteredTags.map((t) => (
            <TagRow
              key={t.name}
              tag={t}
              onClick={() => void selectCommit(t.hash)}
              onContextMenu={(e) => handleTagContextMenu(e, t)}
            />
          ))}
          {filteredTags.length === 0 && <div className="px-3 py-1 text-xs text-faint">No tags</div>}
        </Section>

        {/* REMOTES */}
        <Section
          title="REMOTES"
          count={filteredRemotes.length}
          defaultOpen={filteredRemotes.length > 0}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Add remote"
              onClick={(e) => {
                e.stopPropagation();
                openAddRemoteModal();
              }}
            >
              <Plus size={11} />
            </button>
          }
        >
          {filteredRemotes.map((r) => (
            <RemoteRow
              key={r.name}
              remote={r}
              onContextMenu={(e) => handleRemoteContextMenu(e, r)}
            />
          ))}
          {filteredRemotes.length === 0 && <div className="px-3 py-1 text-xs text-faint">No remotes</div>}
        </Section>

        {/* SUBMODULES */}
        <Section
          title="SUBMODULES"
          count={filteredSubmodules.length}
          defaultOpen={filteredSubmodules.length > 0}
          action={
            filteredSubmodules.length > 0 ? (
              <button
                className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Update all submodules"
                onClick={(e) => {
                  e.stopPropagation();
                  void runAndRefresh(() => api.updateSubmodules(), 'Updated all submodules');
                }}
              >
                <RefreshCw size={11} />
              </button>
            ) : undefined
          }
        >
          {filteredSubmodules.map((sm) => (
            <SubmoduleRow
              key={sm.path}
              submodule={sm}
              onClick={() => {
                const fullPath = activeTab ? `${activeTab}/${sm.path}` : sm.path;
                void openRepo(fullPath);
              }}
              onContextMenu={(e) => handleSubmoduleContextMenu(e, sm)}
            />
          ))}
          {filteredSubmodules.length === 0 && <div className="px-3 py-1 text-xs text-faint">No submodules</div>}
        </Section>

        {/* WORKTREES */}
        <Section
          title="WORKTREES"
          count={filteredWorktrees.length}
          defaultOpen={filteredWorktrees.length > 0}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Manage worktrees dashboard"
              onClick={(e) => {
                e.stopPropagation();
                openWorktreesModal();
              }}
            >
              <Plus size={11} />
            </button>
          }
        >
          {filteredWorktrees.map((wt, i) => (
            <WorktreeRow
              key={wt.path}
              worktree={wt}
              isMain={i === 0 || activeTab === wt.path}
              onClick={() => void openRepo(wt.path)}
              onContextMenu={(e) => handleWorktreeContextMenu(e, wt, i === 0 || activeTab === wt.path)}
            />
          ))}
          {filteredWorktrees.length === 0 && <div className="px-3 py-1 text-xs text-faint">No worktrees</div>}
        </Section>

        {/* STASHES */}
        <Section
          title="STASHES"
          count={stashes.length}
          defaultOpen={stashes.length > 0}
          action={
            <button
              className="btn-icon !w-5 !h-5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Stash changes"
              onClick={(e) => {
                e.stopPropagation();
                void runAndRefresh(() => api.stash(), 'Stashed working changes');
              }}
            >
              <Plus size={11} />
            </button>
          }
        >
          {stashes.map((s) => (
            <StashRow
              key={s.index}
              stash={s}
              onContextMenu={(e) => handleStashContextMenu(e, s)}
            />
          ))}
          {stashes.length === 0 && <div className="px-3 py-1 text-xs text-faint">No stashes</div>}
        </Section>
      </div>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent/40 transition-colors"
        onMouseDown={startResize}
      />

      {/* Context Menu Modal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Checkout Branch Confirmation Modal */}
      {checkoutTarget && (
        <CheckoutBranchModal
          target={checkoutTarget}
          currentBranch={currentBranchName}
          onClose={() => setCheckoutTarget(null)}
          onConfirmCheckout={() => {
            const target = checkoutTarget;
            setCheckoutTarget(null);
            if (!target) return;
            if (target.isRemote) {
              void runAndRefresh(
                () => api.checkoutBranch(target.branchObj ? target.branchObj.name : target.fullName),
                `Checked out ${target.name}`
              );
            } else {
              void runAndRefresh(
                () => api.checkoutBranch(target.fullName),
                `Checked out ${target.name}`
              );
            }
          }}
          onMoreActions={() => {
            const target = checkoutTarget;
            setCheckoutTarget(null);
            if (!target) return;
            const syntheticEvent = {
              preventDefault: () => {},
              stopPropagation: () => {},
              clientX: Math.min(width, 240),
              clientY: 200
            } as unknown as React.MouseEvent;

            if (target.isRemote && target.branchObj) {
              handleRemoteBranchContextMenu(syntheticEvent, target.branchObj);
            } else if (target.branchObj) {
              handleLocalBranchContextMenu(syntheticEvent, target.branchObj);
            }
          }}
        />
      )}
    </div>
  );
}
