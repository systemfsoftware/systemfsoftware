#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Emits a `shape` cell from a declaration that carries no source text.
 *
 * A shape cell is the role where emission is least contestable: the cell is interfaces and type
 * aliases outright, and the brief's own Definitions place "type signatures" inside *shape* - the
 * thing to be emitted rather than the thing to be preserved. There is nothing to move to a
 * kernel because there is no body anywhere in the role.
 *
 * The whole language lives in `type-decl.ts`, shared with the schema emitter. This file is the
 * import block, the declaration order, and the refusals that keep behaviour out of a shape cell:
 *
 * - no value declaration of any kind. `shape-no-behaviour` says a shape cell holds no runtime
 *   value, so a `const` or a function has no field here and never will.
 * - no source text, checked by the shared guard.
 */
import { docBlock, IDENT, isRecord, key, literal, rejecting } from './render.ts'
import {
  assertNoTypeSourceText,
  isTypeDeclarationKind,
  renderTypeDeclaration,
  renderTypeExpr,
  type TypeDeclaration,
  type TypeExpr,
} from './type-decl.ts'

interface ImportSpec {
  readonly module: string
  readonly types?: readonly string[]
  readonly values?: readonly string[]
  readonly alias?: Readonly<Record<string, string>>
  /** `import type * as memfs from 'memfs'` - a whole module's types under one local name. */
  readonly namespace?: string
}

/**
 * Inert data: the values a foreign model's own vocabulary arrives as - a version string, the
 * vendor's event list, the reason table beside it.
 *
 * `shape-no-behaviour` reports a function declaration, a function-valued const, a method
 * definition and a default function export, and nothing else - so a const holding data is a
 * legitimate shape declaration rather than behaviour smuggled in. That is also why this language
 * has no field a body could occupy: a value is a literal, a reference to another const, a
 * template of those, an array of them, or an object of them. Nothing here computes.
 */
export type DataExpr =
  | { readonly literal: string | number | boolean | null }
  /** A reference to another const in this cell or an import. */
  | { readonly ref: string }
  /** A template literal whose holes are references: `` `... ${VERSION}` ``. */
  | { readonly template: readonly (string | { readonly ref: string })[] }
  | { readonly array: readonly DataExpr[] }
  | { readonly object: readonly DataEntry[] }

export interface DataEntry {
  readonly key: string
  readonly value: DataExpr
  readonly doc?: readonly string[]
}

export interface ConstDeclaration {
  readonly kind: 'const'
  readonly name: string
  readonly value: DataExpr
  /** `as const` - the narrowing that makes a vendored list usable as a literal union. */
  readonly asConst?: boolean
  /**
   * `satisfies T` - the check that the vendored data still covers the type it claims to. In this
   * repo's shape cells that is the whole point of the declaration, so it is never inferred.
   */
  readonly satisfies?: TypeExpr
  readonly export?: boolean
  readonly doc?: readonly string[]
}

export type ShapeMember = TypeDeclaration | ConstDeclaration

export interface ShapeDeclaration {
  readonly role: 'shape'
  readonly imports: readonly ImportSpec[]
  readonly declarations: readonly ShapeMember[]
  readonly doc?: readonly string[]
}

const reject = rejecting('declaration')

/**
 * A shape cell's imports are type-only by construction.
 *
 * `shape-no-behaviour` forbids a runtime value in the cell, so a value import would have
 * nothing to be used by - and `cell-import-boundary` reads the specifier, not the binding, so a
 * value import here is a lint finding waiting to happen rather than a capability.
 */
const renderImport = (spec: ImportSpec, index: number): string => {
  if (!isRecord(spec) || typeof spec.module !== 'string' || spec.module === '') {
    reject(`imports[${index}].module: expected a specifier`)
  }
  if (spec.values !== undefined) {
    reject(
      `imports[${index}].values: a shape cell imports types only. \`shape-no-behaviour\` forbids a runtime ` +
        `value here, so there is nothing a value import could serve.`,
    )
  }
  if (spec.namespace !== undefined) {
    if (typeof spec.namespace !== 'string' || !IDENT.test(spec.namespace)) {
      reject(`imports[${index}].namespace: expected a local identifier`)
    }
    if (spec.types !== undefined) {
      reject(`imports[${index}]: a namespace import and named types are separate statements; declare two imports`)
    }
    return `import type * as ${spec.namespace} from '${spec.module}'`
  }
  const names = (spec.types ?? []).map((t) => {
    const renamed = spec.alias?.[t]
    return renamed === undefined ? t : `${t} as ${renamed}`
  })
  if (names.length === 0) reject(`imports[${index}]: names nothing`)
  return `import type { ${names.join(', ')} } from '${spec.module}'`
}

