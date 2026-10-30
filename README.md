# MechApe for Obsidian

A small AI companion in your vault's right sidebar. Chat with local models through Ollama, bring an OpenRouter or Anthropic API key, or connect an OpenAI-compatible endpoint. Find notes, develop drafts, and turn project conversations into reviewed note changes.

The free Obsidian edition of [MechApe](https://codalanguez.com/mechape/), by Coda Languez. **Want a larger experience?** The [full MechApe app](https://codalanguez.com/mechape/) offers a dedicated studio with projects and local model management. The sidebar includes a direct link. This plugin runs independently; the full app is not required.

Both editions use the same portable MechApe core for prompt composition, skill parsing, and OpenRouter requests. Obsidian supplies the sidebar and vault; the standalone app supplies its own workspace and larger toolset. See [shared-core architecture](SHARED-CORE.md).

## Features

- Right-sidebar chat, ribbon button, and command palette commands.
- Ollama, OpenRouter, Anthropic, and custom OpenAI-compatible connections; each remembers its own URL, model, and API key.
- Refresh available models or enter a model ID directly.
- Vault folders as projects: search, list, read, and propose edits within the selected folder.
- Attach the active note explicitly to a message.
- Create Markdown notes, including parent folders, and update existing notes with an Apply/Reject review dialog.
- Concurrent-edit protection: a proposal cannot overwrite a note changed since the assistant read it.
- Four editable skill profiles, plus custom profiles and duplication.
- Read-only skills and an option to disable tools for plain chat.
- Save a chat transcript as a Markdown note.
- Native Obsidian theme colors and keyboard-friendly controls.

## Skill profiles

Skills work as reusable system instructions. Select one from the sidebar; edit, duplicate, or create them under **Settings → MechApe → Skill profiles**.

| Skill | Purpose | Note proposals |
| --- | --- | --- |
| Vault assistant | Find connections and organize notes | Enabled |
| Writer & editor | Draft and revise while preserving voice and intent | Enabled |
| Research librarian | Compare evidence and cite source notes | Disabled |
| Project planner | Identify next actions, dependencies, and blockers | Enabled |

Each profile has a name, instructions, and an enforced permission controlling write tools. These are prompt profiles, not executable scripts. Every write still requires review. Changing skill, provider, model, project, or access settings starts fresh model context so old project content does not silently carry across those boundaries.

## Install the release

This plugin has **not yet been published in the community directory**.

Download the assets or installation ZIP from [GitHub releases](https://github.com/codalanguez/MechApe-Obsidian/releases/latest). Community-directory installation will become available only after submission and review.

1. Build with `npm ci` and `npm run package`, or obtain the three release assets.
2. Copy the `dist/mechape` folder into `<your-vault>/.obsidian/plugins/` (or the equivalent plugins directory if you use a custom configuration folder).
3. Reload Obsidian, then enable **MechApe** in **Settings → Community plugins**.
4. Open **Settings → MechApe**, choose a provider, and enter its model ID. Refresh models to select an available model.
5. Click the robot ribbon icon, or run **MechApe: Open chat**.

Requires Obsidian 1.14.5 or later. The initial release is marked **desktop-only** because it has been exercised on Windows and has not been validated on mobile devices. The runtime uses no Node.js or Electron APIs, leaving room for mobile support after device testing.

## Provider setup

| Provider | Default API base URL | Credentials |
| --- | --- | --- |
| Ollama | `http://localhost:11434` | Usually no key |
| OpenRouter | `https://openrouter.ai/api/v1` | Your OpenRouter API key |
| Anthropic | `https://api.anthropic.com/v1` | Your Anthropic API key |
| OpenAI-compatible | `http://localhost:1234/v1` | Depends on your server |

For Ollama, start Ollama and install a model that supports tools. For an OpenAI-compatible server such as LM Studio or llama.cpp, enable its server and enter its actual base URL and loaded model ID. The model field is intentionally empty until you select a model available to you. Provider model names and availability vary.

For cloud APIs, model access and billing are handled by the provider. A consumer chat subscription may not include API credit. The plugin itself has no subscription, paywall, telemetry, or account service.

The **Larger experience: MechApe** link promotes the author's separate desktop app. Using this Obsidian plugin does not require installing or buying that app. The desktop app's pricing and license are independent of this plugin; a future paid desktop edition would not change this plugin's MIT license or require a desktop purchase to use its existing features. No desktop purchase or license activation is implemented in the plugin.

**Testing status:** Ollama, an OpenAI-compatible endpoint, and OpenRouter have passed live note-tool tests. Anthropic authenticated model discovery succeeds, but chat testing is blocked by insufficient API credits on the test account; its tool protocol remains fixture-tested. See [TESTING.md](TESTING.md) for exact coverage and platform limitations.

If a model does not support tool calling, disable **Enable note tools**. You can still chat and attach a note. API replies currently appear as complete messages rather than token-by-token streaming.

## Working with notes

Choose **Whole vault** or a project folder. Paths returned by tools are relative to the vault root, including the project prefix. Examples:

- “Find unfinished tasks in this project.”
- “Read my outline and suggest three ways to strengthen it.”
- “Create `Projects/My book/Scene ideas.md` based on these notes.”
- “Update the project plan with the next steps we agreed on.”

The assistant reads notes through tools. A proposed write opens a dialog showing the current and proposed contents. **Apply change** writes it; **Reject** leaves it alone. New-note creation refuses existing paths, and updates require reading the note first. Hidden files, traversal paths, and non-Markdown files are inaccessible. There are no delete, shell, or web-browsing tools.

Excluded folders default to `Templates,Private` and apply to model-driven listing, reading, searching, attachments, and writing. Configure them for your own vault. The explicit **Save** chat action writes your transcript into the selected project.

## Privacy and storage

- No telemetry, background indexing, automatic downloads, or third-party fonts/assets.
- Network calls happen when you send a message or click **Refresh models**. The full-app link opens only when clicked.
- With a local endpoint, this plugin sends the request to that endpoint. A custom server or model provider may have its own data handling.
- With a remote endpoint, messages, skill instructions, attached notes, and notes/excerpts retrieved by tools are sent to that provider. Choose a narrower project and exclusions to limit access.
- Keys and settings are stored through Obsidian's plugin data API in **plain text** in `data.json`. They are not encrypted. Do not share this file, commit it, or put keys into shared vault configurations. Whether it syncs depends on your sync/backup configuration.
- Chats stay in memory while the sidebar view is open. **Save** exports a Markdown transcript. Closing/reloading the view loses unsaved conversations.
- **Stop** cancels further processing and tool actions. Obsidian's `requestUrl` does not abort the underlying HTTP request; the provider may finish and charge for a request already sent. Requests time out in the UI after 120 seconds.
- Model output is rendered without image embeds or raw HTML so replies do not automatically load external images.

## Limits in 0.1.1

Search is literal text search, not embeddings. Each search scans up to 300 notes and returns up to 20 results with pagination. Listing returns up to 100 paths per page. Reading/writing a note is limited to 60,000 characters. Conversations have a bounded payload and a maximum of 12 tool rounds per turn. These limits keep a small sidebar assistant predictable; very large projects may need narrower folders or requests. Applied changes remain saved if a later request fails or is stopped; the next message then starts with fresh context.

## Development

```sh
npm ci
npm test
npm run build
npm run package
```

`npm run dev` rebuilds on source changes. `main.js` is a CommonJS bundle with Obsidian kept external. There are no runtime npm dependencies. Unit tests cover path boundaries, project scoping, approvals, stale edits, read-only skills, provider tool protocols, cancellation, and the tool loop.

See [RELEASING.md](RELEASING.md) for public-release preparation, [TESTING.md](TESTING.md) for verified behavior and remaining checks, and [SUBMISSION.md](SUBMISSION.md) for listing fields and draft release copy. Build output is generated, not committed. Packaging validates release metadata and writes `dist/SHA256SUMS.txt`.

## License

MIT. Copyright (c) 2026 Coda Languez. This is a companion project to [MechApe](https://codalanguez.com/mechape/), not an official Obsidian product.

## Support development

MechApe for Obsidian is free. [Leave an optional tip on PayPal](https://www.paypal.com/ncp/payment/GBFACZQK4TXBL) to support development. Tips do not unlock features or purchase the desktop edition.
