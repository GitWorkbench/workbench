import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, GitBranch, GitCommitHorizontal, Lightbulb, Loader2, Play, RefreshCw, Save, Undo2 } from 'lucide-react';
import { playgroundLessons } from '../../../shared/playground-learning';
import { playgroundChallenges } from '../../../shared/playground';
import type { PlaygroundLabSnapshot, PlaygroundSession } from '../../../shared/types';
import { api, unwrap } from '../../lib/api';
import { useExclusiveTask } from '../../lib/useExclusiveTask';

interface Props {
  session: PlaygroundSession;
  onBack(): void;
  onWorkspace(): void;
  onProgress(session: PlaygroundSession): void;
  onLockChange(locked: boolean): void;
  onNext(): void;
}
export function PlaygroundLab({ session, onBack, onWorkspace, onProgress, onLockChange, onNext }: Props) {
  const lesson = playgroundLessons.find(item => item.id === session.challengeId)!;
  const challenge = playgroundChallenges.find(item => item.id === session.challengeId)!;
  const [state, setState] = useState<PlaygroundLabSnapshot | null>(null);
  const [file, setFile] = useState(lesson.files[0]), [draft, setDraft] = useState(''), [original, setOriginal] = useState<string | null>(null);
  const [command, setCommand] = useState(''), [history, setHistory] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<Array<{ command: string; output: string; ok: boolean }>>([]);
  // Reattach only when output changes, keeping the latest result visible without
  // pulling readers away from earlier output while they edit or type a command.
  const followOutput = useCallback((element: HTMLDivElement | null) => {
    if (element) element.scrollTop = element.scrollHeight;
  }, [transcript]);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [reviewStep, setReviewStep] = useState(''), [hint, setHint] = useState(''), [answer, setAnswer] = useState<number | null>(null);
  const alive = useRef(true), selectedFile = useRef(file), historyIndex = useRef(0), prompt = useRef<HTMLInputElement>(null);
  selectedFile.current = file;
  const { busy, run } = useExclusiveTask();
  const dirty = !!state && draft !== (original ?? '');
  const ready = !!state && !loading;
  useEffect(() => { onLockChange(busy || dirty); return () => onLockChange(false); }, [busy, dirty, onLockChange]);
  const adopt = (next: PlaygroundLabSnapshot) => {
    setState(next); onProgress(next.session); setReviewStep('');
    const current = next.files.find(item => item.path === selectedFile.current)!;
    setDraft(current.content); setOriginal(current.exists ? current.content : null);
  };
  useEffect(() => {
    alive.current = true; let current = true;
    setLoading(true);
    void unwrap(api.getPlaygroundLab(session.id)).then(next => { if (current) adopt(next); })
      .catch(reason => { if (current) setError(String(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; alive.current = false; };
  }, [session.id, reload]);
  const perform = (task: () => Promise<void>) => void run(async () => {
    setError('');
    try { await task(); } catch (reason) { if (alive.current) setError(String(reason)); }
  });
  const completed = !!state?.session.completedAt;
  const summary = completed && !reviewStep;
  const step = lesson.steps.find(item => item.id === reviewStep) || lesson.steps.find(item => !state?.steps.includes(item.id)) || lesson.steps[lesson.steps.length - 1];
  const correct = answer === lesson.quiz.answer;
  const execute = () => {
    if (!command.trim() || !state || loading) return;
    if (dirty) { setError('Save or revert your editor draft before running a Git command.'); return; }
    const entered = command.trim();
    perform(async () => {
      const result = await unwrap(api.runPlaygroundCommand(session.id, entered));
      if (!alive.current) return;
      adopt(result.snapshot);
      setTranscript(items => [...items.slice(-19), { command: entered, output: result.output, ok: result.ok }]);
      setHistory(items => [...items.slice(-49), entered]); historyIndex.current = Math.min(history.length + 1, 50);
      setCommand(''); prompt.current?.focus();
    });
  };
  return <div className="playground-lab">
    <div className="playground-lab-toolbar"><button className="btn-secondary" disabled={busy || dirty} onClick={onBack}><ArrowLeft size={13} />Learning path</button><strong>{challenge.title}</strong><span><GitBranch size={13} />{state ? state.branch || 'Detached HEAD' : 'Preparing…'}</span><button className="btn-secondary" disabled={busy || dirty || loading} onClick={onWorkspace}>Open full workspace</button></div>
    {error && <div role="alert" className="playground-lab-error">{error}<button className="btn-secondary" disabled={busy || dirty} onClick={() => { setError(''); setReload(value => value + 1); }}>Reload lesson</button></div>}
    {loading && <p className="playground-lab-loading" role="status"><Loader2 size={16} className="animate-spin" />Preparing your practice desk…</p>}
    <div className="playground-lab-layout">
      <aside className="playground-coach" aria-label="Lesson coach"><p className="text-accent">{lesson.chapter}</p><h2>{summary ? 'You did it.' : step.title}</h2><p>{summary ? lesson.remember : step.why}</p>
        {!summary && <><div className="playground-coach-task"><strong>Try this</strong><p>{step.task}</p></div><div className="playground-command-suggestions">{step.commands.map(value => <button key={value} disabled={busy || dirty} onClick={() => { setCommand(value); prompt.current?.focus(); }}><code>{value}</code><ArrowRight size={12} /></button>)}</div><button className="playground-hint-button" onClick={() => setHint(hint === step.id ? '' : step.id)}><Lightbulb size={14} />{hint === step.id ? 'Hide hint' : 'Show a hint'}</button>{hint === step.id && <p className="playground-coach-hint">{step.hint}</p>}</>}
        <ol className="playground-step-list" aria-label="Lesson steps">{lesson.steps.map((item, index) => <li key={item.id}><button aria-current={step.id === item.id ? 'step' : undefined} onClick={() => setReviewStep(item.id)}>{state?.steps.includes(item.id) ? <CheckCircle2 size={15} className="text-add" /> : <Circle size={15} />}<span>{index + 1}. {item.title}</span></button></li>)}</ol>
        {completed && <section className="playground-quiz" aria-label="Quick understanding check"><h3>One quick check</h3><p>{lesson.quiz.question}</p>{lesson.quiz.options.map((option, index) => <button key={option} aria-pressed={answer === index} onClick={() => setAnswer(index)}>{option}</button>)}{answer !== null && <p role="status" className={correct ? 'text-add' : 'text-warn'}>{correct ? 'Exactly. ' : 'Try again. '}{lesson.quiz.explanation}</p>}<button className="btn-primary" disabled={!correct || busy || dirty} onClick={onNext}>Continue learning<ArrowRight size={13} /></button></section>}
        <details className="playground-concept"><summary>Understand the idea</summary><p>{lesson.concept}</p></details>
      </aside>
      <section className="playground-practice" aria-label="Practice desk">
        <div className="playground-state-flow" role="group" aria-label="Live Git state"><div><span>1 · Working files</span><strong>{state?.changed.length ?? 0} pending</strong><small>{state?.changed.join(', ') || 'Matches the index'}</small></div><ArrowRight size={16} /><div><span>2 · Staging area</span><strong>{state?.staged.length ?? 0} staged</strong><small>{state?.staged.join(', ') || 'Your next commit’s packing list'}</small></div><ArrowRight size={16} /><div><span>3 · History</span><strong>{state?.commits.length ?? 0} snapshots</strong><small>Saved commits stay here</small></div></div>
        {!!state?.conflicts.length && <p role="status" className="text-warn">Merge paused: {state.conflicts.join(', ')} needs a combined result.</p>}
        <div className="playground-editor"><div className="playground-editor-toolbar"><div role="group" aria-label="Practice files">{lesson.files.map(name => <button key={name} aria-pressed={file === name} disabled={busy || dirty || !state} onClick={() => { const next = state!.files.find(item => item.path === name)!; setFile(name); setDraft(next.content); setOriginal(next.exists ? next.content : null); }}>{name}</button>)}</div><span>{dirty ? 'Unsaved draft' : original === null ? 'New file' : 'Saved on disk'}</span></div>
          <textarea aria-label={`${session.challengeId === 'bisect' ? 'Read' : 'Edit'} ${file}`} readOnly={session.challengeId === 'bisect'} value={draft} disabled={!ready || busy} spellCheck={false} onChange={event => setDraft(event.target.value)} />
          <div className="playground-editor-actions">{session.challengeId !== 'bisect' && <><button className="btn-secondary" disabled={!ready || busy || file !== lesson.files[0]} onClick={() => setDraft(lesson.example)}>Insert example</button><button className="btn-secondary" disabled={!dirty || busy} onClick={() => setDraft(original ?? '')}><Undo2 size={12} />Revert draft</button><button className="btn-primary" disabled={!dirty || busy || !ready} onClick={() => perform(async () => { const next = await unwrap(api.savePlaygroundFile(session.id, file, draft, original)); if (alive.current) adopt(next); })}><Save size={12} />Save file</button></>}</div>
        </div>
        <div className="playground-console"><div className="playground-console-heading"><strong>Git practice prompt</strong><span>Real Git in this lesson’s repository · ↑ / ↓ for history</span><button className="btn-icon" aria-label="Refresh practice state" disabled={!state || dirty || busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={13} /></button></div><div ref={followOutput} className="playground-console-output" role="log" aria-label="Practice command output">{transcript.length ? transcript.map((entry, index) => <div key={index}><code>$ {entry.command}</code><pre className={entry.ok ? '' : 'text-warn'}>{entry.output}</pre></div>) : <p>Try a suggested command or type git status. Run executes it and updates the cards above.</p>}</div>
          <form onSubmit={event => { event.preventDefault(); execute(); }}><span aria-hidden="true">$</span><input ref={prompt} aria-label="Git practice command" placeholder="git status" autoComplete="off" spellCheck={false} value={command} disabled={!ready || busy} onChange={event => setCommand(event.target.value)} onKeyDown={event => {
            if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && history.length) { event.preventDefault(); historyIndex.current = Math.max(0, Math.min(history.length, historyIndex.current + (event.key === 'ArrowUp' ? -1 : 1))); setCommand(history[historyIndex.current] || ''); }
          }} /><button className="btn-primary" type="submit" disabled={!ready || busy || dirty || !command.trim()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}Run</button></form>
          <p className="playground-console-note">{dirty ? 'Save or revert the editor draft to continue with Git.' : 'Use the lesson’s Git commands here. Your usual terminal is available in the full workspace.'}</p>
        </div>
        <details className="playground-lab-history"><summary><GitCommitHorizontal size={14} />Repository history · {state?.commits.length ?? 0} commits</summary><ul>{state?.commits.map(commit => <li key={commit.hash}><code>{commit.hash}</code><span>{commit.subject}</span></li>)}</ul></details>
      </section>
    </div>
  </div>;
}
