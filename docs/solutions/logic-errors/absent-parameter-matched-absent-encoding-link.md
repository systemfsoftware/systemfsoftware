---
title: A declaration with no parameter matched its absent encoding link and lost its codec laws
date: 2026-11-16
category: logic-errors
module: effect-schema-law
problem_type: logic_error
component: testing_framework
symptoms:
  - "ruleOfSchemas on a Schema.declare or Schema.instanceOf schema registers only the single-inhabitant law"
  - "a codec that collapses distinct values into one passes every law ruleOfSchemas registers"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - effect-schema-law
  - ruleOfSchemas
  - schema-ast
  - declaration
  - single-inhabitant
  - optional-chaining
---

# A declaration with no parameter matched its absent encoding link and lost its codec laws

## Problem

`ruleOfSchemas` registers one deterministic law instead of the encode-stability and round-trip laws when `isSingleInhabitant` says the schema has one value. For a `Declaration` node it asked whether the node wraps its first type parameter by comparing `encoding?.[0]?.to` with `typeParameters[0]`. A `Schema.declare` node has neither, so the comparison read `undefined === undefined`, and the vacuous `[].every(...)` over its parameters agreed. Every opaque guard was classified single-inhabitant.

## Symptoms

- `ruleOfSchemas('Box', Schema.declare(isBox, { toCodecArbitrary }))` registers `∀x_Box_=x (single-inhabitant schema: a constant codec is correct)` and nothing else.
- That law only checks that the codec answers the same input the same way twice (`deterministicHolds` in `packages/schema/effect-schema-law/src/property.ts`), so a codec that returns one fixed value for every input passes.
- An annotation does not change it: annotations add no type parameter and no encoding.

## What Didn't Work

Using `Schema.declareConstructor` with a parameter is not a workaround. It is for parametric types; an opaque guard over varying values is what `Schema.declare` exists for, and the classifier has to be right for it.

## Solution

`wrapsItsParameter` in `packages/schema/effect-schema-law/src/RuleOfSchemas.ts` now takes the first parameter by destructuring and compares only when it exists. The comparison lives in `encodesTo(ast, parameter: SchemaAST.AST)`, whose parameter type cannot hold `undefined`, so an absent parameter can no longer be compared with an absent link.

```ts
// before: both sides absent compares equal
const wrapsItsParameter = (ast) => encodingLinkOf(ast)?.to === ast.typeParameters[0]

// after
const encodesTo = (ast: SchemaAST.Declaration, parameter: SchemaAST.AST): boolean =>
  encodingLinkOf(ast)?.to === parameter

const wrapsItsParameter = (ast: SchemaAST.Declaration): boolean => {
  const [parameter] = ast.typeParameters
  return parameter !== undefined && encodesTo(ast, parameter)
}
```

## Why This Works

The rule rests on what the two Effect constructors build (read in the vendored `repos/effect/packages/effect/src/Schema.ts`):

- `declare` calls `declareConstructor()([], …)`: a `Declaration` with no type parameters and no encoding. Its values are whatever its guard admits, which the AST cannot see.
- A schema class builds `new SchemaAST.Declaration([from.ast], …)` and then `decodeTo(to, transformation)(from)`, so its first encoding link points at the same AST object as its only type parameter. Its encoded side is that parameter, and decoding maps each encoded value to one class value, so when the parameter has one value the class has one value.

Only the second shape lets the AST prove a single value. The first must be treated as varying.

The two possible errors are not equal. Calling a varying schema single replaces the real laws with one any constant codec passes, so a broken codec ships green. Calling a single schema varying runs laws a correct codec still passes. When the AST cannot decide, classify as varying.

## Prevention

- The in-source block of `RuleOfSchemas.ts` holds the check: `DECLARED_INHABITANCE` rows for a bare `Schema.declare` and one with a `toCodecArbitrary` annotation (both varying) beside the existing class rows (`WrappedLiteral`, `WrappedEmpty` single; `WrappedWide` varying). The property `∀b_VariableBoxConstantCodec_→Refuted` shows the varying round-trip law refutes a constant codec for such a declaration, and `∀s_RuleOfSchemasLawCount_=Declared` counts the laws `ruleOfSchemas` registers: two for the annotated declaration and for a varying class, one for a single-valued class.
- When two optional lookups are compared with `===`, decide what "both absent" means before writing the comparison. Pass the side that must exist as a non-optional argument so the type rules out the absent case, as `encodesTo` does.
- A vacuous `every` over an empty list confirms whatever the guard before it let through; a decision that reads it needs the list's non-emptiness established first.
