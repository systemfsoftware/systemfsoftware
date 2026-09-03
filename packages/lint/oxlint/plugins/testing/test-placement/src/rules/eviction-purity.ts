import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  DUMMY_MARKER_SELF_ASSERTION_ACTUAL,
  DUMMY_MARKER_SELF_ASSERTION_EXPECTED,
  DUMMY_MARKER_SELF_ASSERTION_FIX,
  DUMMY_MARKER_SELF_ASSERTION_NAME,
  EQUALITY_MATCHERS,
  MARKER_NAME_PATTERN,
  meta,
  SAME_CALLEE_RECONSTRUCTION_ACTUAL,
  SAME_CALLEE_RECONSTRUCTION_EXPECTED,
  SAME_CALLEE_RECONSTRUCTION_FIX,
  SAME_CALLEE_RECONSTRUCTION_NAME,
  SILENT_EARLY_RETURN_ACTUAL,
  SILENT_EARLY_RETURN_EXPECTED,
  SILENT_EARLY_RETURN_FIX,
  SILENT_EARLY_RETURN_NAME,
  SUBSTRING_METHODS,
  TEST_CALLBACK_NAMES,
  VACUOUS_PREDICATE_ACTUAL,
  VACUOUS_PREDICATE_EXPECTED,
  VACUOUS_PREDICATE_FIX,
  VACUOUS_PREDICATE_NAME,
} from './eviction-purity.config.js'
import { isInSanctionedTestDir } from './path.js'

export type MessageIds =
  | 'sameCalleeReconstruction'
  | 'dummyMarkerSelfAssertion'
  | 'silentEarlyReturn'
  | 'vacuousPredicate'

/**
 * Eviction purity for relocated blocks. Applies only inside a `tests/`
 * directory; every other file is a no-op. Four arms, each deliberately
 * conservative — what each arm matches is exactly what its predicate below
 * tests, no more:
 *
 * - same-callee reconstruction: `expect(<actual>).toBe|toEqual|toStrictEqual(<CallExpression>)`
 *   (with one optional `.not`). Any call in the expected slot counts — the
 *   rule does not prove the callee is the SUT's own helper, so a contract
 *   literal in the expected slot is the only clean shape.
 * - dummy-marker self-assertion: `expect(<Identifier>).toBe(<string literal>)`
 *   where the identifier either matches `__private*Marker` (the name alone
 *   flags it — a differing literal does not clean it up) or names a `const`
 *   declared in the same file with that identical literal. A literal pinned
 *   against an undeclared or differently-valued binding is clean. Only
 *   locally declared `const` string literals register, so a marker imported
 *   across modules, or a non-string literal, escapes this arm.
 * - silent early return: `if (<anything>) return` (bare, argument-free —
 *   directly or as a statement of a consequent block) whose `IfStatement`
 *   sits inside an `it(...)`/`test(...)` inline callback. Only the bare
 *   identifiers are recognised: `it.only`, `it.skip`, `it.todo`, `xit`,
 *   `fit`, and all `describe`-level bodies are not, and a silent return
 *   inside them escapes. A guard that throws, or a return carrying a value,
 *   is clean.
 * - vacuous predicate: `expect(<member>.<includes|toContain>(<string>)).toBe|toEqual|toStrictEqual(false)`,
 *   or the same actual with `.toBeFalsy()`. The same pin asserted to `true`
 *   is clean — the rule keys on the boolean-false comparison, not on the
 *   substring itself.
 */
