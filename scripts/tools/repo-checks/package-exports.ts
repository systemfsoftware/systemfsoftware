// Resolves a package.json "exports" map the way Node does (PACKAGE_EXPORTS_RESOLVE): exact keys, then the best
// "*" pattern, then the conditions in the order the map writes them. A reader of an exports map asks this module,
// never a path string, whether a specifier is exported and which file it reaches.

export type Json = Readonly<Record<string, unknown>>

/** The subpath map of an exports field: a string, a conditions object or a subpath object all become one. */
export const exportsMapOf = (manifest: Json): Json | undefined => {
  const value = manifest['exports']
  if (typeof value === 'string' || Array.isArray(value)) return { '.': value }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Json
  return Object.keys(record).some((key) => key.startsWith('.')) ? record : { '.': record }
}

/** The best key of the map for a subpath, and what a "*" in that key matched. */
export const matchKey = (
  map: Json,
  subpath: string,
): { readonly key: string; readonly star: string | undefined } | undefined => {
  if (Object.hasOwn(map, subpath) && !subpath.includes('*')) return { key: subpath, star: undefined }
  let best: { key: string; star: string } | undefined
  for (const key of Object.keys(map)) {
    const at = key.indexOf('*')
    if (at < 0 || key.indexOf('*', at + 1) >= 0) continue
    const head = key.slice(0, at)
    const tail = key.slice(at + 1)
    if (subpath.length < key.length || !subpath.startsWith(head) || !subpath.endsWith(tail)) continue
    if (
      best === undefined || head.length > best.key.indexOf('*') ||
      (head.length === best.key.indexOf('*') && key.length > best.key.length)
    ) {
      best = { key, star: subpath.slice(head.length, subpath.length - tail.length) }
    }
  }
  return best
}

/** A string target, null (blocked) or undefined (no condition matched, try the next fallback). */
const resolveTarget = (
  target: unknown,
  star: string | undefined,
  conditions: ReadonlySet<string>,
): string | null | undefined => {
  if (typeof target === 'string') return star === undefined ? target : target.replaceAll('*', star)
  if (target === null) return null
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = resolveTarget(item, star, conditions)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof target === 'object') {
    for (const [condition, inner] of Object.entries(target as Json)) {
      if (condition !== 'default' && !conditions.has(condition)) continue
      const found = resolveTarget(inner, star, conditions)
      if (found !== undefined) return found
    }
  }
  return undefined
}

export interface Resolution {
  readonly key: string
  /** The file reached under the conditions, null when the entry is blocked, undefined when no condition matches. */
  readonly target: string | null | undefined
}

export const resolveExports = (
  manifest: Json,
  subpath: string,
  conditions: ReadonlySet<string>,
): Resolution | undefined => {
  const map = exportsMapOf(manifest)
  if (map === undefined) return undefined
  const hit = matchKey(map, subpath)
  if (hit === undefined) return undefined
  return { key: hit.key, target: resolveTarget(map[hit.key], hit.star, conditions) }
}

/** Every concrete string target of an entry, across all its conditions. */
export const targetsOf = (target: unknown): readonly string[] => {
  if (typeof target === 'string') return [target]
  if (Array.isArray(target)) return target.flatMap(targetsOf)
  if (typeof target === 'object' && target !== null) return Object.values(target).flatMap(targetsOf)
  return []
}

export const isBuildOutput = (target: string): boolean => {
  const first = (target.startsWith('./') ? target.slice(2) : target).split('/')[0]
  return first === 'dist' || first === 'build' || first === 'lib' || first === 'out'
}
