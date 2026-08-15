import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isExecutorFile } from './cell.js'
import {
  DUAL_CALLEE_NAME,
  EFFECT_FN_NAMES,
  EFFECT_NAMESPACE_NAME,
  EXECUTOR_FILE_KIND,
  meta,
  SINGLE_OPERATION_EXPECTED,
  TOO_MANY_FUNCTION_EXPORTS_ACTUAL_TEMPLATE,
  TOO_MANY_FUNCTION_EXPORTS_FIX,
} from './executor-single-operation-export.config.js'

export type MessageIds = 'tooManyFunctionExports'

// `dual` from `effect/Function` produces a function with both data-first and
// data-last call signatures (`dual(arity, impl)` or `dual(predicate, impl)`), so
// a `dual(...)` call-expression initialiser counts as one operation export.
// The callee is matched by name — the house pattern in this package
// (executor-no-layer-binding matches `Layer`/`Effect` roots by name via
// `calleeRootName`, never tracking imports) — so aliased or unusual import
// spellings of `dual` are never missed. Only the canonical forms count: the
// bare `dual(...)` and a namespace member `Function.dual(...)` / `F.dual(...)`
// (non-computed access). No other wrapper is recognised.
const isDualCall = (init: ESTree.Expression | null | undefined): boolean => {
  if (init?.type !== 'CallExpression') return false
  const callee = init.callee
  if (callee.type === 'Identifier') return callee.name === DUAL_CALLEE_NAME
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === DUAL_CALLEE_NAME
  )
}

// `Effect.fn` builds the traced operation form this repo writes executors in, so an
// `Effect.fn` initialiser IS the single operation export — not a bare value beside it.
// Two call shapes reach the same API: `Effect.fn(impl)` and the named
// `Effect.fn('span')(impl)`, whose callee is itself the `Effect.fn(...)` call.
// Detection is pinned to the canonical `Effect` namespace (OX-CI1, as in
// store-effect-fn-required), so `E.fn`, `Effect['fn']`, and any other alias stay
// documented near-misses rather than silently counting as an operation.
const isEffectFnMember = (callee: ESTree.Expression): boolean =>
  callee.type === 'MemberExpression' &&
  !callee.computed &&
  callee.object.type === 'Identifier' &&
  callee.object.name === EFFECT_NAMESPACE_NAME &&
  EFFECT_FN_NAMES[callee.property.name] === true

const isEffectFnCall = (init: ESTree.Expression | null | undefined): boolean => {
  if (init?.type !== 'CallExpression') return false
  const callee = init.callee
  if (isEffectFnMember(callee)) return true
  return callee.type === 'CallExpression' && isEffectFnMember(callee.callee)
}

const isOperationInitialiser = (init: ESTree.Expression | null | undefined): boolean =>
  init?.type === 'ArrowFunctionExpression' ||
  init?.type === 'FunctionExpression' ||
  isDualCall(init) ||
  isEffectFnCall(init)

// Classes are deliberately absent: an exported class is never an operation, so a
// missing entry resolves identically to a non-function entry on every path below.
const localFunctionNames = (program: ESTree.Program): Set<string> => {
  const functions = new Set<string>()
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (!declaration) continue
    if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      functions.add(declaration.id.name)
    } else if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        switch (declarator.id.type) {
          case 'Identifier':
            if (isOperationInitialiser(declarator.init)) {
              functions.add(declarator.id.name)
            }
            break
        }
      }
    }
  }
  return functions
}

const exportedFunctions = (
  node: ESTree.ExportNamedDeclaration,
  functions: ReadonlySet<string>,
): number => {
  if (node.exportKind === 'type') return 0
  const declaration = node.declaration
  if (declaration) {
    if (declaration.type === 'FunctionDeclaration') return 1
    if (declaration.type === 'VariableDeclaration') {
      return declaration.declarations.filter((d) => isOperationInitialiser(d.init)).length
    }
    return 0
  }
  let count = 0
  for (const specifier of node.specifiers) {
    if (specifier.exportKind === 'type') continue
    if (node.source) {
      count += 1
      continue
    }
    switch (specifier.local.type) {
      case 'Identifier':
        if (functions.has(specifier.local.name)) count += 1
        break
    }
  }
  return count
}

export const executorSingleOperationExport = defineRule({
  meta,
  create(context: Context) {
    if (!isExecutorFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const functions = localFunctionNames(program)
    let count = 0
    let firstExport: ESTree.Node | undefined

    const record = (node: ESTree.Node, amount = 1): void => {
      count += amount
      if (firstExport === undefined) firstExport = node
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const amount = exportedFunctions(node, functions)
        if (amount > 0) record(node, amount)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind !== 'type') record(node)
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const declaration = node.declaration
        if (
          declaration.type === 'FunctionDeclaration' ||
          declaration.type === 'ArrowFunctionExpression' ||
          declaration.type === 'FunctionExpression'
        ) {
          record(node)
          return
        }
        switch (declaration.type) {
          case 'Identifier':
            if (functions.has(declaration.name)) record(node)
            break
        }
      },
      'Program:exit'() {
        if (count === 1) return
        const reportAt = firstExport === undefined ? program : firstExport
        context.report({
          node: reportAt,
          messageId: 'tooManyFunctionExports',
          data: {
            name: EXECUTOR_FILE_KIND,
            expected: SINGLE_OPERATION_EXPECTED,
            actual: TOO_MANY_FUNCTION_EXPORTS_ACTUAL_TEMPLATE(count),
            fix: TOO_MANY_FUNCTION_EXPORTS_FIX,
          },
        })
      },
    }
  },
})
