# .github/AGENTS.md — CI debugging guide

## Workflow

The `Release` workflow runs on push to `main`. One job per phase: `build · typecheck · test · lint`, then `Semantic Release`.

### Job steps

| Step                  | Command                                           | Failure pattern                                                 |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `actions/checkout@v7` | checkout                                          | Git exit 128 → usually cascade from earlier failure             |
| `install-deps`        | `pnpm install --frozen-lockfile`                  | Lockfile drift → run `pnpm install` locally and commit lockfile |
| `build`               | `pnpm build`                                      | tsdown/TypeScript errors                                        |
| `typecheck`           | `pnpm typecheck`                                  | tsc errors                                                      |
| `test`                | `pnpm test`                                       | Vitest failures                                                 |
| `lint:ci`             | `pnpm format:check && turbo lint --format=github` | dprint/oxlint failures                                          |
| `api:check`           | `pnpm api:check`                                  | api-extractor (effect-daemon-spec only)                         |

## Local reproduction

```bash
# Full CI-equivalent check:
pnpm check:ci

# Individual steps:
pnpm install --frozen-lockfile   # match CI install
pnpm build
pnpm typecheck
pnpm test
pnpm lint:ci
pnpm api:check
```

## Common failure patterns

### 1. `Failed to find tsgolint executable`

**Symptom:** `oxlint . … --format=github` fails with "Failed to find tsgolint executable"

**Root cause:** `@systemfsoftware/oxlint-config/base` sets `options: { typeAware: true }` for type-aware linting. oxlint requires `oxlint-tsgolint` (optional peer dep ≥0.24.0) for this feature. The binary must be present in the dependency tree.

**Fix:** Ensure `oxlint-tsgolint` is in the dependency tree of any package extending `@systemfsoftware/oxlint-config/base`. It's declared in `@systemfsoftware/oxlint-config`'s dependencies and pulled transitively.

**Verify:** `ls node_modules/.pnpm/oxlint-tsgolint*/node_modules/oxlint-tsgolint/` — should exist.

### 2. Lockfile drift (`specifiers don't match`)

**Symptom:** `install-deps` step fails with "specifiers in the lockfile don't match specifiers in package.json"

**Root cause:** package.json was updated without running `pnpm install` to update `pnpm-lock.yaml`.

**Fix:** `pnpm install` (without `--frozen-lockfile`) and commit the lockfile.

### 3. Git exit code 128

**Symptom:** A git step (checkout, merge, push) exits 128.

**Root cause:** Nearly always a secondary cascade from a prior failed step that left the workspace dirty. Look at the FIRST failing step, not the git step.

### 4. pnpm peer dep warnings

**Symptom:** `pnpm install` succeeds but shows "Issues with peer dependencies found"

**Known pre-existing issues:**

- `sinon-chai@3.7.0` wants `chai@^4.0.0` but we have `chai@5.3.3` — incompatible dep in sinon-chai, non-blocking
- `@effect/vitest@0.30.0` wants `vitest@^3.2.0` but we have `vitest@4.1.9` — effect/vitest lags vitest 4, non-blocking

These don't block CI.

### 5. dprint formatting fails

**Symptom:** `format:check` step fails with formatting diffs.

**Fix:** `pnpm format` then commit.

### 6. Annotation extraction (from browser)

When API log download is unavailable (403 even on public repos — requires push access):

1. Open `https://github.com/systemfsoftware/systemfsoftware/actions/runs/<run_id>/job/<job_id>`
2. Click the failing step's disclosure triangle to expand logs
3. Extract the error output from the expanded section

Annotations appear at the page top under "Annotations" section. Use them as entry point, then expand the associated step for full context.

## Dependency chain

```
root oxlint (devDep) + @systemfsoftware/oxlint-config (workspace dep)
  → oxlint (dep)
  → oxlint-tsgolint (dep, optional peer of oxlint ≥0.24.0)
    → provides tsgolint binary for type-aware linting
```

Any package's `lint` script that uses `@systemfsoftware/oxlint-config/base` with `typeAware: true` transitively needs `oxlint-tsgolint` in the installed tree.

## Debugging checklist

1. ✅ Is the lockfile committed? → `git diff pnpm-lock.yaml`
2. ✅ Does a clean `pnpm install --frozen-lockfile` succeed?
3. ✅ Does `pnpm lint:ci` pass locally? (catches most CI-only issues)
4. ✅ Are annotations the first failure or a cascade? (check step order)
5. ✅ Is the `oxlint-tsgolint` binary present in CI? (caught by step 2)
