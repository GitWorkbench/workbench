import { describe, expect, it } from 'vitest';
import { matchHostingServer, normalizeHostingServer, pullRequestProviders, requestLabel } from '../../src/shared/hosting-provider';
import { normalizeGitLabServer, matchGitLabServer } from '../../src/shared/gitlab-server';

describe('host terminology', () => {
  it.each(pullRequestProviders)('names %s requests', provider => {
    expect(requestLabel(provider)).toBe(provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests');
    expect(requestLabel(provider, false)).toBe(provider === 'gitlab' ? 'Merge Request' : 'Pull Request');
  });
  it('uses neutral copy before detection', () => {
    expect(requestLabel(null)).toBe('Requests');
    expect(requestLabel(undefined, false)).toBe('Request');
  });
});

describe('instance URLs and credential boundaries', () => {
  it.each(['GitLab', 'Gitea'] as const)('normalizes %s web ports and paths', provider => {
    expect(normalizeHostingServer(' https://CODE.example:8443/forge/// ', provider)).toBe('https://code.example:8443/forge');
    expect(normalizeHostingServer('https://code.example/', provider)).toBe('https://code.example');
  });
  it.each(['', 'bad url', 'http://code.example', 'file:///tmp/repo', 'https://user:pass@code.example', 'https://code.example/?token=x', 'https://code.example/#x', 'https://code.example/api/v1', 'https://code.example/forge/api/v4', 'https://code.example/forge/-/settings', 'https://code.example/%2fproject', 'https://code.example/%5cproject', 'https://code.example/%00project'])('rejects unsafe or misplaced instance URL %s', value => {
    expect(() => normalizeHostingServer(value, 'Gitea')).toThrow(/Gitea|HTTPS/);
  });
  it('keeps GitLab wrappers consistent with the shared matching rules', () => {
    expect(normalizeGitLabServer('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(matchGitLabServer('git@gitlab.com:group/repo.git', ['https://gitlab.com'])).toBe('https://gitlab.com');
  });
  it.each([
    ['https://code.example/forge/owner/repo.git', 'https://code.example/forge'],
    ['git@code.example:forge/owner/repo.git', 'https://code.example/forge'],
    ['ssh://git@code.example:2222/forge/owner/repo.git', 'https://code.example/forge'],
    ['https://code.example/forgery/owner/repo.git', 'https://code.example'],
    ['https://evil.example/forge/owner/repo.git', null],
    ['https://code.example:8443/forge/owner/repo.git', null],
    ['http://code.example/forge/owner/repo.git', null],
    ['file:///forge/owner/repo.git', null], ['not a remote', null]
  ])('matches %s to its most specific configured instance', (remote, expected) => {
    expect(matchHostingServer(remote, ['https://code.example', 'https://code.example/forge'])).toBe(expected);
  });
  it('rejects ambiguous SSH web ports but permits an exact HTTPS origin', () => {
    const servers = ['https://code.example:8443/forge', 'https://code.example:9443/forge'];
    expect(matchHostingServer('git@code.example:forge/owner/repo.git', servers)).toBeNull();
    expect(matchHostingServer('https://code.example:9443/forge/owner/repo.git', servers)).toBe(servers[1]);
  });
});
