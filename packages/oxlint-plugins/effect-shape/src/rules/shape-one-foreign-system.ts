import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
  MULTIPLE_FOREIGN_SYSTEMS_FIX,
} from './shape-one-foreign-system.config.js'

export type MessageIds = 'multipleForeignSystems'

const SHAPE_SUFFIX = '.shape.ts'

const isShapeFile = (filename: string): boolean => filename.endsWith(SHAPE_SUFFIX)

const packageRoot = (source: string): string | null => {
  if (source.startsWith('.') || source.startsWith('node:')) return null
  const firstSlash = source.indexOf('/')
  if (source.startsWith('@')) {
    if (firstSlash === -1) return null
    const secondSlash = source.indexOf('/', firstSlash + 1)
    return secondSlash === -1 ? source : source.slice(0, secondSlash)
  }
  return firstSlash === -1 ? source : source.slice(0, firstSlash)
}

export const shapeOneForeignSystem = defineRule({
  meta,
  create(context: Context) {
    if (!isShapeFile(context.filename)) return {}

    const imported: { node: ESTree.Node; source: string }[] = []

    const collect = (node: ESTree.Node, source: string): void => {
      imported.push({ node, source })
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        collect(node, node.source.value)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        collect(node, node.source.value)
      },
      'Program:exit'() {
        let firstRoot: string | null = null
        const allRoots: string[] = []
        const violations: { node: ESTree.Node; source: string }[] = []
        for (const entry of imported) {
          const root = packageRoot(entry.source)
          if (root === null) continue
          allRoots.push(root)
          if (firstRoot === null) {
            firstRoot = root
          } else if (root !== firstRoot) {
            violations.push(entry)
          }
        }
        const distinctRoots = Array.from(new Set(allRoots))
        const actual = `imports from ${distinctRoots.length} distinct packages (${distinctRoots.join(', ')})`
        for (const { node, source } of violations) {
          context.report({
            node,
            messageId: 'multipleForeignSystems',
            data: {
              name: source,
              expected: MULTIPLE_FOREIGN_SYSTEMS_EXPECTED,
              actual,
              fix: MULTIPLE_FOREIGN_SYSTEMS_FIX,
            },
          })
        }
      },
    }
  },
})
