import type { PullRequestCredential, PullReviewDetail, PullReviewSubmission } from '../../shared/types';
import { apiPath, giteaPages, requestJson } from './pull-requests';

type Config = Parameters<typeof requestJson>[0];
interface Account { login?: string }
interface Review {
  id: number; user?: Account; body?: string; state?: string; submitted_at?: string;
  comments_count?: number; dismissed?: boolean; stale?: boolean;
}
interface ReviewComment {
  id: number; user?: Account; body?: string; path?: string; position?: number;
  original_position?: number; created_at?: string; resolver?: Account; commit_id?: string;
}
interface ChangedFile { filename: string; previous_filename?: string; status: string }

/** Git quotes non-ASCII bytes and special characters in diff file headers. */
function diffPath(value: string): string {
  if (!value.startsWith('"')) return value.replace(/\t.*$/, '');
  const chunks: Buffer[] = [];
  const escapes: Record<string, string> = { a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', '"': '"', '\\': '\\' };
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '"') break;
    if (value[i] === '\\') {
      const octal = value.slice(i + 1).match(/^[0-7]{1,3}/)?.[0];
      if (octal) { chunks.push(Buffer.from([parseInt(octal, 8)])); i += octal.length; }
      else { i++; chunks.push(Buffer.from(escapes[value[i]] ?? value[i])); }
    } else {
      const point = value.codePointAt(i);
      if (point !== undefined) { chunks.push(Buffer.from(String.fromCodePoint(point))); if (point > 0xffff) i++; }
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function getGiteaReview(config: Config, credential: PullRequestCredential, requestId: string): Promise<PullReviewDetail> {
  const root = apiPath(config);
  const prPath = `${root}/pulls/${requestId}`;
  const get = <T>(path: string) => requestJson<T>(config, credential, path, 'GET');
  const pr = await get<{ head?: { sha?: string }; base?: { sha?: string }; merge_base?: string; body?: string }>(prPath);
  if (!pr.head?.sha || !pr.base?.sha) throw new Error('Gitea did not return the request revisions. Refresh or open it on the provider.');
  const detail: PullReviewDetail = {
    head: pr.head.sha, base: pr.merge_base || pr.base.sha, start: pr.base.sha, description: pr.body || '',
    files: [], comments: [], checks: [], warnings: [], changeRequestMode: 'native'
  };
  const rows = async <T>(path: string, limit = 1000) => {
    const result = await giteaPages<T>(config, credential, path, limit);
    if (result.truncated) detail.warnings.push(`The ${path.split('/').pop()?.split('?')[0]} list reached its display limit (${result.rows.length} items). Open Gitea for the full list.`);
    return result.rows;
  };
  const optional = async (label: string, operation: () => Promise<void>) => {
    try { await operation(); }
    catch (error) { detail.warnings.push(`${label}: ${error instanceof Error ? error.message : 'Could not load this section.'}`); }
  };
  await Promise.all([
    (async () => {
      const [files, diff] = await Promise.all([
        rows<ChangedFile>(`${prPath}/files`), requestJson<string>(config, credential, `${prPath}.diff?binary=false`, 'GET', undefined, true)
      ]);
      const patches = new Map<string, string>();
      for (const block of diff.split(/^diff --git /m).slice(1)) {
        for (const line of block.split('\n')) {
          if (line.startsWith('@@')) break;
          if (line.startsWith('+++ ') || line.startsWith('--- ')) patches.set(diffPath(line.slice(4)).replace(/^[ab]\//, ''), `diff --git ${block}`);
        }
      }
      detail.files = files.map(file => {
        const patch = patches.get(file.filename) || patches.get(file.previous_filename || '') || '';
        return { path: file.filename, oldPath: file.previous_filename || file.filename, status: file.status, patch, unavailable: !/^@@ /m.test(patch) };
      });
    })(),
    optional('Conversation', async () => {
      const comments = await rows<ReviewComment>(`${root}/issues/${requestId}/comments`);
      detail.comments.push(...comments.map(comment => ({ id: `issue-${comment.id}`, author: comment.user?.login || 'Unknown', body: comment.body || '', createdAt: comment.created_at })));
    }),
    optional('Reviews', async () => {
      const reviews = await rows<Review>(`${prPath}/reviews`, 100);
      for (const review of reviews) {
        detail.comments.push({ id: `review-${review.id}`, author: review.user?.login || 'Unknown', body: review.body || '', state: `${review.state || 'COMMENT'}${review.dismissed ? ' · Dismissed' : review.stale ? ' · Outdated' : ''}`, createdAt: review.submitted_at });
      }
      // Limit concurrent requests while retrieving each review's inline conversations.
      const withComments = reviews.filter(review => review.comments_count);
      let inlineCount = 0;
      let truncated = false;
      for (let offset = 0; offset < withComments.length; offset += 4) {
        if (inlineCount >= 1000) { truncated = true; break; }
        await Promise.all(withComments.slice(offset, offset + 4).map(review => optional('Review comments', async () => {
          const comments = await get<ReviewComment[]>(`${prPath}/reviews/${review.id}/comments`);
          const visible = comments.slice(0, 1000 - inlineCount);
          inlineCount += visible.length;
          if (comments.length > visible.length) truncated = true;
          detail.comments.push(...visible.map(comment => ({
            id: String(comment.id), threadId: String(review.id), author: comment.user?.login || 'Unknown', body: comment.body || '',
            path: comment.path, line: comment.position || comment.original_position, side: comment.position ? 'new' as const : 'old' as const,
            resolved: comment.resolver ? true : undefined, state: comment.commit_id && comment.commit_id !== detail.head ? 'Outdated' : undefined, createdAt: comment.created_at
          })));
        })));
      }
      if (truncated) detail.warnings.push('Only the first 1,000 inline review comments are displayed. Open Gitea for the full conversation.');
    }),
    optional('CI statuses', async () => {
      const statuses = await rows<{ context: string; status: string; target_url?: string }>(`${root}/statuses/${detail.head}?sort=recentupdate`);
      const seen = new Set<string>();
      detail.checks = statuses.filter(status => { if (seen.has(status.context)) return false; seen.add(status.context); return true; })
        .map(status => ({ name: status.context, state: status.status, url: status.target_url }));
    })
  ]);
  // Revalidate after loading separate endpoints so an updated request cannot produce a mixed review.
  const latest = await get<{ head?: { sha?: string }; base?: { sha?: string } }>(prPath);
  if (latest.head?.sha !== pr.head.sha || latest.base?.sha !== pr.base.sha) throw new Error('This request changed while loading. Refresh to review its current revision.');
  detail.comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (detail.files.some(file => file.unavailable)) detail.warnings.push('Some files have no text patch (binary, empty, or omitted by Gitea). Open the provider to inspect them.');
  return detail;
}

export async function submitGiteaReview(config: Config, credential: PullRequestCredential, input: PullReviewSubmission, body: string) {
  const prPath = `${apiPath(config)}/pulls/${input.requestId}`;
  if (input.replyTo) {
    if (!/^\d+$/.test(input.replyTo.id)) throw new Error('Only inline review comments support threaded replies here.');
    await requestJson(config, credential, `${prPath}/comments/${input.replyTo.id}/replies`, 'POST', { body });
  } else {
    await requestJson(config, credential, `${prPath}/reviews`, 'POST', {
      body: input.inline ? '' : body, commit_id: input.head,
      event: input.action === 'approve' ? 'APPROVED' : input.action === 'request-changes' ? 'REQUEST_CHANGES' : 'COMMENT',
      ...(input.inline ? { comments: [{ body, path: input.inline.path, old_position: input.inline.side === 'old' ? input.inline.line : 0, new_position: input.inline.side === 'new' ? input.inline.line : 0 }] } : {})
    });
  }
}
