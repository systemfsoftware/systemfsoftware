import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  CELL_NAMESPACE,
  EFFECT_NAMESPACE,
  EFFECT_SOURCES,
  GEN_METHOD,
  meta,
  MODULE_SOURCE,
  RUN_METHOD,
  SKIPPED_WALK_KEYS,
  TWO_RUN_CHAIN_ACTUAL,
  TWO_RUN_CHAIN_EXPECTED,
  TWO_RUN_CHAIN_FIX,
} from './no-two-run-chain.config.js'

export type MessageIds = 'twoRunChain'

type Walkable = Readonly<Record<string, unknown>>

type ReportableCall = Walkable & ESTree.CallExpression

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const isCallNode = (node: Walkable): node is ReportableCall => nodeType(node) === 'CallExpression'

const isSkippedKey = (key: string): boolean => SKIPPED_WALK_KEYS.some((skipped) => skipped === key)

const isEffectSource = (source: string): boolean => EFFECT_SOURCES.some((candidate) => candidate === source)

const identifierName = (node: Walkable): string | null => nodeType(node) === 'Identifier' ? String(node['name']) : null

const memberTarget = (node: unknown, cellNames: ReadonlySet<string>, method: string): boolean => {
  if (!isWalkable(node) || nodeType(node) !== 'CallExpression') return false
  const callee = node['callee']
  if (!isWalkable(callee) || nodeType(callee) !== 'MemberExpression') return false
  const object = callee['object']
  const property = callee['property']
  if (!isWalkable(object) || !isWalkable(property)) return false
  const root = identifierName(object)
  const name = identifierName(property)
  return root !== null && name === method && cellNames.has(root)
}

const isCellRunCall = (node: unknown, cellNames: ReadonlySet<string>): boolean =>
  memberTarget(node, cellNames, RUN_METHOD)

const isEffectGenCall = (node: unknown, effectNames: ReadonlySet<string>): boolean =>
  memberTarget(node, effectNames, GEN_METHOD)

const isPipeCall = (node: unknown): boolean => {
  if (!isWalkable(node) || nodeType(node) !== 'CallExpression') return false
  const callee = node['callee']
  if (!isWalkable(callee) || nodeType(callee) !== 'MemberExpression') return false
  const property = callee['property']
  return isWalkable(property) && identifierName(property) === 'pipe'
}

const pipeHead = (node: unknown): Walkable | null => {
  if (!isPipeCall(node) || !isWalkable(node)) return null
  const callee = node['callee']
  if (!isWalkable(callee)) return null
  const object = callee['object']
  return isWalkable(object) ? object : null
}

const isCellRunRooted = (node: unknown, cellNames: ReadonlySet<string>): boolean => {
  if (isCellRunCall(node, cellNames)) return true
  const head = pipeHead(node)
  return head !== null && isCellRunRooted(head, cellNames)
}

const rootNameOf = (node: unknown): string | null => {
  if (!isWalkable(node)) return null
  const kind = nodeType(node)
  if (kind === 'Identifier') return identifierName(node)
  if (kind === 'MemberExpression') return rootNameOf(node['object'])
  if (kind === 'ChainExpression') return rootNameOf(node['expression'])
  return null
}

const namesInInput = (node: unknown): string[] => {
  if (!isWalkable(node)) return []
  const kind = nodeType(node)
  if (kind === 'Identifier') {
    const name = identifierName(node)
    return name === null ? [] : [name]
  }
  if (kind === 'MemberExpression' || kind === 'ChainExpression') {
    const root = rootNameOf(node)
    return root === null ? [] : [root]
  }
  if (kind === 'SpreadElement') return namesInInput(node['argument'])
  if (kind !== 'ObjectExpression') return []
  const properties = node['properties']
  if (!Array.isArray(properties)) return []
  const names: string[] = []
  for (const property of properties) {
    if (!isWalkable(property)) continue
    const propertyKind = nodeType(property)
    if (propertyKind === 'SpreadElement') {
      names.push(...namesInInput(property['argument']))
      continue
    }
    if (propertyKind !== 'Property') continue
    names.push(...namesInInput(property['value']))
  }
  return names
}

