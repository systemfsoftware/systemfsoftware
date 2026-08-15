import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './handler-single-handler-export.config.js'

export type MessageIds = 'tooManyFunctionExports' | 'disallowedExport'

const isHandlerFile = (filename: string): boolean => filename.endsWith('.handler.ts')

const isTaggedClassOrErrorCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee.type === 'CallExpression' ? node.callee.callee : node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'S') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'TaggedClass' || callee.property.name === 'TaggedError'
}

const isSchemaClassDeclaration = (node: ESTree.Class): boolean => {
  if (!node.superClass) return false
  return node.superClass.type === 'CallExpression' && isTaggedClassOrErrorCall(node.superClass)
}

const isHttpRouterMemberCallee = (callee: ESTree.Node): boolean => {
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'HttpRouter') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'empty' || callee.property.name === 'make'
}

const isRouterCall = (node: ESTree.CallExpression): boolean => {
  if (isHttpRouterMemberCallee(node.callee)) return true
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'pipe'
  ) {
    const receiver = node.callee.object
    if (receiver.type === 'CallExpression') return isRouterCall(receiver)
  }
  return false
}

const isAllowedValueDeclaration = (decl: ESTree.VariableDeclarator): boolean => {
  if (!decl.init) return false
  const init = decl.init
  if (init.type === 'ArrayExpression') return true
  if (init.type !== 'CallExpression') return false
  if (isRouterCall(init)) return true
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
      obj.type === 'Identifier' && obj.name === 'Symbol' &&
      prop.type === 'Identifier' && prop.name === 'for'
    ) {
      return true
    }
  }
  if (init.callee.type === 'Identifier' && init.callee.name === 'Symbol') {
    return true
  }
  return false
}

const isFunctionInitializer = (init: ESTree.Node | null): boolean => {
  if (!init) return false
  return init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression'
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
        if (decl.id.type !== 'Identifier') continue
        if (isFunctionInitializer(decl.init)) {
          names.add(decl.id.name)
        }
      }
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      const decl = stmt.declaration
      if (decl.type === 'FunctionDeclaration' && decl.id) {
        names.add(decl.id.name)
      } else if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id.type === 'Identifier' && isFunctionInitializer(d.init)) {
            names.add(d.id.name)
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

const getExportedHandlerFunction = (node: ESTree.ExportNamedDeclaration): ESTree.Node | undefined => {
  const declaration = node.declaration
  if (declaration?.type === 'FunctionDeclaration') return declaration
  if (declaration?.type !== 'VariableDeclaration') return undefined
  return declaration.declarations.find((decl) => decl.id.type === 'Identifier' && isFunctionInitializer(decl.init))
}

export const handlerSingleHandlerExport = defineRule({
  meta,
  create(context: Context) {
    if (!isHandlerFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const localFunctionNames = collectLocalFunctionNames(program)
    const topLevelDeclarations = collectTopLevelDeclarations(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let functionExportCount = 0
    let lastFunctionExportNode: ESTree.Node | null = null
    const disallowedExports: { node: ESTree.Node; name: string }[] = []

    const reportDisallowed = (node: ESTree.Node, name: string) => {
      disallowedExports.push({ node, name })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const handlerFn = getExportedHandlerFunction(node)
        if (handlerFn !== undefined) {
          functionExportCount += 1
          lastFunctionExportNode = node
          return
        }

        const declaration = node.declaration
        if (declaration) {
          if (declaration.type === 'ClassDeclaration') {
            if (!isSchemaClassDeclaration(declaration) && declaration.id) {
              reportDisallowed(declaration, declaration.id.name)
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
          decl.type === 'FunctionExpression' ||
          (decl.type === 'Identifier' && localFunctionNames.has(decl.name))
        ) {
          functionExportCount += 1
          lastFunctionExportNode = node
        } else {
          reportDisallowed(node, 'default')
        }
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        functionExportCount += 1
        lastFunctionExportNode = node
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
            if (node.source !== null) {
              functionExportCount += 1
              lastFunctionExportNode = node
              continue
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
              expected:
                'only the handler function, schema classes, S.Union, TypeId symbols, types, and a router/route-table that registers the handler',
              actual: 'exported value',
              fix: 'move constants, helpers, and steps out of the handler file',
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
                name: '*.handler.ts',
                expected: 'exactly one function export — the handler itself',
                actual: `${String(functionExportCount)} function exports`,
                fix:
                  'make steps and helpers private; schema classes, types, and a router/route-table may stay exported',
              },
            })
          }
        }
      },
    }
  },
})
