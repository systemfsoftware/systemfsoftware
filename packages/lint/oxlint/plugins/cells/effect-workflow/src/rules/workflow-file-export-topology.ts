import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { WORKFLOW_FILE_BASENAME } from './make-file-location.config.js'
import {
  EXTRA_ACTUAL,
  EXTRA_FIX,
  meta,
  MISSING_ACTUAL,
  MISSING_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  SCHEMA_DECLARATION_MEMBERS,
  SCHEMA_USE_MEMBERS,
  SIGNATURE_EXPECTED,
} from './workflow-file-export-topology.config.js'

export type MessageIds = 'extraValueExport' | 'missingValueExport' | 'reexportFromWorkflowFile'

type BindingKind = 'schema' | 'vocabulary' | 'value'

const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

const unwrap = (node: ESTree.Node): ESTree.Node => {
  switch (node.type) {
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
      return unwrap(node.expression)
    case 'ChainExpression':
      return unwrap(node.expression)
    default:
      return node
  }
}

const schemaMemberOf = (node: ESTree.Node | null): string | null => {
  if (node === null) return null
  const inner = unwrap(node)
  if (inner.type === 'CallExpression') return schemaMemberOf(inner.callee)
  if (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier' &&
    inner.object.type === 'Identifier' &&
    (inner.object.name === 'S' || inner.object.name === 'Schema')
  ) {
    return inner.property.name
  }
  return null
}

const isSchemaDeclaration = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_DECLARATION_MEMBERS[name] === true
}

const isCodecUse = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_USE_MEMBERS[name] === true
}

export const workflowFileExportTopology = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!WORKFLOW_FILE_BASENAME.test(basename)) return {}
    return {
      Program(node: ESTree.Program) {
        const importedBindings: Record<string, true> = {}
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          for (const specifier of statement.specifiers) {
            importedBindings[specifier.local.name] = true
          }
        }

        const bindings = new Map<string, BindingKind>()
        const recordDeclaration = (declaration: ESTree.Node | null): void => {
          if (declaration === null) return
          switch (declaration.type) {
            case 'ClassDeclaration':
              if (declaration.id !== null) {
                bindings.set(declaration.id.name, isSchemaDeclaration(declaration.superClass) ? 'schema' : 'value')
              }
              break
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier') continue
                bindings.set(
                  declarator.id.name,
                  isSchemaDeclaration(declarator.init) && !isCodecUse(declarator.init) ? 'schema' : 'value',
                )
              }
              break
            case 'FunctionDeclaration':
              if (declaration.id !== null) bindings.set(declaration.id.name, 'value')
              break
            case 'TSEnumDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSInterfaceDeclaration':
              bindings.set(declaration.id.name, 'vocabulary')
              break
            default:
              break
          }
        }

        for (const statement of node.body) {
          if (statement.type === 'ExportNamedDeclaration') recordDeclaration(statement.declaration)
          else if (statement.type === 'ExportDefaultDeclaration') recordDeclaration(statement.declaration)
          else recordDeclaration(statement)
        }

        const valueExports: ESTree.Node[] = []

        const reportReexport = (target: ESTree.Node, source: string): void => {
          context.report({
            node: target,
            messageId: 'reexportFromWorkflowFile',
            data: {
              name: 'a re-export',
              expected: REEXPORT_EXPECTED,
              actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
              fix: REEXPORT_FIX,
            },
          })
        }

        const countValue = (target: ESTree.Node): void => {
          valueExports.push(target)
        }

        const kindOfInit = (init: ESTree.Node | null): BindingKind => {
          if (init !== null && init.type === 'Identifier') {
            const kind = bindings.get(init.name)
            if (kind !== undefined) return kind
          }
          if (isCodecUse(init)) return 'value'
          if (isSchemaDeclaration(init)) return 'schema'
          return 'value'
        }

        const judgeDeclaration = (declaration: ESTree.Node): void => {
          switch (declaration.type) {
            case 'ClassDeclaration':
              if (!isSchemaDeclaration(declaration.superClass)) countValue(declaration.id ?? declaration)
              break
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier') {
                  countValue(declarator.id)
                  continue
                }
                if (kindOfInit(declarator.init) !== 'schema') countValue(declarator.id)
              }
              break
            case 'FunctionDeclaration':
              countValue(declaration.id ?? declaration)
              break
            case 'TSEnumDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSInterfaceDeclaration':
              break
            default:
              if (declaration.type === 'Identifier') {
                const kind = bindings.get(declaration.name)
                if (kind === 'schema' || kind === 'vocabulary') break
              }
              if (kindOfInit(declaration) !== 'schema') countValue(declaration)
          }
        }

        for (const statement of node.body) {
          switch (statement.type) {
            case 'ExportAllDeclaration':
              reportReexport(statement, statement.source.value)
              break
            case 'ExportNamedDeclaration':
              if (statement.source !== null) {
                reportReexport(statement, statement.source.value)
                break
              }
              if (statement.declaration !== null) {
                judgeDeclaration(statement.declaration)
                break
              }
              for (const specifier of statement.specifiers) {
                if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') continue
                const kind = bindings.get(specifier.local.name)
                if (kind === 'schema' || kind === 'vocabulary') continue
                if (importedBindings[specifier.local.name] === true) {
                  reportReexport(specifier, `the imported binding ${specifier.local.name}`)
                  continue
                }
                countValue(specifier)
              }
              break
            case 'ExportDefaultDeclaration':
              judgeDeclaration(statement.declaration)
              break
            default:
              break
          }
        }

        if (valueExports.length === 0) {
          context.report({
            node,
            messageId: 'missingValueExport',
            data: {
              name: basename,
              expected: SIGNATURE_EXPECTED,
              actual: MISSING_ACTUAL,
              fix: MISSING_FIX,
            },
          })
          return
        }
        for (const extra of valueExports.slice(1)) {
          context.report({
            node: extra,
            messageId: 'extraValueExport',
            data: {
              name: basename,
              expected: SIGNATURE_EXPECTED,
              actual: EXTRA_ACTUAL,
              fix: EXTRA_FIX,
            },
          })
        }
      },
    }
  },
})
