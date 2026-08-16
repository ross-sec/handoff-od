import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const DS = "fixture-ds-11111111-2222-3333-4444-555555555555";

function run(script, argv, cwd) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(SCRIPTS, script), ...argv], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A project with a bound design system, an alias dir, real fonts and sync bookkeeping. */
function project() {
  const root = mkdtempSync(join(tmpdir(), "hod-proj-"));
  const proj = join(root, "src");
  const ds = join(proj, "_ds", DS);
  mkdirSync(join(ds, "fonts"), { recursive: true });
  mkdirSync(join(ds, "components", "Actions", "Button"), { recursive: true });
  mkdirSync(join(proj, "_ds", "fx"), { recursive: true });

  writeFileSync(join(proj, "Landing.dc.html"),
    `<link rel="stylesheet" href="_ds/fx/_ds_bundle.css">\n<script src="./support.js"></script>\n<h1>Landing</h1>`);
  writeFileSync(join(proj, "support.js"), "// runtime");
  // Both sync dialects: the proprietary anchor and sync-od's, which a project that
  // arrived here THROUGH sync-od actually carries.
  writeFileSync(join(proj, "_ds_sync.json"), `{"bundleSha12":"deadbeef"}`);
  writeFileSync(join(proj, "_ods_sync.json"), `{"bundleSha12":"cafebabe"}`);
  writeFileSync(join(proj, "_ods_needs_recompile"), "");

  writeFileSync(join(ds, "styles.css"), `@import "./fonts/fonts.css";\n@import "./_ds_bundle.css";`);
  writeFileSync(join(ds, "_ds_bundle.css"), ":root{--bg:#000}");
  writeFileSync(join(ds, "fonts", "fonts.css"), `@font-face{font-family:Inter;src:url("./inter.woff2")}`);
  writeFileSync(join(ds, "fonts", "inter.woff2"), "wOF2fake");
  writeFileSync(join(ds, "components", "Actions", "Button", "Button.jsx"), "export const Button=()=>null");
  writeFileSync(join(ds, "components", "Actions", "Button", "Button.d.ts"),
    `export interface ButtonProps { variant?: "primary" | "ghost"; disabled?: boolean; }`);
  writeFileSync(join(ds, "_ds_manifest.json"), JSON.stringify({
    namespace: "Fixture",
    components: [{ name: "Button", sourcePath: "components/Actions/Button/Button.jsx" }],
    globalCssPaths: ["styles.css"],
    fonts: ["Inter"],
    tokens: [{ name: "--bg", value: "#000", kind: "color" }],
  }));
  writeFileSync(join(proj, "_ds", "fx", "_ds_bundle.css"), ":root{--bg:#000}");

  const out = join(root, "out");
  mkdirSync(out, { recursive: true });
  return { proj, out };
}

const detect = (proj, out, extra = []) =>
  run("hod-detect.js", ["--project-name", "Fixture Project", "--project-dir", proj, ...extra], out);

