import type { ESTree } from '@oxlint/plugins'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Array as A, Schema as S } from 'effect'

const PathSegments = S.NonEmptyArray(S.String)

export const lastSegmentOf = (source: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(PathSegments)(source.split('/')))

const MODULE_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts'] as const

const stripExtension = (segment: string): string => {
  const extension = MODULE_EXTENSIONS.find((candidate) => segment.endsWith(candidate))
  return extension === undefined ? segment : segment.slice(0, -extension.length)
}

/**
 * The cell a module source belongs to, restricted to the walked I/O cells: a source
 * whose last segment ends in one of those cell suffixes is an I/O module, and a
 * binding imported from it is an I/O binding. The suffix set rides the import edge
 * and is never inferred from an identifier's spelling (EE1).
 */
export const cellOf = (source: string, cells: readonly string[]): string | null => {
  const stem = stripExtension(lastSegmentOf(source))
  return cells.find((cell) => stem.endsWith(`.${cell}`)) ?? null
}

/** `saveOrder(...)` -> `saveOrder`; `Store.save(...)` -> `Store`. */
export const calleeRootName = (callee: ESTree.Node): string | null => {
  if (callee.type === 'Identifier') return callee.name
  if (callee.type !== 'MemberExpression') return null
  return calleeRootName(callee.object)
}
/**
 * The export name of the description vocabulary on its own module. A description is
 * recognised by an import from `Cell.vocabulary.module`; among that module's exports
 * only this one carries the cell and phase constructors, so a named import of any other
 * export (Policy, Workflow) must not be treated as a description namespace.
 */
export const DESCRIPTION_NAMESPACE = 'Cell' as const

/** The description package's own module name, read off the vocabulary. */
export const MODULE_SOURCE: string = Cell.vocabulary.module

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

// A derivation that comes back empty is not a permissive rule, it is a disarmed one: the
// module match in the caller would never hold and the rule would report on no file while
// still loading, still registered, still green. Refusing to load is the only honest
// failure — it names the empty vocabulary instead of silently protecting nothing.
export const assertDescriptionModuleNonEmpty = (
  moduleSource: string,
  descriptionNamespace: string,
): void => {
  if (moduleSource.length === 0) {
    throw new Error(
      `${descriptionNamespace}: the vocabulary names no description module, so this rule would decide nothing`,
    )
  }
}

export type Walkable = Readonly<Record<string, unknown>>

export const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

export const nodeType = (node: Walkable): string => String(node['type'])

export const isCallExpression = (value: unknown): value is ESTree.CallExpression =>
  isWalkable(value) && nodeType(value) === 'CallExpression'

export const isFunctionNode = (value: unknown): boolean => {
  if (!isWalkable(value)) return false
  const kind = nodeType(value)
  return kind === 'FunctionDeclaration' || kind === 'FunctionExpression' ||
    kind === 'ArrowFunctionExpression'
}

/**
 * The written receiver of a `Cell.run` call — the namespace object name — or null.
 * The namespace rides the import edge, so an import alias still resolves and a
 * lookalike object never does; a computed member is not a static reference.
 */
export const cellRunReceiver = (
  node: ESTree.CallExpression,
  descriptionNamespaces: ReadonlySet<string>,
  runName: string,
): string | null => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression' || callee.computed) return null
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier' || !descriptionNamespaces.has(object.name)) return null
  if (property.type !== 'Identifier' || property.name !== runName) return null
  return object.name
}

/**
 * Whether the subtree holds a `Cell.run` call without crossing a function boundary:
 * a run inside a nested closure — including an Effect.gen body — belongs to that
 * closure, never to the scope under analysis.
 */
export const subtreeHoldsRun = (
  value: unknown,
  descriptionNamespaces: ReadonlySet<string>,
  runName: string,
): boolean => {
  let found = false
  const visit = (current: unknown): void => {
    if (found || !isWalkable(current) || isFunctionNode(current)) return
    if (isCallExpression(current) && cellRunReceiver(current, descriptionNamespaces, runName) !== null) {
      found = true
      return
    }
    for (const key of Object.keys(current)) {
      if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
      visit(current[key])
    }
  }
  visit(value)
  return found
}

/**
 * Imports are classified here rather than in an `ImportDeclaration` listener.
 * Listeners fire in document order, so a run written above its own import would be
 * judged against an empty set — a silent pass decided by line order, which is the
 * one failure a guard must not have. `Program` sees every top-level statement before
 * any call is judged, so the set is complete when the first call is judged.
 */
export const classifyDescriptionImport = (
  node: ESTree.ImportDeclaration,
  descriptionNamespaces: Set<string>,
  moduleSource: string,
  descriptionNamespace: string,
): void => {
  if (node.source.value !== moduleSource) return
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      descriptionNamespaces.add(specifier.local.name)
    } else if (
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.type === 'Identifier' &&
      specifier.imported.name === descriptionNamespace
    ) {
      descriptionNamespaces.add(specifier.local.name)
    }
  }
}
