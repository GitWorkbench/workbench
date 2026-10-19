// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostedPullRequest, PullReviewDetail, PullReviewTarget } from '../../src/shared/types';

const mocks = vi.hoisted(() => ({ app: { closePullRequestsModal: vi.fn(), openRepo: vi.fn() }, api: Object.fromEntries(['getPullReview', 'submitPullReview', 'selectDirectory', 'openPullRequestWorktree'].map(name => [name, vi.fn()])) }));
vi.mock('../../src/renderer/store', () => ({ useApp: { getState: () => mocks.app } }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api }));
import { PullRequestReview } from '../../src/renderer/components/PullRequests/PullRequestReview';

const request: HostedPullRequest = { id: '12', title: 'Improve workflow', state: 'open', draft: false, author: 'alice', sourceBranch: 'feature', targetBranch: 'main', url: 'https://github.com/org/repo/pull/12' };
const target: PullReviewTarget = { provider: 'github', remoteName: 'origin', requestId: '12' };
const detail = (patch: Partial<PullReviewDetail> = {}): PullReviewDetail => ({ head: 'abcdef1234567890', base: 'base', start: 'start', description: 'Review description', files: [{ path: 'src/file.ts', oldPath: 'src/file.ts', status: 'modified', patch: '@@ -1,2 +1,2 @@\n context\n-before\n+after' }], comments: [], checks: [], warnings: ['Review permissions may be limited'], changeRequestMode: 'native', ...patch });
beforeEach(() => {
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.app.closePullRequestsModal.mockReset(); mocks.app.openRepo.mockReset();
  mocks.api.getPullReview.mockResolvedValue(detail());
  mocks.api.submitPullReview.mockResolvedValue({ message: 'Review posted' });
  mocks.api.selectDirectory.mockResolvedValue({ ok: true, path: '/reviews/' });
  mocks.api.openPullRequestWorktree.mockResolvedValue({ path: '/reviews/pr-12' });
});
const ready = async () => screen.findByRole('button', { name: 'Files (1)' });
function fillMessage(value: string) { fireEvent.change(screen.getByRole('textbox', { name: 'Review message' }), { target: { value } }); }

describe('pull request review loading and navigation', () => {
  it('loads diff files, renders side-by-side line targets and warns about review limitations', async () => {
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />);
    expect(screen.getByText('Loading review…')).toBeVisible();
    await ready();
    expect(mocks.api.getPullReview).toHaveBeenCalledWith(target);
    expect(screen.getByRole('dialog', { name: 'Review pull request' })).toBeVisible();
    expect(screen.getByText('Review permissions may be limited')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Provider' })).toHaveAttribute('href', request.url);
    expect(screen.getAllByTitle('Comment on old line').some(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });
  it('reports loading failures, refreshes to retry and tolerates a review with no files', async () => {
    mocks.api.getPullReview.mockRejectedValueOnce(new Error('Cannot fetch review')).mockResolvedValueOnce(detail({ files: [] }));
    render(<PullRequestReview request={{ ...request, url: 'javascript:alert(1)' }} target={target} onClose={vi.fn()} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Error: Cannot fetch review');
    expect(screen.getByText('Review could not be loaded. Refresh to retry.')).toBeVisible();
    expect(screen.getByText('Provider').closest('a')).not.toHaveAttribute('href');
    fireEvent.submit(screen.getByRole('textbox', { name: 'Review message' }).closest('form')!);
    expect(mocks.api.submitPullReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Refresh review'));
    await screen.findByText('No changed files');
    expect(screen.getByText('No text patch is available. Review this file on the provider.')).toBeVisible();
  });
  it('switches files and shows unavailable binary content', async () => {
    mocks.api.getPullReview.mockResolvedValue(detail({ files: [...detail().files, { path: 'binary.png', oldPath: 'binary.png', status: 'added', patch: '', unavailable: true }] }));
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />);
    await screen.findByRole('button', { name: 'Files (2)' });
    fireEvent.click(screen.getByTitle('binary.png'));
    expect(screen.getByText('No text patch is available. Review this file on the provider.')).toBeVisible();
    fireEvent.click(screen.getByTitle('Refresh review'));
    await waitFor(() => expect(mocks.api.getPullReview).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'binary.png' })).toBeVisible();
  });
  it('shows CI success/failure/pending statuses with only safe URLs and an empty state', async () => {
    mocks.api.getPullReview.mockResolvedValue(detail({ checks: [{ name: 'Unit', state: 'success', url: 'https://ci.example.test/1' }, { name: 'Integration', state: 'failed', url: 'javascript:bad()' }, { name: 'Build', state: 'pending' }] }));
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'CI (3)' }));
    expect(screen.getByText('success')).toHaveClass('text-add'); expect(screen.getByText('failed')).toHaveClass('text-del'); expect(screen.getByText('pending')).toHaveClass('text-dim');
    expect(document.querySelectorAll('a[href="javascript:bad()"]')).toHaveLength(0);
    expect(document.querySelector('a[href="https://ci.example.test/1"]')).toBeInTheDocument();
    mocks.api.getPullReview.mockResolvedValue(detail());
    fireEvent.click(screen.getByTitle('Refresh review')); await screen.findByRole('button', { name: 'CI (0)' });
    expect(screen.getByText('No CI results were returned for this revision. Check the warnings for missing permissions.')).toBeVisible();
  });
  it('does not update state from a response received after unmount', async () => {
    let resolve!: (value: PullReviewDetail) => void;
    mocks.api.getPullReview.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { unmount } = render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); unmount();
    await act(async () => resolve(detail()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('confirms unpublished messages on Escape or returning to requests', async () => {
    const close = vi.fn(), confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PullRequestReview request={request} target={target} onClose={close} />); await ready();
    fireEvent.keyDown(window, { key: 'x' }); expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
    fillMessage('Draft'); fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Requests' })); expect(close).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true); fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.click(screen.getByRole('button', { name: 'Requests' }));
    expect(close).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledWith('Discard your unpublished review message?');
  });
});

