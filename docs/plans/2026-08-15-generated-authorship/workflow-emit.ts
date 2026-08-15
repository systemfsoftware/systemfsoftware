#!/usr/bin/env -S deno run --allow-read=. --allow-write=.

/**
 * Emits a workflow cell from a declaration that carries no source text.
 *
 * A workflow's decision logic is a dispatch table - a pattern, a channel, a variant to
 * construct - which is data. Values a pattern cannot supply are references to a kernel
 * export plus the command fields to pass it. Nothing in the declaration is a TypeScript
 * statement, expression or body, and `assertNoSourceText` refuses one by inspection.
 *
 * Every rejection is named. A crash is a refusal by accident: it stops a violation without
 * ever stating what a declaration may contain, which makes it useless as a verdict.
 */

type FieldType =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'int' }
  | { readonly kind: 'nonEmptyArray' | 'array'; readonly of: FieldType }
  | { readonly kind: 'ref'; readonly name: string }

interface Variant {
  readonly class: string
  readonly tag: string
  readonly fields: Readonly<Record<string, FieldType>>
}

interface Construction {
  readonly channel: 'left' | 'right'
  readonly construct: string
  readonly with: Readonly<Record<string, FieldValue>>
}

type FieldValue =
  | { readonly call: string; readonly from: string; readonly args: ReadonlyArray<string> }
  | { readonly field: string }

interface Arm extends Construction {
  readonly pattern: Readonly<Record<string, string | number | boolean>>
}

interface WorkflowDeclaration {
  readonly role: 'workflow'
  readonly operation: string
  readonly typeId: { readonly namespace: string; readonly name: string }
  readonly command: { readonly type: string; readonly from: string }
  readonly decision: ReadonlyArray<Variant>
  readonly error: ReadonlyArray<Variant>
  readonly dispatch: {
    readonly on: 'command'
    readonly arms: ReadonlyArray<Arm>
    readonly fallback?: Construction
  }
}

/** Fields the emitter computes. Declaring one is a lie the emitter refuses rather than ignores. */
const DERIVED = [
  'typeIdSymbol',
  'unionName',
  'imports',
  'workflowType',
  'decisionUnion',
  'errorUnion',
] as const

/** The whole declaration surface. Anything else is refused by name, never ignored. */
const DECLARED = ['role', 'operation', 'typeId', 'command', 'decision', 'error', 'dispatch'] as const

/** The non-echo instrument: no string anywhere in the declaration may be TypeScript. */
const SOURCE_TEXT = /=>|\breturn\b|[;{}]|\bfunction\b|\bnew\s|\bpipe\(|Match\.|Either\./

const assertNoSourceText = (value: unknown, path: string): void => {
  if (typeof value === 'string' && SOURCE_TEXT.test(value)) {
    throw new Error(
      `declaration rejected: ${path} carries source text (${JSON.stringify(value)}). ` +
        `A declaration is data; a field holding a statement or expression makes the emission an echo.`,
    )
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSourceText(entry, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertNoSourceText(entry, `${path}.${key}`)
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const field = (raw: Record<string, unknown>, key: string): unknown => key in raw ? raw[key] : undefined

const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string') {
    throw new Error(`declaration rejected: ${path}: expected one name as a string, got ${JSON.stringify(v)}.`)
  }
  return v
}

const parseFieldType = (raw: unknown, path: string): FieldType => {
  if (!isRecord(raw)) {
    throw new Error(
      `declaration rejected: ${path}: expected a field type as data, got ${JSON.stringify(raw)}. ` +
        `Write { "kind": "int" } or { "kind": "nonEmptyArray", "of": ... }, never the schema expression as a string.`,
    )
  }
  const kind = str(field(raw, 'kind'), `${path}.kind`)
  if (kind === 'nonEmptyArray' || kind === 'array') {
    return { kind, of: parseFieldType(field(raw, 'of'), `${path}.of`) }
  }
  if (kind === 'ref') return { kind, name: str(field(raw, 'name'), `${path}.name`) }
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'int') return { kind }
  throw new Error(`declaration rejected: ${path}.kind: unknown field kind ${JSON.stringify(kind)}.`)
}

const parseVariant = (raw: unknown, path: string): Variant => {
  if (!isRecord(raw)) {
    throw new Error(`declaration rejected: ${path}: expected a variant object, got ${JSON.stringify(raw)}.`)
  }
  for (const key of Object.keys(raw)) {
    if (!['class', 'tag', 'fields'].includes(key)) {
      throw new Error(
        `declaration rejected: ${path}.${key}: not a variant field. A variant carries class, tag and fields; ` +
          `the schema form, the TypeId and the base class are the emitter's to choose.`,
      )
    }
  }
  const rawFields = field(raw, 'fields')
  if (!isRecord(rawFields)) {
    throw new Error(
      `declaration rejected: ${path}.fields: expected an object, got ${JSON.stringify(rawFields)}. ` +
        `A variant with no payload declares {} - the field cannot be omitted.`,
    )
  }
  const fields = Object.fromEntries(
    Object.entries(rawFields).map(([name, type]) => [name, parseFieldType(type, `${path}.fields.${name}`)]),
  )
  return { class: str(field(raw, 'class'), `${path}.class`), tag: str(field(raw, 'tag'), `${path}.tag`), fields }
}

const parseFieldValue = (raw: unknown, path: string): FieldValue => {
  if (!isRecord(raw)) {
    throw new Error(
      `declaration rejected: ${path}: expected a value reference, got ${JSON.stringify(raw)}. ` +
        `Write { "call": <kernel export>, "from": <module>, "args": [<command fields>] } or { "field": <command field> }.`,
    )
  }
  if ('call' in raw) {
    const args = field(raw, 'args')
    if (!Array.isArray(args)) {
      throw new Error(`declaration rejected: ${path}.args: expected an array of command field names.`)
    }
    const call = str(field(raw, 'call'), `${path}.call`)
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(call)) {
      throw new Error(
        `declaration rejected: ${path}.call: expected a bare imported identifier, got ${JSON.stringify(call)}. ` +
          `A member expression names a value the emitted cell would have to reach through something it does not ` +
          `import - ambient access wearing a call's clothes.`,
      )
    }
    return {
      call,
      from: str(field(raw, 'from'), `${path}.from`),
      args: args.map((a, i) => str(a, `${path}.args[${i}]`)),
    }
  }
  return { field: str(field(raw, 'field'), `${path}.field`) }
}

