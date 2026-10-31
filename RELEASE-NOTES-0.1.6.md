# MechApe 0.1.6

A free desktop Obsidian companion with reviewed note operations.

- Stream replies from Ollama, OpenRouter, Anthropic, and OpenAI-compatible providers; Stop cancels the connection and keeps partial text.
- Search models and project folders from collapsible Chat options.
- Choose reusable skills with `/` in the composer.
- Follow selected folders, inspect the context chip, or lock the project while browsing.
- Save transcripts and drafts locally and reopen them from History. Restored chats start fresh model context.
- Keep API keys in memory by default; opt into plain-text storage with Remember API keys. Existing saved-key installations retain their preference.
- Keep explicit Apply/Reject note review, read-only profiles, excluded folders, and stale-edit protection.

History is plain text in the plugin folder and may be copied by vault sync/backups. The README explains storage and provider data transmission. The plugin is desktop-only; mobile is not supported. Experimental Image Studio integration is excluded. Donation links use only the manifest’s fundingUrl.

Validation: see TESTING.md. OpenRouter streaming was tested live on Windows; direct Anthropic chat remains limited by test-account billing. Fixture tests do not imply live certification of every provider/model. macOS/Linux CI does not replace native Obsidian UI testing.

Install the three individual assets together. SHA256SUMS.txt contains their integrity hashes. Community-directory submission and review are separate from this GitHub release.
