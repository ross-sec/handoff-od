#!/usr/bin/env node
// Emit the handoff PROMPT — the primary transport. The live product defaults to a
// copyable prompt that points the agent at the design MCP and pulls files live;
// the archive is the fallback behind an overflow menu. We mirror that, retargeted
// to Open Design's own MCP.
//
//   node scripts/hod-prompt.js [--out <dir>] [--transport mcp|zip] [--instructions "…"]
//                              [--focus "a.html,b.css"] [--agent claude|opencode|…]
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, normalize, basename } from "node:path";
import { args, die, readState, readJson, writeText, isUnder, posix } from "./_lib.js";

const a = args();
const outRoot = a.out ?? process.cwd();
const state = readState(outRoot);
if (!state) die("no .handoff/state.json — run hod-detect.js first");

const { project, entry, options } = state;
const transport = a.transport ?? options.transport ?? "zip";
const instructions = typeof a.instructions === "string" ? a.instructions.trim() : "";
// OpenCode is the default receiving end — this plugin is the return leg of
// @ross-sec/sync-od. Any `od mcp install` target works: claude, codex, cursor, pi…
const agent = a.agent ?? "opencode";

/* ── focus set ──────────────────────────────────────────────────────────────
 * Selection shapes the PROMPT only. The archive is always the whole project —
 * that asymmetry is deliberate and matches the original. */

const focus = typeof a.focus === "string"
  ? a.focus.split(",").map((s) => s.trim()).filter(Boolean)
  : (entry.file ? [entry.file] : []);

// I9 — the prompt names files for the agent to open. A focus path that leaves the
// project would point it at something the bundle does not contain.
const strayFocus = focus.filter((f) => !isUnder(project.dir, f));
if (strayFocus.length) {
  die(`I9 — --focus must stay inside the project:\n${strayFocus.map((f) => `  ${f}`).join("\n")}\n` +
    `  Paths are relative to ${project.dir}.`);
}

/* ── import discovery ───────────────────────────────────────────────────────
 * Scan the focused HTML for the resources it pulls in, so the receiving agent is
 * told to read them too. Remote URLs are skipped — they are not ours to read. */

const REFS = [
  /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  /<x-import\b[^>]*\bfrom\s*=\s*["']([^"']+)["']/gi,
  /@import\s+(?:url\(\s*)?["']([^"')]+)["']/gi,
];

function discoverImports(files) {
  const found = new Set();
  for (const rel of files) {
    if (!/\.(html?|css)$/i.test(rel)) continue;
    const abs = join(project.dir, rel);
    if (!existsSync(abs)) continue;
    let src = "";
    try { src = readFileSync(abs, "utf8"); } catch { continue; }
    for (const rx of REFS) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(src))) {
        const raw = m[1].trim();
        if (!raw || /^(?:https?:)?\/\//i.test(raw) || /^(data|mailto|tel|#)/i.test(raw)) continue;
        const resolved = posix(normalize(join(dirname(rel), raw.split(/[?#]/)[0])));
        if (resolved.startsWith("..") || files.includes(resolved)) continue;
        // The lexical check above misses a reference that leaves the project
        // through a symlink — I9 applies to what the agent is TOLD to read, too.
        if (existsSync(join(project.dir, resolved)) && isUnder(project.dir, resolved)) found.add(resolved);
      }
    }
  }
  return [...found].sort();
}

const imports = focus.length ? discoverImports(focus) : [];
const bullets = (xs) => xs.map((f) => `- \`${f}\``).join("\n");
const target = instructions || (focus.length === 1 ? `\`${focus[0]}\`` : "the selected files");

/* ── prompt forms ───────────────────────────────────────────────────────────── */

const ROUND_TRIP =
  `\nWhen the implementation is running, changes can be synced back to Open Design with ` +
  `\`@ross-sec/sync-od\` — the return leg of this handoff.\n`;

if (!["mcp", "zip", "both"].includes(transport)) {
  die(`unknown --transport "${transport}" — expected mcp, zip or both`);
}

const mcpPrompt = () =>
  `Use the Open Design MCP (stdio: \`od mcp\`; install with \`od mcp install ${agent}\`) to read this project:\n` +
  `${project.name}\n\n` +
  (focus.length ? `Focus on these files (the whole project is readable):\n${bullets(focus)}\n\n` : "") +
  (imports.length ? `Also read these files the selection imports:\n${bullets(imports)}\n\n` : "") +
  `Implement: ${target}\n` + ROUND_TRIP;

const zipPrompt = () => {
  // Bare filename, not the absolute path it happens to sit at here — the prompt is
  // pasted into an agent that may be on another machine entirely.
  const archiveMeta = readJson(join(outRoot, ".handoff", "archive.json"));
  const zip = basename(archiveMeta?.written?.find((w) => w.format === "zip")?.path ?? `${project.name}-handoff.zip`);
  return `Unzip \`${zip}\` into your repo, then read \`${project.slug}/README.md\` in full and follow it.\n\n` +
    (focus.length ? `Focus on these files (the whole project is in the bundle):\n${bullets(focus)}\n\n` : "") +
    (imports.length ? `Also read these files the selection imports:\n${bullets(imports)}\n\n` : "") +
    `Implement: ${target}\n` + ROUND_TRIP;
};

// `both` is a declared transport, and it used to fall through to the zip branch —
// emitting one prompt while the manifest advertised a choice of two. It now emits
// both, labelled, so the user can pick the one their agent can actually use.
const prompt =
  transport === "mcp" ? mcpPrompt() :
  transport === "zip" ? zipPrompt() :
  `## Option A — read it live over MCP (nothing to unpack, never stale)\n\n${mcpPrompt()}\n` +
  `\n## Option B — from the archive (for an agent elsewhere or offline)\n\n${zipPrompt()}`;

writeText(join(outRoot, ".handoff", "prompt.txt"), prompt);
console.log(prompt);
console.error(`[prompt] transport=${transport} focus=${focus.length} imports=${imports.length} -> .handoff/prompt.txt`);
