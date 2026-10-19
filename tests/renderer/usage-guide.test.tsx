// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app: Record<string, any> = {};
  const settings: Record<string, any> = {};
  const useApp = Object.assign((selector: (state: any) => any) => selector(app), { getState: () => app, setState: vi.fn((patch: object) => Object.assign(app, patch)) });
  const useSettings = Object.assign((selector: (state: any) => any) => selector(settings), { getState: () => settings });
  return { app, settings, useApp, useSettings };
});
vi.mock('../../src/renderer/store', () => ({ useApp: mocks.useApp }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: mocks.useSettings }));
import { UsageGuideModal } from '../../src/renderer/components/Help/UsageGuideModal';
import { guideCategories, guideTopics, type GuideActionId } from '../../src/renderer/components/Help/usageGuideContent';

const progressKey = 'git-workbench:explore-progress:v1';
const startupKey = 'git-workbench:guide_completed';
const repositoryActions = new Set(['terminal', 'pull-requests', 'restore-points', 'resolution-memory', 'range-comparison', 'branch-stacks', 'lfs', 'sparse', 'reflog', 'worktrees', 'git-flow', 'bisect', 'changelog']);
beforeEach(() => {
  localStorage.clear();
  for (const key of Object.keys(mocks.app)) delete mocks.app[key];
  Object.assign(mocks.app, { activeTab: null, isOpeningRepo: false });
  for (const key of ['openRepoDialog', 'openCreateRepoModal', 'openHome', 'openCommandPalette', 'openPullRequestsModal', 'openReflogModal', 'openWorktreesModal', 'openGitFlowModal', 'openBisectModal', 'openChangelogModal']) mocks.app[key] = vi.fn();
  mocks.settings.closeSettings = vi.fn();
  mocks.settings.openSettings = vi.fn();
  mocks.useApp.setState.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
function openTopic(id: string) {
  const topic = guideTopics.find(topic => topic.id === id)!;
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Git Workbench guides' }), { target: { value: topic.title } });
  fireEvent.click(screen.getByRole('heading', { name: topic.title, level: 4 }).closest('button')!);
  return topic;
}

describe('guide content contract', () => {
  it('has unique searchable workflows and no broken references', () => {
    expect(new Set(guideCategories.map(item => item.id)).size).toBe(guideCategories.length);
    expect(new Set(guideTopics.map(item => item.id)).size).toBe(guideTopics.length);
    for (const topic of guideTopics) {
      expect(guideCategories.some(category => category.id === topic.category)).toBe(true);
      expect(topic.steps.length).toBeGreaterThanOrEqual(3);
      expect(topic.minutes).toBeGreaterThan(0);
      expect(topic.keywords.length).toBeGreaterThan(0);
      for (const id of topic.related || []) expect(guideTopics.some(item => item.id === id)).toBe(true);
      expect(new Set(topic.actions?.map(item => item.id)).size).toBe(topic.actions?.length || 0);
    }
  });
});

describe('UsageGuideModal navigation and persistence', () => {
  it('exposes the guide dialog, workflows, topic totals and closes settings on opening', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Explore Git Workbench' })).toHaveFocus();
    expect(screen.getByRole('progressbar', { name: 'Topics marked as explored' })).toHaveAttribute('max', String(guideTopics.length));
    expect(screen.getByRole('status')).toHaveTextContent(`${guideTopics.length} guides found`);
    expect(mocks.settings.closeSettings).toHaveBeenCalledOnce();
    for (const category of guideCategories) expect(screen.getAllByRole('button', { name: new RegExp(category.title) }).length).toBeGreaterThan(0);
  });
  it('filters across instructions and all query words, handles empty search and clears filters', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    const search = screen.getByRole('textbox', { name: 'Search Git Workbench guides' });
    fireEvent.change(search, { target: { value: ' author identity ' } });
    expect(screen.getByRole('heading', { name: 'Results for “author identity”' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Open or create your first repository', level: 4 })).toBeVisible();
    fireEvent.change(search, { target: { value: 'zzzz-no-such-guide-zzzz' } });
    expect(screen.getByRole('heading', { name: 'No guides found' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('0 guides found');
    fireEvent.click(screen.getByRole('button', { name: 'Show all guides' }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(`${guideTopics.length} guides found`);
    fireEvent.change(search, { target: { value: 'git' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear guide search' }));
    expect(search).toHaveValue('');
  });
  it('browses a category, navigates next/previous, follows related topics and returns to overview', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Guide topics' })).getByRole('button', { name: /^Start here/ }));
    expect(screen.getByRole('heading', { name: 'Start here', level: 2 })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(`${guideTopics.filter(t => t.category === 'start').length} guides found`);
    fireEvent.click(screen.getAllByRole('button', { name: /Open or create your first repository/ }).at(-1)!);
    expect(screen.getByRole('heading', { name: 'Open or create your first repository', level: 2 })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
    expect(screen.getByRole('heading', { name: 'Use Home as your project hub', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(within(screen.getByRole('heading', { name: 'Continue exploring' }).parentElement!).getByRole('button', { name: 'Build a focused commit' }));
    expect(screen.getByRole('heading', { name: 'Build a focused commit', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Explore', exact: true }));
    expect(screen.getByRole('heading', { name: /Find your next/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pick up where you left off' })).toBeVisible();
  });
  it('opens from workflow cards and the quick-start path, then uses article and topic-list navigation', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    const path = screen.getByRole('heading', { name: 'Your first complete workflow' }).closest('section')!;
    fireEvent.click(within(path).getByRole('button', { name: /Read and customize the commit graph/ }));
    expect(screen.getByRole('heading', { name: 'Read and customize the commit graph', level: 2 })).toBeVisible();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Guide topics' })).getByRole('button', { name: 'Use Home as your project hub' }));
    expect(screen.getByRole('heading', { name: 'Use Home as your project hub', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start here', exact: true }));
    expect(screen.getByRole('heading', { name: 'Start here', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'All workflows' }));
    const categories = screen.getByRole('heading', { name: 'Explore by workflow' }).closest('section')!;
    fireEvent.click(within(categories).getByRole('button', { name: /Repository tools/ }));
    expect(screen.getByRole('heading', { name: 'Repository tools', level: 2 })).toBeVisible();
  });
  it('tracks completion, keeps unread navigation usable and resumes a valid saved topic', () => {
    localStorage.setItem(progressKey, JSON.stringify({ completed: ['getting-started', 'getting-started', 'removed', 8], lastTopic: 'staging-commits' }));
    render(<UsageGuideModal onClose={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Pick up where you left off' }));
    expect(screen.getByRole('heading', { name: 'Build a focused commit', level: 2 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as explored' }));
    expect(screen.getByRole('button', { name: 'Marked as explored' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem(progressKey)!)).toEqual({ completed: ['getting-started', 'staging-commits'], lastTopic: 'staging-commits' });
    fireEvent.click(screen.getByRole('button', { name: 'Marked as explored' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Not explored' }));
    expect(screen.getByRole('button', { name: 'Not explored' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Open or create your first repository', level: 4 })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`${guideTopics.length - 1} guides found`);
  });
  it('shows a completed empty state and can reveal all guides again', () => {
    localStorage.setItem(progressKey, JSON.stringify({ completed: guideTopics.map(topic => topic.id) }));
    render(<UsageGuideModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not explored' }));
    expect(screen.getByRole('heading', { name: 'You’ve explored these guides' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'All workflows' }));
    expect(screen.getByRole('status')).toHaveTextContent(`${guideTopics.length} guides found`);
  });
  it.each(['broken', 'null', '{"completed":1,"lastTopic":"missing"}'])('recovers corrupt progress %s', progress => {
    localStorage.setItem(progressKey, progress);
    render(<UsageGuideModal onClose={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
    expect(screen.queryByRole('button', { name: 'Pick up where you left off' })).not.toBeInTheDocument();
  });
  it('finishes the four-part essentials path and supports its previous action', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start with the essentials' }));
    for (let index = 1; index <= 4; index++) {
      expect(screen.getByText(`Essentials · Essentials ${index} / 4`)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Mark as explored' }));
      fireEvent.click(screen.getByRole('button', { name: index === 4 ? 'Back to overview' : 'Next topic' }));
    }
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '4');
    expect(screen.getByText('4 / 4 explored')).toBeVisible();
  });
  it('shows article prerequisites, warnings, tips, categories and last-guide return navigation', () => {
    render(<UsageGuideModal onClose={vi.fn()} />);
    openTopic('terminal-shortcuts');
    expect(screen.getByRole('heading', { name: 'Keep in mind' })).toBeVisible();
    expect(screen.getByText('Helpful details')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to guides' }));
    expect(screen.getByRole('status')).toBeVisible();
  });
  it('persists startup preference immediately and on close, ignoring clicks inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(<UsageGuideModal onClose={onClose} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Don’t open automatically at startup' });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(localStorage.getItem(startupKey)).toBe('false');
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.firstChild!);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('handles unavailable storage without breaking reading or close', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const onClose = vi.fn();
    render(<UsageGuideModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Close Explore Git Workbench' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('uses Escape to clear a focused search before closing and Ctrl/Cmd+F to focus search', () => {
    const onClose = vi.fn();
    render(<UsageGuideModal onClose={onClose} />);
    const search = screen.getByRole('textbox', { name: 'Search Git Workbench guides' });
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'git' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('traps keyboard focus and restores the opening control on unmount', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 1, height: 1 } as DOMRect] as unknown as DOMRectList);
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const { unmount } = render(<UsageGuideModal onClose={vi.fn()} />);
    const first = screen.getByRole('button', { name: 'Close Explore Git Workbench' }), last = screen.getByRole('button', { name: 'Back to workspace' });
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    opener.focus(); fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    unmount(); expect(opener).toHaveFocus(); opener.remove();
  });
  it('focuses the root if the dialog has no visible focus targets', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    render(<UsageGuideModal onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});

describe('guide workspace actions', () => {
  const actionExpectations: Record<GuideActionId, [string, unknown]> = {
    'open-repo': ['openRepoDialog', undefined], 'create-repo': ['openCreateRepoModal', undefined], home: ['openHome', undefined],
    providers: ['settings', 'providers'], 'ai-settings': ['settings', 'ai'], 'appearance-settings': ['settings', 'themes'], 'git-settings': ['settings', 'git'],
    shortcuts: ['state', { shortcutsModalOpen: true }], palette: ['openCommandPalette', undefined], terminal: ['state', { terminalDrawerOpen: true }],
    'pull-requests': ['openPullRequestsModal', undefined], 'restore-points': ['state', { restorePointsOpen: true }], 'resolution-memory': ['state', { resolutionMemoryOpen: true }],
    'range-comparison': ['state', { rangeComparisonOpen: true, rangeComparisonId: null }], 'branch-stacks': ['state', { branchStackOpen: true }], lfs: ['state', { lfsManagerOpen: true }],
    sparse: ['state', { sparseCheckoutOpen: true }], reflog: ['openReflogModal', undefined], worktrees: ['openWorktreesModal', undefined], 'git-flow': ['openGitFlowModal', undefined],
    bisect: ['openBisectModal', undefined], changelog: ['openChangelogModal', undefined]
  };
  it.each(Object.entries(actionExpectations))('launches %s in the correct workspace and closes the guide', (id, [method, payload]) => {
    mocks.app.activeTab = '/projects/workspace';
    const onClose = vi.fn();
    render(<UsageGuideModal onClose={onClose} />);
    if (id === 'shortcuts') fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    else {
      const topic = guideTopics.find(topic => topic.actions?.some(action => action.id === id))!;
      openTopic(topic.id);
      const action = topic.actions!.find(action => action.id === id)!;
      fireEvent.click(screen.getByRole('button', { name: action.label, exact: true }));
    }
    expect(onClose).toHaveBeenCalledOnce();
    if (method === 'settings') expect(mocks.settings.openSettings).toHaveBeenCalledWith(payload);
    else if (method === 'state') expect(mocks.useApp.setState).toHaveBeenCalledWith(payload);
    else expect(mocks.app[method]).toHaveBeenCalledOnce();
    if (repositoryActions.has(id)) expect(mocks.useApp.setState).toHaveBeenCalledWith({ homeOpen: false });
  });
  it.each([false, true])('disables repository actions while no repository is ready (opening=%s)', opening => {
    mocks.app.activeTab = opening ? '/work/repo' : null;
    mocks.app.isOpeningRepo = opening;
    render(<UsageGuideModal onClose={vi.fn()} />);
    openTopic('lfs');
    expect(screen.getByRole('button', { name: 'Open Git LFS manager' })).toBeDisabled();
    expect(screen.getByText(opening ? 'Wait for the repository to finish opening to use these tools.' : 'Open a repository to use these tools.')).toBeVisible();
    if (!opening) {
      fireEvent.click(screen.getByRole('button', { name: 'Open repository', exact: true }));
      expect(mocks.app.openRepoDialog).toHaveBeenCalledOnce();
    }
  });
  it('hands focus to the launched tool and does not restore focus to the original launcher', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 1, height: 1 } as DOMRect] as unknown as DOMRectList);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
    const launcher = document.createElement('button'); document.body.append(launcher); launcher.focus();
    const tool = document.createElement('div'); tool.setAttribute('role', 'dialog');
    const target = document.createElement('button'); tool.append(target);
    const { unmount } = render(<UsageGuideModal onClose={() => document.body.append(tool)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(target).toHaveFocus();
    unmount(); expect(launcher).not.toHaveFocus();
    tool.remove(); launcher.remove();
  });
});
