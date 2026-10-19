import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequestProvider, PullReviewSubmission, PullReviewTarget } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ hosted: vi.fn(), request: vi.fn(), apiPath: vi.fn(), responses: new Map<string, unknown>() }));
vi.mock('../../src/main/git/pull-requests', () => ({ hostedReviewClient: mocks.hosted, requestJson: mocks.request, apiPath: mocks.apiPath }));
import { getPullReview, submitPullReview } from '../../src/main/git/pull-request-review';

const credentials = () => ({ token: 'secret' });
const patch = '@@ -3,2 +5,2 @@\n same\n-old\n+new';
const target = (provider: PullRequestProvider = 'github'): PullReviewTarget => ({ provider, remoteName: 'origin', requestId: '7' });
const submission = (provider: PullRequestProvider = 'github', options: Partial<PullReviewSubmission> = {}): PullReviewSubmission => ({ ...target(provider), head: 'head', action: 'comment', body: ' Review message ', ...options });
const root = '/root';
const prPath = (provider: PullRequestProvider) => `${root}/${provider === 'github' ? 'pulls' : provider === 'gitlab' ? 'merge_requests' : 'pullrequests'}/7`;
function setup(provider: PullRequestProvider) {
  const pr = prPath(provider);
  const info = provider === 'github' ? { head: { sha: 'head' }, base: { sha: 'base' }, body: 'Description' }
    : provider === 'gitlab' ? { diff_refs: { head_sha: 'head', base_sha: 'base', start_sha: 'start' }, description: 'Description' }
    : { source: { commit: { hash: 'head' } }, destination: { commit: { hash: 'base' } }, description: 'Description' };
  mocks.responses.set(pr, info);
  mocks.hosted.mockImplementation(async () => ({ config: { provider, path: 'owner/repo', apiBase: 'https://provider.example/api/v4' }, credential: credentials() }));
  return { pr, info };
}
const posts = () => mocks.request.mock.calls.filter(call => call[3] === 'POST').map(call => ({ path: call[2], payload: call[4] }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.responses = new Map(); mocks.apiPath.mockReturnValue(root);
  setup('github');
  mocks.request.mockImplementation(async (_config, _credential, path, method, payload, asText) => {
    const key = path.split('?')[0];
    const value = mocks.responses.get(`${method} ${key}`) ?? mocks.responses.get(key);
    if (value instanceof Error || typeof value === 'string' && value.startsWith('THROW:')) throw value instanceof Error ? value : value.slice(6);
    if (typeof value === 'function') return value(path, payload);
    if (value !== undefined) return value;
    if (asText) return '';
    if (path === '/api/graphql') return { data: { __type: { fields: [] } } };
    if (method === 'POST') return {};
    if (key.endsWith('/status')) return {};
    if (key.endsWith('/approvals')) return {};
    if (key.endsWith('/check-runs')) return {};
    return [];
  });
});

describe('review target validation', () => {
  it.each([null, { ...target(), provider: 'unknown' }, { ...target(), requestId: '../7' }, { ...target(), requestId: '-1' }])('rejects invalid target %j', async invalid => {
    await expect(getPullReview('/repo', invalid as PullReviewTarget, credentials)).rejects.toThrow('Invalid review target');
    expect(mocks.hosted).not.toHaveBeenCalled();
  });
});

