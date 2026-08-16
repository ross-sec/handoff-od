#!/usr/bin/env node
// Phase 02 — spec scaffold (Mechanism B). Does the MECHANICAL half of the authored
// handoff folder: creates the tree, copies prototypes and the design-system doc,
// and writes a README skeleton with every derivable fact already filled in.
//
// The agent then authors the prose over the TODO markers. hod-validate --spec
// refuses to pass while any remain.
//
//   node scripts/hod-spec.js --feature "auth system" [--files "a.html,b.html"] [--out <dir>]
import { existsSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  args, die, readState, readJson, writeText, walk, slugify, Gates, posix, NEVER_SHIP,
} from "./_lib.js";

const a = args();
const outRoot = a.out ?? process.cwd();
const state = readState(outRoot);
if (!state) die("no .handoff/state.json — run hod-detect.js first");

const { project, entry, designSystem, options } = state;
const feature = (typeof a.feature === "string" && a.feature) || options.feature;
if (!feature) die('--feature is required, e.g. --feature "auth system"');

const slug = slugify(feature).replace(/-/g, "_");
const dir = join(project.dir, `design_handoff_${slug}`);
mkdirSync(join(dir, "prototypes"), { recursive: true });
mkdirSync(join(dir, "reference"), { recursive: true });

/* ── in-scope prototypes ────────────────────────────────────────────────────── */

const all = walk(project.dir, { exclude: [...NEVER_SHIP, /^design_handoff_/] });
const selected = typeof a.files === "string"
  ? a.files.split(",").map((s) => s.trim()).filter(Boolean)
  : all.filter((f) => /\.(dc\.html|html)$/i.test(f) && !f.includes("/") &&
      slugify(basename(f)).includes(slugify(feature).split("-")[0]));

const prototypes = (selected.length ? selected : (entry.file ? [entry.file] : []))
  .filter((f) => existsSync(join(project.dir, f)));

for (const rel of prototypes) copyFileSync(join(project.dir, rel), join(dir, "prototypes", basename(rel)));

for (const doc of ["DESIGN.md"]) {
  if (existsSync(join(project.dir, doc))) copyFileSync(join(project.dir, doc), join(dir, doc));
}

/* ── derivable facts ────────────────────────────────────────────────────────── */

// A prototype usually multiplexes screens through one state machine and has no
// routing. Naming those states is what lets the target turn them into real routes —
// the single highest-value section in the document.
const SCREEN_PATTERNS = [
  /\bscreen\s*===\s*["'`]([\w-]+)["'`]/g,
  /\bdata-screen\s*=\s*["']([\w-]+)["']/g,
  /\bshowScreen\(\s*["'`]([\w-]+)["'`]/g,
  /\bsetScreen\(\s*["'`]([\w-]+)["'`]/g,
];
const screens = new Set();
for (const rel of prototypes) {
  let src = "";
  try { src = readFileSync(join(project.dir, rel), "utf8"); } catch { continue; }
  for (const rx of SCREEN_PATTERNS) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(src))) screens.add(m[1]);
  }
}

const dsDir = designSystem ? join(project.dir, designSystem.dir) : null;
const manifest = dsDir ? readJson(join(dsDir, "_ds_manifest.json")) : null;
const tokens = manifest?.tokens ?? [];
const byKind = tokens.reduce((acc, t) => ((acc[t.kind ?? "other"] ??= []).push(t), acc), {});

const tokenTable = Object.keys(byKind).length
  ? Object.entries(byKind).sort().map(([kind, list]) =>
      `**${kind}** (${list.length})\n\n| Token | Value |\n|---|---|\n` +
      list.slice(0, 12).map((t) => `| \`${t.name}\` | \`${t.value}\` |`).join("\n") +
      (list.length > 12 ? `\n\n_…and ${list.length - 12} more — see \`${posix(designSystem.dir)}/tokens/tokens.json\`._` : "")
    ).join("\n\n")
  : "TODO — no design-system manifest found; extract the tokens from the prototype CSS by hand.";

const routeMap = screens.size
  ? `### Route map (recreate the state machine as real routes)\n\n` +
    `The prototype multiplexes every screen through one state machine and has no routing. ` +
    `In the target each state becomes its own route.\n\n` +
    `| Prototype \`screen\` | Route | Purpose |\n|---|---|---|\n` +
    [...screens].sort().map((s) => `| \`${s}\` | \`/${s}\` | TODO |`).join("\n") + "\n\n"
  : "";

const assets = all.filter((f) => /\.(png|jpe?g|webp|gif|svg|mp4|woff2?)$/i.test(f));
const fileTree = walk(dir).map((f) => `- \`${f}\``).join("\n");

const verification = options.verification || a.verification
  ? `\n## Visual verification (required)\n\n` +
    `After implementing, verify every screen at three breakpoints and iterate until they match.\n\n` +
    `1. Run the dev server; note the port.\n` +
    `2. Screenshot each route at **1440x900**, **1024x768** and **402x874**.\n` +
    `3. Capture key states too — TODO list them (error, loading, empty, open overlays).\n` +
    `4. Compare against \`prototypes/\`. Check spacing, radius, shadow, focus ring, motion.\n` +
    `5. Fix and re-shoot. Confirm no console errors. Keep shots under \`screenshots/\`.\n`
  : "";

/* ── the skeleton ───────────────────────────────────────────────────────────── */

const readme = `# Handoff: ${project.name} — ${feature}

## Overview

TODO — one paragraph: what this feature is, who uses it, and what "done" looks like.

## About the Design Files

The files in \`prototypes/\` are **design references, not the shipping artifact**. They are
HTML/CSS/JS so they render anywhere; that is not a statement about the target stack. Rebuild them
pixel-accurately in whatever the target codebase already uses.

Everything you need — dimensions, colors, spacing, easing — is in the source. Read it directly.

## Fidelity

TODO — state the bar. Which parts are exact (spacing, color, type scale, motion) and which are
free (data, copy beyond the quoted strings, backend shape).

## Screens / Views

${routeMap}TODO — one \`### N. <Name> — \`/route\`\` block per screen. For each: exact copy strings,
every control with its size/color/state, and any algorithm spelled out rather than described.

## Interactions & Behavior

TODO — hover, focus, active, disabled, loading, empty, error. Include duration and easing.

## State Management

TODO — what is local, what is shared, what is server state, what persists.

## Design Tokens

${tokenTable}

## Assets

${assets.length ? assets.slice(0, 20).map((f) => `- \`${f}\``).join("\n") + (assets.length > 20 ? `\n- _…and ${assets.length - 20} more_` : "") : "TODO — none detected."}

## Files (in this bundle)

${fileTree}
${verification}
## Definition of done

- [ ] TODO — one checkbox per screen or contract, each independently verifiable.
`;

writeText(join(dir, "README.md"), readme);

/* ── gates ──────────────────────────────────────────────────────────────────── */

const g = new Gates(`02 spec ${slug}`);
g.check("handoff folder created", existsSync(dir), posix(dir));
g.check("prototypes copied", prototypes.length > 0, `${prototypes.length} file(s)`);
g.check("README skeleton written", existsSync(join(dir, "README.md")));
g.check("token table derived", !tokenTable.startsWith("TODO"), `${tokens.length} tokens`);
if (screens.size) g.check("route map pre-filled", true, `${screens.size} screen states found`);
console.log(`\nNEXT: author the prose over every TODO in ${posix(join(dir, "README.md"))},\n` +
  `then run:  node scripts/hod-validate.js --spec ${slug}`);
g.finish();
