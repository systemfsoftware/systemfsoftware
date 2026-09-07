import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { classifyDescriptionImport, isCallExpression, subtreeHoldsRun } from './cell.js'
import {
  DESCRIPTION_NAMESPACE,
  meta,
  MODULE_SOURCE,
  PIPE_NAME,
  PROVIDE_SERVICE_NAME,
  PROVIDE_SERVICE_ON_RUN_ACTUAL,
  PROVIDE_SERVICE_ON_RUN_EXPECTED,
  PROVIDE_SERVICE_ON_RUN_FIX,
  RUN_NAME,
} from './no-platform-provide-service-on-run.config.js'

export const noPlatformProvideServiceOnRun = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()

    /**
     * The written name of a `provideService` application — any object alias or a bare
     * import — or null when the call is anything else. Only the member name decides, so
     * the composing provisions (`Cell.provide`, `Layer.provide`) never match; a member
     * chain deeper than one object and a computed member go unrecognised.
     */
    const provideServiceName = (node: ESTree.CallExpression): string | null => {
      const callee = node.callee
      if (callee.type === 'MemberExpression') {
        if (callee.computed) return null
        const object = callee.object
        const property = callee.property
        if (property.type !== 'Identifier' || property.name !== PROVIDE_SERVICE_NAME) return null
        if (object.type !== 'Identifier') return null
        return `${object.name}.${PROVIDE_SERVICE_NAME}`
      }
      if (callee.type === 'Identifier' && callee.name === PROVIDE_SERVICE_NAME) {
        return PROVIDE_SERVICE_NAME
      }
      return null
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            classifyDescriptionImport(statement, descriptionNamespaces, MODULE_SOURCE, DESCRIPTION_NAMESPACE)
          }
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        const provided = provideServiceName(node)
        if (provided !== null) {
          const input = node.arguments[0]
          if (input === undefined) return
          if (!subtreeHoldsRun(input, descriptionNamespaces, RUN_NAME)) return
          context.report({
            node,
            messageId: 'provideServiceOnRun',
            data: {
              name: provided,
              expected: PROVIDE_SERVICE_ON_RUN_EXPECTED,
              actual: PROVIDE_SERVICE_ON_RUN_ACTUAL,
              fix: PROVIDE_SERVICE_ON_RUN_FIX,
            },
          })
          return
        }
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.computed) return
        const property = callee.property
        if (property.type !== 'Identifier' || property.name !== PIPE_NAME) return
        if (!subtreeHoldsRun(callee.object, descriptionNamespaces, RUN_NAME)) return
        let provider: string | null = null
        for (const argument of node.arguments) {
          if (!isCallExpression(argument)) continue
          const candidate = provideServiceName(argument)
          if (candidate !== null) provider = candidate
        }
        if (provider === null) return
        context.report({
          node,
          messageId: 'provideServiceOnRun',
          data: {
            name: provider,
            expected: PROVIDE_SERVICE_ON_RUN_EXPECTED,
            actual: PROVIDE_SERVICE_ON_RUN_ACTUAL,
            fix: PROVIDE_SERVICE_ON_RUN_FIX,
          },
        })
      },
    }
  },
})
