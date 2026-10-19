// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, CommitDetail } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), observe: vi.fn(), disconnect: vi.fn(), clipboard: vi.fn() }));
vi.mock('../../src/renderer/lib/api', () => ({ api: { getCommitDetail: mocks.detail } }));
import { CommitHoverCard } from '../../src/renderer/components/CommitGraph/CommitHoverCard';

let sequence = 0;
const makeCommit = (patch: Partial<Commit> = {}): Commit => ({ hash: `hover-${++sequence}`, shortHash: `short${sequence}`, parents: [], message: 'Improve commit graph', body: '', authorName: 'Alice Example', authorEmail: 'alice@example.invalid', date: '2026-10-19T09:00:00Z', refs: [], lane: 0, lanes: [], ...patch });
const summary = (files = 1, insertions = 1, deletions = 1) => ({ files: Array.from({ length: files }, (_, i) => ({ path: `file-${i}`, status: 'modified', insertions, deletions })), insertions, deletions } as CommitDetail);
const github = [{ name: 'origin', fetchUrl: 'git@github.com:team/git-workbench.git', pushUrl: '' }];
const enter = vi.fn(), leave = vi.fn();

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  mocks.detail.mockReset().mockResolvedValue(summary()); mocks.clipboard.mockReset(); mocks.observe.mockReset(); mocks.disconnect.mockReset(); enter.mockReset(); leave.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe = mocks.observe; disconnect = mocks.disconnect; });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard.mockResolvedValue(undefined) } });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
});
afterEach(() => vi.unstubAllGlobals());
const show = (commit = makeCommit(), remotes = github, pointer = { x: 100, y: 100 }) => render(<CommitHoverCard commit={commit} remotes={remotes} pointer={pointer} onMouseEnter={enter} onMouseLeave={leave} />);
const load = () => act(async () => { await vi.advanceTimersByTimeAsync(220); });

