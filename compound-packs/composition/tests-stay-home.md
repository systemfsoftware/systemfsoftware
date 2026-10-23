---
title: Tests live in their package's tests/ folder and import the code under test only through the package's public specifier, their own package included
applies_when:
  - writing a test for a library or an application
  - a test needs a function that the package does not export
  - adding an export, a subpath or a ./testing entry so a test can reach something
  - placing a test file next to source, under src/, or in a __tests__ folder
  - a test imports its own package by a relative path, vi.mock, vi.importActual or a # import
  - sharing fixtures, arbitraries or a contract suite between several packages' tests
tags: [composition, tests, public-api, internals, test-layers, test-support]
---

## Rule

A test lives in the `tests/` folder of the package whose behaviour it tests. It imports the code under test only through the package's public specifier (`@scope/ledger`), the same specifier a consumer writes. This holds for a test inside the same package: no relative import into `src`, `internal` or the package root, from any test anywhere. Relative imports that stay inside the test tree (`./fixtures/order.ts`) are allowed.

"Import" means every way a test loads a module: a static or dynamic `import`, `export ... from`, `require`, and the string arguments of `vi.mock`, `vi.doMock`, `vi.importActual`, `vi.importMock` and `import.meta.glob`. A package.json `"imports"` specifier (`#internal/*`) and a test-runner alias (`@scope/ledger/internal` -> `./src/internal`) are paths into the package and are forbidden the same way.

- The workspace source condition resolves the specifier to TypeScript source, so this needs no build (pack: composition, source-condition-resolution.md). No condition on `.` gives tests a wider barrel (pack: composition, role-entries-only.md).
- Behaviour the public entry cannot reach is either not behaviour anyone depends on, or the surface is wrong. Test it through the public operation that uses it, or fix the surface. Never export it for a test, and delete a test whose only subject is an internal.
- A fake another package's tests need is a public Layer on the service exported from `.` beside the live one (`Ledger.layerTest`, `Ledger.layerNoop`). There is no `./testing` entry (pack: composition, role-entries-only.md).
- Fixtures, arbitraries and contract suites that several packages' tests share live in their own private library (`@scope/ledger-test-support`, `"unit": "library"`, `.` only). Only tests depend on it, as a dev dependency. It is never an entry of the library under test.
- A store's or port's law suite runs in the driver adapter library's `tests/`, against `Service.layerTest` from the service's library and against the adapter's own `layer`, both imported by specifier (pack: composition, drivers-live-where-chosen.md).
- An application has no public specifier, so its tests drive its deployed entry: the Worker's `fetch` or RPC handler, or the built site. Logic in an application that needs tests below that entry moves into a library and is tested through that library's specifier.
- Storybook stories (`*.stories.tsx`) are not yet classified by this rule. Whether a story is a test that lives in `tests/` and imports the public specifier, or part of a UI unit's source, is an open question for Ryan; until he rules, stories follow (pack: storybook-testing, stories-are-the-ui-integration-tests.md) and this rule makes no claim about them.

## Why

A test that imports internals certifies code no consumer can reach and misses the entry consumers actually import: the suite becomes the largest user of code nobody else may touch, and freezes it. At the research snapshot (2026-10-21), review let a younna-ai Worker grow 136 entries, and 149 of 378 declared subpaths had no consumer at all ((pack: composition, evidence/FINDINGS.md) Cycle 006); an entry a test imports looks used, so a suite that reaches past the barrel hides dead surface. The doctrine and its lint were planned in `docs/plans/2026-08-23-001-feat-internal-jsdoc-public-test-imports-plan.md` (R5, R12, R14: a barrel never imports or re-exports from `internal`).

## Evidence

- Effect 4: tests sit in `effect-smol/packages/*/test`, outside `src`, and import `effect`, `effect/Function`, `effect/testing`; no static import names `../src` ((pack: composition, evidence/FINDINGS.md) Cycle 003, finding 8). The one reach is a string argument: `effect-smol/packages/effect/test/schema/HMR.test.ts:4,20` loads `../../src/Schema.ts` through `vi.importActual`, which is why string loaders count as imports here.
- Vitest: no `*.test.ts` file inside `packages/` (six `*.spec.ts` component tests sit beside source in `vitest/packages/ui/client/components`, the exception to its own layout); private test projects import the public `vitest` entry, and shared helpers are the private package `@vitest/internal-testing-helpers` (`vitest/test/test-utils/package.json`, `main: ./index.ts`) ((pack: composition, evidence/FINDINGS.md) Cycle 001, finding 9).
- TanStack Query: shared test helpers are the package `@tanstack/query-test-utils` (`query/packages/query-test-utils`), not a `./test-utils` export ((pack: composition, evidence/FINDINGS.md) Cycle 000, finding 6; (pack: composition, evidence/PACK.md) rules 9 and 12).
- Every source deep-imports somewhere in tests (TanStack `react-router/tests` into `router-core/src`, Vitest `test/unit` into `packages/*/src`), which is why this must be a gate, not a convention ((pack: composition, evidence/FINDINGS.md) Cycles 000 and 001).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/ledger/tests/record.integration.test.ts
import { record } from '../src/internal/record.ts'
vi.mock('../src/internal/clock.ts')
// WRONG: packages/ledger/src/record/__tests__/record.test.ts
import { record } from '../internal/record.ts'