const runInputs = (run: Walkable): unknown[] => {
  const raw = run['arguments']
  if (!Array.isArray(raw)) return []
  const inputs: unknown[] = []
  for (const argument of raw) {
    if (!isWalkable(argument)) continue
    if (nodeType(argument) === 'SpreadElement') {
      const spread = argument['argument']
      if (isWalkable(spread)) inputs.push(spread)
      continue
    }
    inputs.push(argument)
  }
  return inputs.length >= 2 ? inputs.slice(1) : inputs.slice(0, 1)
}

const isNestedFunction = (node: Walkable): boolean => {
  const kind = nodeType(node)
  return kind === 'FunctionExpression' || kind === 'ArrowFunctionExpression' || kind === 'FunctionDeclaration'
}

const visitChildren = (node: Walkable, visit: (child: Walkable) => void): void => {
  for (const key of Object.keys(node)) {
    if (isSkippedKey(key)) continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const entry of child) {
        if (isWalkable(entry)) visit(entry)
      }
      continue
    }
    if (isWalkable(child)) visit(child)
  }
}

const collectCellRuns = (statement: Walkable, cellNames: ReadonlySet<string>): ReportableCall[] => {
  const runs: ReportableCall[] = []
  const visit = (node: Walkable): void => {
    if (isNestedFunction(node)) return
    if (isCallNode(node) && isCellRunCall(node, cellNames)) runs.push(node)
    visitChildren(node, visit)
  }
  visit(statement)
  return runs
}

const yieldedRunRoot = (init: unknown, cellNames: ReadonlySet<string>): boolean => {
  if (!isWalkable(init)) return false
  if (nodeType(init) === 'YieldExpression') return isCellRunRooted(init['argument'], cellNames)
  return isCellRunRooted(init, cellNames)
}

const collectBindings = (statement: Walkable, cellNames: ReadonlySet<string>, tracked: Set<string>): void => {
  const visit = (node: Walkable): void => {
    if (isNestedFunction(node)) return
    if (nodeType(node) === 'VariableDeclarator') {
      const id = node['id']
      const init = node['init']
      if (isWalkable(id) && nodeType(id) === 'Identifier' && isWalkable(init)) {
        const name = String(id['name'])
        if (yieldedRunRoot(init, cellNames)) {
          tracked.add(name)
        } else if (nodeType(init) === 'Identifier') {
          const source = String(init['name'])
          if (tracked.has(source)) tracked.add(name)
        } else if (nodeType(init) === 'MemberExpression' || nodeType(init) === 'ChainExpression') {
          const root = rootNameOf(init)
          if (root !== null && tracked.has(root)) tracked.add(name)
        }
      }
    }
    visitChildren(node, visit)
  }
  visit(statement)
}

export const noTwoRunChain = defineRule({
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

    const analyzeGeneratorBody = (body: unknown): void => {
      if (!isWalkable(body)) return
      const raw = body['body']
      if (!Array.isArray(raw)) return
      const tracked = new Set<string>()
      for (const entry of raw) {
        if (!isWalkable(entry)) continue
        for (const run of collectCellRuns(entry, cellNames)) {
          const matched: string[] = []
          for (const input of runInputs(run)) {
            for (const name of namesInInput(input)) {
              if (tracked.has(name) && !matched.some((seen) => seen === name)) matched.push(name)
            }
          }
          if (matched.length > 0) {
            context.report({
              node: run,
              messageId: 'twoRunChain',
              data: {
                chainedOn: matched.join(', '),
                expected: TWO_RUN_CHAIN_EXPECTED,
                actual: TWO_RUN_CHAIN_ACTUAL,
                fix: TWO_RUN_CHAIN_FIX,
              },
            })
          }
        }
        collectBindings(entry, cellNames, tracked)
      }
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') classifyImport(statement)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!isEffectGenCall(node, effectNames)) return
        const generator = node.arguments[0]
        if (generator === undefined) return
        if (generator.type !== 'FunctionExpression') return
        if (generator.generator !== true) return
        analyzeGeneratorBody(generator.body)
      },
    }
  },
})
