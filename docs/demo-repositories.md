# Git Workbench manual testing playground

## Create or recreate

From the Git Workbench project directory, run:

```bash
npm run demo:create
```

Only Node.js and Git are needed. No package installation or internet connection is required. The default output is `.tmp/git-workbench-demo/`, which is ignored by the Git Workbench project. The command creates repositories and deliberately stops several Git operations at conflicts; it does not run the application's tests or typecheck.

To keep your experiments and create another copy:

```bash
npm run demo:create -- --fresh
```

An optional output directory is supported:

```bash
npm run demo:create -- /tmp/my-git-workbench-demo
```

Existing directories are refused. Generate the playground on the computer where you will use it: remotes, submodules, and linked worktrees use absolute local paths.

## Open these repositories in Git Workbench

The generated copy of this guide is `GUIDE.md` in the output directory. Its root is **`{{DEMO_ROOT}}`**. Select a repository folder below with **Open Repository**, or drag it into Git Workbench. Do not select the root containing all the repositories.

| Folder | Starting state | Features to try |
| --- | --- | --- |
| `workspace` | Dirty `main`, 2 stashes, branches, tags, submodule, linked worktree | Commit graph, hover cards, details, author/SHA/date columns, resizing, filters, search, staging, diffs, blame, history, stashes, tags, remotes, worktrees |
| `merge-conflicts` | Active merge, multiple conflicted files | Three-pane merger, per-block choices, base view, editing, undo/redo, linked scrolling, resizing, save and continue, binary/symlink/delete conflicts |
| `merge-standard` | Active merge with ordinary markers | Conflict handling without diff3 base markers |
| `rebase-conflicts` | Active rebase, detached HEAD | Resolve and continue/abort a rebase; review the Current/Incoming labels |
| `cherry-pick-conflicts` | Active cherry-pick | Resolve and continue/abort a cherry-pick |
| `stash-conflicts` | Conflicted stash application | Resolve and stage without trying to continue a merge; stash remains listed |
| `manual-resolution` | Unmerged JSON, markers already removed | Review an existing manual result and explicitly mark it resolved |
| `malformed-markers` | Unmerged JSON with an incomplete marker block | Recover by editing or selecting a complete side |
| `large-markers` | Active merge, 15-character markers | Custom conflict marker parsing |
| `submodule-conflicts` | Active merge with a conflicted gitlink | Submodule conflict guidance; choose a submodule revision and stage the gitlink |
| `history-playground` | Clean `main`, recoverable commit in reflog | Reflog recovery, branch creation/deletion, reset, revert, cherry-pick, interactive rebase, comparisons, merge simulation, changelog |
| `bisect-playground` | Clean `demo/bisect` | Find the deliberately introduced pricing regression |
| `gitflow-playground` | Clean `main`, Git Flow uninitialized | Initialize Git Flow; start and finish a feature, release, hotfix, bugfix, or support branch |
| `remote-client` | Clean `main`, 1 ahead and 1 behind | Fetch, pull, merge/rebase the remote changes, push |
| `remote-collaborator` | Clean `main`, teammate commit already pushed | Make and push additional changes, then fetch them from another clone |
| `worktree-dashboard` | Clean `feature/dashboard`, linked worktree | Open a repository whose `.git` is a pointer file; worktree list and branch locking |
| `empty-repo` | Initialized `main`, no commits | Empty history, first file and first commit |

`origin.git` is the shared **bare remote**, and `submodule-source` is the source repository for `packages/shared`. The real Git Workbench repository is not a remote of any fixture.

## Working tree, history, and UI checklist

In `workspace`:

- `src/app.ts` has both staged and unstaged changes. Stage/unstage one side and inspect both diffs.
- `docs/report.txt` has two separated edit hunks for partial staging, unstaging, and discarding.
- `src/new-checkout.ts` is a staged new file; `docs/system-design.md` is a staged rename; `docs/obsolete.md` is an unstaged deletion.
- `notes/untracked draft.md` is untracked. Paths with spaces and `docs/日本語.md` exercise file labels and actions.
- There are TypeScript, JavaScript, PHP, CSS, JSON, CRLF, and binary files for different diff/editor cases.
- `packages/shared` is checked out at a newer commit than the parent records. Inspect/update/stage the submodule separately.
- Two named stashes are ready for preview, apply, pop, and drop. Their changes may conflict with existing edits, so use a fresh copy for repeatable results.
- The graph has four fictional authors, recent and older commits, multiline messages, an actual merge, annotated and lightweight tags, and parallel branches.
- Resize/hide/show commit columns, change date/time formatting, hover a commit, and open its wider context menu. Hover stash rows to check that they stay still.
- `origin/demo/stale-remote` exists locally but was deleted on the remote. Fetch with prune should remove it.
- Open several fixture folders as tabs, switch between them, then restart Git Workbench to inspect repository restoration, the startup animation, and toast behavior.
- Try themes, fonts, sidebar resizing, command palette, keyboard shortcuts, interactive tour, and the embedded terminal against these sample files.

