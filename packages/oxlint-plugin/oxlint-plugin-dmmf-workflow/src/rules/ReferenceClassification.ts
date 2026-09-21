import type { Context, ESTree } from '@oxlint/plugins'
import type { MakeBodyKind } from '@systemfsoftware/oxlint-make-boundary'
import {
  BENIGN_GLOBAL_NAMES,
  EFFECT_PURE_SUBPATHS,
  EFFECT_ROOT_IO_NAMES,
  EFFECT_ROOT_PURE_NAMES,
  IO_GLOBAL_NAMES,
  IO_SOURCES,
} from './make-body-purity.config.js'

type IdentifierLike = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }

/**
 * The KTD3 verdict for one reference inside a `Workflow.make` body. The pass set
 * is parameters, const locals, module declarations, benign builtins and the
 * sealed pure `effect` surface; the fail set is I/O imports, any other import,
 * module-level state, locally mutable bindings, I/O globals, an unbound name,
 * a runtime import, and a mutation of a module-scope container.
 */
export type ReferenceVerdict =
  | { readonly kind: 'parameter' }
  | { readonly kind: 'localConst' }
  | { readonly kind: 'moduleValue' }
  | { readonly kind: 'importPure'; readonly source: string }
  | { readonly kind: 'unsealedImport'; readonly source: string }
  | { readonly kind: 'benignGlobal' }
  | { readonly kind: 'ioImport'; readonly source: string }
  | { readonly kind: 'moduleState' }
  | { readonly kind: 'localMutable' }
  | { readonly kind: 'ioGlobal' }
  | { readonly kind: 'unresolvable' }
  | { readonly kind: 'runtimeImport' }
  | { readonly kind: 'moduleMutation' }

export interface ReferenceReport {
  readonly identifier: ESTree.Node
  readonly name: string
  readonly verdict: ReferenceVerdict
}

/** The verdicts a make body must not contain. */
export const isFailingVerdict = (verdict: ReferenceVerdict): boolean =>
  verdict.kind === 'ioImport' ||
  verdict.kind === 'unsealedImport' ||
  verdict.kind === 'moduleState' ||
  verdict.kind === 'localMutable' ||
  verdict.kind === 'ioGlobal' ||
  verdict.kind === 'unresolvable' ||
  verdict.kind === 'runtimeImport' ||
  verdict.kind === 'moduleMutation'

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

