import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { ACL_SUFFIX, meta } from './acl-single-transform-export.config.js'

export type MessageIds = 'tooManyTransformExports' | 'disallowedExport'

const isAclFile = (filename: string): boolean => filename.endsWith(ACL_SUFFIX)

const isSMemberAccess = (node: ESTree.Node): node is ESTree.StaticMemberExpression => {
  if (node.type !== 'MemberExpression') return false
  const object = node.object
  if (object.type !== 'Identifier') return false
  if (object.name !== 'S') return false
  return node.property.type === 'Identifier'
}

const TRANSFORM_NAMES: Record<string, true> = { transform: true, transformOrFail: true }

const isTransformCallee = (callee: ESTree.Expression | ESTree.Super): boolean => {
  const target = callee.type === 'CallExpression' ? callee.callee : callee
  if (!isSMemberAccess(target)) return false
  return TRANSFORM_NAMES[target.property.name] === true
}

const isTransformCallExpression = (node: ESTree.Node): boolean =>
  node.type === 'CallExpression' && isTransformCallee(node.callee)

const isSchemaCallExpression = (node: ESTree.Node): boolean => {
  if (node.type !== 'CallExpression') return false
  return isSMemberAccess(node.callee) && TRANSFORM_NAMES[node.callee.property.name] !== true
}

const isSchemaDeclaration = (decl: ESTree.VariableDeclarator): boolean => {
  const init = decl.init
  if (init === null) return false
  if (isSchemaCallExpression(init)) return true
  if (isSMemberAccess(init)) {
    return TRANSFORM_NAMES[init.property.name] !== true
  }
  return false
}

const collectTopLevelDeclarations = (program: ESTree.Program): Map<string, ESTree.Node> => {
  const map = new Map<string, ESTree.Node>()
  for (const stmt of program.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
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

export const aclSingleTransformExport = defineRule({
  meta,
  create(context: Context) {
    if (!isAclFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const topLevelDeclarations = collectTopLevelDeclarations(program)
    let transformExportCount = 0
    let lastTransformExportNode: ESTree.Node | null = null
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    const disallowedExports: { node: ESTree.Node; name: string }[] = []

    const reportDisallowed = (node: ESTree.Node, name: string): void => {
      disallowedExports.push({ node, name })
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.exportKind === 'type') return

        const declaration = node.declaration
        if (declaration) {
          if (declaration.type === 'FunctionDeclaration') {
            transformExportCount += 1
            lastTransformExportNode = node
            return
          }
          if (declaration.type === 'VariableDeclaration') {
            let sawTransform = false
            for (const decl of declaration.declarations) {
              if (decl.id.type !== 'Identifier') continue
              if (decl.init !== null && isTransformCallExpression(decl.init)) {
                sawTransform = true
                continue
              }
              if (isSchemaDeclaration(decl)) continue
              reportDisallowed(decl, decl.id.name)
            }
            if (sawTransform) {
              transformExportCount += 1
              lastTransformExportNode = node
            }
            return
          }
          if (declaration.type === 'ClassDeclaration') {
            const className = declaration.id?.name
            reportDisallowed(declaration, className ?? declaration.type)
            return
          }
          reportDisallowed(declaration, 'export')
          return
        }

        pendingSpecifierExports.push(node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === 'type') return
        reportDisallowed(node, 'export *')
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        if (node.declaration.type === 'FunctionDeclaration') {
          transformExportCount += 1
          lastTransformExportNode = node
        }
      },
      'Program:exit'() {
        for (const node of pendingSpecifierExports) {
          if (node.source !== null) {
            for (const spec of node.specifiers) {
              if (spec.exportKind === 'type') continue
              if (spec.local.type !== 'Identifier') continue
              reportDisallowed(spec, spec.local.name)
            }
            continue
          }
          for (const spec of node.specifiers) {
            if (spec.exportKind === 'type') continue
            if (spec.local.type !== 'Identifier') continue
            const localDecl = topLevelDeclarations.get(spec.local.name)
            if (localDecl === undefined) {
              reportDisallowed(spec, spec.local.name)
              continue
            }
            if (localDecl.type === 'FunctionDeclaration') {
              transformExportCount += 1
              lastTransformExportNode = node
              continue
            }
            if (localDecl.type === 'VariableDeclarator' && isSchemaDeclaration(localDecl)) {
              continue
            }
            if (
              localDecl.type === 'VariableDeclarator' &&
              localDecl.init !== null &&
              isTransformCallExpression(localDecl.init)
            ) {
              transformExportCount += 1
              lastTransformExportNode = node
              continue
            }
            reportDisallowed(spec, spec.local.name)
          }
        }

        for (const { node, name } of disallowedExports) {
          context.report({
            node,
            messageId: 'disallowedExport',
            data: {
              name,
              expected: 'only the ACL transform itself, the source/target Schema declarations, and types/interfaces',
              actual: 'exported value',
              fix: 'move constants, helpers, and classes out of the ACL file',
            },
          })
        }

        if (transformExportCount < 2) return

        const reportNode = lastTransformExportNode ?? program.body[0] ?? program
        context.report({
          node: reportNode,
          messageId: 'tooManyTransformExports',
          data: {
            name: '*.acl.ts',
            expected: 'exactly one transform export — the ACL itself',
            actual: `${transformExportCount} transform exports`,
            fix: 'move each additional crossing into its own *.acl.ts file',
          },
        })
      },
    }
  },
})
