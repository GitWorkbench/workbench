const { test, after } = require('node:test');
after(require('./test-git-environment.cjs').isolateGitEnvironment());
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const { compareCommits, getComparisonFileDiff, getFileDiff } = require('../src/main/git/commit-detail.ts');
const { stageLines, unstageLines, discardLines, discardHunk, stageHunk } = require('../src/main/git/hunk-actions.ts');
const { startBisect, stepBisect, resetBisect, getBisectState } = require('../src/main/git/bisect.ts');
const { createWorktree } = require('../src/main/git/history.ts');
const { getWorktrees, removeWorktree } = require('../src/main/git/objects-navigation.ts');
const { explainCodeChanges } = require('../src/shared/ai.ts');
const { alignHunkLinesForSplit } = require('../src/renderer/components/DiffViewer/diffUtils.ts');
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t, content = Array.from({ length: 35 }, (_, i) => `line ${i + 1}`).join('\n') + '\n') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-workbench-test-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo'); fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
  const file = path.join(repo, 'file.txt'); fs.writeFileSync(file, content);
  const commit = () => { git(repo, 'add', '.'); git(repo, 'commit', '-m', 'fixture'); return git(repo, 'rev-parse', 'HEAD'); };
  const initial = commit();
  return { dir, repo, file, content, initial, commit, read: () => fs.readFileSync(file, 'utf8') };
}
async function changedIndices(repo, staged = false, hunk = 0) {
  const diff = await getFileDiff(repo, '', 'file.txt', staged ? { staged: true } : { worktree: true });
  return diff.hunks[hunk].lines.flatMap((line, i) => line.kind !== 'context' ? [i] : []);
}
test('comparison handles modified renames, tabs, Unicode, binary files, and swapped revisions', async t => {
  const f = fixture(t); const renamed = process.platform === 'win32' ? 'renamed [日本].txt' : 'renamed\t日本.txt';
  git(f.repo, 'mv', 'file.txt', renamed);
  fs.writeFileSync(path.join(f.repo, renamed), f.content.replace('line 3', 'changed 3'));
  fs.writeFileSync(path.join(f.repo, 'binary.bin'), Buffer.from([0, 1, 2]));
  const target = f.commit();
  const result = await compareCommits(f.repo, f.initial, target);
  const file = result.files.find(x => x.path === renamed);
  assert.equal(file.status, 'renamed'); assert.equal(file.renamedFrom, 'file.txt');
  assert.equal(file.insertions, 1); assert.equal(file.deletions, 1);
  assert.equal((await getComparisonFileDiff(f.repo, f.initial, target, renamed)).hunks.length, 1);
  assert.equal(result.files.find(x => x.path === 'binary.bin').insertions, undefined);
  const swapped = await compareCommits(f.repo, target, f.initial);
  assert.equal(swapped.files.find(x => x.path === 'file.txt').renamedFrom, renamed);
});
test('line discard preserves other hunks and the exact staged patch', async t => {
  const f = fixture(t);
  const staged = f.content.replace('line 15\n', 'staged 15\n'); fs.writeFileSync(f.file, staged); git(f.repo, 'add', '.');
  const index = git(f.repo, 'diff', '--cached');
  fs.writeFileSync(f.file, staged.replace('line 2\n', 'changed 2\n').replace('line 30\n', 'changed 30\n'));
  await discardLines(f.repo, 'file.txt', 0, await changedIndices(f.repo));
  assert.equal(f.read(), staged.replace('line 30\n', 'changed 30\n'));
  assert.equal(git(f.repo, 'diff', '--cached'), index);
});
test('partial unstaging preserves unselected additions and worktree bytes', async t => {
  const f = fixture(t, 'a\nb\nc\n'); fs.writeFileSync(f.file, 'a\nB\nC\n'); git(f.repo, 'add', '.');
  const diff = await getFileDiff(f.repo, '', 'file.txt', { staged: true });
  const i = diff.hunks[0].lines.findIndex(l => l.kind === 'add');
  await unstageLines(f.repo, 'file.txt', 0, [i]);
  assert.equal(git(f.repo, 'show', ':file.txt'), 'a\nC'); assert.equal(f.read(), 'a\nB\nC\n');
});
test('staging selected changes and discarding other hunk preserve index', async t => {
  const f = fixture(t); fs.writeFileSync(f.file, f.content.replace('line 2\n', 'changed 2\n').replace('line 30\n', 'changed 30\n'));
  await stageLines(f.repo, 'file.txt', 0, await changedIndices(f.repo));
  const index = git(f.repo, 'diff', '--cached');
  await discardHunk(f.repo, 'file.txt', 0);
  assert.equal(git(f.repo, 'diff'), ''); assert.equal(git(f.repo, 'diff', '--cached'), index);
});
test('split diff gives additions and deletions independent indices', () => {
  const rows = alignHunkLinesForSplit({ lines: [{ kind: 'del', content: 'old', oldNo: 1, newNo: null }, { kind: 'add', content: 'new', oldNo: null, newNo: 1 }] });
  assert.equal(rows[0].left.hunkLineIndex, 0); assert.equal(rows[0].right.hunkLineIndex, 1);
});
for (const action of ['stage', 'unstage', 'discard']) {
  test(`${action} selected lines handles no trailing newline`, async t => {
    const f = fixture(t, 'one\ntwo'); fs.writeFileSync(f.file, 'ONE\nTWO');
    if (action === 'unstage') git(f.repo, 'add', '.');
    const indices = await changedIndices(f.repo, action === 'unstage');
    await ({ stage: stageLines, unstage: unstageLines, discard: discardLines }[action])(f.repo, 'file.txt', 0, indices);
    assert.equal(action === 'discard' ? f.read() : git(f.repo, 'show', ':file.txt'), action === 'stage' ? 'ONE\nTWO' : 'one\ntwo');
  });
}
test('partial deletion leaves remaining lines', async t => {
  const f = fixture(t, 'one\ntwo\nthree\n'); fs.unlinkSync(f.file);
  await stageLines(f.repo, 'file.txt', 0, [1]);
  assert.equal(git(f.repo, 'show', ':file.txt'), 'one\nthree');
});
test('worktree lifecycle and dirty worktree protection', async t => {
  const f = fixture(t); const wt = path.join(f.dir, 'linked');
  await createWorktree(f.repo, wt, f.initial); assert.equal((await getWorktrees(f.repo)).length, 2);
  fs.writeFileSync(path.join(wt, 'file.txt'), 'dirty');
  await assert.rejects(removeWorktree(f.repo, wt)); assert.equal(fs.readFileSync(path.join(wt, 'file.txt'), 'utf8'), 'dirty');
  git(wt, 'restore', 'file.txt'); await removeWorktree(f.repo, wt); assert.equal((await getWorktrees(f.repo)).length, 1);
});
test('bisect locates culprit, survives reopening, and resets linked worktree', async t => {
  const f = fixture(t); const hashes = [f.initial];
  for (let i = 1; i <= 5; i++) { fs.writeFileSync(f.file, `revision ${i}\n`); hashes.push(f.commit()); }
  const wt = path.join(f.dir, 'linked'); await createWorktree(f.repo, wt, hashes[5]);
  let result = await startBisect(wt, hashes[5], hashes[0]); assert.equal(result.ok, true); assert.equal(result.state.active, true);
  for (let i = 0; i < 8 && !result.state.culpritCommit; i++) {
    const current = hashes.indexOf(result.state.currentCommit.hash);
    result = await stepBisect(wt, current >= 3 ? 'bad' : 'good'); assert.equal(result.ok, true);
  }
  assert.equal(result.state.culpritCommit.hash, hashes[3]);
  assert.equal((await getBisectState(wt)).culpritCommit.hash, hashes[3]);
  assert.equal((await resetBisect(wt)).ok, true); assert.equal(git(wt, 'rev-parse', 'HEAD'), hashes[5]);
});
test('bisect marking good first does not mark it bad or erase session', async t => {
  const f = fixture(t); fs.writeFileSync(f.file, 'bad\n'); const bad = f.commit();
  assert.equal((await startBisect(f.repo, undefined, f.initial)).ok, true);
  const result = await startBisect(f.repo, bad); assert.equal(result.ok, true); assert.equal(result.state.culpritCommit.hash, bad);
  await resetBisect(f.repo);
});
test('bisect refuses dirty checkout before changing HEAD', async t => {
  const f = fixture(t); fs.writeFileSync(f.file, 'dirty');
  assert.equal((await startBisect(f.repo, f.initial)).ok, false);
  assert.equal((await getBisectState(f.repo)).active, false); assert.equal(f.read(), 'dirty');
});
test('AI respects each configured provider and returns generated text', async t => {
  const original = global.fetch; t.after(() => { global.fetch = original; });
  for (const provider of ['pollinations', 'groq', 'gemini', 'openrouter', 'ollama', 'custom']) {
    let request;
    global.fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ choices: [{ message: { content: 'Actual generated review' } }] }) }; };
    const res = await explainCodeChanges('diff --git a/f b/f\n+changed', { provider, model: 'chosen-model', apiKey: 'test-key', endpoint: 'http://localhost:1234/v1' });
    assert.equal(res.explanation, 'Actual generated review'); assert.equal(request.method, 'POST');
    assert.equal(JSON.parse(request.body).model, 'chosen-model'); assert.equal(request.headers.Authorization, 'Bearer test-key');
    assert.ok(JSON.parse(request.body).messages[1].content.includes('+changed'));
    if (provider === 'pollinations') assert.equal(request.url, 'https://gen.pollinations.ai/v1/chat/completions');
    if (provider === 'custom' || provider === 'ollama') assert.equal(request.url, 'http://localhost:1234/v1/chat/completions');
  }
});
test('AI failures, missing keys, and local heuristic never produce a fake review', async t => {
  const original = global.fetch; t.after(() => { global.fetch = original; });
  const config = { provider: 'groq', apiKey: 'test-key' };
  for (const fetch of [async () => ({ ok: false, status: 401 }), async () => { throw new Error('offline'); }, async () => ({ ok: true, json: async () => ({ choices: [] }) })]) {
    global.fetch = fetch; const result = await explainCodeChanges('+test', config); assert.equal(result.ok, false); assert.equal(result.explanation, undefined); assert.ok(result.error);
  }
  global.fetch = () => { throw new Error('Should not call fetch'); };
  assert.equal((await explainCodeChanges('+test', { provider: 'local' })).ok, false);
  assert.match((await explainCodeChanges('+test', { provider: 'groq' })).error, /API key/);
});
for (const action of ['stage', 'discard']) {
  test(`${action} untracked selected lines preserves the other new lines`, async t => {
    const f = fixture(t); const file = path.join(f.repo, 'new.txt'); fs.writeFileSync(file, 'one\ntwo\nthree\n');
    const diff = await getFileDiff(f.repo, '', 'new.txt', { worktree: true }); assert.equal(diff.hunks[0].lines.length, 3);
    await (action === 'stage' ? stageLines : discardLines)(f.repo, 'new.txt', 0, [1]);
    assert.equal(action === 'stage' ? git(f.repo, 'show', ':new.txt') : fs.readFileSync(file, 'utf8'), action === 'stage' ? 'two' : 'one\nthree\n');
  });
}
test('partial unstaging of a new file retains unselected additions', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'new.txt'), 'one\ntwo\nthree\n'); git(f.repo, 'add', '.');
  await unstageLines(f.repo, 'new.txt', 0, [1]); assert.equal(git(f.repo, 'show', ':new.txt'), 'one\nthree');
});
test('clean tracked file has no synthetic addition diff', async t => {
  const f = fixture(t); assert.equal((await getFileDiff(f.repo, '', 'file.txt', { worktree: true })).hunks.length, 0);
});
test('line indices remain correct when a deleted line begins with dashes', async t => {
  const f = fixture(t, '-- heading\nkeep\n'); fs.writeFileSync(f.file, '++ heading\nkeep\n');
  const diff = await getFileDiff(f.repo, '', 'file.txt', { worktree: true });
  assert.equal(diff.hunks[0].lines[0].content, '-- heading'); assert.equal(diff.hunks[0].lines[1].content, '++ heading');
  await stageLines(f.repo, 'file.txt', 0, [0, 1]); assert.equal(git(f.repo, 'diff'), '');
});
test('bisect reports ambiguous candidates when all remaining commits are skipped', async t => {
  const f = fixture(t); const hashes = [f.initial];
  for (let i = 1; i <= 3; i++) { fs.writeFileSync(f.file, `revision ${i}\n`); hashes.push(f.commit()); }
  let result = await startBisect(f.repo, hashes[3], hashes[0]);
  for (let i = 0; i < 5 && !result.state?.ambiguousCommits?.length; i++) {
    result = await stepBisect(f.repo, 'skip');
    assert.equal(result.ok, true, result.error);
  }
  assert.ok(result.state.ambiguousCommits.length > 1);
  assert.ok((await getBisectState(f.repo)).ambiguousCommits.length > 1);
  await resetBisect(f.repo);
});
test('discard preserves CRLF line endings', async t => {
  const f = fixture(t, 'one\r\ntwo\r\nthree\r\n');
  git(f.repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(f.file, 'ONE\r\ntwo\r\nthree\r\n');
  await discardLines(f.repo, 'file.txt', 0, await changedIndices(f.repo));
  assert.equal(f.read(), f.content);
});
test('desktop registers unique IPC handlers and routes both patch APIs correctly', async t => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const handlers = new Map();
  const calls = [];
  let exposedApi;
  const electron = {
    app: { once() {} },
    ipcMain: {
      handle(channel, callback) {
        assert.equal(handlers.has(channel), false, `Duplicate IPC handler: ${channel}`);
        handlers.set(channel, callback);
      }
    },
    contextBridge: { exposeInMainWorld(name, api) { assert.equal(name, 'api'); exposedApi = api; } },
    ipcRenderer: { invoke: async (channel, ...args) => { calls.push({ channel, args }); return { ok: true }; } }
  };
  Module._load = function (name, ...args) {
    return name === 'electron' ? electron : originalLoad.call(this, name, ...args);
  };
  try {
    require('../src/main/ipc.ts').registerIpc(() => null, () => null);
    require('../src/preload/index.ts');
    await exposedApi.applyPatchCommit('abc123');
    await exposedApi.applyPatch('/tmp/change.patch');
    assert.deepEqual(calls, [
      { channel: 'git:apply-patch-commit', args: ['abc123'] },
      { channel: 'git:apply-patch', args: ['/tmp/change.patch'] }
    ]);
    for (const { channel } of calls) assert.ok(handlers.has(channel), `Missing handler: ${channel}`);
    assert.ok(handlers.has('git:bisect-start'));
    assert.ok(handlers.has('ai:explain-changes'));
  } finally {
    Module._load = originalLoad;
  }
});

