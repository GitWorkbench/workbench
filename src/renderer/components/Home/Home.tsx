import React, { useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, CircleAlert, Clock3,
  ExternalLink, FolderGit2, FolderOpen, FolderPlus, GitBranch, GitPullRequest,
  Loader2, Pin, PinOff, RefreshCw, Search, Settings2, X, FlaskConical
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
      <header className="home-header">
        <div className="home-heading">
          <span className="home-heading-icon"><FolderGit2 size={20} strokeWidth={1.7} /></span>
          <div><h1>Repositories</h1><p>Open a project or review its local status.</p></div>
        </div>
        <div className="home-header-actions">
          <button className="btn-secondary home-action" disabled={opening} onClick={() => useApp.getState().openCreateRepoModal()}><FolderPlus size={14} />Create repository</button>
          <button className="btn-primary home-action" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={14} />Open repository</button>
        </div>
      </header>

      {error && <div role="alert" className="home-error"><CircleAlert size={15} /><p>{error}</p><button className="btn-secondary home-action" disabled={busy} onClick={() => void reload()}>Retry</button></div>}

      <div className="home-controls">
        <div className="home-search"><Search size={14} /><input aria-label="Search repositories" placeholder="Search by name or path…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }} />{query && <button className="home-icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}</div>
        <div className="home-filters" role="group" aria-label="Filter pinned repositories">
          {([
            ['all', 'All pinned', initializing ? '—' : pins.length],
            ['changed', 'With changes', unresolved ? '—' : changed],
            ['attention', 'Needs attention', unresolved ? '—' : attention]
          ] as const).map(([value, label, count]) => <button key={value} aria-label={label} aria-pressed={filter === value} className={filter === value ? 'is-selected' : ''} onClick={() => setFilter(value)}>{label}<span aria-hidden="true" className="home-filter-count">{count}</span></button>)}
        </div>
      </div>

      <div className="home-layout">
        <section className="home-pinned" aria-labelledby="home-pinned-title">
          <div className="home-section-heading">
            <div className="home-section-title"><Pin size={14} /><h2 id="home-pinned-title">Pinned repositories</h2><span className="home-count">{pins.length}</span></div>
            <div className="home-section-actions">
              <button className="home-text-button" disabled={busy || !pins.length} title="Refresh local status without fetching" onClick={() => void refresh(pins)}><RefreshCw size={13} className={refreshing === 'local' ? 'animate-spin' : ''} />Refresh</button>
              <button className="btn-secondary home-action" disabled={busy || !pins.length} onClick={() => void refresh(pins, true)}>{refreshing === 'hosted' ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequest size={13} />}Check requests</button>
            </div>
          </div>
          {initializing ? <div className="home-repository-list" aria-busy="true" aria-label="Loading pinned repositories">{[0, 1, 2].map(i => <div key={i} className="home-skeleton"><span /><span /><span /></div>)}</div> : !pins.length ? <div className="home-empty">
            <span className="home-empty-icon"><Pin size={22} strokeWidth={1.5} /></span><h3>Keep your projects close</h3><p>Pin a recent repository to track its branch, changes, and reviews here.</p><button className="btn-secondary home-action" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={14} />Open a repository</button>
          </div> : !visiblePins.length ? <div className="home-empty"><Search size={22} className="text-faint" /><h3>No matching pinned repositories</h3><p>Try another name or show all pinned projects.</p><button className="home-text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters<ArrowRight size={13} /></button></div> : <>
            <div className="home-list-head home-repository-grid" aria-hidden="true"><span>Repository</span><span>Branch</span><span>Working tree</span><span>Sync</span><span /><span /></div>
            <div className="home-repository-list" aria-label="Pinned repository list">
              {visiblePins.map(repo => <RepositoryRow key={repo} repo={repo} row={rows[repo]} checking={pending.includes(repo)} hosted={refreshing === 'hosted'} openInTab={tabs.some(t => t.path === repo)} disabled={busy} opening={opening} onOpen={() => open(repo)} onUnpin={() => void pin(repo, false)} />)}
            </div>
          </>}
          {!!pins.length && <p className="home-footnote"><span className="home-status-dot" />Local status · Sync counts use the last fetch.</p>}
        </section>

        <aside className="home-sidebar" aria-labelledby="home-recent-title">
          <section className="home-recent-panel">
            <div className="home-section-heading"><div className="home-section-title"><Clock3 size={14} /><h2 id="home-recent-title">Recent repositories</h2></div><span className="home-count">{unpinnedRecent.length}</span></div>
            <div className="home-recent-list">
              {initializing ? <p className="home-recent-empty">Loading recent repositories…</p> : visibleRecent.length ? visibleRecent.map(repo => <div key={repo} className="home-recent-row">
                <button className="home-recent-open" disabled={opening} onClick={() => open(repo)} title={`Open ${repo}`}><FolderGit2 size={16} /><span className="home-recent-name"><strong>{nameOf(repo)}</strong><span title={repo}>{repo}</span></span></button>
                <button className="home-icon-button home-pin-button" aria-label={`Pin ${nameOf(repo)}`} title="Pin repository" disabled={busy} onClick={() => void pin(repo, true)}>{mutating === repo ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}</button>
                <button className="home-icon-button home-remove-button" aria-label={`Remove ${nameOf(repo)} from recent repositories`} title="Remove from recent repositories" disabled={!!mutating} onClick={() => void removeRecent(repo)}><X size={13} /></button>
              </div>) : <div className="home-recent-empty">{search && unpinnedRecent.length ? 'No recent repositories match your search.' : recent.length && !unpinnedRecent.length ? 'All your recent repositories are pinned. Open another project to add it here.' : 'Repositories you open will appear here, ready for next time.'}</div>}
            </div>
            <button className="home-recent-browse" disabled={opening} onClick={() => void useApp.getState().openRepoDialog()}><FolderOpen size={14} />Browse for a repository<ArrowRight size={13} /></button>
          </section>
          <section className="home-tools" aria-label="Workspace setup">
            <h2>Quick access</h2>
            <button onClick={() => useSettings.getState().openSettings('providers')}><GitPullRequest size={16} /><span><strong>Connect your providers</strong><small>GitHub, GitLab, Bitbucket &amp; Gitea</small></span><ArrowRight size={13} /></button>
            <button onClick={() => useSettings.getState().openSettings()}><Settings2 size={16} /><span><strong>Preferences</strong><small>Themes, profiles &amp; Git settings</small></span><ArrowRight size={13} /></button>
            <button onClick={() => useApp.getState().openUsageGuide()}><BookOpen size={16} /><span><strong>Explore Git Workbench</strong><small>Guides for your Git workflows</small></span><ArrowRight size={13} /></button>
            <button onClick={() => useApp.setState({ playgroundOpen: true, usageGuideOpen: false })}><FlaskConical size={16} /><span><strong>Git Playground</strong><small>Learn Git with guided, hands-on lessons</small></span><ArrowRight size={13} /></button>
          </section>
        </aside>
      </div>
    </div>
  </main>;
}

