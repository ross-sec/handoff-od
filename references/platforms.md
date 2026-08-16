# Installing, trust, and the things that will bite you

## What an Open Design plugin is

A **folder**, not an npm package: `SKILL.md` (required, portable — the same folder works in Claude
Code, Cursor and Codex) plus an optional `open-design.json` sidecar that unlocks the product
surface. `open-design.json` alone is metadata and is **not runnable**.

**Plugins ship zero executable code.** No hooks, no lifecycle, no entrypoint. You contribute
declarations and prose; the daemon concatenates them into the agent's system prompt, and the agent
shells out to whatever scripts the folder bundles. That is why this package has no build step.

**Nothing Open Design publishes is on npm.** Every `@open-design/*` name 404s; every workspace
package is `private: true`. There is no plugin SDK and no types package. Do not add an
`@open-design/*` dependency — it will not resolve. Validate against the schema URL instead.

## Verified against a live daemon — five things the docs get wrong

All confirmed on a running 0.15.1 build. Every one of these cost a debugging cycle.

**1. The daemon is not on `127.0.0.1:7456`.** The desktop app binds a **random high port** and a
Windows **named pipe**. `od plugin install` ignores `OD_SIDECAR_IPC_PATH` and hard-fails to 7456
with `ECONNREFUSED`. Find the real port and pass it:

```bash
# Windows — the daemon port is whichever one answers /api/plugins
powershell -Command "Get-NetTCPConnection -State Listen | ForEach-Object { \
  \$p=(Get-Process -Id \$_.OwningProcess -EA SilentlyContinue); \
  if(\$p.ProcessName -like '*Open Design*'){ \$_.LocalPort } }"
export OD_DAEMON_URL="http://127.0.0.1:<port>"      # or --daemon-url
```

**2. `--source` must start with `./`, and it resolves against the daemon's runtime dir** — not your
shell's cwd, and not an absolute path. An absolute path is treated as a *marketplace name* and 404s
with `plugin-not-found`. The runtime dir is
`…\Roaming\Open Design\namespaces\<ns>\runtime\`, so a folder elsewhere needs a `./`-relative walk:

```bash
od plugin install --source "./../../../../../../Desktop/projects/SKILLS_DEV/plugins/handoff-od"
```

**3. `od.context.skills[{path: "./SKILL.md"}]` does not resolve.** It emits
`Unknown skill ref: './SKILL.md'` and contributes **no** context item — even for an already-installed
plugin, and even for Open Design's own bundled `od-default`. Only `{ref: "<registered-id>"}`
resolves. Put the portable skill in **`compat.agentSkills`** instead, which is warning-free and is
what the first-party `od-nextjs-export` does. Same trap for `context.craft` slugs.

**4. `{{var}}` interpolation in `useCase.query` does not happen.** Placeholders survive verbatim into
the user's brief field. The first-party plugin with two inputs has **no placeholders at all** — inputs
are delivered separately in `ApplyResult.inputs`. Write the query as plain prose.

**5. A local-folder install lands as `trust=trusted`, not `restricted`,** and the resolver
auto-derives capabilities you never declared (`genui:confirmation`, `pipeline:*`) and auto-injects a
GenUI surface per atom that needs one (`diff-review` adds `__auto_diff_review_verify:choice`). Read
`capabilitiesRequired` from a real `apply` rather than assuming your manifest's list is the whole set.

## Installing this plugin

```bash
# from the npm package (this package's root IS the plugin folder)
npm i @ross-sec/handoff-od
od plugin install --source ./node_modules/@ross-sec/handoff-od

# straight from git
od plugin install github:ross-sec/handoff-od
od plugin install github:ross-sec/handoff-od@v0.1.0

# then grant what it needs
od plugin trust handoff-od --capabilities fs:read,fs:write,bash
od plugin doctor handoff-od
```

Also available: drag-and-drop a zip of the folder (`POST /api/plugins/upload-zip`), or vendor it at
`<projectCwd>/.open-design/plugins/handoff-od/` — discovery tier 1, so it lives version-controlled
inside the user's own repo with no CLI step at all.

## Trust and capabilities

Third-party plugins install **`restricted`**: `prompt:inject` only, until the user explicitly
grants more. Restricted means no `.mcp.json`, no subprocesses, no connectors.

| Capability | Why this plugin needs it |
|---|---|
| `prompt:inject` | always allowed; how `SKILL.md` reaches the agent |
| `fs:read` | read the project cwd to mirror it |
| `fs:write` | write `<slug>/` and the archive |
| `bash` | run the bundled Node scripts, and the zip writer |

Trust binds to provenance — plugin id, `specVersion`, version/digest, marketplace id, granted caps.
**Elevated capabilities must be re-confirmed on upgrade.** A headless capability-gate failure exits
**66** with structured stderr; retry with `--grant-caps`.

Every capability costs a prompt. Do not add one speculatively.

## Verifying a change

```bash
od plugin validate ./handoff-od --json
od plugin install  --source ./handoff-od
od plugin doctor   handoff-od
od plugin simulate handoff-od -s user.confirmed=true
od plugin apply    handoff-od --project <projectId> --json
```

Plus the package's own checks, which need no daemon:

```bash
npm test              # unit + golden tests
npm run validate      # manifest / SKILL / atom-catalog self-check
```

**The daemon must be running** for anything `od plugin` does — default
`http://127.0.0.1:7456`, overridable with `--daemon-url` or `OD_DAEMON_URL`.

## Version skew — read this before debugging

The repo and your installed app will not agree. At the time of writing: repo `0.19.2`, a common
installed build `0.15.1`. The shipped CLI has **more** plugin verbs than the spec documents, and the
spec lists verbs (`od plugin export`, `run`, `scaffold`) that do **not** exist in the build.

**Trust `od plugin --help` over the spec document.**

`docs/plugins-spec.md` self-describes as *"draft, awaiting review"*. The manifest v1 shape is safe
to build on — `specVersion` exists to absorb change, `additionalProperties: true` everywhere,
snapshots freeze the version for replay, and a published JSON Schema validates it. The volatile
parts are the atom catalog, the `until` vocabulary, GenUI `component`, and connectors.

## Zip writers — a real trap

`hod-archive.js` verifies zip magic bytes (`PK\x03\x04`) after writing, and that check is not
paranoia:

**GNU tar accepts `-a -c -f out.zip` and silently writes a TAR.** On a machine where Git Bash's GNU
tar shadows the system one, you get a plausible-looking `.zip` that no unzip tool can open. Verified
on Windows: GNU tar 1.35 produced a 368 KB tar named `.zip`; the real zip was 122 KB.

Preference order, first one whose output has real zip magic wins:

1. `C:\Windows\System32\tar.exe` (bsdtar) on Windows
2. `bsdtar`
3. Info-ZIP `zip`
4. `tar -a` on macOS (where `tar` is bsdtar)
5. PowerShell `Compress-Archive`

For `.tar.gz`, GNU tar is fine — but on Windows it reads the `C:` in an absolute output path as a
**remote host spec** and refuses, so bsdtar is used there too, falling back to `--force-local`.

No working zip writer? `--format targz` always works.

## Portability

`SKILL.md` carries standard agent-skill frontmatter, so this folder also drops into
`~/.claude/skills/`, `.claude/skills/`, or any harness that reads agent skills. Outside Open Design
you lose the manifest's inputs and the confirmation surface; the scripts and the runbook work
unchanged.
