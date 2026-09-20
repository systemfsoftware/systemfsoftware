# Enforcement

Rules for whoever builds or changes an instrument that grades the maker — lint gates, stream rules, CI checks, thresholds, rubrics, advisors. Never `@`-import this file into a maker's context.

## Mechanism

- Bind each obligation through the strongest mechanism that can carry it, strongest first:
  1. the type system — the illegal state does not construct;
  2. a command that fails — lint, threshold, boundary audit;
  3. a pre-execution refusal — the write or tool call does not happen;
  4. resident prose — the floor; it orients, it does not enforce.
- A post-hoc reminder is prose, not a refusal. If the violating call already executed, the mechanism is rung 4.

## Gate design

- Forbid an outcome; never command a ritual. *Do not ship an export whose dist file is missing*, not *declare a category and write a reason*.
- Key every verdict on a recomputation — source bytes, compiler verdict, rehash — never on a field the graded work's author supplied. When a gate reads a field, recompute that field in the same run.
- Resolve every uncertainty against the permissive outcome: unparseable output degrades to revise, never to pass; an absent grant means required; an unreadable input is surfaced, never skipped; a dead run never reports itself running.
- Assert the input set, not only its contents: an empty corpus, an empty mutated set, or a missing input goes red. A gate that cannot fail is a certificate, not enforcement.

## Changing an instrument

- An instrument change lands alone, in its own commit, observed failing before and passing after, for the reason it states — by hands that do not hold the work the instrument judges.
- Never loosen a threshold, budget, glob, or baseline to make in-flight work pass. The same hands in a second commit is the same cheat.
- When the maker escalates an ungated principle (CONST-E9), you build the instrument and land it through your own channel; only then does the maker's work proceed.

## Enrollment

- Enroll over a clean tree only: migrate every live violation first, then enroll at error. A baseline or allowlist of existing violations is suppression with a date on it.
- A rule registered only in its own test harness is not enrolled. Prove carriage by driving the published artifact the way a consumer resolves it.
- `warn` is forbidden: error with a clean tree, or off with the reason named.
- Delete the retired shape from every owner at enrollment. Two conventions standing is the next agent imitating the wrong one.

## Gate economy

- Every gate names the mistake it prevents. A gate that cannot name one does not land.
- Judge gate work by net line delta; subtraction must leave an artifact.
- The enforcement surface is read-only to the agents it governs.
