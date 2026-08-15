#!/usr/bin/env -S deno run --allow-read=. --allow-write=.

/**
 * Emits a workflow cell from a declaration that carries no source text.
 *
 * A workflow's decision logic is a dispatch table - a subject, a pattern, a channel, a
 * variant to construct - which is data. Values a pattern cannot supply are references to a
 * kernel export plus the paths to pass it. Every name in the declaration is validated as a
 * bare identifier, so no field can smuggle an expression: a multi-segment access is a list
 * of identifiers, never the dotted string a reader would mistake for code.
 *
 * Every rejection is named. A crash is a refusal by accident: it stops a violation without
 * ever stating what a declaration may contain, which makes it useless as a verdict.
 */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

type FieldType =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'int' | 'unknown' }
  | { readonly kind: 'nonEmptyArray' | 'array'; readonly of: FieldType }
  | { readonly kind: 'ref'; readonly name: string; readonly from?: string }

/**
 * A read off a bound value: `command`, or a name an enclosing arm bound.
 *
 * Optionality is per segment, because `?.` belongs to the access whose *owner* may be
 * absent. Marking the whole path optional emits `a?.b?.c` where only `b` is nullable, and
 * `typescript(no-unnecessary-condition)` correctly rejects the surplus hop.
 */
interface Segment {
  readonly name: string
  readonly optional: boolean
}

interface Path {
  readonly segments: ReadonlyArray<Segment>
}

type FieldValue =
  | { readonly call: string; readonly from: string; readonly args: ReadonlyArray<Path> }
  | { readonly read: Path }

interface Variant {
  readonly class: string
  readonly tag: string
  readonly fields: Readonly<Record<string, FieldType>>
}

interface TypeId {
  readonly namespace: string
  readonly name: string
}

interface Construction {
  readonly channel: 'left' | 'right'
  readonly construct: string
  readonly with: Readonly<Record<string, FieldValue>>
}

/** The subject a dispatch matches on: the command itself, or a kernel call's result. */
type Subject = { readonly command: true } | {
  readonly call: string
  readonly from: string
  readonly args: ReadonlyArray<Path>
}

type Pattern = string | Readonly<Record<string, string | number | boolean>>

/** An arm either constructs an outcome, splits an Either, or dispatches again. */
type Arm =
  | { readonly pattern: Pattern; readonly kind: 'construct'; readonly target: Construction }
  | {
    readonly pattern: Pattern
    readonly kind: 'either'
    readonly subject: {
      readonly call: string
      readonly from: string
      readonly args: ReadonlyArray<Path>
      readonly bind: string
    }
    readonly onLeft: Construction
    readonly onRight: Dispatch | Construction
  }
  | { readonly pattern: Pattern; readonly kind: 'dispatch'; readonly inner: Dispatch }

interface Dispatch {
  readonly on: Subject
  readonly arms: ReadonlyArray<Arm>
  readonly fallback?: Construction
}

interface Declaration {
  readonly operation: string
  readonly typeId?: TypeId
  readonly command: { readonly type: string; readonly from: string } | {
    readonly declare: Variant
    readonly typeId: TypeId
  }
  readonly decision: { readonly variants: ReadonlyArray<Variant>; readonly typeId: TypeId } | {
    readonly importedType: string
    readonly from: string
    readonly constructors: ReadonlyArray<string>
  }
  readonly error: { readonly variants: ReadonlyArray<Variant>; readonly typeId: TypeId }
  readonly dispatch: Dispatch
}

const DERIVED = [
  'typeIdSymbol',
  'unionName',
  'imports',
  'workflowType',
  'decisionUnion',
  'errorUnion',
] as const
const DECLARED = ['role', 'operation', 'typeId', 'command', 'decision', 'error', 'dispatch'] as const

