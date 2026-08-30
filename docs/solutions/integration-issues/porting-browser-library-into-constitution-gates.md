---
title: "Porting an external library into a constitution-gated monorepo: five gate collisions and the invariants that resolve them"
date: 2026-08-30
category: integration-issues
module: effect-playwright
problem_type: integration_issue
component: tooling
symptoms:
  - "The Playwright Test runner rejects a migrated hook at runtime with \"First argument must use the object destructuring pattern\" after the parameter was renamed to satisfy an empty-pattern lint rule"
  - "A gherkin `Feature` body fails to type because every ported scenario's typed error channel differs from the step-error type the spec runner expects"
  - "Declaration emit fails with TS4023 `NodeInspectSymbol ... cannot be named` on exported consts whose types were inferred from a factory-hidden schema class"
  - "tsc reports TS2591 `Cannot find name 'node:stream'` in a package whose tsconfig omits the types entry, while an identical package typechecks"
  - "A test-title lint rule flags every ported scenario title because the package name embeds a substring the rule greps for"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - effect-playwright
  - oxlint-guard
  - vitest-config
  - tsconfig
tags:
  - library-port
  - gherkin-spec
  - playwright-test-runner
  - schema-declaration-location
  - exact-optional-property-types
---

# Porting an external library into a constitution-gated monorepo

## Problem

A wholesale port of an upstream library arrives with its own runtime contracts (a test runner that validates callback signatures at runtime, framework-specific stack-frame attribution) and its own style. The host monorepo's gates — a lint `all` preset with type-aware rules, schema-location placement rules, test-placement and naming rules, declaration-emitting typecheck — each reject a slice of that surface. Fixing any single gate in isolation produces either a runtime break (the runner rejecting a renamed parameter), a silent type-narrowing regression, or a declaration-emit failure that surfaces only under the monorepo's composite typecheck.

## Failure mechanisms

1. **Runtime-validated callback signatures outrank style renames.** The upstream runner requires a hook's first parameter to be an object-destructuring pattern and fails at runtime with "First argument must use the object destructuring pattern" when the port renames `{}` to a named parameter to satisfy an empty-pattern lint rule. Renaming fixes lint and breaks the runner.
2. **Framework stack-frame attribution is frame-count sensitive.** A registration helper implemented as an arrow function inserts a user-module frame between the framework's registration API and its caller; the framework then attributes the registered test's source location to the helper file. `Function.prototype.bind` adds no such frame.
3. **Substring tag heuristics collide with namespaces that embed the substrings.** A lint rule detects Either-tag assertions by upper-casing the asserted string and checking for `LEFT`/`RIGHT`; a namespace containing the letters `wright` (as in "playwright") trips the heuristic for any direct `_tag` equality assertion.
4. **Factory-hidden schema classes break declaration emit.** Moving a `Schema.TaggedError` subclass into a factory to satisfy a module-scope schema-location rule exports an anonymous inferred type; composite declaration emit then cannot name the `NodeInspectSymbol` leaking from the Effect base class (TS4023) across every consumer of the exported const.
5. **`node:` built-in resolution is include-graph dependent under the native compiler.** With an explicit `types: []` (or when the include graph never pulls a node-typed module), the native tsc skips `node:stream`-style specifiers as "absolute URI" and reports TS2591; the same file typechecks once the package's tsconfig include set matches the canonical one (`src` + `tests`), because test files import node-typed test tooling that pulls `@types/node` into the program.

## Architectural invariants

- **A runtime-validated signature is the contract; the style gate bends.** Where a framework validates callback shape at runtime, the lint conflict resolves as a targeted, justified single-line disable — never by renaming the parameter and never by weakening the lint configuration.
- **Never insert a user-module frame between a framework's registration API and its caller.** Where a framework attributes behavior by stack frame, use a frame-neutral adapter (`bind`) rather than a closure; a closure wrapper changes the attribution the framework documents.
- **Schema-bearing declarations live only in schema-suffixed files, as real named declarations.** Factory laundering to dodge a placement rule converts a named class into an anonymous inferred type and breaks declaration emit downstream; the file relocation is the fix, the factory is a defect.
- **Port tests through the host's testing constitution, but assert discrimination structurally.** Where a naming heuristic would misfire, assert the discriminator with a structured matcher (`toMatchObject({ _tag })`) rather than string equality — the assertion keeps its power and the heuristic never engages.
- **Match the canonical tsconfig include set exactly.** Ambient type availability for `node:` built-ins flows through what the include graph pulls; a missing `tests` include silently removes `@types/node` from the program.

## Verification

- Package gates after resolution: package lint reports zero diagnostics; `tsc --noEmit` composite run reports zero errors; the vitest suite (97 tests, real chromium) and the upstream-runner e2e suite (12 passed, 2 skipped) both exit 0; the repo's `check:local` chain exits 0.
- Differential testing against the upstream source: every upstream scenario maps to exactly one host-side scenario, and assertions dropped by a rewrite (tag discriminators, error-channel witnesses) are restored rather than assumed equivalent.
