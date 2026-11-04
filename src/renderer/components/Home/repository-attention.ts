import type { RepositoryOverview } from '../../../shared/types';

export interface RepositoryAttentionItem {
  path: string;
  reasons: string[];
}

export function getRepositoryAttention(
  pins: string[],
  rows: Record<string, RepositoryOverview>
): RepositoryAttentionItem[] {
  return pins.flatMap(path => {
    const row = rows[path];
    if (!row) return [];
    if (row.error) return [{ path, reasons: ['Unavailable'] }];

    const reasons: string[] = [];
    if (row.conflicts > 0) reasons.push(`${row.conflicts} ${row.conflicts === 1 ? 'conflict' : 'conflicts'}`);
    if (row.changed > 0) reasons.push(`${row.changed} uncommitted ${row.changed === 1 ? 'change' : 'changes'}`);
    if (row.ahead > 0) reasons.push(`${row.ahead} to push`);
    if (row.behind > 0) reasons.push(`${row.behind} to pull`);
    return reasons.length ? [{ path, reasons }] : [];
  });
}