export const evictionPurity = defineRule({
  meta,
  create(context: Context) {
    if (!isInSanctionedTestDir(context.filename)) return {}

    const constLiterals = new Map<string, string>()
    const testBodies: ESTree.Node[] = []

    const isInsideTestBody = (node: ESTree.Node): boolean => {
      let current: ESTree.Node | null = node.parent
      while (current !== null) {
        if (testBodies.includes(current)) return true
        current = current.parent
      }
      return false
    }

    const consequentHasBareReturn = (consequent: ESTree.Statement): boolean => {
      if (consequent.type === 'ReturnStatement') return consequent.argument === null
      if (consequent.type !== 'BlockStatement') return false
      return consequent.body.some(
        (statement) => statement.type === 'ReturnStatement' && statement.argument === null,
      )
    }

    return {
      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const declarator of node.declarations) {
          if (declarator.id.type !== 'Identifier') continue
          if (declarator.init === null || declarator.init === undefined) continue
          if (declarator.init.type !== 'Literal') continue
          if (typeof declarator.init.value !== 'string') continue
          constLiterals.set(declarator.id.name, declarator.init.value)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === 'Identifier' && TEST_CALLBACK_NAMES[node.callee.name] === true) {
          for (const argument of node.arguments) {
            if (
              argument.type === 'ArrowFunctionExpression' ||
              argument.type === 'FunctionExpression'
            ) {
              testBodies.push(argument)
              break
            }
          }
        }

        if (node.callee.type !== 'MemberExpression') return
        if (node.callee.property.type !== 'Identifier') return
        const matcher = node.callee.property.name
        let receiver: ESTree.Node = node.callee.object
        if (
          receiver.type === 'MemberExpression' &&
          receiver.property.type === 'Identifier' &&
          receiver.property.name === 'not'
        ) {
          receiver = receiver.object
        }
        if (receiver.type !== 'CallExpression') return
        if (receiver.callee.type !== 'Identifier' || receiver.callee.name !== 'expect') return
        const [actual] = receiver.arguments
        if (actual === undefined || actual.type === 'SpreadElement') return
        const [expected] = node.arguments

        if (
          EQUALITY_MATCHERS[matcher] === true &&
          expected !== undefined &&
          expected.type === 'CallExpression'
        ) {
          context.report({
            node: expected,
            messageId: 'sameCalleeReconstruction',
            data: {
              name: SAME_CALLEE_RECONSTRUCTION_NAME,
              expected: SAME_CALLEE_RECONSTRUCTION_EXPECTED,
              actual: SAME_CALLEE_RECONSTRUCTION_ACTUAL,
              fix: SAME_CALLEE_RECONSTRUCTION_FIX,
            },
          })
          return
        }

        if (
          EQUALITY_MATCHERS[matcher] === true &&
          actual.type === 'Identifier' &&
          expected !== undefined &&
          expected.type === 'Literal' &&
          typeof expected.value === 'string' &&
          (MARKER_NAME_PATTERN.test(actual.name) || constLiterals.get(actual.name) === expected.value)
        ) {
          context.report({
            node,
            messageId: 'dummyMarkerSelfAssertion',
            data: {
              name: DUMMY_MARKER_SELF_ASSERTION_NAME,
              expected: DUMMY_MARKER_SELF_ASSERTION_EXPECTED,
              actual: DUMMY_MARKER_SELF_ASSERTION_ACTUAL,
              fix: DUMMY_MARKER_SELF_ASSERTION_FIX,
            },
          })
          return
        }

        if (actual.type !== 'CallExpression' || actual.callee.type !== 'MemberExpression') return
        if (actual.callee.property.type !== 'Identifier') return
        if (!SUBSTRING_METHODS[actual.callee.property.name]) return
        if (actual.callee.object.type !== 'MemberExpression') return
        const [pinned] = actual.arguments
        if (pinned === undefined || pinned.type !== 'Literal' || typeof pinned.value !== 'string') {
          return
        }
        const assertsFalse = (EQUALITY_MATCHERS[matcher] === true &&
          expected !== undefined &&
          expected.type === 'Literal' &&
          expected.value === false) ||
          matcher === 'toBeFalsy'
        if (!assertsFalse) return
        context.report({
          node,
          messageId: 'vacuousPredicate',
          data: {
            name: VACUOUS_PREDICATE_NAME,
            expected: VACUOUS_PREDICATE_EXPECTED,
            actual: VACUOUS_PREDICATE_ACTUAL,
            fix: VACUOUS_PREDICATE_FIX,
          },
        })
      },
      IfStatement(node: ESTree.IfStatement) {
        if (!isInsideTestBody(node)) return
        if (!consequentHasBareReturn(node.consequent)) return
        context.report({
          node,
          messageId: 'silentEarlyReturn',
          data: {
            name: SILENT_EARLY_RETURN_NAME,
            expected: SILENT_EARLY_RETURN_EXPECTED,
            actual: SILENT_EARLY_RETURN_ACTUAL,
            fix: SILENT_EARLY_RETURN_FIX,
          },
        })
      },
    }
  },
})
