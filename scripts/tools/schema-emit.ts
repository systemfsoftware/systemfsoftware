#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Emits a `schema` cell from a declaration that carries no source text.
 *
 * The `schema` role is the one where a declaration language is not an invention: a schema
 * cell already *is* a description of data, so the declaration is the same description in
 * JSON and the emitter is its pretty-printer. Every construct below names a Schema
 * combinator - `struct`, `union`, `literal`, `record`, `optional`, `suspend`, `brand` - and
 * not one of them names a TypeScript AST node kind. That is the test the `executor` role
 * failed: there, `read`/`call`/`yield`/`cond` were member-expression, call, yield and
 * conditional under new names, so covering the role meant serialising an AST.
 *
 * What this emitter refuses, by name rather than by crashing:
 *
 * - a field whose value is source text (`code`, `body`, `raw`, `source`, `text`)
 * - a refinement or codec whose function is inline. `Schema.filter` and `Schema.transform`
 *   take function bodies, which a declaration may not carry. The declaration names a
 *   `*.kernel.ts` export instead - the same move the `workflow` role made for its decision,
 *   and permitted because `CELL_IMPORT_TABLE` constrains no edge out of a schema cell.
 * - an in-source test block. `import.meta.vitest` blocks are source text with no field to
 *   hold them; the Definitions place tests outside the cell population, so a cell carrying
 *   one is not emittable until the test moves to a test file.
 */

import { IDENT, isRecord, literal, rejecting } from './render.ts'
import {
  isTypeDeclarationKind,
  renderTypeDeclaration,
  renderTypeExpr,
  type TypeDeclaration,
  type TypeExpr,
} from './type-decl.ts'

const SOURCE_TEXT_FIELDS = ['code', 'body', 'raw', 'source', 'text', 'fn', 'predicate'] as const

type Expr =
  | { readonly ref: string }
  | { readonly value: string | number | boolean }
  | { readonly name: string }
  | { readonly literal: readonly (string | number | boolean)[] }
  | { readonly template: readonly (string | Expr)[] }
  | { readonly struct: Readonly<Record<string, Expr>> }
  | { readonly union: readonly Expr[] }
  | { readonly array: Expr }
  | { readonly optional: Expr }
  | { readonly record: { readonly key: Expr; readonly value: Expr } }
  | { readonly suspend: Expr }
  | { readonly fieldsOf: string }
  | { readonly composeWith: readonly [Expr, Expr] }
  | {
    /** A codec. Both directions name a `*.kernel.ts` export; an inline function is rejected. */
    readonly transform: {
      readonly from: Expr
      readonly to: Expr
      readonly decode: string
      readonly encode: string
      readonly strict?: boolean
    }
  }
  | { readonly encodedOf: Expr }
  | { readonly pipe: readonly [Expr, ...Combinator[]] }
  | { readonly annotate: { readonly of: Expr; readonly annotations: Readonly<Record<string, string>> } }

/** A pipeable refinement. `filter` and `transform` carry a named kernel export, never a function. */
type Combinator =
  | { readonly between: readonly [Expr, Expr] }
  | { readonly greaterThanOrEqualTo: Expr }
  | { readonly lessThanOrEqualTo: Expr }
  | { readonly pattern: string }
  | { readonly brand: string }
  | { readonly int: true }
  | { readonly filter: { readonly by: string; readonly message?: string } }
  | { readonly compose: Expr }
  | { readonly annotations: Readonly<Record<string, string>> }

type Declaration =
  | {
    readonly kind: 'typeId'
    readonly name: string
    readonly symbol: string
    /** Whether the const itself is exported. */
    readonly export?: boolean
    /** Whether the `typeof` alias beside it is exported. */
    readonly exportType?: boolean
  }
  | {
    readonly kind: 'taggedClass' | 'taggedError'
    readonly name: string
    readonly tag: string
    readonly fields: Readonly<Record<string, Expr>> | { readonly fieldsOf: string }
    /** A TypeId this class stamps itself with, as `readonly [Id] = Id`. */
    readonly brand?: string
    readonly export?: boolean
  }
  | {
    readonly kind: 'class'
    readonly name: string
    readonly id: string
    readonly fields: Readonly<Record<string, Expr>> | { readonly fieldsOf: string }
    readonly brand?: string
    readonly export?: boolean
  }
  | {
    readonly kind: 'schema'
    readonly name: string
    readonly value: Expr
    /** An explicit binding type: `const X: Schema.Schema<unknown> = Schema.Any`. */
    readonly annotation?: TypeExpr
    /** `= 1 as const` - narrows an inert scalar to its literal type at the binding. */
    readonly asConst?: boolean
    /**
     * The type alias beside the const. `Type` writes `typeof X.Type`; `schemaType` writes
     * `Schema.Schema.Type<typeof X>`. Both spellings ship in this repo.
     */
    readonly typeAlias?: { readonly form: 'Type' | 'schemaType'; readonly name?: string; readonly export?: boolean }
    readonly export?: boolean
  }
  | { readonly kind: 'typeAlias'; readonly name: string; readonly union: readonly string[]; readonly export?: boolean }
  | { readonly kind: 'reexport'; readonly names: readonly string[] }

