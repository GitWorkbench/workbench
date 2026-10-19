import React, { useState, useEffect } from 'react';
import { FolderPlus, Folder, X, Check, Loader2, Sparkles, FileText, GitBranch } from 'lucide-react';
import { useApp } from '../../store';
import { api, unwrap } from '../../lib/api';

export function CreateRepoModal() {
  const isOpen = useApp((s) => s.createRepoModalOpen);
  const close = useApp((s) => s.closeCreateRepoModal);
  const openRepo = useApp((s) => s.openRepo);
  const notify = useApp((s) => s.notify);

  const [dirPath, setDirPath] = useState('');
  const [initialBranch, setInitialBranch] = useState('main');
  const [createReadme, setCreateReadme] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState('Node');
  const [createInitialCommit, setCreateInitialCommit] = useState(true);
  const [commitMessage, setCommitMessage] = useState('Initial commit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      const res = await api.selectDirectory('Choose Folder for New Git Repository');
      if (res.ok && res.path) {
        setDirPath(res.path);
        setErrorMessage('');
      }
    } catch (e: unknown) {
      console.error('Failed to select directory', e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPath = dirPath.trim();
    if (!trimmedPath) {
      setErrorMessage('Please specify a directory path for the repository.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = (await unwrap(
        api.initRepo({
          path: trimmedPath,
          initialBranch: initialBranch.trim() || 'main',
          createReadme,
          gitignoreTemplate: gitignoreTemplate === 'None' ? undefined : gitignoreTemplate,
          initialCommitMessage: createInitialCommit ? commitMessage.trim() || 'Initial commit' : undefined
        })
      )) as { ok: boolean; repo?: { path: string; name: string }; error?: string };

      if (res.ok && res.repo) {
        notify('success', `Repository "${res.repo.name}" initialized successfully!`);
        close();
        await openRepo(res.repo.path);
      } else {
        setErrorMessage(res.error || 'Failed to initialize repository.');
      }
    } catch (err: unknown) {
      setErrorMessage(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const folderName = dirPath ? dirPath.split(/[/\\]/).filter(Boolean).pop() || dirPath : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onClick={close}
    >
      <div
        className="w-full max-w-lg bg-panel border border-edge rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge bg-panel2/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <FolderPlus size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg leading-none">Create / Initialize Repository</h2>
              <span className="text-[11px] text-dim">Set up a new local Git repository</span>
            </div>
          </div>
          <button
            onClick={close}
            disabled={isSubmitting}
            className="p-1 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-del-bg/30 border border-del/30 text-del text-xs leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* Directory path */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fg flex items-center justify-between">
              <span>Directory Location *</span>
              {folderName && <span className="font-mono text-accent text-[11px] font-normal">{folderName}</span>}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                placeholder="/path/to/my-new-project"
                disabled={isSubmitting}
                className="flex-1 font-mono text-xs px-3 py-1.5 rounded-lg border border-edge bg-panel2 text-fg focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={isSubmitting}
                className="btn border border-edge bg-panel2 hover:bg-panel3 px-3 py-1.5 text-xs text-fg shrink-0 flex items-center gap-1.5"
              >
                <Folder size={14} className="text-accent" />
                <span>Browse…</span>
              </button>
            </div>
            <span className="text-[11px] text-dim block">
              If the folder does not exist, Git Workbench will automatically create it for you.
            </span>
          </div>

          {/* Initial Branch Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-fg block flex items-center gap-1.5">
                <GitBranch size={13} className="text-accent" />
                <span>Default Branch</span>
              </label>
              <input
                type="text"
                value={initialBranch}
                onChange={(e) => setInitialBranch(e.target.value)}
                placeholder="main"
                disabled={isSubmitting}
                className="w-full font-mono text-xs px-3 py-1.5 rounded-lg border border-edge bg-panel2 text-fg focus:outline-none focus:border-accent"
              />
            </div>

            {/* .gitignore Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-fg block flex items-center gap-1.5">
                <FileText size={13} className="text-dim" />
                <span>.gitignore Template</span>
              </label>
              <select
                value={gitignoreTemplate}
                onChange={(e) => setGitignoreTemplate(e.target.value)}
                disabled={isSubmitting}
                className="w-full text-xs px-3 py-1.5 rounded-lg border border-edge bg-panel2 text-fg focus:outline-none focus:border-accent"
              >
                <option value="None">None</option>
                <option value="Node">Node.js / TypeScript</option>
                <option value="Python">Python</option>
                <option value="Go">Go</option>
                <option value="Rust">Rust</option>
                <option value="General">General (Logs &amp; OS)</option>
              </select>
            </div>
          </div>

          {/* Options: README & Initial Commit */}
          <div className="rounded-lg border border-edge/80 bg-panel2/40 p-3.5 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createReadme}
                onChange={(e) => setCreateReadme(e.target.checked)}
                disabled={isSubmitting}
                className="rounded border-edge text-accent focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-fg font-medium">Initialize repository with README.md</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createInitialCommit}
                onChange={(e) => setCreateInitialCommit(e.target.checked)}
                disabled={isSubmitting}
                className="rounded border-edge text-accent focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-fg font-medium">Create initial commit</span>
            </label>

            {createInitialCommit && (
              <div className="pl-6 pt-1">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Initial commit"
                  disabled={isSubmitting}
                  className="w-full text-xs px-2.5 py-1 rounded border border-edge bg-panel2 text-fg"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-edge/60">
            <button
              type="button"
              onClick={close}
              disabled={isSubmitting}
              className="btn text-xs text-dim hover:text-fg hover:bg-panel3 px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !dirPath.trim()}
              className="btn bg-accent text-white hover:bg-accent-hover text-xs font-medium px-4 py-1.5 shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  <span>Create Repository</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
