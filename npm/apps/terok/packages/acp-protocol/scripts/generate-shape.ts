// SPDX-License-Identifier: Apache-2.0
//
// Generates `src/acp.shape.ts` from `protocol/acp-schema.json`, which is the
// source of truth for the wire format. Run: pnpm --filter @terok/acp-protocol codegen
//
// This declares a foreign model, not a domain. Every type here is the ENCODED
// side of someone else's protocol: unbranded, field-presence optional, shaped
// by their JSON Schema. Nothing in this package is domain vocabulary, so
// nothing here may be branded into one — a crossing into terok's types is an
// ACL, and it belongs wherever that domain is declared.
//
// JSON Schema `not` appears four times, expressing mutual exclusion between
// object shapes. Effect Schema has no counterpart, so the generated union is
// permissive and each occurrence is listed in `UNEXPRESSED_CONSTRAINTS`; a
// decoder needing the exclusion applies its own filter. Dropping the
// constraint silently is what that list exists to prevent.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(HERE, '..', '..', '..', 'protocol', 'acp-schema.json')
const OUT_PATH = join(HERE, '..', 'src', 'acp.shape.ts')

type Json = { readonly [k: string]: unknown }

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const readDefs = (): ReadonlyMap<string, Json> => {
  const parsed: unknown = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  if (!isObject(parsed)) throw new Error('protocol schema root is not an object')
  const raw = parsed.$defs
  if (!isObject(raw)) throw new Error('protocol schema has no $defs object')
  const out = new Map<string, Json>()
  for (const [name, body] of Object.entries(raw)) {
    if (!isObject(body)) throw new Error(`$defs.${name} is not an object`)
    out.set(name, body)
  }
  return out
}

const defs = readDefs()

const refName = (ref: string): string => ref.slice(ref.lastIndexOf('/') + 1)

const collectRefs = (node: unknown, out: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const x of node) collectRefs(x, out)
    return
  }
  if (!isObject(node)) return
  for (const [k, v] of Object.entries(node)) {
    if (k === '$ref' && typeof v === 'string') out.add(refName(v))
    else collectRefs(v, out)
  }
}

// Depth-first post-order over $ref edges. The schema is acyclic (verified: zero
// recursive defs), so this is a total order and no `S.suspend` is needed. A
// cycle would emit a use-before-declare, so it throws rather than proceeding.
const topoSort = (): ReadonlyArray<string> => {
  const deps = new Map<string, ReadonlySet<string>>()
  for (const [name, body] of defs) {
    const s = new Set<string>()
    collectRefs(body, s)
    s.delete(name)
    deps.set(name, s)
  }
  const order: Array<string> = []
  const state = new Map<string, 'open' | 'done'>()
  const visit = (name: string, trail: ReadonlyArray<string>): void => {
    const seen = state.get(name)
    if (seen === 'done') return
    if (seen === 'open') throw new Error(`cyclic $ref: ${[...trail, name].join(' -> ')}`)
    state.set(name, 'open')
    for (const dep of deps.get(name) ?? []) if (defs.has(dep)) visit(dep, [...trail, name])
    state.set(name, 'done')
    order.push(name)
  }
  for (const name of defs.keys()) visit(name, [])
  return order
}

const unexpressed: Array<{ readonly path: string; readonly reason: string }> = []

const quoteKey = (k: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k))

const literal = (v: unknown): string => {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v === null) return 'null'
  throw new Error(`unsupported const/enum value: ${JSON.stringify(v)}`)
}

const LITERAL_CALL = /^S\.Literal\(([^()]*)\)$/

// A union whose members are all literals is a single `S.Literal(a, b, c)`;
// `@effect/language-service` rejects the nested form as an error, not a hint.
const union = (parts: ReadonlyArray<string>): string => {
  const inners: Array<string> = []
  for (const p of parts) {
    const m = LITERAL_CALL.exec(p)
    if (m === null) return `S.Union(${[...new Set(parts)].join(', ')})`
    const [, inner = ''] = m
    for (const one of inner.split(', ')) if (!inners.includes(one)) inners.push(one)
  }
  return `S.Literal(${inners.join(', ')})`
}

const PRIMITIVE: Readonly<Record<string, string>> = {
  string: 'S.String',
  integer: 'S.Int',
  number: 'S.JsonNumber',
  boolean: 'S.Boolean',
  null: 'S.Null',
}

const numericBound = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

const splitNullable = (t: unknown): { readonly types: ReadonlyArray<string>; readonly nullable: boolean } => {
  const list = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
  return { types: list.filter((x) => x !== 'null'), nullable: list.includes('null') }
}

