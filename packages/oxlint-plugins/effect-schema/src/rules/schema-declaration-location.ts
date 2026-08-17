import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ACTUAL,
  EXPECTED,
  FIX,
  meta,
  SCHEMA_FILE_SUFFIX,
  WORKFLOW_FILE_BASENAME,
} from './schema-declaration-location.config.js'

export type MessageIds = 'schemaOutsideSchemaFile'

const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

/**
 * The member expression whose object is a schema local, walking callee and
 * receiver chains so `S.Struct({...}).pipe(...)` and the curried
 * `Schema.TaggedError<E>()('E', {...})` superclass both resolve to the
 * defining `Schema.<member>`.
 */
const schemaMemberOf = (node: ESTree.Node | null, locals: ReadonlySet<string>): ESTree.MemberExpression | null => {
  if (node === null) return null
  if (node.type === 'MemberExpression') {
    if (node.object.type === 'Identifier' && locals.has(node.object.name)) return node
    return schemaMemberOf(node.object, locals)
  }
  if (node.type === 'CallExpression') return schemaMemberOf(node.callee, locals)
  return null
}

/**
 * Schema declarations are module-scope only: a class extending a Schema
 * factory, or a module-scope const initialized to a `Schema.<member>(...)`
 * call. Definitions nested in a function or an `if (import.meta.vitest)`
 * block are block-scoped fixtures and out of scope by construction.
 */
export const schemaDeclarationLocation = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (basename.endsWith(SCHEMA_FILE_SUFFIX) || WORKFLOW_FILE_BASENAME.test(basename)) return {}
    const locals = new Set<string>()
    return {
      Program(node: ESTree.Program) {
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'effect') continue
          for (const specifier of statement.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === 'Schema'
            ) {
              locals.add(specifier.local.name)
            }
          }
        }
        for (const statement of node.body) {
          let decl: ESTree.Node | null = statement
          if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
            decl = statement.declaration
          }
          if (decl === null) continue
          if (decl.type === 'ClassDeclaration') {
            if (decl.id !== null && schemaMemberOf(decl.superClass, locals) !== null) {
              context.report({
                node: decl.id,
                messageId: 'schemaOutsideSchemaFile',
                data: { name: decl.id.name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
              })
            }
          } else if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations) {
              if (declarator.id.type === 'Identifier' && schemaMemberOf(declarator.init, locals) !== null) {
                context.report({
                  node: declarator.id,
                  messageId: 'schemaOutsideSchemaFile',
                  data: { name: declarator.id.name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
                })
              }
            }
          }
        }
      },
    }
  },
})
