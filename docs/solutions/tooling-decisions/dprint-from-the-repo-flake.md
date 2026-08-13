---
title: dprint comes from the repo's nix flake, not npm
date: "2026-08-13"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Changing or bumping the dprint formatter version
  - Adding a native-binary tool to the check chain
  - Reviewing the third-party action allowlist
root_cause: blocked_postinstall_supply_chain_policy
resolution_type: vendor_from_release_archive
related_components:
  - flake.nix
  - nix/dprint.nix
  - bin/dprint
  - package.json
  - pnpm-workspace.yaml
  - .github/workflows/reusable-checks.yml
  - scripts/guards/guard-action-provenance.mjs
tags:
  - dprint
  - nix
  - flake
  - supply-chain
  - tooling
  - vendoring
---

# dprint comes from the repo's nix flake, not npm

## Context

`dprint` was a root pnpm devDependency (`^0.54.0`) whose postinstall is blocked by the repo's supply-chain policy (`pnpm-workspace.yaml` `allowBuilds`). The blocked postinstall means the npm package's binary never lands on PATH at `node_modules/.bin` — the tree was formatted by the binary at `node_modules/.pnpm/dprint@0.54.0/node_modules/@dprint/linux-x64-glibc/dprint`, reachable only through pnpm's internal layout. Every dprint invocation (root `format`/`format:check`, `check:local`, the pre-commit lint-staged step, and 25 per-package `"format": "dprint fmt"` scripts) was therefore either fragile or a bypass: the per-package scripts invoke `dprint` from PATH and would pick up any stray host binary of a different version.

## Candidates

1. **npm `dprint` wrapper with a blocked postinstall** — the status quo. Loser: the binary is not actually usable through pnpm's bin-linking (the postinstall that drops the platform binary is exactly what the policy blocks), so the dependency is a lie — a pinned version that cannot answer on a fresh clone, plus the `allowBuilds: dprint: false` entry it needs.
2. **Direct `@dprint/<platform>` npm packages** — the same postinstall problem, moved one level down: the platform packages are the ones whose install scripts drop native binaries, so the policy blocks them identically. Loser for the same reason as (1).
3. **nixpkgs `pkgs.dprint` (0.55.2, cargo-built)** — builds fast from cache and needs no vendoring, but the version differs from the one the tree is formatted with. Swapping the formatter version moves formatted output across the whole tree, conflating a tooling swap with a formatting change. Loser on the deciding criterion.
4. **The official GitHub release archive pinned at 0.54.0** — dprint publishes per-platform zip archives with SHA-256 sums in the release notes; `dprint/dprint` ships no flake of its own. Winner: byte-identical version to the one the tree is formatted with, obtained with no build script (the archive is one bare executable, `autoPatchelfHook` rewrites its interpreter), and no npm postinstall in the dependency graph.

Deciding criterion: the formatter version the tree is formatted with, obtained without a build script the supply-chain policy blocks. The flake pins `nix/dprint.nix` to 0.54.0 with the release-notes SHA-256 sums; replacing the npm package cannot move one byte of formatted output.

## Guidance

- **dprint exists only as a flake package.** `flake.nix` exposes `.#dprint` and a dev shell (dprint + node 24 + deno; pnpm is deliberately absent — `packageManager` pins pnpm and corepack resolves it). `bin/dprint` is the single entry point: it takes the first dprint on PATH (dev shell, direnv, CI's `nix build --print-out-paths` store path) and otherwise `nix run`s the flake; with neither, it prints the error message pointing at CONTRIBUTING.md. Never add a `dprint` npm dependency back — the `allowBuilds` entry is gone with it.
- **Bumping the formatter is a deliberate act.** Change the `version` and per-platform `sha256` in `nix/dprint.nix` (sums from the release notes), then `pnpm format` and inspect the diff — a version move may legitimately reflow the tree, and that diff is the review.
- **A third-party action was admitted for this.** `cachix/install-nix-action` entered `ALLOWED_THIRD_PARTY` in `guard-action-provenance.mjs` in its own commit (the guard's documented two-commit procedure), because the runner image ships no nix and no GitHub-owned installer exists. The gate job holds `contents: read` only. It beat `DeterminateSystems/nix-installer-action` (installs a vendor distribution of Nix rather than upstream) and `nixbuild/nix-quick-install-action` (smaller ecosystem).

## Related

- `nix/dprint.nix` — the pinned release archive
- `bin/dprint` — the one entry point
- `CONTRIBUTING.md` — Setup section: the flake before lint/format
- `.github/workflows/reusable-checks.yml` — the gate job installs nix and puts the flake-built dprint on PATH
- `scripts/guards/guard-action-provenance.mjs` — the admission, in its own commit