interface ImportSpec {
  readonly module: string
  readonly values?: readonly string[]
  readonly types?: readonly string[]
  readonly typeOnly?: boolean
  /** `import { Schema as S }` - the local name this cell binds Schema to. */
  readonly alias?: Readonly<Record<string, string>>
  /**
   * A blank line before this statement, which is how a cell separates its package imports from its
   * relative ones. The formatter preserves an author's single blank line, so it cannot be recovered
   * by re-formatting and has to be declared.
   */
  readonly blankBefore?: boolean
}

export interface SchemaDeclaration {
  readonly role: 'schema'
  /** The local name for Effect's `Schema` namespace in this cell: `S` or `Schema`. */
  readonly namespace?: string
  readonly imports: readonly ImportSpec[]
  readonly declarations: readonly Declaration[]
  readonly doc?: readonly string[]
}

const reject = rejecting('declaration')

/**
 * Rejects a field whose value would be source text.
 *
 * The check reads *declaration* keys, never domain ones. A schema's own field may legitimately
 * be called `code`, `body` or `text` - `S.Struct({ code: S.Number })` is a hook exit status, not
 * an escape hatch - so the keys under `struct`, `fields`, `record` and `annotations` are payload
 * and are skipped, while their values are still walked. Reading a domain name as a declaration
 * field is how a guard rejects a legitimate cell, which is worse than the leak it prevents.
 */
const PAYLOAD_KEYS = new Set(['struct', 'fields', 'record', 'annotations'])

/**
 * `fn` is the one field name that is legitimate in one position and a body in every other: the
 * shared type language keys a function *type* `fn`, and `{ params, returns }` is a signature with
 * nowhere for a body to hide. So the check reads the value rather than the name - a `fn` that is a
 * signature passes, and a `fn` holding anything else is the refinement body this guard exists for.
 */
const isFunctionType = (v: unknown): boolean => isRecord(v) && 'params' in v && 'returns' in v

const assertNoSourceText = (node: unknown, path: string, keysArePayload = false): void => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoSourceText(v, `${path}[${i}]`))
    return
  }
  if (!isRecord(node)) return
  if (!keysArePayload) {
    for (const field of SOURCE_TEXT_FIELDS) {
      if (field in node && !(field === 'fn' && isFunctionType(node[field]))) {
        reject(
          `${path}.${field}: a declaration carries no source text. A refinement or codec body belongs in a ` +
            `*.kernel.ts export named by \`filter: { by }\` or \`transform: { by }\`.`,
        )
      }
    }
  }
  for (const [k, v] of Object.entries(node)) assertNoSourceText(v, `${path}.${k}`, PAYLOAD_KEYS.has(k))
}

