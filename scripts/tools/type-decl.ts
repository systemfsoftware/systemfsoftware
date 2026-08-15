#!/usr/bin/env -S deno run --allow-read
/**
 * A declaration language for TypeScript *types*, shared by the emitters that need one.
 *
 * The line this module sits on is the brief's own: a declaration carries "no TypeScript
 * statement, expression or function body". A type is none of the three. `readonly cwd: string`
 * describes; it does not compute. So where the `executor` language failed - its `read`, `call`,
 * `yield` and `cond` were a member expression, a call, a yield and a conditional under new
 * names, and covering the role meant serialising a program - a type language serialises a
 * description that was already declarative before anyone wrote it down.
 *
 * A function *type* is inside that line and a function *body* is outside it: `(m: string) =>
 * void` is a signature, while `(m) => notify(m)` is code. The parser enforces exactly that -
 * `fn` takes parameters and a return type, and there is no field for a body.
 *
 * Used by the `shape` emitter, whose cells are interfaces outright, and by the `schema` emitter
 * for the cells that mix Effect Schema with plain type declarations.
 */

import { docBlock, IDENT, isRecord, literal, rejecting } from './render.ts'

const SOURCE_TEXT_FIELDS = ['code', 'body', 'raw', 'source', 'text', 'fn_body', 'statements'] as const

export type TypeExpr =
  /** A bare type reference: `string`, `unknown`, `HookSession`. */
  | { readonly ref: string }
  /** `Foo<Bar, Baz>`. */
  | { readonly generic: { readonly of: string; readonly args: readonly TypeExpr[] } }
  | { readonly union: readonly TypeExpr[] }
  | { readonly intersection: readonly TypeExpr[] }
  | { readonly array: TypeExpr }
  | { readonly readonlyArray: TypeExpr }
  /** `T[]` rather than `Array<T>`. Both spellings exist in the tree, so the declaration picks. */
  | { readonly arrayOf: TypeExpr }
  /** `readonly T[]` rather than `ReadonlyArray<T>`. */
  | { readonly readonlyArrayOf: TypeExpr }
  | { readonly tuple: readonly TypeExpr[] }
  /** `readonly [A, ...ReadonlyArray<B>]` - the non-empty tuple a total dispatch returns. */
  | { readonly readonlyTuple: readonly TypeExpr[]; readonly rest?: TypeExpr }
  /** A literal type: `'info'`, `42`, `true`. */
  | { readonly literal: string | number | boolean }
  /** An inline object type. `multiline` pre-breaks it, which the formatter then preserves. */
  | { readonly object: readonly Member[]; readonly multiline?: boolean }
  /** A function *type* - parameters and a return, never a body. Generic where `typeParams` is set. */
  | {
    readonly fn: {
      readonly typeParams?: readonly TypeParam[]
      readonly params: readonly Param[]
      readonly returns: TypeExpr
    }
  }
  /** `InputEvent['source']`, a tuple position `Parameters<F>[0]`, or a type index `typeof EVENTS[number]`. */
  | { readonly indexed: { readonly of: TypeExpr; readonly index: string | number | TypeExpr } }
  /** `typeof X`. */
  | { readonly typeOf: string }
  /**
   * `unique symbol`, which is a form rather than a name.
   *
   * It cannot be a `ref`: TypeScript accepts `unique symbol` only as the annotation of a `const`
   * whose initializer is a direct `Symbol()` or `Symbol.for()` call, so it is not a type that can
   * appear wherever a type can. Giving it a node keeps the identifier check on `ref` strict — a name
   * with a space in it is a defect everywhere else — instead of loosening that check to admit one
   * special case.
   */
  | { readonly uniqueSymbol: true }
  | { readonly keyOf: TypeExpr }

export interface Member {
  readonly name: string
  readonly type: TypeExpr
  readonly optional?: boolean
  /** Members default to `readonly`, which is the convention every shape cell in this repo follows. */
  readonly mutable?: boolean
  /** `?: T | undefined` rather than `?: T`, which `exactOptionalPropertyTypes` makes distinct. */
  readonly orUndefined?: boolean
  /**
   * `stat(): Promise<Stat>` rather than `stat: () => Promise<Stat>`. The two texts declare the
   * same signature and the formatter converts neither into the other, so the cell's spelling is
   * the declaration's to state. Requires an `fn` type.
   */
  readonly method?: boolean
  /**
   * A computed key - `readonly [WorkerTypeId]: WorkerTypeId`. The name is a reference to a unique
   * symbol rather than a property name, which is why it cannot go through the identifier check.
   */
  readonly computed?: boolean
  readonly doc?: readonly string[]
}

