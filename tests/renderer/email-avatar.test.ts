// @vitest-environment jsdom
import './setup';
import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { emailAvatarHash } from '../../src/renderer/lib/emailAvatar';
describe('Gravatar email identifiers', () => {
  it('uses a SHA-256 identifier without putting a raw email in a request URL', async () => {
    vi.stubGlobal('crypto', webcrypto);
    expect(await emailAvatarHash('MyEmailAddress@example.com ')).toBe('84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee');
    vi.unstubAllGlobals();
  });
  it.each(['', 'bad', 'one@', 'a b@example.test', 'a'.repeat(250) + '@example.test'])('does not request an avatar for %s', async value => {
    expect(await emailAvatarHash(value)).toBe('');
  });
});