/** Renders one expression of the Schema algebra. `ns` is the cell's local Schema alias. */
const renderExpr = (e: Expr, ns: string, path: string): string => {
  if (!isRecord(e)) reject(`${path}: expected an expression object, got ${JSON.stringify(e)}`)
  if ('ref' in e) {
    if (typeof e.ref !== 'string' || !IDENT.test(e.ref)) reject(`${path}.ref: expected a combinator name`)
    return `${ns}.${e.ref}`
  }
  if ('name' in e) {
    if (typeof e.name !== 'string' || !IDENT.test(e.name)) reject(`${path}.name: expected an identifier`)
    return e.name
  }
  if ('value' in e) {
    const v: unknown = (e as { value: unknown }).value
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return literal(v)
    return reject(`${path}.value: expected a string, number or boolean operand`)
  }
  if ('literal' in e) {
    if (!Array.isArray(e.literal) || e.literal.length === 0) reject(`${path}.literal: expected a non-empty array`)
    return `${ns}.Literal(${e.literal.map(literal).join(', ')})`
  }
  if ('template' in e) {
    if (!Array.isArray(e.template)) reject(`${path}.template: expected an array`)
    const parts = e.template.map((p, i) =>
      typeof p === 'string' ? literal(p) : renderExpr(p, ns, `${path}.template[${i}]`)
    )
    return `${ns}.TemplateLiteral(${parts.join(', ')})`
  }
  if ('struct' in e) {
    if (!isRecord(e.struct)) reject(`${path}.struct: expected an object of fields`)
    return `${ns}.Struct({ ${renderFields(e.struct as Record<string, Expr>, ns, `${path}.struct`)} })`
  }
  if ('union' in e) {
    if (!Array.isArray(e.union) || e.union.length < 2) reject(`${path}.union: expected at least two members`)
    return `${ns}.Union(${e.union.map((m, i) => renderExpr(m, ns, `${path}.union[${i}]`)).join(', ')})`
  }
  if ('array' in e) return `${ns}.Array(${renderExpr(e.array, ns, `${path}.array`)})`
  if ('optional' in e) return `${ns}.optional(${renderExpr(e.optional, ns, `${path}.optional`)})`
  if ('record' in e) {
    if (!isRecord(e.record) || !('key' in e.record) || !('value' in e.record)) {
      reject(`${path}.record: expected { key, value }`)
    }
    const r = e.record as { key: Expr; value: Expr }
    return `${ns}.Record({ key: ${renderExpr(r.key, ns, `${path}.record.key`)}, value: ${
      renderExpr(r.value, ns, `${path}.record.value`)
    } })`
  }
  if ('suspend' in e) return `${ns}.suspend(() => ${renderExpr(e.suspend, ns, `${path}.suspend`)})`
  if ('composeWith' in e) {
    const c = (e as { composeWith: readonly Expr[] }).composeWith
    if (!Array.isArray(c) || c.length !== 2) reject(`${path}.composeWith: expected [from, to]`)
    return `${ns}.compose(${renderExpr(c[0]!, ns, `${path}.composeWith[0]`)}, ${
      renderExpr(c[1]!, ns, `${path}.composeWith[1]`)
    })`
  }
  if ('transform' in e) {
    const t = (e as { transform: Record<string, unknown> }).transform
    if (!isRecord(t)) reject(`${path}.transform: expected { from, to, decode, encode }`)
    for (const side of ['decode', 'encode'] as const) {
      if (typeof t[side] !== 'string' || !IDENT.test(t[side] as string)) {
        reject(
          `${path}.transform.${side}: expected the name of an imported codec function. A codec direction is a ` +
            `function body: export it from a *.kernel.ts and name it here.`,
        )
      }
    }
    if (!isRecord(t.from) || !isRecord(t.to)) reject(`${path}.transform: expected { from, to } schemas`)
    const strict = t.strict === false ? ', strict: false' : ''
    return `${ns}.transform(${renderExpr(t.from as Expr, ns, `${path}.transform.from`)}, ${
      renderExpr(t.to as Expr, ns, `${path}.transform.to`)
    }, { decode: ${t.decode as string}, encode: ${t.encode as string}${strict} })`
  }
  if ('fieldsOf' in e) {
    if (typeof e.fieldsOf !== 'string' || !IDENT.test(e.fieldsOf)) reject(`${path}.fieldsOf: expected an identifier`)
    return `${e.fieldsOf}.fields`
  }
  if ('encodedOf' in e) return `${ns}.encodedSchema(${renderExpr(e.encodedOf, ns, `${path}.encodedOf`)})`
  if ('annotate' in e) {
    const a = e.annotate as { of: Expr; annotations: Record<string, string> }
    if (!isRecord(a) || !('of' in a) || !isRecord(a.annotations)) {
      reject(`${path}.annotate: expected { of, annotations }`)
    }
    return `${renderExpr(a.of, ns, `${path}.annotate.of`)}.annotations({ ${renderAnnotations(a.annotations)} })`
  }
  if ('pipe' in e) {
    if (!Array.isArray(e.pipe) || e.pipe.length < 2) reject(`${path}.pipe: expected a subject and at least one step`)
    const [subject, ...steps] = e.pipe as [Expr, ...Combinator[]]
    const rendered = steps.map((s, i) => renderCombinator(s, ns, `${path}.pipe[${i + 1}]`))
    return `${renderExpr(subject, ns, `${path}.pipe[0]`)}.pipe(${rendered.join(', ')})`
  }
  return reject(`${path}: unknown expression ${JSON.stringify(Object.keys(e))}`)
}