const isNodeLike = (value: unknown): value is ESTree.Node =>
  isWalkable(value) && typeof value['start'] === 'number' && typeof value['end'] === 'number'

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
const TS_TYPE_REGION_TYPES: Readonly<Record<string, true>> = {
  TSTypeAnnotation: true,
  TSTypeParameterDeclaration: true,
  TSTypeParameterInstantiation: true,
  TSInterfaceDeclaration: true,
  TSTypeAliasDeclaration: true,
  TSDeclareFunction: true,
  TSImportType: true,
}

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
    if (TS_TYPE_REGION_TYPES[type] === true) {
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

/**
 * A decision is the innermost point of the sandwich, so imports flow toward it
 * and never out of it: the reader imports the workflow. A `Workflow.make` body
 * importing a local module inverts that, inventing a layer beneath the pure core
 * whose purity no rule decides - `make-body-purity` fires on make bodies alone,
 * so a module reached from inside one is checked by nothing. Any import outside
 * the sealed pure `effect` surface is therefore a finding: the referenced code
 * belongs in this file, or the decision belongs where that code already lives.
 *
 * The verdict keys on the module source and the *imported* name, never on the
 * local binding: `import { Array as Arr } from 'effect'` is the one canonical
 * way to alias a pure module, so renaming the import is not an evasion.
 */
const classifyImportBinding = (def: DefinitionLike): ReferenceVerdict => {
  const declaration = def.parent
  if (declaration === null || declaration.type !== 'ImportDeclaration') {
    return { kind: 'unresolvable' }
  }
  const source = declaration.source.value
  if (typeof source !== 'string') return { kind: 'unresolvable' }
  const specifier = def.node
  let importedName: string | null = null
  if (specifier.type === 'ImportSpecifier') {
    if (specifier.imported.type !== 'Identifier') return { kind: 'unresolvable' }
    importedName = specifier.imported.name
  } else if (specifier.type === 'ImportDefaultSpecifier') {
    importedName = 'default'
  }
  if (IO_SOURCES.has(source)) return { kind: 'ioImport', source }
  if (source === 'effect') {
    if (EFFECT_ROOT_IO_NAMES.has(importedName ?? '')) return { kind: 'ioImport', source }
    if (EFFECT_ROOT_PURE_NAMES.has(importedName ?? '')) return { kind: 'importPure', source }
    return { kind: 'unsealedImport', source }
  }
  if (EFFECT_PURE_SUBPATHS.has(source)) return { kind: 'importPure', source }
  return { kind: 'unsealedImport', source }
}

const isMutableDeclaration = (def: DefinitionLike): boolean =>
  def.parent !== null &&
  def.parent.type === 'VariableDeclaration' &&
  (def.parent.kind === 'let' || def.parent.kind === 'var')

/**
 * The named-global triage for a reference that resolves to nothing, shared by the
 * unresolved-reference path and the empty-defs path. A builtin global (undefined, NaN,
 * Infinity) resolves to a variable with no definitions - empty defs is the builtin case,
 * so both paths run the same I/O-global / benign-builtin / honest-unknown decision.
 * `require` is not one of them: it is a runtime import, owned by the operation scan as
 * its own verdict, and a bare `require` binding resolves to nothing here.
 */
const reportUnresolved = (reports: ReferenceReport[], identifier: IdentifierLike): void => {
  if (identifier.name === 'require') return
  const verdict: ReferenceVerdict = IO_GLOBAL_NAMES.has(identifier.name)
    ? { kind: 'ioGlobal' }
    : BENIGN_GLOBAL_NAMES.has(identifier.name)
    ? { kind: 'benignGlobal' }
    : { kind: 'unresolvable' }
  reports.push({ identifier, name: identifier.name, verdict })
}

/**
 * The variable a reference identifier resolves to, found by identity in the
 * reference's own scope - the same shadow-correct walk the boundary kernel
 * uses for its callee resolution.
 */
const variableOf = (identifier: IdentifierLike, getScope: (node: ESTree.Node) => unknown): VariableLike | null => {
  const scopeValue: unknown = getScope(identifier)
  const scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  if (scope === null) return null
  const found = scope.references.find((reference) => reference.identifier === identifier)
  return found === undefined ? null : found.resolved
}

const isWithinFunction = (node: ESTree.Node, fn: MakeBodyKind): boolean => node.start >= fn.start && node.end <= fn.end

/**
 * A module-scope `const` record (an object-literal initializer) carrying at
 * least one function member: a method, a function-valued property or a getter
 * (nesting included). Referencing one from a decision body can run that code,
 * so the classifier follows exactly the members the body touches. An object
 * literal of only literal-valued properties is a constant record and stays a
 * passing `moduleValue`.
 */
interface RecordFunction {
  readonly path: readonly string[]
  readonly fn: MakeBodyKind
  readonly isGetter: boolean
}

const recordFunctionsOf = (value: ESTree.Node, path: readonly string[], into: RecordFunction[]): void => {
  if (value.type !== 'ObjectExpression') return
  for (const property of value.properties) {
    if (property.type !== 'Property' || property.computed) continue
    const key = property.key
    if (key.type !== 'Identifier') continue
    const memberPath = [...path, key.name]
    const propValue = property.value
    if (property.kind === 'get') {
      if (isFunctionLike(propValue)) into.push({ path: memberPath, fn: propValue, isGetter: true })
    } else if (isArrowFunction(propValue) || isFunctionLike(propValue)) {
      into.push({ path: memberPath, fn: propValue, isGetter: false })
    } else {
      recordFunctionsOf(propValue, memberPath, into)
    }
  }
}

const recordInfoOf = (
  def: DefinitionLike,
  variable: VariableLike,
): { readonly functions: readonly RecordFunction[] } | null => {
  if (def.type !== 'Variable') return null
  const declaration = def.parent
  if (declaration === null || !isVariableDeclaration(declaration) || declaration.kind !== 'const') return null
  if (!isVariableDeclarator(def.node)) return null
  const init = def.node.init
  if (init === null || init.type !== 'ObjectExpression') return null
  if (variable.scope.type !== 'module' && variable.scope.type !== 'global') return null
  const functions: RecordFunction[] = []
  recordFunctionsOf(init, [], functions)
  return functions.length === 0 ? null : { functions }
}

type RecordPath = { readonly path: readonly string[] } | 'opaque' | null

const memberNameOf = (node: ESTree.Node): string | null => {
  if (node.type !== 'MemberExpression') return null
  const property = node.property
  return property.type === 'Identifier' && !node.computed
    ? property.name
    : property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : null
}

const memberChainRoot = (node: ESTree.Node): ESTree.Node => {
  let root: ESTree.Node = node
  while (root.type === 'MemberExpression') root = root.object
  return root
}

const memberChainText = (node: ESTree.Node): string | null => {
  if (node.type === 'MemberExpression') {
    const object = memberChainText(node.object)
    if (object === null) return null
    const name = memberNameOf(node)
    return name === null ? null : `${object}.${name}`
  }
  if (node.type === 'Identifier') return node.name
  return null
}

/**
 * The member path from the record binding to `node`: `{ path: [] }` for the
 * binding itself, a dotted path for a member chain on it, `'opaque'` when the
 * chain has a dynamic key (any member may run) and `null` when `node` does not
 * reach the record.
 */
const recordPathOf = (
  node: ESTree.Node,
  record: VariableLike,
  getScope: (node: ESTree.Node) => unknown,
  depth: number,
): RecordPath => {
  if (depth > 8) return null
  if (node.type === 'MemberExpression') {
    const object = recordPathOf(node.object, record, getScope, depth + 1)
    if (object === null) return null
    if (object === 'opaque') return 'opaque'
    const name = memberNameOf(node)
    if (name === null) return 'opaque'
    return { path: [...object.path, name] }
  }
  if (node.type !== 'Identifier') return null
  const variable = variableOf(node, getScope)
  if (variable === null) return null
  if (variable === record) return { path: [] }
  for (const def of variable.defs) {
    if (def.type !== 'Variable') continue
    const declaration = def.parent
    if (declaration === null || !isVariableDeclaration(declaration) || declaration.kind !== 'const') continue
    if (!isVariableDeclarator(def.node)) continue
    const init = def.node.init
    if (init === null) continue
    return recordPathOf(init, record, getScope, depth + 1)
  }
  return null
}

/**
 * Which members of the record a decision body actually executes: the paths it
 * calls (methods and callable properties), the paths it accesses (getters
 * fire on property reads), and whether the record escapes whole (a spread, a
 * pass-through, a dynamic index) - an escape makes every member reachable.
 */
interface RecordUsage {
  readonly called: ReadonlySet<string>
  readonly accessed: ReadonlySet<string>
  readonly opaque: boolean
}

const recordUsageOf = (
  fn: MakeBodyKind,
  record: VariableLike,
  getScope: (node: ESTree.Node) => unknown,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): RecordUsage => {
  const called = new Set<string>()
  const accessed = new Set<string>()
  let opaque = false
  const consumedRoots = new Set<ESTree.Node>()

  const markRoot = (member: ESTree.Node): void => {
    const root = memberChainRoot(member)
    if (root.type === 'Identifier') consumedRoots.add(root)
  }

  const walk = (value: unknown, isCallee: boolean): void => {
    if (!isNodeLike(value) || !isWalkable(value)) return
    if (value.type === 'CallExpression') {
      const path = recordPathOf(value.callee, record, getScope, 0)
      if (path === 'opaque') {
        opaque = true
        markRoot(value.callee)
      } else if (path !== null) {
        called.add(path.path.join('.'))
        markRoot(value.callee)
      }
      for (const key of visitorKeys[value.type] ?? []) {
        const child = value[key]
        if (Array.isArray(child)) {
          for (const entry of child) walk(entry, key === 'callee')
        } else {
          walk(child, key === 'callee')
        }
      }
      return
    }
    if (value.type === 'MemberExpression') {
      const path = recordPathOf(value, record, getScope, 0)
      if (path === 'opaque') {
        opaque = true
      } else if (path !== null && path.path.length > 0) {
        const target = isCallee ? called : accessed
        target.add(path.path.join('.'))
        markRoot(value)
      }
    }
    if (value.type === 'Identifier' && !consumedRoots.has(value)) {
      const path = recordPathOf(value, record, getScope, 0)
      if (path === 'opaque' || (path !== null && path.path.length === 0)) {
        opaque = true
      }
    }
    for (const key of visitorKeys[value.type] ?? []) {
      const child = value[key]
      if (Array.isArray(child)) {
        for (const entry of child) walk(entry, isCallee)
      } else {
        walk(child, isCallee)
      }
    }
  }

  walk(fn, false)
  return { called, accessed, opaque }
}

const recordContains = (usage: RecordUsage, fn: RecordFunction): boolean => {
  if (usage.opaque) return true
  const path = fn.path.join('.')
  if (fn.isGetter) {
    for (const accessed of usage.accessed) {
      if (accessed === path || accessed.startsWith(`${path}.`)) return true
    }
    return false
  }
  return usage.called.has(path)
}

/**
 * An assignment, update, delete or mutating container-method call whose target
 * is a member of a module-scope `const` container: `state.count += x`,
 * `state.items.push(…)`, `map.set(…)`. The container is shared across the
 * module's runs, so writing it from inside the decision is module-state
 * mutation even though the binding is `const` - the reference classifier only
 * counts `let`/`var` bindings, which is exactly the hole this closes.
 * Parameters and body-local containers are the caller's or the decision's own
 * and stay exempt.
 */
const MUTATING_METHODS: Readonly<Record<string, true>> = {
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

/**
 * Whether the member-chain root is a module-scope `const` container: its
 * binding is a const declared at module level, not a parameter and not a
 * decision-body local. Those are the only containers a write can illegally
 * reach from inside the decision.
 */
const isModuleConstContainer = (
  root: ESTree.Node,
  fn: MakeBodyKind,
  getScope: (node: ESTree.Node) => unknown,
): boolean => {
  if (root.type !== 'Identifier') return false
  const variable = variableOf(root, getScope)
  if (variable === null) return false
  for (const def of variable.defs) {
    if (def.type === 'Parameter') return false
  }
  const def = variable.defs[0]
  if (def === undefined || def.type !== 'Variable') return false
  const declaration = def.parent
  if (declaration === null || !isVariableDeclaration(declaration) || declaration.kind !== 'const') return false
  if (!isVariableDeclarator(def.node)) return false
  if (isWithinFunction(def.node, fn)) return false
  return variable.scope.type === 'module' || variable.scope.type === 'global'
}

const reportModuleMutation = (
  reports: ReferenceReport[],
  node: ESTree.Node,
  chainText: string,
  isCall: boolean,
): void => {
  reports.push({
    identifier: node,
    name: isCall ? `a mutating method call (${chainText})` : `a mutation of ${chainText}`,
    verdict: { kind: 'moduleMutation' },
  })
}

/**
 * The operation scan of a decision body (and of every helper the body calls):
 * the runtime imports (`import(...)` and `require(...)`) and the writes to
 * module-scope `const` containers. Neither is a reference, so neither shows up
 * in the scope walk - both must be found by walking the tree. A decision has
 * no business importing at runtime, so no exemption exists.
 */
const collectOperations = (fn: MakeBodyKind, context: Context, reports: ReferenceReport[]): void => {
  const visitorKeys = context.sourceCode.visitorKeys
  const getScope = context.sourceCode.getScope
  const walk = (value: unknown): void => {
    if (!isNodeLike(value) || !isWalkable(value)) return
    if (value.type === 'ImportExpression') {
      reports.push({ identifier: value, name: 'a runtime import', verdict: { kind: 'runtimeImport' } })
    } else if (value.type === 'CallExpression') {
      const callee = value.callee
      if (callee.type === 'Identifier' && callee.name === 'require') {
        reports.push({ identifier: callee, name: 'a runtime import', verdict: { kind: 'runtimeImport' } })
      } else if (callee.type === 'MemberExpression') {
        const name = memberNameOf(callee)
        if (
          name !== null && MUTATING_METHODS[name] === true &&
          isModuleConstContainer(memberChainRoot(callee), fn, getScope)
        ) {
          const chain = memberChainText(callee)
          if (chain !== null) reportModuleMutation(reports, callee, chain, true)
        }
      }
    }
    if (value.type === 'AssignmentExpression' || value.type === 'UpdateExpression') {
      const target: ESTree.Node = value.type === 'AssignmentExpression' ? value.left : value.argument
      if (target.type === 'MemberExpression') {
        if (isModuleConstContainer(memberChainRoot(target), fn, getScope)) {
          const chain = memberChainText(target)
          if (chain !== null) reportModuleMutation(reports, target, chain, false)
        }
      }
    } else if (value.type === 'UnaryExpression' && value.operator === 'delete') {
      const target = value.argument
      if (target.type === 'MemberExpression') {
        if (isModuleConstContainer(memberChainRoot(target), fn, getScope)) {
          const chain = memberChainText(target)
          if (chain !== null) reportModuleMutation(reports, target, chain, false)
        }
      }
    }
    for (const key of visitorKeys[value.type] ?? []) {
      const child = value[key]
      if (Array.isArray(child)) {
        for (const entry of child) walk(entry)
      } else {
        walk(child)
      }
    }
  }
  walk(fn)
}

/**
 * The module-scope helper resolution: a const-arrow, a function expression or
 * a function declaration a decision body calls. Anything else is not a helper
 * the classifier can enter - the reference itself is judged instead.
 */
const helperFunctionOf = (def: DefinitionLike): MakeBodyKind | null => {
  if (def.type === 'FunctionName' && isFunctionLike(def.node)) return def.node
  if (def.type !== 'Variable') return null
  const declaration = def.parent
  if (declaration === null || !isVariableDeclaration(declaration) || declaration.kind !== 'const') return null
  if (!isVariableDeclarator(def.node)) return null
  const init = def.node.init
  if (init === null) return null
  if (isArrowFunction(init) || isFunctionLike(init)) return init
  return null
}

const moduleLevelOf = (variable: VariableLike): boolean =>
  variable.scope.type === 'module' || variable.scope.type === 'global'

/**
 * The KTD3 reports of a make body: every value reference in the body's scope
 * tree - module-level helper functions and touched record members the body
 * calls followed and judged the same way (a shared visited set terminates the
 * follow) - plus the operation scan. Type-position identifiers are excluded.
 */
export const classifyFunctionReferences = (
  fn: MakeBodyKind,
  context: Context,
  reports: ReferenceReport[],
  visited: ReadonlySet<MakeBodyKind>,
): void => {
  if (visited.has(fn)) return
  const nextVisited: ReadonlySet<MakeBodyKind> = new Set(visited).add(fn)
  collectOperations(fn, context, reports)
  const scopeValue: unknown = context.sourceCode.getScope(fn)
  const rootScope = isScopeLike(scopeValue) ? scopeValue : null
  if (rootScope === null) return
  const typeRegions = typeRegionRangesOf(fn, context.sourceCode.visitorKeys)
  const recordUsages = new Map<VariableLike, RecordUsage>()

  const collect = (scope: ScopeLike): void => {
    for (const reference of scope.references) {
      const identifier = reference.identifier
      if (isInsideRegion(identifier.start, identifier.end, typeRegions)) continue
      const variable = reference.resolved
      if (variable === null) {
        reportUnresolved(reports, identifier)
        continue
      }
      const def = variable.defs[0]
      if (def === undefined) {
        reportUnresolved(reports, identifier)
        continue
      }
      if (def.type === 'Parameter') {
        reports.push({ identifier, name: identifier.name, verdict: { kind: 'parameter' } })
        continue
      }
      if (def.type === 'ImportBinding') {
        reports.push({ identifier, name: identifier.name, verdict: classifyImportBinding(def) })
        continue
      }
      if (def.type === 'ClassName') {
        reports.push({ identifier, name: identifier.name, verdict: { kind: 'moduleValue' } })
        continue
      }
      if (def.type === 'FunctionName' || def.type === 'Variable') {
        const record = recordInfoOf(def, variable)
        if (record !== null) {
          let usage = recordUsages.get(variable)
          if (usage === undefined) {
            usage = recordUsageOf(fn, variable, context.sourceCode.getScope, context.sourceCode.visitorKeys)
            recordUsages.set(variable, usage)
          }
          for (const member of record.functions) {
            if (recordContains(usage, member)) {
              classifyFunctionReferences(member.fn, context, reports, nextVisited)
            }
          }
        }
        const helper = helperFunctionOf(def)
        if (helper !== null) classifyFunctionReferences(helper, context, reports, nextVisited)
        const mutable = isMutableDeclaration(def)
        const moduleLevel = moduleLevelOf(variable)
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
