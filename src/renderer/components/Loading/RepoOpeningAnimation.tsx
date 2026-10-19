import React, { useEffect, useState } from 'react';
import { FolderGit2 } from 'lucide-react';
import { AppLogo } from '../Common/AppLogo';
import { LoadingProgress } from './LoadingProgress';
import { useApp } from '../../store';

export function RepoOpeningAnimation() {
  const isOpeningRepo = useApp((s) => s.isOpeningRepo);
  const openingRepoName = useApp((s) => s.openingRepoName);

  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Opening repository…');

  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;

    if (isOpeningRepo) {
      setVisible(true);
      setAnimatingOut(false);
      setStatusMessage('Opening repository…');

      timer1 = setTimeout(() => {
        setStatusMessage('Reading branch hierarchy & commit strata…');
      }, 200);

      timer2 = setTimeout(() => {
        setStatusMessage('Rendering workspace…');
      }, 420);
    } else if (visible) {
      setAnimatingOut(true);
      const closeTimer = setTimeout(() => {
        setVisible(false);
        setAnimatingOut(false);
      }, 350);
      return () => clearTimeout(closeTimer);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpeningRepo, visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-base/75 backdrop-blur-md transition-opacity duration-350 ease-out motion-reduce:transition-none select-none ${
        animatingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-4 p-6 rounded-2xl bg-panel/90 border border-edge/90 shadow-2xl flex flex-col items-center text-center">
        <div className="mb-4 shrink-0">
          <AppLogo size={48} />
        </div>

        {/* Repository Name and Badge */}
        <div className="space-y-1.5 mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent text-[11px] font-semibold tracking-wide">
            <FolderGit2 size={12} />
            <span>Switching Repository</span>
          </div>

          <h3 className="text-base font-bold text-fg tracking-tight truncate max-w-[280px]">
            {openingRepoName || 'Repository'}
          </h3>
        </div>

        <div className="w-full max-w-[240px] mb-3">
          <LoadingProgress label="Opening repository" />
        </div>

        <div className="min-h-8 text-xs text-dim leading-relaxed" role="status">
          <span>{statusMessage}</span>
        </div>
      </div>
    </div>
  );
}
