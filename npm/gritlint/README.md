# @systemfsoftware/gritlint

The npm launcher for `gritlint`, the Rust CLI that evaluates GritQL rule packs
over a repository's config files.

## Install

```sh
npm i -D @systemfsoftware/gritlint
npx gritlint --help
```

The launcher ships no binary of its own. The matching platform package
(`@systemfsoftware/gritlint-linux-x64`, `-linux-arm64`, `-darwin-x64`,
`-darwin-arm64`, `-win32-x64`) is an `optionalDependency` pinned to the same
exact version, so npm installs the right binary for the host and the launcher
executes it with the arguments it was given, propagating the exit code.

There is **no postinstall step**: nothing is downloaded or compiled at install
time. Installation flags that drop optional dependencies (`--no-optional`,
`--ignore-scripts`) leave the launcher without a binary, and it then reports the
missing platform package by name instead of failing silently.

The committed manifest deliberately carries **no `optionalDependencies`**: a
committed pin on a package that does not exist yet breaks `pnpm install` for
everyone in the workspace (pnpm#3960). `scripts/tools/gritlint/sync-version.ts
--pins` injects the five exact pins into the manifest of the publish checkout
only; they exist on npm, never in the repository.

`configuration_schema.json` in this package is the JSON Schema for
`gritlint.json`, generated from the CLI's config types.

## Releasing

This launcher rides the repository's release pipeline; it is not released on its
own. One version applies to the Rust crates, this launcher and the generated
platform packages, and **the launcher's version is the source of that version**.

1. Land a change intent for `@systemfsoftware/gritlint` (`pnpm change --bump
   minor --summary "..."`) — the launcher is a workspace package like any
   other, so `scripts/tools/plan-release.ts` plans its release with the rest of
   the set.
2. The release phase opens the Release PR; `pnpm version -r` bumps this
   manifest, and `scripts/tools/gritlint/sync-version.ts --cargo` writes the
   same version into `[workspace.package] version` in the root `Cargo.toml`, so
   the crates and the launcher move together in one reviewed commit.
3. On merge, `.github/workflows/release.yml` runs the gritlint jobs only when
   the captured release set names `@systemfsoftware/gritlint`:
   - `gritlint-set` runs the launcher's behaviour test
     (`deno task --config npm/gritlint/deno.jsonc test`) and gates
     `scripts/tools/gritlint/check-matrix.ts` over
     `scripts/tools/gritlint/targets.json` and the workflow's matrix;
   - `gritlint-build` builds `cargo build --release -p gritlint` on each
     native runner from that one table, generates the platform manifest from it
     and packs the tarball;
   - `gritlint-publish` fails the release while any of the six gritlint npm
     names is missing from the registry
     (`scripts/tools/gritlint/bootstrap-npm.ts --check`), then publishes the
     generated platform packages with OIDC trusted publishing and provenance;
   - the `publish` job injects the exact pins with `sync-version.ts --pins` and
     then publishes this launcher through the repository's existing OIDC step.
     The platform job is a precondition of that job, so the launcher can never
     ship pins to platform packages that did not reach the registry.

Nothing in this repository publishes with a static npm token: every publish is
OIDC trusted publishing with provenance.

### First publish: the owner-only bootstrap

npm cannot create a package through OIDC trusted publishing: a trusted publisher
binds only to a name that already exists, so **CI cannot debut any of the six
names** this launcher ships under (the launcher and one platform package per
`scripts/tools/gritlint/targets.json` row). Until all six exist, the release
fails at the `gritlint-publish` gate.

`pnpm publish:unpublished` does not debut the launcher. A launcher version
published from a laptop carries no platform pins, because the release injects
them, so every install of it would find no binary. The platform packages are
not workspace members at all.

Bootstrap all six once, from a maintainer machine with `@systemfsoftware`
publish rights, after this package is on `main` and before the first release:

```sh
./scripts/tools/gritlint/bootstrap-npm.ts --dry-run   # stage and print, publish nothing
./scripts/tools/gritlint/bootstrap-npm.ts
```

For each name npm answers 404 for, it publishes a placeholder at
`0.0.0-dummy-npm` under the `bootstrap` dist-tag, without provenance (a laptop
has no OIDC token), then runs `npm trust github <name> --repo
systemfsoftware/systemfsoftware --file release.yml --allow-publish
--allow-stage-publish`. The launcher placeholder carries the real launcher
files, so running it reports a missing platform package instead of failing
silently. A re-run skips every name that exists. If a publish succeeds and its
trust step fails, the script prints that one `npm trust` command to run by hand.

Checklist:

- [ ] `npm -v` is at least 11.15.0, and the account has 2FA enabled.
- [ ] `./scripts/tools/gritlint/bootstrap-npm.ts --check` exits 0.
- [ ] `npm trust list <name>` shows a record bound to
      `systemfsoftware/systemfsoftware` and `release.yml` for all six names.
- [ ] The repository's default workflow permissions are read-only; release jobs
      grant only what they need.
- [ ] No npm token secret exists in any workflow.
- [ ] After the first real release: `npm view @systemfsoftware/gritlint@X.Y.Z
      optionalDependencies` shows all five pins at exactly `X.Y.Z`, each
      platform package reports the `os`/`cpu`/`libc` from
      `scripts/tools/gritlint/targets.json`, and provenance is visible on
      npmjs.com.
- [ ] `npm deprecate` the `0.0.0-dummy-npm` placeholders once the real version
      is latest. Never `npm unpublish` a placeholder: it carries the trusted
      publisher record and the name itself.
