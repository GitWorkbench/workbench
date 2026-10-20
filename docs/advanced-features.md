# Advanced Git workflows

Repository workflows are available from **Actions** and the command palette. The multi-repository dashboard and recent repositories share the **Home** tab; review worktrees are opened from a hosted request. Use disposable repositories when trying workflows that change history or create worktrees.

## 1. Review a hosted pull or merge request

1. Connect in **Settings → Pull Request Providers**. For GitHub, choose **Sign in with GitHub**, approve the device code in your browser, then choose repositories on GitHub. A manual token is also supported with Pull requests read/write, Contents read, Checks read and Commit statuses read. GitLab uses an `api` token. Bitbucket Cloud uses an Atlassian account email and API token with repository read and pull request read/write permissions. Gitea uses a per-server token with read:user, write:repository, and write:issue. See [GitHub sign-in](github-sign-in.md) and [Gitea connections](gitea-connections.md).
2. Open **Actions → Requests**, select a remote and request, then choose **Review changes, conversation & CI**.
3. Browse files and select an old/new line number to target a comment. Conversation supports replies to inline GitHub/Gitea comments and GitLab/Bitbucket discussions. Gitea inline replies require a server version providing that API; older servers return an actionable error and preserve the draft. General GitHub conversation items can receive a new top-level review comment.
4. Choose Comment, Approve, or Request changes and explicitly submit. Messages remain unpublished until submission. If the source revision changes, submission is rejected and the draft is kept.
5. Use the CI tab to inspect checks/statuses for the loaded source revision. Refresh to fetch new results; a missing-permission warning is separate from an empty result list.

Native GitLab change requests use the host's GraphQL capability. Hosts without that capability explicitly show **Request changes (discussion)**: this posts the request as a discussion and withdraws your approval; it does not set a native review-blocking state. Multi-step provider actions report partial success rather than encouraging a duplicate review submission. Provider pagination and missing/binary patches are disclosed. No HTML from provider descriptions/comments is executed.

Local demo origins cannot host reviews or CI results. Use a separate hosted demo repository for these account-dependent checks.

## 2. Save and restore a workspace

1. Open a dirty repository and choose **Actions → Restore Points → Save point**. A point includes HEAD, the index/working-tree split, and non-ignored untracked files. Creating it does not clear your changes or add a stash entry.
2. Inspect its label, branch, timestamp, and saved file status. Points are also created before reset, file/hunk/line discard, pull, and history rewrites. A failed snapshot stops the destructive action.
3. Commit or stash your current changes until the working tree is clean. Select the point and choose **Restore into new branch**, read the confirmation, then confirm.
4. Recovery checks out a new branch at the saved HEAD and reapplies the saved index and working files. The original branch and restore point are kept. If recovery stops, review the recovery branch; the point remains available.
5. Delete unwanted points explicitly. They are stored under local custom Git refs, so normal branch pushes do not publish them. A mirror push includes custom refs.

Ignored files, unsaved editor buffers, and files inside submodule working directories are excluded. Submodule revisions are recorded, and recovery does not recursively update their working directories. Conflicted indexes cannot be snapshotted. An unborn repository uses an empty baseline commit on its recovery branch. For the demo, save a point in `workspace`, commit its changes, then restore the point and inspect both staged/unstaged versions of `src/app.ts` and the untracked note.

## 3. Remember repeated conflict resolutions

1. Open **Actions → Conflict Resolution Memory** and enable it for the repository. This sets Git's local automatic rerere application to false so Git Workbench can offer suggestions first. It does not alter global Git configuration.
2. Resolve and Apply a text conflict. The app records the conflict and reviewed result in Git's local rr-cache, using a temporary worktree and index for cache operations.
3. When that conflict recurs, the merge editor offers **Preview remembered result**. Review the complete result and choose **Use reviewed result** to load an undoable editor draft. Apply still explicitly controls saving/staging.
4. **Forget this resolution** discards the matching cached resolution. Disabling memory retains the cache and leaves Git's automatic application disabled.

To repeat a conflict in the demo, enable memory in `merge-standard`, resolve and Apply its JSON file without continuing the merge, abort the merge, and merge `demo/simple-incoming` again. Binary, submodule, and deletion-only conflicts use explicit file-side choices. If automatic rerere is separately re-enabled in Git, the settings view warns that Git may already fill working files.

## 4. Compare a branch before and after rewriting

