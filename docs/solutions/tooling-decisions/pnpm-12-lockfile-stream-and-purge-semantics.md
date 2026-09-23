---
title: pnpm 12 — the env lockfile document, the pin-to-lockfile coupling, and the removed modules-purge prompt
date: "2026-09-23"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
category: docs/solutions/tooling-decisions
symptoms:
  - "check-changeset: no 'turbo' devDependency in the root importer of pnpm-lock.yaml"
  - "pnpm-lock.yaml's `importers:` block named no workspace project besides the root"
  - "ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE naming packageManagerDependencies"
  - "ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS naming \"config\" or \"confirmModulesPurge\""
applies_when:
  - Bumping the pinned pnpm major
  - Reading pnpm-lock.yaml as text (gates, CI tools, release jobs)
  - Deciding whether an install may remove the modules directory without a prompt
root_cause: dependency_major_change
resolution_type: dependency_migration
related_components:
  - changeset gate (check-changeset)
  - mutation matrix (discover-mutation-targets)
  - release pipeline (pnpm change / pnpm version -r)
  - pnpm-workspace.yaml
tags:
  - pnpm
  - lockfile
  - release-gate
  - migration
  - purge
---

# pnpm 12 — the env lockfile document, the pin-to-lockfile coupling, and the removed modules-purge prompt

## Candidates

1. **Move the pin to the 12.x line** (`pnpm@12.6.0`, `latest` since 12.0.0 shipped 2026-08-26) — and regenerate the lockfile. A pnpm 12 binary already honours a project's `packageManager` pin, so any machine that upgraded pnpm was silently running 12 semantics in-repo before the manifest said so.
2. **Stay on the 11.x line** (`11.27.1`) — least work, but the manifest keeps declaring a major the toolchain has moved past, and the local/CI divergence this pin exists to prevent reappears (flake.nix keeps pnpm off the devShell PATH for exactly that reason).
3. **Upgrade only the machine, leave the pin** — rejected. `packageManager` is the one declaration every agent, hook, and CI job resolves through; a machine-only bump changes nothing for CI and hides the divergence rather than removing it.

## Deciding criterion

Every cost of the move is a **loud** failure: a hard error, or a gate that refuses to emit a verdict. The pin-to-lockfile coupling is the clearest example — it converts "bumped the pin, forgot the lockfile" from a silent CI pass into a CI failure. Speed of the Rust CLI is not the reason to take it; enforced coupling is.

## Problem & Observable Boundary

Three of pnpm 12's behaviors invalidate assumptions the repo's gates and configuration were written on, and none of them announces itself as a schema change:

- The lockfile became a **two-document YAML stream**. Text readers that locate content by the first `importers:` block now parse the wrong document and fail (both gates did, loudly — see Symptoms).
- The pinned package manager is now **recorded in the lockfile** and verified by `--frozen-lockfile`, so a pin bump without a regenerated lockfile fails the frozen install that `pnpm check` and CI both begin with.
- The **interactive modules-directory purge prompt** and the setting that disabled it are gone from the 12.x line, so the repo's `config: confirm-modules-purge: false` is not just ineffective but rejected outright.

Boundary conditions: all three bite only where the project pins a package manager (this repo does, exactly) and only under pnpm 12 — the same commands under `11.21.0` behave as before, which is what made a machine-level pnpm upgrade so quiet.

## Mechanism & Failure Modes

### 1. `pnpm-lock.yaml` is a two-document stream

pnpm 12 writes the _env lockfile_ — `importers["."]` carrying `configDependencies` and the `packageManager` / `devEngines` bootstrap dependencies — as the **first** document, ahead of the project lockfile:

```yaml
---
lockfileVersion: "9.0"

importers:
  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: 12.6.0
        version: 12.6.0

packages:
# pnpm@12.6.0 and its @pnpm/exe.* platform binaries
---
lockfileVersion: "9.0"

settings:
# the project lockfile this repo always had
importers:
# . plus every workspace project
```

Both documents declare the same `lockfileVersion: '9.0'`, so the version string no longer identifies _which_ document holds what. A reader that slices from the stream's first `importers:` block answers with the env document, whose only importer is the root. Upstream cuts the stream at the first `\n---\n` separator after a leading `---\n` and calls the remainder the main document — `extract_main_document` in the lockfile crate's `yaml_documents` module, with the env document owned by `EnvLockfile` in its `env_lockfile` module. A lockfile with no leading marker is the main document already.

### 2. The pin is recorded, and a frozen install enforces it

`--frozen-lockfile` no longer resolves and saves a newly-pinned package manager. When the pin is absent from the lockfile's `packageManagerDependencies` or no longer matches it, the install fails:

```
ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE
  resolve package manager dependencies
  Cannot update packageManagerDependencies with "frozen-lockfile" because the lockfile is not up to date
```

Upstream states the intent in `frozen-lockfile-package-manager-deps`: "a manifest whose pin was bumped without regenerating the lockfile can no longer pass CI." The repo's `pnpm check` opens with `pnpm install --frozen-lockfile` and CI's `install-deps` action runs the same, so the env document is a required part of the lockfile rather than an artifact to trim. Regeneration costs one `pnpm install` in the bumped tree; the project document is reused, so dependency resolutions do not move.

