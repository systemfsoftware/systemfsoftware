#!/usr/bin/env -S deno run --allow-read=. --allow-write --allow-run=dprint,tsc --allow-env
/**
 * What has to be true for this plugin to be worth having, checked by running it.
 *
 * A formatter's claim is not "it reports the spelling I dislike" but "the other
 * spelling cannot survive". Four things make that claim real, and each fails
 * loudly here rather than being asserted in prose:
 *
 *   1. REWRITE     - each spelling becomes the configured one, both directions.
 *   2. IDEMPOTENT  - a second pass changes nothing. A formatter that keeps
 *                    editing has no canonical form, so `check` could never pass.
 *   3. ROUND TRIP  - generic -> shorthand -> generic returns the original text.
 *                    This is the law that catches a rewrite which merely looks
 *                    right: a direction that loses `readonly`, drops a nesting
 *                    level, or eats a parenthesis cannot come back.
 *   4. GATED       - `dprint check` exits non-zero on the other spelling, and a
 *                    comment naming the rule does not help. This is the whole
 *                    reason the rule lives in a formatter.
 *
 * And the oracle that decides correctness rather than agreement: every rewritten
 * form still typechecks. `readonly T[]` -> `readonly Array<T>` would satisfy a
 * string comparison and not be a type at all.
 */

const ROOT = new URL('.', import.meta.url).pathname
const REPO = new URL('../../', import.meta.url).pathname
const DPRINT = `${REPO}bin/dprint`
// The committed artifact, not the build output: this harness has to run on a
// machine with no Rust toolchain, and the artifact is what dprint actually loads.
const WASM = `${ROOT}plugin.wasm`
const WORK = `${ROOT}.falsify`

interface Case {
  readonly name: string
  /** The same type, spelled with `Array<T>`. */
  readonly generic: string
  /** The same type, spelled with `T[]`. */
  readonly shorthand: string
}

/**
 * Each case is one type written two ways. The type checker cannot tell the pair
 * apart, which is exactly why a declaration upstream had to record which one an
 * author picked, and exactly what this plugin removes.
 *
 * The parenthesis cases are the ones that make the two directions asymmetric:
 * `[]` binds tighter than `|`, so the shorthand of a union needs parentheses the
 * generic form does not. A direction that forgets them changes the type, which
 * is what the round trip and the type checker are here to catch.
 */
const CASES: readonly Case[] = [
  { name: 'plain', generic: 'Array<Alpha>', shorthand: 'Alpha[]' },
  { name: 'readonly', generic: 'ReadonlyArray<Alpha>', shorthand: 'readonly Alpha[]' },
  { name: 'nested', generic: 'Array<Array<Alpha>>', shorthand: 'Alpha[][]' },
  { name: 'readonly-nested', generic: 'ReadonlyArray<Array<Alpha>>', shorthand: 'readonly Alpha[][]' },
  { name: 'union', generic: 'Array<Alpha | Beta>', shorthand: '(Alpha | Beta)[]' },
  { name: 'intersection', generic: 'Array<Alpha & Beta>', shorthand: '(Alpha & Beta)[]' },
  { name: 'fn', generic: 'Array<(x: Alpha) => Beta>', shorthand: '((x: Alpha) => Beta)[]' },
  { name: 'keyof', generic: 'Array<keyof Alpha>', shorthand: '(keyof Alpha)[]' },
  { name: 'generic-arg', generic: 'Array<Map<Alpha, Beta>>', shorthand: 'Map<Alpha, Beta>[]' },
  // Neither form applies: a tuple has no generic spelling and `Map` is not an
  // array. A rewrite that touches these is over-reaching.
  { name: 'tuple-untouched', generic: 'readonly [Alpha, Beta]', shorthand: 'readonly [Alpha, Beta]' },
  { name: 'map-untouched', generic: 'Map<Alpha, Beta>', shorthand: 'Map<Alpha, Beta>' },
]

const PRELUDE = 'export type Alpha = { a: 1 }\nexport type Beta = { b: 2 }\n'
const decl = (spelling: string): string => `export type T = ${spelling}`

const run = async (cmd: readonly string[], cwd: string): Promise<{ code: number; out: string }> => {
  const p = new Deno.Command(cmd[0], { args: cmd.slice(1), cwd, stdout: 'piped', stderr: 'piped' })
  const r = await p.output()
  return { code: r.code, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) }
}

type Style = 'generic' | 'shorthand'

const config = (style: Style): string =>
  JSON.stringify(
    {
      lineWidth: 120,
      typescript: { semiColons: 'asi', quoteStyle: 'preferSingle', arrayType: style },
      plugins: [WASM],
    },
    null,
    2,
  )

