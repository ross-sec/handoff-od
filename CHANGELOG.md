# Changelog

All notable changes to `@ross-sec/handoff-od` are documented here.

## [0.1.0] - 2026-08-16

Initial release. An Open Design plugin that hands a project off to **OpenCode** — the open-source
counterpart of Claude Design's design-to-code handoff, reproducing the same process with both ends
open. Closes the loop `@ross-sec/sync-od` opened.

### Added

- **Two mechanisms.** `bundle` (deterministic, no model tokens) and `spec` (an authored per-screen
  implementation document); `both` nests the spec inside the bundle.
- **Prompt-first transport.** `hod-prompt.js` emits the MCP prompt the receiving agent pastes, with
  local imports auto-discovered from `<script src>`, `<link href>`, `<img src>`, `<iframe src>`,
  `<x-import from>` and `@import`. The archive is the fallback path, matching the original.
- **Six-phase pipeline** — `hod-detect`, `hod-bundle`, `hod-spec`, `hod-validate`, `hod-archive`,
  `hod-prompt` — each with a DONE-gate that blocks on failure.
- **Adherence generator.** Builds `_adherence.oxlintrc.json` from `_ds_manifest.json` plus each
  component's `.d.ts`: forbidden native elements, blocked internal imports, raw hex / raw px /
  off-system fonts, undeclared props per component, and inline string-literal union values.
- **Design-system materialization** with automatic shape detection (project-local `components/`
  vs. published library collapsed into `_ds_bundle.js`), the short alias directory the HTML
  actually references, and real font binaries.
- **Spec scaffold** that pre-fills the token table, asset inventory, file tree, and a route map
  derived from the screen states found in the prototype.
- Invariants I1–I8 enforced by `hod-validate.js`; `--strict` promotes advisories to failures.
- `hod-validate.js --self` checks the manifest, the `SKILL.md` frontmatter, and every atom
  reference against Open Design's **closed** 13-atom catalog.
- Bundled `handoff-od-lead` and `handoff-od-spec-writer` subagents.
- 27 tests, no fixtures on disk and no dependency on any private bundle.

### Notes

- **Zero runtime dependencies, and no build step.** Open Design plugins ship no executable
  entrypoint, so there is nothing to compile — no `esbuild`, no TypeScript, no `dist/`.
- Archive writing verifies zip magic bytes. GNU tar accepts `-a -c -f out.zip` and silently writes
  a **tar**; on Windows it also reads `C:\` in an output path as a remote host spec. Both are
  handled.
- Offline-completeness is reported, never manufactured. The mirror is verbatim, so a project whose
  design system `@import`s a remote font yields a bundle that needs the network — that is the
  source's property, not a defect to paper over.
- The generated README is a clean-room paraphrase preserving the six design decisions of the
  original. No third-party text is redistributed.
