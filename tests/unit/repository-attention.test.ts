import { describe, expect, it } from 'vitest';
import type { RepositoryOverview } from '../../src/shared/types';
import { getRepositoryAttention } from '../../src/renderer/components/Home/repository-attention';

const overview = (path: string, patch: Partial<RepositoryOverview> = {}): RepositoryOverview => ({
  path, branch: 'main', changed: 0, staged: 0, conflicts: 0, ahead: 0, behind: 0,
  checkedAt: '2026-11-01T00:00:00Z', ...patch
});

describe('repository attention', () => {
  it('omits clean and not-yet-loaded repositories', () => {
    expect(getRepositoryAttention(['/clean', '/loading'], { '/clean': overview('/clean') })).toEqual([]);
  });

  it('summarizes conflicts, uncommitted files, outgoing and incoming commits', () => {
    expect(getRepositoryAttention(['/repo'], {
      '/repo': overview('/repo', { conflicts: 1, changed: 2, ahead: 3, behind: 1 })
    })).toEqual([{ path: '/repo', reasons: ['1 conflict', '2 uncommitted changes', '3 to push', '1 to pull'] }]);
  });

  it('reports unavailable repositories without presenting stale status counts', () => {
    expect(getRepositoryAttention(['/missing'], {
      '/missing': overview('/missing', { error: 'Folder unavailable', conflicts: 2, changed: 9 })
    })).toEqual([{ path: '/missing', reasons: ['Unavailable'] }]);
  });
});
