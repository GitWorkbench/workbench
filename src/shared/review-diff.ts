/** Coordinates from the provider's displayed patch, never from the local checkout. */
export function reviewDiffLines(patch: string) {
  let oldNo = 0, newNo = 0, inHunk = false;
  return patch.split('\n').map(text => {
    const match = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (match) {
      oldNo = Number(match[1]); newNo = Number(match[2]); inHunk = true;
      return { text, kind: 'hunk', oldNo: null, newNo: null };
    }
    if (!inHunk || !/^[ +\-]/.test(text)) return { text, kind: 'meta', oldNo: null, newNo: null };
    if (text.startsWith('+')) return { text, kind: 'add', oldNo: null, newNo: newNo++ };
    if (text.startsWith('-')) return { text, kind: 'del', oldNo: oldNo++, newNo: null };
    return { text, kind: 'context', oldNo: oldNo++, newNo: newNo++ };
  });
}
