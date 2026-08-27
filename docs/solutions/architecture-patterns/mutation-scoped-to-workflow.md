# Mutation Is Scoped to Workflow Decisions

Mutation covers only the pure decision — the Workflow that maps a command to a result — not the surrounding shell. A broad mutate glob dilutes the score with survivors that no property test can kill and that no contract guards.

## Failure modes

1. **Surface inflation.** A glob of `src/**/*.ts` enrolls adapters, codecs, and wiring alongside decisions. Survivors accumulate in code that is not required to have distinguishing property tests, so the score mixes two populations and stops reporting decision quality.

2. **Silent passage.** A package whose mutate excludes no artifact still greenlights an empty filter pass. A check that reports "zero configs checked" as success certifies nothing — it passed because it looked nowhere.

3. **Label collapse.** Routing mutation by a filename suffix is circular. A module whose decision leaks into an un-suffixed file is not mutated, and the absence reads as coverage. The failure is indistinguishable from pass without an external key.

## Invariant

> Only the decision surface is mutable; every enrolled package declares at least one positive pattern that names the decision marker, and the gate refuses any config that does not.

Formally: for every workspace Stryker config that participates in the mutation lane, `exists p in mutate where p matches *.workflow.ts` and `forall p positive, p implies workflow`. Violation is a config error before any run starts, not a runtime survivors debate.

Mechanism: a single Deno guard enumerates tracked configs derived from the index (not the filesystem walk), excludes fixture trees and vendored history, parses each `mutate` array, and fails when any positive pattern lacks the marker or when no config is found. The gate is wired into the local and CI checks so an adopter who never installs a local hook still hits it.

## Verification

- **Two-sided boundary.** A fixture config with `src/**` without the marker fails; the same config with `src/**/*.workflow.ts` passes. The guard's selftest exercises both sides plus empty-mutate and unparseable-JSON. Vary the glob by one character; the verdict flips.

- **Mutation relevance.** A surviving mutant in a decision must be killed by a distinguishing property test; a surviving mutant outside the decision must not be counted at all. The mutation plugin's merged report is read for the package, and `Ignored` is excluded from the denominator — only `Survived`/`NoCoverage` count against the threshold. A package that reports zero run mutants via an empty mutate surface is a misconfiguration, not a passing score.

- **Code smell to grep.** A `stryker.config` that lists `"src/**"` without `"workflow"` in the same `mutate` entry is the smell. The complementary smell is a config that enforces nothing because it was never enumerated — `check-stryker-mutate-scope` reporting zero files is the same class.

## Relationship to `label-routed-rules-are-unfalsifiable`

That document retires suffix-routed lint rules because they cannot fire on the mislabelled file. This document does not reintroduce a suffix as a lint selector; it scopes a test surface. The marker is still asserted by the author, but the failure it prevents — diluted mutation signal — is measured by the gate's own enumeration of positives, not by whether a per-file rule was routed. Where a suffix boundary must hold at build time, route on the type or the manifest instead (see that document's key table).

## Prevention

Keep the enumeration derived: configs are discovered from tracked files, not from a manually maintained list. Keep the exclusion closed: fixtures and vendored history are not workspace configs. Keep the check cheap and blocking: a synchronous Deno pass over a dozen JSON files, evaluated before the task graph fans out.

Precedence: this invariant supersedes any prior convention that left `mutate` as a per-package freeform glob. If a package has no decision, it carries no mutation config rather than a broad one that happens to be empty of mutants.