describe('GitHub review details', () => {
  it('maps files, review comments, conversation, review states, checks, and commit statuses', async () => {
    const { pr } = setup('github');
    mocks.responses.set(`${pr}/files`, [{ filename: 'new.ts', previous_filename: 'old.ts', status: 'renamed', patch }, { filename: 'binary.png', status: 'modified' }]);
    mocks.responses.set(`${pr}/comments`, [
      { id: 1, user: { login: 'dev' }, body: 'Old side', path: 'new.ts', line: 3, side: 'LEFT', created_at: '2026-02-01' },
      { id: 2, original_line: 4 }
    ]);
    mocks.responses.set(`${root}/issues/7/comments`, [{ id: 3, created_at: '2026-01-01' }]);
    mocks.responses.set(`${pr}/reviews`, [{ id: 4, user: { login: 'reviewer' }, body: 'Approved', state: 'APPROVED', submitted_at: '2026-03-01' }]);
    mocks.responses.set(`${root}/commits/head/check-runs`, { check_runs: [{ name: 'Build', conclusion: 'success', html_url: '/build' }, { name: 'Lint', status: 'in_progress' }] });
    mocks.responses.set(`${root}/commits/head/status`, { statuses: [{ context: 'Tests', state: 'success', target_url: '/tests' }] });
    const detail = await getPullReview('/repo', target(), credentials);
    expect(detail).toMatchObject({ head: 'head', base: 'base', start: 'base', description: 'Description', changeRequestMode: 'native' });
    expect(detail.files).toEqual([
      { path: 'new.ts', oldPath: 'old.ts', status: 'renamed', patch, unavailable: false },
      { path: 'binary.png', oldPath: 'binary.png', status: 'modified', patch: '', unavailable: true }
    ]);
    expect(detail.comments.map(c => c.id)).toEqual(['2', 'issue-3', '1', 'review-4']);
    expect(detail.comments.find(c => c.id === '1')).toMatchObject({ author: 'dev', line: 3, side: 'old', state: undefined });
    expect(detail.comments.find(c => c.id === '2')).toMatchObject({ author: 'Unknown', line: 4, side: 'new', state: 'Outdated', body: '' });
    expect(detail.checks).toHaveLength(3);
    expect(detail.checks).toEqual(expect.arrayContaining([{ name: 'Build', state: 'success', url: '/build' }, { name: 'Lint', state: 'in_progress', url: undefined }, { name: 'Tests', state: 'success', url: '/tests' }]));
    expect(detail.warnings).toEqual([expect.stringContaining('binary or their patch was omitted')]);
  });
  it('keeps essential files when optional endpoint permissions fail', async () => {
    const { pr, info } = setup('github'); delete (info as { body?: string }).body;
    mocks.responses.set(`${pr}/files`, [{ filename: 'file.ts', status: 'modified', patch }]);
    mocks.responses.set(`${pr}/comments`, new Error('missing comments permission'));
    mocks.responses.set(`${pr}/reviews`, 'THROW:review unavailable');
    const detail = await getPullReview('/repo', target(), credentials);
    expect(detail.description).toBe(''); expect(detail.files).toHaveLength(1);
    expect(detail.warnings).toEqual(expect.arrayContaining(['Review comments: missing comments permission', 'Reviews: review unavailable']));
  });
  it('propagates essential files failures', async () => {
    mocks.responses.set(`${prPath('github')}/files`, new Error('files denied'));
    await expect(getPullReview('/repo', target(), credentials)).rejects.toThrow('files denied');
  });
  it('handles both populated conversation authors and empty review metadata', async () => {
    const pr = prPath('github');
    mocks.responses.set(`${root}/issues/7/comments`, [{ id: 1, user: { login: 'author' }, body: 'Conversation' }]);
    mocks.responses.set(`${pr}/reviews`, [{ id: 2 }]);
    const detail = await getPullReview('/repo', target(), credentials);
    expect(detail.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'issue-1', author: 'author', body: 'Conversation' }),
      expect.objectContaining({ id: 'review-2', author: 'Unknown', body: '' })
    ]));
  });
  it('collects multiple pages and warns when the 1,000 item cap is reached', async () => {
    const pr = prPath('github');
    mocks.responses.set(`${pr}/files`, (path: string) => Array.from({ length: 100 }, (_, i) => ({ filename: `${path}-${i}`, patch, status: 'modified' })));
    const detail = await getPullReview('/repo', target(), credentials);
    expect(detail.files).toHaveLength(1000);
    expect(detail.warnings).toContain('Only the first 1,000 items from files are displayed. Open the provider for the full list.');
    expect(mocks.request.mock.calls.filter(call => call[2].startsWith(`${pr}/files`))).toHaveLength(10);
  });
});

