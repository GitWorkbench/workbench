import { pullRequestProviders } from '../../shared/hosting-provider';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { BranchStackLink, BranchStackState, StackRestackSession, PullReviewTarget, PullRequestCredential, PullRequestProvider } from '../../shared/types';
import { gitCommand, resolveCommit, cleanBranch } from './advanced-process';
import { createRestorePoint } from './restore-points';
import { recordCompletedRewrite } from './rewrite-comparison';
import { getRepoOperationState } from './conflicts-rebase';
import { apiPath, hostedReviewClient, requestJson } from './pull-requests';

interface Registry { revision: string; links: BranchStackLink[] }
type Session = StackRestackSession & { revision: string; inFlight?: boolean; createdAt: string; restoreId?: string };
const validId = (id: string) => { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid stack session.'); return id; };
const baseRef = (id: string) => `refs/git-workbench/stacks/${validId(id)}/base`;
async function directory(repo: string) { return path.join(path.resolve(repo, (await gitCommand(repo, ['rev-parse', '--git-common-dir'])).trim()), 'git-workbench-stacks'); }
async function readRegistry(repo: string): Promise<Registry> {
  try { return JSON.parse(await fs.readFile(path.join(await directory(repo), 'branches.json'), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { revision: '', links: [] }; throw e; }
}
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), { flag: 'wx' });
  await fs.rename(temp, file);
}
async function saveSession(repo: string, s: Session) { await writeJson(path.join(await directory(repo), `${validId(s.id)}.json`), s); }
async function session(repo: string, id: string): Promise<Session> { return JSON.parse(await fs.readFile(path.join(await directory(repo), `${validId(id)}.json`), 'utf8')); }
async function branchHash(repo: string, branch: string) {
  if (!branch || branch.startsWith('-') || /[\0\r\n]/.test(branch)) throw new Error('Choose a valid local branch.');
  await gitCommand(repo, ['check-ref-format', `refs/heads/${branch}`]);
  return resolveCommit(repo, `refs/heads/${branch}`);
}
async function acquire(repo: string) {
  const dir = await directory(repo); await fs.mkdir(dir, { recursive: true });
  const lock = await fs.open(path.join(dir, 'operation.lock'), 'wx').catch(() => { throw new Error('Another stack action is running. If the app stopped unexpectedly, remove git-workbench-stacks/operation.lock in the common Git directory after confirming no action is running.'); });
  return async () => { await lock.close(); await fs.unlink(path.join(dir, 'operation.lock')).catch(() => {}); };
}

