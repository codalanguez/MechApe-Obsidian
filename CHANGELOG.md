# Changelog

## 0.1.1

- Explain insufficient API credits for known provider billing errors without exposing response bodies.
- Add a regression test for billing failures and a manual authenticated cloud test using synthetic in-memory notes.
- Verify OpenRouter model discovery and live note read/create/update flows. Anthropic model discovery succeeds; chat testing is blocked by insufficient account credits.

## 0.1.0

Initial development release of the MechApe vault companion.

- Right-sidebar chat with Ollama, OpenRouter, Anthropic, and OpenAI-compatible servers.
- Four editable skill profiles, custom profiles, and enforced read-only tool permissions.
- Project-scoped Markdown listing, search, reading, creation, and updates.
- Apply/Reject note review with concurrent-edit protection.
- Active-note attachments and explicit chat export.
- Link to the full MechApe experience.
- No telemetry or automatic vault indexing.

Cloud providers require the user's own credentials. Responses are currently non-streaming. See the README for storage disclosures and current limits.
