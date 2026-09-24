import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  HANDLE_EXPECTED,
  HANDLE_FIX,
  handleActualOf,
  meta,
  RESOURCE_EXPECTED,
  RESOURCE_FIX,
  resourceActualOf,
} from './kind-construction-location.config.js'
import { cellOriginResolverOf } from './kind-constructor.js'
import type { CellKind } from './kind-constructor.js'
import { basenameOf, isHandleFile, isResourceFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'misplacedConstruction'

interface LocationCopy {
  readonly expected: string
  readonly actual: (basename: string) => string
  readonly fix: string
}

const COPY_BY_KIND: Readonly<Record<CellKind, LocationCopy>> = {
  resource: { expected: RESOURCE_EXPECTED, actual: resourceActualOf, fix: RESOURCE_FIX },
  handle: { expected: HANDLE_EXPECTED, actual: handleActualOf, fix: HANDLE_FIX },
}

const isCorrectlyPlaced = (kind: CellKind, filename: string): boolean =>
  kind === 'resource' ? isResourceFile(filename) : isHandleFile(filename)

export const kindConstructionLocation = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename)) return {}
    const basename = basenameOf(context.filename)
    const resolver = cellOriginResolverOf(context)
    return {
      CallExpression(node: ESTree.CallExpression) {
        const kind = resolver.kindOf(node.callee)
        if (kind === null) return
        if (isCorrectlyPlaced(kind, basename)) return
        const copy = COPY_BY_KIND[kind]
        context.report({
          node,
          messageId: 'misplacedConstruction',
          data: { name: basename, expected: copy.expected, actual: copy.actual(basename), fix: copy.fix },
        })
      },
    }
  },
})
