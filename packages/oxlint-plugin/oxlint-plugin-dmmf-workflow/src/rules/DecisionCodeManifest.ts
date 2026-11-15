import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MANIFEST_FILE } from './decision-code-imports.config.js'

export interface DecisionCodeManifest {
  readonly kernels: ReadonlySet<string>
}

export type ManifestRead =
  | { readonly kind: 'read'; readonly manifest: DecisionCodeManifest }
  | { readonly kind: 'unreadable'; readonly path: string; readonly reason: string }

const EMPTY_MANIFEST: DecisionCodeManifest = { kernels: new Set() }

const MANIFEST_KEYS: ReadonlySet<string> = new Set(['kernels'])
const KERNEL_KEYS: ReadonlySet<string> = new Set(['package', 'proof'])

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

const unknownKeyOf = (record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): string | undefined =>
  Object.keys(record).find((key) => !allowed.has(key))

const isRepoRelativePath = (path: string): boolean =>
  !path.startsWith('/') && !path.startsWith('./') && !path.includes('\\') && !path.split('/').includes('..')

const isFileIn = (root: string, path: string): boolean => {
  try {
    return statSync(join(root, path)).isFile()
  } catch {
    return false
  }
}

const kernelsOf = (value: unknown, root: string): ReadonlySet<string> | string => {
  if (value === undefined) return new Set()
  if (!Array.isArray(value)) return '"kernels" is not an array'
  const packages = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) return 'a "kernels" entry is not an object'
    const extra = unknownKeyOf(entry, KERNEL_KEYS)
    if (extra !== undefined) return `a "kernels" entry has the unknown key "${extra}"`
    if (!isNonEmptyString(entry['package'])) return 'a "kernels" entry has no "package" name'
    if (!isNonEmptyString(entry['proof'])) return `the "kernels" entry "${entry['package']}" names no "proof" target`
    const proof = entry['proof']
    if (!isRepoRelativePath(proof) || !isFileIn(root, proof)) {
      return `the "kernels" entry "${
        entry['package']
      }" names the proof target "${proof}", which is not a file in the repo`
    }
    packages.add(entry['package'])
  }
  return packages
}

const parseManifest = (text: string, root: string): DecisionCodeManifest | string => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return `it is not JSON (${error instanceof Error ? error.message : String(error)})`
  }
  if (!isRecord(value)) return 'the top level is not an object'
  const extra = unknownKeyOf(value, MANIFEST_KEYS)
  if (extra !== undefined) return `the top level has the unknown key "${extra}"`
  const kernels = kernelsOf(value['kernels'], root)
  if (typeof kernels === 'string') return kernels
  return { kernels }
}

const isMissingFile = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'

const manifestsByRoot = new Map<string, ManifestRead>()

const readManifestUncached = (root: string): ManifestRead => {
  const path = join(root, MANIFEST_FILE)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return { kind: 'read', manifest: EMPTY_MANIFEST }
    return { kind: 'unreadable', path, reason: error instanceof Error ? error.message : String(error) }
  }
  const parsed = parseManifest(text, root)
  return typeof parsed === 'string' ? { kind: 'unreadable', path, reason: parsed } : { kind: 'read', manifest: parsed }
}

export const readDecisionCodeManifest = (root: string | undefined): ManifestRead => {
  if (root === undefined) return { kind: 'read', manifest: EMPTY_MANIFEST }
  const cached = manifestsByRoot.get(root)
  if (cached !== undefined) return cached
  const read = readManifestUncached(root)
  manifestsByRoot.set(root, read)
  return read
}
