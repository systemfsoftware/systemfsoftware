---
title: PATH mediation splits a guard's asserted binary from the one it executes
date: 2026-08-16
category: security-issues
module: scripts/guards/check-changeset.ts
problem_type: security_issue
component: tooling
severity: high
symptoms:
  - "The changeset gate lstat'd the lockfile-installed shim at node_modules/.bin/turbo and checked node_modules/turbo/package.json against the pnpm-lock.yaml pin — but spawned the binary by the bare name 'turbo' resolved through PATH"
  - "A different turbo earlier on PATH (a global install, an unrelated tool named turbo, a planted shim) would execute and compute the gate's verdict while every assertion stayed green"
  - "The --allow-run grant named a basename while the verified object was an absolute path, so the permission boundary and the identity checks described two different objects"
  - "Absolute-path spawn under a basename grant fails closed: Deno refuses with 'Requires run access to <abs path>' (observed during fix verification)"
root_cause: missing_validation
resolution_type: code_fix
tags: [deno, allow-run, path-resolution, guard-script, binary-pinning, ci]
---

# PATH mediation splits a guard's asserted binary from the one it executes

## Problem

The changeset gate — a Deno CI evaluator that decides whether a PR needs a
`.changeset/` intent by comparing per-package turbo `build`-task hashes between
the PR's pinned base SHA and its head — verified its engine's identity two ways
(shim lstat, lockfile pin vs installed manifest) but spawned the engine by bare
name through `PATH`. The executable that actually computed the verdict was
whatever `PATH` resolved, so a different turbo earlier on `PATH` would execute
while every identity assertion stayed green: a merge-blocking decision made by
an engine the gate never checked.

## Symptoms

- The gate lstat'd `$PWD/node_modules/.bin/turbo` and pinned its version
  against `pnpm-lock.yaml`, but the spawn was `new Deno.Command('turbo', ...)`.
- The workflow made the bare name land on the shim by prepending
  `node_modules/.bin` to `PATH` and granting `--allow-run=turbo` — ambient
  mutable state standing in for an identity the script already knew.
- The gap surfaced in adversarial review (validator-confirmed) as "PATH
  mediation splits asserted from executed".
- After the fix, an absolute spawn under a basename grant fails loudly:
  `Requires run access to "<abs path>"` — the denial is the mechanism.

## What Didn't Work

- **PATH prepending.** `PATH="$PWD/node_modules/.bin:$PATH" deno run
  --allow-run=git,turbo ...` makes the bare name land right only when nothing
  else shadows it. `PATH` is external state the script never inspects; the
  assertion stack stayed green while the launched object stayed undecided.
- **Basename grants.** `--allow-run=turbo` authorizes a name, not an object:
  it neither prevents a PATH-preceding binary from running (bare spawn) nor
  covers the absolute spawn the fix wants (refused).

## Solution

One constant names one filesystem object; grant, lstat, and spawn all use it,
and the fix adds a third identity check — the engine's own dry-run
`turboVersion` self-report must equal the pin — so the executed object is now
verified from inside its own output too (fix on branch
`changeset-harness-fixes`, PR unmerged as of this writing):

```ts
const TURBO = `${Deno.cwd()}/node_modules/.bin/turbo`

const dryRun = async (cwd: string, pinnedVersion: string): Promise<DryRun> => {
  await Deno.lstat(TURBO)                       // asserted object
  const out = await new Deno.Command(TURBO, {   // executed object — the same one
    args: ['run', 'build', '--dry=json'],
    cwd,
    ...
  }).output()
  if (!engineSelfReportMatches(run, pinnedVersion)) throw new Error(...)
}
```

```yaml
# .github/workflows/changeset-check.yml — the grant is the exact path
- run: >-
    deno run --allow-run=git,"$PWD/node_modules/.bin/turbo" --allow-read --allow-write=/tmp
    scripts/guards/check-changeset.ts ${{ github.event.pull_request.base.sha }}
```

Verified live during the fix: absolute spawn + absolute grant runs green;
absolute spawn + basename grant fails closed with Deno's
`Requires run access to "<abs path>"`.

## Why This Works

Deno's `--allow-run` check operates on the resolved executable path. Granting
the exact shim path and spawning that exact path makes the permission boundary,
the lstat, the lockfile-pin recomputation, and the launched process all name
one filesystem object — there is no resolution step left for `PATH` to decide,
and any drift (a moved shim, a renamed grant) fails loudly instead of silently
substituting. A gate that verifies A but executes B certifies nothing; the fix
removes the A/B split rather than adding a fourth assertion about `PATH`.

## Prevention

- In any guard or hook that verifies a binary before spawning it (lstat,
  version pin, checksum, self-report), spawn the exact verified path — never a
  bare name that re-enters `PATH` resolution at spawn time.
- In Deno scripts whose authorization story is "the grant is the sandbox",
  grant the absolute binary path in `--allow-run`; a basename grant plus a
  bare spawn is a permission hole, and a basename grant plus an absolute spawn
  is a spurious failure.
- Treat `PATH` prepending in CI as a smell: it makes bare names land right by
  ambient order the script's own assertions cannot see.
- Red-test the boundary once: run the script with a deliberately mismatched
  grant and require the loud `Requires run access` denial (this session's
  probe), so the fail-closed behavior is observed, not assumed.

## Related Issues

- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`
  — the same gate's release-predicate design (what the gate keys on); this doc
  covers how its engine is executed. Moderate overlap on the executor-pinning
  doctrine, distinct root cause and fix.
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — the
  scripts/guards population this generalization applies to.