describe('GitLab review details and capability discovery', () => {
  it('maps diff states, positioned discussions, approvals, and the newest head pipeline', async () => {
    const { pr } = setup('gitlab');
    mocks.responses.set('/api/graphql', { data: { __type: { fields: [{ name: 'mergeRequestRequestChanges' }] } } });
    mocks.responses.set(`${pr}/diffs`, [
      { new_path: 'a', old_path: 'a', deleted_file: true, diff: patch }, { new_path: 'b', old_path: 'b', new_file: true, diff: patch },
      { new_path: 'c', old_path: 'oldc', renamed_file: true, diff: patch, too_large: true }, { new_path: 'd', old_path: 'd', diff: patch, collapsed: true },
      { new_path: 'e', old_path: 'e' }
    ]);
    mocks.responses.set(`${pr}/discussions`, [{ id: 'thread', notes: [
      { id: 1, system: true }, { id: 2, author: { username: 'dev' }, body: 'new', position: { new_path: 'a', new_line: 6 }, resolvable: true, resolved: true, created_at: '2026' },
      { id: 3, position: { new_path: 'b', old_line: 3 } }
    ] }, { id: 'empty' }]);
    mocks.responses.set(`${pr}/approvals`, { approved_by: [{ user: { id: 4, username: 'approver' } }] });
    mocks.responses.set(`${pr}/pipelines`, [{ id: 1, sha: 'head' }, { id: 3, sha: 'head', status: 'success', web_url: '/pipeline' }, { id: 4, sha: 'different-head' }]);
    mocks.responses.set(`${root}/pipelines/3/jobs`, [{ name: 'Unit tests', status: 'success', web_url: '/job' }]);
    const detail = await getPullReview('/repo', target('gitlab'), credentials);
    expect(detail).toMatchObject({ head: 'head', base: 'base', start: 'start', description: 'Description', changeRequestMode: 'native' });
    expect(detail.files.map(f => f.status)).toEqual(['deleted', 'added', 'renamed', 'modified', 'modified']);
    expect(detail.files.map(f => !!f.unavailable)).toEqual([false, false, true, true, true]);
    expect(detail.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '2', threadId: 'thread', author: 'dev', path: 'a', line: 6, side: 'new', resolved: true }),
      expect.objectContaining({ id: '3', author: 'Unknown', side: 'old', resolved: undefined, body: '' }),
      expect.objectContaining({ id: 'approval-4', state: 'APPROVED' })
    ]));
    expect(detail.checks).toEqual([{ name: 'Pipeline #3', state: 'success', url: '/pipeline' }, { name: 'Unit tests', state: 'success', url: '/job' }]);
  });
  it('falls back to discussion mode when capability schema is missing or unavailable', async () => {
    const { pr } = setup('gitlab');
    mocks.responses.set(pr, { sha: 'head' });
    mocks.responses.set('/api/graphql', { data: null });
    const detail = await getPullReview('/repo', target('gitlab'), credentials);
    expect(detail).toMatchObject({ head: 'head', base: '', start: '', description: '', changeRequestMode: 'discussion', checks: [] });
    expect(detail.warnings).toEqual(expect.arrayContaining([expect.stringContaining('does not set a review-blocking state')]));
    mocks.responses.set('/api/graphql', { errors: [{ message: 'Graph not allowed' }, { message: 'denied' }] });
    expect((await getPullReview('/repo', target('gitlab'), credentials)).warnings).toContain('GitLab review capabilities: Graph not allowed; denied');
  });
  it('supports empty head metadata and pipelines with unknown status', async () => {
    const { pr } = setup('gitlab');
    mocks.responses.set(pr, {});
    mocks.responses.set(`${pr}/pipelines`, [{ id: 1, sha: '' }]);
    const detail = await getPullReview('/repo', target('gitlab'), credentials);
    expect(detail.head).toBe('');
    expect(detail.checks).toContainEqual({ name: 'Pipeline #1', state: 'unknown', url: undefined });
  });
});