const render = (node: unknown, path: string): string => {
  if (!isObject(node)) return 'JsonValue'

  if (typeof node.$ref === 'string') return refName(node.$ref)
  if ('const' in node) return `S.Literal(${literal(node.const)})`
  if (Array.isArray(node.enum)) {
    return node.enum.length === 0 ? 'S.Never' : `S.Literal(${node.enum.map(literal).join(', ')})`
  }

  // `allOf` is always a single `$ref` here; siblings either annotate it (drop
  // them) or add structure, which is an intersection.
  if (Array.isArray(node.allOf)) {
    const parts = node.allOf.map((x, i) => render(x, `${path}.allOf[${i}]`))
    const structural = 'properties' in node || 'additionalProperties' in node
    const all = structural ? [...parts, renderObject(node, path)] : parts
    const [only] = all
    if (all.length === 1 && only !== undefined) return only
    return `S.extend(${all.join(', ')})`
  }

  const variants = node.oneOf ?? node.anyOf
  if (Array.isArray(variants)) {
    const usable: Array<unknown> = []
    for (const v of variants) {
      if (isObject(v) && 'not' in v) {
        unexpressed.push({
          path,
          reason: 'JSON Schema `not`: mutual exclusion between object shapes; emitted union is permissive',
        })
      } else usable.push(v)
    }
    const rendered = usable.map((v, i) => render(v, `${path}.variant[${i}]`))
    const present = rendered.filter((r) => r !== 'S.Null')
    const [only] = present
    if (only === undefined) return rendered.length === 0 ? 'JsonValue' : 'S.Null'
    const body = present.length === 1 ? only : union(present)
    return present.length === rendered.length ? body : `S.NullOr(${body})`
  }

  const { types, nullable } = splitNullable(node.type)
  const wrap = (s: string): string => (nullable ? `S.NullOr(${s})` : s)

  const [first] = types
  if (first === undefined) return nullable ? 'S.Null' : 'JsonValue'
  if (types.length > 1) return wrap(`S.Union(${types.map((t) => PRIMITIVE[t] ?? 'JsonValue').join(', ')})`)
  if (first === 'array') {
    return wrap(`S.Array(${node.items === undefined ? 'JsonValue' : render(node.items, `${path}.items`)})`)
  }
  if (first === 'object') return wrap(renderObject(node, path))
  const primitive = PRIMITIVE[first] ?? 'JsonValue'
  if (first === 'integer') {
    const lo = numericBound(node.minimum)
    const hi = numericBound(node.maximum)
    if (lo !== undefined && hi !== undefined) return wrap(`${primitive}.pipe(S.between(${lo}, ${hi}))`)
    if (lo !== undefined) return wrap(`${primitive}.pipe(S.between(${lo}, Number.MAX_SAFE_INTEGER))`)
    if (hi !== undefined) return wrap(`${primitive}.pipe(S.between(Number.MIN_SAFE_INTEGER, ${hi}))`)
  }
  return wrap(primitive)
}

const renderObject = (node: Json, path: string): string => {
  const props = isObject(node.properties) ? node.properties : {}
  const requiredList = Array.isArray(node.required) ? node.required : []
  const required = new Set(requiredList.filter((x): x is string => typeof x === 'string'))
  const names = Object.keys(props)

  if (names.length === 0) {
    const extra = node.additionalProperties
    if (isObject(extra)) {
      return `S.Record({ key: JsonObjectKey, value: ${render(extra, `${path}.additionalProperties`)} })`
    }
    return extra === false ? 'S.Struct({})' : 'JsonObject'
  }

  const fields = names.map((n) => {
    const rendered = render(props[n], `${path}.properties.${n}`)
    return `    ${quoteKey(n)}: ${required.has(n) ? rendered : `S.optional(${rendered})`}`
  })
  return `S.Struct({\n${fields.join(',\n')}\n  })`
}

const jsdoc = (body: Json): string => {
  const d = body.description
  if (typeof d !== 'string') return ''
  return `/**\n${d.split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n')}\n */\n`
}

const order = topoSort()

const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const declarations = order.flatMap((name) => {
  const body = defs.get(name)
  if (body === undefined) return []
  const rendered = render(body, `$defs.${name}`)
  // A one-variant `anyOf` renders to a bare reference, which is an alias, not a
  // schema expression. Upstream keeps these as unions because further variants
  // are expected, so the faithful encoding is the one-member union.
  const expr = BARE_IDENTIFIER.test(rendered) ? `S.Union(${rendered})` : rendered
  return [`${jsdoc(body)}export const ${name} = ${expr}\nexport type ${name} = typeof ${name}.Type\n`]
})

