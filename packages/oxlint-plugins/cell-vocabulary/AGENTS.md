# AGENTS.md — `@systemfsoftware/oxlint-plugin-cell-vocabulary`

> **Delta**: a plugin whose rule vocabulary is walked off a Cell description at load, not declared
> here, and which is not keyed to a cell. Shared rule-authoring conventions:
> `packages/oxlint-plugins/AGENTS.md`. Root AGENTS.md governs.

## What makes this package different

```yaml
rules:
  - id: CELL-V1
    title: The vocabulary is read off the value, never written down here
    do:
      - bind the pure-phase set, the description module name and the I/O-cell classification as
        module-load projections of `Cell.vocabulary`, and route every vocabulary-dependent decision
        through those bindings
      - keep the dependency edge exactly
        `@systemfsoftware/oxlint-plugin-cell-vocabulary -> @systemfsoftware/effect-cell-types`
    dont: restate a phase name, kind, intra-layer order, module name or I/O cell as a literal
      anywhere in `src/`, fixtures included — the fixtures interpolate axis values from the same
      walk on purpose, including the last entry on each axis
    harm: a rule holding its own copy keeps judging the old set after a phase is added or a cell
      reclassified, and the stale copy reports on code the description now sanctions
    check: "`grep -nE \"'(read|decode|decide|encode|write|pure|impure|store|adapter)'\" src/`
      returns nothing but `DESCRIPTION_NAMESPACE`"

  - id: CELL-V2
    title: An empty walk throws at load; it never becomes a permissive rule
    do: keep the load-time guard in `no-io-in-phase-bodies.config.ts` that refuses to construct the
      rule when the walked pure set is empty
    dont: replace it with a default, a `??`, or an early `return` that lets the rule load with
      nothing to decide
    harm: every predicate here is set membership, so an empty set matches no call — the rule stays
      registered at error and reports on no file, which is protection in the config and silence in
      the run
    check: review — emptying the walked pure partition makes `pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test` exit 1 with `the walked vocabulary reports no pure phase`
  - id: CELL-V3
    title: The message states the predicate's exact reach
    do: say "module-level helper" — helpers are collected from the top level of the file, an
      exported one included, and a body handed over by name resolves through that same collection
    dont: claim a closure-captured binding is followed, or that a never-invoked nested closure is
      "reached"
    harm: a message promising more than its predicate decides reads as a checked guarantee, and the
      first violation it cannot see passes while the wording says it was inspected
    check: review — each clause of `IO_IN_PHASE_BODY_EXPECTED` names a shape a fixture exercises

  - id: CELL-V4
    title: OX-OB1 does not apply — this plugin is not keyed to a cell
    do: leave the obligation rule to the cell plugins; this package judges phase bodies wherever
      they appear, and a file that declares no description is correctly silent here
    dont: add a rule that fails a file for lacking a description in order to satisfy OX-OB1 —
      `effect-executor/executor-requires-description` already owns that obligation, keyed to the
      cell that has it
    harm: an obligation rule here would fire on every file in every delivered package that does not
      build a description, which is nearly all of them
    check: review — `configs.recommended` registers prohibitions only, and the obligation for
      executors lives in `effect-executor`
```

## Delivery

Delivered **consumer-side** through each consuming package's own `jsPlugins`, never through
`@systemfsoftware/oxlint-config`. The aggregate declares every plugin as a real dependency, so an
aggregate that declared this one would close the turbo cycle `effect-executor -> effect-cell-types
-> oxlint-config -> effect-dmmf -> effect-executor` — measured 2026-08-15 with `pnpm turbo build
--dry=json`: `effect-executor#build` depends on `effect-cell-types#build`, which dev-depends on
`oxlint-config#build` directly, which depends on `effect-dmmf#build`; the aggregate adds the closing
`effect-dmmf -> effect-executor` edge. The longer lane through `effect-gherkin-spec` also exists —
`effect-cell-types` dev-depends on `effect-gherkin-spec`, which dev-depends on `oxlint-config` —
and sits in the same cycle, but the direct edge is the minimal one. `scripts/guards/check-lint-coverage.mjs`
classifies this package accordingly.

The sibling rule `effect-executor/executor-no-io-in-filling` walks the same `Cell.vocabulary` directly and is delivered consumer-side for the same reason (OX-DL1); neither restates.

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary test
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary lint
pnpm --filter @systemfsoftware/oxlint-plugin-cell-vocabulary api:check
```

The mutation gate is the Mutation workflow's report for this package; no agent starts a run (root `AGENTS.md` REPO-D3).
