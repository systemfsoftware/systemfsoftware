import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ASSERTED_ACTUAL,
  ASSERTED_EXPECTED,
  ASSERTED_FIX,
  DECLARED_ACTUAL,
  DECLARED_EXPECTED,
  DECLARED_FIX,
  LAUNDERED_ACTUAL,
  LAUNDERED_EXPECTED,
  LAUNDERED_FIX,
  LAUNDERING_CALLS,
  LAUNDERING_CONSTRUCTORS,
  meta,
} from './make-command-schema.config.js'
import { collectMakeBoundaries } from './MakeBoundary.js'

export type MessageIds = 'assertedCommand' | 'launderedCommand' | 'declaredCommand'

/**
 * The assertion forms that genuinely defeat the bound. Each produces a value whose
 * static type says "schema class" while the value itself was never checked against
 * one - measured, not assumed: `make(maybe, …)` on a `Class | undefined` is refused
 * (TS2345) and `make(maybe!, …)` is accepted in silence.
 *
 * `TSSatisfiesExpression` was here and is deliberately absent. `x satisfies T` has the
 * type of `x`, so it cannot relabel anything: `make({} as NotAClass satisfies unknown, …)`
 * is refused by the compiler (TS2740). Reporting it flagged correct code and told the
 * author an assertion had hidden an absence that was never hidden - the message
 * outrunning the predicate. Do not re-add it without a construction that compiles.
 */
const ASSERTION_TYPES: readonly string[] = ['TSAsExpression', 'TSNonNullExpression']

/**
 * The written dotted path of a callee with a leading `globalThis` removed, or `null`
 * when any segment is unreadable. Canonical spelling only: a computed member carries
 * no readable name, and an aliased receiver is a different identifier, so neither is
 * matched.
 *
 * `globalThis` is stripped rather than treated as a segment because it is not an alias
 * - it is the same binding under its fully qualified spelling. It nests at the far end
 * of the chain (`globalThis.Object.assign` is `((globalThis.Object).assign)`), so a
 * strip that only inspects the outermost object misses exactly the call it exists to
 * reach, which is how this was measured failing.
 */
const canonicalPath = (callee: ESTree.Node): string | null => {
  const segments: string[] = []
  for (let node: ESTree.Node = callee;;) {
    if (node.type === 'Identifier') {
      segments.unshift(node.name)
      break
    }
    if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return null
    segments.unshift(node.property.name)
    node = node.object
  }
  const stripped = segments[0] === 'globalThis' ? segments.slice(1) : segments
  return stripped.length === 0 ? null : stripped.join('.')
}

/** The laundering call this callee names, or `null` when it names none. */
const launderingCall = (callee: ESTree.Node): string | null => {
  const path = canonicalPath(callee)
  return path !== null && LAUNDERING_CALLS.includes(path) ? path : null
}

/** The laundering constructor this callee names, or `null` when it names none. */
const launderingConstructor = (callee: ESTree.Node): string | null => {
  const path = canonicalPath(callee)
  return path !== null && LAUNDERING_CONSTRUCTORS.includes(path) ? path : null
}

/**
 * The command position with one property read peeled off, when the property is read
 * from a laundering call's result. `Proxy.revocable(Cmd, {}).proxy` is a Proxy reached
 * by a member access rather than a constructor, so the bare command position is a
 * MemberExpression that no branch classifies - and a MemberExpression cannot be
 * refused wholesale, because a class imported through a namespace is one too. Peeling
 * only when the object is an enumerated laundering call keeps the namespace case silent.
 */
const peelLaunderedProperty = (command: ESTree.Node): ESTree.Node => {
  if (command.type !== 'MemberExpression') return command
  const object = command.object
  if (object.type !== 'CallExpression') return command
  return launderingCall(object.callee) !== null ? object : command
}