const parseConstruction = (raw: unknown, path: string): Construction => {
  if (!isRecord(raw)) {
    throw new Error(`declaration rejected: ${path}: expected a construction object, got ${JSON.stringify(raw)}.`)
  }
  for (const key of Object.keys(raw)) {
    if (!['channel', 'construct', 'with', 'pattern'].includes(key)) {
      throw new Error(
        `declaration rejected: ${path}.${key}: not a construction field. A dispatch target carries channel, ` +
          `construct, with and - on an arm - pattern. A workflow returns its outcome through the Either it ` +
          `declares; there is no other exit.`,
      )
    }
  }
  const channel = str(field(raw, 'channel'), `${path}.channel`)
  if (channel !== 'left' && channel !== 'right') {
    throw new Error(
      `declaration rejected: ${path}.channel: expected "left" or "right", got ${JSON.stringify(channel)}.`,
    )
  }
  const rawWith = field(raw, 'with')
  if (!isRecord(rawWith)) {
    throw new Error(`declaration rejected: ${path}.with: expected an object; a payload-free variant declares {}.`)
  }
  return {
    channel,
    construct: str(field(raw, 'construct'), `${path}.construct`),
    with: Object.fromEntries(
      Object.entries(rawWith).map(([k, v]) => [k, parseFieldValue(v, `${path}.with.${k}`)]),
    ),
  }
}

