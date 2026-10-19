import React, { useState } from 'react';
import { Globe, X } from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';

export function AddRemoteModal() {
  const isOpen = useApp((s) => s.addRemoteModalOpen);
  const close = () => useApp.setState({ addRemoteModalOpen: false });
  const remotes = useApp((s) => s.remotes);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);

  const [name, setName] = useState(remotes.length === 0 ? 'origin' : '');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (!trimmedName) {
      notify('error', 'Remote name is required');
      return;
    }
    if (!trimmedUrl) {
      notify('error', 'Remote URL is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await runAndRefresh(
        () => api.addRemote(trimmedName, trimmedUrl),
        `Remote '${trimmedName}' added successfully`
      );
      if (ok) {
        setName('');
        setUrl('');
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
            <Globe size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-fg">Add Git Remote</h2>
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
            <label className="block text-dim mb-1 font-medium">Remote Name *</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. origin, upstream, fork"
              className="w-full font-mono"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-dim mb-1 font-medium">Remote URL *</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git or git@..."
              className="w-full font-mono"
              disabled={isSubmitting}
            />
          </div>

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
              disabled={isSubmitting || !name.trim() || !url.trim()}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Globe size={12} />
              {isSubmitting ? 'Adding...' : 'Add Remote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
