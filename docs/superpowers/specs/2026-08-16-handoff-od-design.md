# handoff-od — Design Spec

**Date:** 2026-08-16
**Package:** `@ross-sec/handoff-od`
**Plugin id:** `handoff-od`
**Status:** approved, implementing

Reproduce the **process** of Claude Design's proprietary design-to-code handoff as an installable
**Open Design** plugin whose receiving end is **OpenCode** — same workflow, both ends open source.
This closes the loop opened by `@ross-sec/sync-od`:

```
sync-od     : codebase      ->  Open Design      (already shipped)
handoff-od  : Open Design   ->  OpenCode         (this spec)
```

**The retarget is the point, not the naming.** Every mechanism below is recovered from the
proprietary flow and re-pointed: the MCP prompt names Open Design's own `od mcp` and defaults to
`--agent opencode`; the bundle's entry point is `AGENTS.md`; and both prompt forms plus the bundle
README tell the receiving agent it can push its work back with `sync-od`. That last sentence is what
makes it a round trip rather than a one-way export.

Harness-neutrality is preserved deliberately — the same bundle drops into Claude Code, Cursor,
Codex or Pi, and `--agent` targets any `od mcp install` client. OpenCode is the default, not a
restriction.

---

## 1. Evidence base

Every contract below is recovered from primary evidence, not from documentation.

| Id | Evidence | Use |
|---|---|---|
| B1 | `IMAGE STUDIO UI APP-handoff_LAST.zip` (16.0 MB, 151 entries, 2026-07-26) | richest A-bundle; contains 4 B-folders |
| B2 | `IMAGE STUDIO UI APP-handoff.zip` (7.9 MB, 74 entries, 2026-07-18) | earlier snapshot, same project |
| B3 | `Orot Halahca App-handoff.zip` (2.3 MB, 66 entries, 2026-07-23) | multi-screen app + bound DS + alias dir |
| B4 | `Ross CSS - shadcn Set-handoff.zip` (113 KB, 82 entries, 2026-07-18) | design-system project; expanded `components/` |
| B5 | 6 authored `design_handoff_*/README.md` | Mechanism-B section spine |
| B6 | `_adherence.oxlintrc.json` x2, `_ds_manifest.json` x3, `tokens/tokens.json` | generator algorithms |
| B7 | `docs/plugins-spec.md` + `open-design.plugin.v1.json` (nexu-io/open-design) | OD plugin contract |
| B8 | `plugins/_official/atoms/handoff/` + `scenarios/od-nextjs-export/` | first-party plugin template |

The verbatim recovered corpus lives in `.reference-private/` — **gitignored, never published**.
Same precedent as `sync-od`. What ships is a clean-room paraphrase.

### 1.1 Verified negatives

Bundles contain **no** JSON manifest, **no** `HANDOFF.md`, **no** `AGENTS.md`, **no**
`IMPLEMENTATION.md`, **no** screenshots. The instruction file is always `README.md`.
The tree shape *is* the schema — convention over manifest. Do not add one.

The Claude Code binary has zero hits for the handoff skill across 2.1.214/215/216; it fetches
design instructions at runtime. `/design-sync` is the **opposite** direction and is unrelated.

The `.jsx.txt` / `.d.ts.txt` suffix seen in Open Design is added by **OD's importer**.
Claude Design ships plain `.jsx` / `.d.ts`. **Never re-suffix.**

---

## 2. The two mechanisms

The single most important structural fact. Public writeups conflate them; the bundle bytes do not.

| | **A — export bundle** | **B — authored handoff folder** |
|---|---|---|
| Produced by | server-side, **mechanical, no LLM** | the design agent, authoring |
| Root | `<project-slug>/` | `design_handoff_<feature-slug>/` |
| Instruction file | fixed template, **one variable paragraph** | bespoke, ~12 sections, hundreds of lines |
| Content | verbatim mirror of the whole project FS | curated subset for one feature |
| Spec depth | none — "read the HTML" | exhaustive — per-screen, hex, px, states, algorithms |
| Cost | instant | a full agent turn |

**They compose.** B1 is an A-bundle whose `project/` contains four B-folders. Our default
(`depth: both`) reproduces exactly that.

