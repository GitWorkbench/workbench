import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ exec: vi.fn(), valid: vi.fn() }));
vi.mock('node:child_process', () => {
  const execFile = () => {};
  Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), { value: mock.exec });
  return { execFile };
});
vi.mock('../../src/main/git/core', () => ({ isValidRepo: mock.valid }));
import { getHistoryReplay, parseReplayLog } from '../../src/main/git/history-explorer';

const hash = 'a'.repeat(40);
const commitRecord = (id: string, parents = '', summary = 'commit subject') => `${id}\u0000${parents}\u0000Alice\u0000alice@example.test\u00002026-10-01T12:30:00+00:00\u0000${summary}\u001e`;

beforeEach(() => {
  mock.exec.mockReset().mockResolvedValue({ stdout: '' });
  mock.valid.mockReset().mockReturnValue(true);
});

describe('history replay log parsing', () => {
  it('maps complete and sparse commit records while rejecting malformed hashes', () => {
    const output = `\n${commitRecord(hash, `${'b'.repeat(40)} ${'c'.repeat(40)}`, 'A useful reason')}\n${commitRecord('d'.repeat(64), '', '')}\n${commitRecord('short')}`;
    expect(parseReplayLog(output)).toEqual([
      { hash, shortHash: 'a'.repeat(7), parents: ['b'.repeat(40), 'c'.repeat(40)], authorName: 'Alice', authorEmail: 'alice@example.test', date: '2026-10-01T12:30:00+00:00', summary: 'A useful reason' },
      { hash: 'd'.repeat(64), shortHash: 'd'.repeat(7), parents: [], authorName: 'Alice', authorEmail: 'alice@example.test', date: '2026-10-01T12:30:00+00:00', summary: '' }
    ]);
  });
  it('ignores empty records and supplies defaults for missing fields', () => {
    expect(parseReplayLog(`\n\u001e${hash}\u0000\u001e`)).toEqual([{ hash, shortHash: 'a'.repeat(7), parents: [], authorName: '', authorEmail: '', date: '', summary: '' }]);
  });
});

describe('branch history replay', () => {
  it('reads a local branch with its true commit ancestry and a bounded history', async () => {
    mock.exec.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'rev-parse') return { stdout: `${hash}\n` };
      if (args[0] === 'log') return { stdout: commitRecord(hash) };
      if (args[0] === 'rev-list') return { stdout: '501\n' };
      return { stdout: '' };
    });
    await expect(getHistoryReplay('/repo', 'feature/ui')).resolves.toEqual({ branch: 'feature/ui', remote: false, commits: [{ hash, shortHash: 'a'.repeat(7), parents: [], authorName: 'Alice', authorEmail: 'alice@example.test', date: '2026-10-01T12:30:00+00:00', summary: 'commit subject' }], totalCommits: 501, hasMore: true });
    expect(mock.exec).toHaveBeenCalledWith('git', ['check-ref-format', 'refs/heads/feature/ui'], expect.objectContaining({ cwd: '/repo' }));
    expect(mock.exec).toHaveBeenCalledWith('git', ['log', '--topo-order', '--date-order', '--format=%H%x00%P%x00%an%x00%ae%x00%cI%x00%s%x1e', '-n', '500', hash], expect.objectContaining({ cwd: '/repo' }));
  });
  it('uses the remote tracking ref and handles an empty branch with a malformed count', async () => {
    mock.exec.mockImplementation(async (_command: string, args: string[]) => args[0] === 'rev-parse' ? { stdout: `${hash}\n` } : args[0] === 'rev-list' ? { stdout: 'unknown' } : { stdout: '' });
    await expect(getHistoryReplay('/repo', 'origin/topic', true)).resolves.toEqual({ branch: 'origin/topic', remote: true, commits: [], totalCommits: 0, hasMore: false });
    expect(mock.exec).toHaveBeenCalledWith('git', ['check-ref-format', 'refs/remotes/origin/topic'], expect.objectContaining({ cwd: '/repo' }));
  });
  it('rejects invalid repositories and branch inputs before running Git', async () => {
    mock.valid.mockReturnValue(false);
    await expect(getHistoryReplay('/missing', 'main')).rejects.toThrow('Open a valid Git repository');
    mock.valid.mockReturnValue(true);
    for (const branch of ['', '  ', 'x'.repeat(256), 'bad\nname', null] as unknown[]) await expect(getHistoryReplay('/repo', branch as string)).rejects.toThrow('Choose a valid branch');
    expect(mock.exec).not.toHaveBeenCalled();
  });
  it('reports invalid branch refs and Git read failures with a safe message', async () => {
    mock.exec.mockRejectedValueOnce(new Error('bad ref')).mockRejectedValueOnce(new Error('missing branch'));
    await expect(getHistoryReplay('/repo', 'bad/name')).rejects.toThrow('Git could not read this branch history');
    await expect(getHistoryReplay('/repo', 'missing')).rejects.toThrow('Git could not read this branch history');
  });
  it('rejects a branch ref that resolves to a non-commit object', async () => {
    mock.exec.mockImplementation(async (_command: string, args: string[]) => args[0] === 'rev-parse' ? { stdout: 'symbolic result' } : { stdout: '' });
    await expect(getHistoryReplay('/repo', 'not-a-commit')).rejects.toThrow('This branch does not point to a commit');
  });
  it('falls back to parsed commit count when Git reports a negative count', async () => {
    mock.exec.mockImplementation(async (_command: string, args: string[]) => args[0] === 'rev-parse' ? { stdout: hash } : args[0] === 'log' ? { stdout: commitRecord(hash) } : { stdout: '-1' });
    await expect(getHistoryReplay('/repo', 'main')).resolves.toMatchObject({ totalCommits: 1, hasMore: false });
  });
});
