# AGENTS.md — `@systemfsoftware/stryker-plugins`

> **Delta**: Stryker mutation-testing plugins for Effect-TS. Root AGENTS.md governs.

Ignores equivalent mutants on Effect Schema declarations — brands, `TaggedClass`/`TaggedError` tags. Prevents false-positive mutation scores that inflate without catching real bugs.

**Key invariants:**

- Ignored mutants MUST be proven-equivalent: mutating the tag/brand field produces identical behavior
- Any new ignore pattern MUST include a test demonstrating the equivalent mutant
- Plugin hooks into Stryker's `resolveMutant` pipeline — don't bypass other mutation stages
- Score reflects behavioral coverage, not data-declaration coverage