export const parseWorkflow = (raw: unknown): WorkflowDeclaration => {
  if (!isRecord(raw)) throw new Error('declaration rejected: the declaration must be an object.')
  assertNoSourceText(raw, 'declaration')

  for (const key of DERIVED) {
    if (key in raw) {
      throw new Error(
        `declaration rejected: ${key}: derived, never declared. ` +
          `The emitter computes it from operation, typeId and the variant lists; remove the field.`,
      )
    }
  }
  for (const key of Object.keys(raw)) {
    if (!DECLARED.includes(key as (typeof DECLARED)[number])) {
      throw new Error(
        `declaration rejected: ${key}: not a declaration field. A workflow declaration carries exactly ` +
          `${DECLARED.join(', ')}. Everything else about the cell - its form, its imports, its TypeId ` +
          `placement, its dispatch shape - is the emitter's to choose, so a field naming one is a lie ` +
          `rather than a setting.`,
      )
    }
  }
  if (field(raw, 'role') !== 'workflow') {
    throw new Error(`declaration rejected: role: expected "workflow", got ${JSON.stringify(field(raw, 'role'))}.`)
  }
  const operation = field(raw, 'operation')
  if (typeof operation !== 'string') {
    throw new Error(
      `declaration rejected: operation: expected one name as a string, got ${JSON.stringify(operation)}. ` +
        `A workflow exports exactly one function, so the field cannot hold a list.`,
    )
  }
  const rawCommand = field(raw, 'command')
  if (!isRecord(rawCommand)) {
    throw new Error(
      `declaration rejected: command: expected { type, from }, got ${JSON.stringify(rawCommand)}. ` +
        `A workflow takes exactly one type-annotated command object; the field cannot be omitted, nulled or listed.`,
    )
  }
  const rawTypeId = field(raw, 'typeId')
  if (!isRecord(rawTypeId)) {
    throw new Error(`declaration rejected: typeId: expected { namespace, name }, got ${JSON.stringify(rawTypeId)}.`)
  }
  const readVariants = (key: 'decision' | 'error'): ReadonlyArray<Variant> => {
    const list = field(raw, key)
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        `declaration rejected: ${key}: expected a non-empty array of variants, got ${JSON.stringify(list)}. ` +
          `Both channels must be inhabited; a workflow with no ${key} variant decides nothing.`,
      )
    }
    return list.map((v, i) => parseVariant(v, `${key}[${i}]`))
  }
  const decision = readVariants('decision')
  const error = readVariants('error')

  const rawDispatch = field(raw, 'dispatch')
  if (!isRecord(rawDispatch)) {
    throw new Error(`declaration rejected: dispatch: expected { on, arms, fallback? }.`)
  }
  for (const key of Object.keys(rawDispatch)) {
    if (!['on', 'arms', 'fallback'].includes(key)) {
      throw new Error(
        `declaration rejected: dispatch.${key}: not a dispatch field. A dispatch carries on, arms and an ` +
          `optional fallback. Iteration and branching are not dispatch shapes a declaration selects: the ` +
          `decision is a table, and a table has one path per row.`,
      )
    }
  }
  if (field(rawDispatch, 'on') !== 'command') {
    throw new Error(
      `declaration rejected: dispatch.on: expected "command", got ${JSON.stringify(field(rawDispatch, 'on'))}. ` +
        `A workflow dispatches on its command and nothing else.`,
    )
  }
  const rawArms = field(rawDispatch, 'arms')
  if (!Array.isArray(rawArms) || rawArms.length === 0) {
    throw new Error(`declaration rejected: dispatch.arms: expected a non-empty array of arms.`)
  }
  const arms = rawArms.map((a, i) => {
    const c = parseConstruction(a, `dispatch.arms[${i}]`)
    const pattern = isRecord(a) ? field(a, 'pattern') : undefined
    if (!isRecord(pattern) || Object.keys(pattern).length === 0) {
      throw new Error(`declaration rejected: dispatch.arms[${i}].pattern: expected a non-empty pattern object.`)
    }
    for (const [k, v] of Object.entries(pattern)) {
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        throw new Error(
          `declaration rejected: dispatch.arms[${i}].pattern.${k}: expected a literal, got ${JSON.stringify(v)}. ` +
            `A pattern is data; a predicate would be a function body.`,
        )
      }
    }
    return { ...c, pattern } as Arm
  })

  const rawFallback = field(rawDispatch, 'fallback')
  const fallback = rawFallback === undefined ? undefined : parseConstruction(rawFallback, 'dispatch.fallback')

  const declaredClasses = new Set([...decision, ...error].map((v) => v.class))
  for (const [index, target] of [...arms, ...(fallback ? [fallback] : [])].entries()) {
    if (!declaredClasses.has(target.construct)) {
      throw new Error(
        `declaration rejected: dispatch target ${index} constructs ${target.construct}, which no variant declares. ` +
          `A construction names a declared variant.`,
      )
    }
    const isError = error.some((v) => v.class === target.construct)
    if (isError !== (target.channel === 'left')) {
      throw new Error(
        `declaration rejected: dispatch target ${index}: ${target.construct} is ${
          isError ? 'an error' : 'a decision'
        } variant and cannot be returned on the ${target.channel} channel. ` +
          `Errors ride left, decisions ride right; the channel is not the author's to swap.`,
      )
    }
  }
  const constructed = new Set([...arms, ...(fallback ? [fallback] : [])].map((t) => t.construct))
  for (const variant of [...decision, ...error]) {
    if (!constructed.has(variant.class)) {
      throw new Error(
        `declaration rejected: ${variant.class} is declared but no dispatch arm constructs it. ` +
          `A variant nothing returns makes the union lie; delete it or give it an arm.`,
      )
    }
  }
  if (fallback === undefined && arms.length < decision.length + error.length) {
    throw new Error(
      `declaration rejected: dispatch has no fallback and fewer arms than variants, so the dispatch is not total. ` +
        `Give every variant an arm, or declare a fallback.`,
    )
  }

  return {
    role: 'workflow',
    operation,
    typeId: {
      namespace: str(field(rawTypeId, 'namespace'), 'typeId.namespace'),
      name: str(field(rawTypeId, 'name'), 'typeId.name'),
    },
    command: {
      type: str(field(rawCommand, 'type'), 'command.type'),
      from: str(field(rawCommand, 'from'), 'command.from'),
    },
    decision,
    error,
    dispatch: { on: 'command', arms, fallback },
  }
}

