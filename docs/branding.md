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

AI keys share the protected `hosted-git-credentials.enc` vault and are scoped to their provider and configured endpoint. Nonsecret model preferences live in `ai-settings.json`, and the first-run completion marker is `setup-completed`, both under the same Electron data directory. Neither path contains a version or installer directory. Updates, provider switches, blank key fields, and resetting UI preferences do not delete saved AI keys. Removing a key is an explicit action in Settings → AI Assistant.

Older AI keys still present in browser preferences are imported into encrypted storage at startup without replacing a newer saved key. The old copy is cleared only after successful import. If the keyring is locked or import fails, the original is retained and pending preference changes wait in memory; unlock the keyring and use Retry secure storage in AI Assistant. Credentials that were already deleted cannot be reconstructed; re-enter those keys once. A reinstall that removes the app data directory or a different OS account does not retain credentials.

Configuration and recovery records from separately named applications are not imported. Set preferences, reopen repositories, and reconnect providers in Git Workbench as needed. Installation does not delete those applications' data.

## Repository records

Recovery references use `refs/git-workbench/*` and are excluded from the ordinary commit graph. Restore-point messages use the `Git Workbench restore point: ` prefix. Conflict-memory preferences use `git-workbench.rerere`.

Shared stack records live in `git-workbench-stacks` within the common Git directory. Rewrite, split, sparse-layout, and rebase-editor records use their corresponding `git-workbench-*` directories in each worktree's Git directory. Opening a repository does not copy or rename records.

## Native packages and updates

Linux packages and executables use `git-workbench`; Arch filenames are `git-workbench-<version>-<pkgrel>-<native-arch>.pkg.tar.zst`. AppImage, deb, rpm and macOS assets use `git-workbench-<version>-<arch>.<extension>`. Windows uses `git-workbench-setup-<version>.exe`.

Windows installer identity is generated from `dev.gitworkbench.app`. Native packages do not declare replacement relationships for separately named applications.

The updater reads public releases from `GitWorkbench/workbench`. Installer metadata and checksums must come from the same build. Unsigned macOS builds use manual downloads from the release page.
