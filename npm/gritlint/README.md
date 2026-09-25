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
   - `gritlint-publish` publishes the generated platform packages with OIDC
     trusted publishing and provenance;
   - the `publish` job injects the exact pins with `sync-version.ts --pins` and
     then publishes this launcher through the repository's existing OIDC step.
     The platform job is a precondition of that job, and the pins step refuses
     to run while `GRITLINT_PLATFORM_PUBLISH` is not `true`, so the launcher can
     never ship pins to platform packages that did not reach the registry.

Nothing in this repository publishes with a static npm token: every publish is
OIDC trusted publishing with provenance.

### First publish: the owner-only bootstrap

npm cannot create a package through OIDC trusted publishing and **CI cannot
debut a package**: the trusted-publisher record needs the name to exist first.
The six names this launcher needs, and what debuts each one:

| Name                        | Debut path                                                           |
| --------------------------- | -------------------------------------------------------------------- |
| `@systemfsoftware/gritlint` | `pnpm publish:unpublished` (the repository's own first-publish path) |
| the five platform packages  | the manual bootstrap below                                           |

The platform packages are generated at release time and are not workspace
members, so `pnpm publish:unpublished` cannot debut them. Bootstrap them once,
from a maintainer machine with `@systemfsoftware` publish rights, after this
package is on `main` and before the first release:

```sh
# Publish a placeholder per name. Every generated manifest carries
# publishConfig.provenance: true, and a laptop has no OIDC token to honour it,
# so each bootstrap publish must force provenance off. The placeholder version
# is a prerelease, which npm refuses to publish without an explicit dist-tag;
# `--tag bootstrap` also keeps `latest` free for the first real release.
DUMMY=0.0.0-dummy-npm

for SUFFIX in linux-x64 linux-arm64 darwin-x64 darwin-arm64 win32-x64; do
  STAGE="/tmp/gritlint-bootstrap-$SUFFIX"
  rm -rf "$STAGE" && mkdir -p "$STAGE"
  deno run --allow-read --allow-write scripts/tools/gritlint/generate-platform-manifest.ts \
    --suffix "$SUFFIX" --version "$DUMMY" --out "$STAGE"
  case "$SUFFIX" in
    win32-*) touch "$STAGE/gritlint.exe" ;;
    *) touch "$STAGE/gritlint" ;;
  esac
  (cd "$STAGE" && npm publish --access public --tag bootstrap --no-provenance)
done
```

If a publish still reports an OIDC attempt, force it off with
`NPM_CONFIG_PROVENANCE=false` for that command and retry.

Then bind one trusted publisher per name. The npm form takes the workflow
**filename only**, and it has no tag-pattern field: the workflow's `on:` filter
in this repository is a push to `main`, and the registry record is bound to this
repository and workflow file.

```sh
for PKG in \
  @systemfsoftware/gritlint \
  @systemfsoftware/gritlint-linux-x64 \
  @systemfsoftware/gritlint-linux-arm64 \
  @systemfsoftware/gritlint-darwin-x64 \
  @systemfsoftware/gritlint-darwin-arm64 \
  @systemfsoftware/gritlint-win32-x64; do
  npm trust github "$PKG" --file release.yml --repo systemfsoftware/systemfsoftware --allow-publish -y
  sleep 2
done
```

Finally set the repository variable that arms the platform publish — it is off
until the bootstrap is done, so no release can attempt to publish a platform
name that npm cannot yet accept. The launcher's own publish waits on it too:
the launcher ships exact pins to the platform packages, so publishing it while
the platform publish is unarmed would pin packages that resolve to nothing.

```sh
gh variable set GRITLINT_PLATFORM_PUBLISH --body true
```

Checklist:

- [ ] `npm -v` is at least 11.15.0, and the account has 2FA enabled.
- [ ] `@systemfsoftware/gritlint` is published (via `pnpm publish:unpublished`).
- [ ] All five placeholder publishes succeeded, each with `--no-provenance`.
- [ ] Six trusted-publisher records exist, each bound to
      `systemfsoftware/systemfsoftware` and workflow file `release.yml`.
- [ ] `GRITLINT_PLATFORM_PUBLISH` is set to `true` in repository variables.
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
