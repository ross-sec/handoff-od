<p align="center">
  <img src="https://raw.githubusercontent.com/ross-sec/ross-sec/main/assets/header.svg" alt="Ross Technologies" width="100%">
</p>

<h1 align="center">Handoff to OpenCode</h1>

<p align="center">
  <strong>Hand an <a href="https://open-design.ai">Open Design</a> project off to <a href="https://opencode.ai">OpenCode</a> — faithfully.</strong><br>
  The open-source counterpart of Claude Design's design-to-code handoff: same process, both ends open.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ross-sec/handoff-od"><img src="https://img.shields.io/npm/v/@ross-sec/handoff-od?style=flat-square&color=2891e2&label=npm%20version" alt="npm version"></a>
  <a href="https://github.com/ross-sec/handoff-od/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-2891e2?style=flat-square" alt="license: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-2891e2?style=flat-square" alt="node >=20"></a>
  <a href="https://open-design.ai"><img src="https://img.shields.io/badge/Open%20Design-plugin-2891e2?style=flat-square" alt="Open Design plugin"></a>
  <a href="https://github.com/ross-sec/handoff-od"><img src="https://img.shields.io/badge/GitHub-ross--sec%2Fhandoff--od-2891e2?style=flat-square&logo=github" alt="GitHub"></a>
</p>

---

## What it does

Closes the loop that [`@ross-sec/sync-od`](https://www.npmjs.com/package/@ross-sec/sync-od) opened.

```
sync-od     : codebase      ->  Open Design      (already shipped)
handoff-od  : Open Design   ->  OpenCode         (this plugin)
```

Two mechanisms, composable — the default runs both:

| Mode | What you get | Cost |
|------|--------------|------|
| **bundle** | `<Project>-handoff.zip` — verbatim project mirror, materialized design system, generated adherence config | seconds, no model tokens |
| **spec** | `design_handoff_<feature>/` — an authored per-screen implementation document | one agent turn |
| **both** (default) | the spec nested inside the bundle | |

---

## Features

| Feature | Description |
|---------|-------------|
| Prompt-first transport | Emits the MCP prompt the agent pastes — the archive is the fallback, not the default |
| Verbatim mirror | Nothing renamed, re-suffixed or reformatted. `Button.jsx` stays `Button.jsx` |
| Design system, whole | Canonical dir **and** the short alias the HTML actually references, plus real `.woff2` binaries |
| Lintable fidelity | Generates `_adherence.oxlintrc.json` — raw hex, raw px, off-system fonts, undeclared props, union values |
| Route map | Pre-fills the prototype-state-machine → real-routes table from the source |
| Real gates | Six hard gates and two advisories; phase 04 refuses to archive an unvalidated tree |
| Verified archives | Checks zip magic bytes, because GNU `tar -a -c -f out.zip` silently writes a **tar** |
| Zero dependencies | Plain Node ESM. No build step, nothing to compile, no SDK to install |

---

## Install

**Open Design plugins are folders, not npm packages** — so this package's root *is* the plugin
folder, and every install path works:

```bash
npm i @ross-sec/handoff-od
od plugin install --source ./node_modules/@ross-sec/handoff-od
```

```bash
od plugin install github:ross-sec/handoff-od
```

Then grant what it needs (third-party plugins install `restricted`):

```bash
od plugin trust handoff-od --capabilities fs:read,fs:write,bash
od plugin doctor handoff-od
```

Or vendor it at `<yourRepo>/.open-design/plugins/handoff-od/` to version-control it with your code.

---

## Prerequisites

The **Open Design daemon must be running** (default `http://127.0.0.1:7456`) — desktop app, or
`pnpm tools-dev` from the Open Design repo.

The `od` binary ships with the desktop app and is usually not on PATH. On macOS and WSL2,
`/usr/bin/od` (octal dump) shadows it — see [`references/platforms.md`](references/platforms.md).

---

## Usage

In Open Design, the plugin appears as a card in the inline rail under the composer. Click **Use**.

| Input | Options | Default |
|---|---|---|
| `depth` | `bundle` · `spec` · `both` | `both` |
| `feature` | free text — the scope for the authored spec | — |
| `transport` | `zip` · `mcp` · `both` | `zip` |
| `includeChats` | boolean | `false` |
| `rootPointers` | emit `AGENTS.md` / `CLAUDE.md` pointers | `true` |
| `verification` | add a visual-verification section to the spec | `false` |

Or drive the scripts directly:

```bash
node scripts/hod-detect.js --project-name "My App" --project-dir <cwd> --entry "Landing.dc.html"
node scripts/hod-bundle.js
node scripts/hod-validate.js
node scripts/hod-archive.js
node scripts/hod-prompt.js --transport mcp --agent opencode
```

---

## The bundle

```
my-app/
├── README.md            # the instruction carrier — generated
├── AGENTS.md CLAUDE.md  # pointers (rootPointers)
└── project/             # verbatim mirror
    ├── <Design>.dc.html  support.js
    ├── _ds/<ds-slug>-<uuid>/   # the design system, whole
    └── _ds/<short-alias>/      # what the HTML actually loads — both must ship
```

No manifest, no screenshots. **The tree shape is the schema.**

---

## Scripts

| Script | Phase | Purpose |
|--------|-------|---------|
| `hod-detect.js` | 00 | Resolve entry file, design system, shape, alias, token carrier |
| `hod-bundle.js` | 01 | Build `<slug>/` — README, mirror, adherence config |
| `hod-spec.js` | 02 | Scaffold `design_handoff_<feature>/` with derived facts |
| `hod-validate.js` | 03 | Six hard gates, two advisories; writes the verdict |
| `hod-archive.js` | 04 | `.zip` + `.tar.gz`, magic-byte verified |
| `hod-prompt.js` | — | The handoff prompt, MCP or zip form |

The emitted prompt tells the receiving agent it can push its work back with `sync-od` — that is what
turns a one-way export into a round trip.

---

## References

| File | What it holds |
|---|---|
| [`RUNBOOK.md`](references/RUNBOOK.md) | Numbered, copy-paste steps with no judgement calls |
| [`adherence.md`](references/adherence.md) | The adherence generator, rule by rule |
| [`spec-sections.md`](references/spec-sections.md) | The authored-README section spine |
| [`bundle-contract.md`](references/bundle-contract.md) | Tree, README slots, invariants I1–I8 |
| [`mcp-contract.md`](references/mcp-contract.md) | The Open Design surface that actually exists |
| [`platforms.md`](references/platforms.md) | Install, trust, capabilities, version skew, zip traps |

---

## Links

| Platform | Link | Description |
|----------|------|-------------|
| npm | [@ross-sec/handoff-od](https://www.npmjs.com/package/@ross-sec/handoff-od) | Public package |
| GitHub | [ross-sec/handoff-od](https://github.com/ross-sec/handoff-od) | Source |
| Sibling | [@ross-sec/sync-od](https://www.npmjs.com/package/@ross-sec/sync-od) | The other direction |
| Open Design | [open-design.ai](https://open-design.ai) | The design workspace |
| Skills Hub | [skills.ross-developers.com](https://skills.ross-developers.com/) | Ross Technologies skills |

---

<p align="center">
  <a href="https://ross-developers.com/"><img src="https://raw.githubusercontent.com/ross-sec/ross-sec/main/assets/connect-website.svg" alt="Website"></a>
  <a href="https://github.com/ross-sec"><img src="https://raw.githubusercontent.com/ross-sec/ross-sec/main/assets/badge-github.svg" alt="GitHub"></a>
</p>

<p align="center"><em>MIT © Andre Ross / Ross Technologies</em></p>