---

## 3. Mechanism A — the export bundle

### 3.1 Naming

- Archive: `<Project Display Name>-handoff.zip` — the `-handoff` suffix is the discriminator
  against OD's plain project export.
- Also emit `<Project Display Name>-handoff.tar.gz` (Claude Design's URL path serves gzip).
- Single root dir: project name slugified to **lower-kebab**.
  `IMAGE STUDIO UI APP` -> `image-studio-ui-app`; `Ross CSS - shadcn Set` -> `ross-css-shadcn-set`.

Slug algorithm: NFKD normalize, strip diacritics, lowercase, replace every run of
non-`[a-z0-9]` with `-`, trim leading/trailing `-`, collapse repeats.

### 3.2 Tree

```
<project-slug>/
├── README.md                  # the only generated file (§3.3)
├── AGENTS.md                  # pointer, ours, when rootPointers=true (§3.7)
├── CLAUDE.md                  # pointer, ours, when rootPointers=true (§3.7)
├── chats/                     # only when includeChats=true
│   └── chat1.md
└── project/                   # verbatim mirror, nothing renamed
    ├── .thumbnail             # headerless WebP, no extension
    ├── <Design>.dc.html
    ├── support.js
    ├── CLAUDE.md              # ONLY if the project already had one — copied, not generated
    ├── DESIGN.md              # ditto
    ├── _ds/<ds-slug>-<uuid>/  # §3.4
    ├── _ds/<short-alias>/     # §3.4
    ├── uploads/ resources/ exports/ lib/
    └── design_handoff_*/      # B-folders, when depth=both
```

Root purity is a hard invariant across B1-B4: exactly `README.md` + `project/`.
`AGENTS.md`/`CLAUDE.md` pointers are our **only** root divergence, behind a flag.

### 3.3 The README

One generated file, one variable paragraph, byte-stable since at least 2026-07-18.

Template slots: `{{SLUG}}`, `{{PROJECT_NAME}}`, `{{ENTRY_DIRECTIVE}}`, `{{CHATS_DIRECTIVE}}`.

`{{ENTRY_DIRECTIVE}}` has two forms:

- **Form 1 — entry file known.** Names `{{SLUG}}/project/{{OPEN_FILE}}`, states the user had it
  open at trigger time, mandates read-in-full then follow-imports.
- **Form 2 — no entry file.** Instructs finding the primary design file under `{{SLUG}}/project/`,
  then the same follow-imports rule.

`{{OPEN_FILE}}` resolution in OD: `get_active_context()` returns the active project **and file** —
the exact analogue of Claude Design reading the open editor tab. Absent -> Form 2.

**Six design decisions the README encodes.** Preserve all six in the paraphrase; they are the
actual product:

1. Reading order is mandated — entry file in full, then transitively follow imports.
2. Anti-skim — read top to bottom, do not skim.
3. **Anti-screenshot** — do not render in a browser or screenshot unless asked. The source is
   authoritative and complete. (Deliberately the inverse of the design tool's own verify loop.)
4. Prototype != production — recreate the *visual output*, not the prototype's internal structure.
5. Clarify-before-building — ask on ambiguity; cheaper than building the wrong thing.
6. Framework-agnostic — React, Vue, native, whatever fits the target codebase.

**Licensing.** The recovered original is stored in `.reference-private/` only. `references/readme-template.md`
is a clean-room paraphrase carrying all six decisions in our own words, with Ross attribution.

### 3.4 Design system materialization

The bound design system is copied **whole** into `project/_ds/<ds-slug>-<ds-uuid>/`, plus a
**short alias directory** (`_ds/orot/`) carrying duplicate `_ds_bundle.css` / `_ds_bundle.js` /
`fonts/` — the alias is the name the HTML actually references in `<script src>` / `@import`.
Both must exist or the prototypes break offline.

Payload:

```
_ds/<ds-slug>-<uuid>/
├── README.md                  # DS usage guide + auto-generated token/component census
├── styles.css                 # @import "./fonts/fonts.css"; @import "./_ds_bundle.css";
├── _ds_bundle.css
├── _ds_bundle.js              # UMD, window.<Namespace>.*, /* @ds-bundle: … */ header
├── _ds_manifest.json          # §3.5
├── _adherence.oxlintrc.json   # §3.6
├── tokens/tokens.json         # W3C-ish: $name, $description, color/glass/radius/elevation/type/motion
├── fonts/fonts.css + *.woff2  # REAL BINARIES
└── components/<group>/<Name>/ # conditional — see below
```

**Two DS shapes, branch on this:**

- **project-local DS** -> expanded `components/<group>/<Name>/{<Name>.jsx,.d.ts,.html,.prompt.md}` (B4)
- **published npm library** -> collapsed into `_ds_bundle.js`, no `components/` (B1, B3)

Detect via `_ds_manifest.json.source`.

**Offline-complete is a hard gate.** Real `.woff2` binaries, not Google Font links. A bundle that
needs the network to render is a failed bundle.

**Exclude `_ds_sync.json`** — inbound-sync bookkeeping, deliberately absent from all four bundles.

### 3.5 `_ds_manifest.json`

Keys, confirmed across three samples:

```
namespace          string   e.g. "RossCSSShadcnSet_1fef04"
components         [{name, sourcePath}]
startingPoints     []
cards              [{path, group, viewport?}]
templates          -
hasThumbnailHtml   boolean
globalCssPaths     ["styles.css"]
tokens             [{name, value, kind, definedIn}]   kind: color|glass|radius|elevation|type|motion
themes             -
fonts              -
brandFonts         -
source             -        # drives the §3.4 shape branch
```

### 3.6 `_adherence.oxlintrc.json` — the machine-enforced fidelity contract

Not documentation. A generated oxlint config that polices the **target** codebase. This is what
makes "implement it perfectly" checkable, and it is the highest-value thing in the bundle.

Top-level keys: `plugins`, `rules`, `overrides`, `x-omelette`.

```jsonc
{
  "plugins": ["react", "import"],
  "rules": {
    "react/forbid-elements": ["warn", { "forbid": [ /* from x-omelette */ ] }],
    "no-restricted-imports": ["warn", { "patterns": [ { "group": [ /* globs */ ], "message": "…" } ] }],
    "no-restricted-syntax": ["warn", /* 3 fixed + 1 per component */ ]
  },
  "overrides": [ { "files": ["**/index.js"], "rules": { "no-restricted-imports": "off" } } ],
  "x-omelette": { "components": { "<Name>": { "replaces": ["<native>"] } }, "tokens": ["--…"] }
}
```

**Generator algorithm — fully derivable from `_ds_manifest.json` + each component's `.d.ts`:**

1. `x-omelette.components[Name].replaces[]` — native element(s) the component supersedes.
   Observed: `Button`->`button`, `Input`->`input`, `Dialog`->`dialog`. Empty array otherwise.
2. `react/forbid-elements.forbid[]` — one `{element, message}` per non-empty `replaces`, message
   `Use <Name> from the design system instead of <element>.`
3. `no-restricted-imports.patterns[0].group[]` — `dirname(component.sourcePath) + "/**"` for every
   component. Single fixed message: import from `index.js`, not component internals.
4. `no-restricted-syntax` — three fixed selectors then one per component:
   - raw hex: `Literal[value=/#[0-9a-fA-F]{3,8}\b/]`
   - raw px: `Literal[value=/\b\d+px\b/]`
   - font: `Literal[value=/font-family\s*:\s*(?!['\"]?(?:<FONTS>))/i]` where `<FONTS>` is the DS
     font allowlist, pipe-joined; message names the available fonts
   - per component:
     `JSXOpeningElement[name.name='<Name>'] > JSXAttribute > JSXIdentifier[name!=/^(?:<props>|key|ref|className|style|children)$/]`
     message `<Name> doesn't accept that prop. Declared props: <props, comma-joined>.`
     `<props>` comes from the component's `.d.ts`; the tail `key|ref|className|style|children`
     is always appended.
5. `x-omelette.tokens[]` — every CSS custom property name from `manifest.tokens[].name`, sorted.

Severity is `warn` throughout — advisory, not build-breaking.

Generate **only when a design system is bound.** No DS -> no adherence file.

### 3.7 Root pointers (our addition)

Manifest input `rootPointers`, default `true`. Emits two short files at bundle root:

- `AGENTS.md` — harness-neutral entry point; points at `README.md` and names the `sync-od` return leg
- `CLAUDE.md` — one-line pointer to `AGENTS.md`

Set `false` for strict root purity.

### 3.8 The round trip

The bundle README carries a `## Sending changes back` section, and both prompt forms end with the
same note: the codebase can be synced back into Open Design with `@ross-sec/sync-od`.

```
Open Design  --handoff-od-->  codebase  --sync-od-->  Open Design
```

This is the one piece the proprietary original has no equivalent of, because its return leg is a
closed product. It is also the reason the pair exists, so it is covered by tests rather than left
to prose: `hod-prompt.js` must default to `--agent opencode`, every transport must mention
`sync-od`, and the bundle must document the loop.

---

## 4. Mechanism B — the authored handoff folder

`design_handoff_<feature-slug>/` at the project cwd. Keeping Claude Design's exact folder name
for recognisability (`manalkaff/opendesign` moved it to `opendesign/handoffs/`; we do not —
the brief was the *exact same process*).

```
design_handoff_<feature-slug>/
├── README.md      # the spec — the deliverable
├── DESIGN.md      # full design system doc
├── prototypes/    # HTML design references, open in a browser
├── reference/     # paste-ready code (tsx, css)
└── assets/        # when the feature ships binaries
```

### 4.1 Section spine

Derived from six real authored READMEs (B5), not from a reconstruction.

**Title:** always `# Handoff: <Project> — <Feature>`.

**Required, in order:**

| # | Section | In 6 samples |
|---|---|---|
| 1 | `## Overview` | 5/6 |
| 2 | `## About the Design Files` | 6/6 |
| 3 | `## Fidelity` | 6/6 |
| 4 | *scope body* — see below | 6/6 |
| 5 | `## Interactions & Behavior` | 5/6 |
| 6 | `## State Management` | 4/6 |
| 7 | `## Design Tokens` | 5/6 |
| 8 | `## Assets` | 6/6 |
| 9 | `## Files (in this bundle)` | 6/6 |

**Scope body** takes one of three observed forms, chosen by feature shape:

- `## Screens / Views` + `### N. <Name> — <route>` per screen (app features)
- `## Surface map — what exists, where it is specified` (whole-project handoffs)
- domain sections, e.g. `## The material model`, `## The Mark — canonical geometry` (design systems, identity)

**Optional, high value — include when they apply:**

- `### Route map (recreate the state machine as real routes)` — the **prototype -> target
  impedance table**. A prototype has one `screen` state machine and no routing; the target has
  real routes. This table is the single most valuable original content in the corpus and appears
  in no reconstruction. Emit it whenever the prototype multiplexes screens in one file.
- `## Recommended build order` / `## Recommended implementation order`
- `## Key implementation contracts (do not improvise these)`
- `## Shell layouts (responsive)` / `## Responsive behavior`
- `## Backend integration` / `## Backend (implement fully)`
- `## Definition of done` — checkbox list
- `## Known non-issues`

**Opt-in only:** `## Visual verification with playwright-cli (required)`. Present in 3/6, all from
one project, and the evidence indicates it was elicited by the user's own global `viz` rule rather
than generated by the tool. Behind input `verification`, default `false`.

### 4.2 Authoring rules

- State up front that bundled HTML is a **design reference**, not the shipping artifact.
- Be exact: hex, px, font weight, letter-spacing, easing, duration. Specify **algorithms**, not
  descriptions — e.g. a password-strength meter gets its scoring rule and per-score color/width.
- Factor shared chrome out once (the glass card, the shell), then reference it per screen.
- Quote exact copy strings.
- Self-sufficient: a developer who was not in the conversation implements from the README alone.
- **Ask about screenshots; default no.** All four A-bundles contain zero images at root.
- Sub-folder naming is descriptive (`prototypes/` vs `design/`); only `design_handoff_<slug>/`
  and `README.md` are invariant.

---

## 5. Open Design integration

### 5.1 What an OD plugin is

A **folder**, not an npm package. `SKILL.md` (required, portable) + `open-design.json` (optional
sidecar that unlocks OD's product surface). **Plugins ship zero executable code** — no hooks, no
lifecycle, no entrypoint. You contribute declarations and prose; the daemon injects them into the
agent's system prompt, and the agent shells out to the scripts we bundle.

Nothing OD publishes is on npm (`@open-design/*` all 404, every workspace package `private: true`).
**Add no `@open-design/*` dependency — it will not resolve.** Validate against the published schema
URL instead.

### 5.2 Manifest

```jsonc
{
  "$schema": "https://open-design.ai/schemas/plugin.v1.json",
  "specVersion": "1.0.0",          // required
  "name": "handoff-od",            // required, ^[a-z0-9][a-z0-9._-]*$
  "version": "0.1.0",              // required
  "title": "Handoff to Claude Code",
  "od": {
    "kind": "scenario",
    "taskKind": "tune-collab",
    "scenario": "downstream-export",
    "mode": "handoff",
    "pipeline": { "stages": [
      { "id": "detect",  "atoms": ["design-extract", "token-map"] },
      { "id": "bundle",  "atoms": ["todo-write"] },
      { "id": "verify",  "atoms": ["diff-review"] },
      { "id": "handoff", "atoms": ["handoff"] }
    ] },
    "genui": { "surfaces": [ { "id": "handoff-ready", "kind": "confirmation", "persist": "run",
                               "trigger": { "stageId": "handoff" } } ] },
    "capabilities": ["prompt:inject", "fs:read", "fs:write", "bash"]
  }
}
```

**The atom catalog is CLOSED** — 13 first-party atoms; authors cannot register new ones. We use
only atoms verified present on disk: `design-extract`, `token-map`, `todo-write`, `diff-review`,
`handoff`. Note `file-read`/`file-write`, used by the shipped `export-nextjs-handoff` example, are
**absent from the catalog** — treat that example as stale and let `od plugin doctor` arbitrate.

### 5.3 Inputs

| name | type | default | effect |
|---|---|---|---|
| `depth` | select `bundle`\|`spec`\|`both` | `both` | which mechanism(s) run |
| `feature` | string | — | B-folder slug; prompts when `depth` includes `spec` |
| `transport` | select `zip`\|`mcp`\|`both` | `zip` | archive, live MCP wiring, or both |
| `includeChats` | boolean | `false` | attach the conversation transcript |
| `rootPointers` | boolean | `true` | emit `AGENTS.md`/`CLAUDE.md` pointers |
| `verification` | boolean | `false` | emit the playwright section in the B-README |

### 5.4 The "button"

A plugin **cannot** add a toolbar button — *"agent/plugin output is data; OD owns the renderer."*
GenUI kinds are a closed vocabulary (`form`/`choice`/`confirmation`/`oauth-prompt`).

What we get is a **card in the inline plugins rail** under the composer, on Home and inside every
project. Clicking **Use** applies the plugin in place, no navigation. That is the button.
The final stage raises a `confirmation` surface naming the exact archive path.

### 5.5 Delivery

OD has **no `export/zip` route** — export is pdf/image/pptx only. We write into the project cwd
with `fs:write` + `bash`; the output is then a normal project file, readable via `od files read`
and the MCP `list_files`/`get_artifact` tools.

`transport: mcp` additionally prints the `od mcp install <agent>` wiring, OD's own intended
handoff path (its help text pitches working *"without exporting a zip"*). Supported agents include
`claude`, `opencode`, `codex`, `cursor`, `pi`, and others.

### 5.6 Install

Third-party plugins install **`restricted`** — `prompt:inject` only until the user grants.

```bash
od plugin install --source ./node_modules/@ross-sec/handoff-od
od plugin install github:ross-sec/handoff-od
od plugin trust handoff-od --capabilities fs:read,fs:write,bash
```

Also: drag-drop via `POST /api/plugins/upload-zip`, or vendored at
`<projectCwd>/.open-design/plugins/handoff-od/` (discovery tier 1) to version-control it with the
user's own repo. Headless capability-gate failure is **exit 66**; retry with `--grant-caps`.

---

## 6. Package

npm package root **is** the plugin folder — one artifact, every install path.

```
plugins/handoff-od/
├── SKILL.md  open-design.json  package.json  icon.svg
├── scripts/      hod-detect · hod-bundle · hod-spec · hod-validate · hod-archive · _lib
├── references/   RUNBOOK · 00-04 phases · readme-template · spec-sections · adherence · platforms · mcp-contract
├── agents/       handoff-od-lead · handoff-od-spec-writer
├── preview/      index.html · poster
├── test/         node --test
└── README.md  LICENSE  CHANGELOG.md  .github/workflows/publish.yml
```

**Dropped from the `sync-od` template: `esbuild`, `typescript`, `dist/`, `index.ts`.** OD plugins
have no executable entrypoint, so there is nothing to compile. Scripts are plain Node ESM with
**zero dependencies**; archiving shells out (`tar -a -c -f` on Windows, `zip -r`/`tar` elsewhere)
rather than taking an archive dependency.

Branding follows `sync-od`: `@ross-sec` scope, MIT, Ross Technologies header, `#2891e2` badges,
dual-registry publish workflow, `files[]` allowlist.

---

## 7. Pipeline and gates

Every phase has a real artifact at a real path and a gate that fails loudly.

| Phase | Script | Artifact | DONE-gate |
|---|---|---|---|
| 00 | `hod-detect.js` | `.handoff/state.json` | entry file resolved (or Form 2 recorded); DS resolved or explicitly none; token carrier named |
| 01 | `hod-bundle.js` | `<slug>/` | README slots all filled; `project/` mirrored verbatim; `_ds/` + alias present; adherence config emitted when DS bound |
| 02 | `hod-spec.js` | `design_handoff_<slug>/` | skeleton written, prototypes+DESIGN.md copied (agent then authors prose) |
| 03 | `hod-validate.js` | verdict json | see below |
| 04 | `hod-archive.js` | `.zip` + `.tar.gz` | archive entry count >= tree file count |

**Validate gates (03):**

- offline-complete — zero remote font/script/style URLs anywhere in the tree
- no `_ds_sync.json` anywhere
- no `.txt` re-suffix on `.jsx` / `.d.ts`
- README has no unfilled `{{SLOT}}`
- root contains only the permitted set
- `_adherence.oxlintrc.json` parses **and** its per-component prop lists agree with `_ds_manifest.json`
- `--spec`: required sections present in order, zero `TODO` markers, every hex/px claim traces to a source file

**Invariants**

| Id | Rule |
|---|---|
| I1 | `project/` is a verbatim mirror — never rename, never re-suffix, never reformat |
| I2 | The bundle is offline-complete — real font binaries, no network needed to render |
| I3 | Both the UUID DS dir and its short alias exist |
| I4 | `_ds_sync.json` never ships |
| I5 | No manifest, no screenshots — convention over schema |
| I6 | `README.md` is the sole instruction carrier; pointers may point, never duplicate |
| I7 | Adherence config only when a DS is bound; derived, never hand-written |
| I8 | Archive only after 03 passes |

---

## 8. Test strategy

- **Golden-file test.** Render the template for `IMAGE STUDIO UI APP` and structurally diff
  against the real bundle: tree shape, root purity, slug, DS dir naming, alias presence.
- **Generator tests.** Feed real `_ds_manifest.json` samples to the adherence generator; assert
  rule shape, selector regexes, prop-list tails, `overrides`, `x-omelette`.
- **Slug table test.** The four known project-name -> slug pairs.
- **Validate tests.** Each gate fails on a deliberately broken fixture.
- **OD integration.** `od plugin validate` -> `install` -> `doctor` -> `simulate` -> `apply`.

**Prerequisite:** the OD daemon must be running (`http://127.0.0.1:7456`); it was offline during
research. Test against the locally installed **0.15.1**; the repo is at 0.19.2 — expect drift, and
trust `od plugin --help` over the spec doc.

---

## 9. Out of scope for v0.1.0

- A browser Download button — no OD route exists, and preview iframes lack `allow-downloads`.
- Publishing to the OD community marketplace (`od plugin open-design-pr`) — after local validation.
- `genui.surfaces[].component` custom React — Phase 4 in OD, gated, not generally shipped.
- Figma round-trip.
