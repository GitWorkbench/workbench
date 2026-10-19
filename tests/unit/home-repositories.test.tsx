// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryOverview } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({
  api: {
    listPinnedRepos: vi.fn(), recentRepos: vi.fn(), getRepositoryOverview: vi.fn(),
    pinRepository: vi.fn(), removeRecentRepo: vi.fn()
  },
  recentRepos: [] as string[], setState: vi.fn()
}));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/renderer/store', () => ({ useApp: { setState: mocks.setState } }));
import { useHomeRepositories } from '../../src/renderer/components/Home/useHomeRepositories';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const overview = (path: string, overrides: Partial<RepositoryOverview> = {}): RepositoryOverview => ({
  path, branch: 'main', changed: 1, staged: 0, conflicts: 0, ahead: 2, behind: 0, checkedAt: '2026-01-01T00:00:00Z', ...overrides
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.recentRepos = [];
  mocks.api.listPinnedRepos.mockResolvedValue([]);
  mocks.api.recentRepos.mockResolvedValue(['/recent']);
  mocks.api.getRepositoryOverview.mockImplementation(async repo => overview(repo));
  mocks.api.pinRepository.mockImplementation(async (repo, pinned) => pinned ? [repo] : []);
  mocks.api.removeRecentRepo.mockResolvedValue(undefined);
  mocks.setState.mockImplementation(update => {
    const patch = typeof update === 'function' ? update({ recentRepos: mocks.recentRepos }) : update;
    if (patch.recentRepos) mocks.recentRepos = patch.recentRepos;
  });
});
afterEach(cleanup);
async function ready() {
  const hook = renderHook(() => useHomeRepositories());
  await waitFor(() => expect(hook.result.current.initializing).toBe(false));
  await waitFor(() => expect(hook.result.current.refreshing).toBeNull());
  return hook;
}

describe('Home repository initialization', () => {
  it('loads pinned repositories and recent paths, then fetches local status', async () => {
    mocks.api.listPinnedRepos.mockResolvedValue(['/a', '/b']);
    const hook = await ready();
    expect(hook.result.current.pins).toEqual(['/a', '/b']);
    expect(mocks.recentRepos).toEqual(['/recent']);
    expect(mocks.api.getRepositoryOverview.mock.calls).toEqual([['/a', false], ['/b', false]]);
    expect(hook.result.current.rows['/a']).toMatchObject({ path: '/a', branch: 'main', ahead: 2 });
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.pending).toEqual([]);
  });
  it('reports both list failures without leaving initialization stuck', async () => {
    mocks.api.listPinnedRepos.mockRejectedValue(new Error('pins unavailable'));
    mocks.api.recentRepos.mockRejectedValue('recent unavailable');
    const hook = await ready();
    expect(hook.result.current.error).toBe('Could not load pinned repositories: Error: pins unavailable Could not load recent repositories: recent unavailable');
    expect(hook.result.current.pins).toEqual([]);
    expect(mocks.api.getRepositoryOverview).not.toHaveBeenCalled();
  });
  it('keeps an existing pin list when a reload cannot retrieve pins', async () => {
    mocks.api.listPinnedRepos.mockResolvedValue(['/a']);
    const hook = await ready();
    mocks.api.listPinnedRepos.mockRejectedValue(new Error('offline'));
    await act(() => hook.result.current.reload());
    expect(hook.result.current.pins).toEqual(['/a']);
    expect(hook.result.current.error).toContain('Could not load pinned repositories');
  });
  it('ignores an older reload completing after a newer request', async () => {
    const older = deferred<string[]>();
    mocks.api.listPinnedRepos.mockReturnValueOnce(older.promise).mockResolvedValueOnce(['/new']);
    const hook = renderHook(() => useHomeRepositories());
    await act(() => hook.result.current.reload());
    await act(async () => older.resolve(['/old']));
    expect(hook.result.current.pins).toEqual(['/new']);
    expect(mocks.api.getRepositoryOverview).toHaveBeenCalledExactlyOnceWith('/new', false);
  });
  it('ignores initialization results arriving after unmount', async () => {
    const pins = deferred<string[]>();
    mocks.api.listPinnedRepos.mockReturnValue(pins.promise);
    const hook = renderHook(() => useHomeRepositories());
    hook.unmount();
    await act(async () => pins.resolve(['/late']));
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.api.getRepositoryOverview).not.toHaveBeenCalled();
  });
});