1. Perform an in-app branch/interactive rebase, reword, drop, or reorder operation. Pulls configured to rebase are also recorded when an upstream is available. The app retains the old base/tip before the operation and new base/tip after completion.
2. Completed rewrites that change HEAD automatically open **Rebase & Rewrite Comparison**. Conflict-paused sessions remain paused until Continue/Abort; interactive rebase no longer reloads the app after success.
3. Filter unchanged, changed, removed, and added commits. Select a row to inspect its patch comparison, or open the full old/new commit details. Copy raw output for sharing or inspecting a long result.
4. Reopen saved records from Actions after an app restart. A session ended outside the app is labeled **ended**, since Git Workbench cannot confirm whether it completed or was aborted. Refresh the records after an external continuation.
5. For a manual comparison, select **Custom ranges** and enter a base and tip for each side. Bases are excluded and tips included. Inputs are resolved to commit hashes before comparison.
6. Delete a finished record to release its saved references. This does not alter branches or working files.

Requires Git 2.19+. The comparison uses Git range-diff; patch matching is heuristic and merges are excluded. Squashing or a large rewrite can show removed/added commits instead of a one-to-one match. Each range is capped at 500 non-merge commits, execution at 30 seconds, and rendered previews are explicitly bounded. Root commit rewrites use an empty baseline so the original root is included. Saved refs are kept out of the main graph.

Use the clean `history-playground` demo for reword/drop/squash operations. Restore points created before those operations provide a separate recovery path.

## 5. Monitor pinned repositories

Open **Home** to manage recent repositories and the pinned dashboard together. Use the pin button beside a recent repository to give it a status card; pinned entries move out of the recent list so each repository appears once. Unpinning returns it to the recent list if it is still in your history. Pin choices persist locally (up to 50), including existing pins from the former Dashboard page.

Use the shared search to find repositories by name or path. **All pinned**, **With changes**, and **Needs attention** filter status cards; attention means conflicts or an unavailable folder. Cards show branch, changed/staged files, conflicts, and ahead/behind against the last fetched upstream. **Refresh** reads each pinned workspace with at most three concurrent scans. Opening Home and refreshing local status do not fetch or change the active repository. Your existing workspace stays selected in the background; click its tab or **Resume** to return without reopening it.

**Check requests** explicitly contacts the configured hosting provider and shows up to 100 loaded open requests per repository. Expand a card's request section for links and provider details. Connection/setup errors are shown separately from a successful empty request list. PR data stays cached while Home is open and local refresh does not replace it. Use **Connect your providers** to open the account settings.

**Open repository**, **Create repository**, preferences and the usage guide are available on Home. Recent entries can be removed from the list without deleting repository files. **Ctrl/Cmd+T** and the command palette's **Go Home** action open the same page; **Ctrl/Cmd+F** focuses repository search there. Home uses a single navigation tab and switches to a stacked layout on smaller windows. Missing pinned folders stay visible so you can reconnect or unpin them.

## 6. Open a PR or MR in a worktree

Choose **Requests** beside **List** in the left sidebar. Its separate view shows **Pull Requests** or **Merge Requests** based on the selected remote’s provider. List keeps branches, tags, remotes, worktrees, and stashes separate; each view retains its own filter. While the Requests view is selected, it reads the active repository’s provider context on repository/branch/remote changes and after closing the request workspace. It does not contact the provider while List is selected. Refresh contacts the provider explicitly; no timer polls in the background. Select a remote when several are configured. Filters match request title, number, author, and branch. Up to 100 requests are listed per remote. No-token, offline, and API failures remain inline, with settings/retry actions. Use **+** or **Create request…** in a commit’s context menu to prepare a request from the **checked-out branch**, regardless of which historical commit was clicked. Nothing is pushed until you submit the creation form.

In a hosted request's review screen, choose **Open in worktree…**, choose a parent folder outside the current repository, and enter a new folder and local branch name. Create fetches the reviewed revision, verifies its exact hash, and creates an independent checkout. **Open review workspace** opens it in Git Workbench; it remains listed in the Worktrees manager for later removal.

GitHub and Gitea use `refs/pull/<id>/head`; GitLab uses `refs/merge-requests/<iid>/head`; Bitbucket Cloud fetches the source branch from its source repository, including forks. Git authentication uses your existing SSH/HTTPS Git setup; the provider token reads request metadata. If the PR changes during fetch, refresh the review and retry. Existing destinations and branch names are rejected. The current checkout, index and dirty files are preserved. No dependencies or project scripts run, checkout hooks are disabled for creation, and LFS smudging is skipped. Fetch can time out after two minutes. Closed GitLab requests whose review refs have expired may no longer be fetchable.

