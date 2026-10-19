import { readAppStorage } from '../../lib/appStorage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Compass, FolderOpen, GitBranch, HelpCircle, Layers, Lightbulb, MapPin, Search, Settings2, ShieldCheck, Terminal, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../../store';
import { useSettings } from '../../store/settings';
import { AppLogo } from '../Common/AppLogo';
import { guideCategories, guideTopics } from './usageGuideContent';
import type { GuideActionId, GuideCategoryId, GuideTopic } from './usageGuideContent';
import './usage-guide.css';

const progressKey = 'git-workbench:explore-progress:v1', startupKey = 'git-workbench:guide_completed';
const categoryIcons = { start: Compass, daily: Layers, collaboration: GitBranch, history: ShieldCheck, tools: Terminal, preferences: Settings2 };
const quickStartIds = ['getting-started', 'commit-graph', 'staging-commits', 'sync-remotes'];
const repositoryActions = new Set<GuideActionId>(['terminal', 'pull-requests', 'restore-points', 'resolution-memory', 'range-comparison', 'branch-stacks', 'lfs', 'sparse', 'reflog', 'worktrees', 'git-flow', 'bisect', 'changelog']);

function readProgress(): { completed: string[]; lastTopic: string | null } {
  try {
    const saved = JSON.parse(readAppStorage('explore-progress:v1') || '{}');
    const known = new Set(guideTopics.map(topic => topic.id));
    return { completed: Array.isArray(saved?.completed) ? [...new Set<string>(saved.completed.filter((id: unknown): id is string => typeof id === 'string' && known.has(id)))] : [], lastTopic: typeof saved?.lastTopic === 'string' && known.has(saved.lastTopic) ? saved.lastTopic : null };
  } catch { return { completed: [], lastTopic: null }; }
}
function searchableText(topic: GuideTopic) {
  return [topic.title, topic.summary, topic.location, topic.level, ...topic.keywords, ...(topic.prerequisites || []), ...topic.steps.flatMap(step => [step.title, step.description]), ...(topic.tips || []), topic.caution || ''].join(' ').toLocaleLowerCase();
}

