---
'@systemfsoftware/stryker-test-contribution': minor
---

The test-contribution gate now reports only verdicts its mutation report supports. A test file that the report gave no killable, covered mutant is reported as unjudged rather than accused, an all-unmapped `killedBy` no longer credits (or spares) a real file on the strength of an id that names nothing, and the deletion counterfactual is scoped to the accused set only when deleting that set together would actually leave every mutant just as dead. Passes that previously claimed every file kills a mutant nothing else kills now state honest judged, exempted, and unjudged counts. `TestFileContribution` gains a `killableCovered` field reporting how many non-`Ignored` mutants a file covers.
