# Changelog

All notable changes to `@ross-sec/handoff-od` are documented here.

## [0.1.5] - 2026-08-16

Found in review round 2 of the Open Design catalog submission (nexu-io/open-design#6948).
**Anyone on 0.1.4 or earlier should upgrade** — a bundle built from a project containing symlinks
could carry files from outside that project.

### Added

- **I9 — nothing outside the project directory is ever mirrored, named or read.** A new invariant,
  documented in `references/bundle-contract.md`, enforced by gates in phases 00, 01 and 03.

### Fixed

- **A symlink to a file outside the project was mirrored as its target's content.** `walk()`
  classified entries with `Dirent.isDirectory()`, which describes the *link*, not what it points at,
  so every symlink was treated as a file and handed to `copyFileSync` — which follows it. Reproduced
  against 0.1.4: a project link named `linked-secret.txt` pointing at an external `creds.env` put
  `AWS_SECRET_ACCESS_KEY=hunter2` into the bundle as an ordinary file, from where it would have
  travelled inside the archive. Such links are now refused, and named in the gate output.

- **A symlink to a directory aborted the handoff.** The same misclassification sent directory links
  to `copyFileSync`, which throws `EISDIR` on POSIX and `EPERM` on Windows — an unhandled exception
  partway through the mirror, leaving a half-written bundle. Directory links are now classified
  before anything is copied.

- **The refusal happens before `--force` deletes the previous bundle.** Ordering the check after the
  rebuild would have cost the user a good bundle and produced nothing in its place.

- **A symlink could smuggle an excluded path into a bundle.** A link inside the project pointing at
  `node_modules/`, `.git/` or sync bookkeeping resolved to an excluded target under an innocent name.
  The exclude list is now applied to the resolved target as well as the link.

- **Raw path input bypassed the walker entirely** — the same disclosure through a different door,
  no symlink required. `hod-spec.js --files ../../secrets.env` copied an external file into a spec
  folder that then ships; `hod-prompt.js --focus` named external paths for the receiving agent to
  open; `hod-detect.js --entry` accepted a path outside `--project-dir`; and `designSystem.dir`, read
  back from a hand-editable `state.json`, was trusted because phase 00 had produced it. All four are
  now checked against the project root, symlinks resolved.

### Changed

- Symlinks resolving **inside** the project are followed and materialized as their target's content,
  rather than rejected wholesale. A bundle has to be self-contained, and zip/tar plus a Windows
  extract would flatten or break a preserved link. Directory links are walked into, with a loop guard.
- `walk()` now returns regular files only. A fifo, socket or device node would hang or fail the copy
  and is never a design file.
- Phase 03 asserts the finished bundle contains **no** symlinks at all — any survivor is a hole the
  archive would flatten or drop.

### Tests

- 17 new tests (54 total, green on Linux and Windows): file and directory links with targets inside
  and outside the project, dangling links, a link into an excluded directory, a symlink loop, an
  internal link surviving the full detect → bundle → validate run as real content, a symlink planted
  into a built bundle, `--force` refusing without destroying the previous bundle, and the four raw
  path-input escapes. The suite probes for symlink support at startup and fails loudly if no link
  kind can be created, so the coverage can never pass vacuously.

## [0.1.4] - 2026-08-16

Found in review of the Open Design catalog submission (nexu-io/open-design#6948). **Anyone on 0.1.3
should upgrade** — the bug below destroys data with no warning.

### Fixed

- **`--force` could delete the entire output directory.** `slugify()` strips every character outside
  `[a-z0-9]`, so a project named `设计`, `дизайн` or `🎨` produced an empty slug. `hod-bundle.js` then
  computed `bundleRoot = join(outRoot, "")`, which *is* `outRoot`, and the documented rebuild path ran
  `rmSync(outRoot, { recursive: true, force: true })` against it. Reproduced against 0.1.3: with
  `--out <dir>`, every unrelated file and directory under the output root was wiped and only the fresh
  mirror survived. Without `--force` the same projects could not bundle at all, because the output
  directory always "already existed".

  Fixed in two independent places, because state is read back from disk and a `.handoff/state.json`
  written by 0.1.3 still carries the empty slug:

  - `slugSafe()` — a project name with nothing slug-worthy in it falls back to
    `project-<sha256(name)[0..8]>`, which is non-empty, stable across runs (so `--force` can still
    rebuild) and distinct per name (so two projects never share a directory). A name that already
    slugifies is untouched.
  - `childDir()` — every path the pipeline deletes or writes a tree into is resolved through a guard
    that refuses anything not a strict descendant of the output root: `""`, `.`, `..`, `../escape`,
    `a/../..`, `/abs`, `C:\abs`. Applied in `hod-bundle.js`, `hod-validate.js`, `hod-archive.js` and
    `hod-spec.js`, so the deletion target cannot equal `outRoot` regardless of where the slug came from.

- **The project display name reached the archive filename unsanitized.** A name containing `/`, `\`,
  `:` or a control character could steer `<name>-handoff.zip` out of the output directory or produce a
  filename Windows rejects. It is now stripped to a safe basename, falling back to the slug.

- **An unslugifiable `--feature` selected the whole project.** `hod-spec.js` filtered prototypes with
  `slugify(basename(f)).includes(slugify(feature).split("-")[0])`; when the feature slug was empty
  that inner value was `""`, which every string contains. It now falls back to the entry file.

### Added

- Regression coverage for all of the above: a non-Latin project name bundles and `--force`-rebuilds
  into its own directory with an untouched sibling sentinel; `hod-bundle.js` exits 2 on each of the
  seven escaping slugs above, with the project and output directory intact afterwards; the archive
  filename cannot leave the output root; and `slugSafe` is asserted non-empty, deterministic and
  collision-free. 37 tests, green.

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
