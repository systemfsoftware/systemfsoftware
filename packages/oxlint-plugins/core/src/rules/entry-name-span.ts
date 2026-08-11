import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { basename } from '@std/path'
import { Schema as S } from 'effect'

import { meta, NAME_SPAN_ACTUAL, NAME_SPAN_EXPECTED, NAME_SPAN_FIX, Options } from './entry-name-span.config.js'

export type MessageIds = 'nameSpan'

const patternNameCount = (pattern: ESTree.BindingPattern): number => {
  switch (pattern.type) {
    case 'Identifier':
      return 1
    case 'ObjectPattern':
      return pattern.properties.reduce((total, property) => {
        if (property.type === 'RestElement') return total + patternNameCount(property.argument)
        return total + patternNameCount(property.value)
      }, 0)
    case 'ArrayPattern':
      return pattern.elements.reduce((total, element) => {
        if (element === null) return total
        if (element.type === 'RestElement') return total + patternNameCount(element.argument)
        return total + patternNameCount(element)
      }, 0)
    case 'AssignmentPattern':
      return patternNameCount(pattern.left)
  }
}

const declarationNameCount = (declaration: ESTree.Declaration): number => {
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.reduce(
      (total, declarator) => total + patternNameCount(declarator.id),
      0,
    )
  }
  return 1
}

const exportNameCount = (statement: ESTree.Statement): number | null => {
  switch (statement.type) {
    case 'ExportDefaultDeclaration':
      return 1
    case 'ExportAllDeclaration':
      // `export * as Ns` exposes ONE name — the namespace — whatever the chunk
      // contains, and the namespace is the sanctioned escape from the bound. A
      // bare `export * from` is opaque at parse time; count the statement as one
      // so it cannot silently lower the count to zero (bare wildcards are
      // separately banned by `no-wildcard-reexport`).
      return 1
    case 'ExportNamedDeclaration': {
      if (statement.declaration !== null) return declarationNameCount(statement.declaration)
      // Each specifier is one exported name: `export { a, b } from './x.js'`
      // counts 2, and `export { a as b }` counts the exported name `b` — once,
      // not the local `a` as well.
      return statement.specifiers.length
    }
    default:
      return null
  }
}

export const entryNameSpan = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const isEntry = new RegExp(options.entryPattern, 'u').test(context.filename)

    if (!isEntry) return {}

    return {
      'Program:exit'(node: ESTree.Program) {
        let count = 0
        let lastExport: ESTree.Statement | null = null
        for (const statement of node.body) {
          const names = exportNameCount(statement)
          if (names === null) continue
          count += names
          lastExport = statement
        }

        if (lastExport === null || count <= options.nameSpan) return

        // One report per file, on the entry's LAST export node: a reader tripping
        // the bound is deciding how many names to chunk away, and the count and
        // bound carried by the message are that decision's inputs.
        context.report({
          node: lastExport,
          messageId: 'nameSpan',
          data: {
            name: basename(context.filename),
            expected: NAME_SPAN_EXPECTED(options.nameSpan),
            actual: NAME_SPAN_ACTUAL(count),
            fix: NAME_SPAN_FIX,
          },
        })
      },
    }
  },
})
