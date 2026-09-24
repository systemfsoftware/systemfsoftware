import type { ESTree } from '@oxlint/plugins'
import { type ImportOrigin, originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'

/**
 * Machinery shared by the two kernel-boundary rules (`sandwich-shell-is-straight-line`,
 * `medium-owns-no-recovery`): the node walk with type regions pruned, the
 * same-file function resolution that lets a rule follow a boundary into a
 * helper, and the import-origin predicates both rules key on. The rules own
 * their policies; everything here is vocabulary-agnostic.
 */

/** A same-file function a rule can enter and scan. */
export type BoundaryFunction =
  | ESTree.ArrowFunctionExpression
    & { readonly type: 'ArrowFunctionExpression' }
  | (ESTree.Function & {
    readonly type: 'FunctionDeclaration' | 'FunctionExpression'
  })

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isArrowFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression =>
  node.type === 'ArrowFunctionExpression'

export const isFunctionDeclaration = (node: ESTree.Node): boolean =>
  node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'

export const isBoundaryFunction = (node: ESTree.Node): node is BoundaryFunction =>
  isArrowFunction(node) || isFunctionDeclaration(node)

const spanOf = (value: unknown): readonly [number, number] | null => {
  if (!isWalkable(value)) return null
  const start = value['start']
  const end = value['end']
  return typeof start === 'number' && typeof end === 'number' ? [start, end] : null
}

/**
 * The TS-only node kinds whose contents are type syntax: erased before
 * anything runs, so a `Clock.Clock` annotation is not a clock read. A node
 * whose type starts with `TS` and is not listed here is type syntax too, and
 * is reached only as the region another node opened.
 */
const TYPE_REGION_TYPES: Readonly<Record<string, true>> = {
  TSTypeAnnotation: true,
  TSTypeParameterDeclaration: true,
  TSTypeParameterInstantiation: true,
  TSInterfaceDeclaration: true,
  TSTypeAliasDeclaration: true,
  TSDeclareFunction: true,
  TSImportType: true,
}

/**
 * The start/end spans of every type-only subtree. An `as` cast puts only its
 * annotation in type space; the expression side stays value space.
 */
export const typeRegionsOf = (
  root: ESTree.Node,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): ReadonlyArray<readonly [number, number]> => {
  const regions: Array<readonly [number, number]> = []
  const walk = (value: unknown): void => {
    if (!isWalkable(value)) return
    const type = value['type']
    if (typeof type !== 'string') return
    if (TYPE_REGION_TYPES[type] === true) {
      const span = spanOf(value)
      if (span !== null) regions.push(span)
      return
    }
    if (type === 'TSAsExpression') {
      const span = spanOf(value['typeAnnotation'])
      if (span !== null) regions.push(span)
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
  walk(root)
  return regions
}

const isWithin = (
  span: readonly [number, number],
  regions: ReadonlyArray<readonly [number, number]>,
): boolean => regions.some(([start, end]) => span[0] >= start && span[1] <= end)

const isNode = (value: unknown): value is ESTree.Node => isWalkable(value) && typeof value['type'] === 'string'

/**
 * Visits every node of the subtree that is not inside a type region; a pruned
 * node's whole subtree goes with it, because a region's span covers it. The
 * visitor returns `false` to prune the node's subtree (a reported control-flow
 * construct is judged once, at its head) or `true` to keep descending.
 */
export const walkSubtree = (
  root: ESTree.Node,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
  regions: ReadonlyArray<readonly [number, number]>,
  visit: (node: ESTree.Node) => boolean,
): void => {
  const step = (value: unknown): void => {
    if (!isNode(value)) return
    const span = spanOf(value)
    if (span === null || isWithin(span, regions)) return
    if (!visit(value)) return
    const record = isWalkable(value) ? value : null
    if (record === null) return
    for (const key of visitorKeys[value.type] ?? []) {
      const child = record[key]
      if (Array.isArray(child)) {
        for (const entry of child) step(entry)
      } else {
        step(child)
      }
    }
  }
  step(root)
}

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent: ESTree.Node | null
}

interface VariableLike {
  readonly defs: readonly DefinitionLike[]
}

interface ReferenceLike {
  readonly identifier: ESTree.Node
  readonly resolved: VariableLike | null
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly ReferenceLike[]
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

/**
 * The variable a reference resolves to, found by identity in the reference's
 * own scope — the same shadow-correct walk the boundary kernel uses.
 */
const variableOf = (
  identifier: ESTree.Node,
  getScope: (node: ESTree.Node) => unknown,
): VariableLike | null => {
  const scopeValue: unknown = getScope(identifier)
  let scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  while (scope !== null) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined && found.resolved !== null) return found.resolved
    if (found !== undefined) return null
    scope = scope.upper
  }
  return null
}

/**
 * The function a boundary slot denotes: an inline arrow or function, or a
 * same-file reference resolved to its declaration — a function name or a
 * `const` initializer, through bounded alias chains. Anything else (an
 * import, a parameter, a call result) is not resolvable from this file's AST
 * and stays `null`; the caller stays silent there, which is KTD15's declared
 * blind spot for code in another file.
 */
export const functionValueOf = (
  node: ESTree.Node | null,
  getScope: (node: ESTree.Node) => unknown,
  depth = 0,
): BoundaryFunction | null => {
  if (node === null || depth > 8) return null
  if (isBoundaryFunction(node)) return node
  if (node.type !== 'Identifier') return null
  const variable = variableOf(node, getScope)
  if (variable === null) return null
  for (const def of variable.defs) {
    if (def.type === 'FunctionName' && isBoundaryFunction(def.node)) return def.node
    if (def.type !== 'Variable') continue
    const declaration = def.parent
    if (declaration === null || declaration.type !== 'VariableDeclaration') continue
    if (declaration.kind !== 'const') continue
    if (def.node.type !== 'VariableDeclarator') continue
    const init = def.node.init
    if (init === null) continue
    const resolved = functionValueOf(init, getScope, depth + 1)
    if (resolved !== null) return resolved
  }
  return null
}

export const initializerOf = (
  identifier: ESTree.Node,
  getScope: (node: ESTree.Node) => unknown,
  depth = 0,
): ESTree.Node | null => {
  if (depth > 8 || identifier.type !== 'Identifier') return null
  const variable = variableOf(identifier, getScope)
  if (variable === null) return null
  for (const def of variable.defs) {
    if (def.type !== 'Variable') continue
    const declaration = def.parent
    if (declaration === null || declaration.type !== 'VariableDeclaration') continue
    if (declaration.kind !== 'const') continue
    if (def.node.type !== 'VariableDeclarator') continue
    const init = def.node.init
    if (init !== null) return init
  }
  return null
}

export interface RecordFunction {
  readonly path: string
  readonly fn: BoundaryFunction
}

export const recordFunctionsOf = (
  node: ESTree.Node | null,
  getScope: (node: ESTree.Node) => unknown,
): readonly RecordFunction[] => {
  const into: RecordFunction[] = []
  const root = node !== null && node.type === 'Identifier' ? initializerOf(node, getScope) : node
  const collect = (value: ESTree.Node | null, path: string, depth: number): void => {
    if (value === null || depth > 8) return
    if (value.type !== 'ObjectExpression') return
    for (const property of value.properties) {
      if (property.type !== 'Property' || property.computed) continue
      const key = property.key
      const name = key.type === 'Identifier'
        ? key.name
        : key.type === 'Literal' && typeof key.value === 'string'
        ? key.value
        : null
      if (name === null) continue
      const memberPath = path === '' ? name : `${path}.${name}`
      const fn = functionValueOf(property.value, getScope, 0)
      if (fn !== null) {
        into.push({ path: memberPath, fn })
        continue
      }
      collect(property.value, memberPath, depth + 1)
    }
  }
  collect(root, '', 0)
  return into
}

export const originOf = (
  node: ESTree.Node,
  getScope: (node: ESTree.Node) => unknown,
): ImportOrigin | null => resolveImportOrigin(node, getScope)

/**
 * Whether the origin denotes `<owner>.<member>` on its module — or the same
 * member taken straight off a namespace import (`import * as Sandwich from
 * '@systemfsoftware/effect-cell-types'` spells `Sandwich.named` as `named`).
 */
export const originMemberIs = (origin: ImportOrigin, owner: string, member: string): boolean => {
  const sequence = originMemberSequence(origin)
  return sequence[sequence.length - 1] === member &&
    (sequence.length === 1 || sequence[sequence.length - 2] === owner)
}

/**
 * Whether the origin denotes the module value itself — `effect/Match`,
 * `effect/Clock`, or the matching namespace binding taken off the `effect`
 * root. A reference to the value anywhere in a member chain is a reference to
 * the module, so `Effect.Match.value` is caught by the sequence check.
 */
export const isEffectModuleBinding = (origin: ImportOrigin, moduleName: string): boolean =>
  origin.source === `effect/${moduleName}` ||
  (origin.source === 'effect' && originMemberSequence(origin).includes(moduleName))

/**
 * The recovery combinators a medium port must not run, keyed by member and
 * owning namespace. `Effect.retry`, `Effect.retryOrElse` and `Effect.forever`
 * come from the `effect` root or `effect/Effect`; `Stream.retry` from the
 * root or `effect/Stream`. The name is returned for the diagnostic, `null`
 * when the origin is none of them.
 */
const RECOVERY_MEMBERS: Readonly<Record<string, Readonly<Record<string, true>>>> = {
  retry: { Effect: true, Stream: true },
  retryOrElse: { Effect: true },
  forever: { Effect: true },
}

const RECOVERY_SOURCES: Readonly<Record<string, true>> = {
  effect: true,
  'effect/Effect': true,
  'effect/Stream': true,
}

export const recoveryCalleeName = (origin: ImportOrigin): string | null => {
  if (RECOVERY_SOURCES[origin.source] !== true) return null
  const sequence = originMemberSequence(origin)
  const member = sequence[sequence.length - 1]
  if (member === undefined) return null
  const owners = RECOVERY_MEMBERS[member]
  if (owners === undefined) return null
  const owner = sequence.length >= 2 ? sequence[sequence.length - 2] : undefined
  if (owner === undefined) {
    return `${origin.source === 'effect/Stream' ? 'Stream' : 'Effect'}.${member}`
  }
  return owners[owner] === true ? `${owner}.${member}` : null
}

/**
 * The branch-callback dispatchers a Sandwich shell phase must not run, verified
 * against the vendored effect tree (`repos/effect/packages/effect/src/`):
 *
 * - Effect: `when` (Effect.ts:5276), `match` (Effect.ts:5340), `matchEager`
 *   (Effect.ts:5393), `matchCause` (Effect.ts:5441), `matchCauseEager`
 *   (Effect.ts:5484), `matchCauseEffectEager` (Effect.ts:5518),
 *   `matchCauseEffect` (Effect.ts:5592), `matchEffect` (Effect.ts:5656)
 * - Option: `match` (Option.ts:403); Result: `match` (Result.ts:863)
 * - Array: `match` (Array.ts:423), `matchLeft` (Array.ts:478), `matchRight`
 *   (Array.ts:533); Boolean: `match` (Boolean.ts:89); Exit: `match`
 *   (Exit.ts:752)
 *
 * `Effect.if`, `Effect.unless`, `Effect.whenEffect` and `Effect.unlessEffect`
 * have no `export const` in this rc, and Predicate and Cause export none of
 * the dispatchers — none are refused. Non-dispatch combinators (`getOrElse`,
 * `map`, `flatMap`, `catchTag`, `filterOrFail`) carry other member names and
 * never hit this table. `effect/Cron.match` (Cron.ts:714) and
 * `effect/String.match` (String.ts:690) are predicates over their own types,
 * and their modules are not in the owner sets, so they stay lawful.
 */
const DISPATCH_MEMBERS: Readonly<Record<string, Readonly<Record<string, true>>>> = {
  when: { Effect: true },
  match: { Effect: true, Option: true, Result: true, Array: true, Boolean: true, Exit: true },
  matchEager: { Effect: true },
  matchEffect: { Effect: true },
  matchCause: { Effect: true },
  matchCauseEager: { Effect: true },
  matchCauseEffect: { Effect: true },
  matchCauseEffectEager: { Effect: true },
  matchLeft: { Array: true },
  matchRight: { Array: true },
}

const EFFECT_MODULE_PREFIX = 'effect/'

export const dispatchCalleeName = (origin: ImportOrigin): string | null => {
  if (origin.source !== 'effect' && !origin.source.startsWith(EFFECT_MODULE_PREFIX)) return null
  const sequence = originMemberSequence(origin)
  const member = sequence[sequence.length - 1]
  if (member === undefined) return null
  const owners = DISPATCH_MEMBERS[member]
  if (owners === undefined) return null
  const owner = sequence.length >= 2 ? sequence[sequence.length - 2] : undefined
  if (owner !== undefined) {
    return owners[owner] === true ? `${owner}.${member}` : null
  }
  if (origin.source !== 'effect') {
    const module = origin.source.slice(EFFECT_MODULE_PREFIX.length)
    return owners[module] === true ? `${module}.${member}` : null
  }
  return member
}

/**
 * Test and fixture paths are out of scope: a branch that only exists to
 * exercise production code is not authoring drift in the product surface.
 * Mirrors the in-rule boundary `ban-classes` and `make-body-purity` draw,
 * with the `.tst.ts` type-test extension `make-body-purity` also skips.
 */
const TEST_OR_FIXTURE_PATH = /(^|\/)(__tests__|__fixtures__|tests|testResources)\/|\.(test|spec|tst)\.[cm]?[jt]sx?$/

export const isTestOrFixturePath = (filename: string): boolean => TEST_OR_FIXTURE_PATH.test(filename)
