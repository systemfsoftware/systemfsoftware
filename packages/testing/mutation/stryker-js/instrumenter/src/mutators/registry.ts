import { arithmeticOperatorMutator } from './arithmetic-operator-mutator.js'
import { arrayDeclarationMutator } from './array-declaration-mutator.js'
import { arrowFunctionMutator } from './arrow-function-mutator.js'
import { assignmentOperatorMutator } from './assignment-operator-mutator.js'
import { blockStatementMutator } from './block-statement-mutator.js'
import { booleanLiteralMutator } from './boolean-literal-mutator.js'
import { conditionalExpressionMutator } from './conditional-expression-mutator.js'
import { equalityOperatorMutator } from './equality-operator-mutator.js'
import { logicalOperatorMutator } from './logical-operator-mutator.js'
import { methodExpressionMutator } from './method-expression-mutator.js'
import type { NodeMutator } from './node-mutator.js'
import { objectLiteralMutator } from './object-literal-mutator.js'
import { optionalChainingMutator } from './optional-chaining-mutator.js'
import { regexMutator } from './regex-mutator.js'
import { stringLiteralMutator } from './string-literal-mutator.js'
import { unaryOperatorMutator } from './unary-operator-mutator.js'
import { updateOperatorMutator } from './update-operator-mutator.js'

/**
 * Every mutator this instrumenter can apply, named explicitly.
 *
 * This list is deliberately hand-written rather than self-registering. A
 * registry populated by import side effects — each mutator module calling
 * `registerMutator(self)` at module scope — makes the mutant population depend
 * on which imports were evaluated: import order decides the order, a bundler
 * that judges a side-effect-only import unused drops a mutator entirely, and
 * anything reading the array before the last import finished sees a short list.
 * Every one of those failures REMOVES mutants, which RAISES the mutation score,
 * so the tool reports a better number for doing less work and nothing anywhere
 * says so.
 *
 * Naming each mutator here costs one line when a mutator is added and makes
 * that line a compile-checked import instead of a runtime effect.
 */
export const allMutators: readonly NodeMutator[] = Object.freeze([
  arithmeticOperatorMutator,
  arrayDeclarationMutator,
  arrowFunctionMutator,
  assignmentOperatorMutator,
  blockStatementMutator,
  booleanLiteralMutator,
  conditionalExpressionMutator,
  equalityOperatorMutator,
  logicalOperatorMutator,
  methodExpressionMutator,
  objectLiteralMutator,
  optionalChainingMutator,
  regexMutator,
  stringLiteralMutator,
  unaryOperatorMutator,
  updateOperatorMutator,
])
