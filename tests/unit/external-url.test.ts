import { describe, expect, it } from 'vitest';
import { externalWebUrl } from '../../src/shared/external-url';

describe('external web link boundaries', () => {
  it.each(['https://example.com/path?q=hello#section', 'http://localhost:8080/project'])('permits the explicit web destination %s', url => {
    expect(externalWebUrl(url)).toBe(url);
  });
  it('trims and canonicalizes a web origin', () => {
    expect(externalWebUrl(' HTTPS://EXAMPLE.COM ')).toBe('https://example.com/');
  });
  it.each([null, undefined, 1, {}, '', '  ', 'invalid URL', 'https://example.com/\nsecret', 'https://example.com/\u007fsecret'])('rejects malformed link %#', url => {
    expect(() => externalWebUrl(url)).toThrow('valid web link');
  });
  it.each(['file:///home/private', 'javascript:alert(1)', 'data:text/html,hello', 'mailto:user@example.com', 'ftp://example.com/path', 'https://user:secret@example.com', 'http://user@example.com'])('never opens an executable, file, or credential-bearing URL: %s', url => {
    expect(() => externalWebUrl(url)).toThrow('HTTP or HTTPS');
  });
});
