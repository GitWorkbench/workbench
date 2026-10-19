import React from 'react';
import { Keyboard, X, Sparkles } from 'lucide-react';
import { useApp } from '../../store';

interface ShortcutGroup {
  category: string;
  items: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navigation & Launchers',
    items: [
      { keys: ['Ctrl+T', 'Cmd+T'], description: 'Open Home: recent repositories and pinned dashboard' },
      { keys: ['Ctrl+K', 'Cmd+K'], description: 'Open Command Palette' },
      { keys: ['Ctrl+P', 'Cmd+P'], description: 'Quick search / Go to file or commit' },
      { keys: ['Ctrl+`', 'Cmd+`'], description: 'Toggle embedded Terminal drawer' },
      { keys: ['Ctrl+B', 'Cmd+B'], description: 'Toggle left sidebar' },
      { keys: ['Ctrl+F', 'Cmd+F'], description: 'Search repositories on Home or filter commits in a workspace' },
      { keys: ['Ctrl+,', 'Cmd+,'], description: 'Open Settings modal' },
      { keys: ['?'], description: 'Toggle keyboard shortcuts cheatsheet' }
    ]
  },
  {
    category: 'Git & Repository Actions',
    items: [
      { keys: ['Ctrl+R', 'F5'], description: 'Refresh repository status and graph' },
      { keys: ['Enter'], description: 'Execute selected command in palette or terminal' },
      { keys: ['Esc'], description: 'Dismiss active modal, diff preview, or palette' },
      { keys: ['Ctrl+Enter'], description: 'Commit staged changes (in commit editor)' }
    ]
  },
  {
    category: 'Diff & Review Experience',
    items: [
      { keys: ['Split / Unified'], description: 'Toggle side-by-side or unified diff mode' },
      { keys: ['Line Selection'], description: 'Stage or discard selected lines with 1 click' },
      { keys: ['Blame'], description: 'Inspect git blame with author and commit info' },
      { keys: ['File History'], description: 'View historical evolution of any file' }
    ]
  },
  {
    category: 'Conflict Resolution & Rebase',
    items: [
      { keys: ['Accept Current'], description: 'Keep current local branch changes' },
      { keys: ['Accept Incoming'], description: 'Accept incoming merge/rebase branch changes' },
      { keys: ['Accept Both'], description: 'Keep both changes and resolve automatically' },
      { keys: ['Interactive Rebase'], description: 'Reorder, squash, pick, or drop commits' }
    ]
  }
];

export function ShortcutsModal() {
  const isOpen = useApp((s) => s.shortcutsModalOpen);
  const close = () => useApp.setState({ shortcutsModalOpen: false });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl bg-panel border border-edge rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-panel2/60">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-fg">Keyboard Shortcuts & Cheatsheet</h2>
          </div>
          <button
            onClick={close}
            className="p-1 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[70vh] space-y-5 text-xs">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="font-semibold text-dim uppercase tracking-wider text-[11px] border-b border-edge/40 pb-1">
                {group.category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-panel2/50 border border-edge/40 hover:border-edge"
                  >
                    <span className="text-fg/90 text-xs">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {item.keys.map((k, ki) => (
                        <kbd
                          key={ki}
                          className="px-1.5 py-0.5 rounded bg-panel3 border border-edge font-mono text-[10px] text-accent select-none shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-edge bg-panel2/40 flex items-center justify-between text-[11px] text-dim select-none">
          <div className="flex items-center gap-1.5 text-accent">
            <Sparkles size={12} />
            <span>Power-User Tip: Press ? anywhere to open this cheatsheet</span>
          </div>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