describe('review submission and inline replies', () => {
  it.each(['comment', 'approve', 'request-changes'] as const)('submits %s bound to the reviewed head', async action => {
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); await ready();
    fireEvent.change(screen.getByRole('combobox', { name: 'Review action' }), { target: { value: action } });
    if (action !== 'approve') fillMessage('Please review this');
    fireEvent.click(screen.getByRole('button', { name: action === 'approve' ? 'Submit approval' : action === 'request-changes' ? 'Submit change request' : 'Post comment' }));
    await waitFor(() => expect(mocks.api.submitPullReview).toHaveBeenCalledWith({ ...target, head: detail().head, body: action === 'approve' ? '' : 'Please review this', action, changeRequestMode: 'native', inline: undefined, replyTo: undefined }));
    await screen.findByText('Review posted'); expect(screen.getByRole('textbox', { name: 'Review message' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Review action' })).toHaveValue('comment');
  });
  it.each(['old', 'new'] as const)('targets an %s diff line and clears the target on demand', async side => {
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); await ready();
    const line = screen.getAllByTitle(`Comment on ${side} line`).find(button => !(button as HTMLButtonElement).disabled)!;
    fireEvent.click(line);
    expect(screen.getByText(`Comment on src/file.ts:1 (${side})`)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Review action' })).toBeDisabled();
    fireEvent.click(screen.getByTitle('Clear comment target')); expect(screen.getByRole('combobox', { name: 'Review action' })).toBeEnabled();
    fireEvent.click(line); fillMessage('Inline review'); fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(mocks.api.submitPullReview).toHaveBeenCalledWith(expect.objectContaining({ inline: { path: 'src/file.ts', side, line: 1 }, replyTo: undefined })));
  });
  it.each(['github', 'gitlab'] as const)('replies to supported %s conversation threads and preserves resolved status metadata', async provider => {
    mocks.api.getPullReview.mockResolvedValue(detail({ comments: [
      { id: '1', threadId: 'thread', author: 'Alice', body: 'Please improve this', path: 'src/file.ts', line: 1, side: 'new', resolved: false, createdAt: '2026-10-19T10:00:00Z' },
      { id: '2', author: 'Bob', body: 'Fixed', resolved: true }, { id: 'summary', author: 'Carol', body: 'Approved', state: 'APPROVED' }
    ], changeRequestMode: 'discussion' }));
    render(<PullRequestReview request={request} target={{ ...target, provider }} onClose={vi.fn()} />); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Conversation (3)' }));
    expect(screen.getByText('Review description')).toBeVisible(); expect(screen.getByText('Unresolved')).toBeVisible(); expect(screen.getByText('Resolved')).toBeVisible(); expect(screen.getByText('APPROVED')).toBeVisible();
    fireEvent.click(within(screen.getByText('Please improve this').closest('article')!).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Reply to comment #1')).toBeVisible();
    fillMessage('I will update it'); fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(mocks.api.submitPullReview).toHaveBeenCalledWith(expect.objectContaining({ replyTo: { id: '1', threadId: 'thread' }, inline: undefined, changeRequestMode: 'discussion' })));
    expect(screen.getByRole('option', { name: 'Request changes (discussion)' })).toBeInTheDocument();
  });
  it('preserves the draft after submission failure and blocks closing/submitting while pending', async () => {
    let reject!: (reason: unknown) => void;
    mocks.api.submitPullReview.mockImplementation(() => new Promise((_resolve, no) => { reject = no; }));
    const close = vi.fn(); render(<PullRequestReview request={request} target={target} onClose={close} />); await ready();
    fillMessage('Keep this draft'); fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(screen.getByRole('textbox', { name: 'Review message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Requests' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('textbox', { name: 'Review message' }).closest('form')!); expect(mocks.api.submitPullReview).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('Permission denied')));
    expect(screen.getByRole('status')).toHaveTextContent('Error: Permission denied'); expect(screen.getByRole('textbox', { name: 'Review message' })).toHaveValue('Keep this draft');
  });
  it('clears stale inline targets when refreshing a newer head while retaining a review draft', async () => {
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); await ready();
    fireEvent.click(screen.getAllByTitle('Comment on new line').find(button => !(button as HTMLButtonElement).disabled)!);
    fillMessage('Review draft'); mocks.api.getPullReview.mockResolvedValue(detail({ head: 'new-head' }));
    fireEvent.click(screen.getByTitle('Refresh review'));
    await screen.findByText('New commits arrived. Review the updated diff before submitting; your message is kept.');
    expect(screen.queryByTitle('Clear comment target')).not.toBeInTheDocument(); expect(screen.getByRole('textbox', { name: 'Review message' })).toHaveValue('Review draft');
  });
});

