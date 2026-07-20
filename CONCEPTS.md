# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Build pipeline

### `@systemfsoftware/source` custom export condition

A package.json `exports` condition added by the shared tsconfig to every package in this monorepo. When TypeScript resolves a workspace dependency (e.g. `@systemfsoftware/hex-schema`), this condition makes it pick `src/mod.ts` over `dist/index.mjs`. It exists so editors and the dev typecheck see live source, not stale build output. It is _not_ a Node.js condition — running apps with `node` (or api-extractor outside the dev tsconfig) fall through to standard resolution (`default` → `.mjs`).

_Aliases:_ `customConditions: ["@systemfsoftware/source"]`

### tsdown output

The `.d.ts` and `.mjs` files in `packages/<name>/dist/` produced by the `tsdown` build step. For a barrel-re-export package this is `dist/index.d.ts` containing `export * from '@workspace/dep'` — a one-line re-export that depends on the consumer resolving the dep's types. Created fresh on every `pnpm build`; gitignored.

### api-extractor rollup

The consolidated `.d.ts` written by `api-extractor` to `dist/<name>.d.ts` per the `dtsRollup.untrimmedFilePath` config field. Distinct from the tsdown output even when both exist in the same `dist/` directory. The rollup uses `bundledPackages` to inline dependency types, producing a single self-contained type declaration file. `package.json#exports.types` points at the rollup, never at the tsdown output, because consumers get the complete type surface without following workspace-dep chains.

_Avoid:_ "the dist .d.ts" (ambiguous with tsdown output)

### bundledPackages

A `bundledPackages` array entry in `api-extractor.json` listing workspace dependencies whose types should be inlined into the rollup output. Inlining means consumers don't have to install the dep at all for type resolution — the rollup contains everything. Used when a package is a structural re-export layer (barrels from one or more workspace deps) so its published types stand alone.

## Release pipeline

### semantic-release

The npm publish orchestrator triggered by push to `main`. Runs `pnpm build` per package, then per-package semantic-release which analyzes commits since the last release tag, derives the next semver from conventional-commit types, and calls `pnpm publish`. Each package is released independently based on which files its `commitsForPackage` filter (in `scripts/release-monorepo-filter.mjs`) finds touched.

## Validation tooling

### check-exports

The script at `scripts/check-exports.mjs` that compares each package's `package.json#exports` paths against the actual `dist/` directory. Catches drift where `exports.types` references a file the `build` script never produces. Wired into root `pnpm check:exports` but not currently in `pnpm check`'s blocking pipeline.

### attw

`arethetypeswrong` — the type-resolution validator. `attw --pack .` runs against the package tarball the same way npm would install it, validating that `exports` declarations resolve to consistent types across node10 / node16-CJS / node16-ESM / bundler. Catches downstream-facing drift that workspace-local checks miss.
