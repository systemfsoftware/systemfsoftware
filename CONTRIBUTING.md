# Contributing

## Setup

Requires Node 24+ and pnpm 11 (pinned via `packageManager`; `corepack enable` picks it up).

```bash
pnpm install
pnpm build        # tsdown, dependency order
pnpm typecheck    # tsgo (TypeScript 7)
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

Releases are **driven by your commits** — [semantic-release](https://semantic-release.gitbook.io) reads the conventional-commit history, decides each package's next version, tags it, publishes to npm, and writes the GitHub release. No manual version files.

Each package is versioned **independently**. A small owned router (`scripts/release.mjs`) runs semantic-release once per published package, scoping each run to the commits that touched that package (`scripts/release-monorepo-filter.mjs`) and tagging as `<package>@vX.Y.Z`. No third-party monorepo-release dependency. The private tooling packages (`tsconfig`, `oxlint-config`, `vitest-config`) are skipped.

On push to `main`, the **Release** workflow publishes every package that had a releasing commit. Preview locally with `pnpm release:dry`.

### Publishing — OIDC trusted publishing, no token

The workflow authenticates to npm with **GitHub OIDC** (`id-token: write`) and publishes with `pnpm publish` on pnpm 11 — which natively does the OIDC handshake, strips the `workspace:` protocol, and emits provenance. There is **no `NPM_TOKEN`**.

npm requires a package to exist before OIDC can be configured, so there's a one-time bootstrap per package:

1. **First publish with a token.** `npm login`, then `pnpm build && pnpm release` once from your machine.
2. **Add the trusted publisher** at `npmjs.com/package/@systemfsoftware/<name>` → _Settings → Trusted Publisher → GitHub Actions_ — organization `systemfsoftware`, repository `systemfsoftware`, workflow `release.yml`. All packages point at the same workflow.

After that, pushes to `main` publish automatically over OIDC with no secrets.
