---
title: tsgo LSP linter wired into the lint pipeline — plugin name, extends activation, and the turbo passthrough trap
module: repo-root
component: packages/tsconfig/effect.json, packages/effect-atom/atom, packages/effect-atom/atom-react, packages/storybook-gherkin, package.json
tags: [lint, tsgo, effect-language-service, diagnostics, turbo, lsp]
problem_type: tooling-decisions
track: knowledge
applies_when:
  symptoms:
    - `effect-tsgo diagnostics --project tsconfig.json` reports "Checked 0 files" for a project whose tsconfig lists the Effect plugin
    - Someone chains `effect-tsgo diagnostics` into a package `lint` script with `&&`
    - A package wants the Constitution-derived Effect diagnostics policy from `packages/tsconfig/effect.json`
  root_cause: the Effect LSP plugin is matched by the exact name `@effect/language-service`; and turbo's `--format=github` passthrough is appended to every task in a lint:ci invocation
  resolution_type: integration-pattern
---

# tsgo LSP linter in the lint pipeline

The Effect Language Service (`@effect/tsgo`, binary `effect-tsgo`) is wired into the repo's
lint pipeline as a complement to oxlint. Three durable facts make or break that wiring.

## 1. The plugin name is exact: `@effect/language-service`

The Go binary matches only `EffectPluginName = "@effect/language-service"` in the tsconfig
`plugins` array (`/tmp/tsgo-src/etscore/consts.go`). A plugin entry named `@effect/tsgo` is
silently ignored — the diagnostics CLI then reports `Checked 0 files out of N files` and
`tsc`-mode emits nothing. There is no error message; the integration is simply dead.

## 2. The plugin activates through extends, including arrays

`ParseFromPlugins` reads the resolved tsconfig, so the plugin inherited through an
`extends` chain activates (upstream fixed multi-hop inheritance in 1a562ee). The repo's
policy therefore lives in one place — `packages/tsconfig/effect.json`, which lists every
diagnostic explicitly per A.2 — and packages opt in by extending it:

```json
"extends": [
  "@systemfsoftware/tsconfig/tsc/dom/library-monorepo",
  "@systemfsoftware/tsconfig/effect"
]
```

`compilerOptions.plugins` from the later entry replaces (arrays are not merged); the base
carries no plugins, so the policy's plugin wins.

`Checked N files out of M files`: when the tsconfig has `references` (e.g.
`tsconfig.node.json`), the referenced project's files are in the program but carry no
Effect plugin, so they are not counted as checked. That is normal, not a gap.

## 3. The turbo passthrough trap: tsgo is its own task

`lint:ci` runs `turbo ... lint -- --format=github`. Turbo appends passthrough args to the
tail of the script — so chaining `oxlint . && effect-tsgo diagnostics ...` into `lint`
produces `... diagnostics ... --format=github`, and tsgo hard-errors on the value
(`Expected: "json" | "pretty" | "text" | "github-actions"`). The CI format for tsgo is
`github-actions`, not `github`. Hence the integration is a dedicated per-package task
`lint:tsgo` (format selected by `TSGO_FORMAT`, defaulting to `text`), invoked separately
in `lint:ci` under `TSGO_FORMAT=github-actions` and added to the `check:ci` task list.

A new task must also be declared in `turbo.json`'s `tasks` map — turbo 2.x refuses to
build the graph for an undeclared task (`Could not find task \`lint:tsgo\` in project`),
even though the scripts exist in packages. No root wrapper script is needed; the
declaration alone makes per-package runs resolve.

## Exit code contract

`effect-tsgo diagnostics` exits 1 iff any error-severity diagnostic is reported (or any
warning under `--strict`). The policy sets rules to `error` or explicit `off` — no
warning resting states (see `rule-admission-severity-and-accretion.md`). `tsc`-mode emits
the same diagnostics as TS377xxx errors and, with the default
`ignoreEffectErrorsInTscExitCode: false`, turns the package `typecheck` red on opted-in
packages — the same tolerated signal as the red `lint:tsgo` step.

## References

- `packages/tsconfig/effect.json` — the explicit diagnostic severity policy
- `packages/effect-atom/atom/tsconfig.json`, `packages/storybook-gherkin/tsconfig.json` — opt-in via extends
- `package.json` — `lint:tsgo` in `check:ci` and `lint:ci`
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — severity doctrine behind the policy
