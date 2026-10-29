import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';

const MESSAGES = {
  rebase: 'Rebase completed',
  'conflicts-resolved': 'All conflicts resolved'
} as const;

export function MilestoneCelebration() {
  const milestone = useApp(state => state.milestoneCelebration);
  const clear = useApp(state => state.clearMilestoneCelebration);
  const enabled = useSettings(state => state.milestoneAnimations);

  useEffect(() => {
    if (!milestone) return;
    if (!enabled) { clear(milestone.id); return; }
    const timer = window.setTimeout(() => clear(milestone.id), 1800);
    return () => window.clearTimeout(timer);
  }, [milestone, clear, enabled]);

  if (!milestone || !enabled) return null;
  return <div className="milestone-celebration" aria-live="polite" role="status" key={milestone.id}>
    <Sparkles size={14} aria-hidden="true" />
    <span>{MESSAGES[milestone.kind]}</span>
  </div>;
}
