/** External links may open web pages, never local files or executable schemes. */
export function externalWebUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Enter a valid web link.');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a valid web link.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Only HTTP or HTTPS links without embedded credentials can be opened.');
  }
  return url.href;
}
