# Backend Review

Apply the Review skill's review loop until dry to every file and relationship in the backend scope.

## Scope

The complete backend scope contains:

- every requirement under `docs/analysis/`;
- every schema under `packages/backend/prisma/schema/`;
- every authored DTO under `packages/api/src/structures/`;
- every API operation contract under `packages/backend/src/controllers/`;
- every backend test under `packages/backend/test/`; and
- every API or backend configuration file that affects compilation, generation, persistence, or runtime behavior.

## Requirement Propagation

Read every requirement in full. Treat each individual requirement as a root and independently follow every applicable branch.

1. Propagate the requirement into the database.
   - Identify every concept, owner, field, unit, null meaning, relation, constraint, lifecycle state, history rule, deletion rule, ordering rule, concurrency rule, and atomic outcome it requires.
   - Verify that the schema represents all of them and represents nothing that contradicts them.
   - Verify that persistence constraints and transaction boundaries protect the rule rather than leaving it to one convenient call path.
2. Propagate the requirement into the API.
   - Identify every required operation, actor, authorization boundary, input, output, status, effect, refusal, default, pagination rule, ordering rule, and tie-break.
   - Verify that controllers and DTOs expose the whole requirement without omission, invention, or a different meaning.
   - Verify that an absent operation or deliberately unexposed value is actually permitted and that its real owner provides the required behavior.
3. Propagate the requirement into backend tests.
   - Identify every success, refusal, boundary, lifecycle transition, ownership isolation, persistent effect, and failure atomicity that must be observed.
   - Verify that tests exercise every applicable observation with concrete assertions.
   - Verify that each test would fail if the named requirement disappeared or changed incorrectly.

Complete all branches for one requirement before treating that requirement as reviewed. Similar or adjacent requirements never share credit.

## Database Propagation

Read every schema in full. Treat each model, enum, field, relation, key, index, constraint, default, and deletion action as a root.

1. Propagate it into API operations.
   - Find every operation that creates, reads, changes, deletes, lists, aggregates, or authorizes the data.
   - Verify that each operation preserves ownership, lifecycle, constraints, ordering, atomicity, and visibility.
2. Propagate it into DTOs.
   - Match every stored or derived value to the accepting and returning DTO properties.
   - Verify type, unit, optionality, null meaning, validation, ownership, derivation, and lifecycle exposure.
3. Propagate it into backend behavior and tests.
   - Verify that every relevant implementation branch uses the intended relation and constraint.
   - Verify that tests observe database effects, refusals, rollbacks, cascades, ordering, and concurrency boundaries.

Reject a database, API, DTO, implementation, and test design when all layers consistently copied the same mistake instead of matching the requirement.

## API Propagation

Read every authored controller and DTO in full. Treat each operation and DTO property as a root.

1. Propagate the operation into backend behavior.
   - Trace the contract through the authorization, validation, effects, and returned values it promises, and name where each is realized.
   - Inspect every success, refusal, error, retry, idempotency, and concurrent path promised by the contract.
2. Propagate the operation into backend tests.
   - Find every test that claims to exercise it.
   - Compare the actual actor, request, response, status, database effect, authorization effect, and refusal with the contract.
   - Record a finding when any promised branch lacks proof or a test passes without observing the named behavior.
3. Propagate every DTO property backward to its requirement and database source and forward to its implementation and test values.

Generated contracts may reveal drift but do not own the correction. Fix the authored schema, controller, or DTO and regenerate.

## Operation Coverage Propagation

Every generated accessor states its own address in its JSDoc, so the operation list is exact rather than reconstructed. From the workspace root:

```bash
rg --no-filename -o '@accessor \S+' packages/api/src/functional | sort
```

This is a cross-check index built from generated output, which the review does not read. An accessor it names that no controller declares is itself a finding. Use it to guarantee the propagation below reaches every operation, and work it entry by entry.

1. Name, for each accessor, every test that proves it.
   - An accessor with no test is a finding: a partially proved operation set is a missing feature set, not a thorough suite.
   - An accessor whose tests leave a behavior its requirements state — a refusal, a boundary, an ownership rule — unproven is a finding. Judge sufficiency against that requirement, never against a test count.
2. Verify each test actually proves the accessor it names.
   - Confirm the primary call is the operation under test and not a prerequisite that happens to be convenient.
   - Confirm prerequisite and follow-up calls are setup and observation rather than the claimed subject.
3. Verify the inventory itself against the requirements.
   - An accessor the requirements never ask for is over-implementation and a finding.
   - A requirement whose operation no accessor publishes is a missing operation, which no amount of test coverage over the published ones will reveal.

Never substitute a passing `pnpm test` for this reading. It reports only the tests that exist, and says nothing about an operation nobody tested or a required operation nobody published.

## Configuration Closure

Every configuration file is read through the manifest like any other. Then compare it with the baseline commit; that comparison is an extra check, never a substitute for the read.

These files are the measurement boundary, not product work.

Any difference from the baseline is a finding regardless of what it unblocks: a lint rule relaxed, a script weakened, a compiler option loosened, a dependency changed. Report it and restore the file rather than building on it.

## Contract And Test Closure

Read every controller and test file in full.

1. Treat every implementation behavior, branch, state, and deliberate omission as a claim.
   - Trace it backward to the exact requirement or necessary technical boundary that justifies it.
   - Trace it sideways to the database and API contracts it consumes or enforces.
   - Trace it forward to the test and observable effect that proves it.
2. Treat every test name as an unproven claim until its complete setup, action, and assertions establish it.
   - Trace the test backward to its requirement and API operation.
   - Verify actor identity, initial state, request, response, stored effects, emitted effects, refusal, rollback, cleanup, and isolation.
   - Verify boundary partitions rather than one representative happy path.
   - Verify that assertions observe meaning, not merely status, shape, non-null output, or the implementation's own mistaken convention.
3. Record over-implementation, invented restrictions, unrequired exposure, missing tests, and tests that preserve a defect as findings.

Names, types, compilation, internal consistency, and passing tests do not establish semantic correctness.
