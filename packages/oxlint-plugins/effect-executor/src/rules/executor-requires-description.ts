import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { calleeRootName, cellOf, lastSegmentOf } from './cell.js'
import {
  BARREL_LAST_PARTS,
  DESCRIPTION_METHODS,
  DESCRIPTION_SOURCE,
  meta,
  MODULE_EXTENSION,
  REQUIRES_DESCRIPTION_ACTUAL,
  REQUIRES_DESCRIPTION_EXPECTED,
  REQUIRES_DESCRIPTION_FIX,
  TEST_FILENAME,
  TEST_PATH_SEGMENT,
} from './executor-requires-description.config.js'

export type MessageIds = 'requiresDescription'

const isBarrelSource = (source: string): boolean => {
  if (source[0] !== '.' && source[0] !== '/') return false
  const segments = source.split('/')
  const dir = segments[segments.length - 2]
  const stem = lastSegmentOf(source).replace(MODULE_EXTENSION, '')
  const isIndexOrMod = BARREL_LAST_PARTS.some((part) => part === stem)
  const isSubdirectory = dir !== '.' && dir !== '..' && dir !== ''
  return isSubdirectory && isIndexOrMod
}

const isTestFile = (filename: string): boolean => TEST_FILENAME.test(filename) || TEST_PATH_SEGMENT.test(filename)

export const executorRequiresDescription = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return {}

    const workflowCalls: Array<{ node: ESTree.CallExpression; name: string }> = []
    const workflowBindingNames = new Set<string>()
    const workflowNamespaceNames = new Set<string>()
    const cellBindings = new Set<string>()
    let declaresDescription = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (source === DESCRIPTION_SOURCE) {
          for (const specifier of node.specifiers) {
            if (node.importKind === 'type') continue
            if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue
            cellBindings.add(specifier.local.name)
          }
          return
        }
        const cell = cellOf(source)
        if (cell !== 'workflow' && !isBarrelSource(source)) return
        for (const specifier of node.specifiers) {
          if (node.importKind === 'type') continue
          if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue
          if (specifier.type === 'ImportNamespaceSpecifier') workflowNamespaceNames.add(specifier.local.name)
          else workflowBindingNames.add(specifier.local.name)
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        const root = calleeRootName(node.callee)
        if (root === null) return
        if (workflowBindingNames.has(root)) {
          workflowCalls.push({ node, name: root })
          return
        }
        if (node.callee.type !== 'MemberExpression') return
        const property = node.callee.property
        if (property.type !== 'Identifier') return
        if (workflowNamespaceNames.has(root)) {
          workflowCalls.push({ node, name: root })
          return
        }
        if (cellBindings.has(root) && DESCRIPTION_METHODS.some((method) => method === property.name)) {
          declaresDescription = true
        }
      },
      'Program:exit'() {
        if (declaresDescription) return
        for (const { node, name } of workflowCalls) {
          context.report({
            node,
            messageId: 'requiresDescription',
            data: {
              name,
              expected: REQUIRES_DESCRIPTION_EXPECTED,
              actual: REQUIRES_DESCRIPTION_ACTUAL,
              fix: REQUIRES_DESCRIPTION_FIX,
            },
          })
        }
      },
    }
  },
})
