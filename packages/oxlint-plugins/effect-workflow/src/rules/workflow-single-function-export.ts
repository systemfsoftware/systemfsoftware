import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './workflow-single-function-export.config.js'

export type MessageIds = 'tooManyFunctionExports'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const functionVariableDeclaratorName = (decl: ESTree.VariableDeclarator): string | null => {
  if (
    decl.id.type === 'Identifier' &&
    decl.init !== null &&
    (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')
  ) {
    return decl.id.name
  }
  return null
}

const isFunctionExportDeclaration = (node: ESTree.ExportNamedDeclaration): boolean => {
  if (!node.declaration) return false
  if (node.declaration.type === 'FunctionDeclaration') return true
  if (node.declaration.type === 'VariableDeclaration') {
    for (const decl of node.declaration.declarations) {
      if (functionVariableDeclaratorName(decl) !== null) {
        return true
      }
    }
  }
  return false
}

const collectLocalFunctionNames = (program: ESTree.Program): Set<string> => {
  const names = new Set<string>()
  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      names.add(stmt.id.name)
    } else if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        const name = functionVariableDeclaratorName(decl)
        if (name !== null) {
          names.add(name)
        }
      }
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      const decl = stmt.declaration
      if (decl.type === 'FunctionDeclaration' && decl.id) {
        names.add(decl.id.name)
      } else if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          const name = functionVariableDeclaratorName(d)
          if (name !== null) {
            names.add(name)
          }
        }
      }
    } else if (
      stmt.type === 'ExportDefaultDeclaration' &&
      stmt.declaration.type === 'FunctionDeclaration' &&
      stmt.declaration.id
    ) {
      names.add(stmt.declaration.id.name)
    }
  }
  return names
}

export const workflowSingleFunctionExport = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const program = context.sourceCode.ast
    const localFunctionNames = collectLocalFunctionNames(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let functionExportCount = 0
    let lastFunctionExportNode: ESTree.Node | null = null

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (isFunctionExportDeclaration(node)) {
          functionExportCount += 1
          lastFunctionExportNode = node
        } else {
          pendingSpecifierExports.push(node)
        }
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const decl = node.declaration
        if (
          decl.type === 'FunctionDeclaration' ||
          decl.type === 'ArrowFunctionExpression' ||
          (decl.type === 'Identifier' && localFunctionNames.has(decl.name))
        ) {
          functionExportCount += 1
          lastFunctionExportNode = node
        }
      },
      'Program:exit'() {
        for (const node of pendingSpecifierExports) {
          for (const spec of node.specifiers) {
            if (spec.local.type === 'Identifier' && localFunctionNames.has(spec.local.name)) {
              functionExportCount += 1
              lastFunctionExportNode = node
            }
          }
        }

        if (functionExportCount !== 1) {
          const reportNode = lastFunctionExportNode ?? program.body[0]
          if (reportNode) {
            context.report({
              node: reportNode,
              messageId: 'tooManyFunctionExports',
              data: {
                name: '*.workflow.ts',
                expected: 'exactly one function export — the workflow itself',
                actual: `${functionExportCount} function exports`,
                fix: 'make steps and helpers private; schema classes and types may stay exported',
              },
            })
          }
        }
      },
    }
  },
})
