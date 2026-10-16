import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { EXPECTED, FIX, meta, MISSING_GUARD_ACTUAL, UNBOUND_GUARD_ACTUAL_OF } from './handle-exports-guard.config.js'
import { isHandleFile } from './kind-file.js'
import { staticNameOf } from './module-origin.js'
import {
  defaultExportNameOf,
  exportSpecifierNamesOf,
  type ModuleDeclaration,
  moduleDeclarationsOf,
} from './module-scope.js'

export type MessageIds = 'missingGuard'

const isGuardName = (name: string): boolean => /^is[A-Z]/.test(name)

const isDefinitionIs = (init: ESTree.Node | null): boolean =>
  init !== null &&
  init.type === 'MemberExpression' &&
  staticNameOf(init.property) === 'is'

const report = (context: Context, node: ESTree.Node, name: string, actual: string): void => {
  context.report({
    node,
    messageId: 'missingGuard',
    data: { name, expected: EXPECTED, actual, fix: FIX },
  })
}

export const handleExportsGuard = defineRule({
  meta,
  create(context: Context) {
    if (!isHandleFile(context.filename)) return {}
    const program = context.sourceCode.ast
    const specifierNames = exportSpecifierNamesOf(program)
    const defaultName = defaultExportNameOf(program)
    const isExported = (declaration: ModuleDeclaration): boolean =>
      declaration.name !== null &&
      (declaration.exported || specifierNames.has(declaration.name) || defaultName === declaration.name)

    return {
      'Program:exit'(node: ESTree.Program) {
        const guards: { readonly node: ESTree.Node; readonly name: string; readonly bound: boolean }[] = []
        for (const declaration of moduleDeclarationsOf(node)) {
          if (declaration.name === null || isGuardName(declaration.name) === false) continue
          if (isExported(declaration) === false) continue
          guards.push({
            node: declaration.declarator,
            name: declaration.name,
            bound: isDefinitionIs(declaration.declarator.init),
          })
        }
        if (guards.length === 0) {
          report(context, node, 'a handle type guard', MISSING_GUARD_ACTUAL)
          return
        }
        for (const guard of guards) {
          if (guard.bound) return
        }
        const first = guards[0]
        if (first !== undefined) {
          report(context, first.node, `the exported guard \`${first.name}\``, UNBOUND_GUARD_ACTUAL_OF(first.name))
        }
      },
    }
  },
})
