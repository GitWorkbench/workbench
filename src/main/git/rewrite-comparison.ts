import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gitFor } from './core';
import { gitWithEnvironment } from './advanced-process';
import type { RewriteSession, RangeComparison, RangeComparisonInput } from '../../shared/types';

const exec = promisify(execFile);
const validId = /^[a-f0-9-]{36}$/;
const refRoot = (id: string) => {
  if (!validId.test(id)) throw new Error('Invalid rewrite record.');
  return `refs/git-workbench/rewrites/${id}`;
};
export const rewriteActions = new Set(['git:rebase-branch', 'git:execute-interactive-rebase', 'git:edit-commit-message', 'git:drop-commit', 'git:move-commit-down', 'git:pull']);
const resolve = async (repo: string, ref: string) => {
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 4096) throw new Error('Enter a valid commit revision.');
  return (await gitFor(repo).raw(['rev-parse', '--verify', '--end-of-options', `${ref.trim()}^{commit}`])).trim();
};
async function folder(repo: string) {
  return path.join((await gitFor(repo).raw(['rev-parse', '--absolute-git-dir'])).trim(), 'git-workbench-rewrites');
}
async function activeRebase(repo: string) {
  const dir = (await gitFor(repo).raw(['rev-parse', '--absolute-git-dir'])).trim();
  for (const name of ['rebase-merge', 'rebase-apply']) if (await fs.stat(path.join(dir, name)).then(() => true, () => false)) return path.join(dir, name);
  return null;
}
async function store(repo: string, s: RewriteSession) {
  refRoot(s.id);
  const directory = await folder(repo);
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${s.id}.json`), temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(s, null, 2), { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
async function records(repo: string): Promise<RewriteSession[]> {
  const directory = await folder(repo), worktree = await fs.realpath(repo);
  const files = (await fs.readdir(directory).catch(() => [])).filter(n => validId.test(n.replace(/\.json$/, '')) && n.endsWith('.json'));
  const values = await Promise.all(files.map(async file => {
    try { const s = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as RewriteSession; return s.worktree === worktree && validId.test(s.id) ? s : null; } catch { return null; }
  }));
  return values.filter((s): s is RewriteSession => !!s).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function emptyBase(repo: string) {
  const directory = await folder(repo);
  await fs.mkdir(directory, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(directory, 'baseline-'));
  const git = gitWithEnvironment(repo, { GIT_INDEX_FILE: path.join(temporary, 'index'), GIT_AUTHOR_NAME: 'Git Workbench', GIT_AUTHOR_EMAIL: 'comparison@git-workbench.local', GIT_COMMITTER_NAME: 'Git Workbench', GIT_COMMITTER_EMAIL: 'comparison@git-workbench.local' });
  try {
    await git.raw(['read-tree', '--empty']);
    const tree = (await git.raw(['write-tree'])).trim();
    return (await git.raw(['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-m', 'Empty baseline for comparing root rewrites'])).trim();
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

export async function beginRewrite(repo: string, action: string, args: unknown[]): Promise<RewriteSession | null> {
  if (!rewriteActions.has(action) || await activeRebase(repo)) return null;
  await finishRewrite(repo);
  const git = gitFor(repo), branch = (await git.raw(['branch', '--show-current'])).trim();
  let source = String(args[0] || ''), newBaseRef: string | undefined;
  if (action === 'git:pull') {
    const branchPreference = branch ? (await git.raw(['config', '--get', `branch.${branch}.rebase`]).catch(() => '')).trim() : '';
    const preference = branchPreference || (await git.raw(['config', '--get', 'pull.rebase']).catch(() => '')).trim();
    if (!['true', '1', 'yes', 'on', 'merges', 'preserve', 'interactive'].includes(preference.toLowerCase())) return null;
    source = (await git.raw(['rev-parse', '--symbolic-full-name', '@{upstream}']).catch(() => '')).trim();
    if (!source) return null;
    newBaseRef = source;
  }
  const oldTip = await resolve(repo, 'HEAD');
  let oldBase: string, newBase: string;
  if (action === 'git:rebase-branch' || action === 'git:pull') {
    newBase = await resolve(repo, source);
    oldBase = (await git.raw(['merge-base', oldTip, newBase])).trim();
  } else if (action === 'git:execute-interactive-rebase') {
    oldBase = await resolve(repo, source); newBase = oldBase;
  } else {
    const target = await resolve(repo, source);
    oldBase = await resolve(repo, `${target}${action === 'git:move-commit-down' ? '^^' : '^'}`).catch(() => emptyBase(repo));
    newBase = oldBase;
  }
  const session: RewriteSession = { id: randomUUID(), worktree: await fs.realpath(repo), branch: branch || '(detached HEAD)',
    operation: action.replace('git:', ''), createdAt: new Date().toISOString(), status: 'running', oldBase, oldTip, newBase, newBaseRef };
  const root = refRoot(session.id);
  for (const [name, hash] of [['old-base', oldBase], ['old-tip', oldTip], ['new-base', newBase]]) await git.raw(['update-ref', `${root}/${name}`, hash, '']);
  await store(repo, session);
  return session;
}

export async function finishRewrite(repo: string, options?: { aborted?: boolean; error?: string }): Promise<RewriteSession | null> {
  const session = (await records(repo)).find(s => s.status === 'running' || s.status === 'paused');
  if (!session) return null;
  const rebase = await activeRebase(repo), git = gitFor(repo);
  if (rebase) {
    session.status = 'paused';
    const onto = (await fs.readFile(path.join(rebase, 'onto'), 'utf8').catch(() => '')).trim();
    if (/^[a-f0-9]{40,64}$/.test(onto)) session.newBase = await resolve(repo, onto);
  } else {
    session.status = !options ? 'ended' : options.aborted ? 'aborted' : options.error ? 'failed' : 'completed';
    session.newTip = await resolve(repo, session.branch === '(detached HEAD)' ? 'HEAD' : `refs/heads/${session.branch}`);
    if (session.newBaseRef) session.newBase = await resolve(repo, session.newBaseRef).catch(() => session.newBase);
    session.finishedAt = new Date().toISOString();
  }
  session.error = options?.error?.slice(0, 2000);
  await git.raw(['update-ref', `${refRoot(session.id)}/new-base`, session.newBase]);
  if (session.newTip) await git.raw(['update-ref', `${refRoot(session.id)}/new-tip`, session.newTip]);
  await store(repo, session);
  return session;
}

export async function listRewriteSessions(repo: string) {
  await finishRewrite(repo); // Reconcile a rebase continued/aborted outside this app.
  return records(repo);
}

export async function recordCompletedRewrite(repo: string, input: { operation: string; branch: string; oldBase?: string; newBase?: string; oldTip: string; newTip: string }) {
  const oldBase = input.oldBase || await emptyBase(repo);
  const session: RewriteSession = { ...input, id: randomUUID(), worktree: await fs.realpath(repo), oldBase, newBase: input.newBase || oldBase, createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: 'completed' };
  const git = gitFor(repo), root = refRoot(session.id);
  for (const [key, hash] of [['old-base', session.oldBase], ['old-tip', session.oldTip], ['new-base', session.newBase], ['new-tip', session.newTip!]]) await git.raw(['update-ref', `${root}/${key}`, hash, '']);
  await store(repo, session);
  return session.id;
}

export async function deleteRewriteSession(repo: string, id: string) {
  refRoot(id);
  const session = (await records(repo)).find(s => s.id === id);
  if (!session) throw new Error('Rewrite record not found for this worktree.');
  if (session.status === 'running' || session.status === 'paused') throw new Error('Finish or abort this rebase before deleting its record.');
  for (const name of ['old-base', 'old-tip', 'new-base', 'new-tip']) await gitFor(repo).raw(['update-ref', '-d', `${refRoot(id)}/${name}`]);
  await fs.unlink(path.join(await folder(repo), `${id}.json`));
}

export async function compareCommitRanges(repo: string, input: RangeComparisonInput): Promise<RangeComparison> {
  const [oldBase, oldTip, newBase, newTip] = await Promise.all([input.oldBase, input.oldTip, input.newBase, input.newTip].map(ref => resolve(repo, ref)));
  const oldRange = `${oldBase}..${oldTip}`, newRange = `${newBase}..${newTip}`;
  const [before, after] = await Promise.all([oldRange, newRange].map(range => gitFor(repo).raw(['rev-list', '--max-count=501', '--no-merges', range]).then(out => out.trim().split('\n').filter(Boolean))));
  if (before.length > 500 || after.length > 500) throw new Error('Compare at most 500 non-merge commits per range. Choose a closer base.');
  let raw: string;
  try {
    raw = (await exec('git', ['-c', 'color.ui=false', 'range-diff', '--no-color', '--no-dual-color', '--no-ext-diff', '--no-textconv', '--no-notes', '--abbrev=12', oldRange, newRange], { cwd: repo, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })).stdout;
  } catch (error) { throw new Error(`Could not compute range-diff. Git 2.19+ is required; large comparisons may need a smaller range. ${error instanceof Error ? error.message.split('\n')[0] : ''}`); }
  const entries: RangeComparison['entries'] = [];
  const fullHash = (hash: string, values: string[]) => { const found = values.filter(h => h.startsWith(hash)); return found.length === 1 ? found[0] : undefined; };
  for (const line of raw.split('\n')) {
    const match = /^\s*(\d+|-):\s+([a-f0-9]+|-+)\s+([=!<>])\s+(\d+|-):\s+([a-f0-9]+|-+)\s*(.*)$/.exec(line);
    if (match) entries.push({ before: match[1] === '-' ? null : Number(match[1]), oldHash: fullHash(match[2], before), kind: match[3] === '=' ? 'unchanged' : match[3] === '!' ? 'changed' : match[3] === '<' ? 'removed' : 'added', after: match[4] === '-' ? null : Number(match[4]), newHash: fullHash(match[5], after), subject: match[6], patch: '' });
    else if (entries.length) entries[entries.length - 1].patch += `${line}\n`;
  }
  return { oldBase, oldTip, newBase, newTip, entries, raw, beforeCount: before.length, afterCount: after.length,
    warning: 'Git pairs similar patches heuristically. Merge commits are excluded. A large rewrite or squash can appear as removed and added commits; inspect the patch details.' };
}
