// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ app: {} as Record<string, any>, api: { selectDirectory: vi.fn(), initRepo: vi.fn(), generateChangelog: vi.fn() } }));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: any) => any) => selector(mocks.app) }));
vi.mock('../../src/renderer/lib/api', () => ({ api: mocks.api, unwrap: async (promise: Promise<any>) => { const res = await promise; if (res && '__error' in res) throw new Error(res.__error); return res; } }));
import { CreateRepoModal } from '../../src/renderer/components/Repository/CreateRepoModal';
import { ChangelogModal } from '../../src/renderer/components/Changelog/ChangelogModal';

const changelog = { totalCommits: 1, fromRef: 'v1', toRef: 'HEAD', categories: [{ title: 'Features', items: [{ hash: 'abcdef', shortHash: 'abc', message: 'Add a feature', author: 'Alice' }] }], markdown: '# Release\n\n- Add a feature' };
beforeEach(() => {
  Object.assign(mocks.app, { createRepoModalOpen: true, closeCreateRepoModal: vi.fn(), openRepo: vi.fn(), notify: vi.fn(), changelogModalOpen: true, closeChangelogModal: vi.fn(), tags: [] });
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.selectDirectory.mockResolvedValue({ ok: true, path: '/work/new-repo' });
  mocks.api.initRepo.mockResolvedValue({ ok: true, repo: { path: '/work/new-repo', name: 'new-repo' } });
  mocks.api.generateChangelog.mockResolvedValue(changelog);
});

