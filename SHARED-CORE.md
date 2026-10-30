# Shared MechApe package

Both applications depend on [@mechape/core 0.2.0](https://github.com/codalanguez/mechape-core/releases/tag/v0.2.0), maintained in the public [mechape-core repository](https://github.com/codalanguez/mechape-core). The old copied core modules and synchronization script have been removed.

The dependency is pinned to the public release's npm-compatible tarball. Each app commits its package-lock.json with the same SHA512 integrity hash. It needs no npm organization, private repository access, paid registry, or runtime download. This is a GitHub-hosted package, not an npm registry publication.

Shared modules:

- @mechape/core/openrouter: provider catalog and generation-option mapping, request construction, privacy default, cache markers, and identity headers.
- @mechape/core/prompt: host/project instructions, bounded and deduplicated skills, memory, and untrusted knowledge blocks.
- @mechape/core/skills: the existing simple SKILL.md frontmatter parser (not a complete YAML parser).
- @mechape/core/providers: Ollama, OpenRouter, Anthropic, and compatible chat request/response adapters; endpoint checks, tool metadata, safe HTTP errors, cancellation and timeouts. Desktop llama.cpp uses the compatible adapter.
- @mechape/core/agent: the single bounded tool loop, advertised-tool checks, full-batch validation, history/results, unsupported-tool handling, and cancellation.
- @mechape/core/stream: shared OpenAI SSE translation, reasoning, and OpenRouter usage.

The plugin bundles the package into main.js and includes its MIT license in the bundle. Desktop includes the package and license in its production node_modules. Hosts supply network transport and tool execution; the core owns their protocols and iteration. Obsidian supplies VaultTools and its review dialog: project/excluded-folder boundaries, read-only permissions, approval, read-before-edit, and concurrent-edit protection remain enforced there. Desktop supplies MCP execution, model-process supervision, catalog caching, account UI, credential storage, and licensing. No additional provider-selection UI is added in this extraction.

Both hosts use the same runAgent function. Obsidian receives complete responses. Desktop uses its prepareForStream mode to retain tool results, then streams the final answer through the shared compatible/OpenRouter adapter. This preserves desktop reasoning and usage displays. Host budgets remain configurable (12 rounds in Obsidian, five in desktop). Neither host silently retries arbitrary loop failures; malformed arguments, truncated tool calls, cancellation, and budget exhaustion fail clearly.

For changes, edit mechape-core, run its contract and package tests, release a new version, then update BOTH apps to that exact tarball URL and commit their lockfiles. Run npm run check:core, both hosts' test suites, the plugin production bundle and desktop beta packaging. Do not edit node_modules or reintroduce copied implementations. See the core README for release steps.
