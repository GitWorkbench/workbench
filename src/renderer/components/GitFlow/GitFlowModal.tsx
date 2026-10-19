import React, { useState, useEffect } from 'react';
import {
  GitMerge,
  GitBranch,
  X,
  Plus,
  Check,
  AlertCircle,
  Play,
  CheckCircle2,
  Trash2,
  Rocket,
  Package,
  Flame,
  Bug,
  Settings,
  RefreshCw,
  FolderGit2
} from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';
import { GitFlowConfig, GitFlowBranchType } from '../../../shared/types';

interface GitFlowModalProps {
  onClose: () => void;
}

export function GitFlowModal({ onClose }: GitFlowModalProps) {
  const { status, branches, runAndRefresh, notify } = useApp();
  const currentBranch = status?.currentBranch || 'HEAD';

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<GitFlowConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'actions' | 'branches' | 'settings'>('actions');

  // Start branch form state
  const [branchType, setBranchType] = useState<GitFlowBranchType>('feature');
  const [branchName, setBranchName] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Finish branch form state
  const [finishingBranch, setFinishingBranch] = useState<string | null>(null);
  const [tagMessage, setTagMessage] = useState('');
  const [keepBranch, setKeepBranch] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Init form state
  const [initMaster, setInitMaster] = useState('main');
  const [initDevelop, setInitDevelop] = useState('develop');
  const [initFeaturePrefix, setInitFeaturePrefix] = useState('feature/');
  const [initReleasePrefix, setInitReleasePrefix] = useState('release/');
  const [initHotfixPrefix, setInitHotfixPrefix] = useState('hotfix/');
  const [initializing, setInitializing] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const cfg = await api.getGitFlowConfig();
      setConfig(cfg);
      if (cfg) {
        setInitMaster(cfg.masterBranch || 'main');
        setInitDevelop(cfg.developBranch || 'develop');
        setInitFeaturePrefix(cfg.featurePrefix || 'feature/');
        setInitReleasePrefix(cfg.releasePrefix || 'release/');
        setInitHotfixPrefix(cfg.hotfixPrefix || 'hotfix/');
      }
    } catch (err: any) {
      console.error('Failed to load Git Flow config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  // Determine if current branch is a Git Flow branch
  const isCurrentFeature = config && currentBranch.startsWith(config.featurePrefix);
  const isCurrentRelease = config && currentBranch.startsWith(config.releasePrefix);
  const isCurrentHotfix = config && currentBranch.startsWith(config.hotfixPrefix);
  const isCurrentBugfix = config && currentBranch.startsWith(config.bugfixPrefix);
  const isCurrentGitFlowBranch = isCurrentFeature || isCurrentRelease || isCurrentHotfix || isCurrentBugfix;

  // Active Git Flow branches
  const localBranchNames = branches.local.map((b) => b.name);
  const activeFlowBranches = localBranchNames.filter((name) => {
    if (!config) return false;
    return (
      name.startsWith(config.featurePrefix) ||
      name.startsWith(config.releasePrefix) ||
      name.startsWith(config.hotfixPrefix) ||
      name.startsWith(config.bugfixPrefix)
    );
  });

  const handleInitGitFlow = async () => {
    setInitializing(true);
    try {
      const res = await api.initGitFlow({
        masterBranch: initMaster.trim() || 'main',
        developBranch: initDevelop.trim() || 'develop',
        featurePrefix: initFeaturePrefix.trim() || 'feature/',
        releasePrefix: initReleasePrefix.trim() || 'release/',
        hotfixPrefix: initHotfixPrefix.trim() || 'hotfix/',
        bugfixPrefix: 'bugfix/',
        supportPrefix: 'support/',
        versionTagPrefix: 'v'
      });
      if (res && res.ok) {
        notify('success', 'Git Flow initialized successfully!');
        await runAndRefresh(() => Promise.resolve());
        await fetchConfig();
      } else {
        notify('error', res?.error || 'Failed to initialize Git Flow');
      }
    } catch (err: any) {
      notify('error', err.message || 'Initialization failed');
    } finally {
      setInitializing(false);
    }
  };

  const handleStartBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      setStartError('Please enter a branch name or version');
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.startGitFlowBranch({
        type: branchType,
        name: branchName.trim()
      });
      if (res && res.ok) {
        notify('success', `Started ${res.branchName || branchName}`);
        setBranchName('');
        await runAndRefresh(() => Promise.resolve());
        onClose();
      } else {
        setStartError(res?.error || 'Failed to start branch');
      }
    } catch (err: any) {
      setStartError(err.message || 'Error creating Git Flow branch');
    } finally {
      setStarting(false);
    }
  };

  const handleFinishBranch = async (targetBranch: string) => {
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await api.finishGitFlowBranch({
        branchName: targetBranch,
        tagMessage: tagMessage.trim() || undefined,
        keepBranch
      });
      if (res && res.ok) {
        notify('success', `Finished and merged ${targetBranch}`);
        setFinishingBranch(null);
        setTagMessage('');
        await runAndRefresh(() => Promise.resolve());
        await fetchConfig();
      } else {
        setFinishError(res?.error || `Failed to finish branch ${targetBranch}`);
      }
    } catch (err: any) {
      setFinishError(err.message || 'Merge conflict or error during branch finish');
    } finally {
      setFinishing(false);
    }
  };

  const getPrefix = () => {
    if (!config) return '';
    if (branchType === 'feature') return config.featurePrefix;
    if (branchType === 'release') return config.releasePrefix;
    if (branchType === 'hotfix') return config.hotfixPrefix;
    return config.bugfixPrefix;
  };

  const getBaseBranchName = () => {
    if (!config) return 'develop';
    if (branchType === 'hotfix') return config.masterBranch;
    return config.developBranch;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-panel border border-edge rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge bg-panel2/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <GitMerge size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-fg">Git Flow Operations</h2>
                {config?.initialized ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Active
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Uninitialized
                  </span>
                )}
              </div>
              <span className="text-[11px] text-dim">
                Standardized branching lifecycle for features, releases, and hotfixes
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void fetchConfig()}
              className="p-1.5 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
              title="Refresh config"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-dim hover:text-fg hover:bg-panel3 transition-colors"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-4 border-b border-edge bg-panel2/30 gap-1 text-xs">
          <button
            onClick={() => setActiveTab('actions')}
            className={`px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'actions'
                ? 'border-accent text-accent'
                : 'border-transparent text-dim hover:text-fg'
            }`}
          >
            Start &amp; Finish
          </button>
          <button
            onClick={() => setActiveTab('branches')}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'branches'
                ? 'border-accent text-accent'
                : 'border-transparent text-dim hover:text-fg'
            }`}
          >
            <span>Active Flow Branches</span>
            {activeFlowBranches.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-accent/20 text-accent text-[10px] font-semibold">
                {activeFlowBranches.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'settings'
                ? 'border-accent text-accent'
                : 'border-transparent text-dim hover:text-fg'
            }`}
          >
            Configuration
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] text-xs">
          {/* Uninitialized Notice Banner */}
          {!config?.initialized && !loading && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="font-semibold text-fg">Git Flow is not initialized yet</span>
                  <p className="text-[11px] text-dim leading-relaxed">
                    Git Flow needs a production branch (<code className="text-fg font-mono">{initMaster}</code>) and an integration branch (<code className="text-fg font-mono">{initDevelop}</code>). Initialize now with 1 click:
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={initializing}
                  onClick={() => void handleInitGitFlow()}
                  className="btn bg-accent text-white hover:bg-accent-hover text-xs font-semibold px-3 py-1.5 shadow-sm transition-all flex items-center gap-1.5"
                >
                  {initializing ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
                  <span>Initialize Git Flow Now</span>
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: Actions */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              {/* CURRENT BRANCH FINISH BANNER */}
              {isCurrentGitFlowBranch && (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
                        Active Git Flow Branch
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-fg">{currentBranch}</span>
                  </div>

                  <p className="text-[11px] text-dim">
                    {isCurrentFeature
                      ? `Ready to complete this feature? It will merge into ${config?.developBranch} and clean up the feature branch.`
                      : isCurrentRelease
                      ? `Ready to release? It will merge into ${config?.masterBranch}, create a release tag, merge into ${config?.developBranch}, and clean up.`
                      : `Ready to finish hotfix? It will merge into ${config?.masterBranch} & ${config?.developBranch}, create a tag, and clean up.`}
                  </p>

                  {/* Finish Options for current branch */}
                  {finishingBranch === currentBranch ? (
                    <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                      {(isCurrentRelease || isCurrentHotfix) && (
                        <div>
                          <label className="text-[11px] text-dim block mb-1">Annotated Tag Message (Optional):</label>
                          <input
                            type="text"
                            value={tagMessage}
                            onChange={(e) => setTagMessage(e.target.value)}
                            placeholder={`Release ${currentBranch.split('/').pop()}`}
                            className="w-full text-xs"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-[11px] text-dim cursor-pointer">
                        <input
                          type="checkbox"
                          checked={keepBranch}
                          onChange={(e) => setKeepBranch(e.target.checked)}
                          className="rounded border-edge bg-panel3 text-accent"
                        />
                        <span>Keep local branch after finishing (do not delete)</span>
                      </label>
                      {finishError && <div className="text-del text-[11px]">{finishError}</div>}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={finishing}
                          onClick={() => void handleFinishBranch(currentBranch)}
                          className="btn bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-semibold px-3 py-1 flex items-center gap-1.5"
                        >
                          {finishing ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
                          <span>Confirm &amp; Finish {currentBranch}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFinishingBranch(null)}
                          className="btn text-xs text-dim hover:text-fg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFinishingBranch(currentBranch);
                          setTagMessage('');
                          setFinishError(null);
                        }}
                        className="btn bg-emerald-600/90 text-white hover:bg-emerald-500 text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle2 size={13} />
                        <span>Finish Current {isCurrentFeature ? 'Feature' : isCurrentRelease ? 'Release' : 'Hotfix'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* START NEW BRANCH SECTION */}
              <div className="p-4 rounded-xl border border-edge bg-panel2/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fg">Start a New Git Flow Branch</span>
                  <span className="text-[11px] text-dim">
                    Base: <code className="text-accent font-mono font-medium">{getBaseBranchName()}</code>
                  </span>
                </div>

                {/* Branch Type Selector Pills */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBranchType('feature');
                      setStartError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition-all text-xs font-medium ${
                      branchType === 'feature'
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-semibold shadow-xs'
                        : 'bg-panel border-edge text-dim hover:text-fg'
                    }`}
                  >
                    <Rocket size={13} />
                    <span>Feature</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBranchType('release');
                      setStartError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition-all text-xs font-medium ${
                      branchType === 'release'
                        ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 font-semibold shadow-xs'
                        : 'bg-panel border-edge text-dim hover:text-fg'
                    }`}
                  >
                    <Package size={13} />
                    <span>Release</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBranchType('hotfix');
                      setStartError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition-all text-xs font-medium ${
                      branchType === 'hotfix'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-semibold shadow-xs'
                        : 'bg-panel border-edge text-dim hover:text-fg'
                    }`}
                  >
                    <Flame size={13} />
                    <span>Hotfix</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBranchType('bugfix');
                      setStartError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border transition-all text-xs font-medium ${
                      branchType === 'bugfix'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shadow-xs'
                        : 'bg-panel border-edge text-dim hover:text-fg'
                    }`}
                  >
                    <Bug size={13} />
                    <span>Bugfix</span>
                  </button>
                </div>

                {/* Form Input */}
                <form onSubmit={handleStartBranch} className="space-y-3 pt-1">
                  <div>
                    <label className="text-[11px] text-dim block mb-1">
                      {branchType === 'feature'
                        ? 'Feature Name (e.g. user-auth, dark-mode):'
                        : branchType === 'release'
                        ? 'Release Version (e.g. 1.2.0, 2.0.0):'
                        : branchType === 'hotfix'
                        ? 'Hotfix Name or Version (e.g. 1.0.1, fix-crash):'
                        : 'Bugfix Name (e.g. button-align):'}
                    </label>

                    <div className="flex items-center rounded-lg border border-edge bg-panel overflow-hidden focus-within:border-accent">
                      <span className="px-2.5 py-1.5 bg-panel2 text-dim text-xs font-mono select-none border-r border-edge">
                        {getPrefix()}
                      </span>
                      <input
                        type="text"
                        autoFocus
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder={branchType === 'release' ? '1.0.0' : 'my-task'}
                        className="w-full !border-0 text-xs px-2.5 py-1.5 focus:ring-0 bg-transparent font-mono"
                      />
                    </div>
                  </div>

                  {/* Preview of created branch */}
                  <div className="flex items-center justify-between text-[11px] text-dim px-1">
                    <span>
                      Target Branch:{' '}
                      <span className="font-mono text-fg font-medium">
                        {getPrefix()}
                        {branchName.trim() || '…'}
                      </span>
                    </span>
                    <span>
                      Branches off:{' '}
                      <span className="font-mono text-accent font-medium">{getBaseBranchName()}</span>
                    </span>
                  </div>

                  {startError && (
                    <div className="p-2 rounded bg-del/10 border border-del/20 text-del text-[11px]">
                      {startError}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={starting || !branchName.trim()}
                      className="btn bg-accent text-white hover:bg-accent-hover text-xs font-semibold px-4 py-1.5 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {starting ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={14} />}
                      <span>
                        Start {branchType.charAt(0).toUpperCase() + branchType.slice(1)} Branch
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: Branches */}
          {activeTab === 'branches' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">Active Flow Branches</span>
                <span className="text-[11px] text-dim">{activeFlowBranches.length} branch(es) found</span>
              </div>

              {activeFlowBranches.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-edge/60 bg-panel2/30 space-y-2">
                  <FolderGit2 size={24} className="mx-auto text-dim" />
                  <p className="text-dim text-xs">No active feature, release, or hotfix branches.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('actions')}
                    className="btn text-accent text-xs font-medium hover:underline"
                  >
                    Start a new Git Flow branch →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFlowBranches.map((bName) => {
                    const isCur = bName === currentBranch;
                    const isFeat = config && bName.startsWith(config.featurePrefix);
                    const isRel = config && bName.startsWith(config.releasePrefix);
                    const isHot = config && bName.startsWith(config.hotfixPrefix);

                    return (
                      <div
                        key={bName}
                        className={`p-3 rounded-xl border transition-all ${
                          isCur
                            ? 'bg-accent/10 border-accent/30'
                            : 'bg-panel2/40 border-edge/80 hover:bg-panel2/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            {isFeat ? (
                              <Rocket size={14} className="text-cyan-400 shrink-0" />
                            ) : isRel ? (
                              <Package size={14} className="text-indigo-400 shrink-0" />
                            ) : isHot ? (
                              <Flame size={14} className="text-rose-400 shrink-0" />
                            ) : (
                              <GitBranch size={14} className="text-dim shrink-0" />
                            )}
                            <span className="font-mono text-xs font-semibold text-fg truncate">
                              {bName}
                            </span>
                            {isCur && (
                              <span className="px-1.5 py-0.2 rounded bg-accent/20 text-accent text-[9px] font-bold uppercase">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isCur && (
                              <button
                                type="button"
                                onClick={() => {
                                  void runAndRefresh(() => api.checkoutBranch(bName), `Checked out ${bName}`);
                                }}
                                className="btn text-xs text-dim hover:text-fg hover:bg-panel3 px-2 py-1"
                              >
                                Checkout
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setFinishingBranch(bName);
                                setTagMessage('');
                                setFinishError(null);
                              }}
                              className="btn bg-emerald-600/90 text-white hover:bg-emerald-500 text-xs font-medium px-2.5 py-1 flex items-center gap-1"
                            >
                              <CheckCircle2 size={12} />
                              <span>Finish</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline Finish Confirm Box */}
                        {finishingBranch === bName && (
                          <div className="mt-2.5 pt-2.5 border-t border-edge/60 space-y-2">
                            {(isRel || isHot) && (
                              <div>
                                <label className="text-[10px] text-dim block mb-1">
                                  Release Tag Message (Optional):
                                </label>
                                <input
                                  type="text"
                                  value={tagMessage}
                                  onChange={(e) => setTagMessage(e.target.value)}
                                  placeholder={`Release ${bName.split('/').pop()}`}
                                  className="w-full text-xs"
                                />
                              </div>
                            )}

                            <label className="flex items-center gap-2 text-[10px] text-dim cursor-pointer">
                              <input
                                type="checkbox"
                                checked={keepBranch}
                                onChange={(e) => setKeepBranch(e.target.checked)}
                                className="rounded border-edge bg-panel3 text-accent"
                              />
                              <span>Keep branch after finish (do not delete)</span>
                            </label>

                            {finishError && (
                              <div className="text-del text-[11px]">{finishError}</div>
                            )}

                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                disabled={finishing}
                                onClick={() => void handleFinishBranch(bName)}
                                className="btn bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-semibold px-3 py-1 flex items-center gap-1"
                              >
                                {finishing ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} strokeWidth={2.5} />}
                                <span>Confirm Finish &amp; Merge</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setFinishingBranch(null)}
                                className="btn text-xs text-dim hover:text-fg"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE TAB: Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-edge bg-panel2/40 space-y-3">
                <span className="font-semibold text-fg">Branch Names &amp; Prefixes</span>
                <p className="text-[11px] text-dim">
                  Git Flow configuration saved to <code className="text-fg font-mono">.git/config</code>.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-dim block mb-1">Production (Master) Branch:</label>
                    <input
                      type="text"
                      value={initMaster}
                      onChange={(e) => setInitMaster(e.target.value)}
                      className="w-full text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dim block mb-1">Development Branch:</label>
                    <input
                      type="text"
                      value={initDevelop}
                      onChange={(e) => setInitDevelop(e.target.value)}
                      className="w-full text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dim block mb-1">Feature Prefix:</label>
                    <input
                      type="text"
                      value={initFeaturePrefix}
                      onChange={(e) => setInitFeaturePrefix(e.target.value)}
                      className="w-full text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dim block mb-1">Release Prefix:</label>
                    <input
                      type="text"
                      value={initReleasePrefix}
                      onChange={(e) => setInitReleasePrefix(e.target.value)}
                      className="w-full text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dim block mb-1">Hotfix Prefix:</label>
                    <input
                      type="text"
                      value={initHotfixPrefix}
                      onChange={(e) => setInitHotfixPrefix(e.target.value)}
                      className="w-full text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={initializing}
                    onClick={() => void handleInitGitFlow()}
                    className="btn bg-accent text-white hover:bg-accent-hover text-xs font-semibold px-3.5 py-1.5 flex items-center gap-1.5"
                  >
                    {initializing ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                    <span>Save Git Flow Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-edge bg-panel2/50 text-xs">
          <div className="flex items-center gap-2 text-dim text-[11px]">
            <span>Master: <code className="text-fg font-mono">{config?.masterBranch || 'main'}</code></span>
            <span>•</span>
            <span>Develop: <code className="text-fg font-mono">{config?.developBranch || 'develop'}</code></span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn text-xs text-dim hover:text-fg hover:bg-panel3 px-3 py-1.5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
