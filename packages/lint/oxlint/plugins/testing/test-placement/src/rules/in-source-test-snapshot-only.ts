import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
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
import { basenameOf, isTestFile, isUnderSrc } from './path.js'
import { isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'propertyBan' | 'snapshotOnly' | 'noEmptyPlaceholder'

const PROPERTY_IDENTIFIERS: Record<string, true> = {
  FastCheck: true,
  fc: true,
  Arbitrary: true,
}
const RUNNER_BASES: Record<string, true> = {
  it: true,
  test: true,
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

const isInsideConsequent = (
  node: { readonly parent: ESTree.Node | null },
  consequent: ESTree.Node,
): boolean => {
  const walk = (current: ESTree.Node | null): boolean => {
    if (current === null) return false
    if (current === consequent) return true
    return walk(current.parent)
  }
  return walk(node.parent)
}

const baseIdentifierOf = (expression: ESTree.Expression): string | undefined => {
  if (expression.type === 'MemberExpression') return baseIdentifierOf(expression.object)
  if (expression.type === 'Identifier') return expression.name
  return undefined
}

const baseExpressionOf = (expression: ESTree.Expression): ESTree.Expression => {
  if (expression.type === 'MemberExpression') return baseExpressionOf(expression.object)
  return expression
}

const isInsideRuleOfSchemas = (node: { readonly parent: ESTree.Node | null }): boolean => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'ruleOfSchemas'
    ) {
      return true
    }
    current = current.parent
  }
  return false
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
    // also handle member forms like it.effect.xxx? not needed for throw body check — base is it/test
    if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
      const base = baseIdentifierOf(current.callee)
      if (base !== undefined && RUNNER_BASES[base] === true) return true
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

    const isInSourceBlock = (node: { readonly parent: ESTree.Node | null }): boolean =>
      guards.some((guard) => isInsideConsequent(node, guard.consequent))

    return {
      IfStatement(node: ESTree.IfStatement) {
        if (!isVitestGuard(node.test)) return
        guards.push(node)
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
        if (isInsideRuleOfSchemas(node)) return
        if (!isInSourceBlock(node)) return
        // Canonical only: computed access or alias not flagged — but Identifier reference is canonical.
        // We already only match canonical names; alias like `const e = expect` won't be 'fc'.
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
        if (!isInSourceBlock(node)) return
        if (isInsideRuleOfSchemas(node)) return

        // property-ban: it.prop / test.prop / it.effect.prop
        if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
          const prop = node.callee.property
          if (prop.type === 'Identifier' && prop.name === 'prop') {
            const base = baseIdentifierOf(node.callee.object)
            if (base !== undefined && RUNNER_BASES[base] === true) {
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
            // Do not flag matcher factories: already handled — base is CallExpression, not bare Identifier.
            // If terminal is toMatchInlineSnapshot, check empty placeholder vs valid.
            if (terminal === 'toMatchInlineSnapshot') {
              if (node.arguments.length === 0) {
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
        if (!isInSourceBlock(node)) return
        if (node.source.type !== 'Literal') return
        const source = node.source.value
        if (typeof source !== 'string') return
        if (source === FAST_CHECK_SPECIFIER || (source === EFFECT_TESTING_SPECIFIER && destructuresFastCheck(node))) {
          if (isInsideRuleOfSchemas(node)) return
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
        if (!isInSourceBlock(node)) return
        if (!isInTestBody(node)) return
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
