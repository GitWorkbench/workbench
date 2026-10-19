# GitHub sign-in

## Connect an account

1. Open **Settings → Pull Request Providers → Sign in with GitHub**.
2. Git Workbench displays a short device code and opens `https://github.com/login/device` in your default browser. Copy the displayed code, enter it on GitHub and authorize **Git Workbench Desktop**. Your password and any verification codes stay on GitHub.
3. Return to Git Workbench. The panel updates automatically with your GitHub username. You can close settings while waiting; sign-in continues until you cancel, quit Git Workbench or the device code expires.
4. Choose **Choose repositories on GitHub** to install the app for the repositories you want to use. Sign-in and installation are separate: a user token can access only repositories that both the user and the app can access. An organization owner may need to approve the installation. After changing repository access, choose **Refresh access**, then refresh the pull request workspace.
5. Open a repository with a GitHub.com remote and use **Actions → Pull Requests / Merge Requests**.

**Switch GitHub account** starts a new browser sign-in. Choose the intended account on GitHub. Your current connection is kept until the new account has been verified and saved securely. Cancelling, declining or letting the code expire preserves your existing connection.

**Disconnect** removes the encrypted GitHub credentials on this device and cancels pending sign-in. To revoke the authorization on GitHub too, use [Authorized GitHub Apps](https://github.com/settings/apps/authorizations). To change an installation or remove repository access, use [Installed GitHub Apps](https://github.com/settings/installations).

Git fetch, push, clone and worktree operations keep using your existing SSH keys or Git credential helper. This feature connects the hosted pull request API; it does not configure Git authentication. GitLab and Bitbucket token settings are unchanged. GitHub Enterprise is not supported.

## Credentials and refresh

- Device authorization, polling and token refresh run in Electron's main process. Only the device user code, flow status and public account metadata reach the renderer. Device sign-in's secret device code and access/refresh tokens never cross IPC or get stored in renderer preferences. Manually pasted tokens pass through the existing save-token IPC and are encrypted by the main process.
- Credentials are encrypted with Electron `safeStorage` in `hosted-git-credentials.enc` under the app's user data directory, alongside the other providers. A secure OS keychain/keyring is required; Linux's `basic_text` fallback is rejected.
- Access tokens refresh before expiry when the hosted API needs them. Concurrent requests share one refresh so rotating refresh tokens are not reused. A disconnect, token replacement or account switch prevents a pending refresh from restoring the old credential.
- Expired or revoked refresh credentials require sign-in again. Offline checks and polling failures show useful messages; polling backs off and stops when the code expires. Sign-in does not download or execute anything from GitHub.
- **Use an access token instead** offers the existing manual fallback. Saving a manual token replaces the local device session; it does not revoke the previous authorization on GitHub.

## GitHub App registration for releases

The public app is [Git Workbench Desktop](https://github.com/apps/git-workbench-desktop), owned by `naowas`. Its public client ID and slug are bundled from `src/shared/github-app.json`. The client ID is a public identifier, not a secret. GitHub Actions needs no extra secret for this flow.

The existing GitHub App registration was renamed to **Git Workbench Desktop**. Its client ID is unchanged; existing authorizations and repository selections remain associated with the same app.

Registration settings:

| Setting | Value |
| --- | --- |
| Homepage | `https://github.com/GitWorkbench/workbench` |
| Enable Device Flow | Enabled |
| Expire user authorization tokens | Enabled |
| Request user authorization during installation | Disabled; users authorize through device flow |
| Webhook | Inactive; no webhook server is used |
| Callback/redirect URI | Unused by device flow; leave blank |
| Installation reach | Any account; every user/organization chooses its own repositories |
| Pull requests | Read and write: creation, reviews, comments and retargeting |
| Contents | Read-only: commit/repository data |
| Checks | Read-only: CI checks |
| Commit statuses | Read-only: CI statuses |
| Metadata | Mandatory read-only |
| Other repository, organization and account permissions | No access |

GitHub may require the owner to generate an app private key before installations are enabled. Keep any owner private key in the owner's secure storage; it is **never** part of Git Workbench, the repository, build assets or GitHub Actions secrets for this feature. No client secret or app JWT is used. The desktop device flow and refresh flow use the public client ID; refresh does not require a client secret for tokens issued through device flow.

For a fork or another GitHub App, update `src/shared/github-app.json` with that app's public client ID and slug, then rebuild. Development overrides are `GIT_WORKBENCH_GITHUB_CLIENT_ID` and `GIT_WORKBENCH_GITHUB_APP_SLUG`; set both when using another app. A missing/invalid client ID disables browser sign-in and leaves the manual token option available. Do not replace the bundled ID with a client secret, private key or personal token.

## Troubleshooting

- **No repositories / repository not found:** install the app for that repository, check the GitHub account and organization approval, then refresh access. Installation count is informational; an existing installation does not guarantee access to a particular repository.
- **Code expired / authorization declined:** start again for a fresh code. Codes are short-lived and polling ends after expiry.
- **No secure storage:** unlock/configure the system keychain. Linux needs GNOME Keyring, KWallet or another supported secure backend.
- **Session expired or revoked:** sign in again. Changing a GitHub password, revoking the app or expiring a refresh token can end a session.
- **Browser cannot open:** use the displayed GitHub URL and code in your browser directly. Cancellation is available from the sign-in panel.
- **Offline / GitHub unavailable:** reconnect and retry. Pending device authorization retries with backoff until the code expires; API requests do not retry writes automatically.

## Primary documentation

- [Device flow for GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)
- [Refreshing GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