export function UsageGuideModal({ onClose }: { onClose: () => void }) {
  const [saved] = useState(readProgress);
  const [completed, setCompleted] = useState(saved.completed), [lastTopic, setLastTopic] = useState(saved.lastTopic);
  const [selectedId, setSelectedId] = useState<string | null>(null), [category, setCategory] = useState<GuideCategoryId | 'all'>('all');
  const [query, setQuery] = useState(''), [unreadOnly, setUnreadOnly] = useState(false);
  const [quickStartMode, setQuickStartMode] = useState(false);
  const [browseNavigation, setBrowseNavigation] = useState(0);
  const [hideOnStartup, setHideOnStartup] = useState(() => { try { return readAppStorage('guide_completed') !== 'false'; } catch { return true; } });
  const dialogRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), articleTitleRef = useRef<HTMLHeadingElement>(null);
  const overviewTitleRef = useRef<HTMLHeadingElement>(null), focusOverview = useRef(false), openingTool = useRef(false);
  const activeRepo = useApp(state => state.activeTab), openingRepo = useApp(state => state.isOpeningRepo);
  const repositoryName = activeRepo?.split(/[/\\]/).filter(Boolean).pop();
  const selected = guideTopics.find(topic => topic.id === selectedId);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const searchIndex = useMemo(() => new Map(guideTopics.map(topic => [topic.id, searchableText(topic)])), []);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visibleTopics = guideTopics.filter(topic => (category === 'all' || topic.category === category) && (!unreadOnly || !completedSet.has(topic.id)) && terms.every(term => searchIndex.get(topic.id)?.includes(term)));
  const currentCategory = guideCategories.find(item => item.id === (selected?.category || category));
  const resumeTopic = guideTopics.find(topic => topic.id === lastTopic);
  const quickStart = quickStartIds.map(id => guideTopics.find(topic => topic.id === id)).filter((topic): topic is GuideTopic => !!topic);
  // Keep navigation within the selected workflow or search, including a topic just marked read.
  const visibleIds = new Set(visibleTopics.map(topic => topic.id));
  const sequence = quickStartMode ? quickStart : guideTopics.filter(topic => visibleIds.has(topic.id) || topic.id === selectedId);
  const topicIndex = sequence.findIndex(topic => topic.id === selectedId);
  const previous = sequence[topicIndex - 1], next = topicIndex >= 0 ? sequence[topicIndex + 1] : undefined;
  const browsing = !!query.trim() || category !== 'all' || unreadOnly;

  useEffect(() => { try { localStorage.setItem(progressKey, JSON.stringify({ completed, lastTopic })); } catch {} }, [completed, lastTopic]);
  const close = useCallback(() => { try { localStorage.setItem(startupKey, String(hideOnStartup)); } catch {} onClose(); }, [hideOnStartup, onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    useSettings.getState().closeSettings(); dialogRef.current?.focus();
    return () => { if (!openingTool.current && previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    if (selectedId) articleTitleRef.current?.focus({ preventScroll: true });
    else if (focusOverview.current) { overviewTitleRef.current?.focus({ preventScroll: true }); focusOverview.current = false; }
  }, [selectedId, category, query, unreadOnly, browseNavigation]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (document.activeElement === searchRef.current && searchRef.current?.value) setQuery(''); else close();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault(); event.stopImmediatePropagation(); searchRef.current?.focus(); searchRef.current?.select();
      } else if (event.key === 'Tab') {
        const root = dialogRef.current; if (!root) return;
        const targets = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = targets[0], last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); root.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement) || document.activeElement === root)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  const openTopic = (topic: GuideTopic, essentials = false) => { setSelectedId(topic.id); setLastTopic(topic.id); setQuickStartMode(essentials); };
  const browseCategory = (id: GuideCategoryId | 'all') => { focusOverview.current = true; setBrowseNavigation(value => value + 1); setCategory(id); setSelectedId(null); setQuickStartMode(false); };
  const clearFilters = () => { focusOverview.current = true; setBrowseNavigation(value => value + 1); setQuery(''); setCategory('all'); setUnreadOnly(false); setSelectedId(null); setQuickStartMode(false); };
  const toggleCompleted = (id: string) => setCompleted(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const actionUnavailable = (id: GuideActionId) => repositoryActions.has(id) && (!activeRepo || openingRepo);
  const launch = (id: GuideActionId) => {
    if (actionUnavailable(id)) return;
    openingTool.current = true;
    close();
    const app = useApp.getState(), settings = useSettings.getState(); settings.closeSettings();
    if (repositoryActions.has(id)) useApp.setState({ homeOpen: false });
    switch (id) {
      case 'open-repo': void app.openRepoDialog(); break;
      case 'create-repo': app.openCreateRepoModal(); break;
      case 'home': app.openHome(); break;
      case 'providers': settings.openSettings('providers'); break;
      case 'ai-settings': settings.openSettings('ai'); break;
      case 'appearance-settings': settings.openSettings('themes'); break;
      case 'git-settings': settings.openSettings('git'); break;
      case 'shortcuts': useApp.setState({ shortcutsModalOpen: true }); break;
      case 'palette': app.openCommandPalette(); break;
      case 'terminal': useApp.setState({ terminalDrawerOpen: true }); break;
      case 'pull-requests': app.openPullRequestsModal(); break;
      case 'restore-points': useApp.setState({ restorePointsOpen: true }); break;
      case 'resolution-memory': useApp.setState({ resolutionMemoryOpen: true }); break;
      case 'range-comparison': useApp.setState({ rangeComparisonOpen: true, rangeComparisonId: null }); break;
      case 'branch-stacks': useApp.setState({ branchStackOpen: true }); break;
      case 'lfs': useApp.setState({ lfsManagerOpen: true }); break;
      case 'sparse': useApp.setState({ sparseCheckoutOpen: true }); break;
      case 'reflog': app.openReflogModal(); break;
      case 'worktrees': app.openWorktreesModal(); break;
      case 'git-flow': app.openGitFlowModal(); break;
      case 'bisect': app.openBisectModal(); break;
      case 'changelog': app.openChangelogModal(); break;
    }
    if (id !== 'open-repo') requestAnimationFrame(() => {
      // Older tool dialogs do not all have autofocus; hand keyboard focus to the opened UI.
      const overlay = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .fixed.inset-0')].filter(element => element.getClientRects().length > 0).pop();
      if (overlay && !overlay.contains(document.activeElement)) overlay.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]')?.focus();
    });
  };

  return <div className="explore-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="explore-dialog" role="dialog" aria-modal="true" aria-labelledby="explore-title" aria-describedby="explore-description" ref={dialogRef} tabIndex={-1}>
      <header className="explore-header"><div className="explore-brand"><AppLogo size={33} /><div><h1 id="explore-title">Explore Git Workbench</h1><p id="explore-description">Practical guides, from your first commit to advanced workflows.</p></div></div><button className="explore-icon-button" onClick={close} aria-label="Close Explore Git Workbench"><X size={19} /></button></header>
      <div className="explore-layout">
        <aside className="explore-sidebar">
          <div className="explore-reading-progress"><div><span>Your reading progress</span><strong>{completed.length}<span> / {guideTopics.length}</span></strong></div><progress value={completed.length} max={guideTopics.length} aria-label="Topics marked as explored" /><p>Saved on this device. Explore at your own pace.</p></div>
          <nav className="explore-navigation" aria-label="Guide topics">
            <button className={`explore-nav-overview ${!selected && category === 'all' ? 'is-active' : ''}`} onClick={clearFilters} aria-current={!selected && !browsing ? 'page' : undefined}><Compass size={16} />Guide overview</button><p className="explore-nav-label">BROWSE BY WORKFLOW</p>
            {guideCategories.map(item => { const Icon = categoryIcons[item.id], topics = guideTopics.filter(topic => topic.category === item.id), expanded = selected ? selected.category === item.id : category === item.id; return <div className="explore-nav-group" key={item.id}><button className={`explore-nav-category ${expanded ? 'is-active' : ''}`} onClick={() => browseCategory(item.id)} aria-current={!selected && category === item.id ? 'page' : undefined}><Icon size={15} /><span>{item.title}</span><small>{topics.length}</small></button>{expanded ? <div className="explore-nav-topics">{topics.map(topic => <button key={topic.id} onClick={() => openTopic(topic)} className={selectedId === topic.id ? 'is-active' : ''} aria-current={selectedId === topic.id ? 'page' : undefined}><span>{topic.title}</span>{completedSet.has(topic.id) ? <Check size={12} aria-label="Explored" /> : <span className="explore-nav-dot" />}</button>)}</div> : null}</div>; })}
          </nav>
          <button className="explore-shortcut-link" onClick={() => launch('shortcuts')}><HelpCircle size={15} /><span>Keyboard shortcuts</span><ArrowRight size={13} /></button>
        </aside>
        <div className="explore-main">
          <div className="explore-search-row"><div className="explore-search"><Search size={16} /><input ref={searchRef} aria-label="Search Git Workbench guides" placeholder="Search a feature, workflow, or question…" value={query} onChange={event => { setQuery(event.target.value); setSelectedId(null); }} />{query ? <button className="explore-icon-button" onClick={() => setQuery('')} aria-label="Clear guide search"><X size={13} /></button> : <kbd>Ctrl / ⌘ F</kbd>}</div><button className={`explore-unread-filter ${unreadOnly ? 'is-active' : ''}`} aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(!unreadOnly); setSelectedId(null); }}><BookOpen size={13} />Not explored</button></div>
          <div className="explore-content" ref={contentRef}>
            {selected ? <article className="explore-article" key={selected.id}>
              <div className="explore-breadcrumb"><button onClick={clearFilters}>Explore</button><ChevronRight size={12} /><button onClick={() => browseCategory(selected.category)}>{currentCategory?.title}</button></div>
              <div className="explore-article-heading"><p className="explore-eyebrow">{selected.level}{quickStartMode ? ` · Essentials ${topicIndex + 1} / ${quickStart.length}` : ''}</p><h2 ref={articleTitleRef} tabIndex={-1}>{selected.title}</h2><p className="explore-article-summary">{selected.summary}</p><div className="explore-article-meta"><span><Clock3 size={13} />About {selected.minutes} min</span><span><MapPin size={13} />{selected.location}</span>{completedSet.has(selected.id) ? <span className="explore-completed-label"><CheckCircle2 size={13} />Explored</span> : null}</div></div>
              {selected.prerequisites?.length ? <section className="explore-prerequisites"><h3>Before you begin</h3><ul>{selected.prerequisites.map(item => <li key={item}>{item}</li>)}</ul></section> : null}
              <section className="explore-steps-section" aria-label="Step-by-step instructions"><h3>Step by step</h3><ol className="explore-steps">{selected.steps.map((step, index) => <li key={step.title}><span className="explore-step-number">{index + 1}</span><div><h4>{step.title}</h4><p>{step.description}</p></div></li>)}</ol></section>
              {selected.caution ? <aside className="explore-note explore-caution"><AlertTriangle size={16} /><div><h3>Keep in mind</h3><p>{selected.caution}</p></div></aside> : null}
              {selected.tips?.length ? <details className="explore-tips" open><summary><Lightbulb size={16} />Helpful details<ChevronRight size={14} /></summary><ul>{selected.tips.map(tip => <li key={tip}>{tip}</li>)}</ul></details> : null}
              {selected.actions?.length ? <section className="explore-try"><div><h3>Open it in Git Workbench</h3><p>{activeRepo && selected.actions.some(action => repositoryActions.has(action.id)) ? `Opens in ${repositoryName}. Review the tool before making changes.` : 'Continue in the workspace when you’re ready.'}</p></div><div className="explore-action-buttons">{selected.actions.map(action => <button key={`${selected.id}-${action.id}`} className="btn-secondary" disabled={actionUnavailable(action.id)} onClick={() => launch(action.id)}>{action.label}<ArrowRight size={13} /></button>)}</div>{selected.actions.some(action => actionUnavailable(action.id)) ? <p className="explore-repository-hint"><FolderOpen size={13} />{openingRepo ? 'Wait for the repository to finish opening to use these tools.' : 'Open a repository to use these tools.'}{!activeRepo ? <button onClick={() => launch('open-repo')}>Open repository<ArrowRight size={12} /></button> : null}</p> : null}</section> : null}
              {selected.related?.length ? <section className="explore-related"><h3>Continue exploring</h3><div>{selected.related.map(id => { const topic = guideTopics.find(item => item.id === id); return topic ? <button key={id} onClick={() => { setQuery(''); setUnreadOnly(false); setCategory(topic.category); openTopic(topic); }}><BookOpen size={13} />{topic.title}<ChevronRight size={13} /></button> : null; })}</div></section> : null}
              <footer className="explore-article-navigation"><button className="btn-secondary" disabled={!previous} onClick={() => previous && openTopic(previous, quickStartMode)}><ArrowLeft size={13} />Previous</button><button className={`explore-mark-read ${completedSet.has(selected.id) ? 'is-completed' : ''}`} onClick={() => toggleCompleted(selected.id)} aria-pressed={completedSet.has(selected.id)}><CheckCircle2 size={15} />{completedSet.has(selected.id) ? 'Marked as explored' : 'Mark as explored'}</button><button className="btn-primary" onClick={() => next ? openTopic(next, quickStartMode) : quickStartMode ? clearFilters() : browseCategory(category)}>{next ? 'Next topic' : quickStartMode ? 'Back to overview' : 'Back to guides'}<ArrowRight size={13} /></button></footer>
            </article> : <div className="explore-overview">
              {!browsing ? <>
                <section className="explore-hero"><div><p className="explore-eyebrow">YOUR WORKSPACE, EXPLAINED</p><h2 ref={overviewTitleRef} tabIndex={-1}>Find your next<br />better Git workflow.</h2><p>Learn the essentials, understand the tools, and know what happens before you click.</p><div className="explore-hero-actions"><button className="btn-primary" onClick={() => quickStart[0] && openTopic(quickStart[0], true)}>Start with the essentials<ArrowRight size={14} /></button>{resumeTopic ? <button className="explore-resume" onClick={() => openTopic(resumeTopic)}>Pick up where you left off<ChevronRight size={13} /></button> : null}</div></div><div className="explore-hero-index" aria-label={`${guideTopics.length} guides across ${guideCategories.length} workflows`}><BookOpen size={24} strokeWidth={1.5} /><strong>{guideTopics.length}</strong><span>practical guides</span><small>{guideCategories.length} workflows · beginner to advanced</small></div></section>
                <section className="explore-quick-start"><div className="explore-section-heading"><div><h3>Your first complete workflow</h3><p>Four short guides to get from opening a project to sharing a commit.</p></div><span>{quickStart.filter(topic => completedSet.has(topic.id)).length} / {quickStart.length} explored</span></div><div className="explore-path">{quickStart.map((topic, index) => <button key={topic.id} onClick={() => openTopic(topic, true)}><span className={completedSet.has(topic.id) ? 'is-completed' : ''}>{completedSet.has(topic.id) ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span><strong>{topic.title}</strong><small>About {topic.minutes} min</small><ChevronRight size={13} /></button>)}</div></section>
                <section className="explore-categories"><div className="explore-section-heading"><div><h3>Explore by workflow</h3><p>Choose a starting point. Every guide includes concrete steps and useful details.</p></div></div><div className="explore-category-grid">{guideCategories.map(item => { const Icon = categoryIcons[item.id], topics = guideTopics.filter(topic => topic.category === item.id); return <button key={item.id} onClick={() => browseCategory(item.id)}><span className={`explore-category-icon explore-category-${item.id}`}><Icon size={19} strokeWidth={1.7} /></span><div><h4>{item.title}</h4><p>{item.description}</p><small>{topics.length} guides<ArrowRight size={12} /></small></div></button>; })}</div></section>
              </> : <div className="explore-browse-heading"><button className="explore-back" onClick={clearFilters}><ArrowLeft size={13} />All workflows</button><p className="explore-eyebrow">{query.trim() ? 'SEARCH THE GUIDE' : 'WORKFLOW GUIDES'}</p><h2 ref={overviewTitleRef} tabIndex={-1}>{query.trim() ? `Results for “${query.trim()}”` : currentCategory?.title || 'Not yet explored'}</h2><p>{query.trim() ? 'Matches include instructions, tips, feature names, and keywords.' : currentCategory?.description || 'Choose a topic to continue learning at your own pace.'}</p></div>}
              <section className="explore-topic-browser"><div className="explore-section-heading"><h3>{browsing ? `${visibleTopics.length} ${visibleTopics.length === 1 ? 'guide' : 'guides'}${unreadOnly ? ' not yet explored' : ''}` : 'All guides'}</h3>{!browsing ? <span>Search above or jump straight in</span> : null}<span role="status" className="sr-only">{visibleTopics.length} guides found</span></div>{visibleTopics.length ? <div className="explore-topic-grid">{visibleTopics.map(topic => <TopicCard key={topic.id} topic={topic} completed={completedSet.has(topic.id)} onOpen={() => openTopic(topic)} />)}</div> : <div className="explore-empty"><Search size={27} strokeWidth={1.5} /><h3>{unreadOnly && !query.trim() ? 'You’ve explored these guides' : 'No guides found'}</h3><p>Try a broader search, another workflow, or show all guides.</p><button className="btn-secondary" onClick={clearFilters}>Show all guides<ArrowRight size={13} /></button></div>}</section>
            </div>}
          </div>
        </div>
      </div>
      <footer className="explore-footer"><label><input type="checkbox" checked={hideOnStartup} onChange={event => { setHideOnStartup(event.target.checked); try { localStorage.setItem(startupKey, String(event.target.checked)); } catch {} }} />Don’t open automatically at startup</label><span>Reopen anytime from Home → Explore Git Workbench</span><button className="explore-close-link" onClick={close}>Back to workspace<ArrowRight size={13} /></button></footer>
    </div>
  </div>;
}

function TopicCard({ topic, completed, onOpen }: { topic: GuideTopic; completed: boolean; onOpen: () => void }) {
  const Icon = categoryIcons[topic.category];
  return <button className="explore-topic-card" onClick={onOpen}><div className="explore-topic-top"><span><Icon size={13} />{guideCategories.find(category => category.id === topic.category)?.title}</span>{completed ? <CheckCircle2 size={14} className="explore-completed-label" aria-label="Explored" /> : <span className="explore-topic-level">{topic.level}</span>}</div><h4>{topic.title}</h4><p>{topic.summary}</p><div className="explore-topic-bottom"><span><Clock3 size={12} />{topic.minutes} min</span><span>Read guide<ArrowRight size={12} /></span></div></button>;
}
