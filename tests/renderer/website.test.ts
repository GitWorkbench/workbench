// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetUrl, findAsset, loadRelease, mountWebsite, RELEASES_URL } from '../../website/site.js';

const html = readFileSync(path.resolve('website/index.html'), 'utf8');
const asset = (name: string) => ({ name, browser_download_url: `${RELEASES_URL}/download/v1.0.0/${name}` });
const assets = [
  'git-workbench-1.0.0-x86_64.AppImage', 'git-workbench-1.0.0-amd64.deb', 'git-workbench-1.0.0-x86_64.rpm',
  'git-workbench-1.0.0-1-x86_64.pkg.tar.zst', 'git-workbench-1.0.0-arm64.AppImage',
  'git-workbench-1.0.0-arm64.deb', 'git-workbench-1.0.0-aarch64.rpm', 'git-workbench-1.0.0-1-aarch64.pkg.tar.zst',
  'git-workbench-1.0.0-universal.dmg', 'git-workbench-1.0.0-universal.zip', 'git-workbench-setup-1.0.0.exe'
].map(asset);
beforeEach(() => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('website release asset selection', () => {
  it('accepts only asset links belonging to this public repository', () => {
    expect(assetUrl(assets[0])).toBe(assets[0].browser_download_url);
    for (const url of ['javascript:alert(1)', 'http://github.com/GitWorkbench/workbench/releases/download/v1/app.deb',
      'https://evil.invalid/app.deb', 'https://github.com/other/repo/releases/download/v1/app.deb',
      'https://user:password@github.com/GitWorkbench/workbench/releases/download/v1/app.deb',
      `${assets[0].browser_download_url}?token=example`, `${assets[0].browser_download_url}#fragment`, 'broken']) {
      expect(assetUrl({ name: 'app.deb', browser_download_url: url })).toBeNull();
    }
    for (const value of [null, {}, { name: 4 }, { name: 'app', browser_download_url: 4 }]) expect(assetUrl(value)).toBeNull();
  });
  it.each(['AppImage', 'deb', 'rpm', 'pacman'])('matches actual x64 and ARM names for %s', format => {
    expect(findAsset(assets, format, 'x64')?.name).toMatch(/x86_64|amd64/);
    expect(findAsset(assets, format, 'arm64')?.name).toMatch(/arm64|aarch64/);
  });
  it.each(['dmg', 'zip'])('selects universal macOS %s assets', format => {
    const all = [asset(`git-workbench-1.0.0-arm64.${format}`), ...assets];
    expect(findAsset(all, format)?.name).toBe(`git-workbench-1.0.0-universal.${format}`);
  });
  it('does not confuse Windows ARM builds or updater metadata with the x64 installer', () => {
    expect(findAsset([asset('git-workbench-setup-1.0.0-arm64.exe'), ...assets], 'exe')?.name).toBe('git-workbench-setup-1.0.0.exe');
    expect(findAsset([asset('other-1.0.0-x64.deb'), asset('git-workbench-1.0.0-x64.pacman')], 'deb')).toBeNull();
    expect(findAsset(null, 'deb')).toBeNull(); expect(findAsset(assets, 'unknown')).toBeNull();
  });
});

describe('website screenshot gallery', () => {
  it('switches panels with clicks and complete tab keyboard navigation', () => {
    mountWebsite();
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-preview]')];
    tabs[1].click();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById('panel-diff')).not.toHaveAttribute('hidden');
    expect(document.getElementById('panel-history')).toHaveAttribute('hidden');
    for (const [source, key, next] of [[1, 'ArrowRight', 2], [2, 'ArrowRight', 0], [0, 'ArrowLeft', 2], [2, 'Home', 0], [0, 'End', 2]] as const) {
      tabs[source].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(tabs[next]).toHaveAttribute('aria-selected', 'true'); expect(tabs[next]).toHaveFocus();
    }
    tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
  });
  it('shows real local screenshots with full-size links and demo-data disclosure', () => {
    const screenshots = [...document.querySelectorAll<HTMLImageElement>('.screenshot-gallery img')];
    expect(screenshots).toHaveLength(3);
    for (const screenshot of screenshots) {
      const source = screenshot.getAttribute('src')!;
      expect(source).toMatch(/^\.\/assets\/screenshots\/(history|diff|merge)\.jpg$/);
      expect(readFileSync(path.resolve('website', source)).subarray(0, 2).toString('hex')).toBe('ffd8');
      expect(screenshot.alt.length).toBeGreaterThan(30);
      expect(screenshot.closest('a')).toHaveAttribute('href', source);
      expect(screenshot.closest('a')).toHaveAttribute('rel', 'noopener');
    }
    expect(document.body).toHaveTextContent('browser preview with disposable demo repository data');
    expect(document.querySelectorAll('[data-commit], [data-merge]')).toHaveLength(0);
    expect(html).toContain('<link rel="canonical" href="https://gitworkbench.github.io/">');
  });
  it.each([['MacIntel', 'mac'], ['Win32', 'windows'], ['Linux x86_64', 'linux'], ['iPhone', null]])('highlights %s without hiding other platforms', (platform, expected) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    mountWebsite();
    expect(document.querySelectorAll('[data-platform]')).toHaveLength(3);
    expect(document.querySelector('[data-detected="true"]')?.getAttribute('data-platform') ?? null).toBe(expected);
  });
  it('uses relative local assets, valid local sections, unique IDs, and labeled example content', () => {
    const ids = [...document.querySelectorAll('[id]')].map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const anchor of document.querySelectorAll('a[href^="#"]')) {
      const id = anchor.getAttribute('href')!.slice(1);
      if (id) expect(document.getElementById(id)).not.toBeNull();
    }
    expect(html).not.toMatch(/(?:src|href)="\/(?!\/)/);
    expect(document.body).toHaveTextContent('Actual application interface');
    expect(document.body).toHaveTextContent('macOS builds are unsigned');
  });
});