For clean history operations, use `history-playground`. Its reflog contains **`feat: create a recoverable demo commit`**, deliberately hidden by a reset. Create a recovery branch from that entry. `manifest.json` includes its full hash, so you can check that the recovered file is `docs/recover-me.md`.

The dirty workspace must be committed or stashed before operations that require a clean tree. `feature/dashboard` is checked out in a linked worktree, so checking out that branch in `workspace` should produce Git's branch-in-use result. Use a different feature branch for Git Flow finish operations.

In `gitflow-playground`, initialize with production branch `main` and development branch `develop`. Start a new feature such as `demo-new-feature`, then finish it. For a new release, use `0.4.0`, since the sample already has a `v0.3.0` tag.

## Merge editor checklist

Open `merge-conflicts`, then resolve `src/checkout.ts` first:

1. Navigate between its three independent blocks. Accept Current for one, Incoming for another, and manually edit the third. Try both ordering choices for keeping both sides on a fresh copy.
2. Open the base pane, resize panes, toggle linked scrolling, search, and undo/redo. Confirm manual edits with **Mark resolved**.
3. Apply the result, check that only the reviewed file is staged, and move to the next file.
4. Resolve JSON, CRLF, add/add, binary, and delete/modify conflicts. Symbolic link conflicts are included when the host permits creating symlinks; the manifest records whether they are present.
5. After all files are reviewed, explicitly continue the operation. Verify the completed merge includes both `docs/current-only.md` and `docs/incoming-only.md`.

Use separate folders for the rebase, cherry-pick, and stash cases so completing a merge does not consume the other scenarios. During a rebase, Git's Current side is the branch being replayed onto, and Incoming is the commit being replayed.

For `submodule-conflicts`, the resolver shows guidance rather than merging source text. In that fixture's embedded terminal, choose one of the available submodule branches and stage the gitlink:

```bash
git -C packages/shared checkout main
git add packages/shared
```

Then continue the parent merge. Choosing `alternative-currency` instead exercises the other submodule revision.

## Bisect checklist

In `bisect-playground`, start Bisect with:

- Good revision: `demo/bisect-good`
- Bad revision: `demo/bisect-bad`

At each selected commit, inspect `src/pricing.js`: `price * quantity` is good; `price + quantity` is bad. Mark that verdict in the wizard until the culprit is **`perf(pricing): simplify the total calculation`**. Its full hash is in `manifest.json`. Reset Bisect afterward. A fresh copy can exercise Skip and abort independently.

## Remote operations

Every `origin` points to the local `origin.git`. Fetch and push work offline. `remote-client` starts with a local contribution and a separate teammate contribution, producing a real 1-ahead/1-behind state. Pull and reconcile these commits, then push. Make another commit in `remote-collaborator` and push it to exercise subsequent fetches.

You can also try Git Workbench's clone dialog with the full `origin.git` path, choosing a new destination. The local submodule uses Git's file transport. For explicit submodule initialization in a newly cloned fixture, run this scoped command rather than changing global Git settings:

```bash
git -c protocol.file.allow=always submodule update --init
```

## Features requiring separate setup

The local fixtures provide data for Git and UI features. Live GitHub/GitLab/Bitbucket requests, provider connection/token checks, AI responses, and packaged updater/download/install behavior require their respective account, network, or packaged-build setup. Local `origin` cannot host pull requests. For live provider checks, publish a separate disposable repository to the chosen provider and configure it in **Settings → Pull Request Providers**.

The generator sets a fictional identity, disables signing/hooks, and permits local file transport only in the generated repositories. It does not alter global Git configuration. `manifest.json` records the initial statuses and conflict files; it is a snapshot, so it will not change as you experiment.
