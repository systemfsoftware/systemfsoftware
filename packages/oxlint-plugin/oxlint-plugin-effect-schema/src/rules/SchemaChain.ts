import type { ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type GetScope = (node: ESTree.Node) => unknown

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly type: string; readonly node: ESTree.Node }[] }>
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

export const MAX_WALK_DEPTH = 32

export const BARE_MEMBERS: Readonly<Record<string, true>> = {
  String: true,
  Number: true,
  Boolean: true,
  Unknown: true,
}

export const REFINEMENT_STEPS: Readonly<Record<string, true>> = {
  filter: true,
  check: true,
  minLength: true,
  maxLength: true,
  pattern: true,
}

export const TRANSPARENT_STEPS: Readonly<Record<string, true>> = {
  annotate: true,
}

export const STRUCT_MEMBERS: Readonly<Record<string, true>> = {
  Struct: true,
}

export const LOOKTHROUGH_MEMBERS: Readonly<Record<string, true>> = {
  optional: true,
  NullOr: true,
}

const TS_EXPRESSION_WRAPPERS: Readonly<Record<string, true>> = {
  TSAsExpression: true,
  TSSatisfiesExpression: true,
  TSNonNullExpression: true,
  TSTypeAssertion: true,
  TSInstantiationExpression: true,
}

type ExpressionWrapperNode = ESTree.Node & { readonly expression: ESTree.Node }

const isExpressionWrapper = (node: ESTree.Node): node is ExpressionWrapperNode =>
  TS_EXPRESSION_WRAPPERS[node.type] === true

export const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

export const vocabularyMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin) ?? null
}

const isNamespaceRoot = (node: ESTree.Node, getScope: GetScope): boolean => {
  const origin = resolveImportOrigin(node, getScope)
  return origin !== null && isSchemaVocabularyOrigin(origin) && origin.path.length === 0
}

const isEffectPipeCallee = (node: ESTree.Node, getScope: GetScope): boolean => {
  const origin = resolveImportOrigin(node, getScope)
  return (
    origin !== null &&
    (origin.source === 'effect' || origin.source === 'effect/Function') &&
    origin.importedName === 'pipe'
  )
}

export const localInitOf = (name: string, node: ESTree.Node, getScope: GetScope): ESTree.Node | null => {
  const scope = getScope(node)
  if (!isScopeLike(scope)) return null
  for (let current: ScopeLike | null = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name)
    if (variable === undefined) continue
    for (const def of variable.defs) {
      if (def.type === 'ImportBinding') return null
      if (def.node.type === 'VariableDeclarator' && def.node.init !== null && def.node.init !== undefined) {
        return def.node.init
      }
    }
    return null
  }
  return null
}

export type ChainAnalysis =
  | { readonly base: 'bare'; readonly member: string; readonly refined: boolean; readonly opaque: boolean }
  | { readonly base: 'other'; readonly member: null; readonly refined: boolean; readonly opaque: boolean }

const other = (refined: boolean, opaque: boolean): ChainAnalysis => ({
  base: 'other',
  member: null,
  refined,
  opaque,
})

export type StepKind = 'refinement' | 'transparent' | 'opaque' | 'brand'

export const classifyStepArg = (
  arg: ESTree.Node | ESTree.SpreadElement,
  getScope: GetScope,
): StepKind => {
  const node = arg.type === 'SpreadElement' ? arg.argument : arg
  const current = unwrapExpression(node)
  if (current.type !== 'CallExpression') return 'opaque'
  const { callee } = current
  if (callee.type !== 'MemberExpression' && callee.type !== 'Identifier') return 'opaque'
  const member = vocabularyMemberOf(callee, getScope)
  if (member === null) return 'opaque'
  if (member === 'brand') return 'brand'
  if (REFINEMENT_STEPS[member] === true) return 'refinement'
  if (TRANSPARENT_STEPS[member] === true) return 'transparent'
  return 'opaque'
}

type PipeArgs = ESTree.CallExpression['arguments']

const foldSteps = (
  inner: ChainAnalysis,
  args: PipeArgs,
  getScope: GetScope,
): ChainAnalysis => {
  let refined = inner.refined
  let opaque = inner.opaque
  for (const arg of args) {
    const step = classifyStepArg(arg, getScope)
    if (step === 'refinement') refined = true
    else if (step === 'opaque') opaque = true
  }
  if (inner.base !== 'bare') return other(refined, opaque)
  return { base: 'bare', member: inner.member, refined, opaque }
}

