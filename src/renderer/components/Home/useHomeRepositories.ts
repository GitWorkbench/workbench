import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryOverview } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../store';

export type HomeRepositoryOverview = RepositoryOverview & { hostedCheckedAt?: string };
type RefreshKind = 'local' | 'hosted';

export function useHomeRepositories() {
  const [pins, setPins] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, HomeRepositoryOverview>>({});
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState<RefreshKind | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [mutating, setMutating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(false), generation = useRef(0), mutationLock = useRef(false);

  const refresh = useCallback(async (repos: string[], hosted = false) => {
    const token = ++generation.current;
    if (!mounted.current) return;
    setRefreshing(hosted ? 'hosted' : 'local'); setPending(repos);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, repos.length) }, async () => {
      while (cursor < repos.length && token === generation.current && mounted.current) {
        const repo = repos[cursor++];
        try {
          const row = await api.getRepositoryOverview(repo, hosted);
          if (token !== generation.current || !mounted.current) return;
          setRows(old => ({ ...old, [repo]: {
            ...row,
            ...(hosted ? { hostedCheckedAt: new Date().toISOString() } : {
              requests: old[repo]?.requests, hostedMessage: old[repo]?.hostedMessage,
              hostedCheckedAt: old[repo]?.hostedCheckedAt
            })
          } }));
        } catch (failure) {
          if (token === generation.current && mounted.current) setRows(old => {
            const previous = old[repo] || { path: repo, branch: '', changed: 0, staged: 0, conflicts: 0, ahead: 0, behind: 0 };
            return { ...old, [repo]: { ...previous, checkedAt: new Date().toISOString(), error: String(failure).replace(/^Error: /, '') } };
          });
        } finally {
          if (token === generation.current && mounted.current) setPending(old => old.filter(p => p !== repo));
        }
      }
    }));
    if (token === generation.current && mounted.current) { setRefreshing(null); setPending([]); }
  }, []);

  const reload = useCallback(async () => {
    const token = ++generation.current;
    setInitializing(true); setError('');
    const [pinResult, recentResult] = await Promise.allSettled([api.listPinnedRepos(), api.recentRepos()]);
    if (!mounted.current || token !== generation.current) return;
    const failures: string[] = [];
    const nextPins = pinResult.status === 'fulfilled' ? pinResult.value : [];
    if (pinResult.status === 'fulfilled') setPins(nextPins);
    else failures.push(`Could not load pinned repositories: ${String(pinResult.reason)}`);
    if (recentResult.status === 'fulfilled') useApp.setState({ recentRepos: recentResult.value });
    else failures.push(`Could not load recent repositories: ${String(recentResult.reason)}`);
    setInitializing(false); setError(failures.join(' '));
    await refresh(nextPins);
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => { mounted.current = false; ++generation.current; };
  }, [reload]);

  const pin = async (repo: string, pinned: boolean) => {
    if (mutationLock.current || refreshing || initializing) return;
    mutationLock.current = true; setMutating(repo); setError('');
    try {
      const next = await api.pinRepository(repo, pinned);
      if (!mounted.current) return;
      setPins(next);
      if (pinned) await refresh(next.filter(p => p === repo || !rows[p]));
    } catch (failure) { if (mounted.current) setError(String(failure)); }
    finally { mutationLock.current = false; if (mounted.current) setMutating(null); }
  };

  const removeRecent = async (repo: string) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setMutating(repo); setError('');
    try {
      await api.removeRecentRepo(repo);
      useApp.setState(state => ({ recentRepos: state.recentRepos.filter(p => p !== repo) }));
    } catch (failure) { if (mounted.current) setError(String(failure)); }
    finally { mutationLock.current = false; if (mounted.current) setMutating(null); }
  };

  return { pins, rows, initializing, refreshing, pending, mutating, error, refresh, reload, pin, removeRecent };
}