const renderData = (e: DataExpr, path: string, indent = ''): string => {
  if (!isRecord(e)) return reject(`${path}: expected a data value, got ${JSON.stringify(e)}`)
  if ('literal' in e) {
    const v: unknown = e.literal
    if (typeof v === 'string') return literal(v)
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v)
    return reject(`${path}.literal: expected a string, number, boolean or null`)
  }
  if ('ref' in e) {
    if (typeof e.ref !== 'string' || !IDENT.test(e.ref)) reject(`${path}.ref: expected a name`)
    return e.ref
  }
  if ('template' in e) {
    if (!Array.isArray(e.template)) reject(`${path}.template: expected an array of strings and refs`)
    const parts = e.template.map((part, i) => {
      if (typeof part === 'string') return part.replaceAll('\\', '\\\\').replaceAll('`', '\\`')
      if (isRecord(part) && typeof part.ref === 'string' && IDENT.test(part.ref)) return `\${${part.ref}}`
      return reject(`${path}.template[${i}]: expected a string or a { ref } hole`)
    })
    return `\`${parts.join('')}\``
  }
  if ('array' in e) {
    if (!Array.isArray(e.array)) reject(`${path}.array: expected an array`)
    const inner = `${indent}  `
    const items = e.array.map((v, i) => `${inner}${renderData(v, `${path}.array[${i}]`, inner)},`)
    return items.length === 0 ? '[]' : `[\n${items.join('\n')}\n${indent}]`
  }
  if ('object' in e) {
    if (!Array.isArray(e.object)) reject(`${path}.object: expected an array of entries`)
    const inner = `${indent}  `
    const entries = (e.object as DataEntry[]).map((entry, i) => {
      const at = `${path}.object[${i}]`
      if (!isRecord(entry) || typeof entry.key !== 'string') reject(`${at}.key: expected a key`)
      const doc = docBlock(entry.doc, inner)
      return `${doc}${inner}${key(entry.key)}: ${renderData(entry.value, `${at}.value`, inner)},`
    })
    return entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n${indent}}`
  }
  return reject(`${path}: unknown data value ${JSON.stringify(Object.keys(e))}`)
}

const renderConst = (d: ConstDeclaration, path: string): string => {
  if (typeof d.name !== 'string' || !IDENT.test(d.name)) reject(`${path}.name: expected an identifier`)
  const doc = docBlock(d.doc, '')
  const value = renderData(d.value, `${path}.value`)
  const narrowed = d.asConst === true ? `${value} as const` : value
  const checked = d.satisfies === undefined
    ? narrowed
    : `${narrowed} satisfies ${renderTypeExpr(d.satisfies, `${path}.satisfies`)}`
  return `${doc}${d.export === false ? '' : 'export '}const ${d.name} = ${checked}`
}

const isConstKind = (kind: unknown): kind is 'const' => kind === 'const'

export const parseShape = (raw: unknown): ShapeDeclaration => {
  if (!isRecord(raw)) reject('the declaration must be an object')
  const rec = raw as Record<string, unknown>
  assertNoTypeSourceText(rec, 'declaration')
  if (rec.role !== 'shape') reject(`role: expected "shape", got ${JSON.stringify(rec.role)}`)
  if (!Array.isArray(rec.imports)) reject('imports: expected an array (empty is allowed)')
  const declarations: unknown = rec.declarations
  if (!Array.isArray(declarations) || declarations.length === 0) {
    reject('declarations: expected a non-empty array - a shape cell that declares nothing is not a cell')
  }
  ;(declarations as readonly unknown[]).forEach((d: unknown, i: number) => {
    const kind: unknown = isRecord(d) ? d.kind : undefined
    if (!isTypeDeclarationKind(kind) && !isConstKind(kind)) {
      reject(
        `declarations[${i}].kind: a shape cell holds \`interface\`, \`type\` and \`const\` declarations, got ` +
          `${JSON.stringify(kind)}. \`shape-no-behaviour\` reports a function declaration, a ` +
          `function-valued const, a method definition and a default function export - so data is a ` +
          `declaration here and only behaviour is not.`,
      )
    }
  })
  return rec as unknown as ShapeDeclaration
}

export const emitShape = (decl: ShapeDeclaration): string => {
  const imports = decl.imports.map((spec, i) => renderImport(spec, i))
  const head = imports.length === 0 ? '' : `${imports.join('\n')}\n\n`
  const doc = decl.doc === undefined
    ? ''
    : `/**\n${decl.doc.map((l) => (l === '' ? ' *' : ` * ${l}`)).join('\n')}\n */\n`
  const body = decl.declarations
    .map((d, i) =>
      isConstKind(d.kind)
        ? renderConst(d as ConstDeclaration, `declarations[${i}]`)
        : renderTypeDeclaration(d as TypeDeclaration, `declarations[${i}]`)
    )
    .join('\n\n')
  return `${head}${doc}${body}\n`
}

const main = async (): Promise<void> => {
  const [declPath, outPath] = Deno.args
  if (declPath === undefined) {
    console.error('usage: shape-emit.ts <declaration.shape.decl.json> [out.shape.ts]')
    Deno.exitCode = 1
    return
  }
  const raw: unknown = JSON.parse(await Deno.readTextFile(declPath))
  const emitted = emitShape(parseShape(raw))
  if (outPath === undefined) console.log(emitted)
  else {
    await Deno.writeTextFile(outPath, emitted)
    console.log(`emitted ${outPath} (${emitted.length} bytes) from ${declPath}`)
  }
}

if (import.meta.main) await main()
