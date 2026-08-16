#!/usr/bin/env node
// Phase 00 — detect. Reads the Open Design project on disk and records every fact
// the later phases need. Scripts never call MCP; the agent passes OD facts in as flags.
//
//   node scripts/hod-detect.js --project-name "IMAGE STUDIO UI APP" \
//        --project-dir <resolvedDir> [--entry "Landing.dc.html"] [--depth both] ...
//
// DONE-gate: entry mode recorded, design system resolved (or explicitly none),
//            token carrier named.
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  args, die, slugify, walk, readJson, writeState, Gates, posix, NEVER_SHIP,
} from "./_lib.js";

const a = args();
const projectName = a["project-name"];
const projectDir = a["project-dir"];
if (!projectName) die("--project-name is required (the OD project display name)");
if (!projectDir || !existsSync(projectDir)) die(`--project-dir missing or not found: ${projectDir}`);

const outDir = a.out ?? process.cwd();
const slug = slugify(projectName);

/* ── entry file (Claude Design's {{OPEN_FILE}}) ─────────────────────────── */
// OD's analogue is get_active_context(), which returns the active project AND file.
// Present -> Form 1. Absent -> Form 2, and we record the candidates we would have picked.

const designFiles = walk(projectDir, { exclude: NEVER_SHIP })
  .filter((f) => /\.(dc\.html|html)$/i.test(f) && !f.includes("/"));

const bySize = (f) => statSync(join(projectDir, f)).size;
const candidates = designFiles
  .map((f) => ({ file: f, size: bySize(f), dc: /\.dc\.html$/i.test(f) }))
  .sort((x, y) => (y.dc - x.dc) || (y.size - x.size))
  .slice(0, 10);

let entryFile = null;
if (typeof a.entry === "string" && a.entry) {
  if (existsSync(join(projectDir, a.entry))) entryFile = posix(a.entry);
  else console.error(`WARN: --entry "${a.entry}" not found under project-dir; falling back to Form 2`);
}
const entryMode = entryFile ? "form1" : "form2";

/* ── design system ──────────────────────────────────────────────────────── */
// Canonical dir is _ds/<ds-slug>-<uuid>/. Sibling _ds/<short>/ dirs are the aliases
// the HTML actually references; both must ship (I3).

const UUID = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dsRoot = join(projectDir, "_ds");
let designSystem = null;