export interface Param {
  readonly name: string
  readonly type: TypeExpr
  readonly optional?: boolean
}

/**
 * A type parameter: `A`, `A extends string`, `A = never`.
 *
 * A generic signature is a declaration rather than a computation — `<A, E>(effect: Effect<A, E>) => A`
 * names types and returns one, and there is nowhere in it for a statement to hide. So it sits inside
 * the line this language draws, and a cell whose whole content is a generic type alias is declarable
 * rather than an exception carved out of the definition.
 */
export interface TypeParam {
  readonly name: string
  readonly extends?: TypeExpr
  readonly default?: TypeExpr
}

export type TypeDeclaration =
  | {
    readonly kind: 'interface'
    readonly name: string
    readonly members: readonly Member[]
    readonly extends?: readonly string[]
    readonly typeParams?: readonly TypeParam[]
    readonly export?: boolean
    readonly doc?: readonly string[]
  }
  | {
    readonly kind: 'type'
    readonly name: string
    readonly value: TypeExpr
    readonly typeParams?: readonly TypeParam[]
    readonly export?: boolean
    readonly doc?: readonly string[]
  }

/** Type names carry generics and qualifiers, so this is deliberately looser than an identifier. */
const TYPE_NAME = /^[A-Za-z_$][A-Za-z0-9_$.]*$/

const reject = rejecting('declaration')

export const assertNoTypeSourceText = (node: unknown, path: string): void => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoTypeSourceText(v, `${path}[${i}]`))
    return
  }
  if (!isRecord(node)) return
  for (const field of SOURCE_TEXT_FIELDS) {
    if (field in node) {
      reject(
        `${path}.${field}: a declaration carries no source text. A type language describes a signature; ` +
          `a body belongs in a *.kernel.ts export.`,
      )
    }
  }
  for (const [k, v] of Object.entries(node)) assertNoTypeSourceText(v, `${path}.${k}`)
}

/**
 * A type-expression operand for a postfix operator, parenthesised where TypeScript's precedence
 * needs it: `(A | B)[]` is an array of a union, `A | B[]` is a union with an array in it.
 */
const operand = (e: TypeExpr, path: string): string => {
  const rendered = renderTypeExpr(e, path)
  const needsParens = isRecord(e) && ('union' in e || 'intersection' in e || 'fn' in e || 'keyOf' in e)
  return needsParens ? `(${rendered})` : rendered
}