export async function getBranchStack(repo: string): Promise<BranchStackState> {
  const registry = await readRegistry(repo);
  const branches = (await gitCommand(repo, ['for-each-ref', '--format=%(refname:strip=2)', 'refs/heads/'])).trim().split('\n').filter(Boolean);
  const links = await Promise.all(registry.links.map(async link => {
    try {
      const head = await branchHash(repo, link.branch), parentHead = await branchHash(repo, link.parent);
      const commits = Number((await gitCommand(repo, ['rev-list', '--count', `${link.base}..${head}`])).trim());
      return { ...link, head, parentHead, commits };
    } catch (e) { return { ...link, error: String(e) }; }
  }));
  const names = (await fs.readdir(await directory(repo)).catch(() => [])).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
  const sessions = await Promise.all(names.map(async n => { try { return await session(repo, n.slice(0, -5)); } catch { return null; } }));
  return { links, branches, sessions: sessions.filter((s): s is Session => !!s).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function setStackParent(repo: string, branch: string, parent: string | null, resetBoundary = false) {
  const release = await acquire(repo);
  try {
    const registry = await readRegistry(repo), existing = registry.links.find(l => l.branch === branch);
    if (parent === null) {
      registry.links = registry.links.filter(l => l.branch !== branch);
    } else {
      if (branch === parent) throw new Error('A branch cannot depend on itself.');
      const head = await branchHash(repo, branch), parentHead = await branchHash(repo, parent);
      let cursor: string | undefined = parent; const seen = new Set([branch]);
      while (cursor) { if (seen.has(cursor)) throw new Error('That dependency would create a cycle.'); seen.add(cursor); cursor = registry.links.find(l => l.branch === cursor)?.parent; }
      const base = existing && !resetBoundary ? existing.base : (await gitCommand(repo, ['merge-base', head, parentHead])).trim();
      await gitCommand(repo, ['merge-base', '--is-ancestor', base, head]);
      const link = { id: existing?.id || randomUUID(), branch, parent, base };
      await gitCommand(repo, ['update-ref', baseRef(link.id), base]);
      registry.links = [...registry.links.filter(l => l.branch !== branch), link];
    }
    registry.revision = randomUUID();
    await writeJson(path.join(await directory(repo), 'branches.json'), registry);
    if (parent === null && existing) await gitCommand(repo, ['update-ref', '-d', baseRef(existing.id)]).catch(() => {});
    return getBranchStack(repo);
  } finally { await release(); }
}

async function build(repo: string, s: Session): Promise<Session> {
  try {
    if ((await readRegistry(repo)).revision !== s.revision) throw new Error('Stack links changed. Discard this preview and create another.');
    while (s.index < s.steps.length) {
      const step = s.steps[s.index];
      if (s.inFlight) {
        const op = await getRepoOperationState(s.path);
        if (op.inRebase || op.inMerge || op.inCherryPick || op.conflictedFiles.length) throw new Error('Resolve conflicts in the preview worktree and Continue its rebase, then Resume here.');
        const status = await gitCommand(s.path, ['status', '--porcelain']);
        const head = await resolveCommit(s.path, 'HEAD');
        if (status.trim() || head === step.oldHead) throw new Error('The preview rebase did not finish. If it was aborted, discard this preview and start again.');
        await gitCommand(s.path, ['merge-base', '--is-ancestor', step.onto!, head]);
        step.newHead = head; s.inFlight = false; s.index++; await saveSession(repo, s); continue;
      }
      step.onto = s.steps.find(p => p.branch === step.parent)?.newHead || s.rootHead;
      await gitCommand(s.path, ['-c', 'core.hooksPath=' + path.join(await directory(repo), 'no-hooks'), '-c', 'submodule.recurse=false', 'checkout', '--detach', step.oldHead]);
      if (step.base === step.onto) { step.newHead = step.oldHead; s.index++; await saveSession(repo, s); continue; }
      s.inFlight = true; s.state = 'building'; await saveSession(repo, s);
      await gitCommand(s.path, ['-c', 'core.hooksPath=' + path.join(await directory(repo), 'no-hooks'), '-c', 'commit.gpgsign=false', '-c', 'rebase.updateRefs=false', '-c', 'rerere.enabled=false', '-c', 'rebase.autoStash=false', 'rebase', '--no-autosquash', '--no-update-refs', '--empty=keep', '--onto', step.onto, step.base], undefined, { GIT_LFS_SKIP_SMUDGE: '1' }, 120_000);
      step.newHead = await resolveCommit(s.path, 'HEAD'); s.inFlight = false; s.index++; await saveSession(repo, s);
    }
    s.state = 'ready'; s.error = undefined;
  } catch (e) { s.state = 'paused'; s.error = String(e); }
  // Pin every new tip: a later preview checkout must not leave earlier results only in reflogs.
  for (const step of s.steps) if (step.newHead) await gitCommand(repo, ['update-ref', `refs/git-workbench/restacks/${s.id}/${step.id}`, step.newHead]);
  await saveSession(repo, s); return s;
}

export async function previewStackRestack(repo: string, root: string) {
  const release = await acquire(repo);
  try {
    const registry = await readRegistry(repo), rootHead = await branchHash(repo, root);
    const steps: Session['steps'] = [], seen = new Set([root]);
    const visit = async (parent: string) => { for (const link of registry.links.filter(l => l.parent === parent)) {
      if (seen.has(link.branch)) throw new Error('Invalid cyclic stack. Fix the parent links.'); seen.add(link.branch);
      if (steps.length >= 10) throw new Error('Preview at most 10 dependent branches at once.');
      const oldHead = await branchHash(repo, link.branch);
      await gitCommand(repo, ['merge-base', '--is-ancestor', link.base, oldHead]);
      const commits = Number((await gitCommand(repo, ['rev-list', '--count', `${link.base}..${oldHead}`])).trim());
      if (commits > 100 || (await gitCommand(repo, ['rev-list', '--min-parents=2', `${link.base}..${oldHead}`])).trim()) throw new Error(`${link.branch}: use a linear stack of at most 100 commits per branch.`);
      steps.push({ id: link.id, branch: link.branch, parent, base: link.base, oldHead, commits }); await visit(link.branch);
    } };
    await visit(root);
    if (!steps.length) throw new Error('This base branch has no linked descendants. Add parent links first.');
    const id = randomUUID(), temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'git-workbench-restack-'));
    const s: Session = { id, revision: registry.revision, root, rootHead, path: path.join(temporary, 'preview'), steps, index: 0, state: 'building', createdAt: new Date().toISOString() };
    await fs.mkdir(path.join(await directory(repo), 'no-hooks'), { recursive: true });
    await gitCommand(repo, ['-c', 'core.hooksPath=' + path.join(await directory(repo), 'no-hooks'), 'worktree', 'add', '--detach', '--', s.path, steps[0].oldHead], undefined, { GIT_LFS_SKIP_SMUDGE: '1' });
    await saveSession(repo, s);
    return await build(repo, s);
  } finally { await release(); }
}

