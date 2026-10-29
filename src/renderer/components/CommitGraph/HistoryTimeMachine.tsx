import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GitBranch, GitCommit, Loader2, Pause, Play, X } from 'lucide-react';
import { BranchInfo, Commit, CommitDetail, FileDiff, HistoryReplay } from '../../../shared/types';
import { api } from '../../lib/api';
import { buildGitGraph } from './gitgraph';
import { GitGraphCanvas } from './GitGraphCanvas';
import { UnifiedDiffView } from '../DiffViewer/UnifiedDiffView';
import './history-time-machine.css';

interface HistoryTimeMachineProps { onClose: () => void }
interface BranchChoice { key: string; branch: string; remote: boolean }

function choicesFor(branches: { local: BranchInfo[]; remote: BranchInfo[] }): BranchChoice[] {
  return [...branches.local.map(item => ({ key: `local:${item.fullName}`, branch: item.fullName, remote: false })),
    ...branches.remote.map(item => ({ key: `remote:${item.fullName}`, branch: item.fullName, remote: true }))];
}

function graphCommit(commit: HistoryReplay['commits'][number]): Commit {
  return { ...commit, message: commit.summary, body: '', refs: [], lane: 0, lanes: [] };
}

export function HistoryTimeMachine({ onClose }: HistoryTimeMachineProps) {
  const [branches, setBranches] = useState<BranchChoice[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [replay, setReplay] = useState<HistoryReplay | null>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState('');
  const replayRequest = useRef(0);
  const detailRequest = useRef(0);
  const diffRequest = useRef(0);

  const loadReplay = async (choice: BranchChoice) => {
    const request = ++replayRequest.current;
    setSelectedBranch(choice.key);
    setLoading(true); setError(''); setPlaying(false); setDetail(null); setSelectedFile(''); setFileDiff(null);
    try {
      const next = await api.getHistoryReplay(choice.branch, choice.remote);
      if (request !== replayRequest.current) return;
      setReplay(next); setPosition(0);
      if (!next.commits.length) setError('This branch has no commits to replay.');
    } catch (reason) {
      if (request === replayRequest.current) { setReplay(null); setError(reason instanceof Error ? reason.message : 'Could not load this branch history.'); }
    } finally {
      if (request === replayRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void api.getBranches().then(value => {
      if (!active) return;
      const available = choicesFor(value);
      setBranches(available);
      const current = value.local.find(branch => branch.isCurrent);
      const initial = available.find(choice => choice.key === `local:${current?.fullName}`) ?? available[0];
      if (initial) void loadReplay(initial);
      else { setError('No local or remote branches are available.'); setLoading(false); }
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Could not load branches.'); setLoading(false); }
    });
    return () => { active = false; replayRequest.current++; detailRequest.current++; diffRequest.current++; };
  }, []);

  const chronological = useMemo(() => [...(replay?.commits ?? [])].reverse(), [replay]);
  const current = chronological[position];
  const visibleGraphCommits = useMemo(() => chronological.slice(0, position + 1).reverse().map(graphCommit), [chronological, position]);
  const graphData = useMemo(() => buildGitGraph(visibleGraphCommits, { rowH: 34, laneW: 24 }), [visibleGraphCommits]);

  useEffect(() => {
    if (!playing || !chronological.length) return;
    if (position >= chronological.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setPosition(value => Math.min(value + 1, chronological.length - 1)), 720);
    return () => window.clearTimeout(timer);
  }, [playing, position, chronological.length]);

  useEffect(() => {
    const request = ++detailRequest.current;
    setDetail(null); setSelectedFile(''); setFileDiff(null); diffRequest.current++;
    if (!current) return;
    void api.getCommitDetail(current.hash).then(value => {
      if (request === detailRequest.current) setDetail(value);
    }).catch(() => {
      if (request === detailRequest.current) setDetail(null);
    });
    return () => { detailRequest.current++; };
  }, [current?.hash]);

  useEffect(() => {
    const request = ++diffRequest.current;
    setFileDiff(null);
    if (!current || !selectedFile) { setFileLoading(false); return; }
    setFileLoading(true);
    void api.getFileDiff(current.hash, selectedFile).then(value => {
      if (request === diffRequest.current) setFileDiff(value);
    }).catch(() => {
      if (request === diffRequest.current) setFileDiff(null);
    }).finally(() => {
      if (request === diffRequest.current) setFileLoading(false);
    });
    return () => { diffRequest.current++; };
  }, [current?.hash, selectedFile]);

  const choosePosition = (next: number) => {
    setPlaying(false);
    setPosition(Math.max(0, Math.min(next, chronological.length - 1)));
  };

  return (
    <section className="history-time-machine" aria-labelledby="history-time-machine-title">
      <header className="flex flex-wrap items-center gap-2 border-b border-edge bg-panel px-3 py-2 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent"><GitBranch size={15} /></span>
          <div className="min-w-0">
            <h2 id="history-time-machine-title" className="text-sm font-semibold text-fg">History time machine</h2>
            <p className="text-[11px] text-dim">Replay a branch and inspect every commit without changing your checkout.</p>
          </div>
        </div>
        <label className="sr-only" htmlFor="history-replay-branch">Branch to replay</label>
        <select id="history-replay-branch" className="max-w-64 rounded border border-edge bg-panel2 px-2 py-1.5 text-xs text-fg" value={selectedBranch} disabled={!branches.length || loading} onChange={event => {
          const choice = branches.find(item => item.key === event.target.value);
          if (choice) void loadReplay(choice);
        }}>
          {branches.map(choice => <option key={choice.key} value={choice.key}>{choice.remote ? 'Remote · ' : ''}{choice.branch}</option>)}
        </select>
        <button type="button" className="btn-secondary !px-2 !py-1.5 text-xs" disabled={!chronological.length} onClick={() => {
          if (position >= chronological.length - 1) setPosition(0);
          setPlaying(value => !value);
        }} aria-label={playing ? 'Pause history replay' : 'Play history replay'}>
          {playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn-icon !h-7 !w-7" title="Back to commit graph" aria-label="Close history time machine" onClick={onClose}><X size={15} /></button>
      </header>

      <div className="history-time-machine__scrubber shrink-0 border-b border-edge bg-panel2/40 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-dim">
          <span>{current ? `Step ${position + 1} of ${chronological.length}` : loading ? 'Loading branch history…' : 'No commits'}</span>
          {current && <span className="max-w-[65%] truncate font-mono text-accent">{current.shortHash} · {current.summary}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-icon !h-6 !w-6" aria-label="Previous commit" disabled={!current || position <= 0} onClick={() => choosePosition(position - 1)}><ChevronLeft size={14} /></button>
          <input aria-label="Replay commit history" type="range" min={0} max={Math.max(0, chronological.length - 1)} value={position} disabled={!current || chronological.length < 2} onChange={event => choosePosition(Number(event.target.value))} className="min-w-0 flex-1 accent-sky-500" />
          <button type="button" className="btn-icon !h-6 !w-6" aria-label="Next commit" disabled={!current || position >= chronological.length - 1} onClick={() => choosePosition(position + 1)}><ChevronRight size={14} /></button>
        </div>
        {replay?.hasMore && <p className="mt-1 text-[10px] text-warn">Showing the latest {replay.commits.length} of {replay.totalCommits} commits.</p>}
      </div>

      <div className="history-time-machine__body min-h-0 flex-1">
        <section className="history-time-machine__graph min-h-0 overflow-auto border-r border-edge" aria-label="Replay graph">
          {loading ? <div className="flex h-full items-center justify-center gap-2 text-xs text-dim"><Loader2 size={16} className="animate-spin" /> Loading branch history…</div> : error ? <div role="status" className="p-4 text-xs text-dim">{error}</div> : <>
            <div className="flex min-w-max items-center gap-2 border-b border-edge/70 px-3 py-2 text-[10px] text-dim"><GitCommit size={12} className="text-accent" />The graph grows as you step forward</div>
            <div className="history-time-machine__canvas" style={{ height: Math.max(44, graphData.height + 16), minWidth: graphData.width + 32 }}>
              <GitGraphCanvas graphData={graphData} rowH={34} laneW={24} onSelect={hash => {
                const index = chronological.findIndex(commit => commit.hash === hash);
                if (index >= 0) choosePosition(index);
              }} />
            </div>
            <div className="border-t border-edge/70 px-3 py-2 text-[10px] text-dim">Oldest loaded commit → current step</div>
          </>}
        </section>

        <section className="history-time-machine__inspection min-h-0">
          <div className="history-time-machine__commit border-b border-edge p-3">
            {!current ? <p className="text-xs text-dim">Select a commit to inspect its files.</p> : <>
              <div className="flex items-start gap-2">
                <GitCommit size={15} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-xs font-semibold text-fg">{current.summary || '(no message)'}</h3>
                  <p className="mt-1 text-[11px] text-dim">{current.authorName || 'Unknown author'} · {current.date ? new Date(current.date).toLocaleString() : 'Unknown date'}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-faint">{current.hash}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-dim">{detail ? `${detail.files.length} changed file${detail.files.length === 1 ? '' : 's'} · +${detail.insertions} −${detail.deletions}` : 'Loading commit details…'}</p>
            </>}
          </div>
          <div className="history-time-machine__files min-h-0 overflow-auto border-b border-edge">
            {detail?.files.map(file => <button key={`${file.path}:${file.status}`} type="button" className={`flex w-full items-center gap-2 border-b border-edge/50 px-3 py-2 text-left text-[11px] hover:bg-panel2 ${selectedFile === file.path ? 'bg-accent/10 text-fg' : 'text-dim'}`} onClick={() => setSelectedFile(file.path)}>
              <span className={`w-4 shrink-0 text-center font-mono ${file.status === 'added' ? 'text-add' : file.status === 'deleted' ? 'text-del' : 'text-accent'}`}>{file.status === 'added' ? '+' : file.status === 'deleted' ? '−' : 'M'}</span>
              <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>{file.path}</span>
              <span className="shrink-0 font-mono text-[10px]"><span className="text-add">+{file.insertions ?? 0}</span> <span className="text-del">−{file.deletions ?? 0}</span></span>
            </button>)}
            {detail && !detail.files.length && <p className="p-3 text-[11px] text-dim">No file changes in this commit.</p>}
          </div>
          <div className="history-time-machine__diff min-h-0 overflow-auto">
            {!selectedFile ? <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-dim">Choose a changed file to inspect its diff at this step.</div> : fileLoading ? <div className="flex h-full items-center justify-center gap-2 text-xs text-dim"><Loader2 size={14} className="animate-spin" /> Loading file diff…</div> : fileDiff?.hunks.length ? <UnifiedDiffView hunks={fileDiff.hunks} isCommitted /> : <div role="status" className="flex h-full items-center justify-center p-4 text-center text-[11px] text-dim">This file is binary, empty, or its diff is unavailable.</div>}
          </div>
        </section>
      </div>
    </section>
  );
}
