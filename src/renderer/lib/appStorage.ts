/** Read Git Workbench preferences. null means absent; undefined means storage is unavailable. */
export function readAppStorage(suffix: string): string | null | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage.getItem(`git-workbench:${suffix}`);
  } catch { /* Browser storage can be disabled. */ return undefined; }
}
