---
title: Centralized Dependency Management with pnpm Catalogs
date: "2026-07-19"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - TypeScript monorepo with multiple packages using pnpm workspaces
  - Dependency versions need centralized, single-source-of-truth management
  - Avoiding inline version drift across 10+ package.json files
root_cause: inadequate_documentation
resolution_type: tooling_addition
related_components:
  - pnpm-workspace.yaml
  - package.json (12 files)
  - tsconfig.json
  - effect-daemon-spec
tags:
  - pnpm
  - monorepo
  - catalogs
  - dependency-management
  - typescript
  - effect-ts
---

# Centralized Dependency Management with pnpm Catalogs

## Context

The systemfsoftware monorepo comprised 12 packages — eight library packages, three under `packages/stryker-js/`, and a shared `tsconfig` package — all with inline version specs for their shared dependencies.

Inline version specs create two recurring problems: accidental drift and redundant update toil. When `effect` bumps to `^3.22.0`, every `package.json` that pins it must be updated. Miss one, and CI passes while one package still runs against the old version.

pnpm's catalog feature solves both by declaring named version groups in `pnpm-workspace.yaml`. Member packages then reference the catalog by name rather than a concrete version string.

## Guidance

Declare a default catalog (and any named catalogs) in `pnpm-workspace.yaml` using the `catalog:` and `catalogs:` blocks. Then replace every inline version for shared dependencies in member `package.json` files with `catalog:` (default) or `catalog:<name>` (named catalog).

### Step 1 — Define the catalog in pnpm-workspace.yaml

At the repo root, `pnpm-workspace.yaml` holds all catalog declarations:

```yaml
catalog: # ← default catalog: "catalog:" resolves here
  typescript: ^7
  "@effect/platform-node": 4.0.0-rc.112
  "@effect/platform-node-shared": 4.0.0-rc.112
  effect: 4.0.0-rc.112
  "@effect/vitest": 4.0.0-rc.112
  fast-check: ^4
  vitest: ^4
  "@vitest/snapshot": ^4
  "@vitest/coverage-v8": ^4
  "@vitest/coverage-istanbul": ^4
  vite-tsconfig-paths: ^6.1.1
  vite: ^8
  tsdown: ^0.22.14
  rimraf: ^6.1.3
  "@types/node": ^24
  tstyche: ^7.1.0
  testcontainers: ^12.1.0
  "@microsoft/api-extractor": ^7.58.7
  oxc-parser: ^0.140.0
  "@oxc-project/types": ^0.140.0
  "@std/jsonc": jsr:^1.0.2
  "@std/path": jsr:^1.0.0
  "@std/fs": jsr:^1.0.6
  "@testing-library/dom": ^10.4.1
  "@testing-library/jest-dom": ^7.0.0
  "@testing-library/react": ^16.3.2
  "@types/react": ^19.2.18
  "@types/react-dom": ^19.2.4
  "@types/scheduler": ^0.26.0
  jsdom: ^29.1.1
  react: ^19.2.8
  react-dom: ^19.2.8
  react-error-boundary: ^6.1.2
  scheduler: ^0.27.0
  storybook: ^10.5.0
  type-fest: ^5.8.0
  "@storybook/addon-vitest": ^10.5.0
  "@storybook/react-vite": ^10.5.0
  "@vitest/browser": ^4
  "@vitest/browser-playwright": ^4
  playwright: ^1

catalogs:
  peers: # ← named catalog: resolves as "catalog:peers"
    effect: 4.0.0-rc.112
    "@effect/vitest": 4.0.0-rc.112
  oxlint: # ← named catalog: resolves as "catalog:oxlint"
    oxlint: ^1.77.0
    "@oxlint/plugins": ^1.77.0
    oxlint-tsgolint: 7.0.2001
  stryker: # ← named catalog: resolves as "catalog:stryker"
    semver: ^7.7.0
    "@systemfsoftware/stryker-js-cli": ^4.0.1
    "@systemfsoftware/stryker-js-typescript-checker": ^3.0.1
    "@systemfsoftware/stryker-js-vitest-runner": ^2.0.1
    "@systemfsoftware/stryker-plugins": ^1.0.1
    "@systemfsoftware/stryker-test-contribution": ^1.0.1
    "mutation-testing-elements": 3.7.3
    "mutation-testing-metrics": 3.7.3
    "mutation-testing-report-schema": 3.7.3
  attw: # ← named catalog: resolves as "catalog:attw"
    # @systemfsoftware/arethetypeswrong runs the JS compiler bridge (typescript@6).
    # typescript@7 is the native Go compiler with no JS API; see
    # docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md
    typescript: ^6.0.3
    # The published CLI. Consumers that must not close a workspace cycle resolve
    # through this catalog instead of `workspace:^`; see
    # docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md
    "@systemfsoftware/arethetypeswrong-cli": ^1.1.1
```

The `catalogs:` block defines named catalogs (`peers`, `oxlint`, `stryker`, `attw`). Member packages reference them as `catalog:peers`, `catalog:oxlint`, `catalog:stryker`, or `catalog:attw`. The bare `catalog:` key is the default catalog.

