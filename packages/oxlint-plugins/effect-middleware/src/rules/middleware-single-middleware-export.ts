import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './middleware-single-middleware-export.config.js'

export type MessageIds = 'tooManyFunctionExports' | 'disallowedExport'

const isMiddlewareFile = (filename: string): boolean => filename.endsWith('.middleware.ts')

const isContextTagCallee = (node: ESTree.Node | null): boolean => {
  let current: ESTree.Node | null = node
  while (current !== null && current.type === 'CallExpression') {
    const callee = current.callee
    if (callee.type === 'MemberExpression') {
      const object = callee.object
      const property = callee.property
      if (object.type !== 'Identifier' || object.name !== 'Context') return false
      if (property.type !== 'Identifier' || property.name !== 'Tag') return false
      return true
    }
    current = callee
  }
  return false
}

const isContextTagClassDeclaration = (node: ESTree.Node | null): boolean =>
  node?.type === 'ClassDeclaration' && isContextTagCallee(node.superClass)

const isFunctionVariableDeclarator = (decl: ESTree.VariableDeclarator): boolean => {
  if (decl.id.type !== 'Identifier') return false
  if (decl.init === null) return false
  return decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression'
}

const collectLocalFunctionNames = (program: ESTree.Program): Set<string> => {
  const names = new Set<string>()
  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id !== null) {
      names.add(stmt.id.name)
      continue
    }
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (isFunctionVariableDeclarator(decl) && decl.id.type === 'Identifier') {
          names.add(decl.id.name)
        }
      }
    }
  }
  return names
}

const collectTopLevelClassDeclarations = (program: ESTree.Program): Map<string, ESTree.Class> => {
  const map = new Map<string, ESTree.Class>()
  for (const stmt of program.body) {
    if (stmt.type !== 'ClassDeclaration') continue
    if (stmt.id === null) continue
    map.set(stmt.id.name, stmt)
  }
  return map
}

const extractFunctionFromExport = (node: ESTree.ExportNamedDeclaration): ESTree.Node | null => {
  const declaration = node.declaration
  if (declaration === null) return null
  if (declaration.type === 'FunctionDeclaration') return declaration
  if (declaration.type !== 'VariableDeclaration') return null
  for (const decl of declaration.declarations) {
    if (isFunctionVariableDeclarator(decl)) return decl
  }
  return null
}

export const middlewareSingleMiddlewareExport = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isMiddlewareFile(filename)) return {}

    const program = context.sourceCode.ast
    const localFunctionNames = collectLocalFunctionNames(program)
    const topLevelClassDeclarations = collectTopLevelClassDeclarations(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let functionExportCount = 0
    let lastFunctionExportNode: ESTree.Node | null = null
    const disallowedExports: Array<{ node: ESTree.Node; name: string }> = []

    const reportDisallowed = (node: ESTree.Node, name: string): void => {
      disallowedExports.push({ node, name })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const functionExport = extractFunctionFromExport(node)
        if (functionExport !== null) {
          functionExportCount += 1
          lastFunctionExportNode = functionExport
          return
        }

        const declaration = node.declaration
        if (declaration !== null) {
          if (declaration.type === 'ClassDeclaration') {
            if (declaration.id === null) return
            if (!isContextTagClassDeclaration(declaration)) {
              reportDisallowed(declaration, declaration.id.name)
            }
            return
          }
          if (declaration.type === 'TSInterfaceDeclaration' || declaration.type === 'TSTypeAliasDeclaration') {
            return
          }
          if (declaration.type === 'VariableDeclaration') {
            for (const decl of declaration.declarations) {
              if (decl.id.type !== 'Identifier') continue
              reportDisallowed(decl, decl.id.name)
            }
            return
          }
          reportDisallowed(declaration, 'export')
          return
        }

        pendingSpecifierExports.push(node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        reportDisallowed(node, '*')
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
          const isReExport = node.source !== null
          for (const spec of node.specifiers) {
            if (node.exportKind === 'type' || spec.exportKind === 'type') continue
            if (spec.local.type !== 'Identifier') continue
            const localName = spec.local.name
            if (isReExport) {
              functionExportCount += 1
              lastFunctionExportNode = spec
              continue
            }
            if (localFunctionNames.has(localName)) {
              functionExportCount += 1
              lastFunctionExportNode = spec
              continue
            }
            const localDecl = topLevelClassDeclarations.get(localName)
            if (localDecl !== undefined && isContextTagClassDeclaration(localDecl)) continue
            reportDisallowed(spec, localName)
          }
        }

        for (const { node, name } of disallowedExports) {
          context.report({
            node,
            messageId: 'disallowedExport',
            data: {
              name,
              expected: 'only the middleware function, its attached Context.Tag, and types',
              actual: 'exported value',
              fix: 'move constants and helpers out of the middleware file; a second middleware is a separate concern',
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
                name: '*.middleware.ts',
                expected: 'exactly one function export — the middleware itself',
                actual: `${functionExportCount} function exports`,
                fix: 'split each additional middleware into its own *.middleware.ts file',
              },
            })
          }
        }
      },
    }
  },
})
