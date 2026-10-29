# Verification record

Test date: October 28, 2026 (America/Denver).

## Automated checks

- TypeScript strict type checking and esbuild production bundling pass.
- All 17 tests in `tests/core.test.ts` pass.
- Release verification passes: metadata/version consistency, required documentation, runtime dependencies, matching packaged files, and SHA256 generation.
- The runtime bundle imports only Obsidian. No runtime Node.js/Electron dependency is bundled.

The tests exercise path traversal/hidden-file rejection, project boundaries, read-before-update, approval/rejection, concurrent edits, read-only skills, cancellation, provider-specific tool protocols, multiple Anthropic tool results, malformed responses, safe HTTP errors, missing credentials, disabled-tool enforcement, endpoint validation, settings migration, and the agent loop.

## Live desktop checks

Environment: Windows, Obsidian 1.14.5, Ollama with existing `llama3.2:latest` and `qwen2.5:7b` models. Only a dedicated `MechApe Test` project was supplied as tool scope.

- Installed the three plugin files and enabled MechApe through Community plugins.
- Opened **MechApe: Open chat** from the command palette; confirmed the right sidebar, selected project/provider/skill, and larger-experience link.
- Sent a prompt through the sidebar. The model used the note-reading flow and returned the four tasks present in the sample note.
- Asked the model to create a sample note. Confirmed the review modal displays the target and proposed contents; clicked Apply and verified the file on disk.
- Changed the model through MechApe settings to `qwen2.5:7b`. Confirmed the next message starts fresh context with the new model.
- Qwen read the sample note and called `update_note`. The dialog showed current and proposed text side by side. Applying the update produced the exact requested single-line content on disk.
- The initial GitHub Actions run passed `npm ci`, all tests, build, and release-package verification on a clean Ubuntu runner with Node 22.
- Extended CI checks installation, tests, build, and packaging on Windows, macOS, and Ubuntu with Node 22. This is build/test coverage, not an Obsidian application test on macOS or Linux.
- Live OpenAI-compatible adapter check passed against Ollama's `/v1` API: model discovery, a real `read_note` tool call, tool-result round trip, and the expected answer from a synthetic fixture. Run `node --import tsx scripts/smoke-compatible.ts` with the existing local Qwen model to reproduce it.
- Inspected the sidebar at approximately 300 pixels wide in both light and dark modes. Controls remained visible and text wrapped. Restored the original system-based color scheme afterward.
- Disabled and re-enabled MechApe in Community plugins. Reopened the sidebar through the command palette and verified saved model, project, and skill settings.
- Verified keyboard command launching, Shift+Enter newlines, Enter-to-send, visible Tab focus through chat actions, and keyboard activation of Stop. Cancellation restored input and displayed the stopped status.
- Saved a successful chat through the Save button and verified the Markdown export in the test project.
- The small local model emitted literal newline escapes in its initial proposed Markdown and stopped after a read when first asked for a combined read/update. These are model-output limitations visible during review, not a reason to bypass review. Do not promise perfect tool use for every model.

## Disclosed coverage limitations

- OpenRouter and Anthropic: protocol/error handling is fixture-tested; live authenticated calls were not tested because no provider keys were configured. No cloud compatibility certification is claimed.
- The live compatible-server test used Ollama's OpenAI-compatible endpoint, not every compatible server implementation.
- macOS/Linux Obsidian application smoke tests are not available on this Windows host. Cross-platform CI passes are not a substitute. Mobile is deliberately disabled and needs separate device testing before being enabled.
- Community directory automated scanner results, which become available after submission.

Provider fixture tests are not equivalent to live service certification. Release notes preserve this distinction.
