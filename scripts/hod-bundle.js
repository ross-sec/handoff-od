#!/usr/bin/env node
// Phase 01 — bundle. Builds `<slug>/` : the generated README plus a verbatim mirror
// of the project. Deterministic; no model tokens are spent here.
//
//   node scripts/hod-bundle.js [--out <dir>] [--force]
//
// DONE-gate: every README slot filled, project mirrored verbatim, design system and
//            its alias present, adherence config emitted when a DS is bound.
import { existsSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  args, die, readState, readJson, writeJson, writeText, copyTree, walk,
  childDir, isUnder, symlinkScan, describeUnsafe, Gates, posix, NEVER_SHIP, SYNC_BOOKKEEPING,
} from "./_lib.js";
import { buildAdherence, collectComponents } from "./_adherence.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const a = args();
const outRoot = a.out ?? process.cwd();
const state = readState(outRoot);
if (!state) die("no .handoff/state.json — run hod-detect.js first");

const { project, entry, designSystem, options } = state;
// `--force` below is a recursive delete: resolve the target through the guard so a
// slug that is empty, `.`, absolute, or climbs out of outRoot can never name it.
const bundleRoot = childDir(outRoot, project.slug, "project slug");

// I9 — re-checked here rather than trusted from phase 00: the project can change
// between phases, and `state.json` is on disk and hand-editable.
//
// This runs BEFORE the `--force` delete below, not after. Refusing once the old
// bundle is already gone would cost the user a good bundle and hand back nothing.
const links = symlinkScan(project.dir, { exclude: NEVER_SHIP });
if (links.unsafe.length) {
  die(`I9 — refusing to mirror ${links.unsafe.length} symlink(s):\n${describeUnsafe(links.unsafe)}\n` +
    `  Following these would copy files from outside the project into the bundle, or abort the\n` +
    `  mirror on a directory link. Remove them, or replace them with real copies inside the\n` +
    `  project, then re-run phase 01. Nothing has been written or deleted.`);
}

if (existsSync(bundleRoot)) {
  if (!a.force) die(`${project.slug}/ already exists — pass --force to rebuild`);
  rmSync(bundleRoot, { recursive: true, force: true });
}
mkdirSync(bundleRoot, { recursive: true });

/* ── 1. verbatim mirror (I1: never rename, never re-suffix, never reformat) ─ */

const mirrored = copyTree(project.dir, join(bundleRoot, "project"), { exclude: NEVER_SHIP });

/* ── 2. adherence config ───────────────────────────────────────────────────
 * Present in the source? Keep it byte-for-byte — the mirror is authoritative.
 * Absent but a design system is bound? Generate it (§3.6). */

let adherence = { action: "none", path: null, rules: 0 };
if (designSystem) {
  // Also from state.json, and it is both read from and written to — so it gets the
  // same treatment as the slug rather than being trusted because detect produced it.
  if (!isUnder(project.dir, designSystem.dir)) {
    die(`I9 — designSystem.dir "${designSystem.dir}" resolves outside the project`);
  }
  const dsIn = join(project.dir, designSystem.dir);
  const dsOut = join(bundleRoot, "project", designSystem.dir === "." ? "" : designSystem.dir);
  const target = join(dsOut, "_adherence.oxlintrc.json");
  const manifest = readJson(join(dsIn, "_ds_manifest.json"));

  if (existsSync(target)) {
    adherence = { action: "mirrored", path: posix(designSystem.dir), rules: 0 };
  } else if (manifest) {
    const components = collectComponents(manifest, dsIn);
    const config = buildAdherence(manifest, dsIn, { components });
    writeJson(target, config);
    adherence = {
      action: "generated",
      path: posix(designSystem.dir),
      rules: config.rules["no-restricted-syntax"].length - 1,
      components: components.length,
    };
  }
}

/* ── 3. README ─────────────────────────────────────────────────────────────── */

const FORM1 = (slug, file) =>
  `**Read \`${slug}/project/${file}\` from top to bottom.** That file was open when the handoff was ` +
  `triggered, so it is almost certainly the design you are being asked to build. Read all of it — ` +
  `skimming will cost you. Then **walk its imports**: open every file it references (shared ` +
  `components, stylesheets, scripts) until you understand how the pieces fit together, and only ` +
  `then start implementing.`;

const FORM2 = (slug) =>
  `**Find the primary design file under \`${slug}/project/\` and read it from top to bottom.** ` +
  `Then **walk its imports**: open every file it references (shared components, stylesheets, ` +
  `scripts) until you understand how the pieces fit together, and only then start implementing.`;

const CHATS = (slug) =>
  `**Read \`${slug}/chats/\` first.** The intent lives in the conversation; the files are only what ` +
  `that intent produced.\n\n`;

