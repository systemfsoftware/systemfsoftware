import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { meta, Options } from './no-unbounded-fanout.config.js'

export type MessageIds = 'unboundedFanout'

type CollectionCtor = 'S.Array' | 'S.Record' | 'fc.array'

type BindingValue = ESTree.Expression | ESTree.Function

interface WalkContext {
  readonly bindings: ReadonlyMap<string, BindingValue>
  readonly visited: Set<ESTree.Node>
  readonly onCollection: (call: ESTree.CallExpression, ctor: CollectionCtor) => void
}

const COLLECTION_BY_MEMBER: Record<string, Record<string, CollectionCtor>> = {
  S: { Array: 'S.Array', Record: 'S.Record' },
  fc: { array: 'fc.array' },
}

const collectionName = (callee: ESTree.MemberExpression): CollectionCtor | null => {
  if (callee.computed || callee.object.type !== 'Identifier') return null
  return COLLECTION_BY_MEMBER[callee.object.name]?.[callee.property.name] ?? null
}

const hasProvenLengthBound = (node: ESTree.CallExpression, ctor: CollectionCtor): boolean => {
  const optionsIndex = ctor === 'S.Record' ? 0 : 1
  const optionsArg = node.arguments[optionsIndex]
  if (optionsArg === undefined || optionsArg.type !== 'ObjectExpression') return false
  for (const prop of optionsArg.properties) {
    if (prop.type !== 'Property') continue
    if (prop.key.type !== 'Identifier') continue
    if (prop.key.name !== 'maxLength' && prop.key.name !== 'maxKeys') continue
    if (prop.value.type === 'Literal' && typeof prop.value.value === 'number') return true
  }
  return false
}

const collectBindings = (program: ESTree.Program): Map<string, BindingValue> => {
  const bindings = new Map<string, BindingValue>()
  const add = (decl: ESTree.Statement): void => {
    if (decl.type === 'VariableDeclaration') {
      for (const declarator of decl.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.init !== null) {
          bindings.set(declarator.id.name, declarator.init)
        }
      }
    } else if (decl.type === 'FunctionDeclaration') {
      if (decl.id !== null) bindings.set(decl.id.name, decl)
    }
  }
  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration !== null) add(stmt.declaration)
    } else {
      add(stmt)
    }
  }
  return bindings
}

const resolveValue = (node: ESTree.Node, bindings: ReadonlyMap<string, BindingValue>): ESTree.Node => {
  let current = node
  const seen = new Set<ESTree.Node>()
  while (current.type === 'Identifier' && !seen.has(current)) {
    seen.add(current)
    const bound = bindings.get(current.name)
    if (bound === undefined) break
    current = bound
  }
  return current
}

const isRecipeValue = (value: ESTree.Node): boolean => {
  if (value.type !== 'CallExpression') return false
  return value.callee.type === 'Identifier'
}

const collectRecipeRoots = (
  program: ESTree.Program,
  bindings: Map<string, BindingValue>,
): ESTree.Node[] => {
  const roots: ESTree.Node[] = []
  const consider = (value: ESTree.Node): void => {
    const resolved = resolveValue(value, bindings)
    if (isRecipeValue(resolved)) roots.push(resolved)
  }
  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration !== null && stmt.declaration.type === 'VariableDeclaration') {
        for (const declarator of stmt.declaration.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.init !== null) consider(declarator.init)
        }
      }
      for (const specifier of stmt.specifiers) {
        if (specifier.local.type === 'Identifier') {
          const bound = bindings.get(specifier.local.name)
          if (bound !== undefined) consider(bound)
        }
      }
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      consider(stmt.declaration)
    }
  }
  return roots
}