test("full pipeline: detect -> bundle -> validate -> archive", () => {
  const { proj, out } = project();

  const d = detect(proj, out, ["--entry", "Landing.dc.html"]);
  assert.equal(d.code, 0, d.out);
  assert.match(d.out, /form1 — Landing\.dc\.html/);
  assert.match(d.out, /1 alias/);

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /adherence config present — generated/);
  assert.match(b.out, /design-system alias present/);

  const bundle = join(out, "fixture-project");
  assert.deepEqual(readdirSync(bundle).sort(), ["AGENTS.md", "CLAUDE.md", "README.md", "project"]);

  const readme = readFileSync(join(bundle, "README.md"), "utf8");
  assert.match(readme, /^# CODING AGENTS/);
  assert.ok(readme.includes("fixture-project/project/Landing.dc.html"), "Form 1 names the entry file");
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(readme), "no unfilled slots");
  assert.ok(readme.includes("_adherence.oxlintrc.json"), "the adherence config is explained");

  for (const bookkeeping of ["_ds_sync.json", "_ods_sync.json", "_ods_needs_recompile"]) {
    assert.ok(!existsSync(join(bundle, "project", bookkeeping)), `I4 — ${bookkeeping} must not ship`);
  }
  assert.ok(existsSync(join(bundle, "project", "_ds", "fx", "_ds_bundle.css")), "I3 alias shipped");

  const adherence = JSON.parse(readFileSync(join(bundle, "project", "_ds", DS, "_adherence.oxlintrc.json"), "utf8"));
  const msgs = adherence.rules["no-restricted-syntax"].slice(1).map((r) => r.message);
  assert.ok(msgs.some((m) => m === "<Button> doesn't accept that prop. Declared props: variant, disabled."));
  assert.ok(msgs.some((m) => m === "<Button> variant must be one of 'primary' | 'ghost'."));

  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /PASS {2}offline-complete/);
  assert.match(v.out, /PASS {2}adherence agrees with the DS manifest/);

  const a = run("hod-archive.js", [], out);
  assert.equal(a.code, 0, a.out);
  const zip = join(out, "Fixture Project-handoff.zip");
  assert.ok(existsSync(zip));
  assert.equal(readFileSync(zip).readUInt32LE(0), 0x04034b50, "must be a real zip");
  assert.ok(existsSync(join(out, "Fixture Project-handoff.tar.gz")));
});

test("no entry file yields the Form 2 directive", () => {
  const { proj, out } = project();
  assert.equal(detect(proj, out).code, 0);
  run("hod-bundle.js", [], out);
  const readme = readFileSync(join(out, "fixture-project", "README.md"), "utf8");
  assert.match(readme, /Find the primary design file under `fixture-project\/project\/`/);
});

test("rootPointers=false restores strict root purity", () => {
  const { proj, out } = project();
  detect(proj, out, ["--root-pointers", "false"]);
  run("hod-bundle.js", [], out);
  assert.deepEqual(readdirSync(join(out, "fixture-project")).sort(), ["README.md", "project"]);
});

/* ── gates must actually block ─────────────────────────────────────────────── */

test("validate blocks on a stray file at bundle root", () => {
  const { proj, out } = project();
  detect(proj, out);
  run("hod-bundle.js", [], out);
  writeFileSync(join(out, "fixture-project", "stray.txt"), "nope");
  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 1);
  assert.match(v.out, /FAIL {2}root purity/);
});

test("validate blocks when sync bookkeeping sneaks into a bundle", () => {
  const { proj, out } = project();
  detect(proj, out);
  run("hod-bundle.js", [], out);
  writeFileSync(join(out, "fixture-project", "project", "_ods_sync.json"), "{}");
  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 1);
  assert.match(v.out, /FAIL {2}no sync bookkeeping/);
});

test("validate blocks on a re-suffixed source (the OD importer's .txt)", () => {
  const { proj, out } = project();
  detect(proj, out);
  run("hod-bundle.js", [], out);
  writeFileSync(join(out, "fixture-project", "project", "Button.jsx.txt"), "x");
  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 1);
  assert.match(v.out, /FAIL {2}no re-suffixed sources/);
});

test("a remote font warns by default and fails under --strict", () => {
  const { proj, out } = project();
  writeFileSync(join(proj, "_ds", DS, "styles.css"), `@import url("https://fonts.example/x.css");`);
  detect(proj, out);
  run("hod-bundle.js", [], out);

  const soft = run("hod-validate.js", [], out);
  assert.equal(soft.code, 0, "the mirror is verbatim — the source's remote font is not our defect");
  assert.match(soft.out, /WARN {2}offline-complete/);

  const strict = run("hod-validate.js", ["--strict"], out);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /FAIL {2}offline-complete/);
});

test("archive refuses to run before validate has passed (I8)", () => {
  const { proj, out } = project();
  detect(proj, out);
  run("hod-bundle.js", [], out);
  const a = run("hod-archive.js", [], out);
  assert.equal(a.code, 2);
  assert.match(a.out, /phase 03 has not passed/);
});

test("bundle refuses to clobber an existing tree without --force", () => {
  const { proj, out } = project();
  detect(proj, out);
  assert.equal(run("hod-bundle.js", [], out).code, 0);
  assert.equal(run("hod-bundle.js", [], out).code, 2);
  assert.equal(run("hod-bundle.js", ["--force"], out).code, 0);
});

