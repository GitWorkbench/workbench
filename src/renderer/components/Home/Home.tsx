import React, { useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, CircleAlert, Clock3,
  ExternalLink, FolderGit2, FolderOpen, FolderPlus, GitBranch, GitPullRequest,
  Loader2, Pin, PinOff, RefreshCw, Search, Settings2, X
} from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { useHomeRepositories } from './useHomeRepositories';
import type { HomeRepositoryOverview } from './useHomeRepositories';
import './home.css';

type StatusFilter = 'all' | 'changed' | 'attention';
const nameOf = (repo: string) => repo.split(/[/\\]/).filter(Boolean).pop() || repo;
const timeOf = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Home() {
  const recent = useApp(s => s.recentRepos), tabs = useApp(s => s.tabs);
  const opening = useApp(s => s.isOpeningRepo);
  const { pins, rows, initializing, refreshing, pending, mutating, error, refresh, reload, pin, removeRecent } = useHomeRepositories();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<StatusFilter>('all');
  const search = query.trim().toLocaleLowerCase();
  const matches = (repo: string) => repo.toLocaleLowerCase().includes(search);
  const visiblePins = pins.filter(repo => matches(repo) && (
    filter === 'all' || (filter === 'changed' ? !rows[repo]?.error && (rows[repo]?.changed || 0) > 0 : !!rows[repo]?.error || (rows[repo]?.conflicts || 0) > 0)
  ));
  const unpinnedRecent = [...new Set(recent)].filter(repo => !pins.includes(repo));
  const visibleRecent = unpinnedRecent.filter(matches);
  const changed = pins.filter(repo => !rows[repo]?.error && (rows[repo]?.changed || 0) > 0).length;
  const attention = pins.filter(repo => !!rows[repo]?.error || (rows[repo]?.conflicts || 0) > 0).length;
  const unresolved = initializing || pins.some(repo => !rows[repo]);
  const busy = initializing || !!refreshing || !!mutating;
  const open = (repo: string) => {
    if (tabs.some(tab => tab.path === repo)) useApp.getState().setActiveTab(repo);
    else void useApp.getState().openRepo(repo);
  };

  return <main className="home-page" aria-label="Home">
    <div className="home-content">
      <header className="home-hero">
        <div className="home-hero-main">
          <div className="home-hero-heading">
            <div className="home-hero-icon"><FolderGit2 size={25} strokeWidth={1.5} /></div>
            <div><p className="home-eyebrow">GIT WORKBENCH / HOME</p><h1>Your workspace</h1><p className="home-subtitle">Pick up a project, check its status, or start something new.</p></div>
          </div>
          <div className="home-hero-actions">
            <button className="btn-primary home-action" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={15} />Open repository</button>
            <button className="btn-secondary home-action" disabled={opening} onClick={() => useApp.getState().openCreateRepoModal()}><FolderPlus size={15} />Create repository</button>
          </div>
        </div>
        <div className="home-overview" aria-label="Pinned repository summary">
          <Summary icon={<Pin size={14} />} count={initializing ? '—' : pins.length} label="Pinned repositories" />
          <Summary icon={<GitBranch size={14} />} count={unresolved ? '—' : changed} label="With local changes" />
          <Summary icon={<CircleAlert size={14} />} count={unresolved ? '—' : attention} label="Conflicts or unavailable" attention={attention > 0} />
          <p className="home-summary-note"><span className="home-status-dot" />Local status on opening Home. PRs checked on request.</p>
        </div>
      </header>

      {error && <div role="alert" className="home-error"><CircleAlert size={15} /><p>{error}</p><button className="btn-secondary" disabled={busy} onClick={() => void reload()}>Retry</button></div>}

      <div className="home-controls">
        <div className="home-search"><Search size={15} /><input aria-label="Search repositories" placeholder="Search repositories by name or path…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }} />{query && <button className="home-icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</div>
        <div className="home-filters" role="group" aria-label="Filter pinned repositories">
          {([['all', 'All pinned'], ['changed', 'With changes'], ['attention', 'Needs attention']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'is-selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>

      <div className="home-layout">
        <section className="home-pinned" aria-labelledby="home-pinned-title">
          <div className="home-section-heading"><div className="home-section-title"><Pin size={15} /><h2 id="home-pinned-title">Pinned repositories</h2><span className="home-count">{pins.length}</span></div><div className="home-section-actions">
            <button className="home-text-button" disabled={busy || !pins.length} title="Refresh local status without fetching" onClick={() => void refresh(pins)}><RefreshCw size={13} className={refreshing === 'local' ? 'animate-spin' : ''} />Refresh</button>
            <button className="btn-secondary home-check-prs" disabled={busy || !pins.length} onClick={() => void refresh(pins, true)}>{refreshing === 'hosted' ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequest size={13} />}Check PRs / MRs</button>
          </div></div>
          <p className="home-section-description">Your regular projects, with the details that need your attention.</p>
          {initializing ? <div className="home-card-grid" aria-busy="true" aria-label="Loading pinned repositories">{[0, 1].map(i => <div key={i} className="home-card home-skeleton"><span /><span /><span /></div>)}</div> : !pins.length ? <div className="home-empty">
            <div className="home-empty-icon"><Pin size={24} strokeWidth={1.4} /></div><h3>Keep your projects close</h3><p>Pin a repository from the recent list to see its branch, changes, conflicts, and pull requests here.</p><button className="btn-secondary home-action" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={14} />Open a repository</button>
          </div> : !visiblePins.length ? <div className="home-empty home-empty-compact"><Search size={22} className="text-faint" /><h3>No matching pinned repositories</h3><p>Try another name or show all pinned projects.</p><button className="home-text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters<ArrowRight size={13} /></button></div> : <div className={`home-card-grid ${visiblePins.length === 1 ? 'home-card-grid-single' : ''}`}>
            {visiblePins.map(repo => <RepositoryCard key={repo} repo={repo} row={rows[repo]} checking={pending.includes(repo)} hosted={refreshing === 'hosted'} openInTab={tabs.some(t => t.path === repo)} disabled={busy} opening={opening} onOpen={() => open(repo)} onUnpin={() => void pin(repo, false)} />)}
          </div>}
          {!!pins.length && <p className="home-footnote">Ahead / behind uses the last fetch. Refresh reads local status; Check PRs / MRs contacts your configured provider.</p>}
        </section>

        <aside className="home-sidebar" aria-labelledby="home-recent-title">
          <section className="home-recent-panel"><div className="home-recent-heading"><Clock3 size={15} /><h2 id="home-recent-title">Recent repositories</h2><span className="home-count">{unpinnedRecent.length}</span></div><p className="home-recent-description">Open a project or pin it for a closer look.</p>
            <div className="home-recent-list">
              {initializing ? <p className="home-recent-empty">Loading recent repositories…</p> : visibleRecent.length ? visibleRecent.map(repo => <div key={repo} className="home-recent-row">
                <button className="home-recent-open" disabled={opening} onClick={() => open(repo)} title={`Open ${repo}`}><span className="home-recent-icon"><FolderGit2 size={17} /></span><span className="home-recent-name"><strong>{nameOf(repo)}</strong><span title={repo}>{repo}</span></span></button>
                <button className="home-icon-button home-pin-button" aria-label={`Pin ${nameOf(repo)}`} title="Pin repository" disabled={busy} onClick={() => void pin(repo, true)}>{mutating === repo ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}</button>
                <button className="home-icon-button home-remove-button" aria-label={`Remove ${nameOf(repo)} from recent repositories`} title="Remove from recent repositories" disabled={!!mutating} onClick={() => void removeRecent(repo)}><X size={13} /></button>
              </div>) : <div className="home-recent-empty">{search && unpinnedRecent.length ? 'No recent repositories match your search.' : recent.length && !unpinnedRecent.length ? 'All your recent repositories are pinned. Open another project to add it here.' : 'Repositories you open will appear here, ready for next time.'}</div>}
            </div>
            <button className="home-recent-browse" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={14} />Browse for a repository<ArrowRight size={13} /></button>
          </section>
          <section className="home-tools" aria-label="Workspace setup"><h2>Make it yours</h2><button onClick={() => useSettings.getState().openSettings('providers')}><span className="home-tool-icon"><GitPullRequest size={16} /></span><span><strong>Connect your providers</strong><small>GitHub, GitLab &amp; Bitbucket</small></span><ArrowRight size={13} /></button><button onClick={() => useSettings.getState().openSettings()}><span className="home-tool-icon"><Settings2 size={16} /></span><span><strong>Preferences</strong><small>Themes, profiles &amp; Git settings</small></span><ArrowRight size={13} /></button><button onClick={() => useApp.getState().openUsageGuide()}><span className="home-tool-icon"><BookOpen size={16} /></span><span><strong>Explore Git Workbench</strong><small>Step-by-step guides for every workflow</small></span><ArrowRight size={13} /></button></section>
        </aside>
      </div>
    </div>
  </main>;
}

function Summary({ icon, count, label, attention = false }: { icon: React.ReactNode; count: string | number; label: string; attention?: boolean }) {
  return <div className={`home-summary ${attention ? 'home-summary-attention' : ''}`}><span className="home-summary-icon">{icon}</span><strong>{count}</strong><span>{label}</span></div>;
}

function RepositoryCard({ repo, row, checking, hosted, openInTab, disabled, opening, onOpen, onUnpin }: {
  repo: string; row?: HomeRepositoryOverview; checking: boolean; hosted: boolean; openInTab: boolean;
  disabled: boolean; opening: boolean; onOpen: () => void; onUnpin: () => void;
}) {
  const [linkError, setLinkError] = useState('');
  const unavailable = !!row?.error, conflicts = (row?.conflicts || 0) > 0;
  const state = !row ? 'loading' : unavailable || conflicts ? 'attention' : row.changed ? 'changed' : 'clean';
  const label = !row ? 'Loading…' : unavailable ? 'Unavailable' : conflicts ? `${row.conflicts} conflicts` : row.changed ? `${row.changed} changed` : 'Clean';
  return <article className={`home-card home-card-${state}`}>
    <div className="home-card-heading"><button className="home-card-open" title={`Open ${repo}`} disabled={opening} onClick={onOpen}><span className="home-repository-icon"><FolderGit2 size={21} strokeWidth={1.6} /></span><span className="home-card-name"><strong>{nameOf(repo)}</strong><span title={repo}>{repo}</span></span></button><button className="home-icon-button home-unpin-button" title="Unpin repository" aria-label={`Unpin ${nameOf(repo)}`} disabled={disabled} onClick={onUnpin}><PinOff size={14} /></button></div>
    <div className="home-card-state"><span className={`home-status-badge home-status-${state}`}>{!row ? <Loader2 size={11} className="animate-spin" /> : unavailable || conflicts ? <CircleAlert size={11} /> : !row.changed ? <Check size={11} /> : <span className="home-status-dot" />}{label}</span>{!unavailable && row?.branch && <span className="home-card-branch" title={row.branch}><GitBranch size={12} />{row.branch}</span>}{checking && row && <span className="home-checking"><Loader2 size={11} className="animate-spin" />{hosted ? 'Checking PRs…' : 'Refreshing…'}</span>}</div>
    {unavailable ? <p className="home-card-error" role="alert">{row!.error}</p> : <div className="home-card-metrics"><div><span>Local changes</span><strong>{row ? row.changed : '—'}</strong><small>{row ? `${row.staged} staged` : 'Reading status…'}</small></div><div><span><ArrowUp size={11} />Ahead</span><strong>{row ? row.ahead : '—'}</strong><small>to push</small></div><div><span><ArrowDown size={11} />Behind</span><strong>{row ? row.behind : '—'}</strong><small>to pull</small></div></div>}
    {!unavailable && row?.requests !== undefined && <details className="home-card-requests"><summary><GitPullRequest size={13} /><span>{row.requests.length} open {row.requests.length === 1 ? 'request' : 'requests'} loaded</span><span className="home-requests-hint">View</span></summary><div>{row.requests.map(pr => <button key={pr.id} title={pr.title} onClick={() => { setLinkError(''); void api.openExternal(pr.url).catch(e => setLinkError(String(e))); }}><span className="home-pr-number">#{pr.id}</span><span>{pr.title}</span><ExternalLink size={11} /></button>)}{row.hostedMessage && <p>{row.hostedMessage}</p>}{row.hostedCheckedAt && <p>Requests checked {timeOf(row.hostedCheckedAt)}.</p>}{linkError && <p role="alert" className="text-del">{linkError}</p>}</div></details>}
    {!unavailable && row?.hostedMessage && row.requests === undefined && <p className="home-provider-message"><GitPullRequest size={13} />{row.hostedMessage}</p>}
    <footer className="home-card-footer"><span>{row && !unavailable ? `Checked ${timeOf(row.checkedAt)}` : unavailable ? 'Check the folder and retry Refresh.' : 'Reading local Git status'}</span><button className="home-text-button" disabled={opening} onClick={onOpen}>{openInTab ? 'Resume' : 'Open repository'}<ArrowRight size={13} /></button></footer>
  </article>;
}
