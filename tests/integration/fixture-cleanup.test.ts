import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { cleanupGitFixture } from './git-fixture';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  rm: vi.fn()
}));

beforeEach(() => { vi.mocked(rm).mockReset(); });

describe('temporary Git repository cleanup', () => {
  it('uses bounded native retries for transient Windows directory locks', async () => {
    vi.mocked(rm).mockResolvedValue(undefined);
    await cleanupGitFixture('temporary-fixture');
    expect(rm).toHaveBeenCalledExactlyOnceWith('temporary-fixture', {
      recursive: true, force: true, maxRetries: 10, retryDelay: 100
    });
  });

  it('reports removal failures after the native retry limit', async () => {
    const error = Object.assign(new Error('fixture is still locked'), { code: 'EBUSY' });
    vi.mocked(rm).mockRejectedValue(error);
    await expect(cleanupGitFixture('temporary-fixture')).rejects.toBe(error);
  });
});
