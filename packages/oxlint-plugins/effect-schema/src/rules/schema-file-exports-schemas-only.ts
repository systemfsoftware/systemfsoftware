import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { SCHEMA_MODULE_SOURCE } from './schema-declaration-location.config.js'
import {
  basenameOf,
  isSchemaDeclaration,
  SCHEMA_PREDICATE_MEMBERS,
  SCHEMA_USE_MEMBERS,
  schemaMemberOf,
} from './schema-declaration-location.js'
import {
  CODEC_EXPORT_ACTUAL,
  CODEC_EXPORT_EXPECTED,
  CODEC_EXPORT_FIX,
  meta,
  NON_SCHEMA_EXPORT_ACTUAL,
  NON_SCHEMA_EXPORT_EXPECTED,
  NON_SCHEMA_EXPORT_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  SCHEMA_FILE_SUFFIX,
} from './schema-file-exports-schemas-only.config.js'

export type MessageIds = 'codecExport' | 'nonSchemaExport' | 'reexportFromSchemaFile'

type ExportVerdict = 'schema' | 'codec' | 'other'

/**
 * True when a binding's type annotation names a Schema — `S.Schema<AstNode>`,
 * `Schema.Codec<A, I>`. It reads the annotation's source text through the type
 * node's own name chain, so a forward-declared recursive schema, which carries
 * its type and no initializer, is still classified as schema vocabulary.
 */
const annotationNamesSchema = (annotation: ESTree.Node | null | undefined): boolean => {
  if (annotation === null || annotation === undefined) return false
  if (annotation.type === 'TSTypeAnnotation') return annotationNamesSchema(annotation.typeAnnotation)
  if (annotation.type === 'TSTypeReference') {
    const name = annotation.typeName
    if (name.type === 'Identifier') return name.name === 'Schema' || name.name.includes('Schema')
    if (name.type === 'TSQualifiedName') {
      return name.right.type === 'Identifier' &&
        (name.right.name === 'Schema' || name.right.name === 'Codec')
    }
  }
  return false
}

/**
 * A `*.schema.ts` file may export nothing but schemas. This is the converse of
 * `schema-declaration-location`: that rule sends every schema declaration into
 * `*.schema.ts` files, this one keeps every non-schema and every re-export out
 * of them. The declaration / use line it draws is the same one its sibling
 * draws — `isSchemaDeclaration`, `SCHEMA_USE_MEMBERS` and `schemaMemberOf` are
 * imported from it, never re-derived.
 *
 * Allowed surface: a module-scope class extending a Schema factory, a
 * module-scope const initialized to a `Schema.<member>(...)` combinator, and
 * the vocabulary the schemas are built from — exported type aliases /
 * interfaces (erased at runtime, they are the type side of a schema) and
 * exported enums (the literal domain of the file's schemas).
 *
 * Reported: every other exported value (a codec const, a function, a plain
 * class, a destructured binding, an `export { x }` of a non-schema local), and
 * every re-export form — `export * from`, `export * as ns from`, `export { x }
 * from` (value or type), and `export { x }` of an imported binding, which is a
 * re-export dressed as a local name.
 */
