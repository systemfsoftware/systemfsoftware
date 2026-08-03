import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A } from 'effect'
import {
  meta,
  OPERATIONAL_EXPORT_EXPECTED,
  OPERATIONAL_EXPORT_FIX,
  OPERATIONAL_PREFIXES,
  Options,
  UPPER_SNAKE_NAME,
} from './observer-operational-exports.config.js'

export type MessageIds = 'nonOperationalExport'

const OBSERVER_SUFFIX = '.observer.ts'

const isObserverFile = (filename: string): boolean => filename.endsWith(OBSERVER_SUFFIX)

const isOperationalName = (name: string): boolean => {
  if (UPPER_SNAKE_NAME.test(name)) return true
  const lower = name.toLowerCase()
  return A.some(OPERATIONAL_PREFIXES, (prefix) => lower.startsWith(prefix))
}

export const observerOperationalExports = defineRule({
  meta,
  create(context: Context) {
    if (!isObserverFile(context.filename)) return {}

    const reportNonOperational = (node: ESTree.Node, name: string): void => {
      context.report({
        node,
        messageId: 'nonOperationalExport',
        data: {
          name,
          expected: OPERATIONAL_EXPORT_EXPECTED,
          actual: `an exported name '${name}'`,
          fix: OPERATIONAL_EXPORT_FIX,
        },
      })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const decl = node.declaration
        if (decl !== null) {
          if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations) {
              if (declarator.id.type !== 'Identifier') continue
              if (!isOperationalName(declarator.id.name)) reportNonOperational(node, declarator.id.name)
            }
          } else if (
            decl.type === 'FunctionDeclaration' ||
            decl.type === 'ClassDeclaration' ||
            decl.type === 'TSInterfaceDeclaration' ||
            decl.type === 'TSTypeAliasDeclaration'
          ) {
            if (decl.id !== null && !isOperationalName(decl.id.name)) reportNonOperational(node, decl.id.name)
          }
        }
        for (const spec of node.specifiers) {
          if (spec.local.type !== 'Identifier') continue
          if (!isOperationalName(spec.local.name)) reportNonOperational(node, spec.local.name)
        }
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const decl = node.declaration
        if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
          if (decl.id !== null && !isOperationalName(decl.id.name)) reportNonOperational(node, decl.id.name)
        }
      },
    }
  },
})
