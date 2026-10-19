export const REPOSITORY = 'GitWorkbench/workbench';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;

const commits = [
  ['feat: bring your projects into one workspace', 'Alex Chen', 'AC', 'a8c41f2', '3 files changed', '+128', '−34'],
  ['feat: add pinned repository overview', 'Alex Chen', 'AC', 'b7d90e1', '4 files changed', '+96', '−12'],
  ["Merge branch 'feature/workspaces'", 'Sam Rivera', 'SR', 'c9f31a8', '4 files changed', '+214', '−46'],
  ['refactor: simplify repository navigation', 'Alex Chen', 'AC', 'd4a18e2', '2 files changed', '+58', '−91'],
  ['chore: prepare the first public release', 'Sam Rivera', 'SR', 'e6b90c3', '5 files changed', '+76', '−15'],
  ['fix: preserve line endings in merge results', 'Sam Rivera', 'SR', 'f8c24b7', '2 files changed', '+31', '−8'],
  ['feat: compare changes side by side', 'Alex Chen', 'AC', 'a2d76f9', '6 files changed', '+256', '−42']
];

/** Accept only the public repository's release assets, without trusting API-supplied markup or URLs. */
export function assetUrl(asset) {
  if (!asset || typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') return null;
  try {
    const url = new URL(asset.browser_download_url);
    if (url.protocol !== 'https:' || url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
      || !url.pathname.startsWith(`/${REPOSITORY}/releases/download/`)) return null;
    return url.href;
  } catch { return null; }
}

export function findAsset(assets, format, architecture = 'x64') {
  const suffix = { AppImage: '.AppImage', deb: '.deb', rpm: '.rpm', pacman: '.pkg.tar.zst', dmg: '.dmg', zip: '.zip', exe: '.exe' }[format];
  if (!suffix || !Array.isArray(assets)) return null;
  return assets.find(asset => {
    if (!assetUrl(asset) || !asset.name.toLowerCase().startsWith('git-workbench-') || !asset.name.endsWith(suffix)) return false;
    if (['dmg', 'zip'].includes(format)) return /(?:^|[-_.])universal(?:[-_.]|$)/i.test(asset.name);
    if (format === 'exe') return !/(?:^|[-_.])(?:arm64|aarch64|ia32|i386|i686)(?:[-_.]|$)/i.test(asset.name);
    const names = architecture === 'arm64' ? '(?:arm64|aarch64)' : '(?:x64|x86_64|amd64)';
    return new RegExp(`(?:^|[-_.])${names}(?:[-_.]|$)`, 'i').test(asset.name);
  }) || null;
}

export function mountWebsite(root = document) {
  const tabs = [...root.querySelectorAll('[data-preview]')];
  const showPanel = tab => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      root.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
  };
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => showPanel(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); showPanel(next); next.focus(); }
    });
  }
  for (const row of root.querySelectorAll('[data-commit]')) row.addEventListener('click', () => {
    const commit = commits[Number(row.dataset.commit)];
    if (!commit) return;
    for (const item of root.querySelectorAll('[data-commit]')) {
      item.classList.toggle('selected', item === row);
      item.setAttribute('aria-pressed', String(item === row));
    }
    root.getElementById('commit-title').textContent = commit[0];
    root.getElementById('commit-avatar').textContent = commit[2];
    root.getElementById('commit-meta').textContent = `${commit[1]} · ${commit[3]} · ${commit[4]}`;
    const stats = root.getElementById('commit-stats');
    stats.replaceChildren(root.createTextNode(`${commit[5]} `));
    const removed = root.createElement('span'); removed.textContent = commit[6]; stats.append(removed);
  });
  for (const button of root.querySelectorAll('[data-merge]')) button.addEventListener('click', () => {
    const current = button.dataset.merge === 'current';
    root.getElementById('merge-result').textContent = `export const welcome = {\n  title: '${current ? 'Hello, world.' : 'Hello, workbench.'}',\n  theme: '${current ? 'dark' : 'system'}'\n};`;
    root.getElementById('merge-state').textContent = current ? 'Current preview' : 'Incoming preview';
    for (const item of root.querySelectorAll('[data-merge]')) item.setAttribute('aria-pressed', String(item === button));
  });
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const detected = /mac/i.test(platform) ? 'mac' : /win/i.test(platform) ? 'windows' : /linux/i.test(platform) && !/android/i.test(navigator.userAgent) ? 'linux' : null;
  if (detected) root.querySelector(`[data-platform="${detected}"]`)?.setAttribute('data-detected', 'true');
}

export async function loadRelease(root = document, request = fetch) {
  const status = root.getElementById('release-status');
  const badge = root.getElementById('release-version');
  const architecture = root.getElementById('linux-arch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await request(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, credentials: 'omit' });
    if (response.status === 404) { status.textContent = 'Public release assets are being prepared. Check GitHub for availability.'; return; }
    if (!response.ok) throw new Error('Release lookup unavailable');
    const release = await response.json();
    if (release.draft || release.prerelease || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) throw new Error('Unexpected release');
    const releaseUrl = `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`;
    badge.textContent = release.tag_name.slice(0, 40);
    root.getElementById('release-notes').href = releaseUrl;
    const updateDownloads = () => {
      let available = 0;
      for (const link of root.querySelectorAll('[data-download]')) {
        const format = link.dataset.download;
        const asset = findAsset(release.assets, format, architecture.value);
        link.href = asset ? assetUrl(asset) : releaseUrl;
        link.dataset.available = String(!!asset);
        link.title = asset ? `Download ${asset.name}` : 'View this release for available builds';
        if (format === 'dmg') link.firstChild.textContent = asset ? 'Download for macOS ' : 'View macOS release ';
        if (format === 'exe') link.firstChild.textContent = asset ? 'Download for Windows ' : 'View Windows release ';
        if (asset) available++;
      }
      status.textContent = available ? 'Latest stable release · downloads from GitHub.' : 'Builds for this selection are not attached yet. View the release for availability.';
    };
    updateDownloads();
    architecture.addEventListener('change', updateDownloads);
  } catch {
    status.textContent = 'Live release details are unavailable. Open GitHub Releases to download.';
  } finally { clearTimeout(timeout); }
}

if (typeof document !== 'undefined' && document.querySelector('.workbench')) {
  mountWebsite();
  void loadRelease();
}