interface VariableLike {
  readonly defs: readonly { readonly node: ESTree.Node }[]
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, VariableLike>
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

/** The variable `name` resolves to in this file, or `null` when it is not local. */
const localVariable = (
  name: string,
  getScope: (node: ESTree.Node) => unknown,
  node: ESTree.Node,
): VariableLike | null => {
  const start = getScope(node)
  if (!isScopeLike(start)) return null
  for (let scope: ScopeLike | null = start; scope !== null; scope = scope.upper) {
    const variable = scope.set.get(name)
    if (variable !== undefined) return variable
  }
  return null
}

/**
 * The assertion a local binding was initialised with, or `null`. An assertion one
 * statement away launders exactly as well as one written at the call: `const Forged =
 * Hand as unknown as S.Class<…>` then `make(Forged, …)` compiles, and the command
 * position is a bare Identifier that no other branch classifies. Resolution is local
 * and one hop deep - the rule reports what this file did, never what an import did.
 */
const initializingAssertion = (variable: VariableLike): string | null => {
  for (const def of variable.defs) {
    const declarator: ESTree.Node & { readonly init?: ESTree.Node | null } = def.node
    const init = declarator.init
    if (init !== null && init !== undefined && ASSERTION_TYPES.includes(init.type)) return init.type
  }
  return null
}

/**
 * True when a local binding was introduced by a `declare`. A declared binding is
 * erased, so the command position holds nothing at runtime — the one absence the type
 * layer is structurally unable to notice, because a declaration is exactly what it
 * trusts.
 */
const isDeclaredBinding = (variable: VariableLike): boolean =>
  variable.defs.some((def) => {
    const declaration: ESTree.Node & { readonly declare?: boolean } = def.node
    if (declaration.declare === true) return true
    const parent: (ESTree.Node & { readonly declare?: boolean }) | null = declaration.parent
    return parent !== null && parent.declare === true
  })

/**
 * The command-position rule. Its whole scope is the set of positions
 * `Workflow.make`'s type bound provably cannot refuse, and nothing else: a value
 * re-labelled by an assertion, a value assembled by a call that is not the Effect
 * subclass idiom, and a binding that exists only as a declaration.
 *
 * Everything the compiler already decides stays silent here. A plain class, an
 * object literal, a `Schema.Struct` and a primitive are all refused at the call
 * site with `TS2740`, and a second report on the same line is noise that trains
 * the reader to stop reading. That silence is a design commitment, so the suite
 * pins each of those shapes as a valid case.
 */
export const makeCommandSchema = defineRule({
  meta,
  create(context: Context) {
    return {
      Program() {
        for (const boundary of collectMakeBoundaries(context)) {
          const command = boundary.commandArgument === null ? null : peelLaunderedProperty(boundary.commandArgument)
          if (command === null) continue

          if (ASSERTION_TYPES.includes(command.type)) {
            context.report({
              node: command,
              messageId: 'assertedCommand',
              data: {
                name: command.type,
                expected: ASSERTED_EXPECTED,
                actual: ASSERTED_ACTUAL,
                fix: ASSERTED_FIX,
              },
            })
            continue
          }

          // Each enumeration is tested exactly once, at its own branch. Testing them
          // together after the fact left the constructor list filtered by the call
          // list, so a second entry in the constructor list would have passed the
          // branch and then been dropped - the rule going dark on a shape someone
          // had just added it to catch.
          const laundering = command.type === 'CallExpression'
            ? launderingCall(command.callee)
            : command.type === 'NewExpression'
            ? launderingConstructor(command.callee)
            : null
          if (laundering !== null) {
            context.report({
              node: command,
              messageId: 'launderedCommand',
              data: {
                name: laundering,
                expected: LAUNDERED_EXPECTED,
                actual: LAUNDERED_ACTUAL,
                fix: LAUNDERED_FIX,
              },
            })
            continue
          }

          if (command.type !== 'Identifier') continue
          const variable = localVariable(command.name, context.sourceCode.getScope, command)
          if (variable === null) continue

          if (isDeclaredBinding(variable)) {
            context.report({
              node: command,
              messageId: 'declaredCommand',
              data: {
                name: command.name,
                expected: DECLARED_EXPECTED,
                actual: DECLARED_ACTUAL,
                fix: DECLARED_FIX,
              },
            })
            continue
          }

          const asserted = initializingAssertion(variable)
          if (asserted !== null) {
            context.report({
              node: command,
              messageId: 'assertedCommand',
              data: {
                name: asserted,
                expected: ASSERTED_EXPECTED,
                actual: ASSERTED_ACTUAL,
                fix: ASSERTED_FIX,
              },
            })
          }
        }
      },
    }
  },
})
