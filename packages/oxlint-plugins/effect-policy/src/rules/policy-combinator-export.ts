import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './policy-combinator-export.config.js'

export type MessageIds = 'noCombinator'

const isPolicyFile = (filename: string): boolean => filename.endsWith('.policy.ts')

type FunctionLike = ESTree.Function | ESTree.ArrowFunctionExpression

const isEffectTypeReference = (node: ESTree.Node | undefined): boolean => {
  if (node?.type !== 'TSTypeReference') return false
  if (node.typeName.type === 'Identifier') return node.typeName.name === 'Effect'
  return node.typeName.type === 'TSQualifiedName' && node.typeName.right.name === 'Effect'
}

const isPolicyTypeName = (typeName: ESTree.TSTypeReference['typeName']): boolean => {
  if (typeName.type === 'Identifier') return typeName.name.endsWith('Policy')
  return typeName.type === 'TSQualifiedName' && typeName.right.name.endsWith('Policy')
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
  if (binding.type === 'VariableDeclarator') return isCombinatorDeclarator(binding)
  return isGenericEffectFunction(binding)
}

export const policyCombinatorExport = defineRule({
  meta,
  create(context: Context) {
    if (!isPolicyFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const topLevelBindings = collectTopLevelBindings(program)
    const pendingSpecifierExports: ESTree.ExportNamedDeclaration[] = []
    let hasCombinator = false

    const markCombinator = (binding: TopLevelBinding | undefined): void => {
      if (binding && isCombinatorBinding(binding)) {
        hasCombinator = true
      }
    }

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration) {
          if (declaration.type === 'FunctionDeclaration') {
            if (isGenericEffectFunction(declaration)) hasCombinator = true
            return
          }
          if (declaration.type === 'VariableDeclaration') {
            for (const decl of declaration.declarations) {
              if (decl.id.type === 'Identifier' && isCombinatorDeclarator(decl)) {
                hasCombinator = true
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
          if (isGenericEffectFunction(declaration)) hasCombinator = true
          return
        }
        if (declaration.type === 'Identifier') {
          markCombinator(topLevelBindings.get(declaration.name))
        }
      },
      'Program:exit'() {
        for (const node of pendingSpecifierExports) {
          for (const spec of node.specifiers) {
            if (node.exportKind === 'type') continue
            if (spec.exportKind === 'type') continue
            if (spec.local.type !== 'Identifier') continue
            markCombinator(topLevelBindings.get(spec.local.name))
          }
        }

        if (!hasCombinator) {
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