// Every `$ref` reachable through anyOf/oneOf/allOf without descending into a
// named reference: the envelope's own member list, one level deep.
const envelopeMembers = (node: unknown, out: Array<string>): ReadonlyArray<string> => {
  if (!isObject(node)) return out
  const ref = node.$ref
  if (typeof ref === 'string') {
    out.push(refName(ref))
    return out
  }
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const branch = node[key]
    if (Array.isArray(branch)) { for (const v of branch) envelopeMembers(v, out) }
  }
  return out
}

const membersOf = (envelope: string, field: string): ReadonlyArray<string> => {
  const body = defs.get(envelope)
  if (body === undefined) throw new Error(`missing envelope ${envelope}`)
  const props = isObject(body.properties) ? body.properties : undefined
  if (props !== undefined && field in props) return envelopeMembers(props[field], [])
  const collected: Array<string> = []
  const branches = body.anyOf
  if (Array.isArray(branches)) {
    for (const v of branches) {
      const p = isObject(v) && isObject(v.properties) ? v.properties : undefined
      if (p !== undefined && field in p) envelopeMembers(p[field], collected)
    }
  }
  return collected
}

// The protocol's own `AgentRequest` types `method` as a bare string beside a
// flat union of every payload, so a mismatched method/params pair decodes
// successfully. The correlation exists only in the `x-method` extension, so
// these unions rebuild it and are strictly stricter than the published schema.
// `ExtRequest`/`ExtNotification` carry no `x-method` — they are the documented
// extension escape, and keep an open method.
const correlated = (name: string, envelope: string, withId: boolean): string => {
  const variants = membersOf(envelope, 'params').map((member) => {
    const body = defs.get(member)
    const method = body?.['x-method']
    const tag = typeof method === 'string' ? `S.Literal(${JSON.stringify(method)})` : 'S.String'
    const id = withId ? '\n    id: RequestId,' : ''
    return `  S.Struct({\n    jsonrpc: S.Literal("2.0"),${id}\n    method: ${tag},\n    params: ${member},\n  })`
  })
  return `export const ${name} = S.Union(\n${variants.join(',\n')},\n)\nexport type ${name} = typeof ${name}.Type\n`
}

const envelopes = [
  correlated('AgentRequestMessage', 'AgentRequest', true),
  correlated('ClientRequestMessage', 'ClientRequest', true),
  correlated('AgentNotificationMessage', 'AgentNotification', false),
  correlated('ClientNotificationMessage', 'ClientNotification', false),
].join('\n')

const gapComment = unexpressed
  .map((u) => `//   ${u.path}\n//     ${u.reason}`)
  .join('\n')

const out = `// GENERATED by scripts/generate-schema.ts — do not edit.
// Source of truth: protocol/acp-schema.json (${defs.size} definitions).
// Regenerate with: pnpm --filter @terok/acp-protocol codegen
//
// Constraints the JSON Schema states that Effect Schema cannot express, so the
// generated union admits shapes the wire format rejects. A decoder needing the
// exclusion applies its own filter:
${gapComment}

import * as S from "effect/Schema"

/**
 * An arbitrary JSON value, as carried by the protocol's open fields.
 *
 * \`_meta\` (195 of the 197 open objects) is ACP's extensibility slot: its
 * contents are not specified, but they did arrive as JSON, so \`unknown\` is
 * wider than the truth — it admits NaN, \`undefined\` and functions that no
 * wire value can be.
 *
 * \`__proto__\` is refused rather than carried. Effect's \`S.Record\` decode
 * assigns keys instead of defining them, so an own \`__proto__\` key — which
 * \`JSON.parse\` produces safely — becomes a real prototype assignment, and the
 * decoded object silently inherits attacker-controlled properties (measured on
 * effect 3.22.1). No legitimate peer sends it as a metadata key.
 */
export const JsonObjectKey = S.String.pipe(
  S.filter((k) => k !== "__proto__", {
    identifier: "JsonObjectKey",
    description: "a JSON object key that cannot reach Object.prototype",
  }),
)
export type JsonObjectKey = typeof JsonObjectKey.Type

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export const JsonValue: S.Schema<JsonValue> = S.suspend(() =>
  S.Union(
    S.Null,
    S.Boolean,
    S.JsonNumber,
    S.String,
    S.Array(JsonValue),
    S.Record({ key: JsonObjectKey, value: JsonValue }),
  ),
)

export const JsonObject = S.Record({ key: JsonObjectKey, value: JsonValue })
export type JsonObject = typeof JsonObject.Type

${declarations.join('\n')}
${envelopes}`

writeFileSync(OUT_PATH, out)

process.stdout.write(
  `wrote ${OUT_PATH}\n` +
    `  definitions: ${order.length}\n` +
    `  correlated:  ${(envelopes.match(/jsonrpc: S\.Literal/g) ?? []).length} envelope variants\n` +
    `  unexpressed: ${unexpressed.length}\n` +
    `  bytes:       ${out.length}\n`,
)
