import React from 'react';
import { DiffHunk } from '../../../shared/types';
import { HunkHeader } from './HunkHeader';

interface UnifiedDiffViewProps {
  hunks: DiffHunk[];
  isCommitted: boolean;
}

export function UnifiedDiffView({ hunks }: UnifiedDiffViewProps) {
  return (
    <div>
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="border-b border-edge/40">
          <HunkHeader
            hunk={hunk}
            hunkIndex={hunkIdx}
          />

          <div className="code-surface select-text">
            {hunk.lines.map((line, lineIdx) => {
              let rowBg = '';
              if (line.kind === 'add') {
                rowBg = 'bg-add-bg text-add/90';
              } else if (line.kind === 'del') {
                rowBg = 'bg-del-bg text-del/90';
              }

              return (
                <div
                  key={lineIdx}
                  className={`flex items-baseline hover:brightness-110 transition-colors ${rowBg}`}
                >
                  {/* Old line number */}
                  <span className="w-[6ch] shrink-0 text-right pr-[1ch] text-faint/70 select-none border-r border-edge/30">
                    {line.oldNo ?? ''}
                  </span>

                  {/* New line number */}
                  <span className="w-[6ch] shrink-0 text-right pr-[1ch] text-faint/70 select-none border-r border-edge/30">
                    {line.newNo ?? ''}
                  </span>

                  {/* Diff marker */}
                  <span className="w-[2ch] shrink-0 text-center select-none opacity-60 font-semibold">
                    {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                  </span>

                  {/* Content */}
                  <span className="whitespace-pre-wrap break-all pr-4 flex-1 min-w-0 py-px">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
