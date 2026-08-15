#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Emits an `executor` cell from a declaration that carries no source text.
 *
 * An executor's body is effectful, so it cannot move to a `kernel` cell the way a workflow's
 * pure decision does - `kernel-no-effect-runtime` forbids it. The body therefore has to be
 * data or it has to be source text, and this file is the attempt at data: a closed list of
 * steps, each a construct the emitter knows how to write.
 *
 * Every refusal names what the declaration may contain. That matters more here than for the
 * workflow role: the refusals are the measurement. A construct this language cannot express
 * is a construct the role's real cells need and a declaration cannot carry, and the first
 * such construct on a real cell is the counterexample rather than a gap to paper over with a
 * `code` field.
 */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** A TypeScript type reference, written as data: a name, never an expression. */
const TYPE_REF = /^[A-Za-z_$][A-Za-z0-9_$.<>,[\]| ]*$/

const reject = (message: string): never => {
  throw new Error(`declaration rejected: ${message}`)
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const at = (raw: Record<string, unknown>, key: string): unknown => (key in raw ? raw[key] : undefined)

const closed = (rec: Record<string, unknown>, allowed: readonly string[], path: string, what: string): void => {
  for (const key of Object.keys(rec)) {
    if (!allowed.includes(key)) {
      reject(`${path}.${key}: not ${what}. The surface is exactly ${allowed.join(', ')}.`)
    }
  }
}

const ident = (v: unknown, path: string): string => {
  if (typeof v !== 'string') reject(`${path}: expected one name as a string, got ${JSON.stringify(v)}.`)
  const name = v as string
  if (!IDENT.test(name)) reject(`${path}: ${JSON.stringify(name)} is not an identifier.`)
  return name
}

const typeRef = (v: unknown, path: string): string => {
  if (typeof v !== 'string') reject(`${path}: expected a type reference as a string, got ${JSON.stringify(v)}.`)
  const t = v as string
  if (!TYPE_REF.test(t)) {
    reject(
      `${path}: ${JSON.stringify(t)} is not a type reference. A type is a name with type arguments; ` +
        `anything else is an expression, and an expression here is source text.`,
    )
  }
  return t
}

const moduleSpecifier = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v === '') reject(`${path}: expected a module specifier string.`)
  return v as string
}

/** A dotted read off a parameter or a bound name: `ctx.sessionManager`, never a call. */
type Path = readonly string[]

type Literal = string | number | boolean | null

type Value =
  | { readonly read: Path }
  | { readonly literal: Literal }
  | { readonly call: string; readonly from: string; readonly args: readonly Value[] }
  | { readonly invoke: Path; readonly args: readonly Value[] }
  | { readonly yield: Value }
  | { readonly cond: Condition; readonly then: Value; readonly otherwise: Value }
  | { readonly object: { readonly spread: readonly Value[]; readonly fields: Readonly<Record<string, Value>> } }
  | { readonly thunk: Value }

type Condition =
  | { readonly read: Path; readonly is: Literal }
  | { readonly read: Path; readonly notIn: readonly Literal[] }

type Step =
  | { readonly guard: Condition }
  | { readonly bind: { readonly name: string; readonly type?: string }; readonly value: Value }
  | { readonly effect: Value }
  | { readonly result: Value | null }

interface ImportSpec {
  readonly module: string
  readonly values: readonly string[]
  readonly types: readonly string[]
  readonly typeOnly: boolean
}

interface ParamSpec {
  readonly name: string
  readonly type: string
}

interface Declaration {
  readonly operation: string
  readonly deps: { readonly type: string }
  readonly imports: readonly ImportSpec[]
  readonly params: readonly ParamSpec[]
  /** Prose above the export, as lines. Documentation is content, never code. */
  readonly doc: readonly string[]
  readonly body: { readonly steps: readonly Step[] }
}

const DERIVED = ['depsTagName', 'depsTagFrom', 'wrapper', 'imports.effect'] as const
const DECLARED = ['role', 'operation', 'deps', 'imports', 'params', 'doc', 'body'] as const

