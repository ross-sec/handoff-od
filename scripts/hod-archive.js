#!/usr/bin/env node
// Phase 04 — archive. Emits `<Project Name>-handoff.zip` and `.tar.gz`.
// The `-handoff` suffix is what distinguishes this from a plain project export.
//
//   node scripts/hod-archive.js [--out <dir>] [--format zip|targz|both]
//
// DONE-gate: phase 03 verdict is ok (I8); archive entry count >= tree file count.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  args, die, readState, readJson, writeJson, walk, archive, archiveEntryCount, Gates,
} from "./_lib.js";

const a = args();
const outRoot = a.out ?? process.cwd();
const state = readState(outRoot);
if (!state) die("no .handoff/state.json — run hod-detect.js first");

const { project } = state;
const bundleRoot = join(outRoot, project.slug);
if (!existsSync(bundleRoot)) die(`no ${project.slug}/ — run hod-bundle.js first`);

// I8 — never archive an unvalidated tree.
const verdict = readJson(join(outRoot, ".handoff", "validate.json"));
if (!verdict?.ok) die("phase 03 has not passed — run hod-validate.js first (I8: archive only after validate)");

const format = a.format ?? "both";
const treeCount = walk(bundleRoot).length;
const written = [];

for (const ext of format === "both" ? ["zip", "tar.gz"] : [format === "targz" ? "tar.gz" : "zip"]) {
  const outFile = join(outRoot, `${project.name}-handoff.${ext}`);
  try {
    archive(outRoot, project.slug, outFile);
  } catch (err) {
    die(`archiving ${ext} failed: ${String(err.message ?? err).split("\n")[0]}\n` +
      `  zip needs Info-ZIP \`zip\` or bsdtar; tar.gz needs \`tar\`.`);
  }
  written.push({ format: ext, path: outFile, bytes: statSync(outFile).size, entries: archiveEntryCount(outFile) });
}

writeJson(join(outRoot, ".handoff", "archive.json"), { at: new Date().toISOString(), treeCount, written });

const g = new Gates("04 archive");
for (const w of written) {
  g.check(`${w.format} complete`, w.entries >= treeCount,
    `${w.entries}/${treeCount} entries, ${(w.bytes / 1024).toFixed(0)} KB`);
}
console.log(`\nDeliverable(s):\n${written.map((w) => `  ${w.path}`).join("\n")}`);
g.finish();
