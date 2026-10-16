import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Effect, Schema as S } from 'effect'

import {
  DATE_GLOBAL,
  GLOBAL_CALL_APIS,
  globalCallVerdict,
  isRegisteredPort,
  isTestOrFixtureFile,
  meta,
  newDateVerdict,
  TIME_SOURCE_APIS,
  TIME_SOURCE_EXPECTED,
  TIME_SOURCE_FIX,
  TIMERS_MODULES,
  timersImportVerdict,
} from './no-unported-time-source.config.js'
import { Options } from './no-unported-time-source.config.js'
import type { TimeSourceVerdict } from './no-unported-time-source.config.js'

export type MessageIds = 'unportedTimeSource'

/** The scope-lookup closure (`context.sourceCode.getScope`). */
type GetScope = (node: ESTree.Node) => unknown

type IdentifierNode = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly {
    readonly identifier: ESTree.Node
    readonly resolved: { readonly defs: readonly unknown[] } | null
  }[]
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const isIdentifierNode = (node: ESTree.Node): node is IdentifierNode => node.type === 'Identifier'

const decodeOptions = (input: unknown): S.Schema.Type<typeof Options> =>
  Effect.runSync(Effect.orDie(S.decodeUnknownEffect(Options)(input)))

const timersModuleOf = (source: ESTree.Node): string | null => {
  if (source.type !== 'Literal') return null
  const value = source.value
  return typeof value === 'string' && TIMERS_MODULES.includes(value) ? value : null
}

const rootIdentifierOf = (node: ESTree.Node): IdentifierNode | null => {
  let current: ESTree.Node = node
  while (current.type === 'MemberExpression') current = current.object
  return isIdentifierNode(current) ? current : null
}

const memberPathOf = (node: ESTree.Node): readonly string[] | null => {
  if (isIdentifierNode(node)) return [node.name]
  if (node.type !== 'MemberExpression' || node.computed === true) return null
  if (!isIdentifierNode(node.property)) return null
  const object = memberPathOf(node.object)
  return object === null ? null : [...object, node.property.name]
}

const timeSourceApiOf = (path: readonly string[]): string | null =>
  TIME_SOURCE_APIS.find((api) => {
    const segments = api.split('.')
    return segments.length <= path.length && segments.every((segment, index) => path[index] === segment)
  }) ?? null

/**
 * A reference the scope chain cannot resolve declares no binding in this module:
 * it is the global the process owns. A resolved reference — a parameter, a local
 * declaration, an import — is a port crossing the boundary and stays silent.
 */
const isGlobalReference = (identifier: IdentifierNode, getScope: GetScope): boolean => {
  const scopeValue: unknown = getScope(identifier)
  if (!isScopeLike(scopeValue)) return true
  for (let scope: ScopeLike | null = scopeValue; scope !== null; scope = scope.upper) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined) return found.resolved === null
  }
  return true
}

export const noUnportedTimeSource = defineRule({
  meta,
  create(context: Context) {
    if (isTestOrFixtureFile(context.filename)) return {}
    const options = decodeOptions(context.options[0] ?? {})
    if (isRegisteredPort(context.filename, options.ports)) return {}
    const getScope: GetScope = context.sourceCode.getScope

    const report = (verdict: TimeSourceVerdict, node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'unportedTimeSource',
        data: {
          ...verdict,
          expected: TIME_SOURCE_EXPECTED,
          fix: TIME_SOURCE_FIX,
        },
      })
    }

    const reportTimersImport = (node: ESTree.Node, source: ESTree.Node): void => {
      const module = timersModuleOf(source)
      if (module !== null) report(timersImportVerdict(module), node)
    }

    const reportGlobalCall = (node: ESTree.CallExpression, path: readonly string[]): void => {
      const api = timeSourceApiOf(path)
      if (api === null) return
      const root = rootIdentifierOf(node.callee)
      if (root === null || !isGlobalReference(root, getScope)) return
      report(globalCallVerdict(api), node)
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        reportTimersImport(node, node.source)
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source !== null) reportTimersImport(node, node.source)
      },

      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        reportTimersImport(node, node.source)
      },

      ImportExpression(node: ESTree.ImportExpression) {
        reportTimersImport(node, node.source)
      },

      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (isIdentifierNode(callee)) {
          if (GLOBAL_CALL_APIS.includes(callee.name) && isGlobalReference(callee, getScope)) {
            report(globalCallVerdict(callee.name), node)
          }
          return
        }
        const path = memberPathOf(callee)
        if (path !== null) reportGlobalCall(node, path)
      },

      NewExpression(node: ESTree.NewExpression) {
        if (node.arguments.length > 0) return
        if (!isIdentifierNode(node.callee)) return
        if (node.callee.name !== DATE_GLOBAL) return
        if (!isGlobalReference(node.callee, getScope)) return
        report(newDateVerdict(), node)
      },
    }
  },
})
