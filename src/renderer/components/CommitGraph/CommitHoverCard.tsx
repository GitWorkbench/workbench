import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink, GitCommitHorizontal, Loader2 } from 'lucide-react';
import { Commit, CommitDetail, RemoteInfo } from '../../../shared/types';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';

const detailCache = new Map<string, CommitDetail | null>();
const detailRequests = new Map<string, Promise<CommitDetail | null>>();
const CARD_WIDTH = 500;
const CARD_HEIGHT = 132;
const VIEWPORT_GUTTER = 12;
const POINTER_GAP = 16;

function getGitHubCommitUrl(remotes: RemoteInfo[], hash: string): string | null {
  for (const remote of remotes) {
    for (const url of [remote.fetchUrl, remote.pushUrl]) {
      const match = url.match(/github\.com[:/]([^/\s]+\/[^/\s?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i);
      if (match) return `https://github.com/${match[1]}/commit/${hash}`;
    }
  }
  return null;
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds)) return value;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const count = Math.floor(seconds / 60);
    return `${count} ${count === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (seconds < 86400) {
    const count = Math.floor(seconds / 3600);
    return `${count} ${count === 1 ? 'hour' : 'hours'} ago`;
  }
  if (seconds < 86400 * 30) {
    const count = Math.floor(seconds / 86400);
    return `${count} ${count === 1 ? 'day' : 'days'} ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function fullDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : value;
}

async function loadDetail(hash: string): Promise<CommitDetail | null> {
  if (detailCache.has(hash)) return detailCache.get(hash) ?? null;
  const existing = detailRequests.get(hash);
  if (existing) return existing;

  const request = api.getCommitDetail(hash)
    .then((detail) => {
      detailCache.set(hash, detail);
      return detail;
    })
    .finally(() => detailRequests.delete(hash));
  detailRequests.set(hash, request);
  return request;
}

export function CommitHoverCard({
  commit,
  remotes,
  pointer,
  onMouseEnter,
  onMouseLeave
}: {
  commit: Commit;
  remotes: RemoteInfo[];
  pointer: { x: number; y: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [detail, setDetail] = useState<CommitDetail | null>(detailCache.get(commit.hash) ?? null);
  const [loading, setLoading] = useState(!detailCache.has(commit.hash));
  const [position, setPosition] = useState({ left: 8, top: 8, width: CARD_WIDTH });
  const cardRef = useRef<HTMLDivElement>(null);
  const githubUrl = getGitHubCommitUrl(remotes, commit.hash);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadDetail(commit.hash)
        .then((next) => {
          if (!cancelled) setDetail(next);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [commit.hash]);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const roomRight = window.innerWidth - pointer.x - POINTER_GAP - VIEWPORT_GUTTER;
      const roomLeft = pointer.x - POINTER_GAP - VIEWPORT_GUTTER;
      const width = Math.max(1, Math.min(
        CARD_WIDTH,
        window.innerWidth - VIEWPORT_GUTTER * 2,
        Math.max(280, roomRight, roomLeft)
      ));
      const height = cardRef.current?.getBoundingClientRect().height || CARD_HEIGHT;
      const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER);
      const desiredLeft = roomRight >= width || roomRight >= roomLeft
        ? pointer.x + POINTER_GAP
        : pointer.x - width - POINTER_GAP;
      const left = Math.max(VIEWPORT_GUTTER, Math.min(desiredLeft, maxLeft));

      const roomBelow = window.innerHeight - pointer.y - POINTER_GAP - VIEWPORT_GUTTER;
      const roomAbove = pointer.y - POINTER_GAP - VIEWPORT_GUTTER;
      const desiredTop = roomBelow >= height || roomBelow >= roomAbove
        ? pointer.y + POINTER_GAP
        : pointer.y - height - POINTER_GAP;
      const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - height - VIEWPORT_GUTTER);
      const top = Math.max(VIEWPORT_GUTTER, Math.min(desiredTop, maxTop));

      setPosition((current) => current.left === left && current.top === top && current.width === width
        ? current
        : { left, top, width });
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [pointer.x, pointer.y]);

  return createPortal(
    <div
      ref={cardRef}
      role="group"
      aria-label={`Preview for commit ${commit.shortHash}`}
      className="fixed z-[1200] rounded-md border border-edge bg-panel/95 shadow-2xl backdrop-blur-sm text-xs text-fg pointer-events-auto overflow-hidden"
      style={{ left: position.left, top: position.top, width: position.width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 min-w-0">
        <Avatar name={commit.authorName} email={commit.authorEmail} avatarHash={commit.avatarHash} size={16} />
        <span className="font-semibold text-accent truncate">{commit.authorName || 'Unknown author'}</span>
        <span className="text-faint shrink-0">·</span>
        <span className="text-dim shrink-0">{relativeDate(commit.date)}</span>
        <span className="text-faint truncate">({fullDate(commit.date)})</span>
      </div>
      <div className="px-2.5 py-1.5 border-t border-edge/80 text-fg/90 leading-4 line-clamp-2 break-words">
        {commit.message || '(no message)'}
      </div>
      <div className="px-2.5 py-1.5 border-t border-edge/80 text-dim">
        {loading ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Loading change summary…</span>
        ) : detail ? (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span>{detail.files.length} {detail.files.length === 1 ? 'file' : 'files'} changed,</span>
            <span className="text-add">{detail.insertions} insertion{detail.insertions === 1 ? '' : 's'}(+)</span>
            <span className="text-del">{detail.deletions} deletion{detail.deletions === 1 ? '' : 's'}(-)</span>
          </span>
        ) : (
          <span>Change summary unavailable</span>
        )}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-edge/80 bg-base/30 font-mono text-[11px]">
        <button
          type="button"
          aria-label={`Copy commit hash ${commit.hash}`}
          className="inline-flex items-center gap-1 text-accent hover:text-fg"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard.writeText(commit.hash);
          }}
        >
          <GitCommitHorizontal size={13} className="shrink-0" />
          <span>{commit.shortHash}</span>
          <Copy size={11} />
        </button>
        {detail && <span className="text-faint">· {detail.files.length} files</span>}
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-accent hover:text-fg font-sans"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink size={11} /> Open on GitHub
          </a>
        )}
      </div>
    </div>,
    document.body
  );
}
