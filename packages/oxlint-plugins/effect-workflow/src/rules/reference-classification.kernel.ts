import type { Context, ESTree } from '@oxlint/plugins'
import {
  BENIGN_GLOBAL_NAMES,
  EFFECT_PURE_SUBPATHS,
  EFFECT_ROOT_IO_NAMES,
  EFFECT_ROOT_PURE_NAMES,
  IO_GLOBAL_NAMES,
  IO_SOURCES,
  LOCAL_PURE_SOURCES,
} from './make-body-purity.config.js'
import type { MakeBodyKind } from './make-boundary.kernel.js'

type IdentifierLike = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }

/**
 * The KTD3 verdict for one reference inside a `Workflow.make` body. The pass
 * set is parameters, const locals, module declarations and imports from
 * audited-pure modules; the fail set is I/O imports, module-level state,
 * locally mutable bindings, I/O globals, and the honest unknown.
 */
export type ReferenceVerdict =
  | { readonly kind: 'parameter' }
  | { readonly kind: 'localConst' }
  | { readonly kind: 'moduleValue' }
  | { readonly kind: 'importPure'; readonly source: string }
  | { readonly kind: 'benignGlobal' }
  | { readonly kind: 'ioImport'; readonly source: string }
  | { readonly kind: 'moduleState' }
  | { readonly kind: 'localMutable' }
  | { readonly kind: 'ioGlobal' }
  | { readonly kind: 'unresolvable' }

export interface ReferenceReport {
  readonly identifier: IdentifierLike
  readonly name: string
  readonly verdict: ReferenceVerdict
}

/** The verdicts a make body must not contain. */
export const isFailingVerdict = (verdict: ReferenceVerdict): boolean =>
  verdict.kind === 'ioImport' ||
  verdict.kind === 'moduleState' ||
  verdict.kind === 'localMutable' ||
  verdict.kind === 'ioGlobal' ||
  verdict.kind === 'unresolvable'

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent: ESTree.Node | null
}

interface VariableLike {
  readonly scope: { readonly type: string; readonly block: ESTree.Node }
  readonly defs: readonly DefinitionLike[]
}

interface ReferenceLike {
  readonly identifier: IdentifierLike
  readonly resolved: VariableLike | null
}

interface ScopeLike {
  readonly type: string
  readonly childScopes: readonly ScopeLike[]
  readonly block: ESTree.Node
  readonly references: readonly ReferenceLike[]
}

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'childScopes' in value

const isVariableDeclaration = (node: ESTree.Node): node is ESTree.VariableDeclaration =>
  node.type === 'VariableDeclaration'

const isVariableDeclarator = (node: ESTree.Node): node is ESTree.VariableDeclarator =>
  node.type === 'VariableDeclarator'

const isFunctionLike = (node: ESTree.Node): node is ESTree.Function & {
  readonly type: 'FunctionDeclaration' | 'FunctionExpression'
} => node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'

const isArrowFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression =>
  node.type === 'ArrowFunctionExpression'

/** The TS-only node kinds whose identifiers are type references, not value references. */
const TS_TYPE_REGION_TYPES: ReadonlySet<string> = new Set([
  'TSTypeAnnotation',
  'TSTypeParameterDeclaration',
  'TSTypeParameterInstantiation',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'TSImportType',
])

/** The start offsets of every type-only subtree inside the body. */
const typeRegionRangesOf = (
  body: ESTree.Node,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): ReadonlyArray<readonly [number, number]> => {
  const regions: Array<readonly [number, number]> = []
  const walk = (value: unknown): void => {
    if (!isWalkable(value)) return
    const type = value['type']
    if (typeof type !== 'string') return
    if (TS_TYPE_REGION_TYPES.has(type)) {
      const start = value['start']
      const end = value['end']
      if (typeof start === 'number' && typeof end === 'number') regions.push([start, end])
      return
    }
    if (type === 'TSAsExpression') {
      // `as const` (and any as-cast) puts only its type subtree in type space; the
      // expression side stays value space and its references keep being checked.
      const annotation = value['typeAnnotation']
      const start = isWalkable(annotation) ? annotation['start'] : undefined
      const end = isWalkable(annotation) ? annotation['end'] : undefined
      if (typeof start === 'number' && typeof end === 'number') regions.push([start, end])
    }
    for (const key of visitorKeys[type] ?? []) {
      const child = value[key]
      if (Array.isArray(child)) {
        for (const entry of child) walk(entry)
      } else {
        walk(child)
      }
    }
  }
  walk(body)
  return regions
}

const isInsideRegion = (
  start: number,
  end: number,
  regions: ReadonlyArray<readonly [number, number]>,
): boolean => regions.some(([regionStart, regionEnd]) => start >= regionStart && end <= regionEnd)