const reject = (message: string): never => {
  throw new Error(`declaration rejected: ${message}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const at = (raw: Record<string, unknown>, key: string): unknown => (key in raw ? raw[key] : undefined)

const ident = (v: unknown, path: string): string => {
  if (typeof v !== 'string') reject(`${path}: expected one name as a string, got ${JSON.stringify(v)}.`)
  const name = v as string
  if (!IDENT.test(name)) {
    reject(
      `${path}: expected a bare identifier, got ${JSON.stringify(name)}. A dotted or optional access is a ` +
        `path: write ["a", "b"] so every segment is a name, never one string the emitter would paste as code.`,
    )
  }
  return name
}

const moduleSpecifier = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v === '') reject(`${path}: expected a module specifier.`)
  return v as string
}

const closed = (
  raw: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
  path: string,
  what: string,
): void => {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      reject(
        `${path}${path === '' ? '' : '.'}${key}: not ${what}. The surface is exactly ${allowed.join(', ')}; ` +
          `everything else about the cell is the emitter's to choose, so a field naming one is a lie rather ` +
          `than a setting.`,
      )
    }
  }
}

const parseSegment = (raw: unknown, path: string): Segment => {
  if (typeof raw === 'string') return { name: ident(raw, path), optional: false }
  if (!isRecord(raw)) reject(`${path}: expected a name or { name, optional }, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  closed(rec, ['name', 'optional'], path, 'a segment field')
  return { name: ident(at(rec, 'name'), `${path}.name`), optional: at(rec, 'optional') === true }
}

const parsePath = (raw: unknown, path: string): Path => {
  if (typeof raw === 'string') return { segments: [{ name: ident(raw, path), optional: false }] }
  if (!isRecord(raw)) reject(`${path}: expected a name or { path }, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  closed(rec, ['path'], path, 'a path field')
  const segments = at(rec, 'path')
  if (!Array.isArray(segments) || segments.length === 0) {
    reject(`${path}.path: expected a non-empty array of names.`)
  }
  const parsed = (segments as ReadonlyArray<unknown>).map((s, i) => parseSegment(s, `${path}.path[${i}]`))
  if (parsed[0]!.optional) {
    reject(
      `${path}.path[0]: the root of a path cannot be optional. ` + `\`command\` and every bound value are ` +
        `present by construction, so an optional first hop emits a check the type checker rejects as surplus.`,
    )
  }
  return { segments: parsed }
}

const parseFieldType = (raw: unknown, path: string): FieldType => {
  if (!isRecord(raw)) {
    reject(
      `${path}: expected a field type as data, got ${JSON.stringify(raw)}. Write { "kind": "int" } or ` +
        `{ "kind": "nonEmptyArray", "of": ... }, never the schema expression as a string.`,
    )
  }
  const rec = raw as Record<string, unknown>
  const kind = at(rec, 'kind')
  if (kind === 'nonEmptyArray' || kind === 'array') {
    return { kind, of: parseFieldType(at(rec, 'of'), `${path}.of`) }
  }
  if (kind === 'ref') {
    const from = at(rec, 'from')
    return {
      kind: 'ref',
      name: ident(at(rec, 'name'), `${path}.name`),
      ...(from === undefined ? {} : { from: moduleSpecifier(from, `${path}.from`) }),
    }
  }
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'int' || kind === 'unknown') {
    return { kind }
  }
  return reject(`${path}.kind: unknown field kind ${JSON.stringify(kind)}.`)
}

