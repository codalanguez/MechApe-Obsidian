# Shared MechApe package

Both applications depend on [@mechape/core 0.1.0](https://github.com/codalanguez/mechape-core/releases/tag/v0.1.0), maintained in the public [mechape-core repository](https://github.com/codalanguez/mechape-core). The old copied core modules and synchronization script have been removed.

The dependency is pinned to the public release's npm-compatible tarball. Each app commits its package-lock.json with the same SHA512 integrity hash. It needs no npm organization, private repository access, paid registry, or runtime download. This is a GitHub-hosted package, not an npm registry publication.

Shared modules:

- @mechape/core/openrouter: provider catalog and generation-option mapping, request construction, privacy default, cache markers, and identity headers.
- @mechape/core/prompt: host/project instructions, bounded and deduplicated skills, memory, and untrusted knowledge blocks.
- @mechape/core/skills: the existing simple SKILL.md frontmatter parser (not a complete YAML parser).

The plugin bundles the package into main.js and includes its MIT license in the bundle. Desktop includes the package and license in its production node_modules. Host-specific UI, transport, vault/filesystem operations, credential storage and licensing remain outside the core. Direct provider adapters and agent orchestration are not yet fully unified. Obsidian continues to enforce project boundaries, read-only permissions, approval and concurrent-edit protection in its host adapter.

For changes, edit mechape-core, run its contract and package tests, release a new version, then update BOTH apps to that exact tarball URL and commit their lockfiles. Run npm run check:core, both hosts' test suites, the plugin production bundle and desktop beta packaging. Do not edit node_modules or reintroduce copied implementations. See the core README for release steps.
