# consumer

A pnpm workspace on systemfsoftware's toolchain: the shared tsconfig, vitest and
oxlint presets, Stryker mutation testing, changesets, and CI through
systemfsoftware's reusable workflows.

## Start

Run in an empty directory: `nix flake init` refuses to overwrite an existing file
and reports it as a conflict.

```
nix flake init -t github:systemfsoftware/systemfsoftware
nix build .#sfs-deps && mkdir -p .sfs-deps && cp -L result/* .sfs-deps/
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm -r test
```

`packages/slug` is a placeholder. Replace it with your first package: rename the
directory and its `name` in `package.json`, then run `pnpm install`. It is
`private`; to publish a package, drop `private` and add `repository` and
`publishConfig`.

## Dependencies

Every `@systemfsoftware/*` package this repository's flake input builds is
installed from its tarball in `.sfs-deps/` (`pnpm-workspace.yaml` `overrides`),
not from npm. CI restores those tarballs through the reusable workflows'
`sfs-deps-installable` input (default `.#sfs-deps`). `nix flake check` installs
the workspace offline from them and runs typecheck, lint and test.

## The pin

Six places name one systemfsoftware commit: the four callers in
`.github/workflows/`, the packs `ref` in `.compound-engineering/config.yaml`, and
the `systemfsoftware` input's `rev` in `flake.lock`. Move all six in one commit,
then regenerate the lockfile against the new tarballs:

```
nix flake lock --override-input systemfsoftware github:systemfsoftware/systemfsoftware/<sha>
nix build .#sfs-deps && rm -rf .sfs-deps && mkdir .sfs-deps && cp -L result/* .sfs-deps/
nix develop -c pnpm install
```

## Changes

Record a change intent with `pnpm change` (see `.changeset/README.md`).