test('editing HEAD message preserves the tree, index, and unstaged content', async t => {
  const f = fixture(t); const { editCommitMessage } = require('../src/main/git/history.ts');
  fs.writeFileSync(f.file, 'staged\n'); git(f.repo, 'add', '.'); fs.writeFileSync(f.file, 'unstaged\n');
  const tree = git(f.repo, 'rev-parse', 'HEAD^{tree}'); const index = git(f.repo, 'write-tree');
  await editCommitMessage(f.repo, f.initial, 'message only');
  assert.equal(git(f.repo, 'log', '-1', '--format=%s'), 'message only');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD^{tree}'), tree); assert.equal(git(f.repo, 'write-tree'), index);
  assert.equal(f.read(), 'unstaged\n');
});
test('stash file restore refuses local edits, then restores only the worktree', async t => {
  const f = fixture(t); const { applyStashFile } = require('../src/main/git/branch-stash.ts');
  fs.writeFileSync(f.file, 'stash version\n'); git(f.repo, 'stash', 'push');
  fs.writeFileSync(f.file, 'staged\n'); git(f.repo, 'add', '.'); fs.writeFileSync(f.file, 'unstaged\n');
  await assert.rejects(applyStashFile(f.repo, 0, 'file.txt'), /local changes/);
  assert.equal(f.read(), 'unstaged\n'); assert.equal(git(f.repo, 'show', ':file.txt'), 'staged');
  git(f.repo, 'restore', '--source=HEAD', '--staged', '--worktree', 'file.txt');
  await applyStashFile(f.repo, 0, 'file.txt');
  assert.equal(f.read(), 'stash version\n'); assert.equal(git(f.repo, 'diff', '--cached'), '');
});
test('each reworded commit retains its own requested message', async t => {
  const f = fixture(t); const { executeInteractiveRebase } = require('../src/main/git/conflicts-rebase.ts');
  fs.writeFileSync(path.join(f.repo, 'one'), 'one'); const one = f.commit();
  fs.writeFileSync(path.join(f.repo, 'two'), 'two'); const two = f.commit();
  const result = await executeInteractiveRebase(f.repo, f.initial, [
    { hash: one, action: 'reword', message: 'new one' }, { hash: two, action: 'reword', message: 'new two' }
  ]);
  assert.equal(result.ok, true, result.error);
  assert.equal(git(f.repo, 'log', '-2', '--format=%s'), 'new two\nnew one');
});
test('root details are independent of current worktree and later commits', async t => {
  const f = fixture(t); const { getCommitDetail } = require('../src/main/git/commit-detail.ts');
  fs.writeFileSync(f.file, 'later\n'); f.commit(); fs.writeFileSync(f.file, 'dirty\n');
  const detail = await getCommitDetail(f.repo, f.initial);
  assert.equal(detail.files.length, 1); assert.equal(detail.files[0].status, 'added');
  assert.equal(detail.insertions, 35); assert.equal(detail.deletions, 0);
});
test('single commit and stash views preserve renamed paths and file diffs', async t => {
  const f = fixture(t); const renamed = process.platform === 'win32' ? '日本 [new].txt' : '日本\tnew.txt';
  const { getCommitDetail } = require('../src/main/git/commit-detail.ts');
  const { getStashDetail, getStashFileDiff } = require('../src/main/git/branch-stash.ts');
  git(f.repo, 'mv', 'file.txt', renamed); fs.writeFileSync(path.join(f.repo, renamed), f.content.replace('line 3\n', 'changed\n'));
  git(f.repo, 'stash', 'push');
  const stash = await getStashDetail(f.repo, 0); assert.equal(stash.files[0].path, renamed); assert.equal(stash.files[0].status, 'renamed');
  assert.equal((await getStashFileDiff(f.repo, 0, renamed)).hunks.length, 1);
  git(f.repo, 'stash', 'pop'); const hash = f.commit();
  const detail = await getCommitDetail(f.repo, hash); assert.equal(detail.files[0].path, renamed); assert.equal(detail.files[0].status, 'renamed');
  assert.equal((await getFileDiff(f.repo, hash, renamed)).hunks.length, 1);
});
test('renderer ignores stale diff, stash, refresh responses and clears repository-specific state', async t => {
  const Module = require('node:module'); const originalLoad = Module._load;
  const pending = {};
  let phase = 'old';
  const api = {
    getFileDiff: (_hash, file) => new Promise(resolve => { pending[file] = resolve; }),
    getStashDetail: index => new Promise(resolve => { pending[`stash${index}`] = resolve; }),
    getStatus: () => new Promise(resolve => { pending[`status-${phase}`] = resolve; }),
    getLog: async () => ({ commits: [], hasMore: false }), getBranches: async () => ({ local: [], remote: [] }),
    getStashes: async () => [], getRepoOperationState: async () => null, getTags: async () => [],
    getRemotes: async () => [], getSubmodules: async () => [], getWorktrees: async () => [], setActiveRepo: () => {}
  };
  Module._load = function(name, ...args) { return name === '../lib/api' ? { api, unwrap: p => p } : originalLoad.call(this, name, ...args); };
  let useApp;
  try { ({ useApp } = require('../src/renderer/store/index.ts')); } finally { Module._load = originalLoad; }
  const state = () => useApp.getState();
  useApp.setState({ activeTab: '/old', tabs: [{ path: '/old' }, { path: '/new' }] });
  const a = state().openFileDiff({ commitHash: null, filePath: 'A' });
  const b = state().openFileDiff({ commitHash: null, filePath: 'B' });
  pending.B({ path: 'B', hunks: [] }); await b; pending.A({ path: 'A', hunks: [] }); await a;
  assert.equal(state().fileDiff.path, 'B');
  const c = state().openFileDiff({ commitHash: null, filePath: 'C' }); state().closeDiff(); pending.C({ path: 'C' }); await c;
  assert.equal(state().fileDiff, null);
  const stash0 = state().inspectStash(0); const stash1 = state().inspectStash(1);
  pending.stash1({ index: 1 }); await stash1; pending.stash0({ index: 0 }); await stash0; assert.equal(state().stashDetail.index, 1);
  const oldRefresh = state().refresh();
  phase = 'new'; state().setActiveTab('/new'); pending['status-new']({ currentBranch: 'new' });
  await new Promise(resolve => setImmediate(resolve)); pending['status-old']({ currentBranch: 'old' }); await oldRefresh;
  assert.equal(state().status.currentBranch, 'new'); assert.equal(state().stashDetail, null); assert.equal(state().selectedStashIndex, null);
  state().closeTab('/old'); assert.equal(state().status.currentBranch, 'new');
});
test('move commit down swaps with its older neighbor', async t => {
  const f = fixture(t); const { moveCommitDown } = require('../src/main/git/history.ts');
  fs.writeFileSync(path.join(f.repo, 'one'), 'one'); const one = f.commit(); git(f.repo, 'commit', '--amend', '-m', 'one');
  fs.writeFileSync(path.join(f.repo, 'two'), 'two'); const two = f.commit(); git(f.repo, 'commit', '--amend', '-m', 'two');
  await moveCommitDown(f.repo, git(f.repo, 'rev-parse', 'HEAD'));
  assert.equal(git(f.repo, 'log', '-2', '--format=%s'), 'one\ntwo');
  await assert.rejects(moveCommitDown(f.repo, f.initial), /root commit/);
});
test('reword messages survive a paused rebase and are cleaned up on completion', async t => {
  const f = fixture(t); const { executeInteractiveRebase, continueOperation, getRepoOperationState } = require('../src/main/git/conflicts-rebase.ts');
  fs.writeFileSync(path.join(f.repo, 'one'), 'one'); const one = f.commit();
  fs.writeFileSync(path.join(f.repo, 'two'), 'two'); const two = f.commit();
  const result = await executeInteractiveRebase(f.repo, f.initial, [
    { hash: one, action: 'edit', message: 'fixture' }, { hash: two, action: 'reword', message: 'second message\n\nBody retained' }
  ]);
  assert.equal(result.ok, true, result.error); assert.equal((await getRepoOperationState(f.repo)).inRebase, true);
  assert.equal(fs.existsSync(path.join(f.repo, '.git/git-workbench-rebase-editor/message.cjs')), true);
  await continueOperation(f.repo);
  assert.equal(git(f.repo, 'log', '-1', '--format=%B'), 'second message\n\nBody retained');
  assert.equal(fs.existsSync(path.join(f.repo, '.git/git-workbench-rebase-editor')), false);
});
test('reword after resolving a conflict uses the correct custom message', async t => {
  const f = fixture(t, 'base\n'); const { executeInteractiveRebase, continueOperation, resolveConflictFile } = require('../src/main/git/conflicts-rebase.ts');
  fs.writeFileSync(f.file, 'one\n'); const one = f.commit(); fs.writeFileSync(f.file, 'two\n'); const two = f.commit();
  const result = await executeInteractiveRebase(f.repo, f.initial, [
    { hash: two, action: 'reword', message: 'resolved second' }, { hash: one, action: 'drop', message: 'fixture' }
  ]);
  assert.equal(result.hasConflicts, true);
  await resolveConflictFile(f.repo, 'file.txt', 'two\n'); await continueOperation(f.repo);
  assert.equal(git(f.repo, 'log', '-1', '--format=%s'), 'resolved second'); assert.equal(f.read(), 'two\n');
});
test('conflicted Unicode paths are returned as actual file names', async t => {
  const f = fixture(t); const name = process.platform === 'win32' ? '日本 [file].txt' : '日本\tfile.txt'; const { getRepoOperationState } = require('../src/main/git/conflicts-rebase.ts');
  fs.writeFileSync(path.join(f.repo, name), 'base\n'); f.commit(); git(f.repo, 'checkout', '-b', 'side');
  fs.writeFileSync(path.join(f.repo, name), 'side\n'); f.commit(); git(f.repo, 'checkout', 'main');
  fs.writeFileSync(path.join(f.repo, name), 'main\n'); f.commit(); try { git(f.repo, 'merge', 'side'); } catch {}
  assert.deepEqual((await getRepoOperationState(f.repo)).conflictedFiles, [name]); git(f.repo, 'merge', '--abort');
});
test('revert committed hunk changes only its worktree lines', async t => {
  const f = fixture(t); const { getCommitDiffText } = require('../src/main/git/commit-detail.ts');
  const { revertHunk } = require('../src/main/git/branch-stash.ts');
  fs.writeFileSync(f.file, f.content.replace('line 2\n', 'changed 2\n').replace('line 30\n', 'changed 30\n')); const hash = f.commit();
  await revertHunk(f.repo, await getCommitDiffText(f.repo, hash, 'file.txt'), 0);
  assert.equal(f.read(), f.content.replace('line 30\n', 'changed 30\n')); assert.equal(git(f.repo, 'diff', '--cached'), '');
});
test('unstaging before the first commit preserves all working files', async t => {
  const f = fixture(t); const { unstageFiles } = require('../src/main/git/status-diff.ts');
  git(f.repo, 'checkout', '--orphan', 'unborn'); fs.writeFileSync(f.file, 'new content\n'); git(f.repo, 'add', '.');
  await unstageFiles(f.repo); assert.equal(git(f.repo, 'ls-files'), ''); assert.equal(f.read(), 'new content\n');
});
test('discarding an untracked file leaves neighboring files intact', async t => {
  const f = fixture(t); const { discardFile } = require('../src/main/git/status-diff.ts');
  fs.writeFileSync(path.join(f.repo, 'untracked'), 'remove'); fs.writeFileSync(path.join(f.repo, 'keep'), 'keep');
  await discardFile(f.repo, 'untracked');
  assert.equal(fs.existsSync(path.join(f.repo, 'untracked')), false); assert.equal(fs.readFileSync(path.join(f.repo, 'keep'), 'utf8'), 'keep');
});
test('filenames containing an arrow are not treated as renames', async t => {
  const f = fixture(t); const { getStatus } = require('../src/main/git/status-diff.ts');
  // Win32 cannot create names containing >. The exact ASCII-arrow parser case
  // is also covered at the Git status boundary on every operating system.
  const name = process.platform === 'win32' ? 'from → to.txt' : 'from -> to.txt'; fs.writeFileSync(path.join(f.repo, name), 'new');
  assert.equal((await getStatus(f.repo)).unstaged[0].path, name);
});
test('zero-context Git configuration cannot break partial staging', async t => {
  const f = fixture(t); git(f.repo, 'config', 'diff.context', '0');
  fs.writeFileSync(f.file, f.content.replace('line 2\n', 'extra\nline 2\n'));
  await stageLines(f.repo, 'file.txt', 0, await changedIndices(f.repo));
  assert.equal(git(f.repo, 'diff'), '');
});
test('discard treats wildcard characters in a filename literally', async t => {
  const f = fixture(t); const { discardFile } = require('../src/main/git/status-diff.ts');
  // Brackets are Git glob metacharacters that are valid Windows filenames.
  const name = process.platform === 'win32' ? '[ab].txt' : '*.txt';
  fs.writeFileSync(path.join(f.repo, name), 'remove');
  for (const file of ['a.txt', 'b.txt', 'keep.txt']) fs.writeFileSync(path.join(f.repo, file), 'keep');
  await discardFile(f.repo, name);
  assert.equal(fs.existsSync(path.join(f.repo, name)), false);
  for (const file of ['a.txt', 'b.txt', 'keep.txt']) assert.equal(fs.readFileSync(path.join(f.repo, file), 'utf8'), 'keep');
  assert.equal(f.read(), f.content);
});
