import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit } from '../../src/shared/types';

const graph = vi.hoisted(() => ({
  branches: [] as { name: string; from?: string; commit: ReturnType<typeof vi.fn>; merge: ReturnType<typeof vi.fn> }[],
  commits: [] as { hash: string; x: number; style?: { color: string } }[],
  compare: undefined as undefined | ((a: string, b: string) => number),
  throwMerge: false, omit: '',
  paths: new Map<unknown, unknown>()
}));

vi.mock('@gitgraph/core', () => ({
  TemplateName: { Metro: 'metro' }, MergeStyle: { Bezier: 'bezier' }, templateExtend: vi.fn((_, config) => config),
  GitgraphCore: class {
    constructor(config: { compareBranchesOrder: (a: string, b: string) => number }) { graph.compare = config.compareBranchesOrder; }
    getUserApi() {
      return {
        branch(input: string | { name: string; from: string }) {
          const name = typeof input === 'string' ? input : input.name;
          const from = typeof input === 'string' ? undefined : input.from;
          const add = ({ hash }: { hash: string }) => {
            if (hash !== graph.omit) graph.commits.push({ hash, x: 30, style: hash === 'root' ? undefined : { color: '#123456' } });
          };
          const branch = { name, from, commit: vi.fn(add), merge: vi.fn((options: { commitOptions: { hash: string } }) => {
            if (graph.throwMerge) throw new Error('malformed merge');
            add(options.commitOptions);
          }) };
          graph.branches.push(branch);
          return branch;
        }
      };
    }
    getRenderedData() { return { commits: graph.commits, branchesPaths: graph.paths }; }
  },
  toSvgPath(paths: string[]) {
    if (paths[0] === 'malformed') throw new Error('invalid path');
    return paths[0];
  }
}));
import { buildGitGraph } from '../../src/renderer/components/CommitGraph/gitgraph';

const commit = (hash: string, parents: string[] = []): Commit => ({ hash, shortHash: hash, parents, message: hash, body: '', authorName: 'Dev', authorEmail: 'dev@example.com', date: '', refs: [], lane: 0, lanes: [] });
beforeEach(() => {
  graph.branches = []; graph.commits = []; graph.paths = new Map(); graph.throwMerge = false; graph.omit = '';
});

describe('GitGraph renderer boundary handling', () => {
  it('normalizes graph offsets, falls back to palette colors, and tolerates bad/empty paths', () => {
    graph.paths.set({ name: 'fallback', computedColor: undefined }, ['M 0 0']);
    graph.paths.set({ name: 'custom', computedColor: '#f00' }, ['M 1 1']);
    graph.paths.set({ name: 'empty' }, []);
    graph.paths.set({ name: 'missing' }, undefined);
    graph.paths.set({ name: 'blank' }, ['']);
    graph.paths.set({ name: 'broken' }, ['malformed']);
    const result = buildGitGraph([commit('head', ['root']), commit('root')]);
    expect(result.commits.every(c => c.x === 0)).toBe(true);
    expect(result.commits[1].color).toBe('#26c6da');
    expect(result.commits[0].color).toBe('#123456');
    expect(result.width).toBe(40);
    expect(result.branchesPaths).toEqual([{ name: 'fallback', color: '#26c6da', d: 'M 0 0' }, { name: 'custom', color: '#f00', d: 'M 1 1' }]);
    expect(graph.compare!('trunk', 'side-1')).toBeLessThan(0);
    expect(graph.compare!('side-10', 'side-2')).toBeGreaterThan(0);
    expect(graph.compare!('unknown', 'side-2')).toBeGreaterThan(0);
  });
  it('uses safe positions for omitted rendered commits and missing refs', () => {
    graph.omit = 'head';
    const head = commit('head', ['root']);
    delete (head as Partial<Commit>).refs;
    const result = buildGitGraph([head, commit('root')]);
    expect(result.commits[0]).toMatchObject({ x: 0, y: 0, hasRefs: false, color: '#26c6da' });
    expect(result.commits[1].x).toBe(30);
  });
  it('falls back to an ordinary commit when graph-core rejects a merge', () => {
    graph.throwMerge = true;
    const result = buildGitGraph([commit('merge', ['main', 'side']), commit('main', ['root']), commit('side', ['root']), commit('root')]);
    expect(result.commits).toHaveLength(4);
    expect(graph.branches.find(b => b.name === 'trunk')?.commit).toHaveBeenCalledWith({ hash: 'merge', subject: 'merge' });
    expect(graph.branches.find(b => b.name === 'trunk')?.merge).toHaveBeenCalledOnce();
  });
  it('renders merges whose other parent is unavailable or on the same branch', () => {
    buildGitGraph([commit('merge', ['main', 'unavailable']), commit('main', ['root']), commit('root')]);
    expect(graph.branches[0].merge).not.toHaveBeenCalled();
    graph.branches = []; graph.commits = [];
    buildGitGraph([commit('merge', ['main', 'root']), commit('main', ['root']), commit('root')]);
    expect(graph.branches[0].merge).not.toHaveBeenCalled();
  });
  it('recycles the lowest released side lane when later branches are created', () => {
    buildGitGraph([
      commit('head', ['m2']), commit('unrelated'), commit('m2', ['m1', 's2']), commit('m1', ['root', 's1']),
      commit('s2', ['root']), commit('s1', ['root']), commit('root')
    ]);
    expect(graph.branches.map(b => b.name)).toEqual(['trunk', 'side-1', 'side-2', 'side-1']);
  });
  it('starts a merge branch at its first parent when that parent is no longer a branch tip', () => {
    buildGitGraph([
      commit('head', ['kid']), commit('merge', ['old', 'other']), commit('kid', ['old']), commit('other', ['root']), commit('old', ['root']), commit('root')
    ]);
    expect(graph.branches.some(b => b.from === 'old' && b.name.startsWith('side-'))).toBe(true);
    expect(graph.commits.map(c => c.hash)).toContain('merge');
  });
});
