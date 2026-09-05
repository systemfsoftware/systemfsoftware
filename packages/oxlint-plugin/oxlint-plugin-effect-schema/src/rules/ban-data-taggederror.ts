import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EXPECTED, FIX, meta } from './ban-data-taggederror.config.js'

export type Options = []

export type MessageIds = 'noDataTaggedError'

export const banDataTaggedError = defineRule({
  meta,
  create(context: Context) {
    // Scope: a `.tst.ts` file is a type-test fixture that must contain no runtime
    // values — its rejection probes (e.g. a non-Schema `Data.TaggedError` value used
    // to prove a Schema constructor rejects it) are the point of the file, not
    // authoring drift. The boundary is a property of what a type-test file *is*.
    if (context.filename.endsWith('.tst.ts')) return {}

    let dataImportSource: string | null = null
    let dataLocalName: string | null = null
    let hasLocalDataVariable = false

    const reportViolation = (node: ESTree.Node, name: string) => {
      context.report({
        node,
        messageId: 'noDataTaggedError',
        data: {
          name,
          expected: EXPECTED,
          actual: name,
          fix: FIX,
        },
      })
    }

    const isDataTaggedError = (node: ESTree.Node): boolean => {
      if (node.type !== 'MemberExpression') {
        return false
      }

      const { object, property } = node

      if (
        object.type === 'Identifier' &&
        (object.name === 'Data' || object.name === dataLocalName) &&
        property.type === 'Identifier' &&
        property.name === 'TaggedError'
      ) {
        return true
      }

      return false
    }

    const isEffectData = (): boolean => {
      if (hasLocalDataVariable) {
        return false
      }
      return dataImportSource === 'effect' || dataImportSource === null
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source: string = node.source.value

        for (const s of node.specifiers) {
          if (
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            s.imported.name === 'Data'
          ) {
            dataImportSource = source
            dataLocalName = s.local.name
            break
          }
        }
      },

      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const decl of node.declarations) {
          if (
            decl.id.type === 'Identifier' &&
            decl.id.name === 'Data'
          ) {
            hasLocalDataVariable = true
            break
          }
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!isEffectData()) {
          return
        }

        const parent = node.parent

        // Skip if handled by ClassDeclaration (pattern: class X extends Data.TaggedError('N') {})
        if (parent && parent.type === 'ClassDeclaration') {
          return
        }

        const { callee } = node

        if (isDataTaggedError(callee)) {
          reportViolation(node, 'Data.TaggedError')
        }
      },

      ClassDeclaration(node: ESTree.Class) {
        if (!isEffectData()) {
          return
        }

        if (!node.superClass) {
          return
        }

        // Handle: extends Data.TaggedError('N') or extends Data.TaggedError('N')<Type>
        if (node.superClass.type === 'CallExpression') {
          if (isDataTaggedError(node.superClass.callee)) {
            reportViolation(node.superClass, 'Data.TaggedError')
          }
        }
      },

      MemberExpression(node: ESTree.MemberExpression) {
        if (!isDataTaggedError(node)) {
          return
        }

        if (!isEffectData()) {
          return
        }

        const parent = node.parent

        if (parent && parent.type === 'CallExpression' && parent.callee === node) {
          return
        }

        if (parent && parent.type === 'MemberExpression') {
          return
        }

        reportViolation(node, 'Data.TaggedError')
      },
    }
  },
})
