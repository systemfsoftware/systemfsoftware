import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ANNOTATION_ACTUAL,
  ANNOTATION_EXPECTED,
  ANNOTATION_FIX,
  FUNCTION_DECLARATION_ACTUAL,
  LOCAL_TYPE_ACTUAL,
  LOCAL_TYPE_EXPECTED,
  LOCAL_TYPE_FIX,
  MAKE_METHOD_NAME,
  meta,
  MISSING_MAKE_ACTUAL,
  MISSING_MAKE_EXPECTED,
  MISSING_MAKE_FIX,
  MODULE_SOURCE,
  NAME_FALLBACK,
  WORKFLOW_TYPE_NAME,
} from './workflow-declaration-form.config.js'

export type MessageIds = 'missingMake' | 'annotationInsteadOfMake' | 'localTypeDeclaration'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

// What counts as claiming to be the workflow: a function written inline, or a call to
// something's `.make`. The second half matters because `X.make(...)` on a foreign module or a
// type-only import is indistinguishable from the sanctioned form at a glance and must still be
// rejected, while `S.Union(...)` / `S.TaggedClass(...)` / `Symbol.for(...)` never match `.make`
// and stay legal exports of a workflow file. A bare call like `buildWorkflow()` is deliberately
// out of reach: telling it apart from any other helper call is not decidable at depth 0, and
// demanding `make` of every call export rejects every schema union in the cell.
const isWorkflowClaim = (init: ESTree.Node | null | undefined): boolean => {
  if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') return true
  if (init?.type !== 'CallExpression') return false
  const callee = init.callee
  if (callee.type !== 'MemberExpression' || callee.computed) return false
  return callee.property.type === 'Identifier' && callee.property.name === MAKE_METHOD_NAME
}

export const workflowDeclarationForm = defineRule({
  meta,
  create(context: Context) {
    if (!isWorkflowFile(context.filename)) return {}

    // Local bindings of the package's Workflow export — a named import (or an alias of it)
    // from @systemfsoftware/effect-cell-types. Matching the import source literal and the
    // binding to its later use stays inside this file's own syntax tree: depth 0.
    const makeBindings = new Set<string>()

    const isMakeCall = (init: ESTree.Node | null | undefined): boolean => {
      if (init?.type !== 'CallExpression') return false
      const callee = init.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return false
      if (callee.property.type !== 'Identifier' || callee.property.name !== MAKE_METHOD_NAME) return false
      if (callee.object.type !== 'Identifier') return false
      return makeBindings.has(callee.object.name)
    }

    const isPackageWorkflowAnnotation = (id: ESTree.Node): boolean => {
      if (!('typeAnnotation' in id)) return false
      const annotation = id.typeAnnotation
      if (annotation == null) return false
      if (!('typeAnnotation' in annotation)) return false
      const declared = annotation.typeAnnotation
      if (declared == null || declared.type !== 'TSTypeReference') return false
      const typeName = declared.typeName
      if (typeName.type !== 'TSQualifiedName') return false
      if (typeName.left.type !== 'Identifier' || typeName.right.type !== 'Identifier') return false
      return makeBindings.has(typeName.left.name) && typeName.right.name === WORKFLOW_TYPE_NAME
    }

    return {
      // Collect imports and local contract copies up front, so the export check below never
      // depends on statement order within the file.
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            if (statement.source.value !== MODULE_SOURCE) continue
            if (statement.importKind === 'type') continue
            for (const spec of statement.specifiers) {
              if (spec.type !== 'ImportSpecifier') continue
              if (spec.importKind === 'type') continue
              if (spec.imported.type !== 'Identifier' || spec.imported.name !== WORKFLOW_TYPE_NAME) continue
              makeBindings.add(spec.local.name)
            }
            continue
          }

          if (statement.type === 'TSTypeAliasDeclaration' && statement.id.name === WORKFLOW_TYPE_NAME) {
            context.report({
              node: statement,
              messageId: 'localTypeDeclaration',
              data: {
                name: WORKFLOW_TYPE_NAME,
                expected: LOCAL_TYPE_EXPECTED,
                actual: LOCAL_TYPE_ACTUAL,
                fix: LOCAL_TYPE_FIX,
              },
            })
          }
        }
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        const declaration = node.declaration
        if (declaration == null) return

        if (declaration.type === 'FunctionDeclaration') {
          context.report({
            node: declaration,
            messageId: 'missingMake',
            data: {
              name: declaration.id?.name ?? NAME_FALLBACK,
              expected: MISSING_MAKE_EXPECTED,
              actual: FUNCTION_DECLARATION_ACTUAL,
              fix: MISSING_MAKE_FIX,
            },
          })
          return
        }

        if (declaration.type !== 'VariableDeclaration') return

        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') continue
          if (isMakeCall(declarator.init)) continue
          if (!isPackageWorkflowAnnotation(declarator.id) && !isWorkflowClaim(declarator.init)) continue
          if (isPackageWorkflowAnnotation(declarator.id)) {
            context.report({
              node: declarator.id,
              messageId: 'annotationInsteadOfMake',
              data: {
                name: declarator.id.name,
                expected: ANNOTATION_EXPECTED,
                actual: ANNOTATION_ACTUAL,
                fix: ANNOTATION_FIX,
              },
            })
            continue
          }
          context.report({
            node: declarator.id,
            messageId: 'missingMake',
            data: {
              name: declarator.id.name,
              expected: MISSING_MAKE_EXPECTED,
              actual: MISSING_MAKE_ACTUAL,
              fix: MISSING_MAKE_FIX,
            },
          })
        }
      },
    }
  },
})
