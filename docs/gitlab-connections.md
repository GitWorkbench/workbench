# GitLab.com and self-hosted GitLab

Open **Settings → Pull Request Providers → GitLab**. You can connect GitLab.com and multiple company or third-party GitLab instances at the same time.

## Add a connection

1. Choose **Add GitLab server** and enter the instance's HTTPS URL, such as `https://code.company.com`, `https://code.company.com:8443`, or `https://code.company.com/gitlab`. Use the instance URL, not a project URL or `/api/v4` endpoint.
2. Choose **Create a token on this server** to open the instance's token settings in your default browser. Create a personal access token with the `api` scope on that GitLab instance. The account must have access to the projects you want to use.
3. Paste the token. **Test connection** verifies it against the instance's current-user API without saving it. **Connect GitLab** verifies it and saves it encrypted with the operating system keychain/keyring.
4. Reopen **Actions → Requests** and select the repository's remote. The sidebar and workspace show **Merge Requests** for GitLab. Home's **Check requests** also uses the matching connection.

Use **Replace token** when a token expires, **Test connection** to check a saved connection, or **Remove** to delete just that instance's stored credential. Removing a connection does not revoke the token on GitLab; revoke it on the server when needed.

## Remote matching

- HTTPS remotes match the configured scheme, hostname, web port, and instance base path.
- SSH remotes, including `git@host:group/project.git` and `ssh://git@host:2222/group/project.git`, match the instance hostname and base path. The SSH transport port is separate from the HTTPS API port.
- Nested namespaces such as `group/subgroup/project` are preserved. REST and GraphQL endpoints both retain the configured instance base path.
- When two saved instances share a hostname and base path but use different HTTPS ports, an SSH remote is ambiguous. Use the matching HTTPS remote.
- A custom SSH alias or a separate SSH hostname cannot be resolved to the web host automatically. Use a remote hostname matching the instance, or an HTTPS remote.
- Unknown hosts never receive a GitLab.com token. Tokens stay scoped to their registered instance, and cross-origin redirects are rejected.

Listing/creating merge requests, reviewing changes and discussions, approvals/change requests, CI pipelines, review worktrees, and stacked-request retargeting use the same instance resolution. Available review actions depend on the GitLab server version and token permissions; older hosts retain the discussion-based change-request fallback.

## Connectivity

Only HTTPS instances are supported. Connect to the company VPN when required. The server certificate must be trusted by the app's network runtime; certificate verification is not disabled. A proxy or SSO page returning HTML produces an API-response error. Invalid/expired credentials, missing permissions, rate limits, and timeouts have separate messages.

Git pushes continue to use your existing SSH keys or Git credential helper. Provider tokens authorize API operations and do not replace Git transport authentication.

References: [GitLab REST authentication](https://docs.gitlab.com/api/rest/authentication/), [personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/), [GraphQL API](https://docs.gitlab.com/api/graphql/getting_started/).