const literal = (v: unknown, path: string): Literal => {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  reject(`${path}: expected a string, number, boolean or null literal, got ${JSON.stringify(v)}.`)
  return null
}

const renderLiteral = (l: Literal): string => (typeof l === 'string' ? `'${l}'` : String(l))

const parsePath = (v: unknown, path: string): Path => {
  if (!Array.isArray(v) || v.length === 0) {
    reject(`${path}: expected a non-empty array of names. A read is a path, never a string to splice.`)
  }
  return (v as readonly unknown[]).map((seg, i) => ident(seg, `${path}[${i}]`))
}

const parseCondition = (v: unknown, path: string): Condition => {
  if (!isRecord(v)) reject(`${path}: expected { read, is } or { read, notIn }.`)
  const rec = v as Record<string, unknown>
  const read = parsePath(at(rec, 'read'), `${path}.read`)
  if ('notIn' in rec) {
    closed(rec, ['read', 'notIn'], path, 'a condition field')
    const list = at(rec, 'notIn')
    if (!Array.isArray(list) || list.length === 0) reject(`${path}.notIn: expected a non-empty array of literals.`)
    return { read, notIn: (list as readonly unknown[]).map((l, i) => literal(l, `${path}.notIn[${i}]`)) }
  }
  closed(rec, ['read', 'is'], path, 'a condition field')
  return { read, is: literal(at(rec, 'is'), `${path}.is`) }
}

const parseValue = (v: unknown, path: string): Value => {
  if (!isRecord(v)) {
    reject(
      `${path}: expected a value object, got ${JSON.stringify(v)}. A value is { read }, { literal }, ` +
        `{ call, from, args }, { invoke, args }, { yield }, { cond, then, otherwise }, { object } or { thunk }.`,
    )
  }
  const rec = v as Record<string, unknown>
  if ('read' in rec) {
    closed(rec, ['read'], path, 'a read field')
    return { read: parsePath(at(rec, 'read'), `${path}.read`) }
  }
  if ('literal' in rec) {
    closed(rec, ['literal'], path, 'a literal field')
    return { literal: literal(at(rec, 'literal'), `${path}.literal`) }
  }
  if ('call' in rec) {
    closed(rec, ['call', 'from', 'args'], path, 'a call field')
    return {
      call: ident(at(rec, 'call'), `${path}.call`),
      from: moduleSpecifier(at(rec, 'from'), `${path}.from`),
      args: parseArgs(at(rec, 'args'), `${path}.args`),
    }
  }
  if ('invoke' in rec) {
    closed(rec, ['invoke', 'args'], path, 'an invoke field')
    return { invoke: parsePath(at(rec, 'invoke'), `${path}.invoke`), args: parseArgs(at(rec, 'args'), `${path}.args`) }
  }
  if ('yield' in rec) {
    closed(rec, ['yield'], path, 'a yield field')
    return { yield: parseValue(at(rec, 'yield'), `${path}.yield`) }
  }
  if ('cond' in rec) {
    closed(rec, ['cond', 'then', 'otherwise'], path, 'a conditional field')
    return {
      cond: parseCondition(at(rec, 'cond'), `${path}.cond`),
      then: parseValue(at(rec, 'then'), `${path}.then`),
      otherwise: parseValue(at(rec, 'otherwise'), `${path}.otherwise`),
    }
  }
  if ('object' in rec) {
    closed(rec, ['object'], path, 'an object field')
    const obj = at(rec, 'object')
    if (!isRecord(obj)) reject(`${path}.object: expected { spread?, fields? }.`)
    const orec = obj as Record<string, unknown>
    closed(orec, ['spread', 'fields'], `${path}.object`, 'an object field')
    const spreadRaw = at(orec, 'spread') ?? []
    if (!Array.isArray(spreadRaw)) reject(`${path}.object.spread: expected an array of values.`)
    const fieldsRaw = at(orec, 'fields') ?? {}
    if (!isRecord(fieldsRaw)) reject(`${path}.object.fields: expected an object of values.`)
    return {
      object: {
        spread: (spreadRaw as readonly unknown[]).map((s, i) => parseValue(s, `${path}.object.spread[${i}]`)),
        fields: Object.fromEntries(
          Object.entries(fieldsRaw as Record<string, unknown>).map(([k, f]) => [
            ident(k, `${path}.object.fields key`),
            parseValue(f, `${path}.object.fields.${k}`),
          ]),
        ),
      },
    }
  }
  if ('thunk' in rec) {
    closed(rec, ['thunk'], path, 'a thunk field')
    return { thunk: parseValue(at(rec, 'thunk'), `${path}.thunk`) }
  }
  return reject(
    `${path}: no known value construct. Present keys: ${Object.keys(rec).join(', ')}. This language covers ` +
      `read, literal, call, invoke, yield, cond, object and thunk; a construct outside that set is not ` +
      `expressible as data and must not be admitted as source text.`,
  )
}

