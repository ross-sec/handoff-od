// scripts/_lib.js — shared helpers for the handoff-od pipeline.
// Zero dependencies. Node >= 20. Never calls MCP; the agent passes OD facts in.
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync,
  existsSync, statSync, rmSync, openSync, readSync, closeSync,
} from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

export const STATE_DIR = ".handoff";
export const STATE_PATH = join(STATE_DIR, "state.json");

/* ── paths & io ─────────────────────────────────────────────────────────── */

/** Lower-kebab slug. `Ross CSS - shadcn Set` -> `ross-css-shadcn-set`. */
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const posix = (p) => String(p).split(sep).join("/");

export function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}

export function writeJson(p, obj) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

export function writeText(p, s) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s, "utf8");
}

export const readState = (cwd = process.cwd()) => readJson(join(cwd, STATE_PATH));

export function writeState(state, cwd = process.cwd()) {
  writeJson(join(cwd, STATE_PATH), state);
  return state;
}

/* ── tree walking & mirroring ───────────────────────────────────────────── */

/**
 * Recursive relative file list, sorted. `exclude` entries are tested against
 * both the posix relative path and the bare basename.
 */
export function walk(dir, { exclude = [] } = {}) {
  const out = [];
  (function rec(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = join(d, e.name);
      const rel = posix(relative(dir, abs));
      if (exclude.some((rx) => rx.test(rel) || rx.test(e.name))) continue;
      if (e.isDirectory()) rec(abs);
      else out.push(rel);
    }
  })(dir);
  return out.sort();
}

/**
 * Verbatim mirror. I1: never rename, never re-suffix, never reformat.
 * Returns the list of relative paths copied.
 */
export function copyTree(srcDir, destDir, { exclude = [] } = {}) {
  const files = walk(srcDir, { exclude });
  for (const rel of files) {
    const to = join(destDir, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(srcDir, rel), to);
  }
  return files;
}

export const fileCount = (dir) => walk(dir).length;

/* ── archiving (shelled out — no archive dependency) ────────────────────── */

function hasCmd(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch { return false; }
}

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });

const ZIP_MAGIC = 0x04034b50;
const WIN_BSDTAR = "C:\\Windows\\System32\\tar.exe";

/**
 * A tar that accepts Windows absolute paths. GNU tar reads the `C:` in
 * `C:\…\out.tar.gz` as a remote host spec and refuses; bsdtar does not.
 */
function resolveTar() {
  if (process.platform === "win32" && existsSync(WIN_BSDTAR)) return { exe: WIN_BSDTAR, extra: [] };
  if (process.platform === "win32") return { exe: "tar", extra: ["--force-local"] };
  return { exe: "tar", extra: [] };
}

/** True when the file really is a zip. GNU tar happily writes a TAR named .zip. */
function isRealZip(file) {
  try {
    const fd = openSync(file, "r");
    const head = Buffer.alloc(4);
    readSync(fd, head, 0, 4, 0);
    closeSync(fd);
    return head.readUInt32LE(0) === ZIP_MAGIC;
  } catch { return false; }
}

/**
 * Zip writers in preference order. GNU tar is deliberately absent: its `-a`
 * accepts a `.zip` target and silently emits a tar, which is worse than failing.
 * Every candidate is verified by magic bytes before it is accepted.
 */
function zipStrategies() {
  const bsd = process.platform === "win32" ? ["C:\\Windows\\System32\\tar.exe"] : [];
  return [
    ...bsd.map((exe) => (parent, root, out) => run(exe, ["-a", "-c", "-f", out, "-C", parent, root], parent)),
    ...(hasCmd("bsdtar") ? [(parent, root, out) => run("bsdtar", ["-a", "-c", "-f", out, "-C", parent, root], parent)] : []),
    ...(hasCmd("zip") ? [(parent, root, out) => run("zip", ["-r", "-q", out, root], parent)] : []),
    ...(process.platform === "darwin" ? [(parent, root, out) => run("tar", ["-a", "-c", "-f", out, "-C", parent, root], parent)] : []),
    ...(process.platform === "win32"
      ? [(parent, root, out) => run("powershell", ["-NoProfile", "-NonInteractive", "-Command",
          `Compress-Archive -Path '${root}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`], parent)]
      : []),
  ];
}

