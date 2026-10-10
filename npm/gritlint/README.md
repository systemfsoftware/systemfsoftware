# @systemfsoftware/gritlint

The npm launcher for `gritlint`, the Rust CLI that evaluates GritQL rule packs
over a repository's config files.

## Install

```sh
npm i -D @systemfsoftware/gritlint
npx gritlint --help
```

The launcher ships no binary of its own. The matching platform package
(`@systemfsoftware/gritlint-linux-x64`, `-linux-arm64`, `-win32-x64`) is an
`optionalDependency` pinned to the same exact version, so npm installs the
right binary for the host and the launcher executes it with the arguments it
was given, propagating the exit code.

There is **no postinstall step**: nothing is downloaded or compiled at install
time. Installation flags that drop optional dependencies (`--no-optional`,
`--ignore-scripts`) leave the launcher without a binary, and it then reports the
missing platform package by name instead of failing silently.

The committed manifest deliberately carries **no `optionalDependencies`**: a
committed pin on a package that does not exist yet breaks `pnpm install` for
everyone in the workspace (pnpm#3960). `scripts/tools/gritlint/sync-version.ts
--pins` injects the three exact pins into the manifest of the publish checkout
only; they exist on npm, never in the repository.

`configuration_schema.json` in this package is the JSON Schema for
`gritlint.json`, generated from the CLI's config types.

## Findings and exit codes

`gritlint check` exits `0` when it reports nothing, `1` when it reports at least
one finding, and `2` only when the run itself is refused — a config it cannot
read or parse, an unknown pack, a rule that does not compile, or a scan root
that selects no files. A target module the engine cannot parse is a finding, not
a refusal:

| reason code | meaning |
| --- | --- |
| `gritlint/unparseable-module` | the engine left the module with error nodes. The finding names the file, and its message carries the position as `unparseable module at <line>:<column>: ...`. |

Every finding, that one included, is reported in `--format json` under
`findings` with `rule`, `path`, `line` and `message`.

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
3. On merge, `.github/workflows/release.yml` writes a `<pkg>@vX.Y.Z` git tag for
   each unreleased workspace version and cuts its GitHub Release from the
   authored changelog. There is no npm publish step: the suite is distributed as
   this repository's Nix flake outputs, consumed from a git ref (pinned by
   `flake.lock` rev + narHash, bwrap-sandboxed), so `gritlint` is the flake-built
   Rust CLI (`bin/gritlint`) rather than an npm download.

Nothing in this repository publishes to an npm registry: there is no npm token,
no OIDC trusted publishing, and no trusted-publisher bootstrap.
