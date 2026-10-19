import type { PullReviewTarget, PullReviewDetail, PullReviewFile, PullReviewSubmission, PullRequestCredential, PullRequestProvider } from '../../shared/types';
import { apiPath, hostedReviewClient, requestJson } from './pull-requests';
import { reviewDiffLines } from '../../shared/review-diff';

type Credentials = (provider: PullRequestProvider) => PullRequestCredential | null;
type Row = Record<string, any>;

async function client(repo: string, target: PullReviewTarget, credentials: Credentials) {
  if (!target || !['github', 'gitlab', 'bitbucket'].includes(target.provider) || !/^\d+$/.test(target.requestId)) throw new Error('Invalid review target.');
  const { config, credential } = await hostedReviewClient(repo, target.remoteName, target.provider, credentials);
  const root = apiPath(config);
  const pr = `${root}/${target.provider === 'gitlab' ? 'merge_requests' : target.provider === 'github' ? 'pulls' : 'pullrequests'}/${target.requestId}`;
  return { root, pr, get: <T = Row>(path: string) => requestJson<T>(config, credential, path, 'GET'),
    graph: async (query: string, variables?: unknown) => {
      const result = await requestJson<Row>({ ...config, apiBase: new URL(config.apiBase).origin }, credential, '/api/graphql', 'POST', { query, variables });
      if (result.errors?.length) throw new Error(result.errors.map((e: Row) => e.message).join('; '));
      return result.data;
    },
    text: (path: string) => requestJson<string>(config, credential, path, 'GET', undefined, true),
    post: (path: string, payload?: unknown) => requestJson<Row>(config, credential, path, 'POST', payload) };
}

async function nativeGitLabChanges(c: Awaited<ReturnType<typeof client>>) {
  const schema = await c.graph('{ __type(name: "Mutation") { fields { name } } }');
  return !!schema?.__type?.fields?.some((f: Row) => f.name === 'mergeRequestRequestChanges');
}

/** Bounded pagination is visible to the user; optional CI permissions never hide files. */
async function collect(c: Awaited<ReturnType<typeof client>>, path: string, warnings: string[], key?: string): Promise<Row[]> {
  const result: Row[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await c.get<any>(`${path}${path.includes('?') ? '&' : '?'}per_page=100&pagelen=100&page=${page}`);
    const rows = key ? data[key] || [] : Array.isArray(data) ? data : data.values || [];
    result.push(...rows);
    if (rows.length < 100 || (!Array.isArray(data) && !key && !data.next)) return result;
  }
  warnings.push(`Only the first 1,000 items from ${path.split('?')[0].split('/').pop()} are displayed. Open the provider for the full list.`);
  return result;
}