describe('website public release loading', () => {
  it('links real assets, updates architecture choices, and uses text for the release tag', async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: 'v1.0.0', assets }) }));
    await loadRelease(document, request);
    expect(request).toHaveBeenCalledWith('https://api.github.com/repos/GitWorkbench/workbench/releases/latest', expect.objectContaining({ credentials: 'omit' }));
    expect(document.getElementById('release-version')).toHaveTextContent('v1.0.0');
    expect(document.querySelector('[data-download="deb"]')).toHaveAttribute('href', assets[1].browser_download_url);
    expect(document.querySelector('[data-download="dmg"]')).toHaveTextContent('Download for macOS');
    const architecture = document.getElementById('linux-arch') as HTMLSelectElement;
    architecture.value = 'arm64'; architecture.dispatchEvent(new Event('change'));
    expect(document.querySelector('[data-download="pacman"]')).toHaveAttribute('href', assets[7].browser_download_url);
  });
  it('keeps missing assets on the selected release page', async () => {
    await loadRelease(document, vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: 'v2.0.0', assets: [] }) })));
    expect(document.getElementById('release-status')).toHaveTextContent('not attached yet');
    for (const link of document.querySelectorAll('[data-download]')) expect(link).toHaveAttribute('href', `${RELEASES_URL}/tag/v2.0.0`);
  });
  it('explains a repository without a public stable release', async () => {
    await loadRelease(document, vi.fn(async () => ({ status: 404 })));
    expect(document.getElementById('release-status')).toHaveTextContent('being prepared');
    for (const link of document.querySelectorAll('[data-download]')) expect(link).toHaveAttribute('href', RELEASES_URL);
  });
  it.each(['offline', 'rate limit', 'draft', 'prerelease', 'invalid response'])('keeps usable release-page links on %s', async mode => {
    const request = vi.fn(async () => {
      if (mode === 'offline') throw new Error('offline');
      return { ok: mode !== 'rate limit', json: async () => ({ tag_name: 'v1.0.0', assets: mode === 'invalid response' ? null : assets, draft: mode === 'draft', prerelease: mode === 'prerelease' }) };
    });
    await loadRelease(document, request);
    expect(document.getElementById('release-status')).toHaveTextContent('unavailable');
    expect(document.querySelector('[data-download="AppImage"]')).toHaveAttribute('href', RELEASES_URL);
  });
  it('aborts a slow lookup and clears the timer', async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = loadRelease(document, request);
    await vi.advanceTimersByTimeAsync(8000); await pending;
    expect(document.getElementById('release-status')).toHaveTextContent('unavailable'); expect(vi.getTimerCount()).toBe(0);
  });
});