/* ── the empty-slug deletion path (data loss) ───────────────────────────────
 * `slugify("设计")` is "" — every character is outside [a-z0-9] — and
 * `join(outRoot, "")` IS outRoot. Before the fix, `hod-bundle.js --force` ran
 * `rmSync(outRoot, { recursive: true, force: true })` and deleted the entire
 * output directory, which on the documented path is the user's cwd. Both halves
 * of the fix are asserted: a non-empty slug, and a guard that refuses any slug
 * resolving to outRoot no matter where it came from. */

const readSlug = (out) =>
  JSON.parse(readFileSync(join(out, ".handoff", "state.json"), "utf8")).project.slug;

test("a project name with no Latin characters bundles into its own directory, never outRoot", () => {
  const { proj, out } = project();
  writeFileSync(join(out, "SENTINEL.txt"), "must survive a --force rebuild");

  const d = run("hod-detect.js", ["--project-name", "设计", "--project-dir", proj], out);
  assert.equal(d.code, 0, d.out);

  const slug = readSlug(out);
  assert.ok(slug, "the slug must never be empty");
  assert.match(slug, /^[a-z0-9][a-z0-9-]*$/, slug);

  assert.equal(run("hod-bundle.js", [], out).code, 0);
  // The deletion path itself.
  assert.equal(run("hod-bundle.js", ["--force"], out).code, 0);

  assert.ok(existsSync(join(out, "SENTINEL.txt")), "--force must not delete the output directory");
  assert.ok(existsSync(join(out, slug, "README.md")), "the bundle is a real subdirectory");
  assert.ok(existsSync(join(out, slug, "project", "Landing.dc.html")), "the mirror landed inside it");

  // Same name, same directory — otherwise every run would orphan the last one.
  const again = mkdtempSync(join(tmpdir(), "hod-again-"));
  assert.equal(run("hod-detect.js", ["--project-name", "设计", "--project-dir", proj], again).code, 0);
  assert.equal(readSlug(again), slug);
});

test("bundle refuses any state.json slug that resolves to or above the output directory", () => {
  // v0.1.3 wrote empty slugs to disk, so state.json cannot be trusted just because
  // detect validates its own output — the guard has to sit where the delete happens.
  // `C:\abs` is only absolute on Windows; on POSIX a backslash is an ordinary
  // filename character, so it IS a legitimate child there and must not be refused.
  const escaping = ["", ".", "..", "../escape", "a/../..", "/abs",
    ...(process.platform === "win32" ? ["C:\\abs", "\\\\server\\share"] : [])];

  for (const slug of escaping) {
    const { proj, out } = project();
    writeFileSync(join(out, "SENTINEL.txt"), "must survive");
    assert.equal(detect(proj, out).code, 0);

    const statePath = join(out, ".handoff", "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.project.slug = slug;
    writeFileSync(statePath, JSON.stringify(state));

    for (const argv of [[], ["--force"]]) {
      const b = run("hod-bundle.js", argv, out);
      assert.equal(b.code, 2, `slug ${JSON.stringify(slug)} ${argv.join(" ")} — expected refusal, got:\n${b.out}`);
      assert.match(b.out, /refusing to use project slug/);
    }
    assert.ok(existsSync(join(out, "SENTINEL.txt")), `slug ${JSON.stringify(slug)} deleted the output directory`);
    assert.ok(existsSync(join(proj, "Landing.dc.html")), `slug ${JSON.stringify(slug)} deleted the project`);
  }
});

test("the archive filename cannot carry a path out of the output directory", () => {
  const { proj, out } = project();
  assert.equal(run("hod-detect.js", ["--project-name", "../../pwned: v2", "--project-dir", proj], out).code, 0);
  assert.equal(run("hod-bundle.js", [], out).code, 0);
  assert.equal(run("hod-validate.js", [], out).code, 0);
  assert.equal(run("hod-archive.js", ["--format", "zip"], out).code, 0);

  const zips = readdirSync(out).filter((f) => f.endsWith(".zip"));
  assert.deepEqual(zips, ["pwned v2-handoff.zip"]);
  assert.ok(!existsSync(join(out, "..", "..", "pwned: v2-handoff.zip")));
});

/* ── I9 end to end: symlinks through the real phases ────────────────────────
 * The unit coverage is in lib.test.js; these drive the gates a user actually
 * hits, and assert the pipeline STOPS rather than shipping or half-shipping. */

const canLink = (() => {
  const p = mkdtempSync(join(tmpdir(), "hod-pipe-probe-"));
  writeFileSync(join(p, "f"), "x");
  try { symlinkSync("f", join(p, "l"), "file"); return true; } catch { return false; }
})();

/** The fixture project plus a sibling directory holding something private. */
function projectWithOutsider() {
  const { proj, out } = project();
  const outside = join(proj, "..", "outside");
  mkdirSync(join(outside, "dir"), { recursive: true });
  writeFileSync(join(outside, "creds.env"), "AWS_SECRET_ACCESS_KEY=hunter2");
  writeFileSync(join(outside, "dir", "unrelated.txt"), "not ours");
  return { proj, out, outside };
}

test("detect reports an external file symlink and bundle refuses to mirror it", { skip: !canLink }, () => {
  const { proj, out, outside } = projectWithOutsider();
  symlinkSync(join(outside, "creds.env"), join(proj, "linked-secret.txt"), "file");

  const d = detect(proj, out);
  assert.equal(d.code, 1, "phase 00 must fail the I9 gate");
  assert.match(d.out, /FAIL {2}no symlink escapes the project — I9/);
  assert.match(d.out, /linked-secret\.txt .*resolves outside the project/s);

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2, "phase 01 refuses independently of phase 00");
  assert.match(b.out, /I9 — refusing to mirror 1 symlink/);

  assert.ok(!existsSync(join(out, "fixture-project")),
    "the refusal happens before anything is written — no empty bundle left behind");
});