const failures: string[] = []
const fail = (what: string, detail: string): void => {
  failures.push(what)
  console.log(`FAIL ${what}`)
  console.log(`  ${detail.replaceAll('\n', '\n  ')}`)
}

await Deno.mkdir(WORK, { recursive: true })
await Deno.writeTextFile(`${WORK}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }))

const useStyle = async (style: Style): Promise<void> => {
  await Deno.writeTextFile(`${WORK}/dprint.json`, config(style))
}

/** Format one file and return the declaration line it now holds. */
const fmt = async (name: string): Promise<string> => {
  const r = await run([DPRINT, 'fmt', '--config', 'dprint.json', name], WORK)
  if (r.code !== 0) throw new Error(r.out.trim())
  return (await Deno.readTextFile(`${WORK}/${name}`)).slice(PRELUDE.length).trimEnd()
}

// 1. REWRITE, 2. IDEMPOTENT, 3. ROUND TRIP - per case, so a failure names it.
for (const c of CASES) {
  const name = `${c.name}.ts`
  const path = `${WORK}/${name}`
  try {
    // Each direction is entered from the *other* spelling, so a rule that only
    // ever sees text it already agrees with cannot pass by doing nothing.
    for (
      const [style, from, want] of [
        ['generic', c.shorthand, c.generic],
        ['shorthand', c.generic, c.shorthand],
      ] as readonly (readonly [Style, string, string])[]
    ) {
      await useStyle(style)
      await Deno.writeTextFile(path, `${PRELUDE}${decl(from)}\n`)
      const got = await fmt(name)
      if (got !== decl(want)) {
        fail(`rewrite ${c.name} -> ${style}`, `expected: ${decl(want)}\nactual:   ${got}`)
        continue
      }
      const settled = await Deno.readTextFile(path)
      await fmt(name)
      if ((await Deno.readTextFile(path)) !== settled) {
        fail(`idempotent ${c.name} -> ${style}`, 'a second pass changed the file')
      }
    }

    // 3. The law: there and back is identity.
    await useStyle('generic')
    await Deno.writeTextFile(path, `${PRELUDE}${decl(c.generic)}\n`)
    const first = await fmt(name)
    await useStyle('shorthand')
    await fmt(name)
    await useStyle('generic')
    const back = await fmt(name)
    if (back !== first) {
      fail(`round-trip ${c.name}`, `started: ${first}\nreturned: ${back}`)
    }
  } catch (error) {
    fail(`crash ${c.name}`, String(error))
  }
}

// 4. GATED - the property that makes this a formatter rather than a report.
{
  await useStyle('shorthand')
  const path = `${WORK}/gated.ts`
  await Deno.writeTextFile(path, `${PRELUDE}${decl('Array<Alpha>')}\n`)
  if ((await run([DPRINT, 'check', '--config', 'dprint.json', 'gated.ts'], WORK)).code === 0) {
    fail('gated', 'dprint check passed on the non-canonical spelling')
  }
  // The move a lint rule would accept: name the rule and claim compliance.
  await Deno.writeTextFile(
    path,
    `${PRELUDE}// canonical: arrayType shorthand\n/* eslint-disable */\n${decl('Array<Alpha>')}\n`,
  )
  if ((await run([DPRINT, 'check', '--config', 'dprint.json', 'gated.ts'], WORK)).code === 0) {
    fail('gated-by-token', 'a comment naming the rule was enough to pass')
  }
}

// The oracle: every spelling this plugin writes is still a type.
for (const style of ['generic', 'shorthand'] as const) {
  const body = CASES.map((c, i) => `export type T${i} = ${c[style]}`).join('\n')
  await Deno.writeTextFile(`${WORK}/oracle.ts`, `${PRELUDE}${body}\n`)
  const tsc = await run([`${REPO}node_modules/.bin/tsc`, '-p', 'tsconfig.json'], WORK)
  if (tsc.code !== 0) {
    fail(`typechecks ${style}`, tsc.out.trim().split('\n').slice(0, 8).join('\n'))
  }
  await Deno.remove(`${WORK}/oracle.ts`)
}

await Deno.remove(WORK, { recursive: true })

console.log(`\ncanonical: ${CASES.length} case(s) x 2 directions, 4 propert(ies), 2 oracle run(s)`)
if (failures.length > 0) {
  console.error(`${failures.length} failure(s): ${failures.join(', ')}`)
  Deno.exitCode = 1
} else {
  console.log('every claim holds')
}