The `stryker` catalog is intentionally separate from the default because its dependency axis (mutation testing tooling) differs from the main library/testing axis. Keeping it isolated prevents Effect-TS and Vitest deps from accidentally pulling in Stryker machinery.

### Step 2 — Replace inline versions in package.json files

Convert every shared dependency to a catalog reference. The pattern is:

| Before                | After                         |
| --------------------- | ----------------------------- |
| `"effect": "^3.21.2"` | `"effect": "catalog:"`        |
| `"semver": "^7.7.0"`  | `"semver": "catalog:stryker"` |

Workspace-local packages (other monorepo members) continue using `workspace:^` — catalog references are only for external registry deps. For example, `packages/effect-gherkin-spec/package.json` declares:

```json
"devDependencies": {
  "@effect/vitest": "catalog:",
  "@systemfsoftware/arethetypeswrong-cli": "catalog:attw",
  "@systemfsoftware/oxlint-config": "workspace:^",
  "@systemfsoftware/tsconfig": "workspace:^",
  "@systemfsoftware/vitest-config": "workspace:^",
  "@types/node": "catalog:",
  "effect": "catalog:",
  "fast-check": "catalog:",
  "oxlint": "catalog:oxlint",
  "rimraf": "catalog:",
  "tsdown": "catalog:",
  "vitest": "catalog:"
}
```

### Step 3 — Regenerate the lockfile

After updating all package.json files, run:

```bash
pnpm install
```

The install rewrites the lockfile so it records the new catalog specifiers. `.github/actions/install-deps` runs `corepack pnpm install --frozen-lockfile`, and a frozen install fails when a member manifest references a catalog entry the lockfile does not carry — so the regenerated lockfile has to be committed.

### Step 4 — Verify with pnpm check

Run the full CI-equivalent check:

```bash
pnpm check
```

`pnpm check` runs `pnpm install --frozen-lockfile` and then `pnpm check:ci` — `format:check`, the task gate (`lint`, `typecheck`, `test`, `test:types`, `attw`, `api:check`), and the dist gate (`build`). Every step must exit 0.

## Why This Matters

**Single source of truth.** Changing `effect` from `^3.21.2` to `^3.22.0` requires editing one line in `pnpm-workspace.yaml`. Every package consuming `catalog:` picks up the new version on its next `pnpm install`. No grep-forget-edit loops across 12 files.

**Consistent runtime behavior.** Every package in the monorepo tests against the same `effect` version. A bug that only manifests on older versions is caught uniformly rather than lurking in packages that haven't been manually updated.

**Named catalogs model concern separation.** The `stryker` catalog isolates mutation-testing tooling from the main library axis. Bumping `@effect/vitest` does not nudge Stryker deps, and vice versa.

**CI safety.** `pnpm check` with `--frozen-lockfile` fails if any `package.json` drifts from the lockfile, catching a missed `pnpm install` before it reaches CI.

## When to Apply

- A pnpm monorepo with 6 or more packages sharing at least 4 common dependencies.
- The team spends measurable time updating version specs across multiple `package.json` files.
- Packages are at the same major-version axis — mixing catalogs with different major versions for the same dep requires separate named catalogs per major version.

Named catalogs are appropriate when a subset of packages has a distinct dependency axis (e.g., mutation testing, linting, code generation) that should not bleed into the main catalog.

## Examples

### Before: Inline versions

```json
"devDependencies": {
  "@effect/vitest": "^0.29.0",
  "effect": "^3.21.2",
  "fast-check": "^3.0.0",
  "vitest": "^4.0.0",
  "rimraf": "^6.0.0",
  "tsdown": "^0.22.0"
}
```

### After: Catalog references

```json
"devDependencies": {
  "@effect/vitest": "catalog:",
  "@systemfsoftware/stryker-js-vitest-runner": "catalog:stryker",
  "effect": "catalog:",
  "fast-check": "catalog:",
  "rimraf": "catalog:",
  "tsdown": "catalog:",
  "vitest": "catalog:"
}
```

### Named catalog reference

```json
"dependencies": {
  "@systemfsoftware/stryker-js-cli": "catalog:stryker",
  "@systemfsoftware/stryker-plugins": "catalog:stryker",
  "mutation-testing-metrics": "catalog:stryker",
  "semver": "catalog:stryker",
  "typescript": "catalog:"
}
```

### Trailing comma cleanup after bulk edits

When replacing the last element of a JSON object using bulk edit tools, trailing commas must be removed. For example, replacing the last `devDependencies` entry adds a trailing comma that invalidates the JSON:

```json
// Last element — no trailing comma allowed:
"vitest": "catalog:"
```

Fix with: `content.replace(/,(\s*[}\]])/g, '$1')` across all affected files.

## Related

- [pnpm Catalogs documentation](https://pnpm.io/catalogs)
- Root `pnpm-workspace.yaml` for the canonical catalog declarations
