import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { cellOriginResolverOf } from './kind-constructor.js'
import type { CellKind } from './kind-constructor.js'
import {
  HANDLE_ACTUAL,
  HANDLE_EXPECTED,
  HANDLE_FIX,
  meta,
  RESOURCE_ACTUAL,
  RESOURCE_EXPECTED,
  RESOURCE_FIX,
} from './kind-file-construction.config.js'
import { basenameOf, isHandleFile, isResourceFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'missingConstruction'

interface ConstructionCopy {
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

const COPY_BY_KIND: Readonly<Record<CellKind, ConstructionCopy>> = {
  resource: { expected: RESOURCE_EXPECTED, actual: RESOURCE_ACTUAL, fix: RESOURCE_FIX },
  handle: { expected: HANDLE_EXPECTED, actual: HANDLE_ACTUAL, fix: HANDLE_FIX },
}

const expectedKindOf = (basename: string): CellKind | null => {
  if (isResourceFile(basename)) return 'resource'
  if (isHandleFile(basename)) return 'handle'
  return null
}

export const kindFileConstruction = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename)) return {}
    const basename = basenameOf(context.filename)
    const kind = expectedKindOf(basename)
    if (kind === null) return {}
    const copy = COPY_BY_KIND[kind]
    const resolver = cellOriginResolverOf(context)
    let constructed = false
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (constructed === true) return
        if (resolver.kindOf(node.callee) === kind) constructed = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (constructed === true) return
        context.report({
          node,
          messageId: 'missingConstruction',
          data: { name: basename, expected: copy.expected, actual: copy.actual, fix: copy.fix },
        })
      },
    }
  },
})
