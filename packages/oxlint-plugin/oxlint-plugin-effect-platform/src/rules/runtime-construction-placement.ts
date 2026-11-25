import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

import {
  ACQUIRE_RELEASE_MEMBER,
  EAGER_CONSTRUCTION_ACTUAL,
  EAGER_CONSTRUCTION_EXPECTED,
  EAGER_CONSTRUCTION_FIX,
  EFFECT_MODULE,
  EFFECT_NAMESPACE,
  EFFECT_SUBMODULE,
  isInterpretationEdge,
  isRuntimeCodeFile,
  MAX_ALIAS_HOPS,
  MEMOIZING_ASSIGNMENT_OPERATORS,
  meta,
  TRACKED_WIRING_CALLS,
  WIRING_PER_CALL_ACTUAL,
  WIRING_PER_CALL_EXPECTED,
  WIRING_PER_CALL_FIX,
} from './runtime-construction-placement.config.js'
import type { TrackedWiringCall } from './runtime-construction-placement.config.js'

export type MessageIds = 'wiringPerCall' | 'eagerConstruction'

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

/** The scope-lookup closure (`context.sourceCode.getScope`). */
type GetScope = (node: ESTree.Node) => unknown

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

const staticMemberNameOf = (member: ESTree.MemberExpression): string | null => {
  if (member.computed === true) {
    const property = member.property
    return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
  }
  return member.property.type === 'Identifier' ? member.property.name : null
}

const dynamicImportSourceOf = (node: ESTree.Node): string | null => {
  if (node.type !== 'AwaitExpression') return null
  const argument = node.argument
  if (argument.type !== 'ImportExpression') return null
  const source = argument.source
  return source.type === 'Literal' && typeof source.value === 'string' ? source.value : null
}

/**
 * `const { ManagedRuntime } = await import('effect')` binds like the static form: the
 * destructured name carries its property, and a plain identifier id is the namespace
 * binding `import * as ns` produces. A dynamic import declares no import binding, so the
 * shared resolver cannot reach it; these are the bindings the rule tracks for itself.
 */
const dynamicImportBindingsOf = (
  declarator: ESTree.VariableDeclarator,
): readonly (readonly [string, ImportOrigin])[] => {
  if (declarator.init === null) return []
  const source = dynamicImportSourceOf(declarator.init)
  if (source === null) return []
  const id = declarator.id
  if (id.type === 'Identifier') return [[id.name, { source, importedName: null, path: [] }]]
  if (id.type !== 'ObjectPattern') return []
  return id.properties.flatMap((property) => {
    if (property.type !== 'Property' || property.value.type !== 'Identifier') return []
    const key = property.key
    const importedName = key.type === 'Identifier'
      ? key.name
      : key.type === 'Literal' && typeof key.value === 'string'
      ? key.value
      : null
    return importedName === null ? [] : [[property.value.name, { source, importedName, path: [] }] as const]
  })
}

const seedDynamicImportBindings = (
  bindings: Map<string, ImportOrigin>,
  declarator: ESTree.VariableDeclarator,
): void => {
  for (const [name, binding] of dynamicImportBindingsOf(declarator)) {
    if (!bindings.has(name)) bindings.set(name, binding)
  }
}

const closeOverAliases = (bindings: Map<string, ImportOrigin>, program: ESTree.Program): void => {
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    const before = bindings.size
    for (const statement of program.body) {
      if (statement.type !== 'VariableDeclaration') continue
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== 'Identifier' || declarator.init === null) continue
        const init = declarator.init
        if (init.type !== 'Identifier') continue
        const base = bindings.get(init.name)
        if (base === undefined || bindings.has(declarator.id.name)) continue
        bindings.set(declarator.id.name, base)
      }
    }
    if (bindings.size === before) break
  }
}

const dynamicOriginOf = (node: ESTree.Node, bindings: ReadonlyMap<string, ImportOrigin>): ImportOrigin | null => {
  if (node.type === 'Identifier') return bindings.get(node.name) ?? null
  if (node.type !== 'MemberExpression') return null
  const member = staticMemberNameOf(node)
  if (member === null) return null
  const receiver = dynamicOriginOf(node.object, bindings)
  if (receiver === null) return null
  return receiver.importedName === null
    ? { ...receiver, importedName: member }
    : { ...receiver, path: [...receiver.path, member] }
}

const trackedWiringCallOf = (origin: ImportOrigin, member: string): TrackedWiringCall | null =>
  origin.path.length > 0
    ? null
    : TRACKED_WIRING_CALLS.find(
      (candidate) =>
        candidate.source === origin.source &&
        candidate.member === member &&
        (candidate.namespace === origin.importedName || origin.importedName === null),
    ) ?? null

const enclosingFunctionOf = (node: ESTree.Node): FunctionNode | null => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (isFunctionNode(current)) return current
    current = current.parent
  }
  return null
}

const isModuleScopeBinding = (declarator: ESTree.VariableDeclarator): boolean => {
  const declaration = declarator.parent
  if (declaration === null || declaration.type !== 'VariableDeclaration') return false
  const holder = declaration.parent
  if (holder === null) return false
  if (holder.type === 'Program') return true
  return holder.type === 'ExportNamedDeclaration' && holder.parent !== null && holder.parent.type === 'Program'
}

