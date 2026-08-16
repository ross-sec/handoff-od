# RUNBOOK

Numbered steps, no judgement calls. `SKILL.md` is the map; this is the road.
Substitute `<...>` and run each line exactly. Stop the moment a phase prints `BLOCKED`.

`$PLUGIN` = this plugin's directory. `$OUT` = where the bundle should be written
(default: the current directory).

---

## Step 1 — collect the four facts

You need these before touching a script. Get them from Open Design, not from memory.

| Fact | Where it comes from | Flag |
|---|---|---|
| project display name | `get_project` / `list_projects` | `--project-name` |
| project cwd on disk | `get_project` -> `resolvedDir`, or `od project info <id> --json` | `--project-dir` |
| active file | `get_active_context()` -> the active file, if any | `--entry` |
| feature scope | ask the user; only needed when `depth` includes `spec` | `--feature` |

If `get_active_context()` reports nothing active, **omit `--entry`**. Do not guess a file.

---

## Step 2 — phase 00, detect

```
node $PLUGIN/scripts/hod-detect.js \
  --project-name "<NAME>" \
  --project-dir "<DIR>" \
  [--entry "<FILE>"] \
  [--depth bundle|spec|both] [--transport zip|mcp|both] \
  [--include-chats true] [--root-pointers false] [--verification true] \
  [--out "$OUT"]
```

Read the gate block. Then:

| Line | Meaning | Do |
|---|---|---|
| `entry mode ... form1` | an entry file was found | nothing |
| `entry mode ... form2` | none — the README will say "find the primary design file" | nothing; this is valid |
| `design system ... none` | project has no bound DS | nothing; skip every DS gate below |
| `... (collapsed, N components, M alias)` | published-library DS | nothing |
| `... (expanded, ...)` | project-local DS | nothing |
| `WARN declared fonts have binaries` | the DS names fonts but ships no `.woff2` | note it for the final report |
| `FAIL` anything | **stop** | fix the input and re-run |

---

## Step 3 — phase 01, bundle  *(skip when depth=spec)*

```
node $PLUGIN/scripts/hod-bundle.js [--out "$OUT"] [--force]
```

`--force` is required to rebuild over an existing `<slug>/`.

All gates must read `PASS`. In particular:

- `project mirrored verbatim — N/N files` — the two numbers must match.
- `design-system alias present` — appears only when aliases exist; if it fails, the prototypes
  will render unstyled. Do not proceed.
- `adherence config present — generated (N rules, M components)` or `— mirrored`.
  `mirrored` means the source already had one and it was copied byte-for-byte. Both are correct.

---

## Step 4 — phase 02, spec  *(skip when depth=bundle)*

```
node $PLUGIN/scripts/hod-spec.js --feature "<SCOPE>" [--files "a.html,b.html"] [--out "$OUT"]
```

Then **author the document**. Open `<project-dir>/design_handoff_<slug>/README.md` and replace
every `TODO`. Read `references/spec-sections.md` first. Rules that fail review if broken:

1. Read the actual prototype files before writing a single measurement. Never estimate.
2. Every hex, px, weight, duration and easing must come from a file you opened this run.
3. Fill the route-map table if the script pre-filled one — that mapping is the deliverable.
4. Quote copy strings exactly, in quotes.
5. Specify algorithms, not adjectives.
6. Do not delete a pre-filled token table, asset list or file tree; extend them.

---

## Step 5 — phase 03, validate

```
node $PLUGIN/scripts/hod-validate.js [--out "$OUT"] [--strict]
node $PLUGIN/scripts/hod-validate.js --spec <feature-slug> [--out "$OUT"]     # when depth includes spec
```

- `FAIL` -> fix and re-run. Never continue.
- `WARN offline-complete` -> the source references remote resources. Keep it, report it.
  Only re-run with `--strict` if the user explicitly needs an offline bundle.
- `WARN font binaries shipped` -> same.

Phase 04 will refuse to run until this writes `ok: true`.

---

## Step 6 — phase 04, archive  *(skip when depth=spec or transport=mcp)*

```
node $PLUGIN/scripts/hod-archive.js [--out "$OUT"] [--format zip|targz|both]
```

Both gates must read `PASS`. The script verifies real zip magic bytes, so a `FAIL` here means no
working zip writer was found — install Info-ZIP `zip`, or use `--format targz`.

---

## Step 7 — the prompt

```
node $PLUGIN/scripts/hod-prompt.js --transport mcp  --agent claude   [--focus "a.html"] [--instructions "..."]
node $PLUGIN/scripts/hod-prompt.js --transport zip                    [--focus "a.html"] [--instructions "..."]
```

Print the result for the user to copy. Written to `.handoff/prompt.txt`.

---

## Step 8 — report

State, in this order:

1. The exact path of the archive, or the prompt to paste.
2. What the bundle contains — file count, whether a design system is included, whether an
   adherence config was generated or mirrored.
3. Every `WARN`, in plain terms. "The design system loads its fonts from Google, so the bundle
   needs a network connection to render exactly." Do not bury this.
4. When a spec was authored: which sections still need the user's judgement.

Never report success while any phase printed `BLOCKED`.

---

## Recovery

| Symptom | Cause | Fix |
|---|---|---|
| `no .handoff/state.json` | phase 00 not run, or wrong `--out` | re-run 00 with the same `--out` |
| `<slug>/ already exists` | rebuilding | add `--force` |
| `phase 03 has not passed` | archiving before validating | run 03; fix any `FAIL` |
| `no working zip writer` | no bsdtar / Info-ZIP on PATH | `--format targz`, or install `zip` |
| `mirrored N/M files` mismatch | source changed mid-run | re-run 00 then 01 `--force` |
| adherence disagrees with manifest | hand-edited config | delete it and re-run 01 `--force` |
| `prop rule for unknown component` | manifest and `components/` out of sync | re-export the DS from Open Design |