export const renderTypeExpr = (e: TypeExpr, path: string): string => {
  if (!isRecord(e)) return reject(`${path}: expected a type expression object, got ${JSON.stringify(e)}`)
  if ('ref' in e) {
    if (typeof e.ref !== 'string' || !TYPE_NAME.test(e.ref)) reject(`${path}.ref: expected a type name`)
    return e.ref
  }
  if ('literal' in e) {
    const v: unknown = e.literal
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return literal(v)
    return reject(`${path}.literal: expected a string, number or boolean`)
  }
  if ('generic' in e) {
    const g = e.generic as { of?: unknown; args?: unknown }
    if (typeof g.of !== 'string' || !TYPE_NAME.test(g.of)) reject(`${path}.generic.of: expected a type name`)
    if (!Array.isArray(g.args) || g.args.length === 0) reject(`${path}.generic.args: expected at least one argument`)
    const args = (g.args as TypeExpr[]).map((a, i) => renderTypeExpr(a, `${path}.generic.args[${i}]`))
    return `${g.of as string}<${args.join(', ')}>`
  }
  if ('union' in e) {
    if (!Array.isArray(e.union) || e.union.length < 2) reject(`${path}.union: expected at least two members`)
    return e.union.map((m, i) => renderTypeExpr(m, `${path}.union[${i}]`)).join(' | ')
  }
  if ('intersection' in e) {
    if (!Array.isArray(e.intersection) || e.intersection.length < 2) {
      reject(`${path}.intersection: expected at least two members`)
    }
    return e.intersection.map((m, i) => renderTypeExpr(m, `${path}.intersection[${i}]`)).join(' & ')
  }
  if ('array' in e) return `Array<${renderTypeExpr(e.array, `${path}.array`)}>`
  if ('readonlyArray' in e) return `ReadonlyArray<${renderTypeExpr(e.readonlyArray, `${path}.readonlyArray`)}>`
  // A shorthand needs its operand parenthesised where the operand is itself an operator - `(A | B)[]`
  // - which is exactly where the long form does not.
  if ('arrayOf' in e) return `${operand(e.arrayOf, `${path}.arrayOf`)}[]`
  if ('readonlyArrayOf' in e) return `readonly ${operand(e.readonlyArrayOf, `${path}.readonlyArrayOf`)}[]`
  if ('tuple' in e) {
    if (!Array.isArray(e.tuple)) reject(`${path}.tuple: expected an array`)
    return `[${e.tuple.map((m, i) => renderTypeExpr(m, `${path}.tuple[${i}]`)).join(', ')}]`
  }
  if ('readonlyTuple' in e) {
    if (!Array.isArray(e.readonlyTuple)) reject(`${path}.readonlyTuple: expected an array`)
    const head = e.readonlyTuple.map((m, i) => renderTypeExpr(m, `${path}.readonlyTuple[${i}]`))
    const rest = (e as { rest?: TypeExpr }).rest
    const tail = rest === undefined ? [] : [`...${renderTypeExpr(rest, `${path}.rest`)}`]
    return `readonly [${[...head, ...tail].join(', ')}]`
  }
  if ('object' in e) {
    if (!Array.isArray(e.object)) reject(`${path}.object: expected an array of members`)
    // Broken and unbroken are both formatter fixed points below the line width, so which one a cell
    // shows is the declaration's to state rather than the formatter's to decide.
    if ((e as { multiline?: boolean }).multiline === true) {
      const lines = (e.object as Member[]).map((m, i) => renderMember(m, `${path}.object[${i}]`))
      return `{\n${lines.join('\n')}\n}`
    }
    const members = (e.object as Member[]).map((m, i) => renderMember(m, `${path}.object[${i}]`, true))
    return `{ ${members.join('; ')} }`
  }
  if ('fn' in e) {
    const f = e.fn as { typeParams?: unknown; params?: unknown; returns?: unknown }
    if (!Array.isArray(f.params)) reject(`${path}.fn.params: expected an array (empty is allowed)`)
    if (!isRecord(f.returns)) reject(`${path}.fn.returns: expected a return type`)
    const params = (f.params as Param[]).map((p, i) => renderParam(p, `${path}.fn.params[${i}]`))
    const generics = renderTypeParams(f.typeParams as readonly TypeParam[] | undefined, `${path}.fn.typeParams`)
    return `${generics}(${params.join(', ')}) => ${renderTypeExpr(f.returns as TypeExpr, `${path}.fn.returns`)}`
  }
  if ('indexed' in e) {
    const ix = e.indexed as { of?: unknown; index?: unknown }
    if (!isRecord(ix.of)) reject(`${path}.indexed.of: expected a type expression`)
    const target = renderTypeExpr(ix.of as TypeExpr, `${path}.indexed.of`)
    // A tuple position and an object key are different indices and TypeScript writes them
    // differently: `Parameters<F>[0]` is a position, `InputEvent['source']` is a key. A number is the
    // position and stays bare; a string is the key and is quoted. Rendering both as quoted strings
    // compiles but is not the text the author wrote, which the authorship gate reads as drift.
    if (typeof ix.index === 'number') {
      if (!Number.isInteger(ix.index) || ix.index < 0) {
        reject(`${path}.indexed.index: expected a non-negative integer position`)
      }
      return `${target}[${ix.index}]`
    }
    if (typeof ix.index === 'string') return `${target}[${literal(ix.index)}]`
    if (isRecord(ix.index)) return `${target}[${renderTypeExpr(ix.index as TypeExpr, `${path}.indexed.index`)}]`
    reject(`${path}.indexed.index: expected a key, a tuple position, or a type expression`)
  }
  if ('uniqueSymbol' in e) {
    if (e.uniqueSymbol !== true) reject(`${path}.uniqueSymbol: expected true`)
    return 'unique symbol'
  }
  if ('typeOf' in e) {
    if (typeof e.typeOf !== 'string' || !TYPE_NAME.test(e.typeOf)) reject(`${path}.typeOf: expected a name`)
    return `typeof ${e.typeOf}`
  }
  if ('keyOf' in e) return `keyof ${renderTypeExpr(e.keyOf, `${path}.keyOf`)}`
  return reject(`${path}: unknown type expression ${JSON.stringify(Object.keys(e))}`)
}

const renderParam = (p: Param, path: string): string => {
  if (!isRecord(p) || typeof p.name !== 'string' || !IDENT.test(p.name)) {
    reject(`${path}.name: expected a parameter name`)
  }
  if (!isRecord(p.type)) reject(`${path}.type: expected a type expression`)
  return `${p.name}${p.optional === true ? '?' : ''}: ${renderTypeExpr(p.type, `${path}.type`)}`
}

