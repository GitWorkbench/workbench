<div align="center">

<img src="./build/icon.png" alt="Git Workbench Logo" width="128" height="128" />

# Git Workbench

See [application identity and data locations](docs/branding.md) for configuration and packaging details.

[Website](https://gitworkbench.github.io/workbench/) · [Downloads](https://github.com/GitWorkbench/workbench/releases) · [Website deployment guide](docs/website.md)

**Visual commit strata &amp; effortless Git workflow for Linux and macOS.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-44.4.5-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS-lightgrey.svg)](#installation--build)

</div>

---

## 🌟 Overview

**Git Workbench** is an open-source, commit-graph-centric desktop Git client built for developers who need crystalline visual clarity over complex repository histories, parallel branch lanes, and active working trees.

Inspired by modern visual Git workflows, Git Workbench combines the responsiveness of native Git with a rich, aesthetic interface crafted in React, TypeScript, and Electron. It shells out directly to your system's native `git` binary asynchronously—avoiding brittle native C++ bindings while ensuring 100% fidelity with your existing Git hooks, SSH keys, GPG signing, and `.gitconfig`.

---

## ✨ Features

### 🌳 Interactive Commit Strata Graph
- **Dynamic Branch Lanes**: Visualizes parallel branches with dedicated color tracks, smooth cubic bezier curves, and glowing commit nodes.
- **Inline Branch & Tag Badges**: Quick identification of `HEAD`, local branches, remote tracking branches, and tags directly alongside commit summaries.
- **Instant Commit Inspection**: Click any node to instantly populate commit details, author information, parent commit links, and modified files.

### 📑 Multi-Repository Workspace & Tabs
- **Tabbed Browsing**: Seamlessly open and switch between multiple repositories in parallel tabs.
- **Unified Home**: One page for opening/creating repositories, pinned status cards, recent projects, search, and provider setup. Pin projects directly from the recent list and resume an open workspace without reopening it.
- **Frameless Window Chrome**: Integrated drag region, custom window controls, and repository switcher.

### Advanced repository workflows

| Feature | Where to open it |
| --- | --- |
| Pinned repository dashboard with changes, conflicts, ahead/behind and open requests | **Home → Pinned repositories** |
| Separate PR/MR review worktrees | Hosted review → **Open in worktree…** |
| Visual commit splitting by file or hunk, with preview and restore point | Commit context menu or **Actions → Split Commit…** |
| Stacked branch links, isolated restack previews and request retargeting | **Actions → Stacked Branches & PRs…** |
| LFS tracking rules, asset inventory and cancellable transfers | **Actions → Git LFS Manager…** |
| Sparse checkout folder picker, file preview and saved layouts | **Actions → Sparse Checkout…** |

See [Advanced Git workflows](docs/advanced-features.md) for usage, recovery instructions and limits. Stacked restacks require Git 2.38+, sparse editing requires Git 2.37+, and LFS management requires a separately installed recent Git LFS. Rewrites remain local until you explicitly push; rewritten commits do not preserve cryptographic signatures.

### 🔍 Deep Commit Details & File Hierarchy
- **Dual File Tree Views**: Toggle between a flat file path list and an expandable folder tree hierarchy.
- **Change Badges**: Visual indicators for Added (`+`), Modified (`M`), Deleted (`-`), and Renamed (`R`) files with line additions/deletions.
- **Parent Navigation**: Click any parent commit hash to jump directly across the commit graph.

### ⚡ Unified & Side-by-Side Diff Viewer
- **Syntax Highlighting**: Beautiful code diff rendering with language detection and clean contrast.
- **Hunk-Level Granularity**: Review changes hunk-by-hunk, with options to stage, unstage, or discard hunks individually.
- **File System Operations**: Open files in your system's default editor or reveal them in your OS file manager.

### 🔀 Branch & Stash Management
- **Branch Operations**: Fast checkout, branch creation from any commit, rename, and local/remote branch deletion.
- **Merge & Rebase Controls**: Merge branches with fast-forward support or interactive rebase workflows.
- **Full Stash Suite**: Stash staged/unstaged changes with optional descriptions; inspect, pop, apply, or drop stashes on demand.

### 🛠️ Commit History Actions
- **Actions → Rebase & Rewrite Comparison** compares two commit ranges using `git range-diff`, with filters for unchanged, changed, removed, and added commits, patch details, old/new commit inspection, and raw output copying.
- In-app branch/interactive rebases, reword/drop/reorder actions, and pulls configured to rebase retain their before/after revisions. Completed rewrites open the comparison automatically; conflict-paused sessions are completed after Continue. Records survive app restarts and can be deleted explicitly. Custom base/tip ranges are supported. Requires Git 2.19+; matching is heuristic, merge commits are excluded, and each range is limited to 500 non-merge commits.
- **Interactive Mutations**: Soft, mixed, or hard reset to any historical commit.
- **Rebase Helpers**: Revert commits, drop commits, and edit commit messages without writing complex rebase scripts by hand.
- **Patch Application**: Apply individual commit patches onto your current working branch.

### 🔀 Three-Pane Merge Editor
- **Actions → Conflict Resolution Memory** enables repository-local suggestions backed by Git rerere. It disables automatic rerere application for this repository; remembered candidates are generated in a temporary worktree/index and never replace your working file during preview.
- Repeated text conflicts offer **Preview remembered result** and **Use reviewed result** in the merge editor. Loading a result is undoable; **Apply** explicitly saves/stages it. You can forget a matching resolution, or disable suggestions while keeping the cache. Binary, submodule, and deletion-only conflicts use explicit side choices.
- Open a conflicted file from the operation banner or its **Resolve** button in the changes list.
- Compare the complete, read-only **Current** and **Incoming** versions around an editable **Merge result**. Resize the panes, link scrolling, or inspect the common ancestor with **Show base**.
- Use the gutter arrows or conflict toolbar to accept either side, keep both in either order, or restore a diff3 base block. Non-conflicting changes from Git's working file are retained automatically.
- Edit the result directly with syntax highlighting, line numbers, search, and undo/redo. Confirm manual edits with **Mark resolved**; move between conflicts with **Alt+Up/Down**.
- **Apply & Next File** saves and stages only the reviewed file, then opens the next conflict. On the last file, **Apply & Continue** explicitly resumes the merge, rebase, or cherry-pick.
- Binary files and symbolic links support complete-side choices; delete/modify conflicts support keeping the deletion. Submodule conflicts display guidance for resolving the submodule with Git.
- Line endings are preserved. Changed files or index entries detected during a save require a reload, and unapplied edits are confirmed before closing or switching files.

### 🛟 Reflog & Recovery
- **Actions → Restore Points** saves HEAD, the staged/unstaged split, and non-ignored untracked files. Points are created before reset, discard, pull, and history rewrites; a failed snapshot prevents the destructive action. Manual points work without clearing your working tree or adding stash entries.
- Inspect the saved status, then restore into a new recovery branch from a clean workspace. Saved points stay available until explicitly deleted. Private Git refs protect their objects from garbage collection and are excluded from the commit graph. Ignored files and submodule working directories are excluded; conflicted indexes cannot be saved.
- Browse recent local `HEAD` and reference movements to find commits hidden by a reset, rebase, or deleted branch.
- Create a recovery branch at any reflog entry to keep that commit reachable.
- Restore the current branch to a selected entry after confirming; Git Workbench first creates a safety branch at the current tip and requires a clean working tree.

### 🔀 Pull Request Context
- Select a request and choose **Review changes, conversation & CI** to read provider diffs, post line comments/replies, approve, request changes, and inspect checks for the reviewed revision. Submission rejects a changed source revision and keeps your message.
- GitHub CI may additionally require **Checks: read** and **Commit statuses: read** token permissions. GitLab uses native GraphQL change requests where supported; older hosts explicitly offer a discussion and approval withdrawal instead. Provider permission errors, missing patches, and pagination limits are shown in the workspace.
- Open **Actions → Pull Requests / Merge Requests** to see open requests for a repository remote, including source/target branches, author, draft state, and links to the provider.
- Create a request from the checked-out branch. Git Workbench pushes that branch using the repository's configured Git authentication, then creates a GitHub pull request, GitLab merge request, or Bitbucket Cloud pull request through the provider API.
- GitHub.com, GitLab.com, self-managed GitLab (choose GitLab for an unrecognized remote), and Bitbucket Cloud are supported. Bitbucket Data Center and GitHub Enterprise are not supported yet.
- Connect in **Settings → Pull Request Providers**. Choose **Sign in with GitHub**, enter the displayed device code in your browser, then use **Choose repositories on GitHub** to grant access to selected repositories. GitHub sessions refresh automatically and are encrypted with the operating system keychain. See [GitHub sign-in setup](docs/github-sign-in.md) for permissions and release configuration.
- Manual access tokens remain supported. GitHub needs **Pull requests: read and write** and **Contents: read**; CI results also need **Checks: read** and **Commit statuses: read**. GitLab needs the **`api`** scope; Bitbucket Cloud needs **repository read** and **pull request read/write** permissions plus the Atlassian account email used with the API token. Tokens are not stored in app preferences.
- Uncommitted edits stay local; only commits on the current branch are pushed and included. Your normal SSH key or Git credential helper still handles the Git push.

### 🎨 Theming & Visual Customization
- **Curated Theme Palettes**:
  - `Git Workbench Dark` (Default, sleek onyx & electric cyan)
  - `GitHub Dark Dimmed`
  - `Dracula`
  - `Nord`
  - `Cyberpunk`
  - `Monokai Pro`
  - `One Dark Pro`
  - `Solarized Dark`
  - `Clean Studio Light`
- **Custom Typography**: Select from Google Fonts presets (Inter, Roboto, Outfit, JetBrains Mono, Fira Code) or specify your own installed system fonts.
- **Adjustable Graph Density**: Tailor graph row height to your preferred information density.
- **Independent Text Sizes**: In **Settings → Typography & Density**, set Interface, Diff & Code, Home, and Guide text separately. Each control has a preview and reset. Font changes resize text without zooming panel spacing; see [typography settings](docs/typography.md).

### Explore Git Workbench

Open **Home → Explore Git Workbench**, the toolbar’s Actions menu, the command palette, or About to browse the built-in guide. It includes 28 detailed topics across getting started, daily Git, collaboration, history and recovery, repository tools, and preferences.

- Search feature names and the full instructions, or browse by workflow.
- Follow a four-guide starting path, then open related topics for more detail.
- Read prerequisites, step-by-step instructions, useful details, and operation-specific caveats.
- Open the relevant settings page or tool from a guide. Repository tools are available after opening a project; changes still require actions in those tools.
- Mark topics as explored and resume your last topic. Reading progress stays on this device, separately from the startup display preference.
- Use **Ctrl/Cmd+F** to search within the guide, **Tab** to navigate controls, and **Escape** to close it. The startup checkbox can disable or reenable automatic opening.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Electron Main Process                │
│  - Window Management & Native Frameless Chrome        │
│  - Async Child Process Git Engine (simple-git/exec)   │
│  - Native Dialogs, OS Integration & Config Storage    │
└──────────────────────────┬─────────────────────────────┘
                           │ (contextBridge / IPC)
┌──────────────────────────▼─────────────────────────────┐
│            Typed IPC Layer (GitWorkbenchApi)            │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│                  React 19 Renderer Process             │
│  - TabBar & Home State      (Zustand)                  │
│  - SVG Commit Strata Graph Renderer                   │
│  - Diff Viewer & File Tree Hierarchy                   │
│  - Theme & Typography Engine (CSS Vars / Tailwind v4)  │
└────────────────────────────────────────────────────────┘
```

- **Non-blocking Execution**: Git operations execute in the Node.js background process without freezing the 60fps UI renderer.
- **Secure Context Isolation**: Renderer runs with `contextIsolation: true` and `nodeIntegration: false`. All capabilities are exposed through a strictly typed `GitWorkbenchApi` context bridge.
- **Native Git Compatibility**: Zero proprietary database lock-in. Git Workbench reads directly from your repository's `.git/` folder using the system Git CLI.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22, matching CI
- **npm**: use the committed `package-lock.json`
- **Git**: System `git` CLI installed and available in `$PATH`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/GitWorkbench/workbench.git git-workbench
   cd git-workbench
   ```

2. **Install dependencies:**
   ```bash
   npm ci
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Verify TypeScript types:**
   ```bash
   npm run typecheck
   ```

---

## Automated tests

```sh
npm test
npm run test:coverage
npm run test:coverage:report
```

The suite covers UI interactions, main/preload IPC, provider adapters, and real Git workflows in temporary repositories. Coverage enforces 100% lines, statements, functions, and branches per source file. The target is still in progress; reports remain available when the strict gate fails. See [the testing guide](docs/testing.md) for focused commands, isolation, CI, and native platform checks.

## 🧪 Manual Testing Playground

See [Advanced Git workflows](docs/advanced-features.md) for hosted reviews, restore points, conflict memory, and before/after rewrite comparisons.

Create disposable repositories with realistic history, staged and unstaged edits, stashes, tags, local remotes, submodules, a linked worktree, and ready-to-resolve merge/rebase/cherry-pick conflicts:

```bash
npm run demo:create
```

Open `.tmp/git-workbench-demo/workspace` in Git Workbench to start. The generated `GUIDE.md` maps each feature to its fixture folder. Use `npm run demo:create -- --fresh` to create another copy while keeping your experiments. See [the manual testing guide](docs/demo-repositories.md) for the full checklist and features that require live provider accounts or a packaged build.

## 📦 Building & Packaging

Git Workbench uses [`electron-builder`](https://www.electron.build/) to package distribution-ready binaries:

### Build for Linux (AppImage, deb, rpm & Arch)
```bash
npm run dist:linux
```
This creates an AppImage, Debian package, RPM package, and Zstandard-compressed Arch package (`git-workbench-<version>-<pkgrel>-x86_64.pkg.tar.zst` for x64) in `dist/`.

Each Linux format is packaged separately in an isolated directory to preserve its updater identity. The build combines all four installer entries, including Pacman, into `latest-linux.yml` and verifies their versions, sizes and SHA-512 checksums. `npm run dist` uses the same Linux pipeline on Linux. Optional architecture flags include `--x64` and `--arm64`.

Arch packaging requires `bsdtar`, `xz`, and `zstd` on the build machine; GitHub Actions installs them automatically. With the pinned builder, an intermediate XZ package is streamed into Zstandard while preserving its tar contents. The final filename comes from `.PKGINFO`, including the package release and native architecture. Only `.pkg.tar.zst` files are advertised as Arch installers in the update feed and uploaded to releases; existing Pacman updater clients can select them from the Linux feed.

If an older Linux installation reports an installer or `pkexec` error, use **View releases** and install the package for your distribution manually. In particular, Arch/CachyOS uses `sudo pacman -U ./git-workbench-<version>-<pkgrel>-x86_64.pkg.tar.zst`; older releases used a `.pacman` filename, also installable with `pacman -U`. Do not install an RPM or Debian package on Arch. Older multi-format builds can contain an incorrect updater package marker, so a manual upgrade may be needed to receive the corrected updater. A failed authorization dialog does not mean an update check or download failed; see the [pkexec return codes](https://www.freedesktop.org/software/polkit/docs/latest/pkexec.1.html).

### Build for Windows (NSIS installer)
```bash
npm run dist:win
```
This creates a Windows installer (`.exe`) and `latest.yml` updater metadata in `dist/`. Build on Windows for the most reliable release and smoke-test the installer there. Linux can cross-build it when Wine is available.

Windows installer names are explicitly hyphenated (`git-workbench-setup-<version>.exe`) so the uploaded installer and blockmap match `latest.yml`. Before publishing, verify every `url` and `path` in the updater metadata matches an attached asset exactly.

### Build for macOS (manual download)
```bash
npm run dist:mac
```
This creates a DMG and ZIP in `dist/`. macOS builds are unsigned and will always use the GitHub release page for manual download and installation; in-app macOS updates are not enabled.

### Publishing a release and its update files

Git Workbench checks public, non-draft GitHub Releases in `GitWorkbench/workbench`. Local `dist` commands only build files; the GitHub Actions release workflow builds and uploads them automatically when a version tag is pushed.

First commit and push the workflow and packaging changes to `main`. For each release, bump `package.json`'s version to match the tag (without the `v` prefix), commit and push that version, then push the tag:

```bash
npm version 0.1.1-beta.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: prepare v0.1.1-beta.1 release"
git tag v0.1.1-beta.1
git push origin main
git push origin v0.1.1-beta.1
```

The workflow builds Linux packages on Ubuntu, the Windows installer on Windows, and a universal unsigned DMG/ZIP on macOS. It creates a **draft** GitHub Release and attaches all installers, updater metadata, and blockmaps. A new draft for a tag with a prerelease suffix (such as `-beta.1`) is marked as a prerelease. Wait for the **Build release packages** workflow to finish successfully before publishing. Do not create or publish the release manually while the builds are running: the updater can see a published release before its metadata is attached and report a 404. Review the draft's title and notes, confirm `latest-linux.yml`, `latest.yml`, and the platform installers are attached, then publish it in GitHub. If metadata is missing after the workflow finishes, rerun the workflow; do not upload a `dist/` file from an older build.

Windows NSIS and Linux AppImage, deb, rpm, and Pacman builds can download and install updates from About → Software updates. Package-manager installs may request system authorization. macOS stays manual because builds are unsigned: Git Workbench opens the release page for download and installation.

The workflow uses GitHub's `GITHUB_TOKEN` with `contents: write` for draft releases. If the release job is denied permission, allow read/write workflow token permissions under the repository's **Settings → Actions → General**. Re-running a tag workflow replaces same-named installer assets on that tag's release.

The updater is included in the first public build. Builds made before it is included cannot update themselves and must be replaced manually.

### Production Bundle Check
```bash
npm run build
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> / <kbd>Cmd</kbd> + <kbd>,</kbd> | Open Settings & Preferences |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> / <kbd>Cmd</kbd> + <kbd>F</kbd> | Filter / Search Commits & Branches |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> / <kbd>Cmd</kbd> + <kbd>R</kbd> | Refresh Current Repository Status |
| <kbd>Esc</kbd> | Close Diff Viewer / Dismiss Modals |
| <kbd>Ctrl</kbd> + <kbd>T</kbd> / <kbd>Cmd</kbd> + <kbd>T</kbd> | Open Home (repositories & dashboard) |

---

## 📁 Project Structure

```
git-workbench/
├── build/                     # Desktop icons (SVG, multi-resolution PNGs)
├── scripts/                   # Utility scripts (icon generator, git test harness)
├── src/
│   ├── main/                  # Electron main process
│   │   ├── git/               # Git engine modules (log, status, diff, history, branch)
│   │   ├── index.ts           # Application lifecycle & window creation
│   │   └── ipc.ts             # Strongly-typed IPC handlers
│   ├── preload/               # Secure contextBridge preload script
│   │   └── index.ts
│   ├── renderer/              # React 19 frontend
│   │   ├── assets/            # Embedded vector assets
│   │   ├── components/        # UI components
│   │   │   ├── CommitDetailPanel/ # Changed files tree & commit metadata
│   │   │   ├── CommitGraph/   # SVG visual commit strata graph
│   │   │   ├── Common/        # Shared components (AppLogo)
│   │   │   ├── DiffViewer/    # Syntax-highlighted file & hunk diffs
│   │   │   ├── Home/          # Recent repositories, pinned dashboard & quick actions
│   │   │   ├── Loading/       # Smooth splash & initialization screen
│   │   │   ├── Settings/      # Preferences & theme customizer
│   │   │   ├── Sidebar/       # Branch, stash & remote tree navigation
│   │   │   ├── StatusBar/     # Git sync status, branch info & counter
│   │   │   ├── TabBar/        # Multi-repo tabs & frameless window chrome
│   │   │   └── Toolbar/       # Push, pull, branch, stash & terminal bar
│   │   ├── store/             # Zustand state stores (app & settings)
│   │   └── index.html         # HTML root document
│   └── shared/                # Cross-process TypeScript types & contracts
├── package.json               # Manifest, ESM type, & build configurations
├── postcss.config.js          # Tailwind v4 PostCSS adapter (@tailwindcss/postcss)
└── tsconfig.json              # TypeScript project configuration
```

> **Tailwind v4** — design tokens (colors, fonts, sizes) live in an `@theme {}` block
> inside `src/renderer/global.css`. There is no `tailwind.config.js`; all theme
> customisation is done via standard CSS custom properties.

---

## 🤝 Contributing

Read [AGENTS.md](AGENTS.md) before using an AI coding agent or making development changes. It defines the repository's architecture, code and UI conventions, Git safety rules, validation policy, and release workflow.

Contributions are welcome! Whether you are reporting a bug, proposing a feature, or submitting a pull request, we appreciate your help in making Git Workbench better.

1. **Fork** the repository
2. **Create** your feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
<sub>Crafted with passion for the open-source Git community.</sub>
</div>
