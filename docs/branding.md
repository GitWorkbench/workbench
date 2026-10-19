# Git Workbench identity and data locations

All active product, code and package identifiers use **Git Workbench** / `git-workbench`.

| Item | Canonical value |
| --- | --- |
| Product/profile | `Git Workbench` |
| Package and executable | `git-workbench` |
| Application/bundle ID | `dev.gitworkbench.app` |
| Linux desktop entry / WM class | `git-workbench.desktop` / `git-workbench` |
| Settings and guide storage | `git-workbench:*` |
| Default theme ID | `git-workbench-dark` |
| Git recovery refs | `refs/git-workbench/*` |
| Repository records | `git-workbench-rewrites`, `git-workbench-stacks`, `git-workbench-splits`, `git-workbench-sparse-layouts` |
| Git conflict-memory setting | `git-workbench.rerere` |
| GitHub source and releases | [GitWorkbench/workbench](https://github.com/GitWorkbench/workbench) |
| GitHub App | [Git Workbench Desktop](https://github.com/apps/git-workbench-desktop) |
| Development environment overrides | `GIT_WORKBENCH_GITHUB_CLIENT_ID`, `GIT_WORKBENCH_GITHUB_APP_SLUG` |

Use these identifiers throughout source, configuration, tests, packaging, and documentation. Product aliases and compatibility identities are not supported.

## Profiles and credentials

The Electron profile and session data live at `<appData>/Git Workbench`. The app creates that directory before Electron is ready and uses **Git Workbench** as its OS keychain identity.

Credentials remain encrypted through Electron secure storage. Browser preferences use `git-workbench:*` keys; recent repositories are stored in `~/.config/git-workbench/recent-repos.json`.

Configuration and recovery records from separately named applications are not imported. Set preferences, reopen repositories, and reconnect providers in Git Workbench as needed. Installation does not delete those applications' data.

## Repository records

Recovery references use `refs/git-workbench/*` and are excluded from the ordinary commit graph. Restore-point messages use the `Git Workbench restore point: ` prefix. Conflict-memory preferences use `git-workbench.rerere`.

Shared stack records live in `git-workbench-stacks` within the common Git directory. Rewrite, split, sparse-layout, and rebase-editor records use their corresponding `git-workbench-*` directories in each worktree's Git directory. Opening a repository does not copy or rename records.

## Native packages and updates

Linux packages and executables use `git-workbench`; Arch filenames are `git-workbench-<version>-<pkgrel>-<native-arch>.pkg.tar.zst`. AppImage, deb, rpm and macOS assets use `git-workbench-<version>-<arch>.<extension>`. Windows uses `git-workbench-setup-<version>.exe`.

Windows installer identity is generated from `dev.gitworkbench.app`. Native packages do not declare replacement relationships for separately named applications.

The updater reads public releases from `GitWorkbench/workbench`. Installer metadata and checksums must come from the same build. Unsigned macOS builds use manual downloads from the release page.
