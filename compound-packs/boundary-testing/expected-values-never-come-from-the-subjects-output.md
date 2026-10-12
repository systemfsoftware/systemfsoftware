---
title: A test's expected value never comes from what the code under test wrote
applies_when:
  - a test file compares a generator's output with a file the test reads
  - the diff adds or changes a file a test reads its expected value from, together with the code that generates it
  - a PR body cites a drift-gate script as a generator's test
tags: [test-oracles, snapshots, golden-files, generated-code, test-discipline]
---

A test whose expected value came from the code under test is a tautology: it asserts that the code equals itself, so it passes whether or not the code is right. CONST-T10 states the law (`CONSTITUTION.md:84-89`): "Take every expected value from an oracle the code under test did not produce - a spec literal, an independent fixture, a law between two views, or a second implementation." The constitution's solution doc names the shapes (`repos/constitution/docs/solutions/architecture-patterns/a-test-never-takes-its-expected-value-from-the-code-under-test.md:18-30`). This rule adds the check, the shapes the review reads from a diff, and the incident.

## Rule

A test in a test file never takes its expected value from what the code under test generated or wrote:

- Do not compare the generator's fresh output against a committed generated artifact, a golden file recorded from the generator, or a value the subject wrote that the test reads back.
- Do not add or change a file in the same diff if a test reads its expected value from that file and the same diff contains the code that generates that file (a re-bless).
- Allowed oracles are the ones CONST-T10 lists: a spec literal written in the test, an independent fixture, a law between two views (an encode-then-decode round trip through an independent reader), or a second implementation. A prior version of the code and captured production output of the code under test are not oracles.
- The kind of file that holds a comparison decides whether this rule governs it. A comparison inside a test file, meaning a file the package's test runner collects, is governed. A drift-gate script outside the test lanes, such as a package's `api:check` over `etc/*.api.md`, is not governed, and no plan, PR body or rule cites such a gate as the generator's test.

Snapshot matchers are refused at compile time and run time by `@systemfsoftware/vitest` (`packages/runner/vitest/src/internal/refusals.ts:54-63`); this rule does not restate them.

```ts
// WRONG: A test that compares a generator's output with a committed golden file
expect(await generateSpec(app)).toEqual(JSON.parse(await readFile('openapi.json', 'utf8')))

// RIGHT: A test that asserts against a spec literal from the contract
expect(Object.keys(spec.paths)).toEqual(['/orders', '/orders/{id}'])
```

Incident, 2026-10-10: several example apps each had a test that only compared a committed generated OpenAPI file with the generator's own output, and a long golden text fixture of a code generator's output sat beside them. Both were deleted, and no test replaced either.

Gate: `review` — Does any test file the diff adds or changes take its expected value from output the code under test produced (a committed generated or golden file, or a value the subject wrote and the test reads back) instead of a spec literal, an independent fixture, a law between two views or a second implementation? Does the diff add or change a file a test reads its expected value from, together with the code that generates that file? Does the diff or the PR body cite a drift-gate script as the generator's test?