describe('review worktrees', () => {
  async function openForm() { fireEvent.click(screen.getByRole('button', { name: 'Open in worktree…' })); }
  it('selects a parent directory, validates folder names, creates a separate checkout and opens it on request', async () => {
    const close = vi.fn(); render(<PullRequestReview request={request} target={target} onClose={close} />); await ready(); await openForm();
    expect(screen.getByRole('button', { name: 'Create worktree' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose parent folder…' })); await screen.findByText('/reviews/');
    const folder = screen.getByRole('textbox', { name: 'New folder' });
    for (const invalid of ['', '.', '..', 'sub/folder', 'sub\\folder']) {
      fireEvent.change(folder, { target: { value: invalid } }); fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }));
      expect(screen.getByRole('status')).toHaveTextContent('Select a parent folder and enter a new folder name without slashes.');
    }
    fireEvent.change(folder, { target: { value: 'pr-12' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New local branch' }), { target: { value: 'review/test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }));
    await screen.findByText('Review worktree created. Your current checkout is unchanged. LFS assets can be downloaded with the LFS manager.');
    expect(mocks.api.openPullRequestWorktree).toHaveBeenCalledWith({ ...target, head: detail().head, branch: 'review/test', directory: '/reviews/pr-12' });
    expect(folder).toBeDisabled(); expect(screen.getByRole('button', { name: 'Choose parent folder…' })).toBeDisabled();
    fillMessage('Draft'); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open review workspace' })); expect(close).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Open review workspace' }));
    expect(close).toHaveBeenCalledOnce(); expect(mocks.app.closePullRequestsModal).toHaveBeenCalledOnce(); expect(mocks.app.openRepo).toHaveBeenCalledWith('/reviews/pr-12');
  });
  it('reports directory picker/worktree errors and supports canceling the directory picker', async () => {
    mocks.api.selectDirectory.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('Picker unavailable')).mockResolvedValueOnce({ ok: true, path: '/reviews' });
    mocks.api.openPullRequestWorktree.mockRejectedValue(new Error('Branch already exists'));
    render(<PullRequestReview request={request} target={target} onClose={vi.fn()} />); await ready(); await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Choose parent folder…' })); await waitFor(() => expect(mocks.api.selectDirectory).toHaveBeenCalledOnce());
    expect(screen.getByText('No folder selected')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Choose parent folder…' })); await screen.findByText('Error: Picker unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Choose parent folder…' })); await screen.findByText('/reviews');
    fireEvent.click(screen.getByRole('button', { name: 'Create worktree' })); await screen.findByText('Error: Branch already exists');
    expect(screen.getByRole('button', { name: 'Create worktree' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open in worktree…' })); expect(screen.queryByRole('textbox', { name: 'New folder' })).not.toBeInTheDocument();
  });
});
