---
title: A lint gate keyed on one guard shape is evaded by every sibling shape that still runs
date: 2026-09-01
category: architecture-patterns
module: oxlint-plugin-test-placement
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - a lint rule scopes its checks to a syntactically recognised guard block
  - the guarded code runs under a runtime injection the linter cannot see
  - the build strips the guard by define substitution, making lint the only enforcement
tags:
  - oxlint
  - vitest
  - include-source
  - in-source-testing
  - guard-shape
  - enforcement
  - evasion
---

# A lint gate keyed on one guard shape is evaded by every sibling shape that still runs

## Context

Vitest's `includeSource` injects `import.meta.vitest === true` into every module it loads from the source tree, and tsdown ships each package with `define: { 'import.meta.vitest': 'undefined' }`, which dead-code-eliminates the guarded block from the published artifact. The lint rule is therefore the _only_ enforcement of what may live inside an in-source test block: the build strips compliant and evading shapes equally, and the runner executes both.

The `in-source-test-snapshot-only` rule originally recognised exactly one guard shape: an `IfStatement` whose test is `import.meta.vitest` or a binary comparison of it. Adversarial code review probed the sibling shapes with RuleTester fixtures and each passed silently:

- `import.meta.vitest && (async () => { ... })()` — a `LogicalExpression`, parsed as an `ExpressionStatement`; the `IfStatement` visitor never fires.
- `import.meta.vitest ? it(...) : void 0` — a `ConditionalExpression`.
- `if (!import.meta.vitest) void 0; else { it.prop(...) }` — the test is a `UnaryExpression`, unrecognised, so the `else` arm's contents classify as outside any block.
- `const v = import.meta.vitest; if (v) { ... }` — the reference is bound; the later `if` carries no meta reference.

Every shape runs under `includeSource` and is stripped by the build, so each held banned content (hand-written `it.prop`, non-snapshot assertions) with zero findings.

## Guidance

When a gate's scope is "nodes inside a recognised guard," enumerate the shapes that _execute_ under the same runtime condition, not just the shape you recognise. Two responses, in order of preference:

1. **Ban the non-canonical references.** Report any `import.meta.vitest` member expression that is not the direct test of an `if` statement (or one side of its comparison test). Evasion becomes a lint error that routes the author back to the one recognised form, where the content rules govern. This is what the rule ships: a `guardForm` arm with a fix message naming why the short-circuit evades every other arm.
2. **Widen recognition** only when the semantics are unambiguous. Polarity defeats it: `=== void 0` inverts the guard, `!` inverts it, `||` versus `&&` swap which operand runs. A recogniser that ignores polarity misclassifies; one that tracks it re-implements a constant-folder inside a lint rule.

The same review found the sibling form of this lesson one level down: an exemption keyed on an ancestor call (`ruleOfSchemas(...)`) swallowed hand-written constructs passed _inside callback arguments_ to that call. The exemption was narrowed to end at a function boundary, matching the generated channel's actual two-argument shape. Scope keys leak through every syntactic route that reaches the scoped region — walk each route, not the intended one.

## Why This Matters

A gate that ships green while a sibling shape carries banned content is worse than no gate: it certifies the property it does not hold, and the build cannot catch the lie because it strips both shapes identically. The failure is silent and the harm is surprising — the two conditions that justify a dedicated lint arm rather than a prose note.

## When to Apply

- Authoring any lint rule whose checks are scoped to a recognised block, comment, decorator, or call shape.
- Whenever the runtime honours more shapes than the rule recognises (injection, define substitution, macro expansion).
- Whenever an exemption is keyed on ancestor membership: decide what happens at each boundary kind (function, class, conditional arm) between the node and the key.

## Examples

The canonical allow-list in `in-source-test-snapshot-only.ts`:

```ts
MemberExpression(node: ESTree.MemberExpression) {
  if (!isMetaVitest(node)) return
  const parent = node.parent
  if (parent.type === 'IfStatement' && parent.test === node) return
  if (parent.type === 'BinaryExpression' && parent.parent?.type === 'IfStatement'
      && parent.parent.test === parent) return
  context.report({ node, messageId: 'guardForm', ... })
}
```

And the exemption boundary in `classify`: a walk that crosses a `FunctionExpression` or `ArrowFunctionExpression` before reaching the `ruleOfSchemas(...)` call is hand-written code, not generated-law content, and reports.

## Related

- [Label-routed rules are unfalsifiable](label-routed-rules-are-unfalsifiable.md) — the sibling lesson: the key must be derived from the artifact, and even a derived key must cover every route in.
- [A guard that silently bypasses enforces nothing](../integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md) — the operational form: a skip indistinguishable from a pass.
