#!/usr/bin/env node
// Emit the handoff PROMPT — the primary transport. The live product defaults to a
// copyable prompt that points the agent at the design MCP and pulls files live;
// the archive is the fallback behind an overflow menu. We mirror that, retargeted
// to Open Design's own MCP.
//
//   node scripts/hod-prompt.js [--out <dir>] [--transport mcp|zip] [--instructions "…"]
//                              [--focus "a.html,b.css"] [--agent claude|opencode|…]
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { args, die, readState, readJson, writeText, posix } from "./_lib.js";

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
        if (existsSync(join(project.dir, resolved))) found.add(resolved);
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

let prompt;
if (transport === "mcp") {
  prompt =
    `Use the Open Design MCP (stdio: \`od mcp\`; install with \`od mcp install ${agent}\`) to read this project:\n` +
    `${project.name}\n\n` +
    (focus.length ? `Focus on these files (the whole project is readable):\n${bullets(focus)}\n\n` : "") +
    (imports.length ? `Also read these files the selection imports:\n${bullets(imports)}\n\n` : "") +
    `Implement: ${target}\n` + ROUND_TRIP;
} else {
  const archiveMeta = readJson(join(outRoot, ".handoff", "archive.json"));
  const zip = archiveMeta?.written?.find((w) => w.format === "zip")?.path ?? `${project.name}-handoff.zip`;
  prompt =
    `Unzip \`${zip}\` into your repo, then read \`${project.slug}/README.md\` in full and follow it.\n\n` +
    (focus.length ? `Focus on these files (the whole project is in the bundle):\n${bullets(focus)}\n\n` : "") +
    (imports.length ? `Also read these files the selection imports:\n${bullets(imports)}\n\n` : "") +
    `Implement: ${target}\n` + ROUND_TRIP;
}

writeText(join(outRoot, ".handoff", "prompt.txt"), prompt);
console.log(prompt);
console.error(`[prompt] transport=${transport} focus=${focus.length} imports=${imports.length} -> .handoff/prompt.txt`);
