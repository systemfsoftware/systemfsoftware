// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const Options = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String,
    { default: () => 'HashMap from effect (HashMap.empty() or HashMap.fromIterable())' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        'Replace with HashMap.empty() for empty maps, or HashMap.fromIterable(iterable) for maps with initial data',
    },
  ),
})

export type MessageIds = 'forbiddenMap'

const EFFECT_SOURCE_PREFIX = 'effect/'
const EFFECT_SCOPED_PREFIX = '@effect/'
const EFFECT_MODULE = 'effect'
const MAP_NAME = 'Map'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isInsideEffectGen = (node: ESTree.Node): boolean => {
  let current = node.parent
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'MemberExpression' &&
      current.callee.property.type === 'Identifier' &&
      current.callee.property.name === 'gen'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

const isMapCallee = (callee: ESTree.Node): boolean => {
  if (callee.type === 'Identifier') return callee.name === MAP_NAME
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name === MAP_NAME
  }
  return false
}

export const noNativeMapInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'When Effect is imported, ban native Map (new Map). Use HashMap from effect instead.',
    },
    schema: [JSONSchema.make(Options)],
    messages: {
      forbiddenMap:
        '{{actual}} is forbidden when Effect is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const allow = new Set(options.allow)

    let hasEffectImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      NewExpression(node: ESTree.NewExpression) {
        if (!hasEffectImport) return
        if (allow.has(MAP_NAME)) return
        if (!isMapCallee(node.callee)) return
        if (!isInsideEffectGen(node)) return

        const actual = node.arguments.length === 0 ? 'new Map()' : 'new Map(iterable)'

        context.report({
          node: node.callee,
          messageId: 'forbiddenMap',
          data: {
            expected: options.expected,
            actual,
            fix: options.fix,
          },
        })
      },
    }
  },
})
