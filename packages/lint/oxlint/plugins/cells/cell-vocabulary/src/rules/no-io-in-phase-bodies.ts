import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, cellOf } from './cell.js'
import {
  COMPOSER_NAME,
  DESCRIPTION_NAMESPACE,
  IO_CELLS,
  IO_IN_PHASE_BODY_ACTUAL,
  IO_IN_PHASE_BODY_EXPECTED,
  IO_IN_PHASE_BODY_FIX,
  IO_SOURCES,
  meta,
  MODULE_SOURCE,
  PURE_PHASE_LIST,
  PURE_PHASE_NAMES,
  SKIPPED_WALK_KEYS,
} from './no-io-in-phase-bodies.config.js'

export type MessageIds = 'ioInPhaseBody'

type Walkable = Readonly<Record<string, unknown>>

const isWalkable = (value: unknown): value is Walkable => typeof value === 'object' && value !== null

const nodeType = (node: Walkable): string => String(node['type'])

const walk = (value: unknown, visit: (node: Walkable) => void): void => {
  if (!isWalkable(value)) return
  visit(value)
  for (const key of Object.keys(value)) {
    if (SKIPPED_WALK_KEYS.some((skipped) => skipped === key)) continue
    walk(value[key], visit)
  }
}

const isCallExpression = (value: Walkable): value is Walkable & ESTree.CallExpression =>
  nodeType(value) === 'CallExpression'

/**
 * The pure phase a call targets, or null when the callee is not one. The object must
 * be a local binding of the description module's `Cell` export — never a name that
 * merely spells like one, and never another export of the same module.
 */
const purePhaseNameOf = (callee: ESTree.Node, namespaces: ReadonlySet<string>): string | null => {
  if (callee.type !== 'MemberExpression') return null
  const object = callee.object
  if (object.type !== 'Identifier') return null
  if (!namespaces.has(object.name)) return null
  const property = callee.property
  const propertyName = property.type === 'Identifier' ? property.name : null
  return PURE_PHASE_NAMES.some((phase) => phase === propertyName) ? propertyName : null
}

type LocalHelper = ESTree.ArrowFunctionExpression | (ESTree.Declaration & { type: string })

