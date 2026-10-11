// sfs-deps - the .sfs-deps tarballs a pnpm lockfile demands, the cache key that names them, and whether a
// directory holds exactly those bytes.
//
//   sfs-deps key    [--working-directory <dir>]
//   sfs-deps verify [--working-directory <dir>]
//
// Both read `<dir>/pnpm-lock.yaml`. A demanded tarball is a `packages` entry whose resolution is
// `tarball: file:.sfs-deps/<file>.tgz`; its recorded sha512 integrity names its bytes. `key` prints
// `sfs-deps-v1-<sha256>` over the sorted `<path> <integrity>` lines, or an empty key when the lockfile demands
// none, and writes `key=<key>` to GITHUB_OUTPUT. `verify` checks `<dir>/.sfs-deps/` against those integrities and
// names every missing or mismatched tarball. A lockfile that cannot be read, or that records one tarball with two
// integrities, is refused. Every refusal exits 1 with the cause on stderr.

import { parseArgs } from '@std/cli/parse-args'
import { join } from '@std/path'
import { parseAll } from '@std/yaml'
import { Result, Schema } from 'effect'

export interface Tarball {
  /** Relative to the working directory, e.g. `.sfs-deps/stryker-js-17.0.2.tgz`. */
  readonly path: string
  readonly integrity: string
}

export type Demand =
  | { readonly kind: 'demand'; readonly tarballs: readonly Tarball[] }
  | { readonly kind: 'refused'; readonly reason: string }

const SFS_DEPS = /^\.sfs-deps\/[^/]+\.tgz$/
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/

/** The part of one lockfile document this tool reads; pnpm 12 writes its own environment as a first document. */
const LockDocument = Schema.NullOr(Schema.Struct({
  packages: Schema.optional(Schema.Record(
    Schema.String,
    Schema.Struct({
      resolution: Schema.optional(Schema.Struct({
        integrity: Schema.optional(Schema.String),
        tarball: Schema.optional(Schema.String),
      })),
    }),
  )),
}))

const decodeDocument = Schema.decodeUnknownResult(LockDocument)

const refused = (reason: string): Demand => ({ kind: 'refused', reason })

/** The tarballs `lockfile` resolves from `.sfs-deps/`, sorted by path, each once. */
export const demanded = (lockfile: string): Demand => {
  let documents: unknown[]
  try {
    documents = parseAll(lockfile)
  } catch (error) {
    return refused(`pnpm-lock.yaml is not YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  const integrities = new Map<string, string>()
  for (const raw of documents) {
    const decoded = decodeDocument(raw)
    if (Result.isFailure(decoded)) {
      return refused(`pnpm-lock.yaml has an unreadable document: ${decoded.failure.message}`)
    }
    for (const [id, entry] of Object.entries(decoded.success?.packages ?? {})) {
      const tarball = entry.resolution?.tarball
      if (tarball === undefined || !tarball.startsWith('file:')) continue
      const path = tarball.slice('file:'.length).replace(/^\.\//, '')
      if (path !== '.sfs-deps' && !path.startsWith('.sfs-deps/')) continue
      if (!SFS_DEPS.test(path)) return refused(`${id} resolves to ${tarball}, not a .tgz directly in .sfs-deps/`)
      const integrity = entry.resolution?.integrity
      if (integrity === undefined || !SHA512.test(integrity)) {
        return refused(`${path} has no sha512 integrity in the lockfile (got ${String(integrity)})`)
      }
      const seen = integrities.get(path)
      if (seen !== undefined && seen !== integrity) {
        return refused(`${path} is recorded with two integrities: ${seen} and ${integrity}`)
      }
      integrities.set(path, integrity)
    }
  }
  const tarballs = [...integrities].map(([path, integrity]) => ({ path, integrity }))
  return { kind: 'demand', tarballs: tarballs.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) }
}

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Empty when nothing is demanded, so a caller can skip on it. */
export const keyOf = async (tarballs: readonly Tarball[]): Promise<string> => {
  if (tarballs.length === 0) return ''
  const lines = tarballs.map((tarball) => `${tarball.path} ${tarball.integrity}\n`).join('')
  return `sfs-deps-v1-${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines)))}`
}

export const integrityOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  `sha512-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-512', bytes))))}`

/** One line per demanded tarball that `read` cannot supply or whose bytes differ; empty when all match. */
export const problems = async (
  tarballs: readonly Tarball[],
  read: (path: string) => Promise<Uint8Array<ArrayBuffer> | undefined>,
): Promise<readonly string[]> => {
  const found: string[] = []
  for (const tarball of tarballs) {
    const bytes = await read(tarball.path)
    if (bytes === undefined) {
      found.push(`missing ${tarball.path}`)
      continue
    }
    const built = await integrityOf(bytes)
    if (built !== tarball.integrity) {
      found.push(`mismatch ${tarball.path}: lockfile ${tarball.integrity}, built ${built}`)
    }
  }
  return found
}

function fail(message: string): never {
  console.error(`sfs-deps: ${message}`)
  Deno.exit(1)
}

const readOrUndefined = async (file: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return await Deno.readFile(file)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined
    throw error
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ['working-directory'], default: { 'working-directory': '.' } })
  const [command] = args._
  if (command !== 'key' && command !== 'verify') fail('usage: sfs-deps key|verify [--working-directory <dir>]')
  const dir = args['working-directory']
  const lockfile = await readOrUndefined(join(dir, 'pnpm-lock.yaml'))
  if (lockfile === undefined) fail(`no pnpm-lock.yaml in ${dir}`)
  const demand = demanded(new TextDecoder().decode(lockfile))
  if (demand.kind === 'refused') fail(demand.reason)
  const { tarballs } = demand
  if (command === 'key') {
    const key = await keyOf(tarballs)
    for (const tarball of tarballs) console.log(`${tarball.path} ${tarball.integrity}`)
    console.log(`key=${key} tarballs=${tarballs.length}`)
    const output = Deno.env.get('GITHUB_OUTPUT')
    if (output !== undefined) await Deno.writeTextFile(output, `key=${key}\n`, { append: true })
  } else {
    const found = await problems(tarballs, (path) => readOrUndefined(join(dir, path)))
    if (found.length > 0) {
      fail(`${found.length} of ${tarballs.length} tarballs do not match the lockfile\n${found.join('\n')}`)
    }
    console.log(`verified ${tarballs.length} tarballs against the lockfile`)
  }
}
