# Gitea connections

Git Workbench supports Gitea pull requests on registered HTTPS instances, including custom web ports and instance base paths. Configure each server independently; a GitLab connection does not authorize Gitea.

## Connect a server

1. Open **Settings → Pull Request Providers → Gitea → Add Gitea server**.
2. Enter the instance URL, for example `https://code.company.com`, `https://code.company.com:8443`, or `https://code.company.com/gitea`. Do not include the repository path or `/api/v1`.
3. Choose **Create a token on this server**. In Gitea’s **Settings → Applications**, generate a personal access token with **read:user**, **write:repository**, and **write:issue**. These permissions cover account verification, repository metadata/statuses, request creation/retargeting, and reviews/conversation. The account and token must have access to the intended repositories. Restrict repository access where your Gitea version supports it.
4. Paste the token. **Test connection** checks the current-user endpoint without saving. **Connect Gitea** checks it, then saves it encrypted in the operating system keychain/keyring. The saved token is never returned to the renderer.
5. Reopen the repository’s request workspace from **Actions → Requests** or **Sidebar → Requests**. Choose its remote. The sidebar and workspace show **Pull Requests** for Gitea, GitHub, and Bitbucket; GitLab shows **Merge Requests**. Unknown providers show **Requests** until detected.

**Replace token**, **Test connection**, and **Remove** act on one server. Removing a connection does not revoke its token; revoke it in Gitea when needed.

## Supported workflows

- List open requests, select a request, or create one from the checked-out branch. Only the explicit create action pushes the branch, using the user’s existing Git SSH/HTTPS authentication.
- Read the description, changed files and text patches, conversation, reviews, and commit CI statuses. Requests follow Gitea pagination with bounded display limits. Missing patches and optional permission failures remain visible.
- Submit comments on old/new diff lines, approvals, and change requests for the loaded source revision. Changed revisions reject submission and preserve the draft. Inline threaded replies use Gitea’s reply API where available; older versions return a useful error and retain the draft so it can be posted in the browser. General conversation entries can receive a new top-level review comment.
- Create an isolated review worktree from `refs/pull/<number>/head`, rechecking that the fetched commit matches the reviewed revision. Existing working files stay in place.
- Retarget an open request from the stacked branches workspace. The open state, head, and previous target are revalidated before updating the base branch.

The CI tab displays published commit statuses. It does not download Actions logs or artifacts. Available results and review actions depend on the server version, enabled repository features, and token/account permissions.

## Server matching and connectivity

HTTPS remotes match the configured origin, web port, and base path. SSH forms such as `git@code.company.com:owner/repo.git` and `ssh://git@code.company.com:2222/owner/repo.git` match the hostname and instance base path; the SSH port does not identify the HTTPS API port. For an instance under `/gitea`, the remote must include that prefix. Owner/repository paths are preserved.

The most specific matching instance base path wins. Equally specific SSH matches with different web ports are ambiguous: use the correct HTTPS remote. Custom SSH aliases or separate SSH hostnames need a remote matching the configured web hostname. The same instance URL cannot be saved as both GitLab and Gitea.

Tokens are sent only to their configured HTTPS API base; cross-origin redirects are rejected. Use a trusted certificate and connect to your VPN when required. Expired tokens, missing permissions, rate limits, invalid API responses, and network timeouts have distinct errors. Unknown hosts never receive another server’s token.

References: [Gitea API authentication, token scopes, and pagination](https://docs.gitea.com/development/api-usage/), [review API](https://docs.gitea.com/api/operations/repo-create-pull-review/), [request diff API](https://docs.gitea.com/api/operations/repo-download-pull-diff-or-patch/), [pull request refs](https://docs.gitea.com/usage/actions/faq/).
