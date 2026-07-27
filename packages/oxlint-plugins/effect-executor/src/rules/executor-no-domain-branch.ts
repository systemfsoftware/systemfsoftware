import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, cellOf, isExecutorFile } from './cell.js'
import {
  BRANCH_ACTUAL_IF,
  BRANCH_ACTUAL_SWITCH,
  BRANCH_ACTUAL_TERNARY,
  BRANCH_EXPECTED,
  BRANCH_FIX,
  INPUT_CELLS,
  MATCH_ENTRY_METHOD,
  MATCH_NAMESPACE,
  MATCH_ON_INPUT_ACTUAL,
  MATCH_ON_INPUT_EXPECTED,
  MATCH_ON_INPUT_FIX,
  meta,
  SKIPPED_WALK_KEYS,
  TAG_PROPERTY,
  UNWRAPPED_BY_TYPE,
} from './executor-no-domain-branch.config.js'

export type MessageIds = 'matchOnInputState' | 'branchOnInputState'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const walk = (value: unknown, visit: (node: Walkable) => void): void => {
  if (!isWalkable(value)) return
  visit(value)
  for (const key of Object.keys(value)) {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
    walk(value[key], visit)
  }
}

const referencesAny = (value: unknown, names: ReadonlySet<string>): boolean => {
  let found = false
  walk(value, (node) => {
    if (names.has(String(node['name']))) found = true
  })
  return found
}

const readsTagProperty = (value: unknown): boolean => {
  let found = false
  walk(value, (node) => {
    if (node['computed'] !== false) return
    const property = node['property']
    if (!isWalkable(property)) return
    if (String(property['name']) === TAG_PROPERTY) found = true
  })
  return found
}

const rootIdentifierOf = (value: unknown): string | null => {
  if (!isWalkable(value)) return null
  const type = nodeType(value)
  if (type === 'Identifier') return String(value['name'])
  const key = UNWRAPPED_BY_TYPE[type]
  if (key === undefined) return null
  return rootIdentifierOf(value[key])
}

const matchEntryOperand = (node: ESTree.CallExpression): ESTree.Node | null => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.computed) return null
  if (calleeRootName(callee.object) !== MATCH_NAMESPACE) return null
  if (callee.property.name !== MATCH_ENTRY_METHOD) return null
  const [operand] = node.arguments
  return operand === undefined ? null : operand
}

export const executorNoDomainBranch = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    const inputNames = new Set<string>()

    const reportBranch = (node: ESTree.Node, test: ESTree.Node, actual: string): void => {
      if (!readsTagProperty(test)) return
      if (!referencesAny(test, inputNames)) return
      context.report({
        node,
        messageId: 'branchOnInputState',
        data: {
          name: TAG_PROPERTY,
          expected: BRANCH_EXPECTED,
          actual,
          fix: BRANCH_FIX,
        },
      })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const cell = cellOf(node.source.value)
        if (!INPUT_CELLS.some((input) => input === cell)) return
        for (const specifier of node.specifiers) inputNames.add(specifier.local.name)
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return
        const root = rootIdentifierOf(node.init)
        if (root === null) return
        if (!inputNames.has(root)) return
        inputNames.add(node.id.name)
      },
      CallExpression(node: ESTree.CallExpression) {
        const operand = matchEntryOperand(node)
        if (!referencesAny(operand, inputNames)) return
        context.report({
          node,
          messageId: 'matchOnInputState',
          data: {
            name: `${MATCH_NAMESPACE}.${MATCH_ENTRY_METHOD}`,
            expected: MATCH_ON_INPUT_EXPECTED,
            actual: MATCH_ON_INPUT_ACTUAL,
            fix: MATCH_ON_INPUT_FIX,
          },
        })
      },
      IfStatement(node: ESTree.IfStatement) {
        reportBranch(node, node.test, BRANCH_ACTUAL_IF)
      },
      ConditionalExpression(node: ESTree.ConditionalExpression) {
        reportBranch(node, node.test, BRANCH_ACTUAL_TERNARY)
      },
      SwitchStatement(node: ESTree.SwitchStatement) {
        reportBranch(node, node.discriminant, BRANCH_ACTUAL_SWITCH)
      },
    }
  },
})
