# AGENTS.md — `@systemfsoftware/rightsize`

> **Delta**: A forked-owned, complete Effect-TS rebuild of rightsize-node
> (behavioral source, Apache-2.0 — see `NOTICE`), owned outright under
> REPO-O1: rightsize-node's observable semantics are the spec wherever the
> port plan does not replace them, but its internal structure is _not_ the
> blueprint and nothing here defers to it. The authoritative design document
> is `docs/plans/2026-08-16-001-feat-rightsize-effect-port-plan.md`. Root
> `AGENTS.md` governs.

## Commands

From the repo root only (never `cd` into the package, never `npx`):

```bash
pnpm --filter @systemfsoftware/rightsize typecheck
pnpm --filter @systemfsoftware/rightsize test:types
pnpm --filter @systemfsoftware/rightsize test
pnpm --filter @systemfsoftware/rightsize lint
pnpm --filter @systemfsoftware/rightsize build
pnpm --filter @systemfsoftware/rightsize api:check
pnpm --filter @systemfsoftware/rightsize attw
pnpm --filter @systemfsoftware/rightsize parity:check
```

Do not run repo-wide suites from this package's work; run only this package's
own scripts.

## What makes this package different

```yaml
rules:
  - id: RS-LANE
    title: The parity lane is a named, pinned, never-silent gate
    do:
      - name the container parity lane script `test:contract` (turbo tasks are
        script-name-keyed — a differently named script silently never runs),
        pin it to `layerDocker` so backend choice is deterministic in CI, and
        fail with a named error when no runtime answers the discovery probe
      - keep microsandbox runtime cases behind the `RIGHTSIZE_MSB_IT` gate until
        a KVM-capable runner exists (none exists in this repo's CI today)
    dont: let the parity lane skip silently on a missing runtime, let a lane
      script name drift from `test:contract`, or run `test:contract` from
      `check:local` (the local gate stays container-free by design)
    harm: turbo and the root gate chain select tasks by script name, so an
      inventively-named lane is green because it never runs, and a lane that
      reports "skipped" instead of failing hides the exact runtime regression
      it exists to catch
    check: "review — the lane script is `test:contract`, its layer pin and gate
      env vars are stated in the script, and `check:local` excludes it"

  - id: RS-MUT
    title: No agent starts a mutation run; stryker.config.json owns scoping
    do: let the package's `stryker.config.json` own which files mutate and how;
      record the mutation posture of the whole workspace here as REPO-D3
    dont: start a `stryker` run from an agent session, delete a test to opt out
      of a mutant, or scope by filename suffix
    harm: a mutation run starves every core and minutes-to-hours of the machine
      (REPO-D3's record); and a scoping rule keyed on a filename suffix never
      fires on the violation it exists to catch — mutation scoping is a config
      decision, not a naming convention
    check: "review — no agent command in this leaf or in this package's docs
      starts a mutation run; the package's `stryker.config.json` (arriving
      with the mutation-ready units) is the only scoping instrument"

  - id: RS-BOUNDARY
    title: The Workflow.make boundary is the sandwich, names are convention
    do: |
      author the package's decisions through the repo's architecture boundary —
      read impure at the edge, decide pure inside `Workflow.make` (the
      brand-checked constructor from `@systemfsoftware/effect-cell-types`),
      write impure on the returned decision. Decisions that upstream made by
      throwing in constructors or in `start()` pre-I/O guards travel as typed
      validation inside the launch workflow, before any I/O
    dont: put I/O inside a `Workflow.make` body; mint a second projection of a
      port (REPO-A3); or treat `*.kernel.ts` / `*.workflow.ts` suffixes as a
      rule key — the suffix is convention, the *make* boundary is doctrine
    harm: a decision with an I/O edge is not a decision, and a rule keyed on a
      filename never fires when the violation lands in a differently-named file
    check: "«decision cells hold no import/export/process edge — the pnpm root
      policy and review both verify impure calls stay outside `Workflow.make`"

  - id: RS-SURFACE
    title: The surface is a carrier; exports stay partitioned and internals sealed
    do: |
      grow the public API behind the four committed subpaths — `.`,
      `./modules`, `./backend-docker`, `./backend-msb` (each with the
      `@systemfsoftware/source` dev condition) plus `./package.json`; keep every
      consumer's tooling-facing edit pushing the export count only where a real
      feature lands; a sealed `internal/*` tree keeps wiring unexported
    dont: never merge the four entries into one mega-barrel to "simplify", and
      never hand-edit `package.json#exports` or `publishConfig.exports` — change
      `tsdown.config.ts` (REPO-S4) and the four api-extractor rollup configs in
      lockstep
    harm: parity breadth tempted into one barrel makes every consumer pay the
      full export count at every writing act, and a hand-edited exports map
      silently drifts from the four api-extractor rollup configs while
      `check:exports` stays green because the drift lives in the manifests
    check: "`pnpm check:exports` passes and the tsdown entry map, the
      api-extractor rollup map and `package.json#exports` name the same four
      subpaths"
```

After each phase of the port, re-read the plan and update this leaf — it is
the package's standing instruction set and the plan is its authority.
