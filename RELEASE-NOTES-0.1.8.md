# MechApe 0.1.8

Import reusable skills and keep their supporting references together.

- Import Markdown instructions, a folder containing `SKILL.md`, or a `.skill` / ZIP package from Settings → MechApe.
- Preserve skill instructions, frontmatter, and nested text references. Each import creates a separate read-only profile.
- Attach, preview, and remove UTF-8 text references on any skill. Duplicated profiles have independent reference copies.
- Include reference text when a skill is active, framed as source data, with a 32,768-character budget and explicit truncation notices. References are sent to the selected local or cloud provider; scripts are never executed.
- Reject unsafe paths, duplicate reference names, ambiguous packages, and oversized imports. Binary and non-UTF-8 files are reported as skipped.
- Preserve the 0.1.7 Community review fixes, searchable settings, saved-setting validation, and GitHub build attestations. Use the patched fflate 0.8.3 ZIP reader.

Reference copies are saved in the vault's plugin settings and may be included in vault backup or sync. PDF, image, and Office-document extraction is not supported. Desktop and Obsidian libraries remain separate.

Validation: 52 automated tests pass, including package imports, reference persistence and model context, invalid paths, and context limits. TypeScript, bundling, release packaging, and dependency audit pass with zero known vulnerabilities. Direct Anthropic live chat remains limited by test-account billing; macOS/Linux native app testing remains outstanding.
