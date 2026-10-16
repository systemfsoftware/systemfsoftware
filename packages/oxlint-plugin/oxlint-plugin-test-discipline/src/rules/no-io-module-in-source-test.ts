import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  IO_SOURCE_TEST_ACTUAL,
  IO_SOURCE_TEST_EXPECTED,
  IO_SOURCE_TEST_FIX,
  IO_SOURCE_TEST_NAME,
  IO_SPECIFIERS,
  meta,
} from './no-io-module-in-source-test.config.js'
import { isVitestGuard } from './vitest-guard.js'

export type MessageIds = 'ioSourceTest'

const isIoSpecifier = (source: string): boolean => IO_SPECIFIERS[source] === true

/**
 * The binding a call is made against: the callee identifier itself, or the
 * base identifier of a member chain (`fs`, `fs.promises`) when the call is
 * `fs.readFileSync(...)` / `fs.promises.readFile(...)`. Anything else — a
 * computed call, a `super` edge, an erased type construct — performs nothing a
 * type-only import could not.
 */
const bindingBase = (callee: ESTree.Expression): string | undefined => {
  if (callee.type === 'MemberExpression') return bindingBase(callee.object)
  if (callee.type === 'Identifier') return callee.name
  return undefined
}

export const noIoModuleInSourceTest = defineRule({
  meta,
  create(context: Context) {
    /** Local binding name -> specifier it was (non-type) imported from. */
    const ioBindings: Record<string, string> = {}
    let ioCallSeen = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.importKind === 'type') return
        const specifier = node.source.value
        if (!isIoSpecifier(specifier)) return
        for (const spec of node.specifiers) {
          // the inline `import { type Stats } from 'fs'` form: erased at runtime
          if (spec.type === 'ImportSpecifier' && spec.importKind === 'type') continue
          ioBindings[spec.local.name] = specifier
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (ioCallSeen) return
        const binding = bindingBase(node.callee)
        if (binding === undefined) return
        if (ioBindings[binding] !== undefined) ioCallSeen = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (!ioCallSeen) return
        for (const statement of node.body) {
          if (statement.type !== 'IfStatement') continue
          if (isVitestGuard(statement.test)) {
            context.report({
              node: statement.test,
              messageId: 'ioSourceTest',
              data: {
                name: IO_SOURCE_TEST_NAME,
                expected: IO_SOURCE_TEST_EXPECTED,
                actual: IO_SOURCE_TEST_ACTUAL,
                fix: IO_SOURCE_TEST_FIX,
              },
            })
          }
        }
      },
    }
  },
})