const renderAnnotations = (a: Readonly<Record<string, string>>): string =>
  Object.entries(a).map(([k, v]) => `${k}: ${literal(v)}`).join(', ')

const renderCombinator = (c: Combinator, ns: string, path: string): string => {
  if (!isRecord(c)) reject(`${path}: expected a combinator object`)
  if ('between' in c) {
    const b = c.between as readonly [Expr, Expr]
    if (!Array.isArray(b) || b.length !== 2) reject(`${path}.between: expected [min, max]`)
    return `${ns}.between(${renderExpr(b[0], ns, `${path}.between[0]`)}, ${renderExpr(b[1], ns, `${path}.between[1]`)})`
  }
  if ('greaterThanOrEqualTo' in c) {
    return `${ns}.greaterThanOrEqualTo(${renderExpr(c.greaterThanOrEqualTo, ns, `${path}.greaterThanOrEqualTo`)})`
  }
  if ('lessThanOrEqualTo' in c) {
    return `${ns}.lessThanOrEqualTo(${renderExpr(c.lessThanOrEqualTo, ns, `${path}.lessThanOrEqualTo`)})`
  }
  if ('pattern' in c) {
    if (typeof c.pattern !== 'string') reject(`${path}.pattern: expected a regex source string`)
    return `${ns}.pattern(${c.pattern})`
  }
  if ('brand' in c) {
    if (typeof c.brand !== 'string') reject(`${path}.brand: expected a brand name`)
    return `${ns}.brand(${literal(c.brand)})`
  }
  if ('compose' in c) return `${ns}.compose(${renderExpr(c.compose, ns, `${path}.compose`)})`
  if ('annotations' in c) {
    if (!isRecord(c.annotations)) reject(`${path}.annotations: expected an object`)
    return `${ns}.annotations({ ${renderAnnotations(c.annotations as Record<string, string>)} })`
  }
  if ('filter' in c) {
    const f = c.filter as { by?: unknown; message?: unknown }
    if (!isRecord(f) || typeof f.by !== 'string' || !IDENT.test(f.by)) {
      reject(
        `${path}.filter.by: expected the name of an imported predicate. A refinement predicate is a ` +
          `function body: export it from a *.kernel.ts and name it here.`,
      )
    }
    const by = (f as { by: string }).by
    if (f.message !== undefined && typeof f.message !== 'string') reject(`${path}.filter.message: expected a string`)
    return f.message === undefined
      ? `${ns}.filter(${by})`
      : `${ns}.filter(${by}, { message: () => ${literal(f.message as string)} })`
  }
  return reject(`${path}: unknown combinator ${JSON.stringify(Object.keys(c))}`)
}

const renderFields = (fields: Readonly<Record<string, Expr>>, ns: string, path: string): string =>
  Object.entries(fields)
    .map(([k, v]) => {
      if (!IDENT.test(k)) reject(`${path}: field name ${JSON.stringify(k)} is not an identifier`)
      return `${k}: ${renderExpr(v, ns, `${path}.${k}`)}`
    })
    .join(', ')

const renderFieldsArg = (
  fields: Readonly<Record<string, Expr>> | { readonly fieldsOf: string },
  ns: string,
  path: string,
): string => {
  if (isRecord(fields) && 'fieldsOf' in fields && typeof fields.fieldsOf === 'string') {
    if (!IDENT.test(fields.fieldsOf)) reject(`${path}.fieldsOf: expected an identifier`)
    return `${fields.fieldsOf}.fields`
  }
  const entries = Object.entries(fields as Record<string, Expr>)
  return entries.length === 0 ? '{}' : `{ ${renderFields(fields as Record<string, Expr>, ns, path)} }`
}

