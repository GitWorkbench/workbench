# First-run setup

A new Git Workbench installation shows setup after its opening animation and before Explore:

1. **Commit profile:** choose a profile name, author name, and email. Existing global Git identity is prefilled when available, without overwriting fields already edited. The profile is used for app commits; both author and committer are supplied for that command without writing Git configuration. **Also set this identity in my global Git configuration** is optional and off by default.
2. **Appearance:** choose any installed theme and preview it immediately.
3. **AI assistant:** choose optional hosted AI, a local model server, or offline rule-based commit drafts. Hosted AI is not required to use Git Workbench. **Finish & explore** saves the configuration and opens the guide. **Skip AI & explore**, **Set up later**, and **Skip setup** keep the flow optional.

Setup completion is recorded in the app data directory so a renderer preference reset or app upgrade does not repeat onboarding. Existing installations are recognized from their current preferences. A completion-write failure leaves setup open with retry and explicit session-only continuation. Skipping setup does not change global Git identity or make a model request. Skipped identity and AI configuration remain available in Settings.

## Gravatar preview

After a short pause while entering an email, setup computes a SHA-256 identifier from the trimmed, lowercase address. Gravatar receives that identifier, rather than the raw email, in an image URL. This is an external image request, not anonymization. Disable **Show my Gravatar preview** to keep this preview local. Failed images or unavailable hashing fall back to initials and do not block setup. Late responses for previous email addresses are ignored.

Reference: [Gravatar email identifiers](https://docs.gravatar.com/rest/hash/).

## Saving AI configuration

In setup or **Settings → AI Assistant**, select the provider, model, optional endpoint, and commit style. Choose **Save AI settings** to apply the configuration. **Save & test** saves first and sends only a built-in example to the configured model; it does not read or send repository content. Normal AI features send selected change content only on an explicit request.

API keys are encrypted by Electron's OS keychain/keyring integration and stored alongside hosting credentials in `hosted-git-credentials.enc`. The renderer holds typed key input only in its password field and clears it after a save attempt; it receives a saved/not-saved indicator, never a decrypted stored key. Provider/model preferences are saved separately as `ai-settings.json` in the stable Electron app data directory. Installer filenames and app versions are not part of either path.

- A blank password field means **keep the existing key**. A saved-key indicator is shown even though the secret is not displayed.
- Switching providers or endpoints preserves other saved keys. Custom and Ollama keys are scoped to the exact normalized HTTPS instance URL, including port and base path. HTTP is accepted only for loopback endpoints.
- **Remove saved API key** explicitly removes only the selected provider/endpoint key.
- Resetting interface preferences does not delete AI keys or restart onboarding.
- Keys still present in older same-product browser preferences are imported without replacing a newer encrypted key. The old copy is cleared only after successful import. If the keyring is locked or import fails, the old key remains intact, and pending preference writes wait in memory until **Retry secure storage** succeeds.

An API key already deleted before this fix cannot be reconstructed. Re-enter it once and save securely. Keeping app data under the same OS account preserves credentials across normal updates; deleting that data or reinstalling under another account does not.

See [identity and data locations](branding.md) for the app data directory.
