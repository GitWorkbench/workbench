import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SparseCheckoutState, SparseLayoutSummary, SparseSelection, SparsePreview } from '../../shared/types';
import { gitCommand, resolveCommit } from './advanced-process';
import { getRepoOperationState } from './conflicts-rebase';
import { createRestorePoint } from './restore-points';

type Backup = SparseLayoutSummary & { worktree: string; rawPatterns: string };
const gitDir = async (repo: string) => (await gitCommand(repo, ['rev-parse', '--absolute-git-dir'])).trim();
const folder = async (repo: string) => path.join(await gitDir(repo), 'git-workbench-sparse-layouts');
const validId = (id: string) => { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid saved layout.'); return id; };
const validDirectory = (directory: string) => {
  if (typeof directory !== 'string' || !directory || directory.length > 4096 || /[\x00-\x1f\x7f\\]/.test(directory) || directory.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')) throw new Error('Choose repository directories without control characters or backslashes.');
  return directory;
};
function unquoteGitPath(value: string): string {
  if (!value.startsWith('"')) return value;
  const chunks: Buffer[] = [], text = value.slice(1, -1);
  let cursor = 0;
  for (const match of text.matchAll(/\\([0-7]{1,3}|[abfnrtv"\\])/g)) {
    chunks.push(Buffer.from(text.slice(cursor, match.index)));
    const escaped = match[1], replacements: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, '\\': 92 };
    chunks.push(Buffer.from([/^[0-7]/.test(escaped) ? parseInt(escaped, 8) : replacements[escaped]])); cursor = match.index! + match[0].length;
  }
  chunks.push(Buffer.from(text.slice(cursor))); return Buffer.concat(chunks).toString('utf8');
}
async function backups(repo: string): Promise<Backup[]> {
  const directory = await folder(repo), worktree = await fs.realpath(repo);
  const names = (await fs.readdir(directory).catch(() => [])).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
  const records = await Promise.all(names.map(async name => { try { const b: Backup = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')); return b.worktree === worktree ? b : null; } catch { return null; } }));
  return records.filter((b): b is Backup => !!b).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function indexFiles(repo: string) { return (await gitCommand(repo, ['ls-files', '-t', '-z'])).split('\0').filter(Boolean).map(line => ({ file: line.slice(2), present: line[0] !== 'S' })); }

export async function getSparseCheckout(repo: string): Promise<SparseCheckoutState> {
  const version = (await gitCommand(repo, ['--version'])).trim(), match = /(?:version )?(\d+)\.(\d+)/.exec(version);
  const supported = !!match && (Number(match[1]) > 2 || Number(match[1]) === 2 && Number(match[2]) >= 37);
  const enabled = (await gitCommand(repo, ['config', '--bool', '--get', 'core.sparseCheckout']).catch(() => '')).trim() === 'true';
  const cone = (await gitCommand(repo, ['config', '--bool', '--get', 'core.sparseCheckoutCone']).catch(() => '')).trim() === 'true';
  const ignoreCase = (await gitCommand(repo, ['config', '--bool', '--get', 'core.ignoreCase']).catch(() => '')).trim() === 'true';
  const patternFile = path.resolve(repo, (await gitCommand(repo, ['rev-parse', '--git-path', 'info/sparse-checkout'])).trim());
  const info = await fs.stat(patternFile).catch(() => null);
  if (info && info.size > 1_000_000) throw new Error('Sparse rules exceed 1 MB. Manage this layout with Git directly.');
  const rawPatterns = await fs.readFile(patternFile, 'utf8').catch(() => '');
  let directories: string[] = [], warning: string | undefined;
  if (enabled && cone) try { directories = (await gitCommand(repo, ['-c', 'core.quotePath=false', 'sparse-checkout', 'list'])).split('\n').filter(Boolean).map(unquoteGitPath); }
  catch { warning = 'Git could not list the current cone folders. Restore a saved layout or preview the full checkout before choosing new folders.'; }
  const head = await resolveCommit(repo, 'HEAD').catch(() => ''), worktree = await fs.realpath(repo);
  const index = await indexFiles(repo);
  const fingerprint = createHash('sha256').update(JSON.stringify({ worktree, head, enabled, cone, ignoreCase, rawPatterns, index })).digest('hex');
  return { repo: worktree, version, supported, head, fingerprint, enabled, cone, ignoreCase, directories, rawPatterns, warning, backups: (await backups(repo)).slice(0, 50).map(({ id, createdAt, head, enabled, cone, directories }) => ({ id, createdAt, head, enabled, cone, directories })) };
}

export async function getSparseDirectories(repo: string, prefix: string, head: string): Promise<string[]> {
  if (prefix) validDirectory(prefix);
  if (await resolveCommit(repo, 'HEAD') !== head) throw new Error('HEAD changed. Refresh the folder picker.');
  const tree = prefix ? `${head}:${prefix}` : head;
  const rows = (await gitCommand(repo, ['ls-tree', '-z', tree])).split('\0').filter(Boolean);
  return rows.filter(r => r.startsWith('040000 tree ')).map(r => (prefix ? prefix + '/' : '') + r.slice(r.indexOf('\t') + 1));
}

async function cleanCheckout(repo: string) {
  const op = await getRepoOperationState(repo);
  if (op.inMerge || op.inRebase || op.inCherryPick || op.conflictedFiles.length) throw new Error('Finish the active Git operation before changing sparse checkout.');
  if ((await gitCommand(repo, ['status', '--porcelain=v1', '--untracked-files=all'])).trim()) throw new Error('Commit or stash all changes and untracked files before changing the checkout layout.');
}
const parentOf = (file: string) => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
function included(file: string, directories: string[], disable: boolean, ignoreCase = false) {
  if (disable) return true;
  if (ignoreCase) { file = file.toLowerCase(); directories = directories.map(d => d.toLowerCase()); }
  const parent = parentOf(file);
  return !parent || directories.some(d => file.startsWith(d + '/') || parent === d || d.startsWith(parent + '/'));
}
async function collisionBlockers(repo: string, removed: string[], added: string[], keepFile?: (file: string) => boolean): Promise<string[]> {
  const blockers: string[] = [], prunedParents = new Set<string>();
  for (const file of removed) { let parent = parentOf(file); while (parent) { prunedParents.add(parent); parent = parentOf(parent); } }
  const ignored = (await gitCommand(repo, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  for (const file of ignored) {
    if (keepFile?.(file)) continue;
    let parent = parentOf(file), endangered = false;
    while (parent) { if (prunedParents.has(parent)) { endangered = true; break; } parent = parentOf(parent); }
    if (endangered && blockers.length < 20) blockers.push(`Move ignored file out of a directory that may be pruned: ${file}`);
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(16, added.length) }, async () => {
    while (cursor < added.length) {
      const file = added[cursor++];
      if (await fs.lstat(path.join(repo, file)).then(() => true, () => false)) { if (blockers.length < 20) blockers.push(`A file already exists outside the current layout and would be written: ${file}`); }
    }
  }));
  return blockers;
}

export async function previewSparseCheckout(repo: string, input: SparseSelection): Promise<SparsePreview> {
  const state = await getSparseCheckout(repo);
  if (!state.supported) throw new Error('The folder editor requires Git 2.37 or newer.');
  if (!state.head || state.head !== input.head || state.fingerprint !== input.fingerprint) throw new Error('The revision, index or sparse rules changed. Refresh and preview again.');
  await cleanCheckout(repo);
  if (!input.disable && state.warning) throw new Error(state.warning);
  if (!input.disable && state.enabled && !state.cone) throw new Error('This worktree uses non-cone patterns. Restore the full checkout first; the original rules will be saved.');
  if (!Array.isArray(input.directories) || input.directories.length > 1000) throw new Error('Choose up to 1,000 directories.');
  const directories = input.disable ? [] : [...new Set(input.directories.map(validDirectory))].sort();
  for (const directory of directories) if ((await gitCommand(repo, ['cat-file', '-t', `${state.head}:${directory}`])).trim() !== 'tree') throw new Error(`Not a directory in this revision: ${directory}`);
  const keepFile = (file: string) => included(file, directories, input.disable, state.ignoreCase);
  const files = await indexFiles(repo), removed = files.filter(f => f.present && !keepFile(f.file)).map(f => f.file), added = files.filter(f => !f.present && keepFile(f.file)).map(f => f.file);
  const keep = files.filter(f => keepFile(f.file)).length;
  const blockers = await collisionBlockers(repo, removed, added, keepFile);
  return { ...input, directories, total: files.length, included: keep, excluded: files.length - keep, removed: removed.length, added: added.length, removedExamples: removed.slice(0, 100), addedExamples: added.slice(0, 100), blockers };
}

async function saveLayout(repo: string, state: SparseCheckoutState) {
  const id = randomUUID(), directory = await folder(repo);
  const backup: Backup = { id, worktree: state.repo, createdAt: new Date().toISOString(), head: state.head, enabled: state.enabled, cone: state.cone, directories: state.directories, rawPatterns: state.rawPatterns };
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(backup, null, 2), { flag: 'wx' });
  return id;
}
async function executeLayout(repo: string, state: SparseCheckoutState, target: { enabled: boolean; cone: boolean; directories: string[]; rawPatterns: string }, restoring = false) {
  const id = await saveLayout(repo, state);
  await createRestorePoint(repo, 'Before changing sparse checkout layout');
  const current = await getSparseCheckout(repo);
  if (current.fingerprint !== state.fingerprint) throw new Error('The checkout changed while saving its restore point. Preview again.');
  try {
    const args = ['sparse-checkout', ...(target.enabled ? ['set', target.cone ? '--cone' : '--no-cone', '--no-sparse-index', ...(restoring && target.cone ? ['--skip-checks'] : []), '--stdin'] : ['disable'])];
    await gitCommand(repo, ['-c', 'submodule.recurse=false', ...args], target.enabled ? target.cone ? target.directories.map(d => JSON.stringify(d)).join('\n') + (target.directories.length ? '\n' : '') : target.rawPatterns : undefined, { GIT_LFS_SKIP_SMUDGE: '1' }, 120_000);
  } catch (e) { throw new Error(`Sparse checkout did not finish. The previous layout is saved as ${id}; refresh and restore it if needed. ${String(e)}`); }
  return getSparseCheckout(repo);
}
export async function applySparseCheckout(repo: string, input: SparseSelection) {
  const preview = await previewSparseCheckout(repo, input);
  if (preview.blockers.length) throw new Error(preview.blockers.join('\n'));
  const state = await getSparseCheckout(repo);
  if (state.fingerprint !== input.fingerprint) throw new Error('Checkout changed. Preview again.');
  return executeLayout(repo, state, { enabled: !input.disable, cone: true, directories: preview.directories, rawPatterns: '' });
}

export async function restoreSparseLayout(repo: string, id: string, head: string, fingerprint: string) {
  const backup: Backup = JSON.parse(await fs.readFile(path.join(await folder(repo), `${validId(id)}.json`), 'utf8'));
  const state = await getSparseCheckout(repo);
  if (backup.worktree !== state.repo || state.head !== head || state.fingerprint !== fingerprint) throw new Error('Checkout changed. Refresh before restoring a layout.');
  await cleanCheckout(repo);
  if (backup.enabled && !backup.cone) {
    // Arbitrary old glob rules cannot be modeled by the folder picker. Reject any local ignored data.
    if ((await gitCommand(repo, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).length) throw new Error('Move ignored files aside before restoring non-cone rules, or restore those rules with Git directly.');
    const outside = (await indexFiles(repo)).filter(f => !f.present).map(f => f.file);
    const blockers = await collisionBlockers(repo, [], outside);
    if (blockers.length) throw new Error(blockers.join('\n'));
  } else {
    // Old folder names may no longer exist in this HEAD; keep the saved rules for future checkouts.
    const keepFile = (file: string) => included(file, backup.directories, !backup.enabled, state.ignoreCase);
    const files = await indexFiles(repo), removed = files.filter(f => f.present && !keepFile(f.file)).map(f => f.file), added = files.filter(f => !f.present && keepFile(f.file)).map(f => f.file);
    const blockers = await collisionBlockers(repo, removed, added, keepFile);
    if (blockers.length) throw new Error(blockers.join('\n'));
  }
  return executeLayout(repo, state, backup, true);
}
