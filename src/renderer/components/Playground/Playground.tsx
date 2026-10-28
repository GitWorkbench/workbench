import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, FlaskConical, Loader2, RotateCcw, Trophy, X } from 'lucide-react';
import { playgroundChallenges } from '../../../shared/playground';
import { playgroundLessons } from '../../../shared/playground-learning';
import { PlaygroundLab } from './PlaygroundLab';
import type { PlaygroundChallengeId, PlaygroundProgress, PlaygroundSession } from '../../../shared/types';
import { api, unwrap } from '../../lib/api';
import { useExclusiveTask } from '../../lib/useExclusiveTask';
import { useApp, WIP_HASH } from '../../store';
import { useSettings } from '../../store/settings';
import './playground.css';

export function Playground() {
  const open = useApp(s => s.playgroundOpen), activeRepo = useApp(s => s.activeTab);
  const home = useApp(s => s.homeOpen), opening = useApp(s => s.isOpeningRepo);
  const settings = useSettings(s => s.isSettingsOpen);
  const [sessions, setSessions] = useState<PlaygroundSession[]>([]);
  const [selected, setSelected] = useState<PlaygroundChallengeId>('git-basics');
  const [labSession, setLabSession] = useState<PlaygroundSession | null>(null), [labLocked, setLabLocked] = useState(false);
  const [reports, setReports] = useState<Record<string, PlaygroundProgress>>({});
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const { busy, run } = useExclusiveTask();
  const busyRef = useRef(false);
  busyRef.current = busy || labLocked;
  const dialog = useRef<HTMLDivElement>(null), alive = useRef(true), toolOpening = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void unwrap(api.listPlaygroundSessions()).then(result => {
      if (current) { setSessions(result.sessions); setWarnings(result.warnings); setError(''); }
    }).catch(reason => { if (current) setError(String(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, activeRepo, reload]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    toolOpening.current = false;
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busyRef.current) useApp.setState({ playgroundOpen: false });
      } else if (event.key === 'Tab') {
        const targets = dialog.current!.querySelectorAll<HTMLElement>('button:not([disabled]), summary, input:not([disabled]), textarea:not([disabled])');
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (!toolOpening.current && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  const activeSession = sessions.find(s => s.path === activeRepo);
  const challenge = playgroundChallenges.find(c => c.id === selected)!;
  const lesson = playgroundLessons.find(item => item.id === selected)!;
  const latest = sessions.find(s => s.challengeId === selected);
  const report = latest && reports[latest.id];
  const completed = new Set(sessions.filter(s => s.completedAt).map(s => s.challengeId));
  const updateSession = (session: PlaygroundSession) => setSessions(current => [session, ...current.filter(s => s.id !== session.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const perform = (task: () => Promise<void>) => void run(async () => {
    setError('');
    try { await task(); } catch (reason) { if (alive.current) setError(String(reason)); }
  });
  const openSession = async (session: PlaygroundSession) => {
    await useApp.getState().openRepo(session.path, { notifyOnSuccess: false });
    if (!alive.current) return;
    if (useApp.getState().activeTab !== session.path) throw new Error('The practice repository could not be opened. Retry Resume; the attempt has been kept.');
    useApp.setState({ playgroundOpen: false });
  };
  const check = (session: PlaygroundSession) => perform(async () => {
    const result = await unwrap(api.checkPlaygroundSession(session.id));
    if (alive.current) { setReports(current => ({ ...current, [session.id]: result })); updateSession(result.session); }
  });
  const openGuided = (id: PlaygroundChallengeId, fresh = false) => perform(async () => {
    const session = !fresh && sessions.find(item => item.challengeId === id) || await unwrap(api.createPlaygroundSession(id));
    if (alive.current) { updateSession(session); setSelected(id); setLabSession(session); }
  });
  const launchTool = (session: PlaygroundSession) => {
    toolOpening.current = true;
    useApp.setState({ playgroundOpen: false });
    const state = useApp.getState();
    if (session.challengeId === 'merge-conflict') useApp.setState({ conflictedFileToResolve: 'settings.json' });
    else if (session.challengeId === 'lost-commit') state.openReflogModal();
    else if (session.challengeId === 'bisect') state.openBisectModal();
    else void state.selectCommit(WIP_HASH);
  };

  return <>
    {activeSession && !home && !settings && <section className="playground-tracker" aria-label="Playground challenge">
      <FlaskConical size={16} className="text-accent" />
      <div className="playground-tracker-copy"><strong>{playgroundChallenges.find(c => c.id === activeSession.challengeId)!.title}</strong><span>{activeSession.completedAt ? 'Challenge complete! Keep exploring or try another challenge.' : playgroundChallenges.find(c => c.id === activeSession.challengeId)!.goal}</span>
        {reports[activeSession.id]?.observation && <span role="status">{reports[activeSession.id].observation}</span>}
        {error && !open && <span role="alert" className="text-del">{error}</span>}
      </div>
      <div className="playground-tracker-actions"><button className="btn-secondary" onClick={() => { setSelected(activeSession.challengeId); setLabSession(null); useApp.setState({ playgroundOpen: true }); }}>Challenge details</button><button className="btn-primary" disabled={busy} onClick={() => check(activeSession)}>{busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Check progress</button></div>
    </section>}
    {open && <div className="playground-overlay">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="playground-title" className={`playground-dialog ${labSession ? 'playground-dialog-lab' : ''}`}>
        <header className="playground-header"><FlaskConical size={21} className="text-accent" /><div><h1 id="playground-title">Git Playground</h1><p>Learn the idea. Try it with real Git. See what changed.</p></div><span className="playground-score"><Trophy size={15} />{completed.size} / {playgroundChallenges.length}</span><button className="btn-icon" aria-label="Close Git Playground" disabled={busy || labLocked} onClick={() => useApp.setState({ playgroundOpen: false })}><X size={17} /></button></header>
        {labSession && error && <div role="alert" className="playground-lab-error">{error}</div>}
        {labSession ? <PlaygroundLab key={labSession.id} session={labSession} onBack={() => setLabSession(null)} onWorkspace={() => perform(async () => { await openSession(labSession); setLabSession(null); })} onProgress={updateSession} onLockChange={setLabLocked} onNext={() => {
          const next = playgroundLessons[playgroundLessons.findIndex(item => item.id === labSession.challengeId) + 1];
          if (next) openGuided(next.id); else setLabSession(null);
        }} /> : <>
        <div className="playground-body">
          <nav className="playground-challenges" aria-label="Playground challenges">{playgroundLessons.map((entry, index) => {
            const item = playgroundChallenges.find(value => value.id === entry.id)!;
            return <React.Fragment key={item.id}>{(!index || playgroundLessons[index - 1].chapter !== entry.chapter) && <h2 className="playground-chapter">{entry.chapter}</h2>}<button aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{completed.has(item.id) ? <CheckCircle2 size={17} className="text-add" /> : <Circle size={17} />}<span><strong>{item.title}</strong><small>{item.level} · {item.minutes} min</small></span></button></React.Fragment>;
          })}</nav>
          <section className="playground-detail" aria-labelledby="challenge-title"><p className="text-accent">Lesson {playgroundLessons.findIndex(item => item.id === selected) + 1} of {playgroundLessons.length} · {lesson.chapter}</p><h2 id="challenge-title">{challenge.title}</h2><p>{challenge.summary}</p><div className="playground-lesson-intro"><strong>Understand the idea</strong><p>{lesson.concept}</p><p className="text-accent">{lesson.remember}</p></div><div className="playground-goal"><strong>Your mission</strong><p>{challenge.goal}</p></div><ol>{lesson.steps.map(step => <li key={step.id}><strong>{step.title}</strong><p>{step.task}</p></li>)}</ol>
            <details className="playground-hint"><summary>Need a hint?</summary><p>{challenge.hint}</p></details>
            {loading && <p role="status">Loading your attempts…</p>}
            {warnings.map(warning => <p key={warning} className="text-warn">{warning}</p>)}
            {error && <div role="alert" className="text-del">{error}<button className="btn-secondary ml-2" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload attempts</button></div>}
            {latest && <div className="playground-attempt"><strong>{latest.completedAt ? 'Challenge completed' : 'Latest attempt'}</strong><p className="selectable break-all">{latest.path}</p><ul aria-label="Challenge progress">{(report?.checks || challenge.checks.map(label => ({ label, passed: !!latest.completedAt }))).map(item => <li key={item.label}>{item.passed ? <CheckCircle2 size={14} className="text-add" /> : <Circle size={14} />}<span>{item.label}</span><span className="sr-only">{item.passed ? 'Complete' : 'Not yet verified'}</span></li>)}</ul>{report?.observation && <p role="status">{report.observation}</p>}
              <div className="playground-buttons"><button className="btn-secondary" disabled={busy || opening} onClick={() => perform(() => openSession(latest))}>Resume attempt</button><button className="btn-secondary" disabled={busy} onClick={() => check(latest)}>Check progress</button>{latest.path === activeRepo && !latest.completedAt && <button className="btn-secondary" disabled={busy} onClick={() => launchTool(latest)}>{challenge.tool}</button>}</div>
            </div>}
          </section>
        </div>
        <footer className="playground-footer"><p>Guided lessons include a practice editor, a Git prompt, and live feedback. Each attempt stays in its own local repository.</p><div className="playground-buttons"><button className="btn-secondary" disabled={loading || busy || opening} title="Create a new attempt in the full workspace" onClick={() => perform(async () => { const session = await unwrap(api.createPlaygroundSession(selected)); if (alive.current) { updateSession(session); await openSession(session); } })}><RotateCcw size={14} />{latest ? 'Start fresh attempt' : 'Start challenge'}</button>{latest && <button className="btn-secondary" disabled={loading || busy} onClick={() => openGuided(selected, true)}>Restart guided lesson</button>}<button className="btn-primary" disabled={loading || busy} onClick={() => openGuided(selected)}>{busy && <Loader2 size={14} className="animate-spin" />}{latest ? 'Resume guided lesson' : 'Start guided lesson'}</button></div></footer>
        </>}
      </div>
    </div>}
  </>;
}