export const analyzeChain = (node: ESTree.Node, getScope: GetScope, depth: number): ChainAnalysis => {
  if (depth > MAX_WALK_DEPTH) return other(false, true)
  const current = unwrapExpression(node)
  switch (current.type) {
    case 'Identifier': {
      const init = localInitOf(current.name, current, getScope)
      if (init !== null) return analyzeChain(init, getScope, depth + 1)
      const member = vocabularyMemberOf(current, getScope)
      if (member !== null && BARE_MEMBERS[member] === true) {
        return { base: 'bare', member, refined: false, opaque: false }
      }
      return other(false, false)
    }
    case 'MemberExpression': {
      const member = vocabularyMemberOf(current, getScope)
      if (member !== null && BARE_MEMBERS[member] === true) {
        return { base: 'bare', member, refined: false, opaque: false }
      }
      return other(false, false)
    }
    case 'CallExpression': {
      return analyzeCall(current, getScope, depth)
    }
    default:
      return other(false, false)
  }
}

const analyzeCall = (call: ESTree.CallExpression, getScope: GetScope, depth: number): ChainAnalysis => {
  const { callee } = call
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'pipe'
  ) {
    return foldSteps(analyzeChain(callee.object, getScope, depth + 1), call.arguments, getScope)
  }
  if (callee.type === 'Identifier' && callee.name === 'pipe' && isEffectPipeCallee(callee, getScope)) {
    const first = call.arguments[0]
    if (first === undefined || first.type === 'SpreadElement') return other(false, true)
    return foldSteps(analyzeChain(first, getScope, depth + 1), call.arguments.slice(1), getScope)
  }
  if (callee.type === 'MemberExpression') {
    const member = vocabularyMemberOf(callee, getScope)
    if (member !== null && LOOKTHROUGH_MEMBERS[member] === true && isNamespaceRoot(callee.object, getScope)) {
      const first = call.arguments[0]
      if (first === undefined || first.type === 'SpreadElement') return other(false, true)
      return analyzeChain(first, getScope, depth + 1)
    }
    if (member !== null && (REFINEMENT_STEPS[member] === true || TRANSPARENT_STEPS[member] === true)) {
      const inner = analyzeChain(callee.object, getScope, depth + 1)
      if (inner.base !== 'bare') return other(inner.refined, inner.opaque)
      return {
        base: 'bare',
        member: inner.member,
        refined: inner.refined || REFINEMENT_STEPS[member] === true,
        opaque: inner.opaque,
      }
    }
    return other(false, false)
  }
  return other(false, true)
}

export interface BrandSite {
  readonly node: ESTree.Node
  readonly fires: boolean
  readonly brand: string | null
}

const brandNameOf = (call: ESTree.CallExpression): string | null => {
  const first = call.arguments[0]
  if (first !== undefined && first.type !== 'SpreadElement') {
    const current = unwrapExpression(first)
    if (current.type === 'Literal' && typeof current.value === 'string') return current.value
  }
  return null
}

const isFactoryBrandCall = (node: ESTree.Node, getScope: GetScope): node is ESTree.CallExpression => {
  if (node.type !== 'CallExpression') return false
  const { callee } = node
  if (callee.type === 'Identifier') return vocabularyMemberOf(callee, getScope) === 'brand'
  if (callee.type !== 'MemberExpression') return false
  if (vocabularyMemberOf(callee, getScope) !== 'brand') return false
  return isNamespaceRoot(callee.object, getScope)
}

export const collectBrandSites = (call: ESTree.CallExpression, getScope: GetScope): readonly BrandSite[] => {
  const { callee } = call
  let receiver: ESTree.Node | null = null
  let rest: PipeArgs = []
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'pipe'
  ) {
    receiver = callee.object
    rest = call.arguments
  } else if (callee.type === 'Identifier' && callee.name === 'pipe' && isEffectPipeCallee(callee, getScope)) {
    const first = call.arguments[0]
    if (first === undefined || first.type === 'SpreadElement') return []
    receiver = first
    rest = call.arguments.slice(1)
  } else {
    return []
  }
  const inner = analyzeChain(receiver, getScope, 0)
  if (inner.base !== 'bare') return []
  let refined = inner.refined
  let opaque = inner.opaque
  const sites: BrandSite[] = []
  for (const arg of rest) {
    const node = arg.type === 'SpreadElement' ? arg.argument : arg
    const current = unwrapExpression(node)
    if (isFactoryBrandCall(current, getScope)) {
      sites.push({ node: current, fires: !refined && !opaque, brand: brandNameOf(current) })
      continue
    }
    const step = classifyStepArg(arg, getScope)
    if (step === 'refinement') refined = true
    else if (step === 'opaque' || step === 'brand') opaque = true
  }
  return sites
}
