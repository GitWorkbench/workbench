import { beforeEach, describe, expect, it, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('../../src/shared/ai', () => ({ generateCommitMessage: generate }));
import { api } from '../../src/renderer/lib/api';

beforeEach(() => { generate.mockResolvedValue({ ok: true, message: 'local draft' }); });

describe('renderer preview bridge without a browser global', () => {
  it('provides preview methods and a local commit draft without accessing window', async () => {
    expect(typeof window).toBe('undefined');
    expect(await api.getStatus()).toMatchObject({ currentBranch: 'main' });
    expect(await api.generateAiCommitMessage()).toEqual({ ok: true, message: 'local draft' });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ diff: expect.stringContaining('diff --git') }));
  });
  it('preserves ordinary object introspection and does not fabricate unknown API methods', () => {
    expect(Object.getPrototypeOf(api)).toBe(Object.prototype);
    expect(Reflect.get(api, '__proto__')).toBe(Object.prototype);
    expect(Reflect.get(api, 'missingPreviewMethod')).toBeUndefined();
  });
});