export async function getPullReview(repo: string, target: PullReviewTarget, credentials: Credentials): Promise<PullReviewDetail> {
  const c = await client(repo, target, credentials);
  const pr = await c.get(c.pr);
  const d: PullReviewDetail = { head: '', base: '', start: '', description: '', files: [], comments: [], checks: [], warnings: [], changeRequestMode: target.provider === 'gitlab' ? 'discussion' : 'native' };
  const optional = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (error) { d.warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const rows = (url: string, key?: string) => collect(c, url, d.warnings, key);
  if (target.provider === 'github') {
    d.head = pr.head.sha; d.base = pr.base.sha; d.start = pr.base.sha; d.description = pr.body || '';
    await Promise.all([
      (async () => { d.files = (await rows(`${c.pr}/files`)).map(f => ({ path: f.filename, oldPath: f.previous_filename || f.filename, status: f.status, patch: f.patch || '', unavailable: !f.patch })); })(),
      optional('Review comments', async () => {
        const comments = await rows(`${c.pr}/comments`);
        d.comments.push(...comments.map(n => ({ id: String(n.id), author: n.user?.login || 'Unknown', body: n.body || '', path: n.path, line: n.line || n.original_line, side: n.side === 'LEFT' ? 'old' as const : 'new' as const, state: n.line ? undefined : 'Outdated', createdAt: n.created_at })));
      }),
      optional('Conversation', async () => { d.comments.push(...(await rows(`${c.root}/issues/${target.requestId}/comments`)).map(n => ({ id: `issue-${n.id}`, author: n.user?.login || 'Unknown', body: n.body || '', createdAt: n.created_at }))); }),
      optional('Reviews', async () => { d.comments.push(...(await rows(`${c.pr}/reviews`)).map(n => ({ id: `review-${n.id}`, author: n.user?.login || 'Unknown', body: n.body || '', state: n.state, createdAt: n.submitted_at }))); }),
      optional('CI checks (requires Checks: read)', async () => {
        d.checks.push(...(await rows(`${c.root}/commits/${d.head}/check-runs`, 'check_runs')).map(n => ({ name: n.name, state: n.conclusion || n.status, url: n.html_url })));
      }),
      optional('Commit statuses (requires Commit statuses: read)', async () => {
        const status = await c.get(`${c.root}/commits/${d.head}/status`);
        d.checks.push(...(status.statuses || []).map((n: Row) => ({ name: n.context, state: n.state, url: n.target_url })));
      })
    ]);
  } else if (target.provider === 'gitlab') {
    d.head = String(pr.diff_refs?.head_sha || pr.sha || ''); d.base = pr.diff_refs?.base_sha || ''; d.start = pr.diff_refs?.start_sha || ''; d.description = pr.description || '';
    await Promise.all([
      optional('GitLab review capabilities', async () => { if (await nativeGitLabChanges(c)) d.changeRequestMode = 'native'; }),
      (async () => { d.files = (await rows(`${c.pr}/diffs`)).map(f => ({ path: f.new_path, oldPath: f.old_path, status: f.deleted_file ? 'deleted' : f.new_file ? 'added' : f.renamed_file ? 'renamed' : 'modified', patch: f.diff || '', unavailable: !f.diff || f.too_large || f.collapsed })); })(),
      optional('Discussions', async () => {
        for (const thread of await rows(`${c.pr}/discussions`)) for (const n of thread.notes || []) {
          if (n.system) continue;
          d.comments.push({ id: String(n.id), threadId: String(thread.id), author: n.author?.username || 'Unknown', body: n.body || '', path: n.position?.new_path, line: n.position?.new_line || n.position?.old_line, side: n.position?.new_line ? 'new' : 'old', resolved: n.resolvable ? !!n.resolved : undefined, createdAt: n.created_at });
        }
      }),
      optional('Approvals', async () => { const approvals = await c.get(`${c.pr}/approvals`); d.comments.push(...(approvals.approved_by || []).map((n: Row) => ({ id: `approval-${n.user.id}`, author: n.user.username, body: '', state: 'APPROVED' }))); }),
      optional('CI pipelines', async () => {
        const pipelines = await rows(`${c.pr}/pipelines`);
        const latest = pipelines.filter(n => n.sha === d.head).sort((a, b) => b.id - a.id)[0];
        if (!latest) return;
        d.checks.push({ name: `Pipeline #${latest.id}`, state: latest.status || 'unknown', url: latest.web_url });
        d.checks.push(...(await rows(`${c.root}/pipelines/${latest.id}/jobs`)).map(n => ({ name: n.name, state: n.status, url: n.web_url })));
      })
    ]);
    if (d.changeRequestMode === 'discussion') d.warnings.push('This GitLab host did not advertise native change requests. Request changes posts a discussion and removes your approval; it does not set a review-blocking state.');
  } else {
    d.head = pr.source.commit.hash; d.base = pr.destination.commit.hash; d.start = d.base; d.description = pr.description || '';
    await Promise.all([
      (async () => {
        const [stats, diff] = await Promise.all([rows(`${c.pr}/diffstat`), c.text(`${c.pr}/diff`)]);
        const blocks = diff.split(/^diff --git /m).slice(1).map(b => `diff --git ${b}`);
        d.files = stats.map(f => {
          const path = f.new?.path || f.old?.path;
          const oldPath = f.old?.path || path;
          const patch = blocks.find(b => b.split('\n').some(line => line === `+++ b/${path}` || line === `--- a/${oldPath}`)) || '';
          return { path, oldPath, status: f.status, patch, unavailable: !patch };
        });
      })(),
      optional('Comments', async () => { d.comments.push(...(await rows(`${c.pr}/comments`)).filter(n => !n.deleted).map(n => ({ id: String(n.id), author: n.user?.display_name || 'Unknown', body: n.content?.raw || '', path: n.inline?.path, line: n.inline?.to || n.inline?.from, side: n.inline?.to ? 'new' as const : 'old' as const, createdAt: n.created_on }))); }),
      optional('CI statuses', async () => { d.checks = (await rows(`${c.pr}/statuses`)).map(n => ({ name: n.name || n.key, state: n.state, url: n.url })); })
    ]);
    d.comments.push(...(pr.participants || []).filter((n: Row) => n.approved || n.state === 'changes_requested').map((n: Row) => ({ id: `participant-${n.user.uuid}`, author: n.user.display_name, body: '', state: n.state || 'APPROVED' })));
  }
  d.comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (d.files.some(f => f.unavailable)) d.warnings.push('Some files are binary or their patch was omitted by the provider. Open the provider to review those files.');
  return d;
}

export async function submitPullReview(repo: string, p: PullReviewSubmission, credentials: Credentials) {
  if (!['comment', 'approve', 'request-changes'].includes(p.action)) throw new Error('Invalid review action.');
  const body = String(p.body || '').trim();
  if ((p.action !== 'approve' || p.inline || p.replyTo) && !body) throw new Error('Enter a review message.');
  if (body.length > 60_000) throw new Error('Review messages must be under 60,000 characters.');
  if ((p.inline || p.replyTo) && p.action !== 'comment') throw new Error('Submit line comments separately from your approval or change request.');
  const c = await client(repo, p, credentials);
  const latest = await c.get(c.pr);
  const head = p.provider === 'github' ? latest.head.sha : p.provider === 'gitlab' ? latest.diff_refs?.head_sha || latest.sha : latest.source.commit.hash;
  if (!p.head || head !== p.head) throw new Error('This request changed while you were reviewing it. Refresh and review the new changes before submitting. Your draft has been kept.');
  let file: PullReviewFile | undefined;
  let selectedLine: ReturnType<typeof reviewDiffLines>[number] | undefined;
  if (p.inline) {
    const detail = await getPullReview(repo, p, credentials);
    if (detail.head !== p.head) throw new Error('The request changed. Refresh before commenting.');
    file = detail.files.find(f => f.path === p.inline!.path && !f.unavailable);
    selectedLine = file && reviewDiffLines(file.patch).find(l => (p.inline!.side === 'old' ? l.oldNo : l.newNo) === p.inline!.line);
    if (!selectedLine || !Number.isInteger(p.inline.line) || !['old', 'new'].includes(p.inline.side)) throw new Error('Choose a displayed line in the current patch.');
  }
  if (p.provider === 'github') {
    if (p.replyTo) {
      if (!/^\d+$/.test(p.replyTo.id)) throw new Error('Only inline comment threads support replies here.');
      await c.post(`${c.pr}/comments/${p.replyTo.id}/replies`, { body });
    } else if (p.inline) {
      await c.post(`${c.pr}/comments`, { body, commit_id: p.head, path: p.inline.path, line: p.inline.line, side: p.inline.side === 'old' ? 'LEFT' : 'RIGHT' });
    } else {
      await c.post(`${c.pr}/reviews`, { body, commit_id: p.head, event: p.action === 'approve' ? 'APPROVE' : p.action === 'request-changes' ? 'REQUEST_CHANGES' : 'COMMENT' });
    }
  } else if (p.provider === 'gitlab') {
    if (p.replyTo) {
      if (!/^[a-f0-9]+$/i.test(p.replyTo.threadId || '')) throw new Error('Choose a discussion to reply to.');
      await c.post(`${c.pr}/discussions/${p.replyTo.threadId}/notes`, { body });
    } else if (p.action === 'approve') {
      await c.post(`${c.pr}/approve`, { sha: p.head });
      if (body) {
        try { await c.post(`${c.pr}/discussions`, { body }); }
        catch { return { ok: true, message: 'Approval submitted, but the accompanying comment failed. Refresh before retrying the comment.' }; }
      }
      return { ok: true, message: 'Approval submitted.' };
    } else if (p.action === 'request-changes' && p.changeRequestMode !== 'discussion') {
      const remote = await hostedReviewClient(repo, p.remoteName, p.provider, credentials);
      const result = await c.graph('mutation($input: MergeRequestRequestChangesInput!) { mergeRequestRequestChanges(input: $input) { errors } }', { input: { projectPath: remote.config.path, iid: p.requestId } });
      if (!result?.mergeRequestRequestChanges) throw new Error('GitLab did not confirm the change request. Refresh before trying again.');
      if (result.mergeRequestRequestChanges?.errors?.length) throw new Error(result.mergeRequestRequestChanges.errors.join('; '));
      try { await c.post(`${c.pr}/discussions`, { body }); }
      catch { return { ok: true, message: 'Change request submitted, but the accompanying comment failed. Refresh before retrying the comment.' }; }
    } else {
      const position = p.inline ? { position_type: 'text', base_sha: latest.diff_refs?.base_sha, head_sha: p.head, start_sha: latest.diff_refs?.start_sha,
        old_path: file!.oldPath, new_path: file!.path,
        ...(selectedLine!.oldNo != null ? { old_line: selectedLine!.oldNo } : {}), ...(selectedLine!.newNo != null ? { new_line: selectedLine!.newNo } : {}) } : undefined;
      await c.post(`${c.pr}/discussions`, { body: p.action === 'request-changes' ? `**Changes requested**\n\n${body}` : body, ...(position ? { position } : {}) });
      if (p.action === 'request-changes') {
        try { await c.post(`${c.pr}/unapprove`); }
        catch { return { ok: true, message: 'Change-request discussion posted. Your approval could not be withdrawn; remove it on GitLab.' }; }
      }
    }
  } else {
    if (p.action === 'comment') {
      if (p.replyTo && !/^\d+$/.test(p.replyTo.id)) throw new Error('Choose a comment to reply to.');
      await c.post(`${c.pr}/comments`, { content: { raw: body }, ...(p.inline ? { inline: { path: p.inline.path, [p.inline.side === 'old' ? 'from' : 'to']: p.inline.line } } : {}), ...(p.replyTo ? { parent: { id: Number(p.replyTo.id) } } : {}) });
    } else {
      await c.post(`${c.pr}/${p.action === 'approve' ? 'approve' : 'request-changes'}`);
      if (body) {
        try { await c.post(`${c.pr}/comments`, { content: { raw: body } }); }
        catch { return { ok: true, message: 'Review state submitted, but the accompanying comment failed. Refresh before retrying the comment.' }; }
      }
    }
  }
  return { ok: true, message: p.action === 'approve' ? 'Approval submitted.' : p.action === 'request-changes' ? 'Change request submitted.' : 'Comment posted.' };
}
