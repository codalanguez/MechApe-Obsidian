# Publishing MechApe

The repository contains source, tests, manifest, version map, license, and release automation. Building a package does not submit or publish the plugin.

## Before each release

- Test in a disposable vault on Obsidian 1.14.5 or later: open/reopen the sidebar, attach a note, change projects/providers/skills, save a chat, reload, and unload the plugin.
- Test live conversations against Ollama, OpenRouter, Anthropic, and one OpenAI-compatible server using your own credentials. Include a tool call and a rejected write with each.
- Test create/update approval, cancel during review, and an external edit while a proposal is open.
- Verify both light and dark themes, narrow sidebar widths, keyboard operation, and the larger-experience link.
- The initial release is desktop-only. Validate on Android and iOS before changing `isDesktopOnly` to `false` in a later release.
- Confirm that the `mechape` plugin ID is available in the Community directory. Change it consistently before first publication if already claimed.
- Review the README's session-key, optional plain-text key storage, and plain-text history disclosures and ensure no local `data.json`, logs, credentials, or test-vault contents enter the repository or release.
- Run `npm ci`, `npm test`, and `npm run package` from a clean checkout.

## GitHub release

1. Use the public codalanguez/MechApe-Obsidian repository. Keep the full desktop application separate.
2. Set the same semantic version in `package.json`, `manifest.json`, and the release tag. Update `versions.json` and the lockfile if the version changes.
3. Push a tag exactly matching the manifest version, such as `0.1.6` (no `v` prefix).
4. The release workflow runs checks, builds, creates a draft release, and uploads `main.js`, `manifest.json`, and `styles.css`. Review the draft and publish it when ready. If releasing manually, upload those three individual assets; a ZIP alone is insufficient.

## Community submission

The current official process uses the [Obsidian Community directory](https://community.obsidian.md). Sign in with an Obsidian account, connect the GitHub account that owns this plugin repository, and add the plugin. The default branch must contain the correct manifest, and a published GitHub release must have the matching tag and assets. Address the directory's review findings before publication.

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)

## Current verification

See [TESTING.md](TESTING.md) for the live Windows/Ollama test record and outstanding checks. Automated provider fixtures do not establish live cloud-provider compatibility. Keep those limitations visible in the release review.