export const schemaFileExportsSchemasOnly = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!basename.endsWith(SCHEMA_FILE_SUFFIX)) return {}
    return {
      Program(node: ESTree.Program) {
        // Pass 1 — every local spelling of the Schema vocabulary, plus the local names
        // that arrived through an import. Two passes are needed because an `import` may
        // legally follow the statements that use it (same discipline as the sibling).
        const locals = new Set<string>()
        const importedBindings = new Set<string>()
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          const source = statement.source.value
          const isSchemaVocabulary = source === 'effect' || source === SCHEMA_MODULE_SOURCE
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier') {
              // Only a namespace import of the Schema submodule binds the vocabulary;
              // `import * as X from 'effect'` binds the whole library surface.
              if (source === SCHEMA_MODULE_SOURCE) locals.add(specifier.local.name)
              importedBindings.add(specifier.local.name)
            } else if (specifier.type === 'ImportSpecifier') {
              if (
                isSchemaVocabulary &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === 'Schema'
              ) {
                locals.add(specifier.local.name)
              }
              importedBindings.add(specifier.local.name)
            } else if (specifier.type === 'ImportDefaultSpecifier') {
              importedBindings.add(specifier.local.name)
            }
          }
        }

        // Pass 2 — module-scope declarations keyed by name, so `export { x }` can be
        // judged by what `x` is. `vocabulary` covers enums and type-level declarations.
        const bindings = new Map<string, 'schema' | 'vocabulary' | 'value'>()
        const recordDeclaration = (declaration: ESTree.Node | null): void => {
          if (declaration === null) return
          switch (declaration.type) {
            case 'ClassDeclaration':
              if (declaration.id !== null) {
                bindings.set(
                  declaration.id.name,
                  isSchemaDeclaration(declaration.superClass, locals) ? 'schema' : 'value',
                )
              }
              break
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                if (declarator.id.type === 'Identifier') {
                  // A recursive schema is forward-declared with its type and assigned
                  // later - `let AstNodeSchema: S.Schema<AstNode>` above the suspended
                  // members, `AstNodeSchema = S.Union([...])` below them - so there is
                  // no initializer to inspect at the declaration. The annotation is
                  // what says schema there, and reading it is the difference between
                  // classifying the binding and reporting a legitimate alias of it.
                  bindings.set(
                    declarator.id.name,
                    isSchemaDeclaration(declarator.init, locals) ||
                      annotationNamesSchema(declarator.id.typeAnnotation)
                      ? 'schema'
                      : 'value',
                  )
                }
              }
              break
            case 'FunctionDeclaration':
              if (declaration.id !== null) bindings.set(declaration.id.name, 'value')
              break
            case 'TSModuleDeclaration':
              if (declaration.id.type === 'Identifier') bindings.set(declaration.id.name, 'value')
              break
            case 'TSEnumDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSInterfaceDeclaration':
              bindings.set(declaration.id.name, 'vocabulary')
              break
          }
        }
        for (const statement of node.body) {
          if (statement.type === 'ExportNamedDeclaration') recordDeclaration(statement.declaration)
          else if (statement.type === 'ExportDefaultDeclaration') recordDeclaration(statement.declaration)
          else recordDeclaration(statement)
        }

        // Pass 3 — the three verdicts an exported initializer can earn: a schema
        // declaration (allowed), a use combinator (a codec — banned, with its specific
        // remedy), or any other value (banned).
        const verdictOf = (init: ESTree.Node | null): ExportVerdict => {
          // `export const X = Y` where Y is a name declared (not imported) in this file as
          // schema vocabulary — a local alias, not a re-export. Same resolution the
          // default-export arm gives identifiers.
          if (init !== null && init.type === 'Identifier' && bindings.get(init.name) === 'schema') {
            return 'schema'
          }
          if (isSchemaDeclaration(init, locals)) return 'schema'
          const member = schemaMemberOf(init, locals)
          if (
            member !== null &&
            member.property.type === 'Identifier' &&
            SCHEMA_USE_MEMBERS[member.property.name] === true
          ) {
            // A predicate is not a codec. `S.is(X)` returns a type guard over the
            // shape declared beside it: pure, allocated once, and deciding exactly
            // this file's vocabulary. Evicting it buys nothing - the same const
            // reappears in the caller, or the guard is rebuilt on every call.
            return SCHEMA_PREDICATE_MEMBERS[member.property.name] === true ? 'schema' : 'codec'
          }
          return 'other'
        }

        const reportExport = (target: ESTree.Node, verdict: 'codec' | 'other', name: string): void => {
          if (verdict === 'codec') {
            context.report({
              node: target,
              messageId: 'codecExport',
              data: { name, expected: CODEC_EXPORT_EXPECTED, actual: CODEC_EXPORT_ACTUAL, fix: CODEC_EXPORT_FIX },
            })
          } else {
            context.report({
              node: target,
              messageId: 'nonSchemaExport',
              data: {
                name,
                expected: NON_SCHEMA_EXPORT_EXPECTED,
                actual: NON_SCHEMA_EXPORT_ACTUAL,
                fix: NON_SCHEMA_EXPORT_FIX,
              },
            })
          }
        }

        const reportReexport = (target: ESTree.Node, source: string): void => {
          context.report({
            node: target,
            messageId: 'reexportFromSchemaFile',
            data: {
              name: 'a re-export',
              expected: REEXPORT_EXPECTED,
              actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
              fix: REEXPORT_FIX,
            },
          })
        }

        const judgeDeclaration = (declaration: ESTree.Node, nameFallback: string): void => {
          switch (declaration.type) {
            case 'ClassDeclaration': {
              if (!isSchemaDeclaration(declaration.superClass, locals)) {
                reportExport(declaration.id ?? declaration, 'other', declaration.id?.name ?? nameFallback)
              }
              break
            }
            case 'VariableDeclaration':
              for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier') {
                  // A destructured export can never be a schema declaration.
                  reportExport(declarator.id, 'other', nameFallback)
                  continue
                }
                const verdict = verdictOf(declarator.init)
                if (verdict !== 'schema') reportExport(declarator.id, verdict, declarator.id.name)
              }
              break
            case 'FunctionDeclaration':
              reportExport(declaration.id ?? declaration, 'other', declaration.id?.name ?? nameFallback)
              break
            case 'TSModuleDeclaration':
              reportExport(
                declaration,
                'other',
                declaration.id.type === 'Identifier' ? declaration.id.name : nameFallback,
              )
              break
            case 'TSEnumDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSInterfaceDeclaration':
              // Vocabulary — the type surface the file's schemas are built from.
              break
            default: {
              // `export default <expression>`: only a schema-producing expression, or a
              // local name already recorded as schema vocabulary, passes.
              if (declaration.type === 'Identifier') {
                const kind = bindings.get(declaration.name)
                if (kind === 'schema' || kind === 'vocabulary') break
              }
              const verdict = verdictOf(declaration)
              if (verdict !== 'schema') reportExport(declaration, verdict, nameFallback)
            }
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
                judgeDeclaration(statement.declaration, 'an export')
                break
              }
              // `export { x }` (no source) — the local binding decides the verdict.
              for (const specifier of statement.specifiers) {
                if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') continue
                const kind = bindings.get(specifier.local.name)
                if (kind === 'schema' || kind === 'vocabulary') continue
                if (importedBindings.has(specifier.local.name)) {
                  reportReexport(specifier, `the imported binding ${specifier.local.name}`)
                  continue
                }
                reportExport(
                  specifier,
                  'other',
                  specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.local.name,
                )
              }
              break
            case 'ExportDefaultDeclaration': {
              judgeDeclaration(statement.declaration, 'a default export')
              break
            }
          }
        }
      },
    }
  },
})
