---
title: A shared AST helper silently vacuumed two of the three rules that used it
date: 2026-08-13
category: logic-errors
module: oxlint-plugin-effect-workflow
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - a lint rule reports zero findings on a file that plainly violates it
  - one rule in a plugin fails loudly while sibling rules using the same helper go quiet
  - "a rule's count-based message reads `Actual: 0 function exports` on a file with an exported function"
  - changing the shape of a declaration turns several unrelated rules green at once
root_cause: logic_error
resolution_type: code_fix
tags:
  - oxlint
  - lint-rule
  - ast
  - estree
  - vacuous-check
  - shared-helper
  - silent-failure
---

# A shared AST helper silently vacuumed two of the three rules that used it

## Problem

Three lint rules in one plugin shared a helper that answered "which function does this export supply?". The helper recognised only an inline arrow or function expression. When the codebase migrated its exports from `export const w = (c: Cmd) => …` to `export const w = Workflow.make((c: Cmd) => …)`, the initializer became a `CallExpression`, the helper returned `undefined`, and all three rules saw **zero exported functions**. One rule failed loudly. The other two reported green and checked nothing.

## Symptoms

- `workflow-single-function-export` failed with `Actual: 0 function exports` on a file with exactly one exported function — a count-based message, so the vacuity was visible in the text.
- `workflow-command-object` and `workflow-schema-required`'s `missingErrorChannel` check reported no findings on the same files. Both iterate a list of exported functions; an empty list means every loop body is skipped, so there is nothing to report and nothing to notice.
- A full `pnpm check:local` was green while two gates were inert.

## What Didn't Work

- **Reading the rules' own tests.** Every `RuleTester` suite stayed green throughout, because the fixtures were written in the pre-migration shape the helper still recognised. A rule's unit tests cannot detect that the rule no longer fires on real code; they pin the rule against the inputs the author imagined, and the migration changed the inputs.
- **Trusting the loud failure as the whole blast radius.** `workflow-single-function-export`'s error looked like a single-rule bug. Fixing that rule alone would have left the other two silently inert, because only one of the three phrased its check as a count.
- **Grepping for the rule names.** The coupling was not through the rule names; it was through one imported helper, and the two silent rules named nothing that a search for the failing rule would surface.

## Solution

Fix the shape recognition at the single shared point, so all three consumers agree by construction. `packages/oxlint-plugins/effect-workflow/src/rules/exported-workflow-fn.ts:9-28` now unwraps one level of `.make(…)` call before asking whether the argument is a function:

```ts
const makeCallArgument = (init: ESTree.Node): ESTree.Node | undefined => {
  if (init.type !== 'CallExpression') return undefined
  const callee = init.callee
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'make') return undefined
  const [first] = init.arguments
  if (first === undefined) return undefined
  if (first.type !== 'ArrowFunctionExpression' && first.type !== 'FunctionExpression') return undefined
  return first
}

export const workflowFunctionInit = (decl: ESTree.VariableDeclarator): ESTree.Node | undefined => {
  const init = decl.init
  if (init === null || init === undefined) return undefined
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return init
  return makeCallArgument(init)
}
```

All three rules consume it — `workflow-command-object.ts:55`, `workflow-schema-required.ts:115`, `workflow-single-function-export.ts:120` — so the shape is defined once and a disagreement is unconstructable.

## Why This Works

The defect was never in the three rules; it was that each rule's reach depended on a predicate none of them owned. Repairing the predicate restores all three at once, and locating it in one exported helper means the next initializer shape that appears has exactly one place to be taught.

The deeper property is the asymmetry between how the three rules fail. A rule that reports **counts** exposes its own vacuity in its message: `Actual: 0` on a non-empty file is self-refuting. A rule that **iterates a collection and reports per element** cannot: an empty collection produces silence, which is byte-identical to compliance. That asymmetry is why one of three failures was visible.

## Prevention

- **Give a rule that iterates a collection a non-empty precondition.** If a rule's whole check is "for each exported function, assert P", then finding zero exported functions in a file the rule was written to govern is itself reportable — or at minimum distinguishable from a clean pass. Silence must not be the encoding for both "compliant" and "found nothing to look at".
- **Treat a shared matcher as the rules' contract, not a convenience.** When several rules key on one helper, its predicate is the reach of all of them; widening the shapes the codebase writes without widening the helper silently narrows every consumer.
- **Prove a rule's red path against a real file, not only its `RuleTester` fixtures.** A green fixture suite is consistent with a rule that no longer matches anything in the repository. Invert an assertion in a real source file and confirm the rule actually reports before believing a clean run.
- **When one rule in a family breaks, enumerate the family by shared import.** The blast radius of a shape change follows the helper's import graph, not the failing rule's name.

## Related

- `docs/solutions/integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md` — the same class in a different instrument: a check handed a payload shape it did not recognise, reporting success while inspecting nothing.
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — the migration that changed the initializer shape, and why the rules could not be retired in favour of the type.
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — a green run that teaches a later reader something was verified when nothing was.
- PR #135 — carries the helper fix and the three consumers.