const parseVariant = (raw: unknown, path: string): Variant => {
  if (!isRecord(raw)) reject(`${path}: expected a variant object, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  closed(rec, ['class', 'tag', 'typeId', 'fields'], path, 'a variant field')
  if ('typeId' in rec) {
    reject(
      `${path}.typeId: a TypeId belongs to a union, never to one variant. Declare it once on the channel so ` +
        `every variant of that union carries the same symbol.`,
    )
  }
  const fields = at(rec, 'fields')
  if (!isRecord(fields)) {
    reject(
      `${path}.fields: expected an object, got ${JSON.stringify(fields)}. A payload-free variant declares {}.`,
    )
  }
  return {
    class: ident(at(rec, 'class'), `${path}.class`),
    tag: ident(at(rec, 'tag'), `${path}.tag`),
    fields: Object.fromEntries(
      Object.entries(fields as Record<string, unknown>).map((
        [n, t],
      ) => [ident(n, `${path}.fields key`), parseFieldType(t, `${path}.fields.${n}`)]),
    ),
  }
}

const parseTypeId = (raw: unknown, path: string): TypeId => {
  if (!isRecord(raw)) reject(`${path}: expected { namespace, name }, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  closed(rec, ['namespace', 'name'], path, 'a TypeId field')
  const ns = at(rec, 'namespace')
  if (typeof ns !== 'string' || ns === '') reject(`${path}.namespace: expected a namespace string.`)
  return { namespace: ns as string, name: ident(at(rec, 'name'), `${path}.name`) }
}

const parseCall = (
  rec: Record<string, unknown>,
  path: string,
): { call: string; from: string; args: ReadonlyArray<Path> } => {
  const args = at(rec, 'args')
  if (!Array.isArray(args)) reject(`${path}.args: expected an array of paths.`)
  return {
    call: ident(at(rec, 'call'), `${path}.call`),
    from: moduleSpecifier(at(rec, 'from'), `${path}.from`),
    args: (args as ReadonlyArray<unknown>).map((a, i) => parsePath(a, `${path}.args[${i}]`)),
  }
}

const parseFieldValue = (raw: unknown, path: string): FieldValue => {
  if (!isRecord(raw)) {
    reject(
      `${path}: expected a value reference, got ${JSON.stringify(raw)}. Write { call, from, args } for a kernel ` +
        `export or { field } for a read off a bound value.`,
    )
  }
  const rec = raw as Record<string, unknown>
  if ('call' in rec) {
    closed(rec, ['call', 'from', 'args'], path, 'a call field')
    return parseCall(rec, path)
  }
  closed(rec, ['field'], path, 'a value field')
  return { read: parsePath(at(rec, 'field'), `${path}.field`) }
}

const parseConstruction = (raw: unknown, path: string): Construction => {
  if (!isRecord(raw)) reject(`${path}: expected a construction object, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  const channel = at(rec, 'channel')
  if (channel !== 'left' && channel !== 'right') {
    reject(`${path}.channel: expected "left" or "right", got ${JSON.stringify(channel)}.`)
  }
  const withRaw = at(rec, 'with')
  if (!isRecord(withRaw)) reject(`${path}.with: expected an object; a payload-free variant declares {}.`)
  return {
    channel: channel as 'left' | 'right',
    construct: ident(at(rec, 'construct'), `${path}.construct`),
    with: Object.fromEntries(
      Object.entries(withRaw as Record<string, unknown>).map(([k, v]) => [
        ident(k, `${path}.with key`),
        parseFieldValue(v, `${path}.with.${k}`),
      ]),
    ),
  }
}

const parsePattern = (raw: unknown, path: string): Pattern => {
  if (typeof raw === 'string') return ident(raw, path)
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    reject(`${path}: expected a tag name or a non-empty pattern object, got ${JSON.stringify(raw)}.`)
  }
  const rec = raw as Record<string, unknown>
  for (const [k, v] of Object.entries(rec)) {
    ident(k, `${path} key`)
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      reject(
        `${path}.${k}: expected a literal, got ${JSON.stringify(v)}. A predicate would be a function body.`,
      )
    }
  }
  return rec as Readonly<Record<string, string | number | boolean>>
}

const parseSubject = (raw: unknown, path: string): Subject => {
  if (raw === 'command') return { command: true }
  if (!isRecord(raw)) {
    reject(`${path}: expected "command" or { call, from, args }, got ${JSON.stringify(raw)}.`)
  }
  const rec = raw as Record<string, unknown>
  closed(rec, ['call', 'from', 'args'], path, 'a subject field')
  return parseCall(rec, path)
}

const parseArm = (raw: unknown, path: string): Arm => {
  if (!isRecord(raw)) reject(`${path}: expected an arm object, got ${JSON.stringify(raw)}.`)
  const rec = raw as Record<string, unknown>
  const pattern = parsePattern(at(rec, 'pattern'), `${path}.pattern`)

  if ('either' in rec) {
    closed(rec, ['pattern', 'either', 'onLeft', 'onRight'], path, 'an either-arm field')
    const eitherRaw = at(rec, 'either')
    if (!isRecord(eitherRaw)) reject(`${path}.either: expected { call, from, args, bind }.`)
    const eRec = eitherRaw as Record<string, unknown>
    closed(eRec, ['call', 'from', 'args', 'bind'], `${path}.either`, 'an either field')
    const call = parseCall(eRec, `${path}.either`)
    const onRightRaw = at(rec, 'onRight')
    return {
      pattern,
      kind: 'either',
      subject: { ...call, bind: ident(at(eRec, 'bind'), `${path}.either.bind`) },
      onLeft: parseConstruction(at(rec, 'onLeft'), `${path}.onLeft`),
      onRight: isRecord(onRightRaw) && 'on' in onRightRaw
        ? parseDispatch(onRightRaw, `${path}.onRight`)
        : parseConstruction(onRightRaw, `${path}.onRight`),
    }
  }
  if ('onRight' in rec) {
    closed(rec, ['pattern', 'onRight'], path, 'a nested-dispatch field')
    return { pattern, kind: 'dispatch', inner: parseDispatch(at(rec, 'onRight'), `${path}.onRight`) }
  }
  closed(rec, ['pattern', 'channel', 'construct', 'with'], path, 'a construction field')
  return { pattern, kind: 'construct', target: parseConstruction(rec, path) }
}

const parseDispatch = (raw: unknown, path: string): Dispatch => {
  if (!isRecord(raw)) reject(`${path}: expected { on, arms, fallback? }.`)
  const rec = raw as Record<string, unknown>
  closed(rec, ['on', 'arms', 'fallback'], path, 'a dispatch field')
  const arms = at(rec, 'arms')
  if (!Array.isArray(arms) || arms.length === 0) reject(`${path}.arms: expected a non-empty array of arms.`)
  const fallbackRaw = at(rec, 'fallback')
  return {
    on: parseSubject(at(rec, 'on'), `${path}.on`),
    arms: (arms as ReadonlyArray<unknown>).map((a, i) => parseArm(a, `${path}.arms[${i}]`)),
    ...(fallbackRaw === undefined ? {} : { fallback: parseConstruction(fallbackRaw, `${path}.fallback`) }),
  }
}

const parseChannel = (
  raw: unknown,
  key: 'decision' | 'error',
  top: TypeId | undefined,
): { variants: ReadonlyArray<Variant>; typeId: TypeId } => {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
    ? at(raw as Record<string, unknown>, 'variants')
    : undefined
  if (!Array.isArray(list) || list.length === 0) {
    reject(
      `${key}: expected a non-empty array of variants, got ${JSON.stringify(raw)}. Both channels must be ` +
        `inhabited; a workflow with no ${key} variant decides nothing.`,
    )
  }
  const own = Array.isArray(raw) ? undefined : at(raw as Record<string, unknown>, 'typeId')
  const typeId = own === undefined ? top : parseTypeId(own, `${key}.typeId`)
  if (typeId === undefined) {
    reject(`${key}: no TypeId. Declare one on the channel or a top-level typeId every declared union shares.`)
  }
  return {
    variants: (list as ReadonlyArray<unknown>).map((v, i) => parseVariant(v, `${key}[${i}]`)),
    typeId: typeId as TypeId,
  }
}

export const parseWorkflow = (raw: unknown): Declaration => {
  if (!isRecord(raw)) reject('the declaration must be an object.')
  const rec = raw as Record<string, unknown>
  for (const key of DERIVED) {
    if (key in rec) {
      reject(
        `${key}: derived, never declared. The emitter computes it from operation, typeId and the variant ` +
          `lists; remove the field.`,
      )
    }
  }
  closed(rec, [...DECLARED], '', 'a declaration field')
  if (at(rec, 'role') !== 'workflow') {
    reject(`role: expected "workflow", got ${JSON.stringify(at(rec, 'role'))}.`)
  }

  const operation = at(rec, 'operation')
  if (typeof operation !== 'string') {
    reject(
      `operation: expected one name as a string, got ${JSON.stringify(operation)}. A workflow exports exactly ` +
        `one function, so the field cannot hold a list.`,
    )
  }
  const topTypeIdRaw = at(rec, 'typeId')
  const topTypeId = topTypeIdRaw === undefined ? undefined : parseTypeId(topTypeIdRaw, 'typeId')

  const commandRaw = at(rec, 'command')
  if (!isRecord(commandRaw)) {
    reject(
      `command: expected { type, from } or { declare }, got ${JSON.stringify(commandRaw)}. A workflow takes ` +
        `exactly one type-annotated command object; the field cannot be omitted, nulled or listed.`,
    )
  }
  const cRec = commandRaw as Record<string, unknown>
  let command: Declaration['command']
  if ('declare' in cRec) {
    closed(cRec, ['declare'], 'command', 'a command field')
    const dRec = at(cRec, 'declare')
    if (!isRecord(dRec)) reject('command.declare: expected a variant object with its own typeId.')
    const typeIdRaw = at(dRec as Record<string, unknown>, 'typeId')
    if (typeIdRaw === undefined && topTypeId === undefined) {
      reject(
        'command.declare.typeId: a declared command owns a TypeId; declare one here or a top-level typeId.',
      )
    }
    const withoutTypeId = { ...(dRec as Record<string, unknown>) }
    delete withoutTypeId.typeId
    command = {
      declare: parseVariant(withoutTypeId, 'command.declare'),
      typeId: typeIdRaw === undefined
        ? (topTypeId as TypeId)
        : parseTypeId(typeIdRaw, 'command.declare.typeId'),
    }
  } else {
    closed(cRec, ['type', 'from'], 'command', 'a command field')
    command = {
      type: ident(at(cRec, 'type'), 'command.type'),
      from: moduleSpecifier(at(cRec, 'from'), 'command.from'),
    }
  }

  const decisionRaw = at(rec, 'decision')
  let decision: Declaration['decision']
  if (isRecord(decisionRaw) && 'imported' in decisionRaw) {
    closed(
      decisionRaw as Record<string, unknown>,
      ['imported', 'constructors'],
      'decision',
      'a decision field',
    )
    const impRaw = at(decisionRaw as Record<string, unknown>, 'imported')
    if (!isRecord(impRaw)) reject('decision.imported: expected { type, from }.')
    closed(impRaw as Record<string, unknown>, ['type', 'from'], 'decision.imported', 'an imported field')
    const ctors = at(decisionRaw as Record<string, unknown>, 'constructors')
    if (!Array.isArray(ctors) || ctors.length === 0) {
      reject(
        'decision.constructors: expected a non-empty array; an imported decision union names the classes this workflow returns.',
      )
    }
    decision = {
      importedType: ident(at(impRaw as Record<string, unknown>, 'type'), 'decision.imported.type'),
      from: moduleSpecifier(at(impRaw as Record<string, unknown>, 'from'), 'decision.imported.from'),
      constructors: (ctors as ReadonlyArray<unknown>).map((c, i) => ident(c, `decision.constructors[${i}]`)),
    }
  } else {
    decision = parseChannel(decisionRaw, 'decision', topTypeId)
  }
  const error = parseChannel(at(rec, 'error'), 'error', topTypeId)
  const dispatch = parseDispatch(at(rec, 'dispatch'), 'dispatch')

  const constructible = new Set<string>([
    ...('variants' in decision ? decision.variants.map((v) => v.class) : decision.constructors),
    ...error.variants.map((v) => v.class),
  ])
  const errorClasses = new Set(error.variants.map((v) => v.class))
  const constructed = new Set<string>()

  const walk = (d: Dispatch, path: string): void => {
    const check = (t: Construction, where: string): void => {
      if (!constructible.has(t.construct)) {
        reject(
          `${where} constructs ${t.construct}, which no variant declares. A construction names a declared variant.`,
        )
      }
      if (errorClasses.has(t.construct) !== (t.channel === 'left')) {
        reject(
          `${where}: ${t.construct} is ${errorClasses.has(t.construct) ? 'an error' : 'a decision'} variant and ` +
            `cannot ride the ${t.channel} channel. Errors ride left, decisions ride right; the channel is not ` +
            `the author's to swap.`,
        )
      }
      constructed.add(t.construct)
    }
    for (const [i, arm] of d.arms.entries()) {
      const where = `${path}.arms[${i}]`
      if (arm.kind === 'construct') check(arm.target, where)
      else if (arm.kind === 'dispatch') walk(arm.inner, where)
      else {
        check(arm.onLeft, `${where}.onLeft`)
        if ('on' in arm.onRight) walk(arm.onRight, `${where}.onRight`)
        else check(arm.onRight, `${where}.onRight`)
      }
    }
    if (d.fallback !== undefined) check(d.fallback, `${path}.fallback`)
  }
  walk(dispatch, 'dispatch')

  if ('variants' in decision) {
    for (const v of [...decision.variants, ...error.variants]) {
      if (!constructed.has(v.class)) {
        reject(
          `${v.class} is declared but no dispatch arm constructs it. A variant nothing returns makes the union ` +
            `lie; delete it or give it an arm.`,
        )
      }
    }
    if (
      dispatch.fallback === undefined &&
      dispatch.arms.length < decision.variants.length + error.variants.length
    ) {
      reject(
        `dispatch has no fallback and fewer arms than variants, so the dispatch is not total. Give every variant ` +
          `an arm, or declare a fallback.`,
      )
    }
  }

  return {
    operation: operation as string,
    ...(topTypeId === undefined ? {} : { typeId: topTypeId }),
    command,
    decision,
    error,
    dispatch,
  }
}