const dsBlock = () => {
  if (!designSystem) return "";
  const dir = designSystem.dir === "." ? `${project.slug}/project/` : `${project.slug}/project/${designSystem.dir}/`;
  const lint = adherence.action === "none" ? "" :
    `\n\`_adherence.oxlintrc.json\` is an oxlint config that enforces design-system adherence in **your** ` +
    `codebase. It flags raw hex, raw \`px\`, fonts the system does not provide, imports that reach into ` +
    `component internals, and props a component does not declare. Wire it in and fidelity stops being a ` +
    `matter of opinion.\n`;
  return `\n## Design system\n\n\`${dir}\` carries the complete design system — tokens, component sources` +
    `${designSystem.hasFontBinaries ? ", and real font binaries" : ""}. ` +
    `The bundle is offline-complete: nothing here needs the network to render.\n${lint}`;
};

const contents = [
  `- \`${project.slug}/README.md\` — this file`,
  options.rootPointers && `- \`${project.slug}/AGENTS.md\` — harness-neutral entry point, points here`,
  options.rootPointers && `- \`${project.slug}/CLAUDE.md\` — pointer, for agents that read it`,
  options.includeChats && `- \`${project.slug}/chats/\` — the conversation that produced the design`,
  `- \`${project.slug}/project/\` — the \`${project.name}\` project files (HTML prototypes, assets, components)`,
].filter(Boolean).join("\n");

const template = readFileSync(join(HERE, "..", "references", "readme-template.md"), "utf8");
const readme = template
  .replace("{{ENTRY_DIRECTIVE}}",
    (options.includeChats ? CHATS(project.slug) : "") +
    (entry.mode === "form1" ? FORM1(project.slug, entry.file) : FORM2(project.slug)))
  .replace("{{DESIGN_SYSTEM}}", dsBlock())
  .replace("{{CONTENTS}}", contents);

writeText(join(bundleRoot, "README.md"), readme);

/* ── 4. root pointers (our only divergence from strict root purity) ───────── */

if (options.rootPointers) {
  writeText(join(bundleRoot, "AGENTS.md"),
    `# Agent instructions\n\nRead [\`README.md\`](./README.md) in this directory and follow it exactly. ` +
    `It is the single source of truth for this handoff.\n\nThe design files live in \`project/\`.\n\n` +
    `This bundle came out of Open Design. Once the implementation runs, the codebase can be synced ` +
    `back with \`@ross-sec/sync-od\`, closing the round trip.\n`);
  writeText(join(bundleRoot, "CLAUDE.md"),
    `See [\`AGENTS.md\`](./AGENTS.md).\n`);
}

/* ── 5. state ──────────────────────────────────────────────────────────────── */

const bundleFiles = walk(bundleRoot);
writeJson(join(outRoot, ".handoff", "bundle.json"), {
  builtAt: new Date().toISOString(),
  root: project.slug,
  mirrored: mirrored.length,
  total: bundleFiles.length,
  adherence,
  readmeForm: entry.mode,
});

/* ── gates ─────────────────────────────────────────────────────────────────── */

const g = new Gates("01 bundle");
g.check("no unfilled README slots", !/\{\{[A-Z_]+\}\}/.test(readme),
  (readme.match(/\{\{[A-Z_]+\}\}/g) ?? []).join(" "));
g.check("project mirrored verbatim", mirrored.length === project.fileCount,
  `${mirrored.length}/${project.fileCount} files`);
g.check("no re-suffixed sources", !bundleFiles.some((f) => /\.(jsx|d\.ts)\.txt$/i.test(f)), "I1");
g.check("no sync bookkeeping", !bundleFiles.some((f) => SYNC_BOOKKEEPING.test(f)), "I4 — _ds_sync.json / _ods_sync.json / _ods_needs_recompile");
g.check("no symlink escapes the project — I9", true,
  links.followed.length
    ? `${links.followed.length} internal link(s) materialized as their target's content`
    : "no symlinks");

if (designSystem) {
  const dsPrefix = designSystem.dir === "." ? "project/" : `project/${designSystem.dir}/`;
  g.check("design system materialized", bundleFiles.some((f) => f.startsWith(dsPrefix)), dsPrefix);
  if (designSystem.aliases.length) {
    g.check("design-system alias present",
      designSystem.aliases.every((al) => bundleFiles.some((f) => f.startsWith(`project/${al}/`))),
      `I3 — ${designSystem.aliases.join(", ")}`);
  }
  g.check("adherence config present", adherence.action !== "none",
    `${adherence.action}${adherence.rules ? ` (${adherence.rules} rules, ${adherence.components} components)` : ""}`);
}

const rootEntries = new Set(bundleFiles.map((f) => f.split("/")[0]));
const permitted = new Set(["README.md", "project", ...(options.rootPointers ? ["AGENTS.md", "CLAUDE.md"] : []), ...(options.includeChats ? ["chats"] : [])]);
g.check("root purity", [...rootEntries].every((e) => permitted.has(e)),
  [...rootEntries].filter((e) => !permitted.has(e)).join(", ") || [...rootEntries].sort().join(" + "));

g.finish();
