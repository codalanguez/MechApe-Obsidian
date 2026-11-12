# Privacy and security review — 0.1.10 candidate

Reviewed November 11, 2026 (America/Denver). Scope: the new context inspector, brief export, conversation branching, note diff/recovery and metadata updates. This is a source review with automated tests, not an independent penetration test.

- Recovery records are bounded and validated. Malformed records, traversal paths, non-Markdown paths and currently excluded notes are rejected. Exclusions are checked again when applying recovery. Approved replacement still requires a successful recovery write and an atomic stale-content check. Cancellation reaches the write adapter and is checked after recovery backup and inside the atomic transform, so Stop during backup prevents the pending note update.
- Recovery copies are plaintext in the plugin's recovery directory and can be copied by vault sync or backups. The review/recovery UI discloses this. Copies remain until manually removed; keep a separate vault backup.
- The context inspector explains that detaching a source does not erase prior model messages or recall provider data. Clearing prior model context prevents earlier messages from being resent; visible history remains stored locally.
- Basic-instruction mode omits custom skill instructions/references while retaining the selected skill's read/write permission. Writes still require the established vault permissions and review process. Brief export is an explicit user-reviewed creation of a new note and respects exclusions.
- Branches copy display text rather than tool protocol or approval state. No previous tool action is replayed.
- No new telemetry, automatic external requests or credential persistence were introduced. Model discovery runs only when clicked and does not certify billing/generation access. Cloud costs remain separate and authoritative per-reply prices are unavailable in the plugin.
- All 57 tests passed, including streaming Stop, permission boundaries, review rejection/cancellation, concurrent edits and recovery failure. TypeScript build and installable-package verification passed.
- Full and production-only npm audits each reported zero known vulnerabilities. TLS verification remained enabled.

The plugin and shared core remain free and MIT. The branded funding URL is optional. Source push does not publish a GitHub release. This review did not include live paid model requests or a native Obsidian UI session; Anthropic's previously documented billing limitation remains.
