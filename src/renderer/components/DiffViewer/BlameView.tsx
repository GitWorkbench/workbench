import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, Search, ExternalLink, Calendar, User, GitCommit } from 'lucide-react';
import { BlameLine } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

interface BlameViewProps {
  filePath: string;
}

// Consistent subtle color based on commit hash string
function getCommitColor(hash: string): string {
  let val = 0;
  for (let i = 0; i < hash.length; i++) {
    val = (val * 31 + hash.charCodeAt(i)) & 0xffffff;
  }
  const colors = [
    '#38bdf8', // sky
    '#818cf8', // indigo
    '#c084fc', // purple
    '#f472b6', // pink
    '#fb7185', // rose
    '#fb923c', // orange
    '#facc15', // yellow
    '#4ade80', // green
    '#2dd4bf'  // teal
  ];
  return colors[Math.abs(val) % colors.length];
}

export function BlameView({ filePath }: BlameViewProps) {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const selectCommit = useApp((s) => s.selectCommit);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getBlame(filePath)
      .then((res) => {
        if (active) {
          setLines(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to get blame:', err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    if (!search.trim()) return lines;
    const q = search.toLowerCase();
    return lines.filter(
      (l) =>
        l.author.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.shortHash.toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q)
    );
  }, [lines, search]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-xs py-16">
        <Loader2 size={20} className="animate-spin text-accent" />
        <span>Computing blame annotations...</span>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-dim text-sm py-16">
        <span>No blame information available for this file.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-base font-mono text-xs">
      {/* Search / Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border-b border-edge shrink-0 select-none">
        <Search size={13} className="text-dim shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by author, commit message, hash, or code content..."
          className="bg-transparent border-none outline-none text-xs text-fg placeholder:text-faint flex-1 font-sans"
        />
        {search && (
          <span className="text-[11px] text-dim font-sans">
            {filtered.length} of {lines.length} lines
          </span>
        )}
      </div>

      {/* Blame Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 select-text">
        {filtered.map((line, idx) => {
          const color = getCommitColor(line.commitHash);
          const isSameAsPrev = idx > 0 && filtered[idx - 1].commitHash === line.commitHash;

          return (
            <div
              key={line.lineNo}
              className="flex items-baseline group hover:bg-panel3/70 transition-colors border-b border-edge/10"
            >
              {/* Blame metadata gutter */}
              <div
                className="w-72 shrink-0 flex items-center gap-2 px-2 py-0.5 border-r border-edge/40 bg-panel/40 select-none overflow-hidden relative"
                title={`${line.author} (${line.date})\n${line.summary}\n${line.commitHash}`}
              >
                {/* Colored accent indicator */}
                <div
                  className="w-1 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />

                {!isSameAsPrev ? (
                  <>
                    {/* Clickable Short Hash */}
                    <button
                      className="font-mono text-[11px] hover:underline flex items-center gap-0.5 shrink-0 transition-colors"
                      style={{ color }}
                      onClick={() => selectCommit(line.commitHash)}
                      title={`Jump to commit ${line.shortHash}`}
                    >
                      <GitCommit size={10} />
                      {line.shortHash}
                    </button>

                    {/* Author */}
                    <span className="truncate text-dim/90 font-sans text-[11px] max-w-[90px]">
                      {line.author}
                    </span>

                    {/* Date */}
                    <span className="text-faint text-[10px] shrink-0 font-sans ml-auto">
                      {line.date}
                    </span>
                  </>
                ) : (
                  <span className="text-faint/30 text-[10px] pl-4">〃</span>
                )}
              </div>

              {/* Line number */}
              <span className="code-surface w-[6ch] shrink-0 text-right pr-[1ch] text-faint select-none border-r border-edge/30 py-0.5">
                {line.lineNo}
              </span>

              {/* Code line content */}
              <span className="code-surface whitespace-pre-wrap break-all px-3 py-0.5 flex-1 min-w-0 text-fg/90">
                {line.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