export async function resumeStackRestack(repo: string, id: string) {
  const release = await acquire(repo);
  try { const s = await session(repo, id); if (s.state === 'applied') throw new Error('This preview has already been applied.'); return await build(repo, s); }
  finally { await release(); }
}

export async function applyStackRestack(repo: string, id: string) {
  const release = await acquire(repo);
  try {
    const s = await session(repo, id), registry = await readRegistry(repo);
    if (s.state !== 'ready' || registry.revision !== s.revision) throw new Error('Create or resume a complete preview for the current stack first.');
    const current = await cleanBranch(repo);
    const checkedOut = await gitCommand(repo, ['worktree', 'list', '--porcelain']);
    for (const step of s.steps) if (checkedOut.split('\n').includes(`branch refs/heads/${step.branch}`)) throw new Error(`Check out ${s.root} first, and close any other checkout of ${step.branch}. Affected branches must not be checked out while applying.`);
    await createRestorePoint(repo, `Before restacking descendants of ${s.root}`);
    // Keep every original tip independently of the working-tree restore point.
    for (const step of s.steps) await gitCommand(repo, ['update-ref', `refs/git-workbench/restacks/${s.id}/old-${step.id}`, step.oldHead]);
    // update-ref's line protocol uses C-quoted ref names, independently of shell quoting.
    const quote = (name: string) => JSON.stringify(name);
    const commands = ['start', `verify ${quote(`refs/heads/${s.root}`)} ${s.rootHead}`];
    if (current.branch !== s.root) commands.push(`verify ${quote(`refs/heads/${current.branch}`)} ${current.head}`);
    for (const step of s.steps) {
      commands.push(`update ${quote(`refs/heads/${step.branch}`)} ${step.newHead} ${step.oldHead}`);
      commands.push(`update ${quote(baseRef(step.id))} ${step.onto} ${step.base}`);
    }
    commands.push('prepare', 'commit');
    await gitCommand(repo, ['update-ref', '-m', 'Git Workbench: apply stack restack', '--stdin'], commands.join('\n') + '\n');
    let warning = '';
    s.state = 'applied';
    try { await saveSession(repo, s); } catch { warning = 'Branches applied, but the preview status could not be saved. Do not apply it again.'; }
    for (const step of s.steps) try { await recordCompletedRewrite(repo, { operation: 'restack', branch: step.branch, oldBase: step.base, newBase: step.onto, oldTip: step.oldHead, newTip: step.newHead! }); } catch { warning = 'Stack applied; some comparison records could not be saved. Original tips remain pinned in the preview.'; }
    for (const link of registry.links) { const step = s.steps.find(p => p.id === link.id); if (step) link.base = step.onto!; }
    registry.revision = randomUUID();
    try { await writeJson(path.join(await directory(repo), 'branches.json'), registry); }
    catch { warning = 'Stack branches applied, but parent metadata could not be updated. Keep this preview and reset each parent boundary before restacking again.'; }
    return { ok: true, warning };
  } finally { await release(); }
}

