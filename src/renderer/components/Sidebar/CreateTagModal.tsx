import React, { useState } from 'react';
import { Tag as TagIcon, X, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';

export function CreateTagModal() {
  const commitHash = useApp((s) => s.tagModalCommit);
  const close = () => useApp.setState({ tagModalCommit: null });
  const remotes = useApp((s) => s.remotes);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [pushImmediately, setPushImmediately] = useState(false);
  const [remoteName, setRemoteName] = useState(remotes[0]?.name || 'origin');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!commitHash) return null;

  const targetCommit = commitHash === 'HEAD' ? 'HEAD' : commitHash.slice(0, 7);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      notify('error', 'Tag name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await runAndRefresh(async () => {
        await api.createTag(
          trimmedName,
          commitHash === 'HEAD' ? undefined : commitHash,
          message.trim() || undefined
        );

        if (pushImmediately && remoteName) {
          await api.pushTag(trimmedName, remoteName);
        }
      }, `Tag '${trimmedName}' created${pushImmediately ? ` and pushed to ${remoteName}` : ''}`);

      if (ok) {
        close();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-panel border border-edge rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-panel2/60">
          <div className="flex items-center gap-2">
            <TagIcon size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-fg">Create Tag</h2>
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-panel3 text-accent border border-edge">
              {targetCommit}
            </span>
          </div>
          <button
            onClick={close}
            disabled={isSubmitting}
            className="p-1 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          <div>
            <label className="block text-dim mb-1 font-medium">Tag Name *</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. v1.0.0, release-2026-09"
              className="w-full font-mono"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-dim mb-1 font-medium">Tag Message (optional annotation)</label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Leave empty for a lightweight tag..."
              className="w-full resize-none font-sans"
              disabled={isSubmitting}
            />
          </div>

          {remotes.length > 0 && (
            <div className="pt-1 border-t border-edge/40">
              <label className="flex items-center gap-2 cursor-pointer select-none text-fg/90">
                <input
                  type="checkbox"
                  checked={pushImmediately}
                  onChange={(e) => setPushImmediately(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-edge"
                />
                <span>Push tag to remote immediately</span>
              </label>

              {pushImmediately && (
                <div className="mt-2 pl-5 flex items-center gap-2">
                  <span className="text-dim">Remote:</span>
                  <select
                    value={remoteName}
                    onChange={(e) => setRemoteName(e.target.value)}
                    disabled={isSubmitting}
                    className="bg-panel2 border border-edge rounded px-2 py-1 text-xs text-fg"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name} ({r.fetchUrl})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-edge/60">
            <button
              type="button"
              onClick={close}
              disabled={isSubmitting}
              className="btn text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <TagIcon size={12} />
              {isSubmitting ? 'Creating...' : 'Create Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
