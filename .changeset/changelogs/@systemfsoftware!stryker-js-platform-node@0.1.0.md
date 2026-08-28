## 0.1.0

### Minor Changes

- Configured checkers now type-check mutants in the groups the checker returns, instead of checking the whole remaining set at once.

  Compile-error mutants are still reported as compile errors.

  The package now exports `checkGroupedPlans` and the `CheckerResourceService` type for that grouped check phase.

### Patch Changes

- A mutation run that is killed mid-way keeps every completed mutant: the JSONL progress stream is flushed after each result, and incremental mode writes remembered verdicts as they finish so the next run continues instead of starting over.

  Remembered killed mutants still name the tests that killed them, so a resumed run's report matches a complete run.

  The progress stream path is progressStreamFile (default reports/mutation-stream.jsonl) and can be set in config or with --progressStreamFile.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.
