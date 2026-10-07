# Contributing

## Setup

Requires Node 24+ and pnpm 11 (pinned via `packageManager`; `corepack enable` picks it up).

The formatter and the comment-checker hook come from the repo's nix flake: run `nix develop` (or `direnv allow` to enter it automatically) before `pnpm lint`/`pnpm format` — `bin/dprint` resolves the flake-built formatter, `comment-checker` resolves to the sandboxed wrapper (no network, read-only working directory) that the Claude Code hook runs, and everything else still comes from Node 24 + corepack pnpm 11.

```bash
nix develop        # puts dprint, comment-checker (sandboxed), node 24 and deno on PATH
pnpm install
pnpm build        # tsdown, dependency order
pnpm typecheck    # tsc (TypeScript 7)
pnpm test         # vitest — property + composition suites
pnpm lint         # dprint check + self-hosted oxlint
```

Read [`CONSTITUTION.md`](CONSTITUTION.md) (the design law) and [`AGENTS.md`](AGENTS.md) (workspace invariants) first.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced by `commitlint` (commit-msg hook). The type drives the release; the scope is a package directory name (or `repo`/`deps`/`release`/`ci`) and is optional but encouraged:

```
fix(rx-effect): handle empty observable
feat(effect-daemon-spec): add jitter backoff
```

## Releasing

Releases are **driven by your commits' change intents** — authored under
`.changeset/` with `pnpm change` and consumed by pnpm-native workspace
versioning (`pnpm version -r`). The type of change drives each package's next
version; see [`.changeset/README.md`](.changeset/README.md) for the intent
format and the two-phase version/release flow. No manual version files.

Each package is versioned **independently**. On push to `main`, the **Release**
workflow reads repository state and picks a phase (`scripts/tools/plan-release.ts`):

- **version** — pending change intents exist. The workflow runs `pnpm version -r`
  and opens/updates the Release PR (`changeset-release/main`) with the bumped
  manifests and generated changelogs.
- **release** — every intent is consumed and some workspace versions are not yet
  released. The workflow builds, writes a `<pkg>@vX.Y.Z` git tag for each
  unreleased version, and cuts a GitHub Release from its authored changelog.
- **none** — nothing to do.

### Distribution — Nix flakes from git, no registry

These packages are **not published to any npm registry**. Distribution is this
repository's **Nix flake outputs**, consumed directly from a git ref: a consumer
pins the flake input by its commit `rev` + `narHash` in `flake.lock` (a PR
snapshot pins the head rev, a stable release pins the release tag), and runs all
dependency code — install, build, test, dev, CLIs — inside a deny-by-default
sandbox (bubblewrap on Linux).

A `<pkg>@vX.Y.Z` git tag is the durable record that a version shipped: the
release set is exactly the workspace versions that carry no such tag yet
(`scripts/tools/cycle.ts`). Tagging and the GitHub Release are idempotent — a
version whose tag already exists is skipped — so a half-finished release resumes
safely on the next push to `main`. There is **no npm token, no OIDC trusted
publishing, and no registry** anywhere in the release path.
