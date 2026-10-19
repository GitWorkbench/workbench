import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CommitSplitPlan, CommitSplitInput, CommitSplitPreview } from '../../shared/types';
import { gitCommand, resolveCommit, cleanBranch } from './advanced-process';
import { createRestorePoint } from './restore-points';
import { recordCompletedRewrite } from './rewrite-comparison';

const gitDir = async (repo: string) => (await gitCommand(repo, ['rev-parse', '--absolute-git-dir'])).trim();
const validId = (id: string) => { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid split preview.'); return id; };
const refFor = (id: string) => `refs/git-workbench/splits/${validId(id)}`;
type Saved = CommitSplitPreview & { source: string; parent: string; worktree: string; createdAt: string };

export async function getCommitSplit(repo: string, revision: string): Promise<CommitSplitPlan> {
  const { head, branch } = await cleanBranch(repo), hash = await resolveCommit(repo, revision);
  await gitCommand(repo, ['merge-base', '--is-ancestor', hash, head]);
  const parents = (await gitCommand(repo, ['show', '-s', '--format=%P', hash])).trim().split(' ').filter(Boolean);
  if (parents.length > 1) throw new Error('Select a non-merge commit to split.');
  const descendants = (await gitCommand(repo, ['rev-list', '--reverse', '--max-count=201', `${hash}..${head}`])).trim().split('\n').filter(Boolean);
  if (descendants.length > 200 || (await gitCommand(repo, ['rev-list', '--min-parents=2', `${hash}..${head}`])).trim()) throw new Error('Splitting supports a linear history of up to 200 later commits. Select a closer commit without later merges.');
  const parent = parents[0] || '';
  const base = parent || (await gitCommand(repo, ['hash-object', '-w', '-t', 'tree', '--stdin'], '')).trim();
  const files = (await gitCommand(repo, ['diff', '--no-renames', '--name-only', '-z', base, hash, '--'])).split('\0').filter(Boolean);
  const units: CommitSplitPlan['units'] = [];
  let total = 0;
  for (const file of files) {
    const patch = await gitCommand(repo, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', '--binary', '--full-index', '--unified=3', base, hash, '--', `:(literal)${file}`]);
    total += patch.length;
    if (total > 8_000_000) throw new Error('This commit is too large for visual splitting (8 MB / 1,000 pieces).');
    const [header, ...parts] = patch.split(/(?=^@@ )/m);
    const whole = !parts.length || /^(new file|deleted file|old mode|new mode) /m.test(header) || /160000/.test(header);
    if (whole) units.push({ id: `${units.length}`, file, label: 'Whole file (binary, add/delete, or mode change)', patch });
    else for (const hunk of parts) units.push({ id: `${units.length}`, file, label: hunk.split('\n')[0], patch: header + hunk });
    if (units.length > 1000) throw new Error('This commit is too large for visual splitting (8 MB / 1,000 pieces).');
  }
  if (units.length < 2) throw new Error('This commit has fewer than two independent files or hunks to split.');
  return { hash, head, branch, parent, units, message: (await gitCommand(repo, ['show', '-s', '--format=%B', hash])).trimEnd(), descendantCount: descendants.length };
}

async function metadata(repo: string, hash: string) {
  const [name, email, date, ...message] = (await gitCommand(repo, ['show', '-s', '--format=%an%x00%ae%x00%aI%x00%B', hash])).split('\0');
  return { env: { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date }, message: message.join('\0').trimEnd() };
}

export async function previewCommitSplit(repo: string, input: CommitSplitInput): Promise<CommitSplitPreview> {
  const plan = await getCommitSplit(repo, input.hash);
  if (plan.head !== input.head) throw new Error('HEAD changed. Reload the commit before preparing a split.');
  if (!Array.isArray(input.groups) || input.groups.length < 2 || input.groups.length > 20) throw new Error('Create between 2 and 20 commits.');
  const assigned = input.groups.flatMap(g => g.units);
  if (assigned.length !== plan.units.length || new Set(assigned).size !== assigned.length || assigned.some(id => !plan.units.some(u => u.id === id))) throw new Error('Assign every change to exactly one commit.');
  if (input.groups.some(g => !g.message?.trim() || g.message.length > 10000 || !g.units.length)) throw new Error('Each commit needs a message and at least one change.');
  const id = randomUUID(), directory = path.join(await gitDir(repo), 'git-workbench-splits');
  await fs.mkdir(directory, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(directory, 'index-'));
  const env = { GIT_INDEX_FILE: path.join(temporary, 'index'), ...(await metadata(repo, plan.hash)).env };
  let tip = plan.parent;
  const commits: CommitSplitPreview['commits'] = [];
  try {
    await gitCommand(repo, plan.parent ? ['read-tree', plan.parent] : ['read-tree', '--empty'], undefined, env);
    let lastTree = (await gitCommand(repo, ['write-tree'], undefined, env)).trim();
    for (const group of input.groups) {
      // Apply in original diff order, combining hunks for the same file into one patch.
      const byFile = new Map<string, string>();
      for (const unit of plan.units.filter(u => group.units.includes(u.id))) {
        if (byFile.has(unit.file)) byFile.set(unit.file, byFile.get(unit.file)! + unit.patch.slice(unit.patch.indexOf('@@ ')));
        else byFile.set(unit.file, unit.patch);
      }
      await gitCommand(repo, ['apply', '--cached', '--whitespace=nowarn', '-'], [...byFile.values()].join(''), env);
      const tree = (await gitCommand(repo, ['write-tree'], undefined, env)).trim();
      if (tree === lastTree) throw new Error('A split commit would be empty. Adjust the assignments.');
      tip = (await gitCommand(repo, ['-c', 'commit.gpgsign=false', 'commit-tree', tree, ...(tip ? ['-p', tip] : []), '-m', group.message.trim()], undefined, env)).trim();
      commits.push({ hash: tip, message: group.message.trim(), files: [...byFile.keys()] }); lastTree = tree;
    }
    if (lastTree !== (await gitCommand(repo, ['rev-parse', `${plan.hash}^{tree}`])).trim()) throw new Error('The split did not reproduce the original tree. No branch was changed.');
    const descendants = (await gitCommand(repo, ['rev-list', '--reverse', `${plan.hash}..${plan.head}`])).trim().split('\n').filter(Boolean);
    for (const old of descendants) {
      const author = await metadata(repo, old), tree = (await gitCommand(repo, ['rev-parse', `${old}^{tree}`])).trim();
      tip = (await gitCommand(repo, ['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-p', tip, '-m', author.message], undefined, author.env)).trim();
    }
    const saved: Saved = { id, source: plan.hash, parent: plan.parent, oldHead: plan.head, newHead: tip, branch: plan.branch, worktree: await fs.realpath(repo), createdAt: new Date().toISOString(), descendantCount: plan.descendantCount, commits };
    await gitCommand(repo, ['update-ref', refFor(id), tip, '']);
    await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify(saved), { flag: 'wx' });
    return saved;
  } catch (error) { await gitCommand(repo, ['update-ref', '-d', refFor(id)]).catch(() => {}); throw error; }
  finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

export async function discardCommitSplit(repo: string, id: string) {
  validId(id);
  await gitCommand(repo, ['update-ref', '-d', refFor(id)]);
  await fs.unlink(path.join(await gitDir(repo), 'git-workbench-splits', `${id}.json`)).catch(() => {});
  return { ok: true };
}

export async function listCommitSplitPreviews(repo: string): Promise<CommitSplitPreview[]> {
  const directory = path.join(await gitDir(repo), 'git-workbench-splits'), worktree = await fs.realpath(repo);
  const names = (await fs.readdir(directory).catch(() => [])).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
  const records = await Promise.all(names.map(async name => { try { const saved: Saved = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')); return saved.worktree === worktree ? saved : null; } catch { return null; } }));
  return records.filter((s): s is Saved => !!s).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function applyCommitSplit(repo: string, id: string) {
  const saved: Saved = JSON.parse(await fs.readFile(path.join(await gitDir(repo), 'git-workbench-splits', `${validId(id)}.json`), 'utf8'));
  const current = await cleanBranch(repo);
  if (saved.worktree !== await fs.realpath(repo) || current.branch !== saved.branch || current.head !== saved.oldHead) throw new Error('The checkout changed since this preview. Prepare a fresh split.');
  if ((await resolveCommit(repo, refFor(id))) !== saved.newHead) throw new Error('The split preview is no longer available.');
  const tree = async (ref: string) => (await gitCommand(repo, ['rev-parse', `${ref}^{tree}`])).trim();
  if (await tree(saved.newHead) !== await tree(saved.oldHead)) throw new Error('The preview tree differs from the original. The branch was not changed.');
  await createRestorePoint(repo, `Before splitting ${saved.source.slice(0, 12)}`);
  const recheck = await cleanBranch(repo);
  if (recheck.branch !== saved.branch || recheck.head !== saved.oldHead) throw new Error('The checkout changed during snapshot creation. Retry the split.');
  // End trees are identical: changing only the branch ref preserves the real index and files.
  await gitCommand(repo, ['update-ref', '-m', 'Git Workbench: split commit', `refs/heads/${saved.branch}`, saved.newHead, saved.oldHead]);
  let rewriteId: string | undefined, warning = '';
  try { rewriteId = await recordCompletedRewrite(repo, { operation: 'split-commit', branch: saved.branch, oldBase: saved.parent || undefined, oldTip: saved.oldHead, newTip: saved.newHead }); }
  catch { warning = 'Split completed. Comparison recording failed; the restore point is available.'; }
  await discardCommitSplit(repo, id).catch(() => {});
  return { ok: true, rewriteId, warning };
}
