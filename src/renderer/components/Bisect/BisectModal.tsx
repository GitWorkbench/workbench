import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  XCircle,
  SkipForward,
  RotateCcw,
  Loader2,
  Target,
  Sparkles,
  GitCommit
} from 'lucide-react';
import { useApp, WIP_HASH } from '../../store';
import { api } from '../../lib/api';
import { BisectState } from '../../../shared/types';

export function BisectModal() {
  const isOpen = useApp((s) => s.bisectModalOpen);
  const close = useApp((s) => s.closeBisectModal);
  const runAndRefresh = useApp((s) => s.runAndRefresh);
  const notify = useApp((s) => s.notify);
  const selectedCommit = useApp((s) => s.selectedCommit);

  const [state, setState] = useState<BisectState>({ active: false });
  const [loading, setLoading] = useState(false);
  const [badInput, setBadInput] = useState('');
  const [goodInput, setGoodInput] = useState('');

  const refreshState = async () => {
    try {
      const res = await api.getBisectState();
      setState(res);
      if (res.active) {
        setBadInput(res.needsBad ? 'HEAD' : '');
        setGoodInput('');
      }
    } catch (err) {
      console.error('Failed to get bisect state:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (selectedCommit && selectedCommit !== WIP_HASH) {
        setBadInput(selectedCommit);
      }
      void refreshState();
    }
  }, [isOpen, selectedCommit]);

  if (!isOpen) return null;

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await api.startBisect(state.active && !state.needsBad ? undefined : badInput.trim() || undefined, state.active && !state.needsGood ? undefined : goodInput.trim() || undefined);
      if (!res.ok) throw new Error(res.error || 'Failed to start bisect');
      if (res.state) setState(res.state);
      await runAndRefresh(async () => {}, 'Git bisect session started');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStep = async (verdict: 'good' | 'bad' | 'skip') => {
    setLoading(true);
    try {
      const res = await api.stepBisect(verdict);
      if (!res.ok) throw new Error(res.error || `Failed to mark ${verdict}`);
      if (res.state) setState(res.state);
      await runAndRefresh(async () => {}, `Marked commit as ${verdict}`);
    } catch (err) {
      notify('error', String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await api.resetBisect();
      if (!res.ok) throw new Error(res.error || 'Failed to reset bisect');
      setState({ active: false });
      await runAndRefresh(async () => {}, 'Bisect session terminated and HEAD restored');
      close();
    } catch (err) {
      notify('error', String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-xl bg-panel border border-edge shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge bg-panel2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Search size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg">Interactive Git Bisect Wizard</h2>
              <p className="text-[11px] text-dim">Binary search to locate the regression-causing commit</p>
            </div>
          </div>
          <button className="btn-icon !w-7 !h-7 hover:text-fg text-dim" onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[480px] overflow-y-auto">
          {state.ambiguousCommits?.length ? (
            <div className="space-y-3 text-sm">
              <p className="text-warn">Skipped commits prevent identifying a single culprit.</p>
              <p className="text-dim">The first bad commit is one of these revisions:</p>
              <ul className="font-mono text-xs space-y-1">{state.ambiguousCommits.map(hash => <li key={hash}>{hash}</li>)}</ul>
              <p className="text-dim">Reset bisect, then restart when these revisions can be tested.</p>
            </div>
          ) : state.culpritCommit ? (
            /* Culprit found! */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-del/10 border border-del/30 flex items-start gap-3">
                <Target size={22} className="text-del shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-del bg-del/20 px-2 py-0.5 rounded-full">
                    Culprit Found
                  </span>
                  <h3 className="text-sm font-semibold text-fg mt-2 font-mono">
                    {state.culpritCommit.shortHash}: {state.culpritCommit.message}
                  </h3>
                  <div className="text-xs text-dim mt-1.5 flex items-center gap-2">
                    <span>{state.culpritCommit.authorName} &lt;{state.culpritCommit.authorEmail}&gt;</span>
                    <span>·</span>
                    <span>{state.culpritCommit.date}</span>
                  </div>
                  {state.culpritCommit.body && (
                    <pre className="mt-2 text-xs text-dim/90 font-mono bg-panel3/70 p-2.5 rounded-lg border border-edge whitespace-pre-wrap">
                      {state.culpritCommit.body}
                    </pre>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="btn bg-accent hover:bg-accent-hover text-white text-xs px-4 py-2 font-medium"
                  onClick={handleReset}
                >
                  Finish & Reset HEAD
                </button>
              </div>
            </div>
          ) : state.active && !state.needsGood && !state.needsBad ? (
            /* Active bisect session */
            <div className="space-y-4">
              {state.stepInfo && (
                <div className="p-3 rounded-lg bg-panel2 border border-edge text-xs flex items-center gap-2 text-cyan-300 font-mono">
                  <Sparkles size={14} className="text-cyan-400 shrink-0" />
                  <span>{state.stepInfo}</span>
                </div>
              )}

              {state.currentCommit && (
                <div className="p-4 rounded-xl bg-panel2 border border-edge space-y-2">
                  <div className="flex items-center justify-between text-xs text-dim">
                    <span className="font-semibold text-fg flex items-center gap-1.5">
                      <GitCommit size={14} className="text-accent" /> Currently Testing Commit:
                    </span>
                    <span className="font-mono text-accent bg-accent/15 px-2 py-0.5 rounded">
                      {state.currentCommit.shortHash}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-fg">{state.currentCommit.message}</h4>
                  <div className="text-xs text-dim flex items-center gap-2">
                    <span>{state.currentCommit.authorName}</span>
                    <span>·</span>
                    <span>{state.currentCommit.date}</span>
                  </div>
                </div>
              )}

              <div className="text-xs text-dim">
                Build or run tests now in your project to verify whether the issue exists at this commit.
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <button
                  className="btn flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                  onClick={() => void handleStep('good')}
                  disabled={loading}
                >
                  <CheckCircle2 size={15} />
                  <span>Good (No Bug)</span>
                </button>
                <button
                  className="btn flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold bg-del/15 hover:bg-del/25 text-del border-del/40"
                  onClick={() => void handleStep('bad')}
                  disabled={loading}
                >
                  <XCircle size={15} />
                  <span>Bad (Bug Present)</span>
                </button>
                <button
                  className="btn flex items-center justify-center gap-1.5 py-2.5 text-xs hover:bg-panel3"
                  onClick={() => void handleStep('skip')}
                  disabled={loading}
                >
                  <SkipForward size={14} />
                  <span>Skip Commit</span>
                </button>
              </div>

              {/* Bisect Log */}
              {state.log && state.log.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-dim">Bisect History:</span>
                  <div className="mt-1.5 p-2.5 rounded-lg bg-panel3/60 border border-edge max-h-28 overflow-y-auto text-[11px] font-mono text-dim space-y-1">
                    {state.log.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Start Bisect form */
            <div className="space-y-4">
              <p className="text-xs text-dim leading-relaxed">
                Git bisect checks out intermediate revisions automatically to find the commit that introduced a bug.
              </p>

              <div>
                <label className="block text-xs font-semibold text-dim mb-1">
                  Bad Commit Hash / Tag (where bug exists)
                </label>
                <input
                  type="text"
                  className="input w-full font-mono text-xs"
                  placeholder="HEAD, branch, or commit hash"
                  disabled={state.active && !state.needsBad}
                  value={badInput}
                  onChange={(e) => setBadInput(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-dim mb-1">
                  Good Commit Hash / Tag (older version known to work)
                </label>
                <input
                  type="text"
                  className="input w-full font-mono text-xs"
                  placeholder="e.g. v1.0.0 or commit hash"
                  disabled={state.active && !state.needsGood}
                  value={goodInput}
                  onChange={(e) => setGoodInput(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-edge bg-panel2/30">
          {state.active ? (
            <button
              className="btn text-xs text-del hover:bg-del/10 border-del/30 flex items-center gap-1.5"
              onClick={handleReset}
              disabled={loading}
            >
              <RotateCcw size={13} />
              <span>Abort & Reset Bisect</span>
            </button>
          ) : (
            <span className="text-[11px] text-faint">Will checkout revisions for testing</span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button className="btn text-xs px-3 py-1.5" onClick={close}>
              Close
            </button>
            {(!state.active || state.needsGood || state.needsBad) && (
              <button
                className="btn bg-accent hover:bg-accent-hover text-white text-xs px-3.5 py-1.5 font-medium shadow-sm flex items-center gap-1.5"
                onClick={handleStart}
                disabled={loading || ((!state.active || state.needsBad) && !badInput.trim()) || ((!state.active || state.needsGood) && !goodInput.trim())}
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                <span>{state.active ? 'Set Boundary' : 'Start Bisect'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