test("a refusal never destroys an existing bundle, even with --force", { skip: !canLink }, () => {
  const { proj, out, outside } = projectWithOutsider();
  assert.equal(detect(proj, out).code, 0);
  assert.equal(run("hod-bundle.js", [], out).code, 0);
  const good = join(out, "fixture-project", "project", "Landing.dc.html");
  assert.ok(existsSync(good));

  // The project grows an unsafe link only now, between builds.
  symlinkSync(join(outside, "creds.env"), join(proj, "linked-secret.txt"), "file");

  const b = run("hod-bundle.js", ["--force"], out);
  assert.equal(b.code, 2);
  assert.match(b.out, /Nothing has been written or deleted/);
  assert.ok(existsSync(good), "--force must not delete the previous bundle before refusing");
});

test("an external directory symlink is refused, not an EISDIR/EPERM abort", { skip: !canLink }, () => {
  const { proj, out, outside } = projectWithOutsider();
  try { symlinkSync(join(outside, "dir"), join(proj, "linked-dir"), "dir"); }
  catch { symlinkSync(join(outside, "dir"), join(proj, "linked-dir"), "junction"); }

  assert.equal(detect(proj, out).code, 1);
  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2);
  assert.match(b.out, /I9 — refusing to mirror/);
  assert.ok(!/EISDIR|EPERM|Error:/.test(b.out), `must be a clean refusal, got:\n${b.out}`);
  assert.ok(!existsSync(join(out, "fixture-project", "project", "linked-dir", "unrelated.txt")));
});

test("an internal symlink passes every gate and ships as real content", { skip: !canLink }, () => {
  const { proj, out } = project();
  symlinkSync(join(proj, "support.js"), join(proj, "runtime-alias.js"), "file");

  const d = detect(proj, out, ["--entry", "Landing.dc.html"]);
  assert.equal(d.code, 0, d.out);
  assert.match(d.out, /PASS {2}no symlink escapes the project — I9 — 1 link\(s\), all resolving inside/);

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /PASS {2}no symlink escapes the project — I9 — 1 internal link/);

  const shipped = join(out, "fixture-project", "project", "runtime-alias.js");
  assert.equal(readFileSync(shipped, "utf8"), "// runtime");
  assert.ok(!lstatSync(shipped).isSymbolicLink(), "materialized, so the archive cannot flatten it away");

  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /PASS {2}no symlinks in the bundle — I9 — fully materialized/);
});

