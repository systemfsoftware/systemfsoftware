import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  COLLECTION_ACTUAL_OF,
  COLLECTION_FIX,
  EXPECTED,
  meta,
  MUTATED_LITERAL_ACTUAL_OF,
  MUTATED_LITERAL_FIX,
  REBINDING_ACTUAL,
  REBINDING_FIX,
  REF_ACTUAL,
  REF_FIX,
} from './kind-file-holds-no-module-state.config.js'
import { kindOfFile } from './kind-file.js'
import {
  calleeRootOf,
  EFFECT_SOURCE,
  memberPathOf,
  type ModuleOrigins,
  moduleOriginsOf,
  MUTABLE_REF_MODULE,
  originOf,
  REF_MODULE,
  staticNameOf,
} from './module-origin.js'
import { moduleDeclarationsOf, walk } from './module-scope.js'

export type MessageIds = 'moduleState'

const MUTABLE_COLLECTIONS: Readonly<Record<string, true>> = {
  Map: true,
  Set: true,
  WeakMap: true,
  WeakSet: true,
}

const MUTATOR_METHODS: Readonly<Record<string, true>> = {
  push: true,
  pop: true,
  shift: true,
  unshift: true,
  splice: true,
  sort: true,
  reverse: true,
  fill: true,
  copyWithin: true,
  set: true,
  add: true,
  delete: true,
  clear: true,
}

const report = (context: Context, node: ESTree.Node, name: string, actual: string, fix: string): void => {
  context.report({ node, messageId: 'moduleState', data: { name, expected: EXPECTED, actual, fix } })
}

const collectionNameOf = (init: ESTree.Node): string | null => {
  if (init.type !== 'NewExpression' || init.callee.type !== 'Identifier') return null
  return MUTABLE_COLLECTIONS[init.callee.name] === true ? init.callee.name : null
}

const isRefMint = (init: ESTree.Node, origins: ModuleOrigins): boolean => {
  if (init.type !== 'CallExpression') return false
  const origin = originOf(calleeRootOf(init.callee), origins)
  if (origin === null) return false
  const path = memberPathOf(origin)
  if (origin.source === REF_MODULE) return path === 'make' || path === 'makeUnsafe'
  if (origin.source === MUTABLE_REF_MODULE) return path === 'make'
  return (
    origin.source === EFFECT_SOURCE &&
    (path === 'Ref.make' || path === 'Ref.makeUnsafe' || path === 'MutableRef.make')
  )
}

const rootIdentifierOf = (node: ESTree.MemberExpression): string | null => {
  let current: ESTree.Node = node.object
  while (current.type === 'MemberExpression') current = current.object
  return current.type === 'Identifier' ? current.name : null
}

const mutationOf = (candidate: string, node: ESTree.Node): string | null => {
  if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
    return rootIdentifierOf(node.left) === candidate ? 'assignment' : null
  }
  if (node.type === 'UpdateExpression' && node.argument.type === 'MemberExpression') {
    return rootIdentifierOf(node.argument) === candidate ? 'update' : null
  }
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    const callee = node.callee
    if (callee.object.type !== 'Identifier' || callee.object.name !== candidate) return null
    const member = staticNameOf(callee.property)
    return member !== null && MUTATOR_METHODS[member] === true ? member : null
  }
  return null
}

export const kindFileHoldsNoModuleState = defineRule({
  meta,
  create(context: Context) {
    const kind = kindOfFile(context.filename)
    if (kind === null) return {}
    const program = context.sourceCode.ast
    const origins = moduleOriginsOf(program)
    return {
      'Program:exit'(node: ESTree.Program) {
        const literalBindings = new Map<string, ESTree.VariableDeclarator>()
        for (const declaration of moduleDeclarationsOf(node)) {
          const bindingName = declaration.name ?? '<pattern binding>'
          const init = declaration.declarator.init
          if (declaration.kind !== 'const') {
            report(context, declaration.declarator, bindingName, REBINDING_ACTUAL, REBINDING_FIX)
            continue
          }
          if (init === null) continue
          const collection = collectionNameOf(init)
          if (collection !== null) {
            report(
              context,
              declaration.declarator,
              bindingName,
              COLLECTION_ACTUAL_OF(`new ${collection}()`),
              COLLECTION_FIX,
            )
            continue
          }
          if (isRefMint(init, origins)) {
            report(context, declaration.declarator, bindingName, REF_ACTUAL, REF_FIX)
            continue
          }
          if (
            (init.type === 'ArrayExpression' || init.type === 'ObjectExpression') &&
            declaration.name !== null
          ) {
            literalBindings.set(declaration.name, declaration.declarator)
          }
        }
        if (literalBindings.size === 0) return
        const mutated = new Map<string, string>()
        walk(node, (inner) => {
          for (const [candidate] of literalBindings) {
            if (mutated.has(candidate)) continue
            const mutation = mutationOf(candidate, inner)
            if (mutation !== null) mutated.set(candidate, mutation)
          }
        })
        for (const [candidate, mutation] of mutated) {
          const declarator = literalBindings.get(candidate)
          if (declarator === undefined) continue
          const description = mutation === 'assignment'
            ? `${candidate} is assigned`
            : mutation === 'update'
            ? `${candidate} is updated`
            : `${candidate}.${mutation}() is called`
          report(context, declarator, candidate, MUTATED_LITERAL_ACTUAL_OF(description), MUTATED_LITERAL_FIX)
        }
      },
    }
  },
})
