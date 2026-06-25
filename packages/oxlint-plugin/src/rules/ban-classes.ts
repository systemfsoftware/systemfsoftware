// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const Options = S.Struct({
  whitelist: S.optionalWith(
    S.Array(S.String),
    { default: () => [] },
  ),
})

const TagVariants = new Set(['TaggedError', 'Error', 'Service', 'Class', 'TaggedClass'])
const ImportVariants = new Set(['S', 'Schema', 'Data', 'Effect'])
const ContextVariants = new Set(['Tag', 'Reference'])

export const banClasses = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ban class declarations in favor of functional patterns with Effect.gen, Layer.merge, and S.TaggedError',
    },
    schema: [JSONSchema.make(Options)],
    messages: {
      noClasses: "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.",
    },
  },
  create(context: Context) {
    // Stryker restore all
    const isTaggedErrorPattern = (node: ESTree.MemberExpression): boolean =>
      node.object.type === 'Identifier' &&
      node.property.type === 'Identifier' &&
      TagVariants.has(node.property.name) &&
      ImportVariants.has(node.object.name)

    const isContextPattern = (node: ESTree.MemberExpression): boolean =>
      node.object.type === 'Identifier' &&
      node.object.name === 'Context' &&
      node.property.type === 'Identifier' &&
      ContextVariants.has(node.property.name)

    const isRpcGroupMake = (node: ESTree.MemberExpression): boolean =>
      node.object.type === 'Identifier' &&
      node.object.name === 'RpcGroup' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'make'

    const hasTypeArguments = (node: ESTree.Node): boolean => {
      return 'typeArguments' in node && node.typeArguments != null
    }

    const parsed = S.decodeUnknownSync(S.Array(Options))(context.options)
    const first = parsed[0]
    const whitelist = new Set(first ? first.whitelist : undefined)

    const getClassName = (node: ESTree.Class): string => {
      if (node.id && 'name' in node.id) return node.id.name
      const parent = node.parent
      if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.type === 'Identifier') {
        return parent.id.name
      }
      return 'Anonymous class'
    }

    const isAllowedEffectPattern = (node: ESTree.Class): boolean => {
      const { superClass } = node
      if (!superClass || superClass.type !== 'CallExpression') return false

      const callee = superClass.callee

      if (callee.type === 'MemberExpression') {
        if (isTaggedErrorPattern(callee)) return true
        if (isContextPattern(callee)) return true
        if (isRpcGroupMake(callee)) return true
      }

      if (callee.type === 'CallExpression') {
        const innerCallee = callee.callee
        if (innerCallee.type === 'MemberExpression') {
          if (isTaggedErrorPattern(innerCallee) && (hasTypeArguments(callee) || hasTypeArguments(superClass))) {
            return true
          }
          if (
            isContextPattern(innerCallee) &&
            (hasTypeArguments(callee) || hasTypeArguments(superClass) || hasTypeArguments(innerCallee))
          ) {
            return true
          }
        }
      }

      return false
    }

    return {
      'ClassDeclaration, ClassExpression'(node: ESTree.Class) {
        if (isAllowedEffectPattern(node)) return
        const name = getClassName(node)
        if (whitelist.has(name)) return

        context.report({
          node,
          messageId: 'noClasses',
          data: {
            name,
            expected:
              'S.TaggedError, Schema.TaggedError, Data.TaggedError, Data.Error, Context.Tag, Context.Reference, RpcGroup.make, Effect.Service, S.Class, or S.TaggedClass pattern',
            actual: `class ${name}`,
            fix:
              'Use S.TaggedError or Data.TaggedError for errors, Context.Tag/Context.Reference for context, RpcGroup.make for RPC groups, Effect.Service for services, S.Class/S.TaggedClass for data classes. Add to whitelist if exception needed',
          },
        })
      },
    }
  },
})
