import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  EAGER_CONSTRUCTION_ACTUAL,
  EAGER_CONSTRUCTION_EXPECTED,
  EAGER_CONSTRUCTION_FIX,
  MANAGED_RUNTIME_NAMESPACE,
  MAX_ALIAS_HOPS,
  meta,
  TRACKED_WIRING_CALLS,
  WIRING_PER_CALL_ACTUAL,
  WIRING_PER_CALL_EXPECTED,
  WIRING_PER_CALL_FIX,
} from './runtime-construction-placement.config.js'
import type { TrackedWiringCall } from './runtime-construction-placement.config.js'

export type MessageIds = 'wiringPerCall' | 'eagerConstruction'

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

interface ImportedName {
  readonly source: string
  readonly imported: string | null
}

interface Origin extends ImportedName {
  readonly path: readonly string[]
}

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

const staticMemberNameOf = (member: ESTree.MemberExpression): string | null => {
  if (member.computed === true) {
    const property = member.property
    return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
  }
  return member.property.type === 'Identifier' ? member.property.name : null
}

const bindingsOf = (program: ESTree.Program): Map<string, ImportedName> => {
  const bindings = new Map<string, ImportedName>()
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    const source = statement.source.value
    if (typeof source !== 'string') continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        bindings.set(specifier.local.name, { source, imported: null })
        continue
      }
      if (specifier.type === 'ImportDefaultSpecifier') {
        bindings.set(specifier.local.name, { source, imported: 'default' })
        continue
      }
      const imported = specifier.imported
      bindings.set(specifier.local.name, {
        source,
        imported: imported.type === 'Identifier' ? imported.name : imported.value,
      })
    }
  }
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    const before = bindings.size
    for (const statement of program.body) {
      if (statement.type !== 'VariableDeclaration') continue
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== 'Identifier' || declarator.init === null) continue
        if (declarator.init.type !== 'Identifier') continue
        const base = bindings.get(declarator.init.name)
        if (base === undefined || bindings.has(declarator.id.name)) continue
        bindings.set(declarator.id.name, base)
      }
    }
    if (bindings.size === before) break
  }
  return bindings
}

const originOf = (node: ESTree.Node, bindings: ReadonlyMap<string, ImportedName>): Origin | null => {
  if (node.type === 'Identifier') {
    const binding = bindings.get(node.name)
    return binding === undefined ? null : { ...binding, path: [] }
  }
  if (node.type !== 'MemberExpression') return null
  const member = staticMemberNameOf(node)
  if (member === null) return null
  const receiver = originOf(node.object, bindings)
  if (receiver === null) return null
  return receiver.imported === null
    ? { source: receiver.source, imported: member, path: [] }
    : { source: receiver.source, imported: receiver.imported, path: [...receiver.path, member] }
}

const trackedCallOf = (
  callee: ESTree.MemberExpression,
  bindings: ReadonlyMap<string, ImportedName>,
): TrackedWiringCall | null => {
  const member = staticMemberNameOf(callee)
  if (member === null) return null
  const receiver = originOf(callee.object, bindings)
  if (receiver === null || receiver.path.length > 0) return null
  return (
    TRACKED_WIRING_CALLS.find(
      (candidate) =>
        candidate.source === receiver.source &&
        candidate.member === member &&
        (candidate.namespace === receiver.imported || receiver.imported === null),
    ) ?? null
  )
}

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

export const runtimeConstructionPlacement = defineRule({
  meta,
  create(context: Context) {
    if (context.filename.endsWith('.tst.ts')) return {}

    let bindings: ReadonlyMap<string, ImportedName> = new Map()

    return {
      Program(node: ESTree.Program) {
        bindings = bindingsOf(node)
      },

      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const tracked = trackedCallOf(callee, bindings)
        if (tracked === null) return

        const name = `${tracked.namespace}.${tracked.member}`
        const enclosing = enclosingFunctionOf(node)

        if (enclosing !== null && isDeferredModuleClosure(enclosing)) return

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

        if (tracked.namespace !== MANAGED_RUNTIME_NAMESPACE) return

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
