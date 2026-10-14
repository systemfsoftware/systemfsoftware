---
title: A test's subject is shipped code, never a function, table or literal the test file declares
applies_when:
  - a test file (a file the test runner collects that ships nothing) declares a function, matcher, regex, table or literal and asserts on that declaration
  - a test asserts what the language, the runtime or a dependency does instead of what the package does
  - a contract or tripwire test compares a value the test file wrote with another value the test file wrote
tags: [test-subjects, test-oracles, tautology, test-discipline]
---

CONST-T3 asks that every test be able to fail when the behaviour it names breaks (`CONSTITUTION.md:90-95`), and CONST-T8 asks that tests exercise what ships (`CONSTITUTION.md:78-83`). A test whose subject the test file declares exercises code that no consumer runs, so a defect in the shipped code leaves it green. `expected-values-never-come-from-the-subjects-output` governs where a test's expected value comes from. `compound-packs/schema-laws/tests-own-no-schemas.md` refuses a schema a test declares for itself. This rule governs what the test calls, for every kind of subject.

## Rule

- **The subject is declared in a module the package ships.** The function, predicate, schema or table a test asserts on is declared in a shipped module. A test file, meaning a file the test runner collects that ships nothing, imports the subject through the route the test-placement lint allows. A helper under the test tree ships nothing either, so a subject it declares fails this rule just as one the test file declares would. An in-source test block inside a shipped module may assert on that module's own declarations, because they ship. A test file may declare the inputs it feeds that subject: fixtures, arbitraries, builders, fakes. It never declares the thing whose behaviour it asserts. A schema among those inputs follows `tests-own-no-schemas`. A binding a shipped module exports only so a test can reach it is not shipped for this rule's purpose: the test goes through a binding a consumer uses, or it is deleted (`tests-own-no-schemas` rule 4 states the same for schemas).
- **No test of the platform standing in for the package.** A test does not assert what the language, the runtime or a dependency does (`Object.is` against `===`, how a regex matches) as a stand-in for what the package does. A dependency behaviour the package relies on is pinned by a differential parity test (`pin-dependency-semantics`). The reason the code chose one behaviour over another belongs in that code's doc comment, not in a test.
- **A case table checks a shipped predicate.** When a table of cases in a test file checks a predicate that the test file or a test-tree helper declares, the table and the predicate are deleted together. An in-source table in a shipped module checks that module's own predicate and stays. If the code needs the predicate, it moves to the module that uses it, and the test imports it from there.

```ts
// WRONG: systemfsoftware/systemfsoftware 4ae7e9e17c:scripts/tools/mutation-probe.contract.test.ts:23,63
const namesStryker = (key: string): boolean => NAMED.some((pattern) => pattern.test(key))
assertEquals(cases.filter(([key, flagged]) => namesStryker(key) !== flagged), [])

// RIGHT: neutral shape, no citation
import { overridesNamingStryker } from '@scope/workspace-tools'
assertEquals(overridesNamingStryker({ overrides: { '@scope/stryker-js': '17.0.2' } }), ['@scope/stryker-js'])
```

Incidents. On 2026-08-17, `3f59d516ba` deleted `packages/effect-purity-law/src/__tests__/rule-of-purity.kernel.test.ts`, which the commit message calls "two tautologies that asserted a file's own literals and JavaScript's own Object.is semantics". `wrap` and `half` were declared in that test file (`3f59d516ba^:packages/effect-purity-law/src/__tests__/rule-of-purity.kernel.test.ts:5,8`). Its last two `describe` blocks asserted `Object.is` on those two functions, and the first of them also asserted `===` (`:24-39`). On 2026-10-13, #747 (`4ae7e9e17c`) merged `scripts/tools/mutation-probe.contract.test.ts`. Its `namesStryker` matcher was declared in the test file (`:20-23`) and checked by a case table in the same file (`:43-64`). The repository owner rejected that test as "completely tautological", and #767 deletes it.

Gate: `review` — Does a test file the diff adds or changes assert on a function, matcher, regex, table or literal declared in the test file or in a test-tree helper, instead of on one a shipped module declares, or on a binding a shipped module exports only so the test can reach it? Does it assert what the language, the runtime or a dependency does as a stand-in for what the package does? Does a case table check a predicate the same file declares?
