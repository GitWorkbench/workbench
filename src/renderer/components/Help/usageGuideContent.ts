export type GuideCategoryId = 'start' | 'daily' | 'collaboration' | 'history' | 'tools' | 'preferences';

export const guideCategories: Array<{ id: GuideCategoryId; title: string; description: string }> = [
  { id: 'start', title: 'Start here', description: 'Open a project, find your way around, and read its history.' },
  { id: 'daily', title: 'Everyday Git', description: 'Review changes, make focused commits, and keep branches in sync.' },
  { id: 'collaboration', title: 'Work together', description: 'Connect providers, review requests, and resolve conflicts deliberately.' },
  { id: 'history', title: 'History & recovery', description: 'Recover work, reshape commits, and inspect the result of a rewrite.' },
  { id: 'tools', title: 'Repository tools', description: 'Handle large assets, large repositories, releases, and regressions.' },
  { id: 'preferences', title: 'Make it yours', description: 'Tune the workspace, identities, shortcuts, and command tools.' }
];

export type GuideActionId =
  | 'open-repo' | 'create-repo' | 'home' | 'providers' | 'ai-settings'
  | 'appearance-settings' | 'git-settings' | 'shortcuts' | 'palette' | 'terminal'
  | 'pull-requests' | 'restore-points' | 'resolution-memory' | 'range-comparison'
  | 'branch-stacks' | 'lfs' | 'sparse' | 'reflog' | 'worktrees' | 'git-flow'
  | 'bisect' | 'changelog';

export interface GuideTopic {
  id: string;
  category: GuideCategoryId;
  title: string;
  summary: string;
  minutes: number;
  level: 'Essentials' | 'Intermediate' | 'Advanced';
  keywords: string[];
  location: string;
  prerequisites?: string[];
  steps: Array<{ title: string; description: string }>;
  tips?: string[];
  caution?: string;
  actions?: Array<{ id: GuideActionId; label: string }>;
  related?: string[];
}

