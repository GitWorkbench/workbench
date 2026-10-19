import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mock = vi.hoisted(() => ({
  home: '', handlers: new Map<string, (...args: any[]) => any>(),
  openDialog: vi.fn(), openPath: vi.fn(), reveal: vi.fn(), relaunch: vi.fn(), exit: vi.fn(),
  window: null as any, repo: null as string | null
}));
vi.mock('electron', () => ({
  app: { once: vi.fn(), getPath: () => path.join(mock.home, 'userdata'), relaunch: mock.relaunch, exit: mock.exit },
  ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => {
    if (mock.handlers.has(name)) throw new Error(`Duplicate handler: ${name}`);
    mock.handlers.set(name, callback);
  } },
  dialog: { showOpenDialog: mock.openDialog }, shell: { openPath: mock.openPath, showItemInFolder: mock.reveal },
  safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'keychain' }
}));
vi.mock('node:os', async original => ({ ...(await original<typeof import('node:os')>()), default: { ...(await original<typeof import('node:os')>()), homedir: () => mock.home } }));
const call = (channel: string, ...args: any[]) => mock.handlers.get(channel)!({}, ...args);
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trim();
const recentFile = () => path.join(mock.home, '.config', 'git-workbench', 'recent-repos.json');
let repo: string;
beforeEach(async () => {
  mock.home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-ipc-test-')));
  mock.handlers.clear(); mock.repo = null;
  mock.window = { minimize: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(), close: vi.fn(), isMaximized: vi.fn(() => false), isDestroyed: () => false, webContents: { send: vi.fn() } };
  mock.openDialog.mockReset(); mock.openPath.mockReset(); mock.reveal.mockReset(); mock.exit.mockReset(); mock.relaunch.mockReset();
  repo = path.join(mock.home, 'repository'); fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(repo, 'file.txt'), 'initial\n'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial');
  const { registerIpc } = await import('../../src/main/ipc'); registerIpc(() => mock.window, () => mock.repo);
});
afterEach(() => fs.rmSync(mock.home, { recursive: true, force: true }));

