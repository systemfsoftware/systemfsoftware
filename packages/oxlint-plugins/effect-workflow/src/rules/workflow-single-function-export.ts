import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { functionVariableDeclaratorName, getExportedWorkflowFunction } from './exported-workflow-fn.js'
import { CLASS_NAME_FALLBACK, meta } from './workflow-single-function-export.config.js'

export type MessageIds = 'tooManyFunctionExports' | 'disallowedExport'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const isTaggedClassOrErrorCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee.type === 'CallExpression' ? node.callee.callee : node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
}

const isSchemaClassDeclaration = (node: ESTree.Class | null): boolean => {
  if (!node?.superClass) return false
  return node.superClass.type === 'CallExpression' && isTaggedClassOrErrorCall(node.superClass)
}

const isAllowedValueDeclaration = (decl: ESTree.VariableDeclarator): boolean => {
  if (!decl.init) return false
  const init = decl.init
  if (init.type !== 'CallExpression') return false
  if (init.callee.type === 'MemberExpression') {
    const obj = init.callee.object
    const prop = init.callee.property
    if (
      obj.type === 'Identifier' && obj.name === 'S' &&
      prop.type === 'Identifier' && prop.name === 'Union'
    ) {
      return true
    }
    if (
      init.callee.object.type === 'Identifier' && init.callee.object.name === 'Symbol' &&
      init.callee.property.type === 'Identifier' && init.callee.property.name === 'for'
    ) {
      return true
    }
  }
  if (init.callee.type === 'Identifier' && init.callee.name === 'Symbol') {
    return true
  }
  return false
}

const collectTopLevelDeclarations = (program: ESTree.Program): Map<string, ESTree.Node> => {
  const map = new Map<string, ESTree.Node>()
  for (const stmt of program.body) {
    if (stmt.type === 'ClassDeclaration' && stmt.id) {
      map.set(stmt.id.name, stmt)
    } else if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (decl.id.type === 'Identifier') {
          map.set(decl.id.name, decl)
        }
      }
    }
  }
  return map
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
    const topLevelDeclarations = collectTopLevelDeclarations(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let functionExportCount = 0
    let lastFunctionExportNode: ESTree.Node | null = null
    const disallowedExports: Array<{ node: ESTree.Node; name: string }> = []

    const reportDisallowed = (node: ESTree.Node, name: string) => {
      disallowedExports.push({ node, name })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const workflowFn = getExportedWorkflowFunction(node)
        if (workflowFn !== undefined) {
          functionExportCount += 1
          lastFunctionExportNode = node
          return
        }

        const declaration = node.declaration
        if (declaration) {
          if (declaration.type === 'ClassDeclaration') {
            if (!isSchemaClassDeclaration(declaration)) {
              reportDisallowed(declaration, declaration.id?.name ?? CLASS_NAME_FALLBACK)
            }
            return
          }
          if (declaration.type === 'VariableDeclaration') {
            for (const decl of declaration.declarations) {
              if (decl.id.type !== 'Identifier') continue
              if (!isAllowedValueDeclaration(decl)) {
                reportDisallowed(decl, decl.id.name)
              }
            }
            return
          }
          if (declaration.type === 'TSInterfaceDeclaration' || declaration.type === 'TSTypeAliasDeclaration') {
            return
          }
          reportDisallowed(declaration, 'export')
          return
        }

        pendingSpecifierExports.push(node)
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
        } else {
          reportDisallowed(node, 'default')
        }
      },
      'Program:exit'() {
        for (const node of pendingSpecifierExports) {
          for (const spec of node.specifiers) {
            if (node.exportKind === 'type' || spec.exportKind === 'type') continue
            if (spec.local.type !== 'Identifier') continue
            const localName = spec.local.name
            if (localFunctionNames.has(localName)) {
              functionExportCount += 1
              lastFunctionExportNode = node
              continue
            }
            const localDecl = topLevelDeclarations.get(localName)
            if (localDecl?.type === 'ClassDeclaration') {
              if (isSchemaClassDeclaration(localDecl)) continue
            }
            if (localDecl?.type === 'VariableDeclarator') {
              if (isAllowedValueDeclaration(localDecl)) continue
            }
            reportDisallowed(spec, localName)
          }
        }

        for (const { node, name } of disallowedExports) {
          context.report({
            node,
            messageId: 'disallowedExport',
            data: {
              name,
              expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
              actual: 'exported value',
              fix: 'move constants, helpers, and steps out of the workflow file',
            },
          })
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