export const guideTopics: GuideTopic[] = [
  {
    id: 'getting-started', category: 'start', title: 'Open or create your first repository',
    summary: 'Start with an existing local project or initialize a folder, then understand the three parts of the workspace.',
    minutes: 4, level: 'Essentials', keywords: ['open', 'initialize', 'init', 'new', 'folder', 'first', 'setup'],
    location: 'Home → Open repository / Create repository',
    prerequisites: ['Git installed on your computer and available to Git Workbench.'],
    steps: [
      { title: 'Choose a local project', description: 'On Home, choose Open repository and select the project folder containing your Git repository. Opening a project reads its existing files and history; it does not create a hosted repository.' },
      { title: 'Or initialize a folder', description: 'Choose Create repository. Set its directory and initial branch, then decide whether to add a README, a .gitignore template, and an initial commit. Review these choices before creating it.' },
      { title: 'Learn the workspace', description: 'The left sidebar lists branches, tags, remotes, stashes, and worktrees. The center shows commit history. Selecting a commit or the WIP row opens its details and changed files.' },
      { title: 'Keep projects in tabs', description: 'Open another repository when needed and switch with its tab. Use the Home tab to find recent projects or return to your active workspace without reopening it.' }
    ],
    tips: ['If an initial commit fails because Git has no author identity, configure your name and email in Settings → Commit Profiles & GPG.', 'For an existing remote project, clone it with your normal Git setup first, then open its local folder.'],
    actions: [{ id: 'open-repo', label: 'Open a repository' }, { id: 'create-repo', label: 'Create a repository' }],
    related: ['home-workspaces', 'commit-graph', 'staging-commits', 'preferences']
  },
  {
    id: 'home-workspaces', category: 'start', title: 'Use Home as your project hub',
    summary: 'Find recent projects and monitor pinned repositories in one place without switching your active checkout.',
    minutes: 3, level: 'Essentials', keywords: ['home', 'launchpad', 'dashboard', 'recent', 'pin', 'multiple', 'workspace'],
    location: 'Home tab · Ctrl/Cmd+T',
    steps: [
      { title: 'Find a repository', description: 'Use Home’s shared search to filter project names and paths. Open a recent entry, or use Resume to return to a workspace that is already open.' },
      { title: 'Pin projects you watch', description: 'Use a recent repository’s pin button to give it a status card. Pinned projects leave the recent list so each project appears once. Unpin to return it to your recent history.' },
      { title: 'Read local status', description: 'Pinned cards show branch, staged and changed files, conflicts, and ahead/behind counts. Use All pinned, With changes, or Needs attention to narrow the cards; unavailable folders also need attention.' },
      { title: 'Refresh the information you need', description: 'Refresh rescans local status. Check PRs / MRs explicitly contacts the configured provider; expand a card’s request section to inspect its loaded requests and links.' }
    ],
    tips: ['Ahead/behind compares with the last fetched upstream. A local refresh does not fetch new commits.', 'Removing a recent entry does not delete its folder. Missing pinned folders stay visible until you reconnect or unpin them.'],
    actions: [{ id: 'home', label: 'Go Home' }, { id: 'providers', label: 'Connect providers' }],
    related: ['getting-started', 'sync-remotes', 'providers']
  },
  {
    id: 'commit-graph', category: 'start', title: 'Read and customize the commit graph',
    summary: 'Follow branch lanes, inspect a commit beside the pointer, and choose which metadata stays visible.',
    minutes: 4, level: 'Essentials', keywords: ['graph', 'history', 'columns', 'author', 'date', 'time', 'sha', 'hover', 'resize', 'filter'],
    location: 'Center commit list → column gear and commit rows',
    prerequisites: ['An open repository.'],
    steps: [
      { title: 'Follow commits and references', description: 'Colored lanes connect commits to their parents. Branch and tag labels mark named positions in history. Select a row to read the full message, author, parent hashes, and changed files in the details panel.' },
      { title: 'Inspect without changing selection', description: 'Pause over a commit to open its hover card near the pointer. It summarizes author, time, message, file changes, and SHA; use its available copy or provider links when needed.' },
      { title: 'Choose metadata columns', description: 'Open the gear at the end of the commit header to show or hide Author, Date/time, and SHA. When Date/time is hidden, relative time such as “2 hours ago” stays beside the commit message. Enabling it shows the formatted date and time in its own column.' },
      { title: 'Make the list fit', description: 'Drag column dividers to resize visible columns. Use Reset column widths from the gear menu to start over. Search with the toolbar filter, and adjust graph row density in Typography & Density if rows feel crowded.' },
      { title: 'Review work in progress', description: 'Select the WIP row when it appears to inspect staged and unstaged changes. Right-click a historical commit for operations on that revision; read the target and current branch before choosing an action.' }
    ],
    tips: ['Selecting or hovering a commit does not check it out.', 'Load more commits at the bottom when the revision you need is beyond the currently loaded history.'],
    related: ['staging-commits', 'diff-review', 'branches-tags', 'preferences']
  },
  {
    id: 'staging-commits', category: 'daily', title: 'Build a focused commit',
    summary: 'Separate the changes you want to publish from unfinished work and verify exactly what the commit will contain.',
    minutes: 5, level: 'Essentials', keywords: ['stage', 'unstage', 'index', 'wip', 'commit', 'message', 'profile'],
    location: 'WIP row → changes and commit editor',
    prerequisites: ['An open repository with changed files.', 'A configured Git author identity.'],
    steps: [
      { title: 'Inspect the working changes', description: 'Select WIP and review the Unstaged files. Click a file to open its diff. Check additions, deletions, renames, and untracked files before including them.' },
      { title: 'Stage only related work', description: 'Use a file’s Stage button to include that file, or Stage Hunk in its diff for a smaller selection. Stage all is useful only when every pending change belongs in the same commit.' },
      { title: 'Verify the staged version', description: 'Open files from the Staged list to review the version about to be committed. Unstage a file or hunk if it includes unrelated work; unstaging keeps the working edits.' },
      { title: 'Choose identity and write the message', description: 'Use the commit profile selector if you maintain different identities. Write a clear summary and any useful explanation, or generate a draft and edit it. Confirm the staged list once more.' },
      { title: 'Commit and inspect', description: 'Choose Commit or press Ctrl+Enter in the commit editor. Inspect the new graph row and remaining WIP changes. Committing is local; use Push separately when you are ready to publish.' }
    ],
    tips: ['A file can contain both staged and unstaged edits. Review it from each list to see the correct version.', 'Message generation stages all changes when nothing is staged. Stage your intended subset before using the generator.'],
    caution: 'Discard removes working changes; it is different from Unstage. Review a restore point before relying on recovery, because ignored files and submodule working files are excluded.',
    related: ['diff-review', 'ai-assistant', 'sync-remotes', 'restore-points']
  },
  {
    id: 'diff-review', category: 'daily', title: 'Review diffs, blame, and file history',
    summary: 'Move from a changed-file list to the exact patch and the history behind a line.',
    minutes: 4, level: 'Essentials', keywords: ['diff', 'unified', 'split', 'side by side', 'blame', 'file history', 'hunk', 'lines', 'compare'],
    location: 'Commit or WIP details → select a file',
    prerequisites: ['An open repository and a selected changed file.'],
    steps: [
      { title: 'Open the correct version', description: 'Select a file under a historical commit, Staged, or Unstaged. The source matters: a committed patch, an index patch, and uncommitted edits can show different changes for the same path.' },
      { title: 'Choose a reading mode', description: 'Switch between Unified and Split to read one combined patch or old/new sides. Maximize the diff for more room, or open the file in your external editor from the diff toolbar.' },
      { title: 'Act on a precise change', description: 'Use Stage Hunk or Discard Hunk for an unstaged patch, and Unstage Hunk for a staged one. In a historical patch, Revert Hunk applies an inverse change to the working tree; it is a modifying action, not a way to stage that old revision.' },
      { title: 'Trace the reason for a line', description: 'Use Blame to inspect the commit and author associated with lines, and File History to follow earlier revisions of the file. Return to Diff to compare the patch you originally opened.' },
      { title: 'Compare two revisions', description: 'Select a commit, right-click another, and choose Compare with selected. Inspect the resulting changed files; use Swap to reverse base and target when checking the opposite direction.' }
    ],
    tips: ['The path/tree controls in commit details let you switch between a flat list and folder hierarchy.', 'A missing or binary patch may need an external viewer; a small or empty text preview does not prove an asset is unchanged.'],
    related: ['staging-commits', 'commit-graph', 'range-comparison']
  },
  {
    id: 'ai-assistant', category: 'daily', title: 'Generate and review commit messages',
    summary: 'Use a local rule-based draft or configure an optional model, then review the wording before committing.',
    minutes: 4, level: 'Intermediate', keywords: ['ai', 'smart', 'heuristic', 'message', 'ollama', 'openrouter', 'groq', 'gemini', 'explain'],
    location: 'Commit editor → generator menu · Settings → AI Assistant',
    prerequisites: ['Changed files to summarize.'],
    steps: [
      { title: 'Stage the intended scope first', description: 'Choose the files or hunks that belong together. If nothing is staged, generating a message automatically stages all pending files, so set the staged scope before asking for a draft.' },
      { title: 'Start with Smart Heuristic', description: 'Choose Smart Heuristic for a local, rule-based message without a model request. The result is a draft based on the changes; edit the summary to explain your intent.' },
      { title: 'Configure an optional model', description: 'In Settings → AI Assistant, choose your provider, model, endpoint, and any required key. Select a commit style. Test AI Model explicitly contacts the configured provider to check the connection.' },
      { title: 'Generate, review, and commit', description: 'Choose AI Model in the commit generator when you want that provider to summarize the staged patch. Read the proposed message, correct unsupported claims, and review staged files before choosing Commit.' },
      { title: 'Ask about an existing commit', description: 'Select a historical commit and use Explain changes with AI in its details panel. Treat the explanation as help reading the patch, and verify conclusions against the actual changes.' }
    ],
    tips: ['A local Ollama endpoint and Smart Heuristic are different options: one calls a model server, the other uses rules.', 'Generation writes a message draft; it does not commit until you choose Commit.'],
    caution: 'Hosted model features send change content to the selected provider. Check the configured endpoint and the files involved before using them for private code.',
    actions: [{ id: 'ai-settings', label: 'Configure AI Assistant' }],
    related: ['staging-commits', 'diff-review', 'preferences']
  },
  {
    id: 'branches-tags', category: 'daily', title: 'Navigate branches and tag milestones',
    summary: 'Understand inspection versus checkout, and use branch and tag menus without losing track of the current branch.',
    minutes: 5, level: 'Essentials', keywords: ['branch', 'checkout', 'double click', 'tag', 'rename', 'upstream', 'detached'],
    location: 'Left sidebar → Local / Remote Branches / Tags',
    prerequisites: ['An open repository.'],
    steps: [
      { title: 'Inspect before switching', description: 'A single click on a branch selects its tip in the loaded graph. An inactive branch also opens a checkout confirmation; clicking the already active local branch only inspects it and does not open that dialog.' },
      { title: 'Checkout deliberately', description: 'Confirm checkout in the dialog, or double-click an inactive branch to request checkout directly. Double-clicking a remote branch also requests checkout. Review any Git error or conflict instead of assuming the switch completed.' },
      { title: 'Create or manage a branch', description: 'Use the Branch button or Local section menu to create a branch. Right-click a branch for rename, merge, rebase, upstream, push, and deletion actions. Read which branch is the source and which is current.' },
      { title: 'Create a milestone tag', description: 'Use the Tags section’s create control, the palette’s Create Tag, or a commit’s Create tag here action. Check the target revision and tag options before creating it.' },
      { title: 'Publish only when intended', description: 'A local tag is not automatically a hosted release. Use its Push Tag action for a selected remote. Branch deletion and remote deletion are separate actions; inspect each confirmation carefully.' }
    ],
    tips: ['If you check out a tag or detached revision, create a branch before making commits you want to keep working on.', 'Right-click a remote to fetch, prune stale tracking branches, edit its URL, or copy it.'],
    caution: 'Force-deleting a branch can remove its last convenient name. Keep a recovery branch or restore point for work you still need.',
    related: ['commit-graph', 'sync-remotes', 'stash', 'merge-preview', 'reflog']
  },
  {
    id: 'sync-remotes', category: 'daily', title: 'Fetch, pull, and push with confidence',
    summary: 'See remote changes before integrating them and keep Git transport authentication separate from provider sign-in.',
    minutes: 4, level: 'Essentials', keywords: ['fetch', 'pull', 'push', 'remote', 'ssh', 'https', 'sync', 'ahead', 'behind', 'authentication'],
    location: 'Toolbar → Fetch / Pull / Push · sidebar → Remotes',
    prerequisites: ['A configured remote and working Git SSH keys or credential helper.'],
    steps: [
      { title: 'Check the destination', description: 'Review the checked-out branch and its upstream. Inspect Remotes in the sidebar and use the context menu if you need to edit a URL or add the correct remote through the available add control.' },
      { title: 'Fetch first', description: 'Fetch downloads remote commits and updates tracking references. It does not merge those commits into your current branch. Read the graph and ahead/behind counters after the fetch.' },
      { title: 'Prepare before pulling', description: 'Review or set aside local changes, then choose Pull. Git’s configured integration behavior matters; a merge or rebase can pause for conflicts. Follow the operation banner rather than starting another integration.' },
      { title: 'Publish your commits', description: 'Choose Push when your local branch is ready. If no upstream exists, use the offered upstream setup or the branch menu. Confirm the intended remote and branch before publishing.' },
      { title: 'Tune background updates', description: 'In Git & Synchronization, choose whether periodic background fetch should run and its interval. Background fetch updates your view of remotes; inspect changes before explicitly integrating them.' }
    ],
    tips: ['GitHub browser sign-in enables hosted request APIs. Your SSH key or Git credential helper still authenticates fetch and push.', 'Home’s local Refresh updates filesystem status; it does not replace Fetch.'],
    caution: 'After rewriting published history, a normal push can be rejected. Coordinate with collaborators before any force update through Git; the guide does not perform a push for you.',
    actions: [{ id: 'git-settings', label: 'Open synchronization settings' }],
    related: ['branches-tags', 'providers', 'conflict-editor', 'stash']
  },
  {
    id: 'stash', category: 'daily', title: 'Set work aside with stashes',
    summary: 'Inspect a saved work-in-progress patch, reapply it, or bring back just one file.',
    minutes: 3, level: 'Essentials', keywords: ['stash', 'pop', 'apply', 'drop', 'temporary', 'uncommitted'],
    location: 'Toolbar → Stash / Pop · left sidebar → Stashes',
    prerequisites: ['An open repository with changes to set aside, or an existing stash.'],
    steps: [
      { title: 'Save the pending work', description: 'Use Stash to set aside your current changes. Inspect the resulting Stashes entry and working status before switching branches; do not assume every ignored or untracked file was included.' },
      { title: 'Inspect before restoring', description: 'Select a stash in the sidebar to open its changed-file list. Select a file to read its patch, and use the file’s apply control if only that file is needed.' },
      { title: 'Choose Apply or Pop', description: 'Apply restores the saved changes while keeping the stash. Pop attempts to restore it and remove the entry after a successful application. The toolbar Pop targets the newest stash; a row’s context menu targets that selected stash.' },
      { title: 'Review and clean up', description: 'Inspect WIP after applying. If Git reports conflicts, resolve them before continuing. Drop deletes the saved entry; use it only after confirming the work is no longer needed.' }
    ],
    tips: ['Apply is useful when you want to retain the saved patch while checking the result.', 'A stash is local work storage, not a remote backup.'],
    caution: 'Applying a stash can conflict with the current checkout. Check its target branch and keep a restore point before combining important work.',
    related: ['staging-commits', 'branches-tags', 'restore-points', 'conflict-editor']
  },
  {
    id: 'merge-preview', category: 'collaboration', title: 'Preview a merge before applying it',
    summary: 'Predict conflicting paths for two branch tips, then separately decide whether to perform the actual merge.',
    minutes: 3, level: 'Intermediate', keywords: ['merge', 'simulate', 'preview', 'pre flight', 'conflicts', 'integration'],
    location: 'Local branch context menu → Simulate Merge (Pre-Flight Conflict Check)',
    prerequisites: ['Two branches with commits to compare.'],
    steps: [
      { title: 'Confirm the receiving branch', description: 'Check out the branch that should receive the changes. In the sidebar, right-click the branch you want to merge into it and choose Simulate Merge.' },
      { title: 'Read the prediction', description: 'The simulator compares the current branch and selected branch without changing the checkout. Read whether their committed trees merge cleanly and inspect any reported conflicting paths or simulation errors.' },
      { title: 'Prepare the real workspace', description: 'Review staged, unstaged, and untracked files before proceeding. A tree-level prediction does not check whether the combined code works, and later branch changes can make the prediction stale.' },
      { title: 'Perform the merge explicitly', description: 'Choose Perform Merge only when you intend to change the current branch. If the real operation pauses, use the conflict banner and merge editor, then Continue or Abort as appropriate.' }
    ],
    tips: ['Close leaves the actual merge unstarted.', 'Preview again after either branch advances.'],
    caution: 'A clean preview predicts textual merge compatibility for those revisions. It does not guarantee behavior, build success, or absence of conflicts with pending local edits.',
    related: ['branches-tags', 'conflict-editor', 'restore-points']
  },
  {
    id: 'conflict-editor', category: 'collaboration', title: 'Resolve conflicts in the three-pane editor',
    summary: 'Compare both complete file versions, edit a result, and explicitly apply each reviewed resolution.',
    minutes: 7, level: 'Intermediate', keywords: ['conflict', 'merge', 'current', 'incoming', 'base', 'ours', 'theirs', 'resolve', 'editor'],
    location: 'Operation banner or changed-file Resolve button',
    prerequisites: ['A merge, rebase, cherry-pick, or other Git operation with conflicted files.'],
    steps: [
      { title: 'Open one conflicted file', description: 'Choose it from the operation banner or its Resolve button. Read Current and Incoming in the context of the operation, especially during a rebase; do not assume the labels always mean “my work” and “their work.”' },
      { title: 'Compare all the context', description: 'The outer panes show complete read-only sides, while Merge result is editable. Resize panes, link scrolling, or enable Show base to inspect the common ancestor around each conflict.' },
      { title: 'Resolve each block', description: 'Use gutter arrows or the conflict toolbar to accept Current, Incoming, both in either order, or the base where offered. Edit the result directly when neither side is correct. Use search and undo/redo to inspect your changes.' },
      { title: 'Confirm the intended result', description: 'Move between blocks with Alt+Up/Down. Review the whole result, including non-conflicting changes. Use Mark resolved for manually edited blocks; a marker disappearing does not by itself prove the code is correct.' },
      { title: 'Save and continue deliberately', description: 'Apply saves and stages the reviewed file. Apply & Next File moves to another conflict; on the last file, Apply & Continue explicitly resumes the paused operation. Read any remaining error before starting another action.' }
    ],
    tips: ['Closing or switching with unapplied edits asks you to confirm. Apply first if you want the draft saved to the repository.', 'Binary, symlink, deletion, and submodule conflicts need file-level choices or the displayed Git guidance rather than normal text-block editing.'],
    caution: 'If the file or index changed outside the editor, reload and review it again. During a paused operation, use Continue or Abort for that operation instead of trying a fresh merge or rebase.',
    related: ['merge-preview', 'resolution-memory', 'rebase-history', 'restore-points']
  },
  {
    id: 'resolution-memory', category: 'collaboration', title: 'Reuse a reviewed conflict resolution',
    summary: 'Enable repository-local memory for recurring text conflicts while keeping the final save under your control.',
    minutes: 4, level: 'Advanced', keywords: ['rerere', 'remember', 'memory', 'reuse', 'conflict', 'resolution', 'suggestion'],
    location: 'Actions → Conflict Resolution Memory',
    prerequisites: ['An open repository; recurring text conflicts make this most useful.'],
    steps: [
      { title: 'Enable memory for this repository', description: 'Open Conflict Resolution Memory and enable suggestions. The setting is local to the repository and turns off Git’s automatic rerere application here so a remembered result can be offered for review first.' },
      { title: 'Resolve and record an example', description: 'Resolve a text conflict in the merge editor and choose Apply. The reviewed result becomes available for a matching repeated conflict; existing unrelated resolutions are not a guarantee of a match.' },
      { title: 'Preview when the conflict returns', description: 'Choose Preview remembered result in the editor. Inspect the complete candidate, then Use reviewed result to load it as an undoable draft only if it still fits the code.' },
      { title: 'Apply or forget deliberately', description: 'Edit as needed and choose Apply to save and stage. Use Forget this resolution to remove a matching cached result, or disable suggestions while retaining the cache.' }
    ],
    tips: ['A preview does not overwrite the working file.', 'If another Git tool re-enables automatic rerere, read the settings warning: Git may already have filled parts of the working file.'],
    caution: 'A previously correct resolution may be wrong after surrounding code changes. Always review it. Binary, submodule, and deletion-only conflicts use explicit side choices.',
    actions: [{ id: 'resolution-memory', label: 'Open conflict resolution memory' }],
    related: ['conflict-editor', 'merge-preview']
  },
  {
    id: 'providers', category: 'collaboration', title: 'Connect GitHub, GitLab, or Bitbucket',
    summary: 'Authorize the hosted request workspace and understand which connection controls API access versus Git transport.',
    minutes: 5, level: 'Essentials', keywords: ['github', 'sign in', 'device', 'login', 'gitlab', 'bitbucket', 'token', 'provider', 'account', 'permissions'],
    location: 'Settings → Pull Request Providers',
    prerequisites: ['An account on the supported provider and a secure operating system keychain.'],
    steps: [
      { title: 'Sign in to GitHub in your browser', description: 'Choose Sign in with GitHub. Git Workbench shows a device code and opens GitHub. Copy the displayed code, enter it on GitHub, and authorize Git Workbench Desktop. Enter passwords and verification codes only on GitHub.' },
      { title: 'Choose repository access', description: 'After sign-in completes, use Choose repositories on GitHub to install the app for the projects you want. An organization owner may need to approve access. Return and choose Refresh access, then refresh the request workspace.' },
      { title: 'Or use a manual provider token', description: 'GitHub’s manual token fallback needs Pull requests read/write and Contents read; CI also needs Checks read and Commit statuses read. GitLab needs an api token. Bitbucket Cloud needs an API token with repository read and pull request read/write plus the Atlassian account email.' },
      { title: 'Open a matching hosted repository', description: 'Open a local repository with a supported remote, then use Actions → Pull Requests / Merge Requests. GitHub.com, GitLab.com, self-managed GitLab, and Bitbucket Cloud are supported. For an unrecognized GitLab host, select GitLab explicitly.' },
      { title: 'Manage the connection', description: 'Use Switch GitHub account for another browser authorization, or Disconnect to remove this device’s stored credentials. To revoke access on GitHub itself, use its Authorized GitHub Apps or Installed GitHub Apps settings.' }
    ],
    tips: ['Signing in and installing for selected repositories are separate steps. An installation count alone does not prove a particular repository is accessible.', 'GitHub sessions refresh as needed. If revoked or no longer refreshable, reconnect. Linux needs a secure keyring; a plain-text fallback is not accepted.'],
    caution: 'Provider connection does not configure SSH keys or the Git credential helper used for fetch and push. GitHub Enterprise and Bitbucket Data Center are not supported in this workspace.',
    actions: [{ id: 'providers', label: 'Connect a provider' }],
    related: ['pull-requests', 'sync-remotes', 'review-worktrees']
  },
  {
    id: 'pull-requests', category: 'collaboration', title: 'Create and review a pull or merge request',
    summary: 'Publish a branch, read its hosted patch and conversation, submit a review, and inspect checks for the loaded revision.',
    minutes: 7, level: 'Intermediate', keywords: ['pr', 'mr', 'pull request', 'merge request', 'review', 'approve', 'comment', 'ci', 'checks'],
    location: 'Actions → Pull Requests / Merge Requests',
    prerequisites: ['A supported hosted remote and configured provider connection.', 'Git push authentication for creating a request.'],
    steps: [
      { title: 'Select the remote and request', description: 'Open the request workspace, select the correct remote, and refresh. Inspect source/target branches, author, draft state, and provider links before selecting a request.' },
      { title: 'Create from a prepared branch', description: 'To open a new request, check out your source branch, commit its intended changes, and complete the creation form. Creation pushes that branch using your normal Git authentication before contacting the provider. Uncommitted edits are not included.' },
      { title: 'Review the loaded revision', description: 'Choose Review changes, conversation & CI. Browse changed files and read the patch. Select an old or new line number when targeting an inline comment; reply in the conversation where supported.' },
      { title: 'Submit explicitly', description: 'Choose Comment, Approve, or Request changes and submit the message. Draft text stays unpublished until submission. If the source revision changed since loading, refresh and review it again; the rejected submission keeps your message.' },
      { title: 'Read CI and provider limits', description: 'Use CI for checks and statuses tied to the reviewed source revision, then refresh for newer results. Read permission warnings, missing-patch notices, and pagination limits separately from a genuinely empty result.' }
    ],
    tips: ['On older GitLab hosts, Request changes (discussion) posts a discussion and withdraws approval rather than setting a native blocking review.', 'An error can report a partial provider action. Read it before retrying to avoid a duplicate comment or review.'],
    caution: 'Submitting reviews, comments, and new requests writes to the selected hosting provider. Confirm the repository, target, and revision before submission.',
    actions: [{ id: 'pull-requests', label: 'Open pull requests' }, { id: 'providers', label: 'Provider connections' }],
    related: ['providers', 'review-worktrees', 'branch-stacks', 'sync-remotes']
  },
  {
    id: 'review-worktrees', category: 'collaboration', title: 'Use separate worktrees for parallel work',
    summary: 'Keep another checkout beside your current project, or open a hosted request at its exact reviewed revision.',
    minutes: 5, level: 'Intermediate', keywords: ['worktree', 'parallel', 'checkout', 'pr', 'review', 'separate', 'folder', 'submodule'],
    location: 'Worktrees manager · hosted review → Open in worktree…',
    prerequisites: ['An open repository; provider and Git access for hosted review worktrees.'],
    steps: [
      { title: 'Choose the kind of checkout', description: 'Use the Worktrees manager for another branch or revision, or Open in worktree from a hosted review to use that request’s loaded source revision. These are separate working folders sharing repository history.' },
      { title: 'Choose a fresh destination', description: 'For a hosted request, choose a parent folder outside the current repository and enter a new folder and local branch name. Existing destinations or branch names are rejected rather than reused silently.' },
      { title: 'Create and open', description: 'The request flow fetches and verifies the exact reviewed hash, then offers Open review workspace. If the request moved during fetch, refresh its review and retry. Your original checkout’s pending files stay in place.' },
      { title: 'Prepare the project yourself', description: 'Install dependencies or run project setup only after you choose to do so. Hosted review creation does not run project scripts; LFS assets are not downloaded automatically and may need the LFS manager.' },
      { title: 'Remove only when finished', description: 'Open a listed worktree from the sidebar or manager to revisit it. Commit or move any work you need before requesting removal, and read which folder and branch will be affected.' }
    ],
    tips: ['A branch generally cannot be checked out in two worktrees at once. Create a separate local branch when you need independent work.', 'The sidebar can also open a submodule in its own tab; a submodule is a separate repository rather than a normal folder.'],
    caution: 'Treat code from a request as code to review before running. The worktree flow does not automatically install dependencies, execute setup, or prove it is safe to run.',
    actions: [{ id: 'worktrees', label: 'Open worktrees manager' }, { id: 'pull-requests', label: 'Open hosted requests' }],
    related: ['pull-requests', 'lfs', 'branch-stacks']
  },
  {
    id: 'restore-points', category: 'history', title: 'Save and restore a workspace snapshot',
    summary: 'Preserve HEAD plus staged, unstaged, and non-ignored untracked work, then recover into a new branch.',
    minutes: 5, level: 'Essentials', keywords: ['restore', 'snapshot', 'backup', 'save point', 'recover', 'discard', 'reset', 'undo'],
    location: 'Actions → Restore Points',
    prerequisites: ['An open repository without a conflicted index to save; a clean workspace to restore.'],
    steps: [
      { title: 'Save a labeled point', description: 'Choose Save point and give the snapshot a useful label. It records HEAD, the staged/unstaged split, and non-ignored untracked files without clearing your changes or adding an ordinary stash entry.' },
      { title: 'Inspect what was captured', description: 'Select the point to read its branch, time, and file status. Points also precede several in-app destructive actions, including reset, discard, pull, and history rewrites; a failed required snapshot stops that action.' },
      { title: 'Prepare a clean recovery workspace', description: 'Commit or stash your current edits first. Choose Restore into new branch, read the confirmation, and confirm only when ready to switch to that recovery branch.' },
      { title: 'Verify recovered work', description: 'Inspect the recovery branch, staged files, working edits, and untracked files. The original branch and saved point remain available. If recovery pauses or reports an error, inspect its partial result before retrying.' },
      { title: 'Keep useful points and remove old ones', description: 'Saved points remain local until explicitly deleted. Delete only after confirming their contents are no longer needed; the point is not an external backup.' }
    ],
    tips: ['A normal branch push does not publish saved restore points, but a mirror push can include their private references.', 'Sparse checkout layouts are backed up separately from Git workspace snapshots.'],
    caution: 'Ignored files, unsaved editor buffers, and submodule working-directory contents are excluded. Submodule revisions are recorded, but recovery does not recursively restore their working files.',
    actions: [{ id: 'restore-points', label: 'Open restore points' }],
    related: ['reflog', 'stash', 'rebase-history', 'sparse']
  },
  {
    id: 'reflog', category: 'history', title: 'Find a lost commit with the reflog',
    summary: 'Find previous local branch positions after a reset, rebase, or deletion, and keep the right revision reachable.',
    minutes: 4, level: 'Intermediate', keywords: ['reflog', 'recovery', 'lost', 'deleted', 'reset', 'head', 'undo'],
    location: 'Actions → Reflog & Recovery',
    prerequisites: ['A repository with recorded local reference movements.'],
    steps: [
      { title: 'Browse recent movements', description: 'Open Reflog & Recovery and refresh. Read the operation description, timestamp, and hash to find the branch position from before the unwanted operation.' },
      { title: 'Inspect the candidate commit', description: 'Select the relevant entry and inspect its revision before acting. A nearby time is a clue, not proof that it contains every file you want.' },
      { title: 'Prefer a recovery branch for inspection', description: 'Create a recovery branch at the selected entry to keep its commit named and reachable. You can then inspect or compare it before deciding how to bring work back.' },
      { title: 'Restore the current branch only when intended', description: 'The restore action requires a clean workspace and confirmation, and creates a safety branch at the current tip first. Read both the current and selected revisions before confirming that branch movement.' }
    ],
    tips: ['Reflog and Restore Points solve different problems: reflog locates commit movements; restore points also capture pending file edits.', 'Local reflog history is not a shared provider history and can expire. Create a branch once you find an important revision.'],
    caution: 'Reflog cannot recover arbitrary uncommitted or ignored content. Do not treat it as a complete backup of your project folder.',
    actions: [{ id: 'reflog', label: 'Open reflog & recovery' }],
    related: ['restore-points', 'rebase-history', 'diff-review']
  },
  {
    id: 'rebase-history', category: 'history', title: 'Rebase and reshape commit history',
    summary: 'Reorder or combine local commits, understand the alternative history actions, and inspect the rewrite afterward.',
    minutes: 6, level: 'Advanced', keywords: ['rebase', 'interactive', 'squash', 'fixup', 'reword', 'drop', 'reorder', 'revert', 'cherry pick', 'reset'],
    location: 'Commit context menu → Interactive Rebase from here… · branch context menu → Rebase',
    prerequisites: ['A clean checkout with no active Git operation.', 'Agreement with collaborators before rewriting published commits.'],
    steps: [
      { title: 'Choose the correct base', description: 'Right-click the commit that should remain the base and choose Interactive Rebase from here. Inspect the listed commits after that base through HEAD before modifying the plan.' },
      { title: 'Build the rewrite plan', description: 'Use the arrows to move commits earlier or later. Choose Pick to retain one, Reword to edit its message, Squash or Fixup to combine it into the previous commit, or Drop to remove it. Read the order carefully.' },
      { title: 'Execute and handle pauses', description: 'Choose Execute Rebase when the plan is correct. If Git stops for conflicts, review each result in the merge editor and Continue the existing operation. Abort is the route back from a paused rebase when you do not want to finish it.' },
      { title: 'Compare the rewritten series', description: 'A completed recorded rewrite opens Rebase & Rewrite Comparison. Inspect changed, added, or removed patches before deciding to publish the new history.' },
      { title: 'Choose other history actions intentionally', description: 'Cherry-pick applies a commit onto the current branch; Revert creates an inverse change; Reset moves the current branch and may change the index or working files depending on its mode. These actions are not interchangeable.' }
    ],
    tips: ['Edit commit message, Drop commit, and Move commit down also rewrite history; read their affected range.', 'Keep a named restore point or recovery branch when experimenting with an important series.'],
    caution: 'Rewrites change commit hashes and do not preserve cryptographic signatures. Hard reset and discard can remove working changes. Nothing in this guide authorizes an automatic force push.',
    actions: [{ id: 'range-comparison', label: 'Open rewrite comparisons' }, { id: 'restore-points', label: 'Open restore points' }],
    related: ['conflict-editor', 'range-comparison', 'split-commits', 'branch-stacks', 'reflog']
  },
  {
    id: 'split-commits', category: 'history', title: 'Split one commit into smaller commits',
    summary: 'Assign files or text hunks to focused commits, preview their combined result, and apply a deliberate local rewrite.',
    minutes: 6, level: 'Advanced', keywords: ['split', 'commit', 'hunk', 'rewrite', 'preview', 'smaller'],
    location: 'Commit context menu → Split into smaller commits… · Actions → Split Commit…',
    prerequisites: ['A clean local branch with no active Git operation.', 'A supported non-merge commit on that branch.'],
    steps: [
      { title: 'Load the commit', description: 'Select the commit to split and open the split editor. Review its pieces and branch. The tool supports a linear rewrite; selected merges or later merge commits in the affected history are rejected.' },
      { title: 'Assign every piece', description: 'Create 2–20 target commits and write their messages. Assign files or available text hunks to the right commit. Binary changes, adds/deletes, submodules, and mode changes stay as whole-file pieces.' },
      { title: 'Preview the sequence', description: 'Preview split checks that every piece is assigned once and that the sequence reproduces the original final file tree. Dependencies between hunks can make an ordering invalid; revise the plan instead of applying a failed preview.' },
      { title: 'Apply to the unchanged branch', description: 'Apply split requires the same clean branch and HEAD, saves a restore point, and then updates that branch. Later commits on the supported linear path receive new parent hashes. Other branch and tag names do not move with it.' },
      { title: 'Review and manage saved previews', description: 'Inspect the resulting comparison. Saved previews survive restart; use Saved previews to revisit or explicitly discard them when they are no longer needed.' }
    ],
    tips: ['Renames appear as delete/add pieces in the split plan.', 'If the working branch changed since preview, reload rather than assuming the old preview can still apply.'],
    caution: 'This rewrites local history and does not preserve signatures. Coordinate before rewriting published commits; applying a split does not push it to the provider.',
    actions: [{ id: 'range-comparison', label: 'Inspect rewrite comparisons' }],
    related: ['rebase-history', 'range-comparison', 'restore-points']
  },
  {
    id: 'branch-stacks', category: 'history', title: 'Manage stacked branches and requests',
    summary: 'Link dependent branches, preview their rebases in isolation, and explicitly retarget hosted requests.',
    minutes: 8, level: 'Advanced', keywords: ['stack', 'stacked', 'restack', 'parent', 'dependent', 'retarget', 'pr', 'mr'],
    location: 'Actions → Stacked Branches & PRs…',
    prerequisites: ['Local branches with a known parent/child relationship.', 'Git 2.38+ for restack previews; provider connection for request retargeting.'],
    steps: [
      { title: 'Link each child to its parent', description: 'Set local branch relationships and inspect their saved boundaries and commit counts. Links describe the stack; creating or changing one does not move branches. Recalculate boundary deliberately resets the split point to the current merge base.' },
      { title: 'Build a restack preview', description: 'Select the base and Build restack preview. The linked descendants are replayed in dependency order in a separate preview worktree. Inspect old/new tips without changing the source branches.' },
      { title: 'Resolve a paused preview', description: 'If a preview pauses, open its workspace, resolve conflicts, and Continue its rebase. Return to an original workspace and Resume preview. If that rebase was aborted, remove the preview and build another.' },
      { title: 'Apply only from an unaffected checkout', description: 'Check out an unaffected branch, usually the base, and clean its pending work. None of the branches being updated may be checked out in any worktree. Review all tips before Apply to branches; changed source hashes reject the application.' },
      { title: 'Retarget requests separately', description: 'After a parent merges, explicitly change the child’s local parent, preview and apply the stack, then use Retarget an open PR / MR for its provider target. Inspect the selected remote, request, and target before the provider update.' }
    ],
    tips: ['Restack previews support up to 10 descendants with up to 100 linear commits each.', 'Saved preview tips and rewrite comparisons provide references for inspection; remove a preview only after preserving any work in its workspace.'],
    caution: 'Restacking changes commit hashes and may change signatures and committer information. It does not detect merged parents, publish branches, or force-push rewritten history automatically.',
    actions: [{ id: 'branch-stacks', label: 'Open stacked branches' }],
    related: ['rebase-history', 'review-worktrees', 'pull-requests', 'range-comparison']
  },
  {
    id: 'range-comparison', category: 'history', title: 'Compare history before and after a rewrite',
    summary: 'Match patches across rebases and commit edits instead of relying on changed commit hashes alone.',
    minutes: 5, level: 'Advanced', keywords: ['range diff', 'comparison', 'rewrite', 'before', 'after', 'rebase', 'patch'],
    location: 'Actions → Rebase & Rewrite Comparison…',
    prerequisites: ['Git 2.19+ and two commit ranges or a saved rewrite record.'],
    steps: [
      { title: 'Open a recorded rewrite', description: 'Select a saved rebase, message edit, drop, reorder, split, or restack comparison. Completed recorded rewrites can open this screen automatically; conflict-paused operations finish their record after Continue.' },
      { title: 'Filter the patch matches', description: 'Show unchanged, changed, removed, or added commits. Select a row to read its patch comparison, and inspect the old or new full commit when the summary needs more context.' },
      { title: 'Use custom ranges when needed', description: 'Choose Custom ranges and enter a base and tip for each series. A base is excluded and a tip included. Check the resolved revisions to make sure both sides cover the intended work.' },
      { title: 'Keep or share the evidence', description: 'Copy raw output when useful. Records persist after restart; refresh after an operation completed outside Git Workbench. Delete a finished record only when its retained references are no longer needed.' }
    ],
    tips: ['A record labeled ended means the session stopped outside the app; Git Workbench cannot confirm from that alone whether it completed or was aborted.', 'Large squashes may appear as removed/added commits instead of a simple one-to-one pair.'],
    caution: 'Patch matching is heuristic, excludes merge commits, and is limited to 500 non-merge commits per range. An unchanged patch match does not establish behavioral equivalence.',
    actions: [{ id: 'range-comparison', label: 'Open rewrite comparison' }],
    related: ['rebase-history', 'split-commits', 'branch-stacks', 'diff-review']
  },
  {
    id: 'lfs', category: 'tools', title: 'Track and transfer large files with Git LFS',
    summary: 'Manage tracking rules, inspect pointers and cached assets, and explicitly choose transfers.',
    minutes: 6, level: 'Advanced', keywords: ['lfs', 'large file', 'assets', 'binary', 'pointer', 'gitattributes', 'download', 'upload'],
    location: 'Actions → Git LFS Manager…',
    prerequisites: ['A separately installed recent Git LFS command line tool.', 'Working Git authentication for network transfers.'],
    steps: [
      { title: 'Inspect and configure LFS', description: 'Open the manager to check installation and repository setup. Configure local LFS writes local filters and installs its pre-push hook; manual downloads are selected by default. Existing custom hooks are not overwritten.' },
      { title: 'Add the intended tracking rule', description: 'Use a glob such as *.psd, or Literal filename when a path contains glob characters. Review the changed root .gitattributes, then stage and commit it so collaborators receive the rule.' },
      { title: 'Inspect actual asset state', description: 'Use the asset table to read size, SHA-256, cache availability, and whether a working file contains an asset or just its pointer. Tracking a pattern does not migrate old history or automatically re-stage existing files.' },
      { title: 'Choose the specific transfer', description: 'Select a remote. Fetch to cache downloads objects without populating files; Pull assets also populates working files; Checkout cached uses local cache without a network request. Upload current revision uploads objects after confirmation, without pushing branch references.' },
      { title: 'Monitor or cancel', description: 'Read file and byte progress. Cancel transfer stops the process and retains partial objects for retry. Closing the manager keeps the transfer running; reopen it in the same repository to inspect or cancel it.' }
    ],
    tips: ['Pull and Checkout are blocked during merge, rebase, or cherry-pick. Git LFS leaves modified working files alone.', 'If custom-hook setup fails, repository filter settings may already have changed; follow the reported manual hook guidance.'],
    caution: 'Network transfers can consume provider quota and bandwidth. No history migration or cache pruning is run automatically. Closing the app cancels its active transfers.',
    actions: [{ id: 'lfs', label: 'Open Git LFS manager' }],
    related: ['sparse', 'sync-remotes', 'review-worktrees']
  },
  {
    id: 'sparse', category: 'tools', title: 'Keep only selected folders checked out',
    summary: 'Reduce a large working tree with a previewed sparse layout while keeping excluded files in Git history.',
    minutes: 6, level: 'Advanced', keywords: ['sparse', 'monorepo', 'folders', 'checkout', 'layout', 'large', 'exclude'],
    location: 'Actions → Sparse Checkout…',
    prerequisites: ['Git 2.37+.', 'A clean checkout with no active merge, rebase, or cherry-pick to apply a layout.'],
    steps: [
      { title: 'Choose directories', description: 'Expand the folder tree and select the directories to keep, or enter a repository-relative directory. Selecting a parent includes its descendants. This picker works on folders, not arbitrary individual files.' },
      { title: 'Understand cone-mode inclusions', description: 'Root files remain included, as do files immediately inside ancestor directories. No selected directories means root files only. Sparse checkout reduces populated working files; it does not remove already downloaded repository history.' },
      { title: 'Preview and clear blockers', description: 'Preview selected folders shows counts and sample paths to populate or remove. Commit, stash, or move pending files first. Move reported untracked or ignored blockers aside and preview again rather than trying to overwrite them.' },
      { title: 'Apply the reviewed layout', description: 'Apply saves a workspace restore point and a separate checkout-layout backup. If the revision or layout changed since preview, reload and preview again. LFS downloads and recursive submodule updates do not run as part of applying it.' },
      { title: 'Restore a layout or full checkout', description: 'Use Preview full checkout to repopulate tracked files, or Saved layouts to restore previous rules on the current revision. Restoring rules does not switch branches or reset to that backup’s saved commit.' }
    ],
    tips: ['Existing non-cone patterns are displayed without silently converting them. Restore a full checkout before editing them with the folder picker.', 'Use the LFS manager afterward if included files still contain pointers instead of full assets.'],
    caution: 'Excluded tracked files are removed from the working folder when applying a layout. Read the preview. Ignored files and submodule working content are outside normal workspace restore snapshots.',
    actions: [{ id: 'sparse', label: 'Open sparse checkout' }],
    related: ['lfs', 'restore-points', 'review-worktrees']
  },
  {
    id: 'bisect', category: 'tools', title: 'Locate a regression with Git bisect',
    summary: 'Give Git a known good and bad revision, then judge the checked-out candidates until the suspect is found.',
    minutes: 5, level: 'Advanced', keywords: ['bisect', 'regression', 'bug', 'good', 'bad', 'culprit', 'search'],
    location: 'Command palette → bisect wizard · commit context menu → mark good / bad',
    prerequisites: ['A clean working tree.', 'A reproducible issue and an older known-good revision.'],
    steps: [
      { title: 'Define a meaningful range', description: 'Open the bisect wizard and enter a bad hash, tag, or branch where the issue occurs and an older good revision where it does not. A selected historical commit can prefill the bad revision; check that choice.' },
      { title: 'Start the search', description: 'Start bisect to let Git check out an intermediate revision. Read the Currently Testing Commit details before investigating so you know which code is under inspection.' },
      { title: 'Judge the candidate yourself', description: 'Run your normal project checks outside the wizard and mark Good when the issue is absent or Bad when it is present. Choose Skip for a revision you cannot judge, rather than guessing.' },
      { title: 'Inspect the outcome', description: 'Repeat until the wizard identifies a culprit. Skipped revisions can leave multiple possible commits; the wizard lists that ambiguity instead of proving one cause.' },
      { title: 'Finish and restore the original position', description: 'Use Finish & Reset HEAD, or reset an unfinished session, to end bisect and return to the original position. Closing the window alone should not be treated as ending the Git session.' }
    ],
    tips: ['Keep the same reproduction criteria for every candidate.', 'Use the commit context menu to mark a known revision good or bad when building the range.'],
    caution: 'Bisect changes the checked-out revision repeatedly. Set aside pending work first, and do not commit unrelated work into its temporary detached positions.',
    actions: [{ id: 'bisect', label: 'Open bisect wizard' }],
    related: ['commit-graph', 'diff-review', 'stash']
  },
  {
    id: 'changelog', category: 'tools', title: 'Draft release notes from commit history',
    summary: 'Generate a categorized Markdown draft between revisions, then review it before publishing.',
    minutes: 3, level: 'Intermediate', keywords: ['changelog', 'release', 'notes', 'markdown', 'tags', 'conventional'],
    location: 'Command palette → Generate Release Changelog…',
    prerequisites: ['Commits to summarize; tags are optional.'],
    steps: [
      { title: 'Choose the release range', description: 'Open the generator and set From Ref / Tag to the previous release and To Ref / Tag to the new release or HEAD. Leave the base blank only when you intend to include all available history through the target.' },
      { title: 'Generate and inspect', description: 'Choose Generate. Read the resolved range, total commit count, categories, and generated Markdown. Conventional commit prefixes improve grouping, but commit messages still need editorial review.' },
      { title: 'Write the user-facing context', description: 'Check for internal-only entries, duplicates, breaking changes, limitations, and upgrade instructions. Add what users need to know rather than publishing every commit subject unchanged.' },
      { title: 'Copy the draft when ready', description: 'Copy the Markdown into your release or changelog workflow. Generating and copying notes does not create a tag, bump the app version, build packages, or publish a release.' }
    ],
    tips: ['Tag shortcuts fill the base quickly; still check both ends of the range.', 'For a prerelease, state its intended audience and known limits in your edited release description.'],
    actions: [{ id: 'changelog', label: 'Open changelog generator' }],
    related: ['branches-tags', 'git-flow', 'staging-commits']
  },
  {
    id: 'git-flow', category: 'tools', title: 'Use a Git Flow branch lifecycle',
    summary: 'Configure production and integration branches, then start and finish a feature, release, or hotfix explicitly.',
    minutes: 5, level: 'Intermediate', keywords: ['git flow', 'feature', 'release', 'hotfix', 'develop', 'production', 'finish'],
    location: 'Toolbar → Git Flow · Actions → Git Flow Operations',
    prerequisites: ['A repository and agreement on its branching conventions.'],
    steps: [
      { title: 'Inspect or initialize the configuration', description: 'Open Git Flow Operations. Check the production branch, development branch, and feature/release/hotfix prefixes. If uninitialized, review these names before choosing Initialize Git Flow Now.' },
      { title: 'Start the correct branch type', description: 'Choose Feature, Release, or Hotfix and supply its name. Review the intended base and branch name so the work begins from your team’s correct integration or production line.' },
      { title: 'Work with normal commits', description: 'Review, stage, and commit as usual. Before finishing, clean the working tree and inspect the branch differences; Git Flow organization does not replace reviewing the patch.' },
      { title: 'Review the finish operation', description: 'Use the branch’s Finish controls. For release or hotfix flows, review tag details where offered and the option to keep the local branch. Confirm Finish & Merge only after checking which branches are affected.' },
      { title: 'Publish through the normal workflow', description: 'Inspect resulting commits and tags and push intentionally. A Git Flow finish is not a substitute for hosted review, CI, packaging, or a published release.' }
    ],
    tips: ['Configuration is repository-specific, so check it when opening a different project.', 'If a finish pauses for conflicts, resolve and continue the Git operation before attempting another finish.'],
    caution: 'Finishing can merge branches, create tags, and delete the local flow branch unless you keep it. Read the options before confirming.',
    actions: [{ id: 'git-flow', label: 'Open Git Flow' }],
    related: ['branches-tags', 'conflict-editor', 'changelog', 'sync-remotes']
  },
  {
    id: 'preferences', category: 'preferences', title: 'Tune appearance, identity, and synchronization',
    summary: 'Make the workspace readable and use the right author and signing identity for each project.',
    minutes: 4, level: 'Essentials', keywords: ['settings', 'theme', 'appearance', 'font', 'density', 'profile', 'identity', 'gpg', 'signing', 'updates'],
    location: 'Settings · Ctrl/Cmd+,',
    steps: [
      { title: 'Set a readable workspace', description: 'Use Appearance & Themes for the palette and toast position. In Typography & Density, set Interface, Diff & Code, Home, and Guide text sizes independently. Each control has its own preview and reset. Choose graph row density separately; changing a font size does not zoom the whole layout.' },
      { title: 'Set your commit identity', description: 'Open Commit Profiles & GPG. Detect the existing Git author or enter the intended name and email. Create profiles if you use different identities, then choose the right profile from the commit editor before committing.' },
      { title: 'Configure signing deliberately', description: 'Set the signing key and profile options appropriate to your Git setup. A key identifier does not create a key or prove that signing works; your computer’s existing Git and signing tools must be configured.' },
      { title: 'Choose synchronization behavior', description: 'Use Git & Synchronization to configure periodic fetch and its interval. Keep hosted-provider accounts in Pull Request Providers and optional model settings in AI Assistant.' },
      { title: 'Check version and updates', description: 'About & Information shows the installed version and Software updates. Check manually for a result; choose Download and then Restart to install where supported. Unsigned macOS builds use the release page for manual installation.' }
    ],
    tips: ['Profile names are convenient labels; read the actual author email before a sensitive or public commit.', 'Theme and density changes can be revisited without changing repository history.'],
    caution: 'Changing a profile or signing configuration affects future operations; it does not rewrite the author or signature on existing commits.',
    actions: [{ id: 'appearance-settings', label: 'Open appearance settings' }, { id: 'git-settings', label: 'Open Git settings' }],
    related: ['staging-commits', 'ai-assistant', 'providers', 'terminal-shortcuts']
  },
  {
    id: 'terminal-shortcuts', category: 'preferences', title: 'Navigate quickly with the palette and command drawer',
    summary: 'Find tools and repository objects by name, and run a command without leaving the project window.',
    minutes: 4, level: 'Intermediate', keywords: ['keyboard', 'shortcuts', 'palette', 'terminal', 'command', 'search', 'quick', 'hotkey'],
    location: 'Ctrl/Cmd+K → palette · Ctrl/Cmd+` → terminal · ? → shortcuts',
    steps: [
      { title: 'Search commands and repository objects', description: 'Open the command palette with Ctrl/Cmd+K. Search the available Commands, Branches, Tags, Commits, or Files and read the selected item before pressing Enter; some results execute Git actions rather than merely opening a panel.' },
      { title: 'Use navigation shortcuts', description: 'Ctrl/Cmd+T opens Home, Ctrl/Cmd+F focuses repository search on Home or the commit filter in a workspace, Ctrl/Cmd+B toggles the sidebar, and Ctrl/Cmd+, opens Settings. Open the shortcuts sheet for the full current list.' },
      { title: 'Run a repository command', description: 'Open Terminal from the toolbar or Ctrl/Cmd+`. Enter a command or choose a preset such as git status -s. The drawer runs commands in the active repository and shows output, errors, exit code, and elapsed time.' },
      { title: 'Read and revisit output', description: 'Use command history, copy an output log when useful, and resize or maximize the drawer for longer results. This is a command runner, so use your system terminal for a persistent interactive shell or tools needing interactive input.' },
      { title: 'Return to the workspace', description: 'Close the drawer when done. Refresh the repository if an external command changed files or Git state and the view has not caught up. Press Escape to dismiss the active modal or diff where supported.' }
    ],
    tips: ['Typing ? outside a text input opens the shortcuts sheet.', 'A palette item’s description helps distinguish opening a tool from immediately fetching, pushing, applying, or switching something.'],
    caution: 'Commands execute with your local account’s access. Destructive or remote-changing commands need the same care as in your normal terminal; do not assume they receive the app’s restore-point protections.',
    actions: [{ id: 'palette', label: 'Open command palette' }, { id: 'terminal', label: 'Open command drawer' }, { id: 'shortcuts', label: 'Show shortcuts' }],
    related: ['home-workspaces', 'commit-graph', 'sync-remotes', 'preferences']
  }
];
