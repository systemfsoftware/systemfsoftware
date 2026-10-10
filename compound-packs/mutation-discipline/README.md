# Mutation Discipline Compound Pack

Judgment for responding to mutation output. A surviving mutant is a report about the code or its tests, and each survivor gets one of three dispositions: a test that observes the behaviour the mutant broke, deletion of code that does nothing, or exclusion of declaration text by a shape-keyed ignorer; a baseline row is allowed only for an equivalent mutant on live code that no rewrite removes and no declaration shape identifies. The wrong dispositions (a test that restates the mutated expression, a baseline row over dead code, a disable comment beside a survivor) make the score pass while the report stops meaning anything.

What other owners already cover is not repeated here: taking expected values from an independent oracle (`CONSTITUTION.md` CONST-T10; `repos/constitution/docs/solutions/architecture-patterns/a-test-never-takes-its-expected-value-from-the-code-under-test.md`), schema refusal properties beside generated laws (`compound-packs/schema-laws/refusals-beside-generated-laws.md`), choosing what is mutated by what code is rather than its path (`CONSTITUTION.md` CONST-T12; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`), never weakening the grader (`CONSTITUTION.md` CONST-E7; `repos/constitution/ENFORCEMENT.md`), no local mutation runs (root `AGENTS.md` REPO-D3), splitting a package whose mutants exceed a job budget (`docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md`), and mocks on internal glue (`compound-packs/boundary-testing/no-mocks-on-internal-glue.md`).

Rules in this pack govern:

- Killing a survivor with a property whose expected value comes from the contract the mutant breaks, and reading a recurring survivor cluster as a circular oracle (`kill-survivors-with-contract-properties`).
- Deleting, or making unconstructable, code that no reachable input can kill, only where nothing reads it at runtime, with a baseline row as the last resort for equivalent mutants on live code (`unkillable-survivors-are-dead-code`).
- Excluding mutants no test should observe through a shared ignorer keyed on declaration shape, never through a disable comment or an excluded mutator (`suppress-by-shape-in-an-ignorer`).

No tool enforces these judgments; each rule's gate is review.