describe('commit hover preview', () => {
  it('portals accessible metadata beside the pointer and loads the summary only after the delay', async () => {
    const commit = makeCommit(); const { container } = show(commit);
    expect(container).toBeEmptyDOMElement();
    const card = screen.getByRole('group', { name: `Preview for commit ${commit.shortHash}` });
    expect(card).toHaveStyle({ left: '116px', top: '116px', width: '500px' });
    expect(card).toHaveTextContent('Alice Example'); expect(card).toHaveTextContent('1 hour ago');
    expect(card).toHaveTextContent('Loading change summary…'); expect(mocks.detail).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(219); }); expect(mocks.detail).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.detail).toHaveBeenCalledWith(commit.hash);
    expect(card).toHaveTextContent('1 file changed,'); expect(card).toHaveTextContent('1 insertion(+)'); expect(card).toHaveTextContent('1 deletion(-)');
    fireEvent.mouseEnter(card); fireEvent.mouseLeave(card); expect(enter).toHaveBeenCalledOnce(); expect(leave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: `Copy commit hash ${commit.hash}` })); expect(mocks.clipboard).toHaveBeenCalledWith(commit.hash);
    expect(screen.getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute('href', `https://github.com/team/git-workbench/commit/${commit.hash}`);
    fireEvent.click(screen.getByRole('link', { name: 'Open on GitHub' }));
  });

  it('pluralizes summary counts and shows fallback author/message text', async () => {
    mocks.detail.mockResolvedValue(summary(2, 0, 3));
    show(makeCommit({ authorName: '', message: '' })); await load();
    expect(screen.getByText('Unknown author')).toBeInTheDocument(); expect(screen.getByText('(no message)')).toBeInTheDocument();
    expect(screen.getByText('2 files changed,')).toBeInTheDocument(); expect(screen.getByText('0 insertions(+)')).toBeInTheDocument(); expect(screen.getByText('3 deletions(-)')).toBeInTheDocument();
  });

  it.each(['null', 'failure'])('handles %s detail responses with a useful unavailable state', async kind => {
    if (kind === 'null') mocks.detail.mockResolvedValue(null); else mocks.detail.mockRejectedValue(new Error('offline'));
    show(); await load(); expect(screen.getByText('Change summary unavailable')).toBeInTheDocument(); expect(screen.queryByText('Loading change summary…')).not.toBeInTheDocument();
  });

  it('reuses cached results for repeated previews and shares in-flight requests', async () => {
    const commit = makeCommit(); let resolve!: (detail: CommitDetail) => void;
    mocks.detail.mockImplementation(() => new Promise<CommitDetail>(finish => { resolve = finish; }));
    const first = show(commit); const second = show(commit); await load(); expect(mocks.detail).toHaveBeenCalledOnce();
    await act(async () => resolve(summary(3, 4, 5)));
    expect(screen.getAllByText('3 files changed,')).toHaveLength(2);
    first.unmount(); second.unmount(); show(commit);
    expect(screen.getByText('3 files changed,')).toBeInTheDocument(); await load(); expect(mocks.detail).toHaveBeenCalledOnce();
  });

  it('cancels delayed requests when unmounted and ignores results after an in-flight preview closes', async () => {
    const pending = show(); pending.unmount(); await load(); expect(mocks.detail).not.toHaveBeenCalled();
    let resolve!: (value: CommitDetail) => void;
    mocks.detail.mockImplementation(() => new Promise<CommitDetail>(finish => { resolve = finish; }));
    const next = show(); await load(); next.unmount(); await act(async () => resolve(summary()));
    expect(screen.queryByRole('group')).not.toBeInTheDocument(); expect(mocks.disconnect).toHaveBeenCalled();
  });

  it.each([
    [0, 'just now'], [59, 'just now'], [60, '1 minute ago'], [120, '2 minutes ago'], [3600, '1 hour ago'], [7200, '2 hours ago'], [86400, '1 day ago'], [172800, '2 days ago']
  ])('formats a commit %s seconds old as %s', (age, label) => {
    show(makeCommit({ date: new Date(Date.now() - Number(age) * 1000).toISOString() })); expect(screen.getByText(String(label))).toBeInTheDocument();
  });

  it('falls back to literal invalid dates and uses an absolute date after a month', () => {
    const first = show(makeCommit({ date: 'invalid-date' })); expect(screen.getAllByText(/invalid-date/)).toHaveLength(2); first.unmount();
    const date = '2025-01-02T12:00:00Z'; show(makeCommit({ date }));
    expect(screen.getByText(new Date(date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))).toBeInTheDocument();
  });

  it.each([
    ['https://github.com/team/project.git', 'https://github.com/team/project/commit/'],
    ['ssh://git@github.com/team/project', 'https://github.com/team/project/commit/'],
    ['https://github.com/team/project.git?tab=readme', 'https://github.com/team/project/commit/']
  ])('recognizes GitHub remote %s', (url, expected) => {
    const commit = makeCommit(); show(commit, [{ name: 'origin', fetchUrl: '', pushUrl: url }]);
    expect(screen.getByRole('link')).toHaveAttribute('href', expected + commit.hash);
  });

  it('omits the GitHub link for other hosts and clamps the card inside small viewports', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 }); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    show(makeCommit(), [{ name: 'origin', fetchUrl: 'git@gitlab.com:team/project.git', pushUrl: '' }], { x: 350, y: 190 });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveStyle({ left: '12px', top: '42px', width: '322px' });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 20 }); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 20 });
    fireEvent.resize(window); expect(screen.getByRole('group')).toHaveStyle({ left: '12px', top: '12px', width: '1px' });
  });

  it('positions the preview left and above when that side offers more room', () => {
    show(makeCommit(), [], { x: 1100, y: 740 });
    expect(screen.getByRole('group')).toHaveStyle({ left: '584px', top: '592px', width: '500px' });
  });
});

it('caches an unavailable summary and does not request it again on reopening', async () => {
  const commit = makeCommit(); mocks.detail.mockResolvedValue(null);
  const first = show(commit); await load(); first.unmount();
  show(commit); expect(screen.getByText('Change summary unavailable')).toBeVisible();
  await load(); expect(mocks.detail).toHaveBeenCalledOnce();
});
it('repositions after height and width changes while keeping stable coordinates unchanged', () => {
  const first = show(makeCommit(), [], { x: 100, y: 740 });
  expect(screen.getByRole('group')).toHaveStyle({ left: '116px', top: '592px' });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 }); fireEvent.resize(window);
  expect(screen.getByRole('group')).toHaveStyle({ left: '116px', top: '756px' }); first.unmount();
  show(makeCommit(), [], { x: 0, y: 0 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 }); fireEvent.resize(window);
  expect(screen.getByRole('group')).toHaveStyle({ left: '16px', top: '16px', width: '372px' });
  fireEvent.resize(window);
  expect(screen.getByRole('group')).toHaveStyle({ left: '16px', top: '16px', width: '372px' });
});