describe('Bitbucket review details', () => {
  it('matches patches to diffstat paths, excludes deleted comments, and includes participant reviews', async () => {
    const { pr, info } = setup('bitbucket');
    (info as any).participants = [{ user: { uuid: 'a', display_name: 'Approver' }, approved: true }, { user: { uuid: 'b', display_name: 'Reviewer' }, state: 'changes_requested' }, { user: { uuid: 'c' } }];
    mocks.responses.set(`${pr}/diffstat`, { values: [{ new: { path: 'a' }, old: { path: 'olda' }, status: 'renamed' }, { old: { path: 'gone' }, status: 'removed' }, { new: { path: 'binary' }, status: 'modified' }] });
    mocks.responses.set(`${pr}/diff`, `diff --git a/olda b/a\n--- a/olda\n+++ b/a\n${patch}\ndiff --git a/gone b/gone\n--- a/gone\n+++ /dev/null\n${patch}`);
    mocks.responses.set(`${pr}/comments`, { values: [{ id: 1, user: { display_name: 'dev' }, content: { raw: 'new line' }, inline: { path: 'a', to: 6 }, created_on: '2026' }, { id: 2, inline: { path: 'gone', from: 3 } }, { id: 3, deleted: true }] });
    mocks.responses.set(`${pr}/statuses`, { values: [{ name: 'Build', state: 'SUCCESSFUL', url: '/build' }, { key: 'tests', state: 'INPROGRESS' }] });
    const detail = await getPullReview('/repo', target('bitbucket'), credentials);
    expect(detail.files.map(f => [f.path, f.oldPath, f.unavailable])).toEqual([['a', 'olda', false], ['gone', 'gone', false], ['binary', 'binary', true]]);
    expect(detail.comments.map(c => c.id)).toEqual(['2', 'participant-a', 'participant-b', '1']);
    expect(detail.comments.find(c => c.id === '2')).toMatchObject({ author: 'Unknown', body: '', line: 3, side: 'old' });
    expect(detail.comments.find(c => c.id === 'participant-a')?.state).toBe('APPROVED');
    expect(detail.checks.map(c => c.name)).toEqual(['Build', 'tests']);
  });
  it('stops value pagination when no next page exists even if exactly100rows returned', async () => {
    const { pr, info } = setup('bitbucket'); delete (info as any).description;
    mocks.responses.set(`${pr}/comments`, { values: Array.from({ length: 100 }, (_, id) => ({ id })) });
    const detail = await getPullReview('/repo', target('bitbucket'), credentials);
    expect(detail.description).toBe(''); expect(detail.comments).toHaveLength(100);
    expect(mocks.request.mock.calls.filter(call => call[2].startsWith(`${pr}/comments`))).toHaveLength(1);
  });
  it('follows paginated value lists with a next link until the finalpage', async () => {
    const { pr } = setup('bitbucket');
    mocks.responses.set(`${pr}/comments`, (path: string) => path.endsWith('page=1') ? { values: Array.from({ length: 100 }, (_, id) => ({ id })), next: '/next' } : {});
    const detail = await getPullReview('/repo', target('bitbucket'), credentials);
    expect(detail.comments).toHaveLength(100);
    expect(mocks.request.mock.calls.filter(call => call[2].startsWith(`${pr}/comments`))).toHaveLength(2);
  });
});

