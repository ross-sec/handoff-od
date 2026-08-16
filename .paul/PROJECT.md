---
description: "Hand an Open Design project to OpenCode and have it implemented faithfully — design system intact, fidelity enforced by lint rather than by eye"
type: Project
about: "handoff-od"
---

# handoff-od

## What This Is

`@ross-sec/handoff-od` is an **Open Design plugin** that packages a design project into something a
coding agent can implement from: a copyable MCP prompt (the primary path), an offline-complete
`<Project>-handoff.zip`, and an optional authored per-screen implementation spec. It is the
open-source counterpart of Claude Design's proprietary design-to-code handoff — the same process,
recovered by diffing four real handoff bundles, with both ends open. It is also the return leg of
`@ross-sec/sync-od`, which is what closes the round trip.

## Core Value

An Open Design user can hand a project to OpenCode and have it implemented faithfully — design
system, tokens and font binaries intact — with design fidelity enforced by a generated lint config
instead of by eye.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application (Open Design plugin / npm package) |
| Version | 0.1.0 |
| Status | Built, committed, locally validated — unpublished |
| Last Updated | 2026-08-16 |

## Requirements

### Core Features

- **Mechanism A — bundle.** Deterministic, no model tokens: verbatim project mirror, design system
  materialized with its short alias and real font binaries, generated adherence config.
- **Mechanism B — spec.** An authored per-screen implementation document, scaffolded with the token
  table, asset inventory, file tree, and a route map derived from the prototype's screen states.
- **Prompt-first transport.** MCP prompt (default `--agent opencode`) with local imports
  auto-discovered; the archive is the fallback, matching the original.
- **Adherence generator.** `_adherence.oxlintrc.json` from `_ds_manifest.json` + each `.d.ts`.
- **The round trip.** Every prompt form and the bundle itself tell the receiving agent it can push
  back with `sync-od`.

### Validated (Shipped)

- [x] Full pipeline `detect -> bundle -> validate -> archive` — 0.1.0
- [x] Adherence generator reproduces all 22 rules of a real config byte-for-byte — 0.1.0
- [x] Verified end to end against two real projects (design-system-kind and app-kind) — 0.1.0
- [x] 30 tests, zero dependencies, no build step — 0.1.0

### Active (In Progress)

None — 0.1.0 is committed and green.

### Planned (Next)

- [ ] Live validation against a running Open Design daemon (`od plugin validate/install/doctor/simulate/apply`)
- [ ] Publish: GitHub repo, npm, GitHub Packages, release
- [ ] Community marketplace PR (`od plugin open-design-pr`)
- [ ] Prove the round trip end to end: handoff-od -> OpenCode -> sync-od -> Open Design

### Out of Scope

- A browser "Download ZIP" button — no Open Design route exists, and preview iframes lack `allow-downloads`.
- Custom GenUI React components — Phase 4 upstream, gated, not generally shipped.
- Figma round-trip.
- Redistributing any recovered third-party text; the generated README is a clean-room paraphrase.

## Target Users

**Primary:** Open Design users who design in the app and implement with OpenCode.
- Want the design system, not just screenshots, to reach the code.
- Already use `@ross-sec/sync-od` for the other direction, or will.

**Secondary:** Anyone on Claude Code, Cursor, Codex or Pi — the bundle is harness-neutral and
`--agent` targets any `od mcp install` client.

## Context

**Business Context:** Ships under the Ross Technologies `@ross-sec` scope alongside `sync-od`.
Together the pair is the differentiator: a fully open design/code round trip.

**Technical Context:** Open Design plugins are *folders*, not npm packages, and ship **zero
executable code** — declarations plus prose injected into the agent's system prompt. Nothing Open
Design publishes is on npm, so there is no SDK to depend on. This package's root *is* the plugin
folder, which is what makes every install path work at once.

## Constraints

### Technical Constraints

- Atom catalog is **closed** (13 atoms); authors cannot register new ones.
- GenUI surface kinds are closed: `form` / `choice` / `confirmation` / `oauth-prompt`. **No toolbar
  button is possible** — the inline plugins-rail card is the button.
- No `export/zip` route; the archive is written into the project cwd with `fs:write` + `bash`.
- Third-party plugins install `restricted`; capabilities need an explicit `od plugin trust`.
- Version skew: repo 0.19.2 vs this machine 0.15.1. Trust `od plugin --help` over the spec doc.
- GNU tar silently writes a TAR for `-a -c -f out.zip`, and on Windows reads `C:\` as a remote host.

### Business Constraints

- Everything published is public — no secrets, and no redistribution of the recovered corpus.
- Must match `sync-od`'s branding, package shape and dual-registry publish flow.

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| Package root **is** the plugin folder | Makes npm, `github:`, zip-upload and tier-1 vendoring all work from one artifact | 2026-08-16 | Active |
| No build step, zero dependencies | OD plugins ship no executable entrypoint — nothing to compile | 2026-08-16 | Active |
| Clean-room paraphrase of the generated README | Preserves all six design decisions without redistributing third-party text | 2026-08-16 | Active |
| Offline-completeness warns, never fails | The mirror is verbatim; a source that loads remote fonts is not our defect | 2026-08-16 | Active |
| Emit rules for every exported interface | Upstream drops bare-`FC<>` components via a regex quirk; a superset lints more | 2026-08-16 | Active |
| Verify zip magic bytes after writing | GNU tar silently produces a tar named `.zip` | 2026-08-16 | Active |
| OpenCode is the default receiving end | This is the return leg of `sync-od`; harness-neutrality is preserved via `--agent` | 2026-08-16 | Active |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Tests passing | 100% | 30/30 | Achieved |
| Adherence rules reproduced from a real config | 22/22 byte-identical | 22/22 | Achieved |
| Real projects validated end to end | 2 | 2 | Achieved |
| Runtime dependencies | 0 | 0 | Achieved |
| `od plugin doctor` clean on a live daemon | pass | not run | Not started |
| Published to npm + GitHub Packages | yes | no | Not started |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Node >= 20, ESM | Plain JS; no TypeScript, no bundler |
| Dependencies | none | Nothing to install; archiving shells out |
| Plugin contract | `open-design.json` specVersion 1.0.0 | Validated against the published JSON Schema |
| Skill | `SKILL.md` + `references/` | Portable agent-skill frontmatter |
| Tests | `node --test` | 30 tests, self-contained fixtures |
| Publish | GitHub Actions -> npmjs + GitHub Packages | Mirrors `sync-od` |
| Lint contract emitted | oxlint | `_adherence.oxlintrc.json`, `warn` severity |

## Links

| Resource | URL |
|----------|-----|
| Repository | https://github.com/ross-sec/handoff-od (not yet created) |
| npm | https://www.npmjs.com/package/@ross-sec/handoff-od (not yet published) |
| Sibling | https://www.npmjs.com/package/@ross-sec/sync-od |
| Open Design | https://github.com/nexu-io/open-design |
| Skills Hub | https://skills.ross-developers.com |
| Design spec | `docs/superpowers/specs/2026-08-16-handoff-od-design.md` |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-08-16*