export const noIoInPhaseBodies = defineRule({
  meta,
  create(context: Context) {
    const descriptionNamespaces = new Set<string>()
    const ioNames = new Set<string>()
    const localHelpers = new Map<string, LocalHelper>()

    /**
     * Reports every I/O call reachable from a pure phase body: directly, or through a
     * locally-declared helper the body calls, whose own body is walked the same way.
     * The closure branch follows the local binding to its declaration in the same
     * file; a helper already visited is not re-walked, so mutual recursion terminates.
     */
    const reportIoInBody = (body: unknown, visited: ReadonlySet<unknown>): void => {
      // No early return on an empty `ioNames`. It would be a pure optimisation — every branch below
      // already ends in a membership test that cannot match — and a branch no observation can
      // distinguish is a mutant no test can kill (OX-MG1 asks for the restructure, not the ignore).
      walk(body, (inner) => {
        if (!isCallExpression(inner)) return
        const innerRoot = calleeRootName(inner.callee)
        if (innerRoot === null) return
        if (ioNames.has(innerRoot)) {
          context.report({
            node: inner,
            messageId: 'ioInPhaseBody',
            data: {
              name: innerRoot,
              expected: IO_IN_PHASE_BODY_EXPECTED.replace('{{phases}}', PURE_PHASE_LIST),
              actual: IO_IN_PHASE_BODY_ACTUAL.replace('{{phases}}', PURE_PHASE_LIST),
              fix: IO_IN_PHASE_BODY_FIX,
            },
          })
          return
        }
        const helper = localHelpers.get(innerRoot)
        if (helper === undefined || visited.has(helper)) return
        const next = new Set(visited)
        next.add(helper)
        reportIoInBody(helper, next)
      })
    }
    /**
     * `Cell.layer({ decode, ... })` carries the same pure phase bodies the chained calls
     * carry, as spec properties instead of call arguments. The composer name is walked off
     * the vocabulary; the property values are walked with the same inline-or-by-reference
     * policy the chained branch applies, so a spec-authored description is judged identically.
     */
    const specPurePhaseBodiesOf = (node: ESTree.CallExpression): unknown[] => {
      const callee = node.callee
      if (callee.type !== 'MemberExpression') return []
      const object = callee.object
      const property = callee.property
      if (object.type !== 'Identifier' || !descriptionNamespaces.has(object.name)) return []
      if (property.type !== 'Identifier' || property.name !== COMPOSER_NAME) return []
      const spec = node.arguments[0]
      if (spec === undefined || spec.type !== 'ObjectExpression') return []
      const bodies: (ESTree.Expression | LocalHelper)[] = []
      for (const member of spec.properties) {
        if (member.type !== 'Property') continue
        const key = member.key
        if (key.type !== 'Identifier') continue
        if (!PURE_PHASE_NAMES.some((phase) => phase === key.name)) continue
        const value = member.value
        if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
          bodies.push(value)
          continue
        }
        if (value.type !== 'Identifier') continue
        const helper = localHelpers.get(value.name)
        if (helper !== undefined) bodies.push(helper)
      }
      return bodies
    }

    /**
     * Imports are classified here rather than in an `ImportDeclaration` listener. Listeners fire in
     * document order, so a phase call written above its own import would be judged against empty
     * sets — and with no I/O name registered the rule reports nothing at all. That is a silent pass
     * decided by line order, which is the one failure a guard must not have. `Program` sees every
     * top-level statement before any call is visited, so the sets are complete when the first call
     * is judged.
     */
    const classifyImport = (node: ESTree.ImportDeclaration): void => {
      const source = node.source.value
      if (source === MODULE_SOURCE) {
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            descriptionNamespaces.add(specifier.local.name)
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === DESCRIPTION_NAMESPACE
          ) {
            descriptionNamespaces.add(specifier.local.name)
          }
        }
        return
      }
      if (IO_SOURCES.some((ioSource) => ioSource === source)) {
        for (const specifier of node.specifiers) ioNames.add(specifier.local.name)
        return
      }
      if (cellOf(source, IO_CELLS) === null) return
      for (const specifier of node.specifiers) ioNames.add(specifier.local.name)
    }

    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            classifyImport(statement)
            continue
          }
          // `export const helper = …` and `export default function helper() {}` are wrappers
          // around the declaration, and a helper stays callable by name through either. Scanning
          // for bare declarations would follow the unexported half of a module and silently stop
          // at the exported half, which is the same shape with one keyword in front.
          const declaration = statement.type === 'ExportNamedDeclaration' ||
              statement.type === 'ExportDefaultDeclaration'
            ? statement.declaration
            : statement
          // `null` only: `ExportNamedDeclaration.declaration` is `Declaration | null` in the ESTree
          // shape oxc emits — `export { x }` carries no declaration — so an `undefined` arm is a
          // guard against a value the tree cannot hold (OX-GD1).
          if (declaration === null) continue
          if (declaration.type === 'FunctionDeclaration') {
            if (declaration.id !== null) localHelpers.set(declaration.id.name, declaration)
          } else if (declaration.type === 'VariableDeclaration') {
            for (const inner of declaration.declarations) {
              const init = inner.init
              if (init === null) continue
              if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') continue
              if (inner.id.type !== 'Identifier') continue
              localHelpers.set(inner.id.name, init)
            }
          }
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        const specBodies = specPurePhaseBodiesOf(node)
        for (const body of specBodies) {
          reportIoInBody(body, new Set([body]))
        }
        if (specBodies.length > 0) return
        if (purePhaseNameOf(node.callee, descriptionNamespaces) === null) return
        for (const argument of node.arguments) {
          if (argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression') {
            reportIoInBody(argument, new Set())
            continue
          }
          // A body hoisted to a name and handed over by reference — `Cell.decode(transform)` — is
          // the same phase body with one indirection. Walking only inline functions would let the
          // rule pass a file whose I/O sits one rename away, while its message still claims to
          // follow module-level helpers.
          if (argument.type !== 'Identifier') continue
          const helper = localHelpers.get(argument.name)
          if (helper !== undefined) reportIoInBody(helper, new Set([helper]))
        }
      },
    }
  },
})