// A design-system-kind project IS the design system: the manifest sits at the
// project root, with no _ds/ wrapper. An app project binds one under _ds/.
if (existsSync(join(projectDir, "_ds_manifest.json"))) {
  const manifest = readJson(join(projectDir, "_ds_manifest.json"));
  designSystem = {
    dir: ".",
    aliases: [],
    uuid: null,
    namespace: manifest?.namespace ?? null,
    shape: existsSync(join(projectDir, "components")) ? "expanded" : "collapsed",
    componentCount: manifest?.components?.length ?? 0,
    tokenCount: manifest?.tokens?.length ?? 0,
    fonts: [...new Set([...(manifest?.fonts ?? []), ...(manifest?.brandFonts ?? [])].flatMap(fontNames))],
    hasFontBinaries: existsSync(join(projectDir, "fonts")) &&
      readdirSync(join(projectDir, "fonts")).some((f) => /\.woff2?$/i.test(f)),
    manifestPath: "_ds_manifest.json",
    selfHosted: true,
  };
} else if (existsSync(dsRoot)) {
  const dirs = readdirSync(dsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const canonical = dirs.find((d) => UUID.test(d)) ?? dirs.find((d) => existsSync(join(dsRoot, d, "_ds_manifest.json")));

  if (canonical) {
    const dir = join(dsRoot, canonical);
    const manifest = readJson(join(dir, "_ds_manifest.json"));
    const hasComponentsDir = existsSync(join(dir, "components"));
    designSystem = {
      dir: posix(`_ds/${canonical}`),
      aliases: dirs.filter((d) => d !== canonical).map((d) => posix(`_ds/${d}`)),
      uuid: (canonical.match(UUID)?.[0] ?? "").replace(/^-/, "") || null,
      namespace: manifest?.namespace ?? null,
      // Project-local design systems ship expanded components/; published npm
      // libraries collapse into _ds_bundle.js.
      shape: hasComponentsDir ? "expanded" : "collapsed",
      componentCount: manifest?.components?.length ?? 0,
      tokenCount: manifest?.tokens?.length ?? 0,
      fonts: [...new Set([...(manifest?.fonts ?? []), ...(manifest?.brandFonts ?? [])].flatMap(fontNames))],
      hasFontBinaries: existsSync(join(dir, "fonts")) &&
        readdirSync(join(dir, "fonts")).some((f) => /\.woff2?$/i.test(f)),
      manifestPath: posix(`_ds/${canonical}/_ds_manifest.json`),
    };
  }
}

function fontNames(f) {
  if (!f) return [];
  if (typeof f === "string") return [f];
  return [f.family ?? f.name].filter(Boolean);
}

/* ── token carrier ──────────────────────────────────────────────────────── */
// The exporter copies whatever carrier the project already used — it does not
// normalize. Neither do we.

const carriers = [
  designSystem && join(projectDir, designSystem.dir, "tokens", "tokens.json"),
  join(projectDir, "tokens", "tokens.json"),
  join(projectDir, "tokens.json"),
  designSystem && join(projectDir, designSystem.dir, "styles.css"),
  join(projectDir, "styles", "tokens.css"),
  join(projectDir, "tokens.css"),
  designSystem && join(projectDir, designSystem.dir, "_ds_bundle.css"),
].filter(Boolean);

const tokenCarrierAbs = carriers.find((p) => existsSync(p));
const tokenCarrier = tokenCarrierAbs ? posix(tokenCarrierAbs.slice(projectDir.length + 1)) : "none";

/* ── state ──────────────────────────────────────────────────────────────── */

const bool = (v, dflt) => (v === undefined ? dflt : v === true || v === "true");

const state = {
  version: 1,
  createdAt: new Date().toISOString(),
  project: {
    name: projectName,
    slug,
    dir: posix(projectDir),
    fileCount: walk(projectDir, { exclude: NEVER_SHIP }).length,
  },
  entry: { mode: entryMode, file: entryFile, candidates },
  designSystem,
  tokenCarrier,
  options: {
    depth: a.depth ?? "both",
    feature: a.feature ?? null,
    transport: a.transport ?? "zip",
    includeChats: bool(a["include-chats"], false),
    rootPointers: bool(a["root-pointers"], true),
    verification: bool(a.verification, false),
  },
  out: posix(outDir),
};

writeState(state, outDir);

const g = new Gates("00 detect");
g.check("entry mode recorded", entryMode === "form1" || entryMode === "form2",
  entryMode === "form1" ? `form1 — ${entryFile}` : `form2 — ${candidates.length} candidate(s)`);
g.check("design system resolved or explicitly none", designSystem !== undefined,
  designSystem ? `${designSystem.dir} (${designSystem.shape}, ${designSystem.componentCount} components, ${designSystem.aliases.length} alias)` : "none");
g.check("token carrier named", !!tokenCarrier, tokenCarrier);
// Only a design system that DECLARES fonts owes us binaries; one that inherits the
// host's typography legitimately ships none.
if (designSystem?.fonts.length) {
  g.warn("declared fonts have binaries", designSystem.hasFontBinaries,
    designSystem.hasFontBinaries ? "woff2 found" : `declares ${designSystem.fonts.join(", ")} but ships no .woff2 — bundle would not be offline-complete`);
}
g.check("state written", existsSync(join(outDir, ".handoff", "state.json")), ".handoff/state.json");
g.finish();
