---
problem_type: build_error
---

# Stryker Ships Only As Its Flake Package

## Symptom

Any change that re-resolved the pnpm catalogs (a catalog edit, a lockfile regeneration) moved the
`stryker:` catalog's `latest` entries from `@systemfsoftware/stryker-js` 17.0.2 to 22.0.0. Then:

- `pnpm --filter @systemfsoftware/trace-spec run mutation` failed with `sh: 1: stryker: not found`, so
  the static lane's "stryker refuses a mutation run outside CI" step saw no `refused` event;
- `scripts/tools/mutation-probe.contract.test.ts` failed: the lockfile resolved 22.0.0, the import map
  pinned 17.0.2.

## Cause

From stryker-js-effect #384 on, Stryker is one flake package (`github:systemfsoftware/stryker-js-effect#stryker`):
`bin/stryker`, plus a `lib/node_modules` tree with the CLI and its plugins. Its npm release declares no
`bin`, because a package with a `bin` linked from the read-only store fails pnpm's install with
`ERR_PNPM_CMD_SHIM_CHMOD`. A registry install of 22.0.0 gives the library and no CLI. The workspace kept
running only while its lockfile still held 17.0.2.

## Fix

The workspace takes Stryker from the flake, the way `reusable-mutation.yml` already did for consumers:

- `flake.nix` has the `stryker-js-effect` input, tracking main, and re-exports `packages.stryker`. The
  dev shell puts it on PATH, and its shellHook links the tree's `lib/node_modules` at `.stryker`. CI
  lanes do the same through `.github/actions/stryker-from-flake`.
- The packages that type their Stryker configs install `@systemfsoftware/stryker-js` as
  `link:<root>/.stryker/@systemfsoftware/stryker-js`. Configs name plugins by bare name, which resolves
  beside the CLI, so the catalog keeps no Stryker package.
- `scripts/deno.jsonc` pins the stryker-js, cli-contract, effect and platform-node versions the tree
  holds, and overrides effect to the tree's version, so the contract and the scripts share one effect
  instance. The contract test fails when a pin differs from the tree.

Measured: `pnpm install --frozen-lockfile` succeeds in a clone without `.stryker`, which leaves a
dangling link. The pnpm store, `test-timings`, and the stryker-config, trace-spec and differential-spec
tarballs build from a clean clone.

## Learned

- When a producer stops publishing a binary, every consumer that resolves it at `latest` breaks on its
  next re-resolution, not when the producer releases. Look for `latest` specifiers on packages whose
  delivery changed.
- Stryker 22 writes plan format version 2 (with a `scope`). Fixtures that encode a plan with the
  contract's `ShardPlan` move with it.
- Deno applies its own minimum dependency age. A same-day release of our own package needs
  `deno cache --min-dep-age=0` once to enter `deno.lock`; `--frozen` runs then read the lock.
