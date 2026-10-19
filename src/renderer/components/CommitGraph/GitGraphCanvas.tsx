import React, { useState } from 'react';
import { GitGraphData, RenderedGraphCommit } from './gitgraph';
import { LANE_W, ROW_H } from './lanes';
import { gravatarUrl, initials } from '../ui/Avatar';

export interface GitGraphCanvasProps {
  graphData: GitGraphData;
  rowTop?: number;
  rowH?: number;
  laneW?: number;
  selectedHash?: string | null;
  hoveredHash?: string | null;
  hasWip?: boolean;
  visibleRange?: { startIndex: number; endIndex: number };
  onHover?: (hash: string | null, pointer?: { x: number; y: number }) => void;
  onSelect?: (hash: string) => void;
  onContextMenu?: (e: React.MouseEvent, hash: string) => void;
}

const NODE_RADIUS = 9.5;

function CommitAvatarNode({
  commit: c,
  isSelected,
  isHovered,
  onHover,
  onSelect,
  onContextMenu
}: {
  commit: RenderedGraphCommit;
  isSelected: boolean;
  isHovered: boolean;
  onHover?: (hash: string | null, pointer?: { x: number; y: number }) => void;
  onSelect?: (hash: string) => void;
  onContextMenu?: (e: React.MouseEvent, hash: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const clipId = `avatar-clip-${c.hash}`;
  const hasAvatar = !!c.avatarHash && !imgFailed;
  const url = c.avatarHash ? gravatarUrl(c.avatarHash, 48) : '';

  return (
    <g
      transform={`translate(${c.x}, ${c.y})`}
      className="pointer-events-auto cursor-pointer"
      onMouseEnter={(event) => onHover?.(c.hash, { x: event.clientX, y: event.clientY })}
      onMouseLeave={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(c.hash);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, c.hash);
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <circle r={NODE_RADIUS} cx={0} cy={0} />
        </clipPath>
      </defs>

      {/* Invisible hit target for smooth mouse interaction */}
      <circle r={14} fill="transparent" />

      {/* Selection outer ring */}
      {isSelected && (
        <circle
          r={NODE_RADIUS + 3.5}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          className="animate-pulse"
        />
      )}

      {/* Hover outer ring */}
      {isHovered && !isSelected && (
        <circle
          r={NODE_RADIUS + 2.5}
          fill="none"
          stroke={c.color}
          strokeWidth={1.5}
          opacity={0.8}
        />
      )}

      {/* Solid background underneath avatar */}
      <circle r={NODE_RADIUS} fill="#181a1f" />

      {/* Gravatar avatar image or author initials fallback */}
      {hasAvatar ? (
        <image
          href={url}
          x={-NODE_RADIUS}
          y={-NODE_RADIUS}
          width={NODE_RADIUS * 2}
          height={NODE_RADIUS * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <text
          x={0}
          y={1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill="#c0c4ce"
          fontWeight="600"
          className="select-none"
        >
          {initials(c.authorName || '')}
        </text>
      )}

      {/* Colored lane border matching GitKraken style in reference image */}
      <circle
        r={NODE_RADIUS}
        fill="none"
        stroke={c.color}
        strokeWidth={2}
      />
    </g>
  );
}

export function GitGraphCanvas({
  graphData,
  rowTop = 0,
  rowH = ROW_H,
  laneW = LANE_W,
  selectedHash,
  hoveredHash,
  hasWip = false,
  visibleRange,
  onHover,
  onSelect,
  onContextMenu
}: GitGraphCanvasProps) {
  const { commits, branchesPaths, width, height } = graphData;

  const totalHeight = height + rowTop + rowH;
  const originX = laneW / 2 + 8;
  const originY = rowTop + rowH / 2;

  // Newest commit lane position for WIP connection
  const newestCommitX = commits[0]?.x ?? 0;
  const primaryColor = commits[0]?.color ?? '#26c6da';

  return (
    <svg
      width={width}
      height={totalHeight}
      className="absolute top-0 left-0 pointer-events-none select-none overflow-visible"
      style={{ minWidth: width }}
    >
      {/* Branch connecting lines and bezier curves */}
      <g transform={`translate(${originX}, ${originY})`}>
        {branchesPaths.map((bp, i) => (
          <path
            key={`branch-${bp.name}-${i}`}
            d={bp.d}
            fill="none"
            stroke={bp.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.88}
          />
        ))}

        {/* Horizontal connector lines from Branch/Tag column into the node */}
        {commits.map((c, i) =>
          c.hasRefs && (!visibleRange || (i >= visibleRange.startIndex && i <= visibleRange.endIndex)) ? (
            <line
              key={`ref-conn-${c.hash}`}
              x1={-originX}
              y1={c.y}
              x2={c.x}
              y2={c.y}
              stroke={c.color}
              strokeWidth={2}
            />
          ) : null
        )}

        {/* Dotted line to WIP node if uncommitted changes exist */}
        {hasWip && commits.length > 0 && (
          <line
            x1={newestCommitX}
            y1={-rowTop}
            x2={newestCommitX}
            y2={0}
            stroke={primaryColor}
            strokeWidth={2}
            strokeDasharray="3 3"
          />
        )}
      </g>

      {/* WIP commit node at row 0 (dashed circle as in reference image) */}
      {hasWip && (
        <g transform={`translate(${originX + newestCommitX}, ${rowH / 2})`}>
          <circle
            r={NODE_RADIUS}
            fill="#181a1f"
            stroke={primaryColor}
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        </g>
      )}

      {/* Commit nodes with author avatars */}
      <g transform={`translate(${originX}, ${originY})`}>
        {commits.map((c: RenderedGraphCommit, i: number) => {
          if (visibleRange && (i < visibleRange.startIndex || i > visibleRange.endIndex)) {
            return null;
          }
          return (
            <CommitAvatarNode
              key={c.hash}
              commit={c}
              isSelected={selectedHash === c.hash}
              isHovered={hoveredHash === c.hash}
              onHover={onHover}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          );
        })}
      </g>
    </svg>
  );
}