const renderMember = (m: Member, path: string, inline = false): string => {
  if (!isRecord(m) || typeof m.name !== 'string') reject(`${path}.name: expected a member name`)
  if (m.computed === true) {
    if (!IDENT.test(m.name)) reject(`${path}.name: a computed key names one symbol, got ${JSON.stringify(m.name)}`)
    if (!isRecord(m.type)) reject(`${path}.type: expected a type expression`)
    const prefix = m.mutable === true ? '' : 'readonly '
    const line = `${prefix}[${m.name}]: ${renderTypeExpr(m.type, `${path}.type`)}`
    return inline ? line : `${docBlock(m.doc, '  ')}  ${line}`
  }
  if (!IDENT.test(m.name)) reject(`${path}.name: ${JSON.stringify(m.name)} is not an identifier`)
  if (!isRecord(m.type)) reject(`${path}.type: expected a type expression`)
  const optional = m.optional === true ? '?' : ''
  // Method shorthand and a property holding a function type are distinct texts for the same
  // signature, and the formatter converts neither into the other, so the declaration chooses.
  // `readonly` is meaningless on a method, so the flag also drops the modifier.
  if (m.method === true) {
    if (!('fn' in m.type)) {
      reject(`${path}.type: a method member needs an \`fn\` type, got ${JSON.stringify(Object.keys(m.type))}`)
    }
    const signature = renderTypeExpr(m.type, `${path}.type`)
    const arrow = signature.indexOf(') => ')
    const params = signature.slice(1, arrow)
    const returns = signature.slice(arrow + 5)
    const line = `${m.name}${optional}(${params}): ${returns}`
    return inline ? line : `${docBlock(m.doc, '  ')}  ${line}`
  }
  const prefix = m.mutable === true ? '' : 'readonly '
  const rendered = renderTypeExpr(m.type, `${path}.type`)
  const value = m.orUndefined === true ? `${rendered} | undefined` : rendered
  const line = `${prefix}${m.name}${optional}: ${value}`
  return inline ? line : `${docBlock(m.doc, '  ')}  ${line}`
}

/** `<A, E extends Error>`, or nothing at all for an empty list rather than `<>`. */
export const renderTypeParams = (params: readonly TypeParam[] | undefined, path: string): string => {
  if (params === undefined || params.length === 0) return ''
  const rendered = params.map((p, i) => {
    if (!isRecord(p) || typeof p.name !== 'string' || !IDENT.test(p.name)) {
      reject(`${path}.typeParams[${i}].name: expected a type parameter name`)
    }
    const bound = p.extends === undefined
      ? ''
      : ` extends ${renderTypeExpr(p.extends, `${path}.typeParams[${i}].extends`)}`
    const fallback = p.default === undefined
      ? ''
      : ` = ${renderTypeExpr(p.default, `${path}.typeParams[${i}].default`)}`
    return `${p.name}${bound}${fallback}`
  })
  return `<${rendered.join(', ')}>`
}

export const renderTypeDeclaration = (d: TypeDeclaration, path: string): string => {
  if (!isRecord(d)) return reject(`${path}: expected a declaration object`)
  const exported = d.export === false ? '' : 'export '
  if (d.kind === 'interface') {
    if (typeof d.name !== 'string' || !IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
    if (!Array.isArray(d.members)) reject(`${path}.members: expected an array`)
    const heritage = d.extends === undefined || d.extends.length === 0 ? '' : ` extends ${d.extends.join(', ')}`
    const body = d.members.length === 0
      ? '{}'
      : `{\n${d.members.map((m, i) => renderMember(m, `${path}.members[${i}]`)).join('\n')}\n}`
    return `${docBlock(d.doc, '')}${exported}interface ${d.name}${
      renderTypeParams(d.typeParams, path)
    }${heritage} ${body}`
  }
  if (d.kind === 'type') {
    if (typeof d.name !== 'string' || !IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
    if (!isRecord(d.value)) reject(`${path}.value: expected a type expression`)
    return `${docBlock(d.doc, '')}${exported}type ${d.name}${renderTypeParams(d.typeParams, path)} = ${
      renderTypeExpr(d.value, `${path}.value`)
    }`
  }
  return reject(`${path}.kind: expected 'interface' or 'type', got ${JSON.stringify((d as { kind: unknown }).kind)}`)
}

/** True when a declaration belongs to this module rather than to the calling emitter. */
export const isTypeDeclarationKind = (kind: unknown): kind is 'interface' | 'type' =>
  kind === 'interface' || kind === 'type'