test("validate catches a symlink smuggled into a built bundle", { skip: !canLink }, () => {
  const { proj, out } = project();
  detect(proj, out);
  run("hod-bundle.js", [], out);
  symlinkSync(join(proj, "support.js"), join(out, "fixture-project", "project", "sneak.js"), "file");

  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 1);
  assert.match(v.out, /FAIL {2}no symlinks in the bundle — I9/);
});

/* ── I9, the non-symlink half: raw path input ───────────────────────────────
 * `--files`, `--focus` and `--entry` bypass `walk` entirely, so a plain `../`
 * reaches the filesystem without a link being involved at all. Same disclosure,
 * different door. */

test("--files cannot copy a file from outside the project into the spec", () => {
  const { proj, out } = project();
  writeFileSync(join(proj, "..", "outsider.env"), "AWS_SECRET_ACCESS_KEY=hunter2");
  detect(proj, out, ["--entry", "Landing.dc.html"]);

  const s = run("hod-spec.js", ["--feature", "Landing Page", "--files", "../outsider.env"], out);
  assert.equal(s.code, 2, s.out);
  assert.match(s.out, /I9 — --files must stay inside the project/);
  assert.ok(!existsSync(join(proj, "design_handoff_landing_page", "prototypes", "outsider.env")));
});

test("--focus cannot point the agent at a file outside the project", () => {
  const { proj, out } = project();
  writeFileSync(join(proj, "..", "outsider.env"), "secret");
  detect(proj, out, ["--entry", "Landing.dc.html"]);

  const p = run("hod-prompt.js", ["--focus", "../outsider.env"], out);
  assert.equal(p.code, 2, p.out);
  assert.match(p.out, /I9 — --focus must stay inside the project/);
});

test("--entry cannot escape the project directory", () => {
  const { proj, out } = project();
  writeFileSync(join(proj, "..", "outsider.html"), "<h1>x</h1>");
  const d = detect(proj, out, ["--entry", "../outsider.html"]);
  assert.equal(d.code, 2, d.out);
  assert.match(d.out, /--entry .* resolves outside --project-dir/);
});

test("a hand-edited designSystem.dir cannot escape the project", () => {
  const { proj, out } = project();
  detect(proj, out);
  const statePath = join(out, ".handoff", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.designSystem.dir = "../outside-ds";
  writeFileSync(statePath, JSON.stringify(state));

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2, b.out);
  assert.match(b.out, /designSystem\.dir .* resolves outside the project/);
});

/* ── I10: an advertised option is a promise ─────────────────────────────────
 * `depth` was a declared manifest input that phase 00 wrote into state and nothing
 * ever read. The documented order ran 01 before 02, so the mirror was snapshotted
 * before the spec existed and no phase refreshed it: `depth=both` produced an
 * archive with no spec in it, every gate green. */

/**
 * Entry names straight out of a zip's central directory.
 *
 * Not `tar -tf`: bsdtar reads zips and GNU tar does not, so shelling out passes on
 * Windows and fails on a Linux runner for a reason that has nothing to do with the
 * bundle. Reading the record is also a stronger assertion — it is what an extractor
 * actually consults.
 */
function zipEntries(file) {
  const buf = readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, "no zip end-of-central-directory record");

  const count = buf.readUInt16LE(eocd + 10);
  const names = [];
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, `central directory entry ${n}`);
    const nameLen = buf.readUInt16LE(p + 28);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return names;
}

/** Author over the skeleton the way the runbook tells the agent to. */
function authorSpec(proj, dirName) {
  const readme = join(proj, dirName, "README.md");
  const authored = readFileSync(readme, "utf8")
    .split("\n")
    .map((l) => (/\bTODO\b/.test(l) ? l.replace(/TODO.*/, "Authored by the fixture.") : l))
    .join("\n");
  writeFileSync(readme, authored);
  return readme;
}

