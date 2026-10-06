# @systemfsoftware/gritlint

The version carrier for `gritlint`, the Rust CLI that evaluates GritQL rule
packs over a repository's config files.

This directory is not an npm package: it is `private`, ships no binary and is
never published. It holds two things.

- `package.json` — the single version source for the Rust crates. Each release
  bumps it like any other workspace package, and
  `scripts/tools/gritlint/sync-version.ts --cargo` writes that version into
  `[workspace.package]` in the root `Cargo.toml`.
- `configuration_schema.json` — the JSON Schema for `gritlint.json`, generated
  from the CLI's config types. `gritlint.json` points at it with `$schema`, and
  `scripts/tools/gate-rust.sh` fails when the committed schema drifts from the
  types.

## Install

gritlint ships only as the flake package:

```sh
nix build github:systemfsoftware/systemfsoftware#gritlint
```

Inside this repository, `./bin/gritlint` wraps that flake package.
