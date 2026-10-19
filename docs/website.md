# Git Workbench website

The public website lives at **https://gitworkbench.github.io/workbench/** and is served by GitHub Pages from this repository. Source files are in `website/`; the app logo comes from `build/icon-128.png`. The page is static HTML, CSS, and JavaScript, with no framework, dependency installation, secrets, or server required.

## Publishing

In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The `Deploy Git Workbench website` workflow publishes changes to `website/` or the website workflow on `main`. It can also be started manually from Actions. The `github-pages` environment records the published URL.

Only the website files and logo are uploaded. Desktop source, user data, and installers are not part of the website artifact. The application release workflow remains separate and runs on version tags.

## Download links

The website reads the latest public stable release from the unauthenticated GitHub API. It links directly to installers attached to that release, matching Linux architecture and the actual package formats. Unsigned macOS builds use the universal DMG/ZIP. Missing assets, no public release, offline errors, and API rate limits fall back to the repository's release page. No release availability or asset filename is assumed.

The interactive workspace is an illustrative demo, with example commits and review content. It does not operate on visitors' repositories. Site content describes implemented application features; update the page when those workflows change. No analytics or account sign-in is included.

## Local preview

From the repository root:

```bash
mkdir -p .tmp/website/assets
cp website/index.html website/styles.css website/site.js .tmp/website/
cp build/icon-128.png .tmp/website/assets/icon.png
python3 -m http.server 4173 --directory .tmp/website
```

Open `http://localhost:4173`. Source changes need to be copied into the preview directory again. The published site uses relative asset paths so it works at the `/workbench/` project path.
