# Git Workbench website

The public website is **https://gitworkbench.github.io/**. GitHub serves this organization-root URL from the public **[GitWorkbench/gitworkbench.github.io](https://github.com/GitWorkbench/gitworkbench.github.io)** repository. The app stays in `GitWorkbench/workbench`, which hosts its source and releases. The old `/workbench/` site redirects to the root URL.

## Source and publishing

Maintain website source in this app repository's `website/` directory. It is static HTML, CSS, and JavaScript. Screenshots are in `website/assets/screenshots/`; the logo comes from `build/icon-128.png`. No application credentials, desktop bundle, dependency installation, or server are needed for hosting.

Publish a reviewed snapshot to the separate Pages repository using your normal Git SSH access. From this app checkout, use a **new** output directory for the clone:

```bash
git clone git@github.com:GitWorkbench/gitworkbench.github.io.git /tmp/git-workbench-pages
cp website/index.html website/styles.css website/site.js /tmp/git-workbench-pages/
mkdir -p /tmp/git-workbench-pages/assets /tmp/git-workbench-pages/.github/workflows
cp -R website/assets/screenshots /tmp/git-workbench-pages/assets/
cp build/icon-128.png /tmp/git-workbench-pages/assets/icon.png
cp website/pages.yml /tmp/git-workbench-pages/.github/workflows/pages.yml
git -C /tmp/git-workbench-pages add index.html styles.css site.js assets .github/workflows/pages.yml
git -C /tmp/git-workbench-pages commit -m "feat: update Git Workbench website"
git -C /tmp/git-workbench-pages push origin main
```

In **that repository's Settings → Pages**, select **GitHub Actions** as Source. Its workflow publishes on every push to `main` and can also be started manually. Only the allowlisted page files and assets enter the Pages artifact. The app repository's Pages workflow publishes only the old-address redirect. Website source changes in the app repository require the snapshot publishing step above; the app's `GITHUB_TOKEN` does not publish across repositories. No cross-repository secret or deployment key is required.

The two deployments are independent. Verify the root site is live before publishing a redirect there. Check the `github-pages` environment and Actions run in the website repository for deployment status. Application release builds remain separate and run on version tags.

## Screenshots

The gallery contains actual Git Workbench renderer captures with disposable demonstration repository data, including history, a split diff, and a three-pane conflicted merge. They were captured through the browser preview using read-only snapshots produced by the application's Git readers. They are not drawn or generated representations of the app, and do not show private user repositories. The page explicitly identifies the browser preview and demo data.

To refresh screenshots, create disposable repositories using [the demo guide](demo-repositories.md), open them in the current app or a local renderer preview, and capture the actual interface. Preserve the image aspect ratio, update the HTML width/height attributes if needed, and review captures for secrets or personal data before committing. Do not replace captures with illustrative mockups labeled as screenshots.

## Download links

The site reads the latest public stable app release through the unauthenticated GitHub API. It links to actual attached assets, matching Linux architecture and package format; unsigned macOS builds use universal DMG/ZIP. Missing assets, no stable release, offline errors, and rate limits keep usable GitHub release-page links. Asset names and availability are never assumed.

Site content should describe implemented features. No analytics or account sign-in is included. The page uses Google Fonts with system-font fallbacks.

## Local preview

From the app repository root:

```bash
mkdir -p .tmp/website/assets
cp website/index.html website/styles.css website/site.js .tmp/website/
cp -R website/assets/screenshots .tmp/website/assets/
cp build/icon-128.png .tmp/website/assets/icon.png
python3 -m http.server 4173 --bind 127.0.0.1 --directory .tmp/website
```

Open `http://127.0.0.1:4173`. Copy updated source files into the preview directory again after edits. Assets use relative paths. Check the desktop and narrow layouts, tab keyboard navigation, full-size screenshots, download fallbacks, and release asset selection before publishing.
