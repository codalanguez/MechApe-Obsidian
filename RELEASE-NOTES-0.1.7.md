# MechApe 0.1.7

Addresses the initial Obsidian Community review:

- Validate streamed JSON and saved settings before using typed fields; reject malformed content/tool indexes and preserve reasoning metadata for tool round trips.
- Use the searchable Obsidian settings API and update() when providers or skill profiles change.
- Use browser-window draft timers, typed error handling and standard desktop HTTP imports.
- Retain control-character path rejection without a control-character regular expression.
- Point fundingUrl directly to the existing PayPal tip jar because the custom redirect was unreachable to the scanner. Donations remain optional and outside the plugin UI.
- Attach GitHub build provenance attestations to the three plugin assets. Checksums remain available locally; only supported plugin files are attached to new releases.
- Explain local vault-path enumeration and include the public listing screenshots in the repository.

The same reviewed-write and project-boundary rules apply. Direct Anthropic live chat remains limited by test-account billing; macOS/Linux native app testing remains outstanding.