test("depth=both puts the authored spec inside the finished ARCHIVE", () => {
  const { proj, out } = project();
  assert.equal(detect(proj, out, ["--entry", "Landing.dc.html", "--depth", "both",
    "--feature", "Landing Page"]).code, 0);

  // Phase 02 first — this is the ordering the whole bug was about.
  assert.equal(run("hod-spec.js", [], out).code, 0, "feature comes from state");
  authorSpec(proj, "design_handoff_landing_page");
  assert.equal(run("hod-validate.js", ["--spec"], out).code, 0, "--spec with no value uses the feature slug");

  assert.equal(run("hod-bundle.js", [], out).code, 0);
  const b = run("hod-bundle.js", ["--force"], out);
  assert.match(b.out, /PASS {2}authored spec nested in the mirror/);

  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /PASS {2}depth=both — authored spec is inside the bundle/);
  assert.match(v.out, /PASS {2}the nested spec is authored, not a skeleton/);
  assert.match(v.out, /PASS {2}the nested spec carries its prototypes/);

  assert.equal(run("hod-archive.js", ["--format", "zip"], out).code, 0);

  // The deliverable, read back out of the zip itself — not inferred from the tree.
  const listing = zipEntries(join(out, "Fixture Project-handoff.zip"));
  assert.ok(listing.some((e) => e.endsWith("project/design_handoff_landing_page/README.md")),
    `spec README missing from the archive:\n${listing.join("\n")}`);
  assert.ok(listing.some((e) => e.includes("design_handoff_landing_page/prototypes/Landing.dc.html")),
    "spec prototypes missing from the archive");
});

test("depth=both refuses to bundle before the spec exists", () => {
  const { proj, out } = project();
  detect(proj, out, ["--depth", "both", "--feature", "Landing Page"]);

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2, b.out);
  assert.match(b.out, /depth=both requires the authored spec to exist before the mirror is taken/);
  assert.ok(!existsSync(join(out, "fixture-project")), "nothing written");
});

test("depth=both refuses a spec that is still a skeleton", () => {
  const { proj, out } = project();
  detect(proj, out, ["--depth", "both", "--feature", "Landing Page"]);
  run("hod-spec.js", [], out);                     // scaffold, do NOT author

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2, b.out);
  assert.match(b.out, /still carries TODO markers/);
});

test("depth=bundle and depth=spec each refuse the phase they exclude", () => {
  const bundleOnly = project();
  detect(bundleOnly.proj, bundleOnly.out, ["--depth", "bundle"]);
  const s = run("hod-spec.js", ["--feature", "Landing Page"], bundleOnly.out);
  assert.equal(s.code, 2, s.out);
  assert.match(s.out, /depth=bundle — phase 02 does not run/);

  const specOnly = project();
  detect(specOnly.proj, specOnly.out, ["--depth", "spec", "--feature", "Landing Page"]);
  const b = run("hod-bundle.js", [], specOnly.out);
  assert.equal(b.code, 2, b.out);
  assert.match(b.out, /depth=spec — phase 01 does not run/);
});

test("depth=bundle still ships a bundle, with no spec required", () => {
  const { proj, out } = project();
  assert.equal(detect(proj, out, ["--depth", "bundle"]).code, 0);
  assert.equal(run("hod-bundle.js", [], out).code, 0);
  assert.equal(run("hod-validate.js", [], out).code, 0);
  assert.ok(!readdirSync(join(out, "fixture-project", "project")).some((f) => f.startsWith("design_handoff_")));
});

/* ── includeChats: the README promised a directory nothing created ──────────── */

test("includeChats copies the transcript and validate confirms it shipped", () => {
  const { proj, out } = project();
  const chats = mkdtempSync(join(tmpdir(), "hod-chats-"));
  writeFileSync(join(chats, "conversation.md"), "# how the design happened\n");

  assert.equal(detect(proj, out, ["--include-chats", "true", "--chats-dir", chats]).code, 0);
  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /PASS {2}conversation transcript included — chats\/ — 1 file/);

  assert.equal(readFileSync(join(out, "fixture-project", "chats", "conversation.md"), "utf8"),
    "# how the design happened\n");

  const v = run("hod-validate.js", [], out);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /PASS {2}includeChats — transcript is in the bundle/);
  assert.match(v.out, /PASS {2}root purity/, "chats/ is permitted at root only because it exists");
});

