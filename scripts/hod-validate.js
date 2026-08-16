#!/usr/bin/env node
// Phase 03 — validate. The gate between a built bundle and an archive. Nothing
// ships until this exits 0.
//
//   node scripts/hod-validate.js [--out <dir>] [--spec <feature-slug>] [--self]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  args, die, readState, readJson, writeJson, walk, Gates, TEXTUAL,
} from "./_lib.js";
import { verifyAdherence } from "./_adherence.js";

const a = args();
const outRoot = a.out ?? process.cwd();

/* `--self` is the packaging smoke test: the plugin's own files are coherent. */
if (a.self) {
  const here = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const g = new Gates("self-check");
  const manifest = readJson(join(here, "open-design.json"));
  const pkg = readJson(join(here, "package.json"));
  g.check("open-design.json parses", !!manifest);
  g.check("specVersion is 1.0.0", manifest?.specVersion === "1.0.0", manifest?.specVersion);
  g.check("name matches ^[a-z0-9][a-z0-9._-]*$", /^[a-z0-9][a-z0-9._-]*$/.test(manifest?.name ?? ""), manifest?.name);
  g.check("manifest and package versions agree", manifest?.version === pkg?.version,
    `${manifest?.version} vs ${pkg?.version}`);
  const skill = existsSync(join(here, "SKILL.md")) ? readFileSync(join(here, "SKILL.md"), "utf8") : "";
  g.check("SKILL.md has frontmatter name+description", /^---[\s\S]*?\bname:\s*\S/.test(skill) && /\bdescription:\s*\S/.test(skill));
  g.check("SKILL.md name matches manifest", new RegExp(`^name:\\s*${manifest?.name}\\s*$`, "m").test(skill));
  // The atom catalog is CLOSED — a typo here fails at install, not at author time.
  const ATOMS = new Set(["build-test", "code-import", "critique-theater", "design-extract", "diff-review",
    "direction-picker", "discovery-question-form", "figma-extract", "handoff", "patch-edit",
    "rewrite-plan", "todo-write", "token-map"]);
  const used = [
    ...(manifest?.od?.context?.atoms ?? []),
    ...(manifest?.od?.pipeline?.stages ?? []).flatMap((s) => s.atoms ?? []),
  ];
  g.check("every atom is in the closed catalog", used.every((x) => ATOMS.has(x)),
    used.filter((x) => !ATOMS.has(x)).join(", ") || `${used.length} refs ok`);
  const KINDS = new Set(["form", "choice", "confirmation", "oauth-prompt"]);
  g.check("genui kinds are in the closed vocabulary",
    (manifest?.od?.genui?.surfaces ?? []).every((s) => KINDS.has(s.kind)));
  g.check("no @open-design/* dependency", !JSON.stringify(pkg?.dependencies ?? {}).includes("@open-design"),
    "none publish to npm");
  g.finish();
  process.exit(0);
}

const state = readState(outRoot);
if (!state) die("no .handoff/state.json — run hod-detect.js first");
const { project, designSystem, options } = state;

/* ── spec mode (Mechanism B) ───────────────────────────────────────────────── */

