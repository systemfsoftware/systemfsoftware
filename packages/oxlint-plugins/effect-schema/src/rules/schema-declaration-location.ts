import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ACTUAL,
  EXPECTED,
  FIX,
  meta,
  SCHEMA_FILE_SUFFIX,
  SCHEMA_MODULE_SOURCE,
  WORKFLOW_FILE_BASENAME,
} from './schema-declaration-location.config.js'

export type MessageIds = 'schemaOutsideSchemaFile'

export const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

/**
 * The member expression whose object is a schema local, walking callee and
 * receiver chains so `S.Struct({...}).pipe(...)` and the curried
 * `Schema.TaggedError<E>()('E', {...})` superclass both resolve to the
 * defining `Schema.<member>`.
 */
export const schemaMemberOf = (
  node: ESTree.Node | null,
  locals: ReadonlySet<string>,
): ESTree.MemberExpression | null => {
  if (node === null) return null
  if (node.type === 'MemberExpression') {
    if (node.object.type === 'Identifier' && locals.has(node.object.name)) return node
    return schemaMemberOf(node.object, locals)
  }
  if (node.type === 'CallExpression') return schemaMemberOf(node.callee, locals)
  return null
}

/**
 * Schema members that consume a schema and return a non-schema value — a
 * decoder, an encoder, an arbitrary, or a JSON-schema document. A const
 * initialized to one of these is a *use* of a schema, not a declaration, so
 * it is out of scope for the placement rule.
 *
 * The codec entries are the complete `export const decode*` / `encode*` surface
 * of `repos/effect/packages/effect/src/Schema.ts` — 29 exports — minus the three
 * that return a schema rather than consume one: `decodeTo`, `encodeTo` and
 * `encodeKeys` are transformations, so a const bound to one IS a declaration.
 * An incomplete list here is a false positive, not a miss: this rule reported a
 * legitimate `S.encodeUnknownExit` codec as a misplaced declaration while
 * `encodeUnknownExit` was absent, so the list is derived from the vendored
 * source and never extended by hand from memory.
 */
export const SCHEMA_USE_MEMBERS: Record<string, true> = {
  decode: true,
  decodeEffect: true,
  decodeExit: true,
  decodeOption: true,
  decodePromise: true,
  decodeResult: true,
  decodeSync: true,
  decodeUnknownEffect: true,
  decodeUnknownExit: true,
  decodeUnknownOption: true,
  decodeUnknownPromise: true,
  decodeUnknownResult: true,
  decodeUnknownSync: true,
  encode: true,
  encodeEffect: true,
  encodeExit: true,
  encodeOption: true,
  encodePromise: true,
  encodeResult: true,
  encodeSync: true,
  encodeUnknownEffect: true,
  encodeUnknownExit: true,
  encodeUnknownOption: true,
  encodeUnknownPromise: true,
  encodeUnknownResult: true,
  encodeUnknownSync: true,
  toArbitrary: true,
  toJsonSchemaDocument: true,
  // `S.is(X)` returns a type guard over X, not a schema. A const bound to one is a *use*
  // of the schema it names, so it belongs beside the code that branches on it and imposes
  // no placement obligation of its own.
  is: true,
  isSchema: true,
  isSchemaError: true,
  isSchemaAST: true,
}

/**
 * True when `node` is a schema *declaration*: its defining `Schema.<member>`
 * is a schema-producing combinator, not a use combinator.
 */
export const isSchemaDeclaration = (node: ESTree.Node | null, locals: ReadonlySet<string>): boolean => {
  const member = schemaMemberOf(node, locals)
  if (member === null) return false
  if (member.property.type !== 'Identifier') return false
  return SCHEMA_USE_MEMBERS[member.property.name] !== true
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
    return {
      Program(node: ESTree.Program) {
        const report = (id: ESTree.Node, name: string): void =>
          context.report({
            node: id,
            messageId: 'schemaOutsideSchemaFile',
            data: { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
          })
        // Two passes, because an `import` may legally follow a declaration that depends on
        // it: every local alias of `Schema` must be known before any declaration is judged.
        //
        // Both spellings the repo writes bind a schema local, and a predicate that reads one
        // of them silently admits the other (REPO-A4): `import { Schema as S } from 'effect'`
        // and `import * as S from 'effect/Schema'`.
        const locals = new Set<string>()
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const source = statement.source.value
          if (source !== 'effect' && source !== SCHEMA_MODULE_SOURCE) continue
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier' && source === SCHEMA_MODULE_SOURCE) {
              locals.add(specifier.local.name)
            } else if (
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
            if (decl.id !== null && isSchemaDeclaration(decl.superClass, locals)) report(decl.id, decl.id.name)
          } else if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations) {
              if (declarator.id.type === 'Identifier' && isSchemaDeclaration(declarator.init, locals)) {
                report(declarator.id, declarator.id.name)
              }
            }
          }
        }
      },
    }
  },
})
