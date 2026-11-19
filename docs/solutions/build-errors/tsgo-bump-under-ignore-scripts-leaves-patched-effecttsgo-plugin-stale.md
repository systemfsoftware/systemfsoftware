---
title: A tsgo bump under --ignore-scripts leaves the patched effecttsgo plugin stale
category: build-errors
module: oxlint tsgo plugin delivery
date: 2026-11-19
problem_type: logic_error
component: lint_plugin_delivery
severity: medium
symptoms:
  - "after bumping @effect/tsgo and reinstalling, every package lint fails with Rule '<name>' not found in plugin 'effecttsgo'"
  - "the missing rules are ones the new @effect/tsgo oxlint-presets enable; the same tree linted green before the bump"
  - "re-running pnpm install does not clear the failure"
root_cause: stale_patched_plugin
resolution_type: command_and_pairing_change
framework_version: "@effect/tsgo 0.70.0, oxlint-tsgolint 7.0.2007"
retire_when: "effect-tsgo patch is replaced by a dependency-resolved plugin delivery (e.g. a plain node resolution with a version check), or installs stop using --ignore-scripts with prepare carrying the patch"
tags:
  - oxlint
  - effect-tsgo
  - tsgolint
  - prepare-script
  - ignore-scripts
  - silent-gate
---

# A tsgo Bump Under `--ignore-scripts` Leaves The Patched `effecttsgo` Plugin Stale

## Problem and context

The `effecttsgo` oxlint plugin is not resolved from `node_modules` like a normal
dependency. `effect-tsgo patch --oxlint` rewrites the oxlint native binding, the
`oxlint-dts` types, and the `oxlint-tsgolint` binary in place inside
`node_modules/.pnpm`. That patch is wired into the root `prepare` script, and
the repository's mandated install (`worktrunk` `installArgs:
["--ignore-scripts"]`, and every CI/vendor install that skips scripts) never
runs it.

The package manifests resolve `@effect/tsgo` and `oxlint-tsgolint` through the
catalog, so a bump installs the new packages immediately. But the rule set
oxlint actually loads comes from the _patched_ binaries, which still carry the
previous tsgo/tsgolint build. The preset JSON, by contrast, is read fresh from
the new `@effect/tsgo/oxlint-presets`. When the new presets enable a rule the
old patched plugin does not know — at 0.70.0,
`effecttsgo/for-loop-push-to-for-each` and
`effecttsgo/flat-map-provide-service-to-provide-service-effect` — oxlint fails
closed at config time:

```
x Rule 'flat-map-provide-service-to-provide-service-effect' not found in plugin 'effecttsgo'
```

Every package whose config extends the recommended preset fails its `lint`
task; the failure appears nowhere near the cause, because `pnpm install`
exits 0 and only `turbo run lint` surfaces it.

## Diagnosis

1. Reproduce on one package: `pnpm --filter @systemfsoftware/effect-cell-types
   lint` prints the not-found rule names.
2. Check which component owns the rule names: `grep -rl <rule>
   node_modules/@effect/tsgo/oxlint-presets` — the _new_ presets carry them.
3. Check whether the installed plugin knows them: the rule strings are absent
   from the patched `tsgolint` binary. The plugin is one release behind the
   presets.
4. Confirm the patch did not run: `pnpm why @effect/tsgo` shows the new
   version installed while the patch script only ran at the previous version's
   install.

## Fix

Re-apply the patch after any `@effect/tsgo` (or `oxlint-tsgolint`) bump:

```bash
pnpm exec effect-tsgo patch --oxlint --no-typescript --skip-missing
```

Then re-run `turbo run lint lint:tsgo`. If rules are _still_ not found after
the patch, the new presets require rules shipped in a newer `oxlint-tsgolint`
than the catalog pins — bump `catalogs.oxlint.oxlint-tsgolint` to the release
that carries the rules (0.70.0 presets need 7.0.2007; the version pairing is
what `effect-tsgo patch` validates when it prints its acceptance message) and
patch again.

## Why not fixed differently

Running `prepare` unconditionally is the upstream default, but this repository
installs with `--ignore-scripts` on purpose (other `prepare` hooks have
mutated `dist` mid-gate and backed up gigabytes of compiler binaries; see
`pack-lifecycle-hooks-mutate-dist-mid-gate.md` and the guard in
`scripts/tools/patch-tsgo-if-needed.mjs`). Re-enabling scripts to fix one
stale plugin would re-open those failures. The cheapest durable form is this
record plus re-patching as a named step of every Effect-line bump, which the
bump's own verification (`turbo run lint`) already forces to happen before
push.