if (a.spec) {
  const slug = a.spec === true ? (options.feature ?? "") : a.spec;
  const dir = join(project.dir, `design_handoff_${slug}`);
  if (!existsSync(dir)) die(`no design_handoff_${slug}/ — run hod-spec.js first`);
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const heads = [...readme.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());

  const REQUIRED = ["about the design files", "fidelity", "assets", "files"];
  const g = new Gates(`03 validate --spec ${slug}`);

  g.check("title is a handoff title", /^#\s+Handoff:\s+\S/.test(readme), readme.split("\n")[0]);
  for (const need of REQUIRED) {
    g.check(`section "${need}"`, heads.some((h) => h.startsWith(need)));
  }
  // Order matters: fidelity always precedes the scope body, files always last.
  const idx = (needle) => heads.findIndex((h) => h.startsWith(needle));
  g.check("fidelity precedes assets", idx("fidelity") < idx("assets"), `${idx("fidelity")} < ${idx("assets")}`);
  g.check("files is the last required section", idx("files") === Math.max(...REQUIRED.map(idx)));
  g.check("no TODO markers left", !/\bTODO\b/.test(readme),
    (readme.match(/^.*\bTODO\b.*$/gm) ?? []).slice(0, 3).join(" | "));
  g.check("prototypes/ has design references", existsSync(join(dir, "prototypes")) &&
    walk(join(dir, "prototypes")).length > 0);
  g.check("states that HTML is a reference, not the artifact",
    /\b(reference|prototype)s?\b/i.test(readme.slice(0, 4000)));
  g.finish();
  process.exit(0);
}

/* ── bundle mode (Mechanism A) ─────────────────────────────────────────────── */

const bundleRoot = join(outRoot, project.slug);
if (!existsSync(bundleRoot)) die(`no ${project.slug}/ — run hod-bundle.js first`);
const files = walk(bundleRoot);

// I2 — offline-complete. Only RESOURCE references count: a remote <a href> is
// fine, a remote <script src> or @font-face is not.
const REMOTE_RESOURCE = [
  /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i,
  /<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i,
  /<iframe\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i,
  /@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\//i,
  /\burl\(\s*["']?(?:https?:)?\/\//i,
];
const remoteHits = [];
for (const rel of files) {
  if (!TEXTUAL.test(rel)) continue;
  let src = "";
  try { src = readFileSync(join(bundleRoot, rel), "utf8"); } catch { continue; }
  for (const rx of REMOTE_RESOURCE) {
    const m = rx.exec(src);
    if (m) { remoteHits.push(`${rel}: ${m[0].slice(0, 70)}`); break; }
  }
}

const readme = readFileSync(join(bundleRoot, "README.md"), "utf8");
const rootEntries = [...new Set(files.map((f) => f.split("/")[0]))];
const permitted = new Set(["README.md", "project",
  ...(options.rootPointers ? ["AGENTS.md", "CLAUDE.md"] : []),
  ...(options.includeChats ? ["chats"] : [])]);

const g = new Gates("03 validate", { strict: !!a.strict });
// Advisory, not a gate: the mirror is verbatim (I1), so a project whose design
// system @imports a remote font produces a bundle that needs the network. That is
// the source's property, not our defect. `--strict` refuses to ship it anyway.
g.warn("offline-complete", remoteHits.length === 0, remoteHits.slice(0, 3).join(" | ") || "no remote resources");
g.check("no _ds_sync.json", !files.some((f) => /(^|\/)_ds_sync\.json$/.test(f)), "I4");
g.check("no re-suffixed sources", !files.some((f) => /\.(jsx|d\.ts)\.txt$/i.test(f)), "I1");
g.check("no unfilled README slots", !/\{\{[A-Z_]+\}\}/.test(readme));
g.check("README is the instruction carrier", /^#\s+CODING AGENTS/m.test(readme));
g.check("root purity", rootEntries.every((e) => permitted.has(e)),
  rootEntries.filter((e) => !permitted.has(e)).join(", ") || rootEntries.sort().join(" + "));
g.check("no screenshots at root", !files.some((f) => !f.includes("/") && /\.(png|jpe?g|webp|gif)$/i.test(f)));

if (designSystem) {
  const dsDir = join(bundleRoot, "project", designSystem.dir === "." ? "" : designSystem.dir);
  const config = readJson(join(dsDir, "_adherence.oxlintrc.json"));
  const manifest = readJson(join(dsDir, "_ds_manifest.json"));
  g.check("adherence config parses", !!config);
  if (config && manifest) {
    const problems = verifyAdherence(config, manifest);
    g.check("adherence agrees with the DS manifest", problems.length === 0, problems.slice(0, 3).join(" | "));
  }
  if (designSystem.fonts.length) {
    g.warn("font binaries shipped", files.some((f) => /\.woff2?$/i.test(f)), designSystem.fonts.join(", "));
  }
}

// I8: the archive phase refuses to run without this verdict.
writeJson(join(outRoot, ".handoff", "validate.json"), {
  at: new Date().toISOString(), root: project.slug, ok: g.passed, gates: g.rows,
});

g.finish();