describe('Home status refresh', () => {
  it('limits overview requests to three workers and exposes pending paths', async () => {
    const hook = await ready();
    const pending = new Map(['a', 'b', 'c', 'd'].map(repo => [repo, deferred<RepositoryOverview>()]));
    mocks.api.getRepositoryOverview.mockImplementation(repo => pending.get(repo)!.promise);
    let refresh!: Promise<void>;
    act(() => { refresh = hook.result.current.refresh(['a', 'b', 'c', 'd']); });
    expect(hook.result.current.refreshing).toBe('local');
    expect(hook.result.current.pending).toEqual(['a', 'b', 'c', 'd']);
    expect(mocks.api.getRepositoryOverview).toHaveBeenCalledTimes(3);
    await act(async () => pending.get('a')!.resolve(overview('a')));
    expect(mocks.api.getRepositoryOverview).toHaveBeenCalledTimes(4);
    expect(hook.result.current.pending).toEqual(['b', 'c', 'd']);
    await act(async () => {
      for (const repo of ['b', 'c', 'd']) pending.get(repo)!.resolve(overview(repo));
      await refresh;
    });
    expect(hook.result.current.refreshing).toBeNull();
    expect(hook.result.current.pending).toEqual([]);
    expect(Object.keys(hook.result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('preserves hosted request details through local refreshes', async () => {
    const hook = await ready();
    const requests = [{ id: '1', title: 'Fix', url: 'https://example.com/pr/1' }];
    mocks.api.getRepositoryOverview.mockResolvedValueOnce(overview('/a', { requests, hostedMessage: 'Connected' }));
    await act(() => hook.result.current.refresh(['/a'], true));
    const checked = hook.result.current.rows['/a'].hostedCheckedAt;
    expect(checked).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    mocks.api.getRepositoryOverview.mockResolvedValueOnce(overview('/a', { changed: 8 }));
    await act(() => hook.result.current.refresh(['/a']));
    expect(hook.result.current.rows['/a']).toMatchObject({ changed: 8, requests, hostedMessage: 'Connected', hostedCheckedAt: checked });
  });
  it('renders useful error rows and retains a previous successful snapshot', async () => {
    const hook = await ready();
    mocks.api.getRepositoryOverview.mockRejectedValueOnce(new Error('permission denied'));
    await act(() => hook.result.current.refresh(['/new']));
    expect(hook.result.current.rows['/new']).toMatchObject({ path: '/new', branch: '', changed: 0, staged: 0, conflicts: 0, ahead: 0, behind: 0, error: 'permission denied' });
    mocks.api.getRepositoryOverview.mockResolvedValueOnce(overview('/existing', { branch: 'feature' }));
    await act(() => hook.result.current.refresh(['/existing']));
    mocks.api.getRepositoryOverview.mockRejectedValueOnce('offline');
    await act(() => hook.result.current.refresh(['/existing']));
    expect(hook.result.current.rows['/existing']).toMatchObject({ branch: 'feature', error: 'offline' });
  });
  it.each(['resolve', 'reject'] as const)('discards stale refresh results when the old request %ss', async completion => {
    const hook = await ready();
    const stale = deferred<RepositoryOverview>();
    mocks.api.getRepositoryOverview.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(overview('/a', { branch: 'fresh' }));
    let first!: Promise<void>;
    act(() => { first = hook.result.current.refresh(['/a']); });
    await act(() => hook.result.current.refresh(['/a']));
    await act(async () => {
      if (completion === 'resolve') stale.resolve(overview('/a', { branch: 'stale' }));
      else stale.reject(new Error('stale error'));
      await first;
    });
    expect(hook.result.current.rows['/a'].branch).toBe('fresh');
    expect(hook.result.current.rows['/a'].error).toBeUndefined();
  });
  it.each(['resolve', 'reject'] as const)('cancels pending refresh state writes after unmount on %s', async completion => {
    const hook = await ready();
    const deferredRow = deferred<RepositoryOverview>();
    mocks.api.getRepositoryOverview.mockReturnValueOnce(deferredRow.promise);
    let task!: Promise<void>;
    act(() => { task = hook.result.current.refresh(['/a']); });
    hook.unmount();
    await act(async () => {
      if (completion === 'resolve') deferredRow.resolve(overview('/a'));
      else deferredRow.reject(new Error('late error'));
      await task;
    });
    const calls = mocks.api.getRepositoryOverview.mock.calls.length;
    await hook.result.current.refresh(['/never']);
    expect(mocks.api.getRepositoryOverview).toHaveBeenCalledTimes(calls);
  });
});

describe('Home repository mutations', () => {
  it('pins repositories and fetches newly pinned and missing overviews', async () => {
    mocks.api.listPinnedRepos.mockResolvedValue(['/a']);
    const hook = await ready();
    mocks.api.pinRepository.mockResolvedValue(['/a', '/b', '/c']);
    mocks.api.getRepositoryOverview.mockClear();
    await act(() => hook.result.current.pin('/b', true));
    expect(hook.result.current.pins).toEqual(['/a', '/b', '/c']);
    expect(mocks.api.getRepositoryOverview.mock.calls).toEqual([['/b', false], ['/c', false]]);
    expect(hook.result.current.mutating).toBeNull();
    mocks.api.pinRepository.mockResolvedValue(['/a', '/c']);
    mocks.api.getRepositoryOverview.mockClear();
    await act(() => hook.result.current.pin('/b', false));
    expect(hook.result.current.pins).toEqual(['/a', '/c']);
    expect(mocks.api.getRepositoryOverview).not.toHaveBeenCalled();
  });
  it('blocks pin changes during initialization, status refresh, or another mutation', async () => {
    const pins = deferred<string[]>();
    mocks.api.listPinnedRepos.mockReturnValueOnce(pins.promise);
    const hook = renderHook(() => useHomeRepositories());
    await hook.result.current.pin('/initializing', true);
    expect(mocks.api.pinRepository).not.toHaveBeenCalled();
    await act(async () => pins.resolve([]));
    const row = deferred<RepositoryOverview>();
    mocks.api.getRepositoryOverview.mockReturnValueOnce(row.promise);
    let refresh!: Promise<void>;
    act(() => { refresh = hook.result.current.refresh(['/a']); });
    await hook.result.current.pin('/refreshing', true);
    expect(mocks.api.pinRepository).not.toHaveBeenCalled();
    await act(async () => { row.resolve(overview('/a')); await refresh; });
    const pin = deferred<string[]>();
    mocks.api.pinRepository.mockReturnValueOnce(pin.promise);
    let mutation!: Promise<void>;
    act(() => { mutation = hook.result.current.pin('/one', false); });
    expect(hook.result.current.mutating).toBe('/one');
    await hook.result.current.pin('/two', false);
    await hook.result.current.removeRecent('/two');
    expect(mocks.api.pinRepository).toHaveBeenCalledTimes(1);
    expect(mocks.api.removeRecentRepo).not.toHaveBeenCalled();
    await act(async () => { pin.resolve([]); await mutation; });
  });
  it('reports pin failures and releases the mutation lock for retry', async () => {
    const hook = await ready();
    mocks.api.pinRepository.mockRejectedValueOnce(new Error('cannot pin'));
    await act(() => hook.result.current.pin('/a', true));
    expect(hook.result.current.error).toBe('Error: cannot pin');
    expect(hook.result.current.mutating).toBeNull();
    await act(() => hook.result.current.pin('/a', true));
    expect(hook.result.current.error).toBe('');
  });
  it.each(['resolve', 'reject'] as const)('ignores pin completion after unmount: %s', async completion => {
    const hook = await ready();
    const pin = deferred<string[]>();
    mocks.api.pinRepository.mockReturnValueOnce(pin.promise);
    let task!: Promise<void>;
    act(() => { task = hook.result.current.pin('/a', true); });
    hook.unmount();
    await act(async () => {
      if (completion === 'resolve') pin.resolve(['/a']);
      else pin.reject(new Error('late pin failure'));
      await task;
    });
    expect(mocks.api.getRepositoryOverview).not.toHaveBeenCalled();
  });
  it('removes only the selected recent repository and rejects concurrent changes', async () => {
    const hook = await ready();
    mocks.recentRepos = ['/a', '/b'];
    const removal = deferred<void>();
    mocks.api.removeRecentRepo.mockReturnValueOnce(removal.promise);
    let task!: Promise<void>;
    act(() => { task = hook.result.current.removeRecent('/a'); });
    expect(hook.result.current.mutating).toBe('/a');
    await hook.result.current.removeRecent('/b');
    expect(mocks.api.removeRecentRepo).toHaveBeenCalledExactlyOnceWith('/a');
    await act(async () => { removal.resolve(); await task; });
    expect(mocks.recentRepos).toEqual(['/b']);
    expect(hook.result.current.mutating).toBeNull();
  });
  it('reports recent removal failures and preserves recent repositories', async () => {
    const hook = await ready();
    mocks.recentRepos = ['/a', '/b'];
    mocks.api.removeRecentRepo.mockRejectedValueOnce(new Error('cannot remove'));
    await act(() => hook.result.current.removeRecent('/a'));
    expect(hook.result.current.error).toBe('Error: cannot remove');
    expect(mocks.recentRepos).toEqual(['/a', '/b']);
    expect(hook.result.current.mutating).toBeNull();
  });
  it('handles recent removal rejection after unmount', async () => {
    const hook = await ready();
    const removal = deferred<void>();
    mocks.api.removeRecentRepo.mockReturnValueOnce(removal.promise);
    let task!: Promise<void>;
    act(() => { task = hook.result.current.removeRecent('/a'); });
    hook.unmount();
    await act(async () => { removal.reject(new Error('late failure')); await task; });
  });
});