describe('review submission validation', () => {
  it.each([
    [{ action: 'invalid' }, 'Invalid review action'], [{ body: '' }, 'Enter a review message'],
    [{ body: 'x'.repeat(60_001) }, 'under 60,000 characters'],
    [{ action: 'approve', inline: { path: 'a', line: 1, side: 'new' } }, 'Submit line comments separately'],
    [{ action: 'approve', replyTo: { id: '1' } }, 'Submit line comments separately'],
    [{ action: 'approve', body: '', inline: { path: 'a', line: 1, side: 'new' } }, 'Enter a review message']
  ])('rejects invalid submission case %# before contacting a provider', async (options, error) => {
    await expect(submitPullReview('/repo', submission('github', options as Partial<PullReviewSubmission>), credentials)).rejects.toThrow(error);
    expect(mocks.hosted).not.toHaveBeenCalled();
  });
  it.each(['github', 'gitlab', 'bitbucket'] as const)('rejects stale or missing heads on %s', async provider => {
    setup(provider);
    await expect(submitPullReview('/repo', submission(provider, { head: 'stale' }), credentials)).rejects.toThrow('draft has been kept');
    await expect(submitPullReview('/repo', submission(provider, { head: '' }), credentials)).rejects.toThrow('draft has been kept');
    expect(posts()).toEqual([]);
  });
  it.each([{ line: 200, side: 'new' }, { line: 6.5, side: 'new' }, { line: 6, side: 'invalid' }])('rejects lines absent from the displayed provider patch: %j', async inline => {
    mocks.responses.set(`${prPath('github')}/files`, [{ filename: 'a', patch }]);
    await expect(submitPullReview('/repo', submission('github', { inline: { path: 'a', ...inline } as PullReviewSubmission['inline'] }), credentials)).rejects.toThrow('Choose a displayed line');
  });
  it('rejects missing or unavailable file patches', async () => {
    mocks.responses.set(`${prPath('github')}/files`, [{ filename: 'a' }]);
    await expect(submitPullReview('/repo', submission('github', { inline: { path: 'a', line: 6, side: 'new' } }), credentials)).rejects.toThrow('Choose a displayed line');
  });
  it('rechecks the provider head before posting an inline comment', async () => {
    let calls = 0;
    mocks.responses.set(prPath('github'), () => ({ head: { sha: ++calls === 1 ? 'head' : 'changed' }, base: { sha: 'base' } }));
    await expect(submitPullReview('/repo', submission('github', { inline: { path: 'a', line: 6, side: 'new' } }), credentials)).rejects.toThrow('Refresh before commenting');
  });
});

describe('GitHub review submission payloads', () => {
  it.each([['comment', 'COMMENT'], ['approve', 'APPROVE'], ['request-changes', 'REQUEST_CHANGES']] as const)('posts %s reviews to the selected request head', async (action, event) => {
    expect(await submitPullReview('/repo', submission('github', { action }), credentials)).toEqual({ ok: true, message: action === 'approve' ? 'Approval submitted.' : action === 'comment' ? 'Comment posted.' : 'Change request submitted.' });
    expect(posts()).toEqual([{ path: `${prPath('github')}/reviews`, payload: { body: 'Review message', commit_id: 'head', event } }]);
  });
  it.each([['old', 4, 'LEFT'], ['new', 6, 'RIGHT']] as const)('posts inline comments on the %s side', async (side, line, providerSide) => {
    mocks.responses.set(`${prPath('github')}/files`, [{ filename: 'a', patch }]);
    await submitPullReview('/repo', submission('github', { inline: { path: 'a', line, side } }), credentials);
    expect(posts()).toEqual([{ path: `${prPath('github')}/comments`, payload: { body: 'Review message', commit_id: 'head', path: 'a', line, side: providerSide } }]);
  });
  it('supports numeric inline thread replies and rejects conversation ids', async () => {
    await submitPullReview('/repo', submission('github', { replyTo: { id: '12' } }), credentials);
    expect(posts()[0]).toEqual({ path: `${prPath('github')}/comments/12/replies`, payload: { body: 'Review message' } });
    await expect(submitPullReview('/repo', submission('github', { replyTo: { id: 'issue-12' } }), credentials)).rejects.toThrow('Only inline comment threads');
  });
});

