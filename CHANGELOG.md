# Changelog

All notable changes to `@ross-sec/handoff-od` are documented here.

## [0.1.3] - 2026-08-16

Prepared for submission to the Open Design community catalog.

### Changed

- `SKILL.md` description rewritten into activation form ("Use this plugin when…"), which the plugin
  spec requires and which Open Design reviewers block on.
- `od.useCase.query` is now localized `en` + `zh-CN`, matching both curated community plugins.

## [0.1.2] - 2026-08-16

### Fixed

- **GitHub Packages publish went to the wrong registry.** `actions/setup-node` writes
  `@ross-sec:registry=https://registry.npmjs.org/` into `.npmrc`, and a *scoped* registry mapping
  takes precedence over `--registry`. The step therefore re-published to npmjs and failed instead of
  reaching `npm.pkg.github.com`. It now rewrites `.npmrc` before publishing.

## [0.1.1] - 2026-08-16

Validated against a running Open Design daemon (0.15.1). Everything below was found by the real
loader or a real project — not by review.

### Fixed

- **Sync bookkeeping leaked into bundles.** The I4 exclusion matched only `_ds_sync.json`, the
  proprietary tool's anchor. A project that arrived through `sync-od` carries `_ods_sync.json` and
  `_ods_needs_recompile`, and both were being re-exported — a stale inbound anchor travelling with
  outbound code can later vouch for state it never saw. Broadened to one shared `SYNC_BOOKKEEPING`
  constant used by both the mirror and the gate, with a regression test.
- **`od.context.skills[{path}]` does not resolve** in 0.15.1 — it emits `Unknown skill ref` and
  contributes no context item, even for Open Design's own bundled `od-default`. Removed; the
  portable skill reaches the prompt through `compat.agentSkills`, which is what the first-party
  `od-nextjs-export` does. `od plugin validate` is now diagnostic-free.
- **`{{var}}` interpolation is not implemented.** `useCase.query` placeholders survived verbatim
  into the user's brief field. Rewritten as plain prose; inputs already arrive separately in
  `ApplyResult.inputs`.
- **Spec scaffold crashed on any project without a design system** — the token table dereferenced
  `designSystem.dir` unconditionally. It now reads the token carrier phase 00 detected (W3C-ish
  `tokens.json` or CSS custom properties), and the gate is advisory. Extracted 147 tokens from a
  real project that has no manifest.
- **The zip prompt embedded an absolute local path**, useless once pasted into an agent on another
  machine. Bare filename now.

### Added

- `references/platforms.md` — "Verified against a live daemon", documenting five things the spec
  gets wrong: the daemon does not listen on `7456`, `--source` must be `./`-relative and resolves
  against the daemon's runtime dir, `path` refs do not resolve while `ref` does, no `{{var}}`
  templating, and local installs land `trusted` with auto-derived capabilities.

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