const isDeferredModuleClosure = (fn: FunctionNode): boolean => {
  if (fn.type === 'FunctionDeclaration' || fn.generator === true) return false
  let current: ESTree.Node | null = fn.parent
  while (current !== null) {
    if (isFunctionNode(current)) {
      if (current.type === 'FunctionDeclaration' || current.generator === true) return false
      current = current.parent
      continue
    }
    if (current.type === 'VariableDeclarator') return isModuleScopeBinding(current)
    const parent: ESTree.Node | null = current.parent
    if (parent === null || parent.type === 'Program') return false
    current = parent
  }
  return false
}

const isCacheWrite = (node: ESTree.Node): boolean =>
  node.type === 'AssignmentExpression' && MEMOIZING_ASSIGNMENT_OPERATORS.includes(node.operator)

const isBoundByAModuleScopeBinding = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node
  while (current !== null) {
    if (isFunctionNode(current) || current.type === 'Program') return false
    if (isCacheWrite(current)) return true
    if (current.type === 'VariableDeclarator') return current.init !== null && isModuleScopeBinding(current)
    current = current.parent
  }
  return false
}

/**
 * A closure that runs once: invoked by a call whose result a module-scope binding holds
 * (an invoked factory, a `then` on a module-scope promise). A cache write inside any
 * other closure is the only memo; a local the closure captures is rebuilt per call.
 */
const runsOnceAtModuleScope = (enclosing: FunctionNode): boolean => {
  const consumer: ESTree.Node | null = enclosing.parent
  return consumer !== null && consumer.type === 'CallExpression' && isBoundByAModuleScopeBinding(consumer)
}

const isMemoizedConstruction = (call: ESTree.CallExpression, enclosing: FunctionNode): boolean => {
  let current: ESTree.Node | null = call.parent
  while (current !== null && current !== enclosing) {
    if (isCacheWrite(current)) return true
    current = current.parent
  }
  return runsOnceAtModuleScope(enclosing)
}

const isEffectNamespace = (origin: ImportOrigin): boolean =>
  origin.path.length === 0 &&
  ((origin.source === EFFECT_MODULE && origin.importedName === EFFECT_NAMESPACE) ||
    (origin.source === EFFECT_SUBMODULE && origin.importedName === null))

/**
 * `Effect.acquireRelease(acquire, release)` with the construction inside `acquire`:
 * the runtime is released when the scope that acquired it closes, so it lives exactly
 * as long as its owner (a process, an object instance, a call) and is finalized.
 */
const isAcquiredWithARelease = (
  call: ESTree.CallExpression,
  originOf: (node: ESTree.Node) => ImportOrigin | null,
): boolean => {
  let child: ESTree.Node = call
  let current: ESTree.Node | null = call.parent
  while (current !== null) {
    if (
      current.type === 'CallExpression' &&
      current.arguments.length >= 2 &&
      current.arguments[0] === child &&
      current.callee.type === 'MemberExpression' &&
      staticMemberNameOf(current.callee) === ACQUIRE_RELEASE_MEMBER
    ) {
      const origin = originOf(current.callee.object)
      if (origin !== null && isEffectNamespace(origin)) return true
    }
    child = current
    current = current.parent
  }
  return false
}

export const runtimeConstructionPlacement = defineRule({
  meta,
  create(context: Context) {
    if (context.filename.endsWith('.tst.ts')) return {}
    if (!isRuntimeCodeFile(context.filename)) return {}

    const getScope: GetScope = context.sourceCode.getScope
    let dynamicBindings: Map<string, ImportOrigin> = new Map()

    return {
      Program(node: ESTree.Program) {
        const bindings = new Map<string, ImportOrigin>()
        for (const statement of node.body) {
          if (statement.type !== 'VariableDeclaration') continue
          for (const declarator of statement.declarations) seedDynamicImportBindings(bindings, declarator)
        }
        closeOverAliases(bindings, node)
        dynamicBindings = bindings
      },

      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const declarator of node.declarations) {
          seedDynamicImportBindings(dynamicBindings, declarator)
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const member = staticMemberNameOf(callee)
        if (member === null) return
        const originOf = (receiverNode: ESTree.Node): ImportOrigin | null =>
          resolveImportOrigin(receiverNode, getScope) ?? dynamicOriginOf(receiverNode, dynamicBindings)
        const receiver = originOf(callee.object)
        if (receiver === null) return
        const tracked = trackedWiringCallOf(receiver, member)
        if (tracked === null) return

        const name = `${tracked.namespace}.${tracked.member}`
        const enclosing = enclosingFunctionOf(node)

        if (enclosing !== null && isDeferredModuleClosure(enclosing) && isMemoizedConstruction(node, enclosing)) {
          return
        }

        if (enclosing !== null && isAcquiredWithARelease(node, originOf)) return

        if (enclosing !== null) {
          context.report({
            node: callee,
            messageId: 'wiringPerCall',
            data: {
              name,
              expected: WIRING_PER_CALL_EXPECTED,
              actual: WIRING_PER_CALL_ACTUAL,
              fix: WIRING_PER_CALL_FIX,
            },
          })
          return
        }

        if (isInterpretationEdge(context.filename)) return

        context.report({
          node: callee,
          messageId: 'eagerConstruction',
          data: {
            name,
            expected: EAGER_CONSTRUCTION_EXPECTED,
            actual: EAGER_CONSTRUCTION_ACTUAL,
            fix: EAGER_CONSTRUCTION_FIX,
          },
        })
      },
    }
  },
})
