import React, { useEffect, useState } from 'react';
import { AppLogo } from '../Common/AppLogo';
import { LoadingProgress } from './LoadingProgress';

export function AppLoadingScreen({ isReady }: { isReady: boolean }) {
  const [visible, setVisible] = useState(true);
  const [statusText, setStatusText] = useState('Initializing Git Workbench…');
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    if (isReady) return;

    const timer1 = setTimeout(() => {
      setStatusText('Loading repositories and branch hierarchy…');
      setProgress(35);
    }, 500);

    const timer2 = setTimeout(() => {
      setStatusText('Indexing commit strata & visual graph…');
      setProgress(65);
    }, 1100);

    const timer3 = setTimeout(() => {
      setStatusText('Configuring diff engine & Git Flow workflow…');
      setProgress(85);
    }, 1700);

    const timer4 = setTimeout(() => {
      setStatusText('Synchronizing workspace and tools…');
      setProgress(95);
    }, 2200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [isReady]);

  useEffect(() => {
    if (isReady) {
      setProgress(100);
      setStatusText('Welcome to Git Workbench');
      const timer = setTimeout(() => {
        setVisible(false);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-base transition-opacity duration-500 ease-out motion-reduce:transition-none select-none ${
        isReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6 text-center">
        <div className="mb-5 shrink-0">
          <AppLogo size={64} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-fg mb-2">
          Git <span className="text-accent">Workbench</span>
        </h1>
        <p className="text-xs text-dim mb-7 leading-relaxed">Visual commit strata &amp; effortless Git workflow</p>

        <div className="w-full max-w-[240px] mb-3">
          <LoadingProgress label="Starting Git Workbench" value={progress} />
        </div>

        <div className="min-h-8 text-xs text-dim leading-relaxed" role="status">
          <span>{statusText}</span>
        </div>
      </div>
    </div>
  );
}
