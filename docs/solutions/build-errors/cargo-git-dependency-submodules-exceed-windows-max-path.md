---
title: A cargo git dependency's submodules exceed Windows MAX_PATH and block every npm publish
date: 2026-09-26
category: build-errors
module: gritlint release
problem_type: build_error
component: ci-gate
symptoms:
  - "gritlint · build win32-x64 fails in `cargo build` with `path too long: 'C:/Users/runneradmin/.cargo/git/checkouts/gritql-…/resources/language-submodules/tree-sitter-hcl/example/…'; class=Filesystem (30)`"
  - "gritlint-publish and publish · oidc · tag are skipped, so nothing from the release PR reaches npm"
  - "every other platform lane and every PR check is green"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [cargo, libgit2, windows, max-path, core-longpaths, git-dependency, submodules, gritql, tree-sitter-hcl, release-gate]
---

# A cargo git dependency's submodules exceed Windows MAX_PATH and block every npm publish

## Problem

The `gritlint_core` crate pulls `grit-util` and `marzano-*` from `biomejs/gritql` as a git dependency. Cargo checks out every submodule of a git dependency, and gritql vendors its tree-sitter grammars as submodules. `tree-sitter-hcl` ships example files whose path under the runner's cargo git checkout directory (`C:/Users/runneradmin/.cargo/git/checkouts/<repo>-<hash>/<rev>/`) is longer than 260 characters. Cargo does that checkout through its bundled libgit2, which refuses such paths unless `core.longpaths` is true.

The Windows lane then fails, and the damage spreads well beyond gritlint. In the Release workflow, `gritlint-publish` needs `gritlint-build`, and `publish` requires `gritlint-publish` to succeed whenever gritlint is in the release set. One red platform lane skips the npm publish for every package in the release. Release run 36220138086 (release PR #533) failed this way.

## What Didn't Work

- `CARGO_NET_GIT_FETCH_WITH_CLI=true`, which the Linux rust gate already sets for speed, does not help. With it the fetch uses the git CLI, but cargo still checks out the tree and its submodules through libgit2 ([rust-lang/cargo#13020](https://github.com/rust-lang/cargo/issues/13020)).
- Registry `LongPathsEnabled=1` alone does not help either. Cargo's executable does not declare `longPathAware`, so libgit2 needs its own opt-in.

## Solution

Before `cargo build`, set the git option libgit2 reads, on Windows runners only:

```yaml
- name: Let libgit2 check out gritql's long grammar paths (Windows MAX_PATH)
  if: runner.os == 'Windows'
  run: git config --system core.longpaths true
```

This was verified on `windows-2022` with a throwaway branch workflow (run 36221651474). Without the step, `cargo fetch` failed with the `path too long … tree-sitter-hcl` error. With it, `cargo build --release -p gritlint` finished in 10m23s and the binary printed `gritlint 0.1.0`.

## Why This Works

libgit2 reads `core.longpaths` from system/global git config. When the option is set, it uses extended-length Windows paths for checkout. The GitHub-hosted runner runs as an administrator, so `--system` works, and the setting lives only as long as the ephemeral runner.

Two invariants follow:

- **Checkout depth is a dependency property, not a repo property.** Every git dependency brings its submodules' deepest paths into the build. The Windows budget is `len(cargo git checkout root) + len(deepest submodule path) <= 260`, and upstream controls that budget, not this repo. Any Windows lane that builds cargo git dependencies needs `core.longpaths` set, even though today only gritql exceeds the limit.
- **Each build lane is its own publish gate.** When a publish job requires every matrix lane to succeed, that job is only as reliable as the least-exercised lane. A lane that runs only after merge must be exercised before merge whenever its inputs change.

## Prevention

- The Release workflow runs only on pushes to `main`, so no PR check builds gritlint on Windows. A change that breaks only the Windows lane stays invisible until a release, and then it blocks every package. Before merging a new or bumped cargo git dependency, or an edit to the gritlint build lanes, run the win32 build on a branch. A throwaway `push`-triggered workflow on `windows-2022` is enough.
- When a Windows cargo build fails with `class=Filesystem (30)` under `.cargo/git/checkouts`, check `core.longpaths` first. Do not try shortening `CARGO_HOME` or fetching through the git CLI.

## Related Issues

- [rust-lang/cargo#13020](https://github.com/rust-lang/cargo/issues/13020): libgit2 path-too-long on `cargo install --git`; `core.longpaths` is the confirmed workaround.
- [aptos-labs/aptos-core#15840](https://github.com/aptos-labs/aptos-core/pull/15840): the same failure under `C:/Users/runneradmin/.cargo/git/checkouts` on GitHub Actions.
- `docs/solutions/build-errors/pack-lifecycle-hooks-mutate-dist-mid-gate.md` describes a different job in the same Release workflow.