const renderFieldType = (t: FieldType): string => {
  if (t.kind === 'ref') return t.name
  if (t.kind === 'nonEmptyArray') return `S.NonEmptyArray(${renderFieldType(t.of)})`
  if (t.kind === 'array') return `S.Array(${renderFieldType(t.of)})`
  if (t.kind === 'int') return 'S.Int'
  return `S.${t.kind[0]!.toUpperCase()}${t.kind.slice(1)}`
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

/**
 * A path renders from a known root - `command`, or a name an enclosing arm bound - and every
 * other head is a field of the command. That is what keeps a path from having to spell its
 * own subject.
 */
const renderPath = (p: Path, roots: ReadonlySet<string>): string => {
  const [head, ...rest] = p.segments
  const base = roots.has(head!.name) ? head!.name : `command.${head!.name}`
  return rest.reduce((acc, seg) => `${acc}${seg.optional ? '?.' : '.'}${seg.name}`, base)
}

const renderValue = (v: FieldValue, roots: ReadonlySet<string>): string =>
  'call' in v ? `${v.call}(${v.args.map((a) => renderPath(a, roots)).join(', ')})` : renderPath(v.read, roots)

/**
 * The payload is omitted only for a variant this declaration declares with no fields. An
 * imported constructor's shape is unknown here, so it always receives an object: guessing it
 * is fieldless would be an emission the declaration cannot justify.
 */
const renderConstruction = (
  t: Construction,
  roots: ReadonlySet<string>,
  fieldless: ReadonlySet<string>,
): string => {
  const args = Object.entries(t.with)
  const payload = args.length > 0
    ? `{ ${args.map(([n, v]) => `${n}: ${renderValue(v, roots)}`).join(', ')} }`
    : fieldless.has(t.construct)
    ? ''
    : '{}'
  return `Either.${t.channel}(new ${t.construct}(${payload}))`
}

const renderPattern = (p: Pattern): string =>
  typeof p === 'string'
    ? `'${p}'`
    : `{ ${Object.entries(p).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} }`

const renderSubject = (s: Subject, roots: ReadonlySet<string>): string =>
  'command' in s ? 'command' : `${s.call}(${s.args.map((a) => renderPath(a, roots)).join(', ')})`

const renderDispatch = (
  d: Dispatch,
  roots: ReadonlySet<string>,
  indent: string,
  fieldless: ReadonlySet<string>,
): string => {
  const lines = [`Match.value(${renderSubject(d.on, roots)}).pipe(`]
  for (const arm of d.arms) {
    const head = `${indent}  Match.when(${renderPattern(arm.pattern)}, `
    if (arm.kind === 'construct') {
      lines.push(`${head}() => ${renderConstruction(arm.target, roots, fieldless)}),`)
      continue
    }
    if (arm.kind === 'dispatch') {
      lines.push(`${head}() =>`)
      lines.push(`${indent}    ${renderDispatch(arm.inner, roots, `${indent}    `, fieldless)}),`)
      continue
    }
    const bound = new Set([...roots, arm.subject.bind])
    lines.push(`${head}() =>`)
    lines.push(
      `${indent}    Either.match(${arm.subject.call}(${
        arm.subject.args.map((a) => renderPath(a, roots)).join(', ')
      }), {`,
    )
    lines.push(`${indent}      onLeft: () => ${renderConstruction(arm.onLeft, roots, fieldless)},`)
    if ('on' in arm.onRight) {
      lines.push(`${indent}      onRight: (${arm.subject.bind}) =>`)
      lines.push(`${indent}        ${renderDispatch(arm.onRight, bound, `${indent}        `, fieldless)},`)
    } else {
      lines.push(
        `${indent}      onRight: (${arm.subject.bind}) => ${renderConstruction(arm.onRight, bound, fieldless)},`,
      )
    }
    lines.push(`${indent}    })),`)
  }
  lines.push(
    d.fallback === undefined
      ? `${indent}  Match.exhaustive,`
      : `${indent}  Match.orElse(() => ${renderConstruction(d.fallback, roots, fieldless)}),`,
  )
  lines.push(`${indent})`)
  return lines.join('\n')
}

const collectCalls = (d: Dispatch, into: Map<string, Set<string>>): void => {
  const add = (from: string, name: string): void => {
    const set = into.get(from) ?? new Set<string>()
    set.add(name)
    into.set(from, set)
  }
  const fromValues = (t: Construction): void => {
    for (const v of Object.values(t.with)) if ('call' in v) add(v.from, v.call)
  }
  if (!('command' in d.on)) add(d.on.from, d.on.call)
  for (const arm of d.arms) {
    if (arm.kind === 'construct') fromValues(arm.target)
    else if (arm.kind === 'dispatch') collectCalls(arm.inner, into)
    else {
      add(arm.subject.from, arm.subject.call)
      fromValues(arm.onLeft)
      if ('on' in arm.onRight) collectCalls(arm.onRight, into)
      else fromValues(arm.onRight)
    }
  }
  if (d.fallback !== undefined) fromValues(d.fallback)
}

export const emitWorkflow = (decl: Declaration): string => {
  const values = new Map<string, Set<string>>()
  const types = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, from: string, name: string): void => {
    const set = map.get(from) ?? new Set<string>()
    set.add(name)
    map.set(from, set)
  }

  const commandType = 'declare' in decl.command ? decl.command.declare.class : decl.command.type
  if (!('declare' in decl.command)) add(types, decl.command.from, decl.command.type)

  const declaredVariantTypes = (variants: ReadonlyArray<Variant>): void => {
    for (const v of variants) {
      for (const t of Object.values(v.fields)) {
        const seen = t.kind === 'ref'
          ? t
          : t.kind === 'array' || t.kind === 'nonEmptyArray'
          ? t.of
          : undefined
        if (seen !== undefined && seen.kind === 'ref' && seen.from !== undefined) {
          add(values, seen.from, seen.name)
        }
      }
    }
  }
  if ('declare' in decl.command) declaredVariantTypes([decl.command.declare])
  if ('variants' in decl.decision) declaredVariantTypes(decl.decision.variants)
  declaredVariantTypes(decl.error.variants)

  /** Declared variants with no payload: the only classes whose constructor may take no argument. */
  const fieldless = new Set(
    [
      ...('variants' in decl.decision ? decl.decision.variants : []),
      ...decl.error.variants,
    ].filter((v) => Object.keys(v.fields).length === 0).map((v) => v.class),
  )

  const decisionType = 'variants' in decl.decision
    ? decl.decision.variants.map((v) => v.class).join(' | ')
    : decl.decision.importedType
  if (!('variants' in decl.decision)) {
    add(types, decl.decision.from, decl.decision.importedType)
    for (const c of decl.decision.constructors) add(values, decl.decision.from, c)
  }
  const errorType = decl.error.variants.map((v) => v.class).join(' | ')

  collectCalls(decl.dispatch, values)

  const importLines = [
    `import { Workflow } from '@systemfsoftware/effect-cell-types'`,
    `import * as Either from 'effect/Either'`,
    `import * as Match from 'effect/Match'`,
    `import * as S from 'effect/Schema'`,
    ...[...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([from, names]) =>
      `import { ${[...names].sort().join(', ')} } from '${from}'`
    ),
    ...[...types.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([from, names]) =>
      `import type { ${[...names].sort().join(', ')} } from '${from}'`
    ),
  ]

  const typeIdBlock = (id: TypeId): ReadonlyArray<string> => [
    `const ${id.name}TypeId: unique symbol = Symbol.for('${id.namespace}/${id.name}')`,
    `type ${id.name}TypeId = typeof ${id.name}TypeId`,
    ``,
  ]

  const body: Array<string> = []
  const emitted = new Set<string>()
  const pushTypeId = (id: TypeId): void => {
    if (emitted.has(id.name)) return
    emitted.add(id.name)
    body.push(...typeIdBlock(id))
  }

  if ('declare' in decl.command) {
    pushTypeId(decl.command.typeId)
    body.push(renderVariant(decl.command.declare, `${decl.command.typeId.name}TypeId`, 'TaggedClass'), ``)
  }
  if ('variants' in decl.decision) {
    pushTypeId(decl.decision.typeId)
    for (const v of decl.decision.variants) {
      body.push(renderVariant(v, `${decl.decision.typeId.name}TypeId`, 'TaggedClass'))
    }
  }
  pushTypeId(decl.error.typeId)
  for (const v of decl.error.variants) {
    body.push(renderVariant(v, `${decl.error.typeId.name}TypeId`, 'TaggedError'))
  }
  body.push(``)

  if (decl.typeId !== undefined) {
    body.push(
      `export type ${decl.typeId.name}Workflow = Workflow.Workflow<${commandType}, ${decisionType}, ${errorType}>`,
      ``,
    )
  }

  return [
    ...importLines,
    ``,
    ...body,
    `export const ${decl.operation} = Workflow.make(`,
    `  (command: ${commandType}): Either.Either<${decisionType}, ${errorType}> =>`,
    `    ${renderDispatch(decl.dispatch, new Set(['command']), '    ', fieldless)},`,
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