function RepositoryRow({ repo, row, checking, hosted, openInTab, disabled, opening, onOpen, onUnpin }: {
  repo: string; row?: HomeRepositoryOverview; checking: boolean; hosted: boolean; openInTab: boolean;
  disabled: boolean; opening: boolean; onOpen: () => void; onUnpin: () => void;
}) {
  const [linkError, setLinkError] = useState('');
  const unavailable = !!row?.error, conflicts = (row?.conflicts || 0) > 0;
  const state = !row ? 'loading' : unavailable || conflicts ? 'attention' : row.changed ? 'changed' : 'clean';
  const label = !row ? 'Loading…' : unavailable ? 'Unavailable' : conflicts ? `${row.conflicts} ${row.conflicts === 1 ? 'conflict' : 'conflicts'}` : row.changed ? `${row.changed} changed` : 'Clean';
  return <article className={`home-repository home-repository-${state}`} aria-label={nameOf(repo)} aria-busy={checking}>
    <div className="home-repository-grid home-repository-main">
      <button className="home-repository-open" title={`Open ${repo}`} disabled={opening} onClick={onOpen}>
        <span className="home-repository-icon"><FolderGit2 size={17} strokeWidth={1.6} /></span>
        <span className="home-repository-name"><strong>{nameOf(repo)}</strong><span title={repo}>{repo}</span></span>
      </button>
      <div className="home-branch"><GitBranch size={12} /><span className="sr-only">Branch: </span><span title={row?.branch}>{!unavailable && row?.branch ? row.branch : '—'}</span></div>
      <div className="home-repository-status" title={row && !unavailable ? `Checked ${timeOf(row.checkedAt)}` : undefined}>
        <span className={`home-status-badge home-status-${state}`}>{!row || checking ? <Loader2 size={11} className="animate-spin" /> : unavailable || conflicts ? <CircleAlert size={11} /> : !row.changed ? <Check size={11} /> : <span className="home-status-dot" />}{label}</span>
        {checking && row && <span className="sr-only">{hosted ? 'Checking requests…' : 'Refreshing…'}</span>}
        {!unavailable && !!row?.staged && <span className="home-staged">{row.staged} staged</span>}
      </div>
      <div className="home-sync" aria-label="Upstream status">
        {!row || unavailable ? <span className="home-muted">—</span> : row.ahead || row.behind ? <><span title={`${row.ahead} to push`}><ArrowUp size={12} /><span className="sr-only">Ahead: </span>{row.ahead}</span><span title={`${row.behind} to pull`}><ArrowDown size={12} /><span className="sr-only">Behind: </span>{row.behind}</span></> : <span className="home-muted">Up to date</span>}
      </div>
      <button className="home-open-action" disabled={opening} onClick={onOpen}>{openInTab ? 'Resume' : 'Open'}<ArrowRight size={13} /></button>
      <button className="home-icon-button home-unpin-button" title="Unpin repository" aria-label={`Unpin ${nameOf(repo)}`} disabled={disabled} onClick={onUnpin}><PinOff size={13} /></button>
    </div>
    {unavailable && <p className="home-repository-error" role="alert">{row!.error}<span>Check the folder and retry Refresh.</span></p>}
    {!unavailable && row?.requests !== undefined && <details className="home-repository-requests"><summary><GitPullRequest size={13} /><span>{row.requests.length} open {row.requests.length === 1 ? 'request' : 'requests'} loaded</span><ChevronDown size={12} /></summary><div>{row.requests.map(pr => <button key={pr.id} title={pr.title} onClick={() => { setLinkError(''); void api.openExternal(pr.url).catch(e => setLinkError(String(e))); }}><span className="home-pr-number">#{pr.id}</span><span>{pr.title}</span><ExternalLink size={11} /></button>)}{row.hostedMessage && <p>{row.hostedMessage}</p>}{row.hostedCheckedAt && <p>Requests checked {timeOf(row.hostedCheckedAt)}.</p>}{linkError && <p role="alert" className="text-del">{linkError}</p>}</div></details>}
    {!unavailable && row?.hostedMessage && row.requests === undefined && <p className="home-row-notice"><GitPullRequest size={13} />{row.hostedMessage}</p>}
  </article>;
}
