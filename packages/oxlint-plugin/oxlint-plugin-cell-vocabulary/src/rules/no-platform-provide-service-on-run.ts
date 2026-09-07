import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  CELL_NAMESPACE,
  EFFECT_NAMESPACE,
  EFFECT_SOURCES,
  meta,
  MODULE_SOURCE,
  PROVIDE_SERVICE_METHOD,
  PROVIDE_SERVICE_ON_RUN_ACTUAL,
  PROVIDE_SERVICE_ON_RUN_EXPECTED,
  PROVIDE_SERVICE_ON_RUN_FIX,
  RUN_METHOD,
} from './no-platform-provide-service-on-run.config.js'

export type MessageIds = 'provideServiceOnRun'

type Walkable = Readonly<Record<string, unknown>>

type ReportableCall = Walkable & ESTree.CallExpression

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const isCallNode = (node: Walkable): node is ReportableCall => nodeType(node) === 'CallExpression'

const identifierName = (node: Walkable): string | null => nodeType(node) === 'Identifier' ? String(node['name']) : null

const isEffectSource = (source: string): boolean => EFFECT_SOURCES.some((candidate) => candidate === source)

const memberCall = (node: unknown, names: ReadonlySet<string>, method: string): boolean => {
  if (!isWalkable(node) || nodeType(node) !== 'CallExpression') return false
  const callee = node['callee']
  if (!isWalkable(callee) || nodeType(callee) !== 'MemberExpression') return false
  const object = callee['object']
  const property = callee['property']
  if (!isWalkable(object) || !isWalkable(property)) return false
  const root = identifierName(object)
  const name = identifierName(property)
  return root !== null && name === method && names.has(root)
}

const isCellRunCall = (node: unknown, cellNames: ReadonlySet<string>): boolean =>
  memberCall(node, cellNames, RUN_METHOD)

const isProvideServiceCall = (node: unknown, effectNames: ReadonlySet<string>): boolean =>
  memberCall(node, effectNames, PROVIDE_SERVICE_METHOD)

const callArguments = (node: unknown): Walkable[] => {
  if (!isWalkable(node)) return []
  const raw = node['arguments']
  if (!Array.isArray(raw)) return []
  const kept: Walkable[] = []
  for (const entry of raw) {
    if (isWalkable(entry)) kept.push(entry)
  }
  return kept
}

const pipeTarget = (node: unknown): Walkable | null => {
  if (!isWalkable(node) || nodeType(node) !== 'CallExpression') return null
  const callee = node['callee']
  if (!isWalkable(callee) || nodeType(callee) !== 'MemberExpression') return null
  const property = callee['property']
  if (!isWalkable(property) || identifierName(property) !== 'pipe') return null
  const object = callee['object']
  return isWalkable(object) ? object : null
}

const isCellRunRooted = (node: unknown, cellNames: ReadonlySet<string>): boolean => {
  if (!isWalkable(node)) return false
  if (isCellRunCall(node, cellNames)) return true
  const target = pipeTarget(node)
  return target !== null && isCellRunRooted(target, cellNames)
}

const dottedName = (node: unknown): string | null => {
  if (!isWalkable(node)) return null
  const kind = nodeType(node)
  if (kind === 'Identifier') return identifierName(node)
  if (kind !== 'MemberExpression') return null
  const object = node['object']
  const property = node['property']
  if (!isWalkable(object) || !isWalkable(property)) return null
  const head = dottedName(object)
  const tail = identifierName(property)
  if (head === null || tail === null) return null
  return `${head}.${tail}`
}

const serviceNameOf = (call: Walkable): string => {
  const first = callArguments(call)[0]
  if (first === undefined) return 'unknown service'
  return dottedName(first) ?? 'unknown service'
}

export const noPlatformProvideServiceOnRun = defineRule({
  meta,
  create(context: Context) {
    const cellNames = new Set<string>()
    const effectNames = new Set<string>()

    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      const source = node.source.value
      if (source === MODULE_SOURCE) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            cellNames.add(specifier.local.name)
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === CELL_NAMESPACE
          ) {
            cellNames.add(specifier.local.name)
          }
        }
        return
      }
      if (!isEffectSource(source)) return
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          effectNames.add(specifier.local.name)
        } else if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === EFFECT_NAMESPACE
        ) {
          effectNames.add(specifier.local.name)
        }
      }
    }

    const reportProvide = (call: Walkable): void => {
      if (!isCallNode(call)) return
      context.report({
        node: call,
        messageId: 'provideServiceOnRun',
        data: {
          service: serviceNameOf(call),
          expected: PROVIDE_SERVICE_ON_RUN_EXPECTED,
          actual: PROVIDE_SERVICE_ON_RUN_ACTUAL,
          fix: PROVIDE_SERVICE_ON_RUN_FIX,
        },
      })
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isCellRunCall(node, cellNames)) {
          for (const argument of callArguments(node)) {
            if (isProvideServiceCall(argument, effectNames)) reportProvide(argument)
          }
          return
        }
        const target = pipeTarget(node)
        if (target === null || !isCellRunRooted(target, cellNames)) return
        for (const argument of callArguments(node)) {
          if (isProvideServiceCall(argument, effectNames)) reportProvide(argument)
        }
      },
    }
  },
})