const classifyImportBinding = (def: DefinitionLike, name: string): ReferenceVerdict => {
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'ImportDeclaration') {
    return { kind: 'unresolvable' }
  }
  const source = declaration.source.value
  if (typeof source !== 'string') return { kind: 'unresolvable' }
  if (IO_SOURCES.has(source)) return { kind: 'ioImport', source }
  if (source === 'effect') {
    if (EFFECT_ROOT_IO_NAMES.has(name)) return { kind: 'ioImport', source }
    if (EFFECT_ROOT_PURE_NAMES.has(name)) return { kind: 'importPure', source }
    return { kind: 'unresolvable' }
  }
  if (EFFECT_PURE_SUBPATHS.has(source)) return { kind: 'importPure', source }
  if (LOCAL_PURE_SOURCES.has(source)) return { kind: 'importPure', source }
  return { kind: 'unresolvable' }
}

const helperFunctionOf = (def: DefinitionLike): MakeBodyKind | null => {
  if (def.type === 'FunctionName' && isFunctionLike(def.node)) return def.node
  if (def.type !== 'Variable') return null
  if (def.parent === null || !isVariableDeclaration(def.parent) || def.parent.kind !== 'const') return null
  if (!isVariableDeclarator(def.node)) return null
  const init = def.node.init
  if (init === null) return null
  if (isArrowFunction(init) || isFunctionLike(init)) return init
  return null
}

const isMutableDeclaration = (def: DefinitionLike): boolean =>
  def.parent !== null &&
  def.parent.type === 'VariableDeclaration' &&
  (def.parent.kind === 'let' || def.parent.kind === 'var')

/**
 * The KTD3 reference reports of a make body: every value reference in the
 * body's scope tree, with module-level helper functions the body calls
 * followed and judged the same way (a shared visited set terminates the
 * follow). Type-position identifiers are excluded.
 */
export const classifyFunctionReferences = (
  fn: MakeBodyKind,
  context: Context,
  reports: ReferenceReport[],
  visited: ReadonlySet<MakeBodyKind>,
): void => {
  if (visited.has(fn)) return
  const nextVisited: ReadonlySet<MakeBodyKind> = new Set(visited).add(fn)
  const scopeValue: unknown = context.sourceCode.getScope(fn)
  const rootScope = isScopeLike(scopeValue) ? scopeValue : null
  if (rootScope === null) return
  const typeRegions = typeRegionRangesOf(fn, context.sourceCode.visitorKeys)

  const collect = (scope: ScopeLike): void => {
    for (const reference of scope.references) {
      const identifier = reference.identifier
      if (isInsideRegion(identifier.start, identifier.end, typeRegions)) continue
      const variable = reference.resolved
      if (variable === null) {
        reports.push({
          identifier,
          name: identifier.name,
          verdict: IO_GLOBAL_NAMES.has(identifier.name)
            ? { kind: 'ioGlobal' }
            : BENIGN_GLOBAL_NAMES.has(identifier.name)
            ? { kind: 'benignGlobal' }
            : { kind: 'unresolvable' },
        })
        continue
      }
      const def = variable.defs[0]
      if (def === undefined) {
        // A builtin global (undefined, NaN, Infinity) resolves to a variable with no
        // definitions — empty defs is the builtin case, so the same named-global
        // triage the unresolved path runs applies here too.
        reports.push({
          identifier,
          name: identifier.name,
          verdict: IO_GLOBAL_NAMES.has(identifier.name)
            ? { kind: 'ioGlobal' }
            : BENIGN_GLOBAL_NAMES.has(identifier.name)
            ? { kind: 'benignGlobal' }
            : { kind: 'unresolvable' },
        })
        continue
      }
      if (def.type === 'Parameter') {
        reports.push({ identifier, name: identifier.name, verdict: { kind: 'parameter' } })
        continue
      }
      if (def.type === 'ImportBinding') {
        reports.push({ identifier, name: identifier.name, verdict: classifyImportBinding(def, identifier.name) })
        continue
      }
      if (def.type === 'ClassName') {
        reports.push({ identifier, name: identifier.name, verdict: { kind: 'moduleValue' } })
        continue
      }
      if (def.type === 'FunctionName' || def.type === 'Variable') {
        const helper = helperFunctionOf(def)
        if (helper !== null) classifyFunctionReferences(helper, context, reports, nextVisited)
        const mutable = isMutableDeclaration(def)
        const moduleLevel = variable.scope.type === 'module' || variable.scope.type === 'global'
        const verdict: ReferenceVerdict = mutable
          ? moduleLevel
            ? { kind: 'moduleState' }
            : { kind: 'localMutable' }
          : moduleLevel
          ? { kind: 'moduleValue' }
          : { kind: 'localConst' }
        reports.push({ identifier, name: identifier.name, verdict })
        continue
      }
      reports.push({ identifier, name: identifier.name, verdict: { kind: 'unresolvable' } })
    }
    for (const child of scope.childScopes) collect(child)
  }

  collect(rootScope)
}

export const classifyBodyReferences = (body: MakeBodyKind, context: Context): readonly ReferenceReport[] => {
  const reports: ReferenceReport[] = []
  classifyFunctionReferences(body, context, reports, new Set())
  return reports
}
