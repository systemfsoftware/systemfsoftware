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
    { default: () => 'HashSet from effect (HashSet.empty() or HashSet.fromIterable())' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        'Replace with HashSet.empty() for empty sets, or HashSet.fromIterable(iterable) for sets with initial data',
    },
  ),
})

export type MessageIds = 'forbiddenSet'

const EFFECT_SOURCE_PREFIX = 'effect/'
const EFFECT_SCOPED_PREFIX = '@effect/'
const EFFECT_MODULE = 'effect'
const SET_NAME = 'Set'

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isSetCallee = (callee: ESTree.Node): boolean => callee.type === 'Identifier' && callee.name === SET_NAME

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

export const noNativeSetInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'When Effect is imported, ban native Set (new Set). Use HashSet from effect instead.',
    },
    schema: [JSONSchema.make(Options)],
    messages: {
      forbiddenSet:
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
        if (allow.has(SET_NAME)) return
        if (!isSetCallee(node.callee)) return
        if (!isInsideEffectGen(node)) return

        const actual = node.arguments.length === 0 ? 'new Set()' : 'new Set(iterable)'

        context.report({
          node: node.callee,
          messageId: 'forbiddenSet',
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