describe('main-process repository boundary', () => {
  it('registers unique channels and rejects Git operations without an open repository', async () => {
    expect(mock.handlers.size).toBeGreaterThan(150);
    const protectedChannels = ['git:status', 'git:branches', 'git:stashes', 'git:get-tags', 'git:get-remotes', 'git:get-worktrees', 'git:get-operation-state', 'git:restore-points:list', 'git:rewrite:list', 'git:sparse:get', 'git:stack:get', 'git:bisect-state', 'git:flow:get-config', 'git:reflog'];
    for (const channel of protectedChannels) expect(await call(channel)).toMatchObject({ __error: 'No repository open' });
  });
  it('opens real repos, rejects invalid paths, and persists a deduplicated recent list', async () => {
    expect(await call('repo:open-path', mock.home)).toMatchObject({ ok: false, error: expect.stringContaining('not a git repository') });
    expect(await call('repo:open-path', repo)).toMatchObject({ ok: true, repo: { path: repo, name: 'repository' } });
    await call('repo:open-path', repo);
    expect(await call('repo:recent')).toEqual([repo]);
    expect(JSON.parse(fs.readFileSync(recentFile(), 'utf8'))).toEqual([repo]);
    await call('repo:remove-recent', repo); expect(await call('repo:recent')).toEqual([]);
  });
  it('recovers from corrupt or invalid recent repository data', async () => {
    fs.mkdirSync(path.dirname(recentFile()), { recursive: true }); fs.writeFileSync(recentFile(), '{broken');
    expect(await call('repo:recent')).toEqual([]);
    fs.writeFileSync(recentFile(), JSON.stringify([repo, 123]));
    expect(await call('repo:recent')).toEqual([]);
    fs.unlinkSync(recentFile());
    expect(await call('repo:recent')).toEqual([]);
  });
  it('routes a selected folder and handles picker cancellation or missing windows', async () => {
    mock.openDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await call('repo:open-dialog')).toEqual({ ok: false, error: 'canceled' });
    expect(await call('repo:select-directory')).toEqual({ ok: false, error: 'canceled' });
    mock.openDialog.mockResolvedValue({ canceled: false, filePaths: [repo] });
    expect(await call('repo:open-dialog')).toMatchObject({ ok: true, repo: { path: repo } });
    expect(await call('repo:select-directory', 'Choose repository')).toEqual({ ok: true, path: repo });
    expect(mock.openDialog.mock.calls.at(-1)![1].title).toBe('Choose repository');
    mock.window = null;
    expect(await call('repo:open-dialog')).toMatchObject({ ok: false, error: 'no window' });
    expect(await call('repo:select-directory')).toMatchObject({ ok: false, error: 'no window' });
  });
  it.each(['node', 'python', 'go', 'rust', 'general', 'unknown', 'None'])('creates repositories with the %s ignore template without overwriting existing files', async template => {
    const directory = path.join(mock.home, `new-${template}`);
    const result = await call('repo:init', { path: directory, initialBranch: 'feature/start', createReadme: true, gitignoreTemplate: template });
    expect(result).toMatchObject({ ok: true });
    expect(git(directory, 'branch', '--show-current')).toBe('feature/start');
    expect(fs.readFileSync(path.join(directory, 'README.md'), 'utf8')).toContain(`# new-${template}`);
    expect(fs.existsSync(path.join(directory, '.gitignore'))).toBe(template !== 'None');
    fs.writeFileSync(path.join(directory, 'README.md'), 'keep me');
    await call('repo:init', { path: directory, createReadme: true, gitignoreTemplate: template });
    expect(fs.readFileSync(path.join(directory, 'README.md'), 'utf8')).toBe('keep me');
  });
  it('only permits known repositories in the dashboard', async () => {
    expect(await call('dashboard:pin', repo, true)).toMatchObject({ __error: expect.stringContaining('Open this repository once') });
    await call('repo:open-path', repo); await call('dashboard:pin', repo, true);
    expect(await call('dashboard:pins')).toEqual([repo]);
    expect(await call('dashboard:overview', repo, false)).toMatchObject({ path: repo, branch: 'main' });
    await call('dashboard:pin', repo, false); expect(await call('dashboard:pins')).toEqual([]);
  });
  it('returns local Git config and stages, commits, and refreshes the active repo', async () => {
    mock.repo = repo;
    expect(await call('git:config-get', 'local')).toEqual({ name: 'Test', email: 'test@example.invalid' });
    await call('git:config-set', { name: 'New Author', scope: 'local' });
    expect(git(repo, 'config', 'user.name')).toBe('New Author');
    fs.writeFileSync(path.join(repo, 'file.txt'), 'changed\n');
    await call('git:stage', ['file.txt']);
    expect((await call('git:status')).staged).toHaveLength(1);
    expect(await call('git:commit', 'update file')).toMatchObject({ ok: true });
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('update file');
    expect((await call('git:log')).commits).toHaveLength(2);
  });
  it('creates a safety snapshot before discarding worktree content', async () => {
    mock.repo = repo; fs.writeFileSync(path.join(repo, 'file.txt'), 'valuable work\n');
    expect(await call('git:discard', 'file.txt')).toMatchObject({ staged: [], unstaged: [] });
    expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf8')).toBe('initial\n');
    const points = await call('git:restore-points:list');
    expect(points).toHaveLength(1); expect(points[0].label).toContain('Before discarding');
    await call('git:restore-points:restore', points[0].id);
    expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf8')).toBe('valuable work\n');
  });
  it('serializes concurrent writes and snapshots on the same repository', async () => {
    mock.repo = repo; fs.writeFileSync(path.join(repo, 'file.txt'), 'changed\n');
    const results = await Promise.all([call('git:stage', ['file.txt']), call('git:unstage', ['file.txt']), call('git:stage-all')]);
    expect(results.map(result => result.staged.length)).toEqual([1, 0, 1]);
    expect(git(repo, 'show', ':file.txt')).toBe('changed');
    expect((await call('git:status')).unstaged).toHaveLength(0);
  });
  it('does not pass arbitrary provider names to credential storage', async () => {
    for (const channel of ['git:pull-requests:save-credential', 'git:pull-requests:remove-credential']) {
      expect(await call(channel, 'attacker', { token: 'secret' })).toMatchObject({ __error: 'Choose GitHub, GitLab, or Bitbucket.' });
    }
  });
  it('opens existing files in the OS editor without executing shell strings', async () => {
    mock.repo = repo;
    expect(await call('app:open-in-editor', 'missing.txt')).toMatchObject({ ok: false });
    expect(await call('app:open-in-editor', 'file.txt')).toMatchObject({ ok: true });
    expect(mock.openPath).toHaveBeenCalledExactlyOnceWith(path.join(repo, 'file.txt'));
    await call('app:reveal-in-folder', 'file.txt'); expect(mock.reveal).toHaveBeenCalledWith(path.join(repo, 'file.txt'));
  });
});

describe('desktop window commands', () => {
  it('minimizes, maximizes, unmaximizes, closes and restarts through Electron', async () => {
    expect(await call('window:minimize')).toBe(true); expect(mock.window.minimize).toHaveBeenCalledOnce();
    await call('window:maximize'); expect(mock.window.maximize).toHaveBeenCalledOnce();
    mock.window.isMaximized.mockReturnValue(true);
    await call('window:maximize'); expect(mock.window.unmaximize).toHaveBeenCalledOnce();
    expect(await call('window:is-maximized')).toBe(true);
    await call('window:close'); expect(mock.window.close).toHaveBeenCalledOnce();
    expect(await call('app:restart')).toBe(true); expect(mock.relaunch).toHaveBeenCalledOnce(); expect(mock.exit).toHaveBeenCalledWith(0);
  });
  it('handles a window closed before the command arrived', async () => {
    mock.window = null;
    expect(await call('window:maximize')).toBe(false); expect(await call('window:is-maximized')).toBe(false);
    expect(await call('window:minimize')).toBe(true); expect(await call('window:close')).toBe(true);
  });
});
