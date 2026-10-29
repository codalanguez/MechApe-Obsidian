# Verification record

Test date: October 28, 2026 (America/Denver).

## Automated checks

- TypeScript strict type checking and esbuild production bundling pass.
- All 13 tests in `tests/core.test.ts` pass.
- Release verification passes: metadata/version consistency, required documentation, runtime dependencies, matching packaged files, and SHA256 generation.
- The runtime bundle imports only Obsidian. No runtime Node.js/Electron dependency is bundled.

The tests exercise path traversal/hidden-file rejection, project boundaries, read-before-update, approval/rejection, concurrent edits, read-only skills, cancellation, provider-specific tool protocols, malformed responses, endpoint validation, settings migration, and the agent loop.

## Live desktop checks

Environment: Windows, Obsidian 1.14.5, Ollama with existing `llama3.2:latest` and `qwen2.5:7b` models. Only a dedicated `MechApe Test` project was supplied as tool scope.

- Installed the three plugin files and enabled MechApe through Community plugins.
- Opened **MechApe: Open chat** from the command palette; confirmed the right sidebar, selected project/provider/skill, and larger-experience link.
- Sent a prompt through the sidebar. The model used the note-reading flow and returned the four tasks present in the sample note.
- Asked the model to create a sample note. Confirmed the review modal displays the target and proposed contents; clicked Apply and verified the file on disk.
- Changed the model through MechApe settings to `qwen2.5:7b`. Confirmed the next message starts fresh context with the new model.
- Qwen read the sample note and called `update_note`. The dialog showed current and proposed text side by side. Applying the update produced the exact requested single-line content on disk.
- The initial GitHub Actions run passed `npm ci`, all tests, build, and release-package verification on a clean Ubuntu runner with Node 22.
- The small local model emitted literal newline escapes in its initial proposed Markdown and stopped after a read when first asked for a combined read/update. These are model-output limitations visible during review, not a reason to bypass review. Do not promise perfect tool use for every model.

## Remaining coverage before broad release

- Live cloud-provider tests for OpenRouter and Anthropic using maintainer credentials, plus a live OpenAI-compatible server.
- Full light-theme, narrow-pane, unload/reload, and keyboard-only walkthroughs.
- macOS/Linux host smoke tests. Mobile is deliberately disabled for this first version and needs separate device testing before being enabled.
- Community directory automated scanner results, which become available after submission.

Provider fixture tests are not equivalent to live service certification. The draft release preserves this distinction.