// RIGHT: packages/ledger/tests/record.integration.test.ts
import { Ledger } from '@scope/ledger'
import { LedgerArb } from '@scope/ledger-test-support'
const layer = Ledger.layerTest
```

## Gate

Fact-gated, oxlint plugin `@systemfsoftware/oxlint-plugin-test-discipline` (`packages/oxlint-plugin/oxlint-plugin-test-discipline/src/rules/`). These run only through a package's own `lint` task, where its oxlint config enables the plugin:

- `tests-import-public-api` reports a test whose relative specifier has a `src` segment, or an `internal` segment after a `..` climb;
- `test-file-outside-tests-dir` reports a test file outside `src/` that is not under `tests/`;
- `no-test-file-in-src` reports test files under `src/`, apart from the forms listed under the gaps below.

Fact-gated: `repo-checks composition-imports` (`scripts/tools/repo-checks/composition.ts`) fails an import of a workspace package by a specifier its `exports` map does not admit, and any import resolved by the compiler into another package's directory by path. Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Judge-gated, `test-only-exports`, same check: not authoritative until relabelled and re-recorded (`composition.ts` still lets a violated verdict fail, because it reads only the kappa). Every export entry imported by test files and by no non-test file is sent as facts to the two-model panel (`OPENROUTER_API_KEY` required). Its recorded kappa is 0.79 over 37 cases (`scripts/tools/repo-checks/calibration/kappas.json`; 0.73 against the blind second rater in `calibration/second-rater.jsonl`), but its rubric still treats `./testing` entries as legitimate, so the fact gates above are the authority.

Gaps to close in the lint rules (this pack does not change them), each with the fact a gate would read:

- `tests-import-public-api` skips every file under `src/` (`isInTestsImportScope` in `rules/path.ts`), which implements plan R6's exemption for colocated `src/**/__tests__` tests importing `../internal`. This rule has no such exemption. Fact: every test file's path, failed when it is not under `tests/`.
- Plan R12's "rewritten onto the package name or a subpath export" is superseded by Ryan's ruling that a private library exports `.` only: a test is rewritten onto the `.` specifier, never onto a new subpath.
- `no-test-file-in-src` still sanctions `src/**/__tests__/<stem>.workflow.property.test.ts` and any file named `schema-laws.test.ts` (`SCHEMA_LAWS_BASENAME` in `rules/path.config.ts`, honoured at `no-test-file-in-src.ts:33`; 14 such files under `packages/*/src`), and `in-source-test-targets-private` / `in-source-test-prop-only` sanction in-source `import.meta.vitest` blocks (92 files under `packages/` at this commit). Fact: the test file's path and the presence of an `import.meta.vitest` member expression in the syntax tree.
- `tests-import-public-api` visits only `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration`, `ImportExpression` and `TSImportEqualsDeclaration`: `require`, `vi.mock`, `vi.importActual` and `import.meta.glob` string arguments are never inspected. Fact: the first string argument of those calls, resolved like an import.
- A `#internal/*` specifier does not start with `.`, so it passes. Fact: the compiler's resolved file of each `#` import, compared with the package's own `src`.
- `composition-imports` (`composition.ts:473-489`) fails a tsconfig `paths` entry or bundler alias only when it points into another unit, so a package's own `vitest.config` alias into its own `src` passes. Fact: aliases in a unit's test-runner config whose target is inside the same unit's `src`.
- `tests-import-public-api` keys on specifier text, so `../mod.ts` from `tests/` in a package with no `src` folder passes. Fact: the compiler's resolved file of each test import, compared with the package's own directory.

Known violations in this repository: 20 `src/**/__tests__` directories under `packages/`, the 92 in-source test files above, and `scripts/tools/repo-checks/*.test.ts`, which sit beside their source and import `./composition-calibrate.ts`, `./composition-judge.ts` and others relatively.
