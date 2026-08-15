---
name: benchmark
description: Defines ttsc benchmark selection, fixture integrity, result reporting, and publication safeguards. Use before running or modifying a benchmark, changing a fixture, or publishing benchmark results; load the linked performance or graph procedure for the selected benchmark.
---

# Benchmark

This skill owns the two harnesses this repository wrote for itself, one package each under `benchmarks/`. Read the matching procedure in full before acting:

- [performance.md](performance.md): `ttsc + @ttsc/lint + ttsc format` versus `tsc + eslint + prettier`, including fixture branches and dashboard publication.
- [graph.md](graph.md): `@ttsc/graph` and graph-MCP comparators, including AI-agent runs, trace audits, regression gates, and graph fixtures.

Read both only when changing shared fixture infrastructure or a surface that affects both systems.

`benchmarks/evidence` is a third package and a different kind of measurement: it runs one coding engine against itself rather than ttsc against a competitor, it is vendored from `samchon/lint-plugin-evidence`, and it keeps that project's conventions. Nothing here applies to it. Its operation is [evidence/SKILL.md](evidence/SKILL.md).

## Measurement Integrity

- Measure the real product. Do not add benchmark-only branches, fixture-name checks, expected-answer checks, monkey patches, or agent restrictions that would be wrong for an unmeasured repository.
- Give every comparator the setup its own documentation prescribes. Measuring a deliberately underconfigured competitor invalidates the comparison.
- Preserve the workload defined by the selected procedure. A faster result obtained by compiling, linting, formatting, indexing, or reading less input is not an optimization.
- Treat a surprising result as evidence that the change is not yet understood. Inspect the raw report or trace before accepting, explaining away, or patching around it.

## TypeScript Source Contract

Keep every CLI entrypoint under the harness package's own `src/executable`; those files export nothing. An executable is a bootstrap, not an implementation: it only imports one owning `TtscBenchmark*` class or namespace and calls its `main()` entrypoint. Keep it within 12 physical lines. Move parsing, orchestration, validation, and helpers into equal-named reusable modules.

Outside that directory, each reusable module exposes exactly one `TtscBenchmark*` or `ITtscBenchmark*` symbol and its case-sensitive filename equals that symbol name. A data contract may merge one `ITtscBenchmark*` interface with its equal-named companion namespace.

Executable surfaces are classes or namespaces. Never add a standalone exported function, constant, enum, or type alias. Put related functions, constants, guards, and subordinate types inside the owning `TtscBenchmark*` namespace; put companion types and guards for a data contract inside its `ITtscBenchmark*` namespace.

Every exported symbol, exported namespace member, and public member of an exported class has JSDoc that states its benchmark role and non-obvious invariant. Every field in an exported data contract has JSDoc that records its meaning, units, optional-state semantics, and default where applicable. Do not restate only the TypeScript spelling.

Before committing benchmark source, run the source contract over both harnesses with `node --experimental-transform-types scripts/ci/benchmark-source-contract.mts`, then the strict TypeScript validation of whichever package you touched with `pnpm --dir benchmarks/graph run check` or `pnpm --dir benchmarks/performance run check`. The contract check is repository tooling rather than a package script because neither harness owns it, and it deliberately skips `benchmarks/evidence`, which is vendored and keeps its own conventions.

## Benchmark Improvement Campaigns

When benchmark evidence leads to multiple published issues and the user authorizes repeated issue-to-pull-request implementation, use the issue-campaign skill with this skill. This skill owns workload integrity, measurement, fixture handling, and result publication. The applicable issue-campaign workflow owns issue publication, implementation topology, claim stability, CI, review, cleanup, and renewed discovery. The default is the solo workflow; use the multi-agent workflow only on an explicit parallel request.

## Temporary Asset Cleanup

Each benchmark run must own an exact temporary root. A solo run uses the current checkout and existing fixture checkouts; do not create a clone or worktree. Place run-only indexes, Go build caches, and Go temporary directories below the exact root. For Go commands, set `GOCACHE` and `GOTMPDIR` to run-specific directories rather than the user's shared Go cache or system temp directory.

After a run, retry, aborted attempt, or completed benchmark-driven campaign, preserve the report and any user-authorized fixture change, then remove the run's exact temporary root. First confirm no process still uses it, then verify the directory is absent. Never recursively clean shared `GOCACHE`, `GOMODCACHE`, `GOPATH`, or a broad temp directory. A `--keep-...` option or another explicit user retention request is the only exception; record the retained path and reason.

## Fixture Changes

Benchmark setup resets existing local fixture checkouts to their upstream branch tips. Edit the fixture repository itself, not a new clone under a benchmark work directory.

Finish every fixture change before pushing it:

1. Run that branch's own build, format, and lint commands until green.
2. Confirm the branch contains no tarball path, vendored ttsc build, stale `dist/`, or other generated benchmark input.
3. Commit and push the fixture branch. A half-finished upstream tip contaminates every later setup.

Fixture READMEs and prose follow AGENTS.md `## Maintenance` and the documentation skill.

## Report Results

Every result table reported in chat or committed to the website must be preserved for the active pull request. When the user has authorized PR updates under the pull-request skill, maintain one sticky comment beginning with `<!-- ttsc-benchmark-results -->`; update it with the latest table, report and audit paths, and known invalid or missing cells.

If no pull request exists or no update is authorized, keep the result in the final report and mark the comment as pending. Post it only after the user creates or authorizes updating the pull request.
