import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
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
  writeFileSync(join(proj, "_ds_sync.json"), `{"bundleSha12":"deadbeef"}`);

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

  assert.ok(!existsSync(join(bundle, "project", "_ds_sync.json")), "I4");
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
