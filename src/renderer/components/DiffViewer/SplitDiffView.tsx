import React from 'react';
import { DiffHunk } from '../../../shared/types';
import { alignHunkLinesForSplit, InlineDiffPart } from './diffUtils';
import { HunkHeader } from './HunkHeader';

interface SplitDiffViewProps {
  hunks: DiffHunk[];
  isCommitted: boolean;
}

function RenderParts({ parts }: { parts: InlineDiffPart[] }) {
  return (
    <>
      {parts.map((p, idx) => (
        <span
          key={idx}
          className={
            p.isDiff
              ? 'bg-black/30 dark:bg-white/20 underline decoration-dotted font-medium rounded-xs px-0.5'
              : undefined
          }
        >
          {p.text}
        </span>
      ))}
    </>
  );
}

export function SplitDiffView({ hunks }: SplitDiffViewProps) {
  return (
    <div>
      {hunks.map((hunk, hunkIdx) => {
        const rows = alignHunkLinesForSplit(hunk);

        return (
          <div key={hunkIdx} className="border-b border-edge/40">
            <HunkHeader
              hunk={hunk}
              hunkIndex={hunkIdx}
            />

            <div className="code-surface select-text">
              {rows.map((row, rowIdx) => {
                const hasLeftChange = row.left?.kind === 'del';
                const hasRightChange = row.right?.kind === 'add';

                const leftBg = hasLeftChange ? 'bg-del-bg text-del/90' : '';
                const rightBg = hasRightChange ? 'bg-add-bg text-add/90' : '';

                return (
                  <div key={rowIdx} className="flex min-w-full hover:brightness-105 transition-colors">
                    {/* LEFT COLUMN: OLD / DELETED */}
                    <div
                      className={`flex-1 min-w-0 flex items-baseline border-r border-edge/40 ${
                        row.left ? leftBg : 'bg-panel3/30'
                      }`}
                    >
                      {/* Old line number */}
                      <span className="w-[6ch] shrink-0 text-right pr-[1ch] text-faint/70 select-none border-r border-edge/30">
                        {row.left?.lineNo ?? ''}
                      </span>

                      {/* Left marker */}
                      <span className="w-[2ch] shrink-0 text-center select-none opacity-60 font-semibold">
                        {hasLeftChange ? '-' : ' '}
                      </span>

                      {/* Left content */}
                      <span className="whitespace-pre-wrap break-all pr-3 flex-1 min-w-0 py-px">
                        {row.left?.inlineParts ? (
                          <RenderParts parts={row.left.inlineParts} />
                        ) : (
                          row.left?.content ?? ''
                        )}
                      </span>
                    </div>

                    {/* RIGHT COLUMN: NEW / ADDED */}
                    <div
                      className={`flex-1 min-w-0 flex items-baseline ${
                        row.right ? rightBg : 'bg-panel3/30'
                      }`}
                    >
                      {/* New line number */}
                      <span className="w-[6ch] shrink-0 text-right pr-[1ch] text-faint/70 select-none border-r border-edge/30">
                        {row.right?.lineNo ?? ''}
                      </span>

                      {/* Right marker */}
                      <span className="w-[2ch] shrink-0 text-center select-none opacity-60 font-semibold">
                        {hasRightChange ? '+' : ' '}
                      </span>

                      {/* Right content */}
                      <span className="whitespace-pre-wrap break-all pr-3 flex-1 min-w-0 py-px">
                        {row.right?.inlineParts ? (
                          <RenderParts parts={row.right.inlineParts} />
                        ) : (
                          row.right?.content ?? ''
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
