---
description: "handoff-od — milestone and phase structure"
type: Roadmap
about: "handoff-od"
---

# Roadmap: handoff-od

## Overview

Build the Open Design plugin that hands a design project to OpenCode, ship it publicly under the
`@ross-sec` scope alongside `sync-od`, and prove the round trip end to end. The build is done and
locally green; what remains is live validation against a running daemon, publishing, and closing the
loop with a real demonstration.

## Current Milestone

**v0.1 Initial Release** (v0.1.0)
Status: In progress
Phases: 2 of 4 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Build the plugin | 1 | Complete | 2026-08-16 |
| 2 | Live daemon validation | 1 | Complete | 2026-08-16 |
| 3 | Publish | TBD | Not started | - |
| 4 | Prove the round trip | TBD | Not started | - |

## Phase Details

### Phase 1: Build the plugin

**Goal:** A complete, tested, locally validated plugin.
**Depends on:** Nothing.
**Research:** Complete — the process was recovered from four real handoff bundles, the live UI, and
the Open Design plugin spec.

**Scope:**
- Six-phase script pipeline with real DONE-gates
- Adherence generator reproducing a real config byte-for-byte
- Prompt-first transport with import discovery
- Spec scaffold with a derived route map
- 30 tests, zero dependencies, no build step

**Plans:**
- [x] 01-01: Reverse-engineer, build, test, commit v0.1.0

### Phase 2: Live daemon validation

**Goal:** `od plugin doctor handoff-od` clean against a running Open Design daemon.
**Depends on:** Phase 1.
**Research:** Likely — the daemon was offline during the build, so the manifest has never been
exercised by the real loader.
**Research topics:** whether `design-extract` / `token-map` / `todo-write` resolve as declared; how
the inline plugins-rail card actually renders; whether `confirmation` fires at the `handoff` stage;
the 0.15.1-vs-0.19.2 skew.

**Scope:**
- Start the daemon; `od plugin validate` -> `install` -> `trust` -> `doctor` -> `simulate` -> `apply`
- Run against a real Open Design project, not a fixture
- Fix whatever the real loader rejects

**Plans:**
- [x] 02-01: Install + doctor + simulate + apply on a live 0.15.1 daemon; 4 bugs found and fixed (v0.1.1)

### Phase 3: Publish

**Goal:** Installable by anyone.
**Depends on:** Phase 2 (do not publish something the loader rejects).
**Research:** Unlikely — mirrors the `sync-od` flow.

**Scope:**
- Create `github.com/ross-sec/handoff-od`, push `main`
- npm + GitHub Packages via the bundled workflow; tag a release
- Consider the community marketplace PR (`od plugin open-design-pr`)

**Plans:**
- [ ] 03-01: To be defined during `/paul:plan`

### Phase 4: Prove the round trip

**Goal:** A demonstrated loop: Open Design -> handoff-od -> OpenCode implements -> sync-od -> back
into Open Design, with the design system surviving both directions.
**Depends on:** Phase 3.
**Research:** Likely — nobody has run both plugins back to back yet.

**Scope:**
- Pick one real project and drive the whole loop
- Record where fidelity is lost, if anywhere
- Feed the findings back into both plugins

**Plans:**
- [ ] 04-01: To be defined during `/paul:plan`

---
*Roadmap created: 2026-08-16*
*Last updated: 2026-08-16*
