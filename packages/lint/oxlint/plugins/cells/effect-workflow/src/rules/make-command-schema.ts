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
 * The assertion forms. Each one produces a value whose static type says
 * "schema class" while the value itself was never checked against one, which is
 * precisely the set `make`'s type bound cannot see through.
 */
const ASSERTION_TYPES: readonly string[] = ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']

/**
 * The written `Object.assign`-style path of a callee, or `null` when the callee is
 * not a plain two-segment member on an identifier. Canonical spelling only: a
 * computed member carries no readable name, and an aliased receiver is a different
 * identifier, so neither is matched.
 */
const calleePath = (callee: ESTree.Node): string | null => {
  if (callee.type !== 'MemberExpression') return null
  if (callee.computed) return null
  if (callee.object.type !== 'Identifier' || callee.property.type !== 'Identifier') return null
  return `${callee.object.name}.${callee.property.name}`
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly set: ReadonlyMap<string, { readonly defs: readonly { readonly node: ESTree.Node }[] }>
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'set' in value && 'upper' in value

/**
 * True when `name` resolves, in this file, to a binding introduced by a `declare`.
 * A declared binding is erased, so the command position holds nothing at runtime —
 * the one absence the type layer is structurally unable to notice, because a
 * declaration is exactly what it trusts.
 */
const resolvesToDeclaredBinding = (
  name: string,
  getScope: (node: ESTree.Node) => unknown,
  node: ESTree.Node,
): boolean => {
  const start = getScope(node)
  if (!isScopeLike(start)) return false
  for (let scope: ScopeLike | null = start; scope !== null; scope = scope.upper) {
    const variable = scope.set.get(name)
    if (variable === undefined) continue
    return variable.defs.some((def) => {
      const declaration: ESTree.Node & { readonly declare?: boolean } = def.node
      if (declaration.declare === true) return true
      const parent: (ESTree.Node & { readonly declare?: boolean }) | null = declaration.parent
      return parent !== null && parent.declare === true
    })
  }
  return false
}

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
          const command = boundary.commandArgument
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

          const laundering = command.type === 'CallExpression'
            ? calleePath(command.callee)
            : command.type === 'NewExpression' && command.callee.type === 'Identifier' &&
                LAUNDERING_CONSTRUCTORS.includes(command.callee.name)
            ? command.callee.name
            : null
          if (laundering !== null && (LAUNDERING_CALLS.includes(laundering) || laundering === 'Proxy')) {
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

          if (
            command.type === 'Identifier' &&
            resolvesToDeclaredBinding(command.name, context.sourceCode.getScope, command)
          ) {
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
          }
        }
      },
    }
  },
})
