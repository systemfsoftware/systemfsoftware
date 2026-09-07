import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
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
  SKIPPED_WALK_KEYS,
} from './no-platform-provide-service-on-run.config.js'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const isCallExpression = (value: unknown): value is ESTree.CallExpression =>
  isWalkable(value) && nodeType(value) === 'CallExpression'

const isFunctionNode = (value: unknown): boolean => {
  if (!isWalkable(value)) return false
  const kind = nodeType(value)
  return kind === 'FunctionDeclaration' || kind === 'FunctionExpression' ||
    kind === 'ArrowFunctionExpression'
}

export const noPlatformProvideServiceOnRun = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()

    /**
     * The written receiver of a `Cell.run` call — the namespace object name — or null.
     * The namespace rides the import edge, so an import alias still resolves and a
     * lookalike object never does; a computed member is not a static reference.
     */
    const cellRunReceiver = (node: ESTree.CallExpression): string | null => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return null
      const object = callee.object
      const property = callee.property
      if (object.type !== 'Identifier' || !descriptionNamespaces.has(object.name)) return null
      if (property.type !== 'Identifier' || property.name !== RUN_NAME) return null
      return object.name
    }

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

    /**
     * Whether the subtree holds a `Cell.run` call without crossing a function boundary:
     * a run yielded inside an Effect.gen body belongs to that body's closure, never to
     * the provisioned expression under analysis.
     */
    const subtreeHoldsRun = (value: unknown): boolean => {
      let found = false
      const visit = (current: unknown): void => {
        if (found || !isWalkable(current) || isFunctionNode(current)) return
        if (isCallExpression(current) && cellRunReceiver(current) !== null) {
          found = true
          return
        }
        for (const key of Object.keys(current)) {
          if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
          visit(current[key])
        }
      }
      visit(value)
      return found
    }

    /**
     * Imports are classified here rather than in an `ImportDeclaration` listener.
     * Listeners fire in document order, so a run written above its own import would be
     * judged against an empty set — a silent pass decided by line order, which is the
     * one failure a guard must not have. `Program` sees every top-level statement before
     * any call is judged, so the set is complete when the first call is visited.
     */
    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      if (node.source.value !== MODULE_SOURCE) return
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          descriptionNamespaces.add(specifier.local.name)
        } else if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === DESCRIPTION_NAMESPACE
        ) {
          descriptionNamespaces.add(specifier.local.name)
        }
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        const provided = provideServiceName(node)
        if (provided !== null) {
          const input = node.arguments[0]
          if (input === undefined) return
          if (!subtreeHoldsRun(input)) return
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
        if (!subtreeHoldsRun(callee.object)) return
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