Provider references: [GitHub local PR checkout](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/checking-out-pull-requests-locally), [GitLab merge request refs](https://docs.gitlab.com/user/project/merge_requests/merge_request_troubleshooting/), [Bitbucket source checkouts](https://support.atlassian.com/bitbucket-cloud/kb/how-to-locally-fetch-and-checkout-a-pull-request/).

## 7. Split a commit visually

Choose **Split into smaller commits…** from a commit's context menu, or **Actions → Split Commit…**. Load a commit on the current local branch; the checkout must be clean, with no active merge/rebase/cherry-pick. Assign each file or text hunk to one of 2–20 commits and write the messages. Whole-file controls move every piece together. Binary files, adds/deletes, submodules, and mode changes remain whole-file pieces. Renames appear as delete/add pieces.

**Preview split** builds the new commits against a temporary index, checks that every piece is assigned once, and verifies that the original commit's final tree is reproduced exactly. It does not change the real index, working files, or branch. Interdependent hunks that cannot apply in the chosen order fail before any branch change. Preview objects are kept under local refs and appear in **Saved previews…** after restarting; discard unwanted previews explicitly.

**Apply split** requires the same clean branch and unchanged HEAD, creates a restore point, and moves that branch with an expected-old-hash guard. The complete branch tip tree must still be identical. Later commits retain their messages, authors, and file trees, with rewritten parent hashes. A comparison record opens after success. Other branches and tags are not moved. Up to 200 later commits are supported; selected merges and histories containing later merge commits are rejected. Committer information is renewed, cryptographic signatures are not preserved, and no hooks or pushes are run. Coordinate before rewriting published history.

Implementation uses [Git's cached patch application](https://git-scm.com/docs/git-apply) and [commit-tree](https://git-scm.com/docs/git-commit-tree.html).

## 8. Manage stacked branches and requests

Open **Actions → Stacked Branches & Requests…** (also in the command palette). Link each local child branch to its parent; the hierarchy shows the commit count and saved boundary for each child. Links and boundary refs are shared by the repository's worktrees, remain local, reject cycles, and never move branches by themselves. Changing a parent keeps the original boundary so a squash-merged or rebased parent is not accidentally replayed with the child's commits. **Recalculate boundary** deliberately replaces it with the current merge base; use that for initial setup or repairing an incorrect link.

Select a base branch and **Build restack preview**. With Git 2.38+, the app rebases up to 10 linked descendants (100 linear commits each) in dependency order inside a separate detached worktree. It disables update-refs, automatic stash, automatic rerere and hooks for preview commands. No source branch or current workspace is changed. A pause is saved durably: open the preview workspace, resolve the conflict with the merge editor, Continue its rebase, then reopen Stacked Branches from an original workspace and **Resume preview**. If you abort that rebase, remove the preview and build another. Unexpected interruption is treated conservatively; an ambiguous result is never applied automatically.

Review the old/new tips, check out an unaffected branch (normally the base), and commit/stash its dirty files before **Apply to branches**. None of the affected branches may be checked out in any worktree. Apply saves a workspace restore point and private original-tip refs, then uses one [Git ref transaction](https://git-scm.com/docs/git-update-ref.html) to verify the base/source hashes and update the branch tips and boundary refs together. Comparisons are saved per branch. Nothing is pushed. Avoid concurrent external Git changes while applying. Signatures and committer metadata can change during rebases.

After a parent merges on the provider, explicitly change the child's local parent to the new base, preview and apply the stack, and use **Retarget an open request** (using the host’s request name) to update its target. Requests load from the selected configured remote. Retarget rechecks the open state, head hash and previous target immediately before the provider update; provider APIs do not offer a shared atomic conditional-update mechanism. This does not auto-detect merges, publish branches, or force-push rewritten history. Supports [GitHub](https://docs.github.com/en/rest/pulls/pulls), [GitLab](https://docs.gitlab.com/api/merge_requests/), Bitbucket Cloud, and [Gitea](https://docs.gitea.com/api/operations/repo-edit-pull-request/).

Saved previews keep original/new tips reachable. **Remove preview** aborts its active rebase and removes the clean preview worktree and saved tips, after confirmation; extra untracked/dirty files block removal. Switch away from the preview before removing it. Completed comparison records retain their own refs. To recover a branch manually before discarding a preview, create a recovery branch from the displayed original tip. A repository-local operation lock prevents concurrent stack actions; if the app crashes while holding it, confirm no stack action is running before removing `git-workbench-stacks/operation.lock` inside the common Git directory.

## 9. Manage Git LFS assets

Open **Actions → Git LFS Manager…** (also in the command palette). The app detects the existing Git LFS command line tool; install it separately from [git-lfs.com](https://git-lfs.com/) if missing. A recent version with JSON output for `track` and `ls-files` is required for the full asset view. **Configure local LFS** writes repository filter configuration and installs the pre-push hook. Manual downloads are selected by default (`--skip-smudge`). Existing custom hooks are not overwritten; if setup fails, filters may already be written and `git lfs install --manual` explains how to integrate your hook.

Add a glob such as `*.psd` or use **Literal filename** for a path containing glob characters. Tracking changes save a restore point and modify root `.gitattributes`; review, stage and commit that file. Rules from nested/global attribute sources are displayed, with root rules removable in the UI. Tracking does not migrate existing history or automatically re-stage existing assets. The asset table shows SHA-256, size, local cache presence and whether the working copy is a full asset or a pointer/absent file. Inventory is capped at 10,000 files; the table renders 500 filtered matches at a time.

Choose a configured remote and an explicit action: **Fetch to cache**, **Pull assets** (fetch and populate working files), **Checkout cached** (no network), or **Upload current revision** (confirmation required). Transfers bind to the loaded HEAD and use Git's authentication and configured include/exclude filters. Upload transfers LFS objects, not Git branch refs. Git LFS leaves modified working files alone; merge/rebase/cherry-pick operations block Pull/Checkout. In-app writes for that workspace wait while a transfer runs.

Progress shows the current file, file count and bytes for that file. **Cancel transfer** terminates the process tree; partially downloaded/uploaded objects are retained for retry. Closing the manager keeps the operation running; reopen it in the same repository to inspect/cancel. Closing the app cancels active transfers. Operations time out after 30 minutes; provider quota/authentication errors are reported. No cache pruning or history migration runs automatically. Sparse/partial checkouts may require the relevant `.gitattributes` files to be present for LFS pulls.

References: [Git LFS commands](https://github.com/git-lfs/git-lfs/tree/main/docs/man), [progress format](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc).

## 10. Choose folders with sparse checkout

Open **Actions → Sparse Checkout…** (also in the command palette). Requires Git 2.37+. Expand the lazy-loaded directory tree and select the folders to keep, or enter a repository-relative directory path. Selecting a parent includes its descendants. Cone mode also includes root files and files immediately inside ancestor folders; no selected directories means root files only. Individual files and submodule initialization are not controlled by this picker.

**Preview selected folders** counts included/excluded index entries and files that will be populated or removed from the worktree; examples show up to 100 paths. Counts respect `core.ignoreCase`. The revision, sparse rules and index flags are fingerprinted; a stale preview is rejected. Apply requires a clean checkout with no active merge/rebase/cherry-pick. Non-ignored untracked files must be moved, committed or stashed first. Ignored files in directories at risk of pruning and existing files at paths that would be populated block Apply. Move the displayed blockers aside and preview again. The app never runs clean or force-overwrites those files.

Apply saves a Git workspace restore point and a separate checkout-layout backup, then invokes Git's worktree-scoped sparse settings with a full index (no sparse-index extension). Excluded tracked files stay in history. LFS automatic downloads and recursive submodule updates are disabled for the layout change. Use the LFS manager afterward if you need full asset content. Sparse checkout reduces populated working files; it does not remove objects already downloaded to the Git database.

**Preview full checkout** disables sparse rules and repopulates tracked files. **Saved layouts** shows the latest 50 backups and restores rules on the current revision, saving the current layout first. It does not switch branches or reset to the saved HEAD. Old cone folder names remain valid saved rules even if absent from the current tree. Backups are scoped to this worktree in `$GIT_DIR/git-workbench-sparse-layouts/`; JSON includes the original raw rules for manual recovery. Workspace restore points and checkout layouts are separate because a Git snapshot does not preserve sparse configuration.

Existing non-cone glob layouts are displayed without converting them silently. Restore a full checkout first before selecting folders; original rules are backed up. Restoring non-cone rules requires moving all ignored files aside, since the folder editor cannot predict arbitrary glob removals. Directory names containing control characters or backslashes require Git's command line. No tests, typecheck, or live sparse layout changes were run during this implementation.

Reference: [Git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout).
