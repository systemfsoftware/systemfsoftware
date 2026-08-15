---
'@systemfsoftware/omp-claude-compat': patch
---

`hook-verdict.workflow.ts` is now emitted from a declaration, and its pure decisions live in `hook-verdict.kernel.ts`.

A blank block reason now yields a stated fallback instead of an empty one. `parsed.reason ?? fallback` guards only nullish, so a hook emitting `"reason": ""` produced a block with no explanation at all. Blankness is decided on the trimmed value and a stated reason is returned verbatim, spacing included, so the hook's own words reach the user unchanged — the three existing workflow property tests pin exactly that and pass unchanged.

The relocation moved the decisions out of the mutation surface: `stryker.config.json` mutates `src/*.workflow.ts`, and the kernel's observer is a colocated K-law property test instead. Measured across the move, the killed-mutant count fell from 15 to 1 while the score stayed at 100 — a perfect score over one mutant. Seven K-laws now observe those decisions instead: exit classification is total, ignores stdout off the success path, and splits on the decision-object shape; a block always states a reason; the two stderr readers agree; the permission key shadows the legacy key; a parsed block reads the field its key implies. Five planted mutants were each caught by exactly the one law that governs them, with the other six staying green.
