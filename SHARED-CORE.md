# One MechApe product, two hosts

The free community edition runs inside Obsidian. The larger standalone edition runs in its own desktop workspace. Portable behavior belongs in the same core, with host-specific adapters around it.

The canonical source is the desktop repository's `lib/core`. The exact sources are vendored into this repository's `src/core`, with MIT attribution and SHA-256 checksums. This public plugin builds independently of the private desktop repository, without a paid package registry or license service.

Shared now:

- OpenRouter request construction, generation options, prompt-cache markers, privacy routing default, and app identity headers.
- System-prompt composition and skill formatting, including size limits and duplicate suppression.
- The desktop's simple SKILL.md frontmatter parser. Profile instructions accept plain text or that same frontmatter format; this is not a complete YAML parser.

Host adapters retain their own UI, transport and tools. The desktop reads project files and optional memory and streams responses. Obsidian uses its vault APIs, sidebar, stored profiles, non-streaming responses, and explicit write review. Its direct Anthropic, Ollama and compatible-provider adapters remain host-specific. Full provider and agent-loop convergence is not yet implemented.

To change shared behavior, edit the desktop core, then run `node scripts/sync-obsidian-core.js` in the desktop checkout (an optional argument selects this checkout). Run it with `--check` to compare both repositories. The script copies only the listed portable modules and LICENSE, never licensing services, credentials, private data, or user skills. Commit the synchronized files in both repositories.

Plugin builds and tests verify the recorded checksums. This detects accidental edits in the plugin; the desktop comparison verifies the sources actually match. Future portable features should extend this core rather than create separate implementations. Safety checks for vault boundaries, write approval and concurrent edits stay enforced in the Obsidian host.
