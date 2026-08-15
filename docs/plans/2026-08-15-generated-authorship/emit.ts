#!/usr/bin/env -S deno run --allow-read=. --allow-write=.

/**
 * Emits an executor cell from a declaration that carries no source text.
 *
 * The experiment this settles: is a cell's SHAPE a function of data? Every
 * property the executor rule family polices - the deps `Context.Tag`, its name,
 * the single operation export, the `Effect.fn` wrapper, the parameter types, the
 * import block - is derived here from the declaration. None of them is a field a
 * declaration author can get wrong, because none of them is a field at all.
 *
 * Usage: deno run --allow-read=. --allow-write=. emit.ts <decl.json> [out.ts]
 */

interface ImportSpec {
  readonly module: string
  readonly values?: readonly string[]
  readonly types?: readonly string[]
  readonly typeOnly?: boolean
}

interface ParamSpec {
  readonly name: string
  readonly type: string
}

interface BodySpec {
  readonly module: string
  readonly export: string
}

interface ExecutorDeclaration {
  readonly role: 'executor'
  readonly operation: string
  readonly deps: { readonly type: string }
  readonly imports: readonly ImportSpec[]
  readonly params: readonly ParamSpec[]
  readonly body: BodySpec
}

/** A declaration field whose value is TypeScript makes the declaration an echo. */
const SOURCE_TEXT = /\b(?:function|return|=>|yield|await|if\s*\(|const\s+\w+\s*=)/

const assertNoSourceText = (decl: unknown, path: readonly string[] = []): void => {
  if (typeof decl === 'string') {
    if (SOURCE_TEXT.test(decl)) {
      throw new Error(`echo: declaration field ${path.join('.')} carries source text: ${decl}`)
    }
    return
  }
  if (Array.isArray(decl)) {
    decl.forEach((v, i) => assertNoSourceText(v, [...path, String(i)]))
    return
  }
  if (decl !== null && typeof decl === 'object') {
    for (const [k, v] of Object.entries(decl)) assertNoSourceText(v, [...path, k])
  }
}

const pascal = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

/** The deps tag name is DERIVED, so `executor-deps-tag-name` has nothing to police. */
const depsTagName = (operation: string): string => `${pascal(operation)}ExecutorDeps`

const renderImport = (spec: ImportSpec): string => {
  const types = (spec.types ?? []).map((t) => (spec.typeOnly ? t : `type ${t}`))
  const names = [...(spec.values ?? []), ...types]
  const prefix = spec.typeOnly ? 'import type' : 'import'
  return `${prefix} { ${names.join(', ')} } from '${spec.module}'`
}

const emitExecutor = (decl: ExecutorDeclaration): string => {
  const tag = depsTagName(decl.operation)
  const imports = [
    ...decl.imports.map(renderImport),
    `import { ${decl.body.export} } from '${decl.body.module}'`,
  ]
  const params = decl.params.map((p) => `  ${p.name}: ${p.type},`)
  const args = decl.params.map((p) => p.name).join(', ')
  return [
    ...imports,
    '',
    `export class ${tag} extends Context.Tag('${tag}')<`,
    `  ${tag},`,
    `  ${decl.deps.type}`,
    '>() {}',
    '',
    `export const ${decl.operation} = Effect.fn('${decl.operation}')(function*(`,
    ...params,
    ') {',
    `  yield* ${decl.body.export}(${args})`,
    '})',
    '',
  ].join('\n')
}
/**
 * Validates the declaration and names every rejection.
 *
 * A rejection by `TypeError` is a crash, not a language: it happens to stop the
 * violation without ever stating what the declaration may contain. Every refusal
 * below names the field and the reason, so an attempted violation produces a
 * verdict a reader can act on.
 */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Reads one field off an unknown value without asserting a shape for it. */
const field = (v: unknown, key: string): unknown =>
  typeof v === 'object' && v !== null && key in v ? Reflect.get(v, key) : undefined

const parseExecutor = (raw: unknown): ExecutorDeclaration => {
  if (typeof raw !== 'object' || raw === null) throw new Error('declaration must be an object')

  const role = field(raw, 'role')
  if (role !== 'executor') throw new Error(`role: expected "executor", got ${JSON.stringify(role)}`)

  const operation = str(field(raw, 'operation'))
  if (operation === undefined) {
    throw new Error(
      `operation: expected one name as a string, got ${JSON.stringify(field(raw, 'operation'))}. ` +
        'An executor exports exactly one operation, so the field cannot hold a list.',
    )
  }

  const deps = field(raw, 'deps')
  if (str(field(deps, 'type')) === undefined) {
    throw new Error(
      `deps: expected { type: string }, got ${JSON.stringify(deps)}. ` +
        'An executor always owns a deps tag; the field cannot be omitted or nulled.',
    )
  }

  const body = field(raw, 'body')
  if (str(field(body, 'module')) === undefined || str(field(body, 'export')) === undefined) {
    throw new Error(`body: expected { module: string, export: string }, got ${JSON.stringify(body)}`)
  }

  if (!Array.isArray(field(raw, 'params')) || !Array.isArray(field(raw, 'imports'))) {
    throw new Error('params and imports must both be arrays')
  }

  // Fields the emitter derives are refused rather than ignored, so an author who
  // tries to set one is told the value is not theirs to choose.
  for (const derived of ['depsTagName', 'depsTagFrom', 'tagName', 'exports']) {
    if (derived in raw) {
      throw new Error(
        `${derived}: derived, never declared. The deps tag name is ${depsTagName(operation)} ` +
          'and is computed from `operation`; remove the field.',
      )
    }
  }

  // Every field read below was checked above.
  return raw as unknown as ExecutorDeclaration
}

const [declPath, outPath] = Deno.args
if (declPath === undefined) {
  console.error('usage: emit.ts <decl.json> [out.ts]')
  Deno.exit(2)
}

const raw: unknown = JSON.parse(await Deno.readTextFile(declPath))
assertNoSourceText(raw)

let decl: ExecutorDeclaration
try {
  decl = parseExecutor(raw)
} catch (cause) {
  console.error(`declaration rejected: ${cause instanceof Error ? cause.message : String(cause)}`)
  Deno.exit(1)
}

const emitted = emitExecutor(decl)
if (outPath === undefined) {
  console.log(emitted)
} else {
  await Deno.writeTextFile(outPath, emitted)
  console.log(`emitted ${outPath} (${emitted.length} bytes) from ${declPath}`)
}
