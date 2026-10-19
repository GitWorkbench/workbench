import fs from 'node:fs/promises';
import path from 'node:path';
import { RepositoryOverview, PullRequestCredential, PullRequestProvider } from '../../shared/types';
import { withGit } from './core';
import { getPullRequestContext } from './pull-requests';

export async function pinnedRepositories(configDirectory: string): Promise<string[]> {
  try {
    const data: unknown = JSON.parse(await fs.readFile(path.join(configDirectory, 'pinned-repositories.json'), 'utf8'));
    return Array.isArray(data) ? [...new Set(data.filter((p): p is string => typeof p === 'string'))].slice(0, 50) : [];
  } catch { return []; }
}

export async function pinRepository(configDirectory: string, repo: string, pinned: boolean): Promise<string[]> {
  const pins = await pinnedRepositories(configDirectory);
  const next = pins.filter(p => p !== repo);
  if (pinned) {
    if (next.length >= 50) throw new Error('You can pin up to 50 repositories. Unpin one first.');
    next.push(repo);
  }
  await fs.mkdir(configDirectory, { recursive: true });
  const file = path.join(configDirectory, 'pinned-repositories.json');
  await fs.writeFile(file + '.tmp', JSON.stringify(next, null, 2));
  await fs.rename(file + '.tmp', file);
  return next;
}

export async function repositoryOverview(repo: string, hosted: boolean, getCredential: (provider: PullRequestProvider) => PullRequestCredential | null): Promise<RepositoryOverview> {
  const result: RepositoryOverview = { path: repo, branch: '', changed: 0, staged: 0, conflicts: 0, ahead: 0, behind: 0, checkedAt: new Date().toISOString() };
  try {
    const status = await withGit(repo, git => git.status(), { timeout: { block: 15_000 } });
    Object.assign(result, { branch: status.current || 'Detached HEAD', changed: new Set(status.files.map(f => f.path)).size, staged: status.staged.length, conflicts: status.conflicted.length, ahead: status.ahead, behind: status.behind });
    if (hosted) {
      const context = await getPullRequestContext(repo, undefined, undefined, getCredential);
      if (context.provider && context.credentialConfigured && !context.error) result.requests = context.pullRequests.map(({ id, title, url }) => ({ id, title, url }));
      result.hostedMessage = context.error || (!context.credentialConfigured ? 'Configure a provider account in Settings to load requests.' : 'Loaded requests from the provider (up to 100).');
    }
  } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
  return result;
}
