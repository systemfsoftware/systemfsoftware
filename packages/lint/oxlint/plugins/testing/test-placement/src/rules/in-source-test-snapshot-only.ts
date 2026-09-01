import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { bindingBase } from './ancestors.js'
import {
  GUARD_FORM_ACTUAL,
  GUARD_FORM_EXPECTED,
  GUARD_FORM_FIX,
  GUARD_FORM_NAME,
  meta,
  NO_EMPTY_PLACEHOLDER_ACTUAL,
  NO_EMPTY_PLACEHOLDER_EXPECTED,
  NO_EMPTY_PLACEHOLDER_FIX,
  NO_EMPTY_PLACEHOLDER_NAME,
  PROPERTY_BAN_ACTUAL,
  PROPERTY_BAN_EXPECTED,
  PROPERTY_BAN_FIX,
  PROPERTY_BAN_NAME,
  SNAPSHOT_ONLY_ACTUAL,
  SNAPSHOT_ONLY_EXPECTED,
  SNAPSHOT_ONLY_FIX,
  SNAPSHOT_ONLY_NAME,
} from './in-source-test-snapshot-only.config.js'
import { RUNNER_NAMES } from './path.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import { isMetaVitest, isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'propertyBan' | 'snapshotOnly' | 'noEmptyPlaceholder' | 'guardForm'

const PROPERTY_IDENTIFIERS: Record<string, true> = {
  FastCheck: true,
  fc: true,
  Arbitrary: true,
}
const FAST_CHECK_SPECIFIER = 'fast-check'
const EFFECT_TESTING_SPECIFIER = 'effect/testing'

const destructuresFastCheck = (node: ESTree.ImportExpression): boolean => {
  let parent = node.parent
  if (parent !== null && parent.type === 'AwaitExpression') parent = parent.parent
  if (parent === null || parent.type !== 'VariableDeclarator') return false
  const id = parent.id
  if (id.type !== 'ObjectPattern') return false
  return id.properties.some(
    (property) =>
      property.type === 'Property' && property.key.type === 'Identifier' && property.key.name === 'FastCheck',
  )
}
const ASSERT_SPECIFIERS: Record<string, true> = {
  'node:assert': true,
  'node:assert/strict': true,
}

const baseExpressionOf = (expression: ESTree.Expression): ESTree.Expression => {
  if (expression.type === 'MemberExpression') return baseExpressionOf(expression.object)
  return expression
}

const isInTestBody = (node: { readonly parent: ESTree.Node | null }): boolean => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      (current.callee.name === 'it' ||
        current.callee.name === 'test' ||
        current.callee.name === 'describe')
    ) {
      return true
    }
    // member forms too: a throw inside an it.effect(...) callback is a test-body throw
    if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
      const base = bindingBase(current.callee)
      if (base !== undefined && RUNNER_NAMES.has(base)) return true
    }
    current = current.parent
  }
  return false
}