describe('GitLab review submission payloads and partial success', () => {
  it('posts normal discussions and replies using validated discussion IDs', async () => {
    setup('gitlab');
    await submitPullReview('/repo', submission('gitlab'), credentials);
    expect(posts()[0]).toEqual({ path: `${prPath('gitlab')}/discussions`, payload: { body: 'Review message' } });
    await submitPullReview('/repo', submission('gitlab', { replyTo: { id: '1', threadId: 'aB123' } }), credentials);
    expect(posts()[1].path).toBe(`${prPath('gitlab')}/discussions/aB123/notes`);
    await expect(submitPullReview('/repo', submission('gitlab', { replyTo: { id: '1' } }), credentials)).rejects.toThrow('Choose a discussion');
    await expect(submitPullReview('/repo', submission('gitlab', { replyTo: { id: '1', threadId: '../bad' } }), credentials)).rejects.toThrow('Choose a discussion');
  });
  it.each(['', 'Approved'])('approves the reviewed head with optional companion comment %j', async body => {
    setup('gitlab');
    expect(await submitPullReview('/repo', submission('gitlab', { action: 'approve', body }), credentials)).toEqual({ ok: true, message: 'Approval submitted.' });
    expect(posts()[0]).toEqual({ path: `${prPath('gitlab')}/approve`, payload: { sha: 'head' } });
    expect(posts()).toHaveLength(body ? 2 : 1);
  });
  it('reports a submitted approval when its companion comment fails', async () => {
    setup('gitlab'); mocks.responses.set(`POST ${prPath('gitlab')}/discussions`, new Error('comment denied'));
    expect((await submitPullReview('/repo', submission('gitlab', { action: 'approve' }), credentials)).message).toContain('Approval submitted, but the accompanying comment failed');
  });
  it.each([['old', 4, { old_line: 4 }], ['new', 6, { new_line: 6 }], ['old', 3, { old_line: 3, new_line: 5 }]] as const)('anchors %s-side comments to provider diff refs and both context coordinates', async (side, line, position) => {
    const { pr } = setup('gitlab');
    mocks.responses.set(`${pr}/diffs`, [{ new_path: 'a', old_path: 'olda', diff: patch }]);
    await submitPullReview('/repo', submission('gitlab', { inline: { path: 'a', line, side } }), credentials);
    expect(posts()).toContainEqual({ path: `${pr}/discussions`, payload: { body: 'Review message', position: { position_type: 'text', base_sha: 'base', head_sha: 'head', start_sha: 'start', old_path: 'olda', new_path: 'a', ...position } } });
  });
  it('submits native change requests and a companion discussion', async () => {
    setup('gitlab'); mocks.responses.set('/api/graphql', { data: { mergeRequestRequestChanges: { errors: [] } } });
    expect(await submitPullReview('/repo', submission('gitlab', { action: 'request-changes' }), credentials)).toEqual({ ok: true, message: 'Change request submitted.' });
    expect(posts()[0]).toMatchObject({ path: '/api/graphql', payload: { variables: { input: { projectPath: 'owner/repo', iid: '7' } } } });
    expect(posts()[1]).toEqual({ path: `${prPath('gitlab')}/discussions`, payload: { body: 'Review message' } });
  });
  it.each([
    [{ data: {} }, 'did not confirm the change request'],
    [{ data: { mergeRequestRequestChanges: { errors: ['not allowed', 'denied'] } } }, 'not allowed; denied']
  ])('rejects unconfirmed or unsuccessful native change requests', async (payload, message) => {
    setup('gitlab'); mocks.responses.set('/api/graphql', payload);
    await expect(submitPullReview('/repo', submission('gitlab', { action: 'request-changes' }), credentials)).rejects.toThrow(message);
  });
  it('reports native change request success even if the discussion fails', async () => {
    setup('gitlab'); mocks.responses.set('/api/graphql', { data: { mergeRequestRequestChanges: {} } });
    mocks.responses.set(`POST ${prPath('gitlab')}/discussions`, new Error('discussion denied'));
    expect((await submitPullReview('/repo', submission('gitlab', { action: 'request-changes' }), credentials)).message).toContain('Change request submitted, but the accompanying comment failed');
  });
  it('posts a discussion and withdraws approval in fallback change-request mode', async () => {
    setup('gitlab');
    expect(await submitPullReview('/repo', submission('gitlab', { action: 'request-changes', changeRequestMode: 'discussion' }), credentials)).toEqual({ ok: true, message: 'Change request submitted.' });
    expect(posts()).toEqual([{ path: `${prPath('gitlab')}/discussions`, payload: { body: '**Changes requested**\n\nReview message' } }, { path: `${prPath('gitlab')}/unapprove`, payload: undefined }]);
    mocks.responses.set(`POST ${prPath('gitlab')}/unapprove`, new Error('no approval access'));
    expect((await submitPullReview('/repo', submission('gitlab', { action: 'request-changes', changeRequestMode: 'discussion' }), credentials)).message).toContain('approval could not be withdrawn');
  });
  it('uses legacy GitLab SHA when diff refs are unavailable', async () => {
    const { pr } = setup('gitlab'); mocks.responses.set(pr, { sha: 'head' });
    expect((await submitPullReview('/repo', submission('gitlab', { action: 'approve', body: '' }), credentials)).ok).toBe(true);
  });
});