const parseArgs = (v: unknown, path: string): readonly Value[] => {
  if (!Array.isArray(v)) reject(`${path}: expected an array of values.`)
  return (v as readonly unknown[]).map((a, i) => parseValue(a, `${path}[${i}]`))
}

const parseStep = (v: unknown, path: string): Step => {
  if (!isRecord(v)) reject(`${path}: expected a step object.`)
  const rec = v as Record<string, unknown>
  if ('guard' in rec) {
    closed(rec, ['guard'], path, 'a guard field')
    return { guard: parseCondition(at(rec, 'guard'), `${path}.guard`) }
  }
  if ('bind' in rec) {
    closed(rec, ['bind', 'value'], path, 'a bind field')
    const bind = at(rec, 'bind')
    if (!isRecord(bind)) reject(`${path}.bind: expected { name, type? }.`)
    const brec = bind as Record<string, unknown>
    closed(brec, ['name', 'type'], `${path}.bind`, 'a bind field')
    const type = at(brec, 'type')
    return {
      bind: {
        name: ident(at(brec, 'name'), `${path}.bind.name`),
        ...(type === undefined ? {} : { type: typeRef(type, `${path}.bind.type`) }),
      },
      value: parseValue(at(rec, 'value'), `${path}.value`),
    }
  }
  if ('effect' in rec) {
    closed(rec, ['effect'], path, 'an effect field')
    return { effect: parseValue(at(rec, 'effect'), `${path}.effect`) }
  }
  if ('result' in rec) {
    closed(rec, ['result'], path, 'a result field')
    const r = at(rec, 'result')
    return { result: r === null ? null : parseValue(r, `${path}.result`) }
  }
  return reject(
    `${path}: no known step. Present keys: ${Object.keys(rec).join(', ')}. A step is { guard }, ` +
      `{ bind, value }, { effect } or { result }.`,
  )
}

const pascal = (name: string): string => `${name[0]!.toUpperCase()}${name.slice(1)}`