const renderFieldType = (type: FieldType): string => {
  if (type.kind === 'ref') return type.name
  if (type.kind === 'nonEmptyArray') return `S.NonEmptyArray(${renderFieldType(type.of)})`
  if (type.kind === 'array') return `S.Array(${renderFieldType(type.of)})`
  return `S.${type.kind === 'int' ? 'Int' : type.kind[0].toUpperCase() + type.kind.slice(1)}`
}

const renderVariant = (v: Variant, typeIdName: string, base: 'TaggedClass' | 'TaggedError'): string => {
  const fields = Object.entries(v.fields)
  const payload = fields.length === 0
    ? '{}'
    : `{\n${fields.map(([n, t]) => `  ${n}: ${renderFieldType(t)},`).join('\n')}\n}`
  return [
    `export class ${v.class} extends S.${base}<${v.class}>()('${v.tag}', ${payload}) {`,
    `  readonly [${typeIdName}] = ${typeIdName}`,
    `}`,
  ].join('\n')
}

const renderValue = (value: FieldValue): string =>
  'call' in value
    ? `${value.call}(${value.args.map((a) => `command.${a}`).join(', ')})`
    : `command.${value.field}`

const renderConstruction = (t: Construction): string => {
  const args = Object.entries(t.with)
  const payload = args.length === 0
    ? ''
    : `{ ${args.map(([n, v]) => `${n}: ${renderValue(v)}`).join(', ')} }`
  return `Either.${t.channel}(new ${t.construct}(${payload}))`
}

export const emitWorkflow = (decl: WorkflowDeclaration): string => {
  const typeIdName = `${decl.typeId.name}TypeId`
  const unionName = `${decl.typeId.name}Workflow`
  const decisionUnion = decl.decision.map((v) => v.class).join(' | ')
  const errorUnion = decl.error.map((v) => v.class).join(' | ')

  const kernelModules = new Map<string, Set<string>>()
  for (const target of [...decl.dispatch.arms, ...(decl.dispatch.fallback ? [decl.dispatch.fallback] : [])]) {
    for (const value of Object.values(target.with)) {
      if ('call' in value) {
        const set = kernelModules.get(value.from) ?? new Set<string>()
        set.add(value.call)
        kernelModules.set(value.from, set)
      }
    }
  }

  const imports = [
    `import { Workflow } from '@systemfsoftware/effect-cell-types'`,
    `import * as Either from 'effect/Either'`,
    `import * as Match from 'effect/Match'`,
    `import * as S from 'effect/Schema'`,
    ...[...kernelModules.entries()].map(([from, names]) => `import { ${[...names].sort().join(', ')} } from '${from}'`),
    `import type { ${decl.command.type} } from '${decl.command.from}'`,
  ]

  const arms = decl.dispatch.arms.map((arm) => {
    const pattern = `{ ${Object.entries(arm.pattern).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} }`
    return `    Match.when(${pattern}, () => ${renderConstruction(arm)}),`
  })
  const tail = decl.dispatch.fallback
    ? `    Match.orElse(() => ${renderConstruction(decl.dispatch.fallback)}),`
    : `    Match.exhaustive,`

  return [
    ...imports,
    ``,
    `const ${typeIdName}: unique symbol = Symbol.for('${decl.typeId.namespace}/${decl.typeId.name}')`,
    `type ${typeIdName} = typeof ${typeIdName}`,
    ``,
    ...decl.decision.map((v) => renderVariant(v, typeIdName, 'TaggedClass')),
    ...decl.error.map((v) => renderVariant(v, typeIdName, 'TaggedError')),
    ``,
    `export type ${unionName} = Workflow.Workflow<${decl.command.type}, ${decisionUnion}, ${errorUnion}>`,
    ``,
    `export const ${decl.operation} = Workflow.make(`,
    `  (command: ${decl.command.type}): Either.Either<${decisionUnion}, ${errorUnion}> =>`,
    `    Match.value(command).pipe(`,
    ...arms.map((a) => `  ${a}`),
    `  ${tail}`,
    `    ),`,
    `)`,
    ``,
  ].join('\n')
}

if (import.meta.main) {
  const [declPath, outPath] = Deno.args
  if (declPath === undefined) {
    console.error('usage: workflow-emit.ts <decl.json> [out.ts]')
    Deno.exit(2)
  }
  const decl = parseWorkflow(JSON.parse(await Deno.readTextFile(declPath)))
  const emitted = emitWorkflow(decl)
  if (outPath === undefined) console.log(emitted)
  else {
    await Deno.writeTextFile(outPath, emitted)
    console.log(`emitted ${outPath} (${emitted.length} bytes) from ${declPath}`)
  }
}