/**
 * Archive `rootName` (a directory inside `parentDir`) to `outFile`.
 * `.tar.gz` uses `tar -czf` (GNU tar is fine here); `.zip` is written by the first
 * strategy that produces a file with a real zip signature.
 */
export function archive(parentDir, rootName, outFile) {
  if (!outFile.toLowerCase().endsWith(".zip")) {
    const { exe, extra } = resolveTar();
    run(exe, [...extra, "-czf", outFile, "-C", parentDir, rootName], parentDir);
    return outFile;
  }
  const errors = [];
  for (const write of zipStrategies()) {
    try {
      rmSync(outFile, { force: true });
      write(parentDir, rootName, outFile);
      if (isRealZip(outFile)) return outFile;
      errors.push("produced a non-zip file (tool cannot write zip)");
    } catch (err) {
      errors.push(String(err.message ?? err).split("\n")[0]);
    }
  }
  rmSync(outFile, { force: true });
  throw new Error(`no working zip writer. Tried ${errors.length}: ${errors.join(" | ")}`);
}

/**
 * Entry count of an existing archive. Zip is read from its End-of-Central-Directory
 * record rather than shelled out, so it does not depend on which tar is on PATH.
 */
export function archiveEntryCount(outFile) {
  if (!outFile.toLowerCase().endsWith(".zip")) {
    const { exe, extra } = resolveTar();
    const out = run(exe, [...extra, "-tzf", outFile], dirname(outFile)).toString();
    return out.split(/\r?\n/).filter((l) => l.trim() && !l.trim().endsWith("/")).length;
  }
  const buf = readFileSync(outFile);
  const floor = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return buf.readUInt16LE(i + 10);
  }
  return -1;
}

/* ── gates & reporting ──────────────────────────────────────────────────── */

export class Gates {
  /** `strict` promotes advisories to hard failures. */
  constructor(phase, { strict = false } = {}) { this.phase = phase; this.strict = strict; this.rows = []; }

  check(name, ok, detail = "") { this.rows.push({ name, ok: !!ok, detail, level: "gate" }); return ok; }

  /**
   * Advisory. Used where the source project — not our pipeline — decides the
   * outcome: a verbatim mirror cannot invent font binaries the project never had,
   * so a design system that @imports a remote font yields a bundle that needs the
   * network. Worth reporting, not worth refusing to ship. `--strict` escalates.
   */
  warn(name, ok, detail = "") { this.rows.push({ name, ok: !!ok, detail, level: "advisory" }); return ok; }

  get failures() { return this.rows.filter((r) => !r.ok && (r.level === "gate" || this.strict)); }
  get passed() { return this.failures.length === 0; }

  report() {
    const tag = (r) => (r.ok ? "PASS" : r.level === "advisory" && !this.strict ? "WARN" : "FAIL");
    const lines = this.rows.map((r) => `  ${tag(r)}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    return `[${this.phase}] ${this.passed ? "DONE" : "BLOCKED"}\n${lines.join("\n")}`;
  }

  /** Print the report and exit non-zero when a hard gate failed. */
  finish() {
    console.log(this.report());
    if (!this.passed) process.exit(1);
  }
}

/** Minimal `--flag value` / `--flag` parser. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

/* ── shared constants ───────────────────────────────────────────────────── */

/**
 * I4: inbound-sync bookkeeping never ships.
 *
 * Two dialects, both real: `_ds_sync.json` is the proprietary tool's anchor,
 * `_ods_sync.json` + `_ods_needs_recompile` are sync-od's. A project that arrived
 * here THROUGH sync-od carries the latter, and an outbound bundle must not
 * re-export them — a stale anchor travelling with the code can later vouch for
 * state it never saw.
 */
export const SYNC_BOOKKEEPING = /(^|\/)(_ds_sync\.json|_ods_sync\.json|_ods_needs_recompile)$/;

export const NEVER_SHIP = [
  SYNC_BOOKKEEPING,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.handoff(\/|$)/,
];

/** Anything fetched over the network breaks I2 (offline-complete). */
export const REMOTE_URL = /\b(?:https?:)?\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i;

export const TEXTUAL = /\.(html?|css|js|jsx|mjs|cjs|ts|tsx|json|md|svg)$/i;
