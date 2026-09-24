import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  HANDLE_ACTUAL,
  HANDLE_EXPECTED,
  HANDLE_FIX,
  meta,
  RESOURCE_ACTUAL,
  RESOURCE_EXPECTED,
  RESOURCE_FIX,
} from './kind-file-construction.config.js'
import { basenameOf, isTypeTestFile, type KindFileKind, kindOfFile } from './kind-file.js'
import { kindOfConstruction, moduleOriginsOf } from './module-origin.js'

export type MessageIds = 'missingConstruction'

interface ConstructionCopy {
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

const COPY_BY_KIND: Readonly<Record<KindFileKind, ConstructionCopy>> = {
  resource: { expected: RESOURCE_EXPECTED, actual: RESOURCE_ACTUAL, fix: RESOURCE_FIX },
  handle: { expected: HANDLE_EXPECTED, actual: HANDLE_ACTUAL, fix: HANDLE_FIX },
}

export const kindFileConstruction = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename)) return {}
    const kind = kindOfFile(context.filename)
    if (kind === null) return {}
    const copy = COPY_BY_KIND[kind]
    const origins = moduleOriginsOf(context.sourceCode.ast)
    let constructed = false
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (constructed) return
        if (kindOfConstruction(node, origins) === kind) constructed = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (constructed) return
        context.report({
          node,
          messageId: 'missingConstruction',
          data: { name: basenameOf(context.filename), expected: copy.expected, actual: copy.actual, fix: copy.fix },
        })
      },
    }
  },
})
