import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { slugify, walk, copyTree, archive, archiveEntryCount, Gates, args, NEVER_SHIP } from "../scripts/_lib.js";

test("slugify matches every known project name", () => {
  const cases = [
    ["DESIGN SYSTEM KIT", "design-system-kit"],
    ["Studio CSS - Base Set", "studio-css-base-set"],
    ["Nova Reader App", "nova-reader-app"],
    ["AI Apple", "ai-apple"],
    ["Café  Déjà--Vu!", "cafe-deja-vu"],
    ["  leading and trailing  ", "leading-and-trailing"],
  ];
  for (const [input, want] of cases) assert.equal(slugify(input), want, input);
});

function tree() {
  const dir = mkdtempSync(join(tmpdir(), "hod-lib-"));
  mkdirSync(join(dir, "sub", "deep"), { recursive: true });
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, "a.html"), "<h1>a</h1>");
  writeFileSync(join(dir, "sub", "b.css"), "body{}");
  writeFileSync(join(dir, "sub", "deep", "c.js"), "//c");
  writeFileSync(join(dir, "_ds_sync.json"), "{}");
  writeFileSync(join(dir, "node_modules", "junk.js"), "//junk");
  return dir;
}

test("walk is recursive, sorted, posix-separated and honours excludes", () => {
  const dir = tree();
  assert.deepEqual(walk(dir, { exclude: NEVER_SHIP }),
    ["a.html", "sub/b.css", "sub/deep/c.js"]);
  assert.ok(walk(dir).includes("_ds_sync.json"), "no exclude list means nothing is excluded");
});

test("copyTree mirrors byte-for-byte and skips excluded paths", () => {
  const src = tree();
  const dest = join(mkdtempSync(join(tmpdir(), "hod-dst-")), "out");
  const copied = copyTree(src, dest, { exclude: NEVER_SHIP });
  assert.equal(copied.length, 3);
  assert.equal(readFileSync(join(dest, "sub", "deep", "c.js"), "utf8"), "//c");
  assert.ok(!existsSync(join(dest, "_ds_sync.json")), "I4 — sync bookkeeping must not ship");
  assert.ok(!existsSync(join(dest, "node_modules")));
});

/* ── the silent-corruption regression ──────────────────────────────────────
 * GNU tar accepts `-a -c -f out.zip` and writes a TAR. Without a magic-byte
 * check the pipeline ships an archive nothing can open. */

test("archive writes a real zip, verified by magic bytes", () => {
  const parent = mkdtempSync(join(tmpdir(), "hod-zip-"));
  mkdirSync(join(parent, "bundle", "project"), { recursive: true });
  writeFileSync(join(parent, "bundle", "README.md"), "# hi");
  writeFileSync(join(parent, "bundle", "project", "a.html"), "<h1>a</h1>");

  const out = join(parent, "Some Name-handoff.zip");
  archive(parent, "bundle", out);

  const magic = readFileSync(out).readUInt32LE(0);
  assert.equal(magic, 0x04034b50, "not a zip — a tar-named-.zip would pass a naive check");
  assert.ok(archiveEntryCount(out) >= 2);
});

test("archive writes a gzip for tar.gz, even from a path with spaces and a drive letter", () => {
  const parent = mkdtempSync(join(tmpdir(), "hod tgz "));
  mkdirSync(join(parent, "bundle"), { recursive: true });
  writeFileSync(join(parent, "bundle", "README.md"), "# hi");

  const out = join(parent, "Some Name-handoff.tar.gz");
  archive(parent, "bundle", out);

  const head = readFileSync(out);
  assert.equal(head[0], 0x1f);
  assert.equal(head[1], 0x8b);
  assert.ok(archiveEntryCount(out) >= 1);
});

/* ── gates ─────────────────────────────────────────────────────────────────── */

test("advisories do not block, but --strict promotes them", () => {
  const soft = new Gates("t");
  soft.check("hard", true);
  soft.warn("soft", false, "source's fault");
  assert.equal(soft.passed, true);
  assert.match(soft.report(), /WARN {2}soft/);

  const strict = new Gates("t", { strict: true });
  strict.warn("soft", false);
  assert.equal(strict.passed, false);
  assert.match(strict.report(), /FAIL {2}soft/);
});

test("a failed hard gate always blocks", () => {
  const g = new Gates("t");
  g.check("hard", false, "broken");
  assert.equal(g.passed, false);
  assert.match(g.report(), /BLOCKED/);
});

test("args parses flags, values and bare positionals", () => {
  assert.deepEqual(args(["--a", "1", "--flag", "--b", "two words", "pos"]),
    { _: ["pos"], a: "1", flag: true, b: "two words" });
});