export const parseExecutor = (raw: unknown): Declaration => {
  if (!isRecord(raw)) reject('the declaration must be an object.')
  const rec = raw as Record<string, unknown>
  for (const key of DERIVED) {
    if (key in rec) reject(`${key}: derived, never declared. Remove the field.`)
  }
  closed(rec, DECLARED, 'declaration', 'a declaration field')
  if (at(rec, 'role') !== 'executor') reject(`role: expected "executor", got ${JSON.stringify(at(rec, 'role'))}.`)

  const depsRaw = at(rec, 'deps')
  if (!isRecord(depsRaw)) {
    reject('deps: expected { type }. An executor always owns a deps tag; the field cannot be omitted or nulled.')
  }
  closed(depsRaw as Record<string, unknown>, ['type'], 'deps', 'a deps field')

  const importsRaw = at(rec, 'imports') ?? []
  if (!Array.isArray(importsRaw)) reject('imports: expected an array.')
  const imports = (importsRaw as readonly unknown[]).map((i, n) => {
    const p = `imports[${n}]`
    if (!isRecord(i)) reject(`${p}: expected { module, values?, types?, typeOnly? }.`)
    const irec = i as Record<string, unknown>
    closed(irec, ['module', 'values', 'types', 'typeOnly'], p, 'an import field')
    const values = at(irec, 'values') ?? []
    const types = at(irec, 'types') ?? []
    if (!Array.isArray(values) || !Array.isArray(types)) reject(`${p}: values and types are arrays of names.`)
    return {
      module: moduleSpecifier(at(irec, 'module'), `${p}.module`),
      values: (values as readonly unknown[]).map((x, j) => ident(x, `${p}.values[${j}]`)),
      types: (types as readonly unknown[]).map((x, j) => ident(x, `${p}.types[${j}]`)),
      typeOnly: at(irec, 'typeOnly') === true,
    }
  })

  const paramsRaw = at(rec, 'params')
  if (!Array.isArray(paramsRaw)) reject('params: expected an array of { name, type }.')
  const params = (paramsRaw as readonly unknown[]).map((p, n) => {
    const at_ = `params[${n}]`
    if (!isRecord(p)) reject(`${at_}: expected { name, type }.`)
    const prec = p as Record<string, unknown>
    closed(prec, ['name', 'type'], at_, 'a param field')
    return { name: ident(at(prec, 'name'), `${at_}.name`), type: typeRef(at(prec, 'type'), `${at_}.type`) }
  })

  const docRaw = at(rec, 'doc') ?? []
  if (!Array.isArray(docRaw)) reject('doc: expected an array of prose lines.')

  const bodyRaw = at(rec, 'body')
  if (!isRecord(bodyRaw)) reject('body: expected { steps }.')
  closed(bodyRaw as Record<string, unknown>, ['steps'], 'body', 'a body field')
  const stepsRaw = at(bodyRaw as Record<string, unknown>, 'steps')
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    reject('body.steps: expected a non-empty array. An executor that runs nothing is not a cell.')
  }

  return {
    operation: ident(at(rec, 'operation'), 'operation'),
    deps: { type: typeRef(at(depsRaw as Record<string, unknown>, 'type'), 'deps.type') },
    imports,
    params,
    doc: (docRaw as readonly unknown[]).map((l, i) => {
      if (typeof l !== 'string') reject(`doc[${i}]: expected a prose line as a string.`)
      return l as string
    }),
    body: { steps: (stepsRaw as readonly unknown[]).map((s, i) => parseStep(s, `body.steps[${i}]`)) },
  }
}

const renderPath = (p: Path): string => p.join('.')

const renderCondition = (c: Condition): string =>
  'notIn' in c
    ? c.notIn.map((l) => `${renderPath(c.read)} !== ${renderLiteral(l)}`).join(' && ')
    : `${renderPath(c.read)} === ${renderLiteral(c.is)}`

const renderValue = (v: Value): string => {
  if ('read' in v) return renderPath(v.read)
  if ('literal' in v) return renderLiteral(v.literal)
  if ('call' in v) return `${v.call}(${v.args.map(renderValue).join(', ')})`
  if ('invoke' in v) return `${renderPath(v.invoke)}(${v.args.map(renderValue).join(', ')})`
  if ('yield' in v) return `yield* ${renderValue(v.yield)}`
  if ('cond' in v) return `${renderCondition(v.cond)}\n    ? ${renderValue(v.then)}\n    : ${renderValue(v.otherwise)}`
  if ('thunk' in v) return `() => ${renderValue(v.thunk)}`
  const parts = [
    ...v.object.spread.map((s) => `...${renderValue(s)}`),
    ...Object.entries(v.object.fields).map(([k, f]) => `${k}: ${renderValue(f)}`),
  ]
  return `{\n    ${parts.join(',\n    ')},\n  }`
}

