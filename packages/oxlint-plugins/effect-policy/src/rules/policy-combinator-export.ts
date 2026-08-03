import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './policy-combinator-export.config.js'

export type MessageIds = 'noCombinator'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

type FunctionLike = ESTree.Function | ESTree.ArrowFunctionExpression

const isEffectTypeReference = (node: ESTree.Node | undefined): boolean => {
  if (node?.type !== 'TSTypeReference') return false
  if (node.typeName.type === 'Identifier') return node.typeName.name === 'Effect'
  if (node.typeName.type === 'TSQualifiedName') return node.typeName.right.name === 'Effect'
  return false
}

const isPolicyTypeName = (typeName: ESTree.TSTypeReference['typeName']): boolean => {
  if (typeName.type === 'Identifier') return typeName.name.endsWith('Policy')
  if (typeName.type === 'TSQualifiedName') return typeName.right.name.endsWith('Policy')
  return false
}

const hasEffectTypedFirstParam = (fn: FunctionLike): boolean => {
  const first = fn.params[0]
  if (first === undefined) return false
  if (first.type !== 'Identifier') return false
  return isEffectTypeReference(first.typeAnnotation?.typeAnnotation)
}

const isGenericEffectFunction = (fn: FunctionLike): boolean => {
  if (!fn.typeParameters) return false
  return hasEffectTypedFirstParam(fn)
}

const isPolicyAnnotated = (decl: ESTree.VariableDeclarator): boolean => {
  if (decl.id.type !== 'Identifier') return false
  const annotation = decl.id.typeAnnotation?.typeAnnotation
  if (annotation?.type !== 'TSTypeReference') return false
  return isPolicyTypeName(annotation.typeName)
}

const isCombinatorDeclarator = (decl: ESTree.VariableDeclarator): boolean => {
  const init = decl.init
  if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
    if (isGenericEffectFunction(init)) return true
  }
  return isPolicyAnnotated(decl)
}

type TopLevelBinding = ESTree.VariableDeclarator | ESTree.Function

const collectTopLevelBindings = (program: ESTree.Program): Map<string, TopLevelBinding> => {
  const map = new Map<string, TopLevelBinding>()
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

const isCombinatorBinding = (binding: TopLevelBinding): boolean => {
  if (binding.type === 'FunctionDeclaration') return isGenericEffectFunction(binding)
  if (binding.type === 'VariableDeclarator') return isCombinatorDeclarator(binding)
  return false
}

export const policyCombinatorExport = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const topLevelBindings = collectTopLevelBindings(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let combinatorCount = 0

    const countCombinator = (binding: TopLevelBinding | undefined): void => {
      if (binding && isCombinatorBinding(binding)) {
        combinatorCount += 1
      }
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.exportKind === 'type') return

        const declaration = node.declaration
        if (declaration) {
          if (declaration.type === 'FunctionDeclaration') {
            if (isGenericEffectFunction(declaration)) combinatorCount += 1
            return
          }
          if (declaration.type === 'VariableDeclaration') {
            for (const decl of declaration.declarations) {
              if (decl.id.type === 'Identifier' && isCombinatorDeclarator(decl)) {
                combinatorCount += 1
              }
            }
          }
          return
        }

        pendingSpecifierExports.push(node)
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        const declaration = node.declaration
        if (
          declaration.type === 'FunctionDeclaration' ||
          declaration.type === 'ArrowFunctionExpression' ||
          declaration.type === 'FunctionExpression'
        ) {
          if (isGenericEffectFunction(declaration)) combinatorCount += 1
          return
        }
        if (declaration.type === 'Identifier') {
          countCombinator(topLevelBindings.get(declaration.name))
        }
      },
      'Program:exit'() {
        for (const node of pendingSpecifierExports) {
          for (const spec of node.specifiers) {
            if (spec.type !== 'ExportSpecifier') continue
            if (node.exportKind === 'type' || spec.exportKind === 'type') continue
            if (spec.local.type !== 'Identifier') continue
            countCombinator(topLevelBindings.get(spec.local.name))
          }
        }

        if (combinatorCount === 0) {
          const reportNode = program.body[0] ?? program
          context.report({
            node: reportNode,
            messageId: 'noCombinator',
            data: {
              name: '*.policy.ts',
              expected: 'a rank-2 combinator export: <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | Xi, R>',
              actual: '0 rank-2 combinator exports',
              fix:
                'export the combinator — a generic function whose first parameter is Effect-typed, or a value annotated with a *Policy type',
            },
          })
        }
      },
    }
  },
})
