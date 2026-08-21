## 3.0.0

### Major Changes

- Three new rules, a retargeted test-placement taxonomy, and one removal.

  `make-file-location` allows a workflow constructor only in the workflow module that owns it, at most once per module.

  `schema-declaration-location` requires a schema declaration to live in a schema module, or the workflow module that owns it. A binding whose initializer returns something other than a schema — a type guard, a decoder, an encoder, an arbitrary — is a use and is not reported.

  `test-placement` narrows which tests may sit beside source, requires every other test to live in the package test directory, and adds `tests-dir-helpers-in-fixtures`. It also removes `in-source-test-targets-private`, which `effect-dmmf` no longer re-exports — drop the entry if you set it. Each rule reports the exact shape it expects.

### Minor Changes

- `behaviour-exercises-use-case` now reports only a `*.integration.test.ts` whose every import is its test runner, the spec package, or `effect` — a file asserting over values it built itself. It previously demanded an import whose filename ended in `Executor`, `Handler`, `Adapter`, `Store` or `Middleware`, which a file satisfied by naming any module that way, however pure. Whether an imported module performs I/O cannot be read from the importing file, so the rule no longer claims to decide it: a behaviour test that reaches the package under test is accepted, and the altitude of what it reaches is left to review. Tests that named a role-suffixed module to satisfy the old form continue to pass; a test that reached nothing but its runner was accepted before and is now reported.

- A new rule, `no-io-module-in-source-test`, reports an in-source test block in a module that performs I/O.

  It decides that a module performs I/O from the module's own syntax: a binding imported from a filesystem, process or network module and then called. A type-only import is ignored, on both the statement and the inline form, because nothing it names survives to run. A binding that is imported but never called is ignored too. The report lands on the in-source test guard.

  The rule reads nothing but the module you give it — not its name, not its directory. A module whose tests live in separate files is a no-op for this rule, whatever it imports, so enabling it changes nothing for a project that keeps tests outside source.

  It is enabled at error severity in the recommended set of both packages, so spreading that set is all it takes.

- An in-source test block that discharges a schema law is no longer required to exercise a
  module-private binding. A law pins a constraint carried by one schema declaration, and
  that declaration is usually exported precisely because it is a wire contract worth
  pinning, so the demand never fitted it. A block earns this by importing the law harness,
  statically or dynamically; nothing else spells it, and blocks that assert on exported
  behaviour are still reported

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.
