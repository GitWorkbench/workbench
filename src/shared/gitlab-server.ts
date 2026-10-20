import { matchHostingServer, normalizeHostingServer } from './hosting-provider';

/** A GitLab connection is scoped to one HTTPS instance, including its base path. */
export function normalizeGitLabServer(value: string): string {
  return normalizeHostingServer(value, 'GitLab');
}

export const matchGitLabServer = matchHostingServer;