const renderImport = (spec: ImportSpec, index: number): string => {
  if (typeof spec.module !== 'string' || spec.module === '') reject(`imports[${index}].module: expected a specifier`)
  const values = (spec.values ?? []).map((v) => {
    const renamed = spec.alias?.[v]
    return renamed === undefined ? v : `${v} as ${renamed}`
  })
  const types = (spec.types ?? []).map((t) => {
    const renamed = spec.alias?.[t]
    const named = renamed === undefined ? t : `${t} as ${renamed}`
    return spec.typeOnly === true ? named : `type ${named}`
  })
  const names = [...values, ...types]
  if (names.length === 0) reject(`imports[${index}]: names nothing`)
  const prefix = spec.typeOnly === true ? 'import type' : 'import'
  return `${prefix} { ${names.join(', ')} } from '${spec.module}'`
}

const exported = (flag: boolean | undefined): string => flag === false ? '' : 'export '

/** The repository's `dprint` line width. The emitter is not a formatter, but a call it hands over
 * already broken stays broken, while a one-liner over the width gets broken at `extends` instead of
 * at the arguments. Pre-breaking here is what makes the round-trip byte-exact. */
const LINE_WIDTH = 120

/**
 * Renders a `class X extends Ctor(args) { … }` declaration, choosing the argument layout the
 * formatter would keep rather than the one it would rewrite.
 */
const classBody = (head: string, args: readonly string[], brand: string | undefined): string => {
  const oneLine = `${head}(${args.join(', ')})`
  const opened = oneLine.length + (brand === undefined ? 3 : 2) <= LINE_WIDTH
    ? oneLine
    : `${head}(\n${args.map((a) => `  ${a},`).join('\n')}\n)`
  return brand === undefined ? `${opened} {}` : `${opened} {\n  readonly [${brand}] = ${brand}\n}`
}

