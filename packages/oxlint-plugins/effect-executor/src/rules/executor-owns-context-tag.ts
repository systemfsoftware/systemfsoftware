import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { type Cell, cellOf } from './cell.js'
import {
  CONTEXT_OBJECT,
  EFFECT_OBJECT,
  GENERIC_TAG_PROPERTY,
  meta,
  TAG_FORBIDDEN_CELLS,
  TAG_FORBIDDEN_CELLS_EXPECTED,
  TAG_FORBIDDEN_CELLS_FIX,
  TAG_PROPERTY,
} from './executor-owns-context-tag.config.js'

export type MessageIds = 'tagOutsideExecutor'

const isTagForbiddenCell = (cell: Cell): boolean => TAG_FORBIDDEN_CELLS.some((forbidden) => forbidden === cell)

type TagProperty = typeof TAG_PROPERTY | typeof GENERIC_TAG_PROPERTY

const tagFormFor = (property: TagProperty, object: string): string => `${object}.${property}`

const tagOutsideExecutorData = (form: string, cell: Cell): {
  name: string
  expected: string
  actual: string
  fix: string
} => ({
  name: form,
  expected: TAG_FORBIDDEN_CELLS_EXPECTED,
  actual: `a ${form} declared in the .${cell} cell`,
  fix: TAG_FORBIDDEN_CELLS_FIX,
})

const tagCallee = (
  node: ESTree.CallExpression,
): { readonly object: string; readonly property: TagProperty } | null => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.computed === true) return null
  if (callee.object.type !== 'Identifier') return null
  const object = callee.object.name
  const property = callee.property.name
  if (property === TAG_PROPERTY) {
    if (object !== CONTEXT_OBJECT && object !== EFFECT_OBJECT) return null
    return { object, property }
  }
  if (property !== GENERIC_TAG_PROPERTY) return null
  if (object !== CONTEXT_OBJECT) return null
  return { object, property }
}

export const executorOwnsContextTag = defineRule({
  meta,
  create(context: Context) {
    const cell = cellOf(context.filename)
    if (cell === null) return {}
    if (!isTagForbiddenCell(cell)) return {}

    return {
      CallExpression(node: ESTree.CallExpression) {
        const callee = tagCallee(node)
        if (callee === null) return
        context.report({
          node,
          messageId: 'tagOutsideExecutor',
          data: tagOutsideExecutorData(tagFormFor(callee.property, callee.object), cell),
        })
      },
    }
  },
})
