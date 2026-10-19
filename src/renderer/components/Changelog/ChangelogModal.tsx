import React, { useState, useEffect } from 'react';
import { X, FileText, Copy, Check, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { ChangelogResult } from '../../../shared/types';

export function ChangelogModal() {
  const isOpen = useApp((s) => s.changelogModalOpen);
  const close = useApp((s) => s.closeChangelogModal);
  const tags = useApp((s) => s.tags);
  const notify = useApp((s) => s.notify);

  const [fromRef, setFromRef] = useState('');
  const [toRef, setToRef] = useState('HEAD');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChangelogResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (tags.length >= 2) {
        setFromRef(tags[1].name);
        setToRef(tags[0].name);
      } else if (tags.length === 1) {
        setFromRef(tags[0].name);
        setToRef('HEAD');
      } else {
        setFromRef('');
        setToRef('HEAD');
      }
    }
  }, [isOpen, tags]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await api.generateChangelog(fromRef.trim(), toRef.trim() || 'HEAD');
      setResult(res);
      if (!res || res.totalCommits === 0) {
        notify('info', 'No commits found in the specified range');
      }
    } catch (err) {
      notify('error', `Failed to generate changelog: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.markdown) return;
    void navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    notify('success', 'Release notes copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Release Notes & Changelog Generator</h2>
              <p className="text-[11px] text-dim">Generate conventional release notes across any commit range or tags</p>
            </div>
          </div>
          <button className="btn-icon !w-7 !h-7 hover:text-fg text-dim" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Inputs row */}
        <div className="p-5 border-b border-edge bg-panel2/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-dim mb-1">From Ref / Tag (Base)</label>
              <input
                type="text"
                className="input w-full font-mono text-xs"
                placeholder="v1.0.0, commit hash, or blank for all"
                value={fromRef}
                onChange={(e) => setFromRef(e.target.value)}
              />
            </div>
            <div className="pt-5 text-dim">
              <ArrowRight size={16} />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-dim mb-1">To Ref / Tag (Target)</label>
              <input
                type="text"
                className="input w-full font-mono text-xs"
                placeholder="HEAD or v1.1.0"
                value={toRef}
                onChange={(e) => setToRef(e.target.value)}
              />
            </div>
            <div className="pt-5">
              <button
                className="btn bg-accent hover:bg-accent-hover text-white text-xs px-4 py-2 font-medium shadow-sm flex items-center gap-1.5"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                <span>Generate</span>
              </button>
            </div>
          </div>

          {/* Quick Tag Pills */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-faint">Tags:</span>
              {tags.slice(0, 8).map((t) => (
                <button
                  key={t.name}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-panel3 hover:bg-panel border border-edge text-dim hover:text-fg transition-colors"
                  onClick={() => setFromRef(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Preview */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[380px]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-dim">
              <Loader2 size={24} className="animate-spin text-cyan-400" />
              <p className="text-xs">Parsing commit log and conventional commit types...</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">
                  Summary ({result.totalCommits} commits categorized):
                </span>
                <span className="text-[11px] font-mono text-dim">
                  {result.fromRef} → {result.toRef}
                </span>
              </div>

              {/* Categorized blocks */}
              <div className="space-y-3">
                {result.categories.map((cat) => (
                  <div key={cat.title} className="p-3 rounded-lg bg-panel2 border border-edge/60">
                    <h4 className="text-xs font-semibold text-fg mb-1.5">{cat.title}</h4>
                    <div className="space-y-1">
                      {cat.items.map((item) => (
                        <div key={item.hash} className="flex items-baseline gap-2 text-xs">
                          <code className="text-[10px] text-cyan-400 shrink-0">{item.shortHash}</code>
                          <span className="text-fg/90 flex-1 truncate">{item.message}</span>
                          <span className="text-[10px] text-faint shrink-0">@{item.author}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Raw Markdown view */}
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-dim mb-1">Markdown Release Notes:</label>
                <textarea
                  readOnly
                  className="input w-full font-mono text-[11px] h-32 text-fg/80 bg-panel3/70 leading-relaxed"
                  value={result.markdown}
                />
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-dim text-xs">
              Select revision range and click "Generate" to create release notes.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-edge bg-panel2/30">
          <span className="text-[11px] text-faint">Formatted in GitHub Markdown</span>
          <div className="flex items-center gap-2">
            <button className="btn text-xs px-3 py-1.5" onClick={close}>
              Close
            </button>
            {result && (
              <button
                className="btn bg-accent hover:bg-accent-hover text-white text-xs px-3.5 py-1.5 font-medium shadow-sm flex items-center gap-1.5"
                onClick={handleCopy}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied!' : 'Copy Markdown'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