const renderDeclaration = (d: Declaration, ns: string, index: number): string => {
  const path = `declarations[${index}]`
  // A schema cell may carry plain type declarations beside its schemas - several in this repo are
  // type modules with no Schema call at all. Those go to the shared type language rather than being
  // re-invented here, which is also what keeps the two emitters from disagreeing about a signature.
  if (isTypeDeclarationKind((d as { kind: unknown }).kind)) {
    return renderTypeDeclaration(d as unknown as TypeDeclaration, path)
  }
  switch (d.kind) {
    case 'typeId': {
      if (!IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      if (typeof d.symbol !== 'string' || d.symbol === '') reject(`${path}.symbol: expected the symbol description`)
      const constLine = `${d.export === true ? 'export ' : ''}const ${d.name}: unique symbol = Symbol.for(${
        literal(d.symbol)
      })`
      const typeLine = `${d.exportType === true ? 'export ' : ''}type ${d.name} = typeof ${d.name}`
      return `${constLine}\n${typeLine}`
    }
    case 'taggedClass':
    case 'taggedError': {
      if (!IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      const ctor = d.kind === 'taggedClass' ? 'TaggedClass' : 'TaggedError'
      const fields = renderFieldsArg(d.fields, ns, `${path}.fields`)
      return classBody(
        `${exported(d.export)}class ${d.name} extends ${ns}.${ctor}<${d.name}>()`,
        [literal(d.tag), fields],
        d.brand,
      )
    }
    case 'class': {
      if (!IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      const fields = renderFieldsArg(d.fields, ns, `${path}.fields`)
      return classBody(
        `${exported(d.export)}class ${d.name} extends ${ns}.Class<${d.name}>(${literal(d.id)})`,
        [fields],
        d.brand,
      )
    }
    case 'schema': {
      if (!IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      const value = renderExpr(d.value, ns, `${path}.value`)
      // An annotation widens a schema at its binding - `Schema.Schema<unknown> = Schema.Any` - and is
      // load-bearing for the consumer, so it is declared rather than inferred away.
      const annotation = d.annotation === undefined
        ? ''
        : `: ${renderTypeExpr(d.annotation, `${path}.annotation`)}`
      const narrowed = d.asConst === true ? `${value} as const` : value
      const lines = [`${exported(d.export)}const ${d.name}${annotation} = ${narrowed}`]
      if (d.typeAlias !== undefined) {
        const aliasName = d.typeAlias.name ?? d.name
        const rhs = d.typeAlias.form === 'Type'
          ? `typeof ${d.name}.Type`
          : `${ns}.Schema.Type<typeof ${d.name}>`
        if (d.typeAlias.form !== 'Type' && d.typeAlias.form !== 'schemaType') {
          reject(`${path}.typeAlias.form: expected 'Type' or 'schemaType'`)
        }
        lines.push(`${exported(d.typeAlias.export)}type ${aliasName} = ${rhs}`)
      }
      return lines.join('\n')
    }
    case 'typeAlias': {
      if (!IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
      if (!Array.isArray(d.union) || d.union.length === 0) reject(`${path}.union: expected at least one member`)
      return `${exported(d.export)}type ${d.name} = ${d.union.join(' | ')}`
    }
    case 'reexport': {
      if (!Array.isArray(d.names) || d.names.length === 0) reject(`${path}.names: expected at least one name`)
      return `export { ${d.names.join(', ')} }`
    }
    default:
      return reject(`${path}.kind: unknown declaration kind ${JSON.stringify((d as { kind: unknown }).kind)}`)
  }
}

export const parseSchema = (raw: unknown): SchemaDeclaration => {
  if (!isRecord(raw)) reject('the declaration must be an object')
  const rec = raw as Record<string, unknown>
  assertNoSourceText(rec, 'declaration')
  if (rec.role !== 'schema') reject(`role: expected "schema", got ${JSON.stringify(rec.role)}`)
  if (!Array.isArray(rec.imports)) reject('imports: expected an array')
  const declarations: unknown = rec.declarations
  if (!Array.isArray(declarations) || declarations.length === 0) {
    reject('declarations: expected a non-empty array - a schema cell that declares nothing is not a cell')
  }
  // A namespace is required only where a schema construct actually uses one. Several `.schema.ts`
  // cells in this repo declare types and never call Schema at all, and demanding a binding they do
  // not have would reject a legitimate cell.
  const usesSchema = (declarations as readonly unknown[]).some((d) =>
    !isTypeDeclarationKind(isRecord(d) ? d.kind : undefined)
  )
  if (usesSchema && (typeof rec.namespace !== 'string' || !IDENT.test(rec.namespace))) {
    reject('namespace: expected the local name this cell binds Effect\'s Schema to, e.g. "S" or "Schema"')
  }
  if ('inSourceTest' in rec || 'vitest' in rec) {
    reject(
      'inSourceTest: an `import.meta.vitest` block is source text and has no field here. The Definitions place ' +
        'tests outside the cell population: move the block to a test file, then emit the cell.',
    )
  }
  return rec as unknown as SchemaDeclaration
}

export const emitSchema = (decl: SchemaDeclaration): string => {
  // `Schema` is only a rendering prefix; a type-only cell never reaches a branch that uses it.
  const ns = decl.namespace ?? 'Schema'
  const imports = decl.imports
    .map((spec, i) => `${spec.blankBefore === true && i > 0 ? '\n' : ''}${renderImport(spec, i)}`)
    .join('\n')
  // A blank doc line is ` *`, never ` * `: the formatter strips the trailing space, so emitting one
  // makes the round-trip differ by exactly that byte.
  const docLine = (l: string): string => l === '' ? ' *' : ` * ${l}`
  const doc = decl.doc === undefined ? '' : `/**\n${decl.doc.map(docLine).join('\n')}\n */\n`
  // Declarations are separated by a blank line: `dprint` preserves the author's blank lines between
  // statements, so joining them tightly would differ from the file on disk by exactly those bytes.
  // Declarations are blank-line separated unless one asks to sit against its predecessor, which is
  // how a cell groups a union with the members it unions. `dprint` preserves either.
  const body = decl.declarations
    .map((d, i) =>
      `${i > 0 ? ((d as { tight?: boolean }).tight === true ? '\n' : '\n\n') : ''}${renderDeclaration(d, ns, i)}`
    )
    .join('')
  return imports === '' ? `${doc}${body}\n` : `${imports}\n\n${doc}${body}\n`
}

const main = async (): Promise<void> => {
  const [declPath, outPath] = Deno.args
  if (declPath === undefined) {
    console.error('usage: schema-emit.ts <declaration.schema.decl.json> [out.schema.ts]')
    Deno.exitCode = 1
    return
  }
  const raw: unknown = JSON.parse(await Deno.readTextFile(declPath))
  const emitted = emitSchema(parseSchema(raw))
  if (outPath === undefined) console.log(emitted)
  else {
    await Deno.writeTextFile(outPath, emitted)
    console.log(`emitted ${outPath} (${emitted.length} bytes) from ${declPath}`)
  }
}

if (import.meta.main) await main()