export async function discardStackRestack(repo: string, id: string) {
  const release = await acquire(repo);
  try {
    const s = await session(repo, id);
    if (await fs.realpath(repo) === await fs.realpath(s.path)) throw new Error('Switch away from the preview worktree before removing it.');
    const op = await getRepoOperationState(s.path).catch(() => null);
    if (op?.inRebase) await gitCommand(s.path, ['rebase', '--abort']);
    // Do not delete a user's conflict edits or untracked files without a separate worktree removal.
    await gitCommand(repo, ['worktree', 'remove', '--', s.path]);
    for (const step of s.steps) for (const prefix of ['', 'old-']) await gitCommand(repo, ['update-ref', '-d', `refs/git-workbench/restacks/${s.id}/${prefix}${step.id}`]);
    await fs.unlink(path.join(await directory(repo), `${s.id}.json`));
    await fs.rmdir(path.dirname(s.path)).catch(() => {});
    return { ok: true };
  } finally { await release(); }
}

export async function retargetPullRequest(repo: string, input: PullReviewTarget & { head: string; previousTarget: string; newTarget: string }, credentials: (p: PullRequestProvider, remoteUrl?: string) => PullRequestCredential | null) {
  if (!input || !pullRequestProviders.includes(input.provider) || !/^\d+$/.test(input.requestId) || !/^[a-f0-9]{40,64}$/i.test(input.head)) throw new Error('Load the current request revision first.');
  await branchHash(repo, input.newTarget);
  const { config, credential } = await hostedReviewClient(repo, input.remoteName, input.provider, credentials);
  const endpoint = `${apiPath(config)}/${(input.provider === 'github' || input.provider === 'gitea') ? 'pulls' : input.provider === 'gitlab' ? 'merge_requests' : 'pullrequests'}/${input.requestId}`;
  const pr = await requestJson<Record<string, any>>(config, credential, endpoint, 'GET');
  const head = (input.provider === 'github' || input.provider === 'gitea') ? pr.head?.sha : input.provider === 'gitlab' ? pr.diff_refs?.head_sha || pr.sha : pr.source?.commit?.hash;
  const target = (input.provider === 'github' || input.provider === 'gitea') ? pr.base?.ref : input.provider === 'gitlab' ? pr.target_branch : pr.destination?.branch?.name;
  const open = input.provider === 'gitlab' ? pr.state === 'opened' : input.provider === 'bitbucket' ? pr.state === 'OPEN' : pr.state === 'open';
  if (!open || head !== input.head || target !== input.previousTarget) throw new Error('The request changed or closed. Reload requests before retargeting.');
  await requestJson(config, credential, endpoint, (input.provider === 'github' || input.provider === 'gitea') ? 'PATCH' : 'PUT', (input.provider === 'github' || input.provider === 'gitea') ? { base: input.newTarget } : input.provider === 'gitlab' ? { target_branch: input.newTarget } : { destination: { branch: { name: input.newTarget } } });
  return { ok: true };
}