const renderStep = (s: Step): string => {
  if ('guard' in s) return `  if (${renderCondition(s.guard)}) return`
  if ('bind' in s) {
    const annotation = s.bind.type === undefined ? '' : `: ${s.bind.type}`
    return `  const ${s.bind.name}${annotation} = ${renderValue(s.value)}`
  }
  if ('effect' in s) return `  ${renderValue(s.effect)}`
  return s.result === null ? '  return' : `  return ${renderValue(s.result)}`
}

/** Every module a value reaches, so the import block is derived rather than declared twice. */
const collectModules = (v: Value, into: Map<string, Set<string>>): void => {
  const add = (from: string, name: string): void => {
    const set = into.get(from) ?? new Set<string>()
    set.add(name)
    into.set(from, set)
  }
  if ('call' in v) {
    add(v.from, v.call)
    for (const a of v.args) collectModules(a, into)
    return
  }
  if ('invoke' in v) {
    for (const a of v.args) collectModules(a, into)
    return
  }
  if ('yield' in v) return collectModules(v.yield, into)
  if ('thunk' in v) return collectModules(v.thunk, into)
  if ('cond' in v) {
    collectModules(v.then, into)
    collectModules(v.otherwise, into)
    return
  }
  if ('object' in v) {
    for (const s of v.object.spread) collectModules(s, into)
    for (const f of Object.values(v.object.fields)) collectModules(f, into)
  }
}

export const emitExecutor = (d: Declaration): string => {
  const tag = `${pascal(d.operation)}ExecutorDeps`
  const called = new Map<string, Set<string>>()
  for (const step of d.body.steps) {
    if ('bind' in step) collectModules(step.value, called)
    else if ('effect' in step) collectModules(step.effect, called)
    else if ('result' in step && step.result !== null) collectModules(step.result, called)
  }

  const declaredValues = new Map<string, Set<string>>()
  for (const i of d.imports) if (!i.typeOnly) declaredValues.set(i.module, new Set(i.values))
  for (const [from, names] of called) {
    const known = declaredValues.get(from)
    for (const name of names) {
      if (known === undefined || !known.has(name)) {
        reject(
          `body calls ${name} from ${from}, which imports does not declare. A call names the module it ` +
            `comes from and the import block is derived from that; the two cannot disagree.`,
        )
      }
    }
  }

  const importLines = d.imports.map((i) => {
    const values = [...i.values].sort()
    const types = [...i.types].sort()
    if (i.typeOnly) return `import type { ${types.join(', ')} } from '${i.module}'`
    const spec = [...values, ...types.map((t) => `type ${t}`)].join(', ')
    return `import { ${spec} } from '${i.module}'`
  })

  const doc = d.doc.length === 0 ? [] : ['/**', ...d.doc.map((l) => (l === '' ? ' *' : ` * ${l}`)), ' */']

  return [
    ...importLines,
    ``,
    `export class ${tag} extends Context.Tag('${tag}')<`,
    `  ${tag},`,
    `  ${d.deps.type}`,
    `>() {}`,
    ``,
    ...doc,
    `export const ${d.operation} = Effect.fn('${d.operation}')(function*(`,
    ...d.params.map((p) => `  ${p.name}: ${p.type},`),
    `) {`,
    ...d.body.steps.map(renderStep),
    `})`,
    ``,
  ].join('\n')
}

if (import.meta.main) {
  const [declPath, outPath] = Deno.args
  if (declPath === undefined) {
    console.error('usage: executor-emit.ts <decl.json> [out.ts]')
    Deno.exit(2)
  }
  const decl = parseExecutor(JSON.parse(await Deno.readTextFile(declPath)))
  const emitted = emitExecutor(decl)
  if (outPath === undefined) console.log(emitted)
  else {
    await Deno.writeTextFile(outPath, emitted)
    console.log(`emitted ${outPath} (${emitted.length} bytes) from ${declPath}`)
  }
}