describe('Bitbucket review submission payloads', () => {
  it('posts comments and numeric reply parents', async () => {
    setup('bitbucket');
    await submitPullReview('/repo', submission('bitbucket'), credentials);
    await submitPullReview('/repo', submission('bitbucket', { replyTo: { id: '12' } }), credentials);
    expect(posts()).toEqual([{ path: `${prPath('bitbucket')}/comments`, payload: { content: { raw: 'Review message' } } }, { path: `${prPath('bitbucket')}/comments`, payload: { content: { raw: 'Review message' }, parent: { id: 12 } } }]);
    await expect(submitPullReview('/repo', submission('bitbucket', { replyTo: { id: 'bad' } }), credentials)).rejects.toThrow('Choose a comment');
  });
  it.each([['old', 4, 'from'], ['new', 6, 'to']] as const)('posts %s-side comments using Bitbucket coordinates', async (side, line, key) => {
    const { pr } = setup('bitbucket');
    mocks.responses.set(`${pr}/diffstat`, [{ new: { path: 'a' }, status: 'modified' }]);
    mocks.responses.set(`${pr}/diff`, `diff --git a/a b/a\n+++ b/a\n${patch}`);
    await submitPullReview('/repo', submission('bitbucket', { inline: { path: 'a', line, side } }), credentials);
    expect(posts()[0]).toEqual({ path: `${pr}/comments`, payload: { content: { raw: 'Review message' }, inline: { path: 'a', [key]: line } } });
  });
  it.each([['approve', 'Approval submitted.'], ['request-changes', 'Change request submitted.']] as const)('posts %s state before optional discussion', async (action, message) => {
    setup('bitbucket');
    expect(await submitPullReview('/repo', submission('bitbucket', { action }), credentials)).toEqual({ ok: true, message });
    expect(posts()).toEqual([{ path: `${prPath('bitbucket')}/${action}`, payload: undefined }, { path: `${prPath('bitbucket')}/comments`, payload: { content: { raw: 'Review message' } } }]);
  });
  it('allows approval without a message and reports a failed companion comment', async () => {
    setup('bitbucket');
    expect((await submitPullReview('/repo', submission('bitbucket', { action: 'approve', body: '' }), credentials)).message).toBe('Approval submitted.');
    expect(posts()).toHaveLength(1);
    mocks.responses.set(`POST ${prPath('bitbucket')}/comments`, new Error('denied'));
    expect((await submitPullReview('/repo', submission('bitbucket', { action: 'approve' }), credentials)).message).toContain('Review state submitted, but the accompanying comment failed');
  });
});
