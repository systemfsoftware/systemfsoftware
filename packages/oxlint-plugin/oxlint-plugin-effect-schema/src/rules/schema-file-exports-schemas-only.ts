import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
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
  EFFECT_CARRIER_EXPORT_ACTUAL,
  EFFECT_CARRIER_EXPORT_EXPECTED,
  EFFECT_CARRIER_EXPORT_FIX,
  meta,
  MISSING_ANNOTATION_EXPORT_ACTUAL,
  MISSING_ANNOTATION_EXPORT_EXPECTED,
  MISSING_ANNOTATION_EXPORT_FIX,
  NON_SCHEMA_EXPORT_ACTUAL,
  NON_SCHEMA_EXPORT_EXPECTED,
  NON_SCHEMA_EXPORT_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  SCHEMA_FILE_SUFFIX,
} from './schema-file-exports-schemas-only.config.js'

export type MessageIds =
  | 'codecExport'
  | 'nonSchemaExport'
  | 'missingAnnotationExport'
  | 'effectCarrierExport'
  | 'reexportFromSchemaFile'

/** The two annotated slots an operation verdict reads off a function. */
interface FunctionNode {
  readonly params: readonly unknown[]
  readonly returnType?: unknown
}

/** The refusal verdicts — every `ExportVerdict` that reports. */
type ExportRefusal = 'codec' | 'other' | 'missingAnnotations' | 'effectCarrier'

type ExportVerdict = 'schema' | 'operation' | ExportRefusal

type FunctionVerdict = 'operation' | Exclude<ExportRefusal, 'codec'>

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const isFunctionNode = (node: ESTree.Node): node is ESTree.Node & FunctionNode =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'TSDeclareFunction'

/** A parameter or return slot that may carry a `TSTypeAnnotation`. */
interface TypeAnnotationHolder {
  readonly typeAnnotation: ESTree.Node | null | undefined
}

const holdsTypeAnnotation = (value: unknown): value is TypeAnnotationHolder =>
  value !== null && typeof value === 'object' && 'typeAnnotation' in value

/** The `TSTypeAnnotation` a parameter or return slot carries, or null. */
const annotationIn = (slot: unknown): ESTree.Node | null => {
  if (!holdsTypeAnnotation(slot)) return null
  return slot.typeAnnotation ?? null
}

/** The type node inside a `TSTypeAnnotation`, or the annotation itself. */
const typeNodeIn = (annotation: unknown): ESTree.Node | null => {
  if (!isNode(annotation)) return null
  return annotation.type === 'TSTypeAnnotation' ? annotation.typeAnnotation : annotation
}

/**
 * The root identifier of a declared annotation: `Position` in `Position`, `LineStarts`
 * in `LineStarts`, `Effect` in `Effect.Effect<A>` and in `Effect` spelled through a
 * qualified namespace. Only the root name decides — the same-file bindings map is
 * keyed by it, and a generic's arguments never turn a foreign name into a same-file one.
 */
const rootNameIn = (value: unknown): string | null => {
  if (!isNode(value)) return null
  if (value.type === 'Identifier') return value.name
  if (value.type === 'TSQualifiedName') return rootNameIn(value.left)
  if (value.type === 'TSTypeReference') return rootNameIn(value.typeName)
  return null
}

/** The roots whose names denote a live computation rather than data. */
const EFFECT_CARRIER_ROOTS: Readonly<Record<string, true>> = {
  Effect: true,
  Stream: true,
  Layer: true,
}

/**
 * The call signatures a declarator's type annotation declares. A `dual` operation
 * wears its signature there — a function type `(self: T, ...) => R`, or a type
 * literal of overloads `{ <B>(f: () => B): (self: T) => R; <B>(self: T, f: () => B): R }`.
 * Its initializer is a `dual(...)` call whose result the rule cannot see, so the
 * annotation is the only place the operation's signature is declared. An annotation
 * of any other shape declares no call signature.
 */
const callSignaturesIn = (annotation: unknown): readonly FunctionNode[] => {
  const node = typeNodeIn(annotation)
  if (node === null) return []
  if (node.type === 'TSFunctionType') return [node]
  if (node.type === 'TSTypeLiteral') {
    return node.members.flatMap((member) => (member.type === 'TSCallSignatureDeclaration' ? [member] : []))
  }
  return []
}

/**
 * True when an annotation's return position names a live computation. A curried
 * signature returns a function type, so the walk follows it — a signature returning
 * `(self: T) => Effect<A>` returns a carrier exactly as one returning `Effect<A>` does.
 */
