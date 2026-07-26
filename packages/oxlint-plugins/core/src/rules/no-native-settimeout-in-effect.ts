// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type MessageIds = 'forbiddenSetTimeout'

const DEFAULT_EXPECTED = 'Effect.delay or Effect.sleep'
const EFFECT_MODULE = 'effect'
const EFFECT_SOURCE_PREFIX = 'effect/'
const EFFECT_SCOPED_PREFIX = '@effect/'
const SET_TIMEOUT = 'setTimeout'

const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(['globalThis', 'window', 'self'])

const isEffectImport = (sourceValue: string): boolean =>
  sourceValue === EFFECT_MODULE ||
  sourceValue.startsWith(EFFECT_SOURCE_PREFIX) ||
  sourceValue.startsWith(EFFECT_SCOPED_PREFIX)

const isSetTimeoutIdentifier = (node: ESTree.Node): boolean => node.type === 'Identifier' && node.name === SET_TIMEOUT

const isSetTimeoutMember = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.type === 'Identifier' &&
  node.property.name === SET_TIMEOUT

const isSetTimeoutBracket = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.computed &&
  node.object.type === 'Identifier' &&
  GLOBAL_OBJECTS.has(node.object.name) &&
  node.property.type === 'Literal' &&
  node.property.value === SET_TIMEOUT

const isSetTimeoutCallee = (node: ESTree.Node): boolean =>
  isSetTimeoutIdentifier(node) ||
  isSetTimeoutMember(node) ||
  isSetTimeoutBracket(node)

const isSetTimeoutAlias = (node: ESTree.Node, aliases: Set<string>): boolean => {
  if (node.type !== 'Identifier') return false
  return aliases.has(node.name)
}

export const noNativeSetTimeoutInEffect = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'When Effect is imported, ban native setTimeout. Use Effect.delay or Effect.sleep instead.',
    },
    schema: [],
    messages: {
      forbiddenSetTimeout:
        'setTimeout is forbidden when Effect is imported. Expected: {{expected}}. Use Effect.delay or Effect.sleep.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    let hasEffectImport = false
    const setTimeoutAliases = new Set<string>()

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isEffectImport(node.source.value)) {
          hasEffectImport = true
        }
      },

      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return
        if (!node.init) return

        if (isSetTimeoutCallee(node.init)) {
          setTimeoutAliases.add(node.id.name)
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!hasEffectImport) return

        const callee = node.callee

        if (isSetTimeoutCallee(callee)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetTimeout',
            data: { expected: DEFAULT_EXPECTED },
          })
          return
        }

        if (isSetTimeoutAlias(callee, setTimeoutAliases)) {
          context.report({
            node: callee,
            messageId: 'forbiddenSetTimeout',
            data: { expected: DEFAULT_EXPECTED },
          })
        }
      },
    }
  },
})