test("includeChats without a transcript directory fails at phase 00, not silently", () => {
  const { proj, out } = project();
  const d = detect(proj, out, ["--include-chats", "true"]);
  assert.equal(d.code, 1);
  assert.match(d.out, /FAIL {2}transcript directory given and non-empty/);

  const b = run("hod-bundle.js", [], out);
  assert.equal(b.code, 2);
  assert.match(b.out, /includeChats is on but no transcript directory was given/);
});

/* ── transport=both was a declared option that emitted one prompt ───────────── */

test("transport=both emits both prompt forms", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html", "--transport", "both"]);
  const p = run("hod-prompt.js", [], out);
  assert.equal(p.code, 0, p.out);
  assert.match(p.out, /Option A — read it live over MCP/);
  assert.match(p.out, /Option B — from the archive/);
  assert.match(p.out, /od mcp install opencode/);
  assert.match(p.out, /Unzip `Fixture Project-handoff\.zip`/);
});

test("an unknown transport is refused rather than treated as zip", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);
  const p = run("hod-prompt.js", ["--transport", "carrier-pigeon"], out);
  assert.equal(p.code, 2);
  assert.match(p.out, /unknown --transport/);
});

/* ── spec scaffold ─────────────────────────────────────────────────────────── */

test("spec scaffolds a skeleton that fails validation until the TODOs are written", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);

  const s = run("hod-spec.js", ["--feature", "Landing Page"], out);
  assert.equal(s.code, 0, s.out);

  const dir = join(proj, "design_handoff_landing_page");
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  assert.match(readme, /^# Handoff: Fixture Project — Landing Page/);
  for (const section of ["About the Design Files", "Fidelity", "Assets", "Files (in this bundle)"]) {
    assert.ok(readme.includes(`## ${section}`), `missing ## ${section}`);
  }
  assert.ok(readme.includes("`--bg`"), "token table derived from the manifest");
  assert.ok(existsSync(join(dir, "prototypes", "Landing.dc.html")));

  const v = run("hod-validate.js", ["--spec", "landing_page"], out);
  assert.equal(v.code, 1, "a skeleton full of TODOs is not a finished spec");
  assert.match(v.out, /FAIL {2}no TODO markers left/);
});

test("hod-prompt emits the MCP form and discovers local imports", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);
  const p = run("hod-prompt.js", ["--transport", "mcp", "--agent", "opencode"], out);
  assert.equal(p.code, 0, p.out);
  assert.match(p.out, /od mcp install opencode/);
  assert.match(p.out, /Focus on these files/);
  assert.match(p.out, /support\.js/, "walks <script src> into the also-read list");
  assert.match(p.out, /Implement: `Landing\.dc\.html`/);
});

/* ── the round trip is the point: Open Design -> OpenCode -> Open Design ───── */

test("OpenCode is the default receiving end", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);
  const p = run("hod-prompt.js", ["--transport", "mcp"], out);
  assert.equal(p.code, 0, p.out);
  assert.match(p.out, /od mcp install opencode/, "no --agent must still target OpenCode");
});

test("every transport tells the agent how to sync back", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);
  for (const transport of ["mcp", "zip"]) {
    const p = run("hod-prompt.js", ["--transport", transport], out);
    assert.equal(p.code, 0, p.out);
    assert.match(p.out, /@ross-sec\/sync-od/, `${transport} prompt must close the loop`);
  }
});

test("the bundle itself documents the round trip", () => {
  const { proj, out } = project();
  detect(proj, out, ["--entry", "Landing.dc.html"]);
  run("hod-bundle.js", [], out);
  const bundle = join(out, "fixture-project");
  assert.match(readFileSync(join(bundle, "README.md"), "utf8"), /## Sending changes back/);
  assert.match(readFileSync(join(bundle, "AGENTS.md"), "utf8"), /@ross-sec\/sync-od/);
});