export const inSourceTestSnapshotOnly = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    const basename = basenameOf(filename)
    const underSrc = isUnderSrc(filename)
    const inTestFile = isTestFile(basename)
    if (!underSrc || inTestFile) return {}

    const guards: ESTree.IfStatement[] = []

    // One parent walk per node answers both membership questions: inside a
    // vitest-guard consequent, and inside a ruleOfSchemas(...) generated-law call.
    // The laws exemption covers the call's own arguments; a function boundary
    // crossed on the way up means hand-written code, and the exemption ends there.
    const classify = (node: { readonly parent: ESTree.Node | null }): { inBlock: boolean; inLaws: boolean } => {
      let inBlock = false
      let inLaws = false
      let crossedFunction = false
      let current = node.parent
      while (current !== null && !(inBlock && inLaws)) {
        if (current.type === 'FunctionExpression' || current.type === 'ArrowFunctionExpression') {
          crossedFunction = true
        }
        if (
          !inLaws &&
          !crossedFunction &&
          current.type === 'CallExpression' &&
          current.callee.type === 'Identifier' &&
          current.callee.name === 'ruleOfSchemas'
        ) {
          inLaws = true
        }
        if (!inBlock && guards.some((guard) => guard.consequent === current)) inBlock = true
        current = current.parent
      }
      return { inBlock, inLaws }
    }

    return {
      IfStatement(node: ESTree.IfStatement) {
        if (!isVitestGuard(node.test)) return
        guards.push(node)
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isMetaVitest(node)) return
        // Canonical positions only: the bare if-test, or one side of the
        // comparison if-test. A short-circuit, ternary, negated, or bound
        // reference still runs under vitest includeSource but registers no
        // guard here, so its contents would evade every arm of this rule.
        const parent = node.parent
        if (parent.type === 'IfStatement' && parent.test === node) return
        if (
          parent.type === 'BinaryExpression' &&
          parent.parent !== null &&
          parent.parent.type === 'IfStatement' &&
          parent.parent.test === parent
        ) {
          return
        }
        context.report({
          node,
          messageId: 'guardForm',
          data: {
            name: GUARD_FORM_NAME,
            expected: GUARD_FORM_EXPECTED,
            actual: GUARD_FORM_ACTUAL,
            fix: GUARD_FORM_FIX,
          },
        })
      },
      Identifier(node: ESTree.IdentifierReference) {
        if (PROPERTY_IDENTIFIERS[node.name] !== true) return
        const parent = node.parent
        if (parent.type === 'Property') {
          if (parent.key === node) return
          if (parent.value === node) {
            const grand = parent.parent
            if (grand !== null && (grand.type === 'ObjectPattern' || grand.type === 'ArrayPattern')) return
          }
        }
        if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return
        const membership = classify(node)
        if (!membership.inBlock || membership.inLaws) return
        context.report({
          node,
          messageId: 'propertyBan',
          data: {
            name: PROPERTY_BAN_NAME,
            expected: PROPERTY_BAN_EXPECTED,
            actual: PROPERTY_BAN_ACTUAL,
            fix: PROPERTY_BAN_FIX,
          },
        })
      },
      CallExpression(node: ESTree.CallExpression) {
        const membership = classify(node)
        if (!membership.inBlock || membership.inLaws) return

        // property-ban: it.prop / test.prop / it.effect.prop
        if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
          const prop = node.callee.property
          if (prop.type === 'Identifier' && prop.name === 'prop') {
            const base = bindingBase(node.callee.object)
            if (base !== undefined && RUNNER_NAMES.has(base)) {
              context.report({
                node,
                messageId: 'propertyBan',
                data: {
                  name: PROPERTY_BAN_NAME,
                  expected: PROPERTY_BAN_EXPECTED,
                  actual: PROPERTY_BAN_ACTUAL,
                  fix: PROPERTY_BAN_FIX,
                },
              })
              return
            }
          }
        }

        // snapshot-only: expectTypeOf
        if (node.callee.type === 'Identifier' && node.callee.name === 'expectTypeOf') {
          context.report({
            node,
            messageId: 'snapshotOnly',
            data: {
              name: SNAPSHOT_ONLY_NAME,
              expected: SNAPSHOT_ONLY_EXPECTED,
              actual: SNAPSHOT_ONLY_ACTUAL,
              fix: SNAPSHOT_ONLY_FIX,
            },
          })
          return
        }

        // snapshot-only + no-empty-placeholder: expect chains
        if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
          const prop = node.callee.property
          if (prop.type !== 'Identifier') return
          const terminal = prop.name
          const base = baseExpressionOf(node.callee)
          if (
            base.type === 'CallExpression' &&
            base.callee.type === 'Identifier' &&
            base.callee.name === 'expect'
          ) {
            // Only an expect(...) call chain reaches here — expect.any(...) and
            // friends have the bare `expect` identifier as base and never enter.
            // An authored toMatchInlineSnapshot literal passes; the capture
            // shapes — no argument, or runtime interpolation — are banned.
            if (terminal === 'toMatchInlineSnapshot') {
              const argument = node.arguments[0]
              if (
                argument === undefined ||
                (argument.type === 'TemplateLiteral' && argument.expressions.length > 0)
              ) {
                context.report({
                  node,
                  messageId: 'noEmptyPlaceholder',
                  data: {
                    name: NO_EMPTY_PLACEHOLDER_NAME,
                    expected: NO_EMPTY_PLACEHOLDER_EXPECTED,
                    actual: NO_EMPTY_PLACEHOLDER_ACTUAL,
                    fix: NO_EMPTY_PLACEHOLDER_FIX,
                  },
                })
              }
              return
            }
            // Any other terminal on expect(...) chain is snapshot-only violation
            context.report({
              node,
              messageId: 'snapshotOnly',
              data: {
                name: SNAPSHOT_ONLY_NAME,
                expected: SNAPSHOT_ONLY_EXPECTED,
                actual: SNAPSHOT_ONLY_ACTUAL,
                fix: SNAPSHOT_ONLY_FIX,
              },
            })
          }
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        const membership = classify(node)
        if (!membership.inBlock) return
        if (node.source.type !== 'Literal') return
        const source = node.source.value
        if (typeof source !== 'string') return
        if (source === FAST_CHECK_SPECIFIER || (source === EFFECT_TESTING_SPECIFIER && destructuresFastCheck(node))) {
          if (membership.inLaws) return
          context.report({
            node,
            messageId: 'propertyBan',
            data: {
              name: PROPERTY_BAN_NAME,
              expected: PROPERTY_BAN_EXPECTED,
              actual: PROPERTY_BAN_ACTUAL,
              fix: PROPERTY_BAN_FIX,
            },
          })
          return
        }
        if (ASSERT_SPECIFIERS[source] === true) {
          context.report({
            node,
            messageId: 'snapshotOnly',
            data: {
              name: SNAPSHOT_ONLY_NAME,
              expected: SNAPSHOT_ONLY_EXPECTED,
              actual: SNAPSHOT_ONLY_ACTUAL,
              fix: SNAPSHOT_ONLY_FIX,
            },
          })
        }
      },
      ThrowStatement(node: ESTree.ThrowStatement) {
        if (!classify(node).inBlock) return
        if (!isInTestBody(node)) return
        // A bare rethrow (`throw err`) propagates a caught failure; only a
        // constructed throw is an assertion channel.
        if (node.argument.type === 'Identifier') return
        context.report({
          node,
          messageId: 'snapshotOnly',
          data: {
            name: SNAPSHOT_ONLY_NAME,
            expected: SNAPSHOT_ONLY_EXPECTED,
            actual: SNAPSHOT_ONLY_ACTUAL,
            fix: SNAPSHOT_ONLY_FIX,
          },
        })
      },
    }
  },
})