### 3. The purge prompt is gone; the setting that disabled it is rejected

pnpm 11 asks for consent before recreating a modules directory whose persisted layout disagrees with the current configuration, and throws `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` with no terminal — the failure mode that motivated `config: confirm-modules-purge: false` (commit "chore: prevent node modules purge"). pnpm 12 has neither the prompt nor the setting:

- `confirmModulesPurge` is classified as a **pnpm v11-only** setting and is not implemented (pnpm/pnpm#14127: "pacquet does not implement confirmModulesPurge... it should continue warning that the key is ignored"). With the project pin satisfied, any unrecognized `pnpm-workspace.yaml` key is a hard error — `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`, naming the key and its origin version — so neither `confirmModulesPurge` nor the `config:` wrapper it sat in (`did you mean "authConfig"?`) can stay.
- A **plain install** purges and rebuilds a drifted modules directory with no prompt: `purge_inconsistent_modules_dir` recreates the layout when the run is a plain install, and its only gates are safety predicates, not consent — the canonicalized target must be a strict subdirectory of the workspace root (otherwise warn-and-skip, or `UnsafeFilteredModulesDir` for a filtered install), and only entries pnpm owns are removed (`is_pnpm_owned_entry`: `.bin`, `.modules.yaml`, the virtual-store directory name; a user's hidden file is left alone).
- `pnpm add` / `pnpm remove` — not plain installs — still **refuse** a drifted layout, via `check_modules_settings_diff`, surfacing `ERR_PNPM_HOIST_PATTERN_DIFF`, `ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF`, or `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`.
- Orphan packages cached inside the modules directory are aged out separately by `modulesCacheMaxAge` (default 7 days); that mechanism is unrelated to the purge.

Consequence for this repo: the prompt, and the non-TTY abort behind it, **do not exist in the pinned version**, and nothing replaced them. Removing the setting loses no behavior; keeping it is a hard install failure.

## Architectural Invariants

**Invariant 1 — Stream position identifies a lockfile document; its version string does not.** Two documents can declare the same `lockfileVersion`, so any reader that wants project data must select by position (the main document) or by a predicate, never by "the first `importers:` block" nor by the version regex alone. The invariant form:

```ts
// The project lockfile document, per pnpm's own cut.
const mainLockfileDocument = (content: string): string => {
  const normalized = content.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const rest = normalized.slice('---\n'.length)
  const separator = rest.indexOf('\n---\n')
  return separator === -1 ? '' : rest.slice(separator + '\n---\n'.length)
}
```

An env-only stream yields `''` — no main document — so the version assertion and the empty-result throw both fail closed rather than reading the env document's importer as project data. Anti-pattern code smell: `lockfile.indexOf('\nimporters:')`, `lockfile.slice(...)` from a raw read, or any lockfile assertion keyed only on `/^lockfileVersion:/m`.

**Invariant 2 — A pin recorded in a lockfile is enforced, not decorative.** Where a manifest declares the tool that runs the build, the lockfile must record the resolved identity of that tool, and the frozen install must refuse when the two disagree. Before: a pin bump verified by nothing but the manifest. After: `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` before any task runs. Anti-pattern code smell: a `packageManager` edit in a commit that does not touch `pnpm-lock.yaml`.

**Invariant 3 — Consent is replaced by a bounding predicate, never by silence.** A tool that removes state it did not prompt for must prove it removes only what it owns, inside a path it may touch: ownership (`is_pnpm_owned_entry`) plus containment (canonicalized target strictly inside the workspace root), or it refuses. Anti-pattern code smell: a configuration key retained for a CLI major that is no longer pinned — dead config whose only remaining effect is the error it raises.

## Verification

Red before the repair, on the migrated tree (each reproduces the shipped symptom):

- `pnpm install --frozen-lockfile` with the env document absent from `pnpm-lock.yaml` → `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`.
- `deno run --allow-read scripts/guards/check-changeset.ts --selftest` → `live pin check: selftest: no 'turbo' devDependency in the root importer of pnpm-lock.yaml`; the live gate prints the same as an `::error::`.
- `discoverMutationTargets()` over the real lockfile → `pnpm-lock.yaml's importers: block named no workspace project besides the root.`

Green after: the guard selftest's mechanism rows (a two-document fixture whose main document carries the turbo entry, plus an env-only stream that must fail closed), `pnpm test:scripts`, the live gate verdict, and mutation discovery over the real lockfile.

Release planning is unaffected: `pnpm version -r --dry-run` reports identically under `11.21.0` and `12.6.0` on this workspace, so the pnpm-native release path did not change behavior in this bump.

## Reversing observation

Reversing means restoring the `11.21.0` pin, the single-document lockfile, and the readers' previous parse — the migration undone wholesale. No partial state is worth holding: the env document is written by the pinned CLI, so a lockfile carrying it does not survive a deliberate downgrade, and a lockfile without it fails the frozen install the gate runs.

## Related

- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` — the gate whose lockfile read had to learn the stream.
- `docs/solutions/runtime-errors/pnpm-versioning-unknown-package-deleted-intent.md` — the sibling failure class in the same release phase.
