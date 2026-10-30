# Verification record

Automated release verification: October 29, 2026 (America/Denver). Live application checks below were recorded on October 28 unless stated otherwise.

## Automated checks

- TypeScript strict type checking and esbuild production bundling pass.
- All 21 tests in `tests/*.test.ts` pass, including shared-core privacy, tool-history, permission, and prompt-composition coverage.
- Release verification passes: metadata/version consistency, required documentation, runtime dependencies, matching packaged files, and SHA256 generation.
- The runtime bundle imports only Obsidian. No runtime Node.js/Electron dependency is bundled.

The tests exercise path traversal/hidden-file rejection, project boundaries, read-before-update, approval/rejection, concurrent edits, read-only skills, cancellation, provider-specific tool protocols, multiple Anthropic tool results, malformed responses, safe HTTP errors, missing credentials, disabled-tool enforcement, endpoint validation, settings migration, and the agent loop.

## Release 0.1.2 checks (October 29)

- Fresh OpenRouter integration passed using the configured account and `anthropic/claude-haiku-4.5`: model discovery, synthetic note read/create/update, two review callbacks, tool results, and final answer. No vault note contents were sent.
- Direct Anthropic chat remains limited by the previously documented account billing condition; no successful direct Anthropic chat is claimed.

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

## Authenticated cloud checks for 0.1.1

- OpenRouter, `anthropic/claude-haiku-4.5`: authenticated model catalog, read/create/update tool calls, review callbacks, tool-result round trips, and final answer passed using a synthetic in-memory fixture.
- Obsidian 1.14.5 on Windows: OpenRouter model refresh succeeded. The sidebar read `MechApe Test/Connection check.md`, proposed creation of `OpenRouter check.md`, then read and proposed updating that note. Both review dialogs displayed the expected content and were explicitly applied.
- Rejected a separate OpenRouter creation proposal. The model acknowledged rejection without retrying; the target file does not exist. Verified the approved note's exact final text on disk.
- Anthropic, `claude-sonnet-5-5`: authenticated model catalog succeeded. Chat requests returned HTTP 400 with insufficient account credits. This is a billing block, not a passed chat/tool test.
- Fixed the generic HTTP 400 message for recognized billing failures. Only a boolean classification crosses the error parser; arbitrary provider response text is never displayed. Verified against the live billing response and an automated regression test.
- Installed and reloaded 0.1.1 in Obsidian, preserving keys/settings. A live Anthropic sidebar request displayed the new insufficient-credit guidance and restored the composer. The installed bundle and draft release have matching SHA256 hashes. All 18 tests and packaging pass on Windows, macOS, and Ubuntu CI.
- Reproduce the manual test with `MECHAPE_SETTINGS` pointing to local plugin settings and `node --import tsx scripts/smoke-cloud.ts`. Optional `MECHAPE_PROVIDER` selects one cloud provider; `MECHAPE_OPENROUTER_MODEL` overrides the OpenRouter model for this run. The script does not modify settings or vault files, prints no credentials, and sends only synthetic notes. It incurs normal API charges.

## Disclosed coverage limitations

- Anthropic chat and note tools remain blocked by insufficient API credits. OpenRouter coverage applies to the tested model, not every model on its catalog.
- The live compatible-server test used Ollama's OpenAI-compatible endpoint, not every compatible server implementation.
- macOS/Linux Obsidian application smoke tests are not available on this Windows host. Cross-platform CI passes are not a substitute. Mobile is deliberately disabled and needs separate device testing before being enabled.
- Community directory automated scanner results, which become available after submission.

Provider fixture tests are not equivalent to live service certification. Release notes preserve this distinction.
