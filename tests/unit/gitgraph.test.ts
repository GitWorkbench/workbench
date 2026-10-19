// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGitGraph } from '../../src/renderer/components/CommitGraph/gitgraph';
import { BRANCH_W, LANE_COLORS, LANE_W, ROW_H, laneColor } from '../../src/renderer/components/CommitGraph/lanes';
import type { Commit } from '../../src/shared/types';

const commit = (hash: string, parents: string[] = [], options: Partial<Commit> = {}): Commit => ({
  hash, shortHash: hash.slice(0, 7), parents, message: hash, body: '', authorName: 'Developer', authorEmail: 'dev@example.com',
  date: '2026-01-01T00:00:00Z', refs: [], lanes: [], lane: 0, ...options
});

describe('lane colors and dimensions', () => {
  it('provides stable dimensions and cycles the palette', () => {
    expect([LANE_W, ROW_H, BRANCH_W]).toEqual([20, 32, 180]);
    expect(LANE_COLORS).toHaveLength(9);
    for (let lane = 0; lane < 30; lane++) expect(laneColor(lane)).toBe(LANE_COLORS[lane % 9]);
  });
});

describe('buildGitGraph with actual graph renderer', () => {
  it('returns bounded dimensions for empty history and custom spacing', () => {
    expect(buildGitGraph([])).toEqual({ commits: [], branchesPaths: [], width: 80, height: 32 });
    expect(buildGitGraph([], { rowH: 40 }).height).toBe(40);
  });
  it('renders linear histories in newest-first row order and preserves metadata', () => {
    const commits = [commit('head000', ['root000'], { avatarHash: 'avatar', refs: [{ kind: 'head', label: 'main' }] }), commit('root000')];
    const result = buildGitGraph(commits, { rowH: 28, laneW: 18 });
    expect(result.commits).toEqual([
      { hash: 'head000', shortHash: 'head000', x: 0, y: 0, color: LANE_COLORS[0], authorName: 'Developer', authorEmail: 'dev@example.com', avatarHash: 'avatar', hasRefs: true },
      { hash: 'root000', shortHash: 'root000', x: 0, y: 28, color: LANE_COLORS[0], authorName: 'Developer', authorEmail: 'dev@example.com', avatarHash: undefined, hasRefs: false }
    ]);
    expect(result.width).toBe(38);
    expect(result.height).toBe(56);
    expect(result.branchesPaths.length).toBeGreaterThan(0);
    expect(result.branchesPaths.every(path => path.d.startsWith('M') && Boolean(path.color))).toBe(true);
  });
  it('connects diverged branches and merges without mutating source commits', () => {
    const commits = [commit('merge', ['main', 'side']), commit('main', ['root']), commit('side', ['root']), commit('root')];
    const before = structuredClone(commits);
    const result = buildGitGraph(commits);
    expect(commits).toEqual(before);
    expect(result.commits.map(c => c.hash)).toEqual(['merge', 'main', 'side', 'root']);
    expect(result.commits[2].x).toBeGreaterThan(result.commits[1].x);
    expect(result.commits.map(c => c.y)).toEqual([0, 32, 64, 96]);
    expect(result.branchesPaths.some(path => path.name === 'side-1')).toBe(true);
    expect(result.height).toBe(128);
  });
  it('renders disconnected roots and paginated histories with missing parent commits', () => {
    const result = buildGitGraph([commit('head', ['unloaded-parent']), commit('unrelated')]);
    expect(result.commits).toHaveLength(2);
    expect(result.commits.every(c => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
    expect(result.width).toBeGreaterThanOrEqual(36);
  });
});
