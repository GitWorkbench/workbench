import React, { useEffect, useState } from 'react';
import { Loader2, GitCommit, Calendar, User, ArrowRight, FileDiff as FileDiffIcon } from 'lucide-react';
import { FileHistoryEntry } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

interface FileHistoryViewProps {
  filePath: string;
}

export function FileHistoryView({ filePath }: FileHistoryViewProps) {
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const openFileDiff = useApp((s) => s.openFileDiff);
  const selectCommit = useApp((s) => s.selectCommit);
  const openDiff = useApp((s) => s.openDiff);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getFileHistory(filePath)
      .then((res) => {
        if (active) {
          setHistory(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load file history:', err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-xs py-16">
        <Loader2 size={20} className="animate-spin text-accent" />
        <span>Loading file revision history...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-sm py-16">
        <span>No historical commits found for this file.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-base overflow-y-auto min-h-0 p-4">
      <div className="text-xs text-dim mb-4 flex items-center justify-between border-b border-edge pb-2">
        <span className="font-semibold text-fg">Revisions of {filePath}</span>
        <span>{history.length} commits</span>
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-edge/60">
        {history.map((entry) => {
          const isCurrentActiveDiff = openDiff?.commitHash === entry.hash;

          return (
            <div
              key={entry.hash}
              className={`relative flex flex-col gap-1 p-2.5 rounded-lg border transition-all ${
                isCurrentActiveDiff
                  ? 'bg-accent/10 border-accent/60 shadow-sm'
                  : 'bg-panel/70 border-edge/50 hover:border-edge hover:bg-panel'
              }`}
            >
              {/* Timeline dot */}
              <div
                className={`absolute -left-[22px] top-3.5 w-3 h-3 rounded-full border-2 transition-all ${
                  isCurrentActiveDiff
                    ? 'bg-accent border-base ring-2 ring-accent/40'
                    : 'bg-panel border-dim/50'
                }`}
              />

              {/* Header row: hash, date, author */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="font-mono text-[11px] font-semibold text-accent flex items-center gap-1 bg-panel3 px-1.5 py-0.5 rounded border border-edge/30">
                  <GitCommit size={11} />
                  {entry.shortHash}
                </span>

                <span className="text-dim text-[11px] flex items-center gap-1">
                  <User size={10} />
                  {entry.authorName}
                </span>

                <span className="text-faint text-[10px] ml-auto flex items-center gap-1">
                  <Calendar size={10} />
                  {entry.date.split('T')[0]}
                </span>
              </div>

              {/* Commit subject */}
              <div className="text-xs text-fg font-medium line-clamp-2">
                {entry.summary}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-edge/30">
                <button
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-panel3 hover:bg-accent/20 hover:text-accent text-dim border border-edge/40 transition-colors"
                  title="View this commit's diff for this file"
                  onClick={() => openFileDiff({ commitHash: entry.hash, filePath })}
                >
                  <FileDiffIcon size={11} />
                  <span>View Diff at Commit</span>
                </button>

                <button
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-faint hover:text-fg hover:bg-panel3 transition-colors ml-auto"
                  title="Select and highlight in commit graph"
                  onClick={() => selectCommit(entry.hash)}
                >
                  <span>Go to Commit</span>
                  <ArrowRight size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