describe('CreateRepoModal', () => {
  it('is hidden when closed and closes using Escape, cancel or backdrop while preserving inner clicks', () => {
    mocks.app.createRepoModalOpen = false;
    const { container, rerender } = render(<CreateRepoModal />); expect(container).toBeEmptyDOMElement();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(mocks.app.closeCreateRepoModal).not.toHaveBeenCalled();
    mocks.app.createRepoModalOpen = true; rerender(<CreateRepoModal />);
    fireEvent.click(screen.getByRole('heading', { name: 'Create / Initialize Repository' })); expect(mocks.app.closeCreateRepoModal).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'a' }); fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByTitle('Close (Esc)')); fireEvent.click(container.firstChild!);
    expect(mocks.app.closeCreateRepoModal).toHaveBeenCalledTimes(4);
  });
  it('validates a missing path and browses to an existing folder before initialization', async () => {
    const { container } = render(<CreateRepoModal />);
    expect(screen.getByRole('button', { name: 'Create Repository' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByText('Please specify a directory path for the repository.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(screen.getByPlaceholderText('/path/to/my-new-project')).toHaveValue('/work/new-repo'));
    expect(screen.queryByText('Please specify a directory path for the repository.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }));
    await waitFor(() => expect(mocks.api.initRepo).toHaveBeenCalledWith({ path: '/work/new-repo', initialBranch: 'main', createReadme: true, gitignoreTemplate: 'Node', initialCommitMessage: 'Initial commit' }));
    await waitFor(() => expect(mocks.app.openRepo).toHaveBeenCalledWith('/work/new-repo'));
    expect(mocks.app.notify).toHaveBeenCalledWith('success', 'Repository "new-repo" initialized successfully!');
    expect(mocks.app.closeCreateRepoModal).toHaveBeenCalledOnce();
  });
  it('trims custom values, supports no readme/gitignore/commit and handles root directory naming', async () => {
    render(<CreateRepoModal />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/my-new-project'), { target: { value: ' / ' } });
    fireEvent.change(screen.getByPlaceholderText('main'), { target: { value: ' develop ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'None' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initialize repository with README.md' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create initial commit' }));
    expect(screen.queryByPlaceholderText('Initial commit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }));
    await waitFor(() => expect(mocks.api.initRepo).toHaveBeenCalledWith({ path: '/', initialBranch: 'develop', createReadme: false, gitignoreTemplate: undefined, initialCommitMessage: undefined }));
  });
  it('falls back to main and Initial commit for whitespace values and supports alternate ignore templates', async () => {
    render(<CreateRepoModal />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/my-new-project'), { target: { value: '/' } });
    fireEvent.change(screen.getByPlaceholderText('main'), { target: { value: '  ' } });
    fireEvent.change(screen.getByPlaceholderText('Initial commit'), { target: { value: '  ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Python' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }));
    await waitFor(() => expect(mocks.api.initRepo).toHaveBeenCalledWith(expect.objectContaining({ initialBranch: 'main', initialCommitMessage: 'Initial commit', gitignoreTemplate: 'Python' })));
  });
  it.each([{ ok: false, error: 'Git identity required' }, { ok: false }, { __error: 'Cannot write directory' }, new Error('Disk full')])('reports repository initialization failure %s', async result => {
    if (result instanceof Error) mocks.api.initRepo.mockRejectedValue(result); else mocks.api.initRepo.mockResolvedValue(result);
    render(<CreateRepoModal />);
    fireEvent.change(screen.getByPlaceholderText('/path/to/my-new-project'), { target: { value: '/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }));
    const error = result instanceof Error ? 'Error: Disk full' : '__error' in result ? 'Error: Cannot write directory' : result.error || 'Failed to initialize repository.';
    expect(await screen.findByText(error)).toBeVisible();
    expect(mocks.app.openRepo).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Create Repository' })).toBeEnabled();
  });
  it('handles picker cancellation and picker failure without changing the path', async () => {
    mocks.api.selectDirectory.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('Picker unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CreateRepoModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' })); await waitFor(() => expect(mocks.api.selectDirectory).toHaveBeenCalledOnce());
    expect(screen.getByPlaceholderText('/path/to/my-new-project')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' })); await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to select directory', expect.any(Error)));
  });
  it('disables form controls during repository creation', async () => {
    let resolve!: (value: any) => void;
    mocks.api.initRepo.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<CreateRepoModal />); fireEvent.change(screen.getByPlaceholderText('/path/to/my-new-project'), { target: { value: '/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    for (const input of screen.getAllByRole('checkbox')) expect(input).toBeDisabled();
    await act(async () => resolve({ ok: false }));
  });
});

describe('ChangelogModal', () => {
  it.each([[[]], [[{ name: 'v1' }]], [[{ name: 'v2' }, { name: 'v1' }]]])('selects an appropriate default tag range from %s', tags => {
    mocks.app.tags = tags;
    const { rerender, container } = render(<ChangelogModal />);
    expect(screen.getByPlaceholderText('v1.0.0, commit hash, or blank for all')).toHaveValue(tags.length > 1 ? 'v1' : tags[0]?.name || '');
    expect(screen.getByPlaceholderText('HEAD or v1.1.0')).toHaveValue(tags.length > 1 ? 'v2' : 'HEAD');
    if (tags.length) { fireEvent.click(screen.getByRole('button', { name: tags[0].name })); expect(screen.getByPlaceholderText('v1.0.0, commit hash, or blank for all')).toHaveValue(tags[0].name); }
    mocks.app.changelogModalOpen = false; rerender(<ChangelogModal />); expect(container).toBeEmptyDOMElement();
  });
  it('generates categorized release notes, shows pending state, copies Markdown and resets the copy hint', async () => {
    render(<ChangelogModal />);
    fireEvent.change(screen.getByPlaceholderText('v1.0.0, commit hash, or blank for all'), { target: { value: ' v1 ' } });
    fireEvent.change(screen.getByPlaceholderText('HEAD or v1.1.0'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText('Parsing commit log and conventional commit types...')).toBeVisible();
    await screen.findByText('Summary (1 commits categorized):');
    expect(mocks.api.generateChangelog).toHaveBeenCalledWith('v1', 'HEAD');
    expect(screen.getByText('Add a feature')).toBeVisible(); expect(screen.getByText('@Alice')).toBeVisible();
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }));
    expect(writeText).toHaveBeenCalledWith(changelog.markdown); expect(screen.getByRole('button', { name: 'Copied!' })).toBeVisible();
    act(() => vi.advanceTimersByTime(2000)); expect(screen.getByRole('button', { name: 'Copy Markdown' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(mocks.app.closeChangelogModal).toHaveBeenCalledOnce();
  });
  it.each([null, { ...changelog, totalCommits: 0, markdown: '' }])('reports empty history %s and ignores empty markdown copies', async result => {
    mocks.api.generateChangelog.mockResolvedValue(result); render(<ChangelogModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('info', 'No commits found in the specified range'));
    if (result) { const writeText = vi.fn(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' })); expect(writeText).not.toHaveBeenCalled(); }
  });
  it('reports generation failures and closes using the header control', async () => {
    mocks.api.generateChangelog.mockRejectedValue(new Error('Bad revision'));
    const { container } = render(<ChangelogModal />); fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mocks.app.notify).toHaveBeenCalledWith('error', 'Failed to generate changelog: Error: Bad revision'));
    fireEvent.click(container.querySelector('button')!); expect(mocks.app.closeChangelogModal).toHaveBeenCalledOnce();
  });
});