const annotationReturnsCarrier = (annotation: unknown): boolean => {
  const node = typeNodeIn(annotation)
  if (node === null) return false
  if (node.type === 'TSFunctionType') return annotationReturnsCarrier(node.returnType)
  const root = rootNameIn(node)
  return root !== null && EFFECT_CARRIER_ROOTS[root] === true
}

/**
 * True when any position in an annotation names a same-file type. A function type is
 * walked into, so a curried return `(self: T) => R` names `T` and `R` just as a flat
 * signature does.
 */
const annotationNamesSameFileType = (
  annotation: unknown,
  isSameFileTypeName: (name: string) => boolean,
): boolean => {
  const node = typeNodeIn(annotation)
  if (node === null) return false
  if (node.type === 'TSFunctionType') {
    return (
      node.params.some((param) => annotationNamesSameFileType(annotationIn(param), isSameFileTypeName)) ||
      annotationNamesSameFileType(node.returnType, isSameFileTypeName)
    )
  }
  const root = rootNameIn(node)
  return root !== null && isSameFileTypeName(root)
}

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
 * A `*.schema.ts` file may export its own schemas and the operations homed by
 * them. This is the converse of `schema-declaration-location`: that rule sends
 * every schema declaration into `*.schema.ts` files, this one keeps every
 * other value and every re-export out of them. The declaration / use line it
 * draws is the same one its sibling draws — `isSchemaDeclaration`,
 * `SCHEMA_USE_MEMBERS` and `schemaMemberOf` are imported from it, never
 * re-derived.
 *
 * Allowed surface: a module-scope class extending a Schema factory, a
 * module-scope const initialized to a `Schema.<member>(...)` combinator, the
 * vocabulary the schemas are built from — exported type aliases / interfaces
 * (erased at runtime, they are the type side of a schema) and exported enums
 * (the literal domain of the file's schemas) — and an operation whose declared
 * parameter or return type names one of those same-file types, with a return
 * that names no `Effect`, `Stream` or `Layer` carrier. An operation declares its
 * signature one of two ways, and the same test judges both: on the function
 * itself (an exported function, arrow or overload declaration), or in a const's
 * declarator type annotation as a function type or a type literal of call
 * signatures — the `dual` shape Effect's pipeable operations wear, whose
 * initializer is a call the rule cannot see.
 *
 * Reported: a function with no explicit annotations (it names no type), a const
 * a call initializes when no declarator annotation names its type, a function
 * returning an Effect carrier (a live computation belongs to a handle, service
 * or workflow), a function whose annotations name only foreign or primitive
 * types, every other exported value (a codec const, a plain class, a
 * destructured binding, an `export { x }` of a non-schema local), and every
 * re-export form — `export * from`, `export * as ns from`, `export { x }
 * from` (value or type), and `export { x }` of an imported binding, which is a
 * re-export dressed as a local name.
 */
export const schemaFileExportsSchemasOnly = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!basename.endsWith(SCHEMA_FILE_SUFFIX)) return {}
    const getScope = context.sourceCode.getScope
    return {
      Program(node: ESTree.Program) {
        // Pass 1 — the local names that arrived through an import, so an
        // `export { x }` of an imported binding reads as the re-export it is.
        const importedBindings = new Set<string>()
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier') {
              importedBindings.add(specifier.local.name)
            } else if (specifier.type === 'ImportSpecifier') {
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
                  isSchemaDeclaration(declaration.superClass, getScope) ? 'schema' : 'value',
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
                    isSchemaDeclaration(declarator.init, getScope) ||
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

        // The operation verdict — KTD3. An exported function is homed by a type this
        // file declares when its explicit parameter or return annotation's ROOT name is
        // a schema, type alias, interface or enum bound at module scope here (the map
        // pass 2 built, never a scope query): `Position` in `Position`, `Shape` in a
        // union alias, `Effect` in `Effect.Effect<A>`. The return annotation is read
        // first — an Effect, Stream or Layer carrier is refused whatever else the
        // signature names, because a live computation is not a schema file's operation,
        // while error DATA like `PlatformError` is a type, not a carrier.
        const isSameFileTypeName = (name: string): boolean => {
          const kind = bindings.get(name)
          return kind === 'schema' || kind === 'vocabulary'
        }
        const functionVerdictOf = (fn: FunctionNode): FunctionVerdict => {
          const returnAnnotation = annotationIn(fn.returnType)
          const returnRoot = rootNameIn(typeNodeIn(returnAnnotation))
          if (returnRoot !== null && EFFECT_CARRIER_ROOTS[returnRoot] === true) return 'effectCarrier'
          const annotations = [returnAnnotation, ...fn.params.map(annotationIn)]
          if (annotations.every((annotation) => annotation === null)) return 'missingAnnotations'
          const roots = annotations.map((annotation) => rootNameIn(typeNodeIn(annotation)))
          return roots.some((root) => root !== null && isSameFileTypeName(root)) ? 'operation' : 'other'
        }

        // The declarator-annotation verdict — the second KTD3 shape. A `dual` const
        // declares its call signatures in the declarator's type annotation, and its
        // initializer is a call whose result the rule cannot see. Judged from the
        // annotation alone: an Effect carrier in any signature's return refuses, a
        // same-file name in any parameter or return accepts, and an annotation naming
        // neither is an ordinary foreign value.
        const annotatedVerdictOf = (annotation: unknown): FunctionVerdict | null => {
          const signatures = callSignaturesIn(annotation)
          if (signatures.length === 0) return null
          if (signatures.some((signature) => annotationReturnsCarrier(signature.returnType))) return 'effectCarrier'
          return signatures.some(
              (signature) =>
                signature.params.some((param) =>
                  annotationNamesSameFileType(annotationIn(param), isSameFileTypeName)
                ) ||
                annotationNamesSameFileType(signature.returnType, isSameFileTypeName),
            )
            ? 'operation'
            : 'other'
        }

        // The verdict for an exported const: the declarator's annotation first — a
        // `dual` operation declares its signature there — then the initializer's own
        // shape. A call initializer with no annotation names no type the rule can read,
        // so the remedy is the missing-annotation one, not the foreign-type one.
        const verdictOfDeclarator = (annotation: ESTree.Node | null, init: ESTree.Node | null): ExportVerdict => {
          const annotated = annotatedVerdictOf(annotation)
          if (annotated !== null) return annotated
          const verdict = verdictOf(init)
          if (verdict === 'other' && annotation === null && init !== null && init.type === 'CallExpression') {
            return 'missingAnnotations'
          }
          return verdict
        }

        // Pass 3 — the verdicts an exported initializer can earn: a schema declaration
        // (allowed), an operation homed by a same-file type (allowed), a use combinator
        // (a codec — banned, with its specific remedy), or any other value (banned).
        const verdictOf = (init: ESTree.Node | null): ExportVerdict => {
          if (init !== null && isFunctionNode(init)) return functionVerdictOf(init)
          // `export const X = Y` where Y is a name declared (not imported) in this file as
          // schema vocabulary — a local alias, not a re-export. Same resolution the
          // default-export arm gives identifiers.
          if (init !== null && init.type === 'Identifier' && bindings.get(init.name) === 'schema') {
            return 'schema'
          }
          if (isSchemaDeclaration(init, getScope)) return 'schema'
          const member = schemaMemberOf(init, getScope)
          if (
            member !== null &&
            member.type === 'MemberExpression' &&
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

        const reportExport = (target: ESTree.Node, verdict: ExportRefusal, name: string): void => {
          if (verdict === 'missingAnnotations') {
            context.report({
              node: target,
              messageId: 'missingAnnotationExport',
              data: {
                name,
                expected: MISSING_ANNOTATION_EXPORT_EXPECTED,
                actual: MISSING_ANNOTATION_EXPORT_ACTUAL,
                fix: MISSING_ANNOTATION_EXPORT_FIX,
              },
            })
            return
          }
          if (verdict === 'effectCarrier') {
            context.report({
              node: target,
              messageId: 'effectCarrierExport',
              data: {
                name,
                expected: EFFECT_CARRIER_EXPORT_EXPECTED,
                actual: EFFECT_CARRIER_EXPORT_ACTUAL,
                fix: EFFECT_CARRIER_EXPORT_FIX,
              },
            })
            return
          }
          if (verdict === 'codec') {
            context.report({
              node: target,
              messageId: 'codecExport',
              data: { name, expected: CODEC_EXPORT_EXPECTED, actual: CODEC_EXPORT_ACTUAL, fix: CODEC_EXPORT_FIX },
            })
            return
          }
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
              if (!isSchemaDeclaration(declaration.superClass, getScope)) {
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
                const verdict = verdictOfDeclarator(declarator.id.typeAnnotation ?? null, declarator.init)
                if (verdict !== 'schema' && verdict !== 'operation') {
                  reportExport(declarator.id, verdict, declarator.id.name)
                }
              }
              break
            case 'FunctionDeclaration': {
              const verdict = functionVerdictOf(declaration)
              if (verdict !== 'operation') {
                reportExport(declaration.id ?? declaration, verdict, declaration.id?.name ?? nameFallback)
              }
              break
            }
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
              if (verdict !== 'schema' && verdict !== 'operation') {
                reportExport(declaration, verdict, nameFallback)
              }
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