const walkStatement = (stmt: ESTree.Statement, ctx: WalkContext): void => {
  switch (stmt.type) {
    case 'VariableDeclaration':
      for (const declarator of stmt.declarations) {
        if (declarator.init !== null) walk(declarator.init, ctx)
      }
      break
    case 'ExpressionStatement':
      walk(stmt.expression, ctx)
      break
    case 'ReturnStatement':
      if (stmt.argument !== null) walk(stmt.argument, ctx)
      break
    case 'BlockStatement':
      for (const inner of stmt.body) walkStatement(inner, ctx)
      break
    case 'IfStatement':
      walkStatement(stmt.consequent, ctx)
      if (stmt.alternate !== null) walkStatement(stmt.alternate, ctx)
      break
    case 'SwitchStatement':
      for (const clause of stmt.cases) {
        for (const inner of clause.consequent) walkStatement(inner, ctx)
      }
      break
    case 'TryStatement':
      walkStatement(stmt.block, ctx)
      if (stmt.handler !== null) walkStatement(stmt.handler.body, ctx)
      if (stmt.finalizer !== null) walkStatement(stmt.finalizer, ctx)
      break
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'LabeledStatement':
      walkStatement(stmt.body, ctx)
      break
  }
}

const walkInvoked = (value: BindingValue, ctx: WalkContext): void => {
  switch (value.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration': {
      const body = value.body
      if (body === null) break
      if (body.type === 'BlockStatement') {
        for (const stmt of body.body) walkStatement(stmt, ctx)
      } else {
        walk(body, ctx)
      }
      break
    }
    default:
      walk(value, ctx)
  }
}

const walk = (node: ESTree.Node, ctx: WalkContext): void => {
  if (ctx.visited.has(node)) return
  ctx.visited.add(node)
  switch (node.type) {
    case 'CallExpression':
      if (node.callee.type === 'MemberExpression') {
        const ctor = collectionName(node.callee)
        if (ctor !== null && !hasProvenLengthBound(node, ctor)) ctx.onCollection(node, ctor)
        walk(node.callee.object, ctx)
      } else if (node.callee.type === 'Identifier') {
        const bound = ctx.bindings.get(node.callee.name)
        if (bound !== undefined) walkInvoked(bound, ctx)
      }
      for (const arg of node.arguments) walk(arg, ctx)
      break
    case 'Identifier': {
      const bound = ctx.bindings.get(node.name)
      if (bound !== undefined) walk(bound, ctx)
      break
    }
    case 'ObjectExpression':
      for (const prop of node.properties) {
        if (prop.type === 'Property') walk(prop.value, ctx)
        else walk(prop.argument, ctx)
      }
      break
    case 'ArrayExpression':
      for (const element of node.elements) {
        if (element !== null) walk(element, ctx)
      }
      break
    case 'MemberExpression':
      walk(node.object, ctx)
      break
  }
}

export const noUnboundedFanout = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const exempt = new Set(options.exempt)
    const basename = context.filename.slice(context.filename.lastIndexOf('/') + 1)
    return {
      Program(node: ESTree.Program) {
        if (exempt.has(basename)) return
        const bindings = collectBindings(node)
        const roots = collectRecipeRoots(node, bindings)
        const onCollection = (call: ESTree.CallExpression, ctor: CollectionCtor): void => {
          context.report({
            node: call,
            messageId: 'unboundedFanout',
            data: {
              name: `${ctor}(...) with no length bound`,
              expected:
                'a numeric length bound on the collection arbitrary (S.Array / fc.array: maxLength; S.Record: maxLength or maxKeys) so fan-out is capped independently of the depth cap',
              actual:
                'the collection arbitrary reaches a property generator with no bound the rule can read — a recursion depth cap (maxDepth) bounds depth only, and per-case cost still scales with generated length',
              fix:
                "add a numeric maxLength (e.g. S.Array(inner, { maxLength: 3 }), fc.array(arb, { maxLength: 3 })); if the fan-out is deliberately unbounded, add this file's basename to the rule's exempt option",
            },
          })
        }
        const ctx: WalkContext = { bindings, visited: new Set(), onCollection }
        for (const root of roots) walk(root, ctx)
      },
    }
  },
})
