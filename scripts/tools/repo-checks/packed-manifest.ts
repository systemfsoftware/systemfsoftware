// A publishable package's packed package.json is what its release tag digests.
// pnpm resolves `catalog:` specifiers when it packs, so a catalog value flip in
// pnpm-workspace.yaml rewrites the packed manifest of every package that names
// the entry, though no file inside the package changed. This check resolves
// each publishable manifest at the merge-base and at head the way pnpm pack
// does for catalogs, and requires a pending intent that releases every package
// whose resolved manifest moved while its version did not.
import { globToRegExp } from '@std/path'
import { parse } from '@std/yaml'
import { git, holds, parseJsonObject, Undecided, type Verdict, violated } from './verdict.ts'
import { WORKSPACE_FILE } from './workspace.ts'

type Json = Readonly<Record<string, unknown>>

export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

export interface Catalogs {
  readonly default: Readonly<Record<string, string>>
  readonly named: Readonly<Record<string, Readonly<Record<string, string>>>>
}

const stringMap = (value: unknown, label: string): Readonly<Record<string, string>> => {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Undecided(`${label}: not a mapping`)
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new Undecided(`${label}.${key}: not a string`)
  }
  return value as Readonly<Record<string, string>>
}

export const catalogsOf = (doc: Json): Catalogs => {
  const named = doc['catalogs']
  if (named !== undefined && named !== null && (typeof named !== 'object' || Array.isArray(named))) {
    throw new Undecided(`${WORKSPACE_FILE}: catalogs is not a mapping`)
  }
  return {
    default: stringMap(doc['catalog'], `${WORKSPACE_FILE}: catalog`),
    named: Object.fromEntries(
      Object.entries((named ?? {}) as Json).map(([name, entries]) => [
        name,
        stringMap(entries, `${WORKSPACE_FILE}: catalogs.${name}`),
      ]),
    ),
  }
}

/** The manifest with every `catalog:` / `catalog:<name>` specifier replaced by the catalog's range, as pnpm pack writes it. */
export const resolveCatalogs = (manifest: Json, catalogs: Catalogs, label: string): Json => {
  const resolved: Record<string, unknown> = { ...manifest }
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (deps === undefined) continue
    const entries = stringMap(deps, `${label}: ${field}`)
    resolved[field] = Object.fromEntries(
      Object.entries(entries).map(([dep, spec]) => {
        if (!spec.startsWith('catalog:')) return [dep, spec]
        const name = spec.slice('catalog:'.length)
        const catalog = name === '' || name === 'default' ? catalogs.default : catalogs.named[name]
        const range = catalog?.[dep]
        if (range === undefined) throw new Undecided(`${label}: ${field}.${dep} names ${spec}, which has no entry`)
        return [dep, range]
      }),
    )
  }
  return resolved
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner)

/** One line per dependency range the resolved manifest changed, `field.dep old -> new`. */
export const rangeChanges = (before: Json, after: Json): readonly string[] => {
  const lines: string[] = []
  for (const field of DEPENDENCY_FIELDS) {
    const old = (before[field] ?? {}) as Readonly<Record<string, string>>
    const now = (after[field] ?? {}) as Readonly<Record<string, string>>
    for (const dep of [...new Set([...Object.keys(old), ...Object.keys(now)])].sort()) {
      if (old[dep] !== now[dep]) lines.push(`${field}.${dep} ${old[dep] ?? '(none)'} -> ${now[dep] ?? '(none)'}`)
    }
  }
  return lines
}

/** Package names a pending intent releases: a frontmatter row `"<pkg>": patch|minor|major`. */
export const releasedBy = (intent: string): readonly string[] => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(intent)?.[1] ?? ''
  return front.split(/\r?\n/).flatMap((line) => {
    const row = /^\s*["']?([^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/.exec(line)
    return row === null ? [] : [row[1]!]
  })
}

export interface Release {
  readonly name: string
  readonly version: string
  readonly packed: Json
}

/** Every package whose packed manifest moved under an unchanged version with no pending intent releasing it. */
export const judgePackedManifests = (
  base: ReadonlyMap<string, Release>,
  head: ReadonlyMap<string, Release>,
  released: ReadonlySet<string>,
): readonly string[] =>
  [...head.values()].flatMap((now) => {
    const before = base.get(now.name)
    if (before === undefined || before.version !== now.version || released.has(now.name)) return []
    if (canonical(before.packed) === canonical(now.packed)) return []
    const changes = rangeChanges(before.packed, now.packed)
    return [`${now.name}@${now.version}: ${changes.length > 0 ? changes.join(', ') : 'manifest fields changed'}`]
  })

const showAt = (rev: string, path: string): Promise<string> => git(['show', `${rev}:${path}`])

const packageGlobs = (doc: Json): readonly string[] => {
  const declared = doc['packages']
  if (!Array.isArray(declared) || declared.some((entry) => typeof entry !== 'string')) {
    throw new Undecided(`${WORKSPACE_FILE}: no \`packages:\` sequence of strings`)
  }
  return declared.map((entry: string) => entry.replace(/\/+$/, ''))
}

const releasesAt = async (rev: string): Promise<ReadonlyMap<string, Release>> => {
  let doc: unknown
  try {
    doc = parse(await showAt(rev, WORKSPACE_FILE))
  } catch (cause) {
    if (cause instanceof Undecided) throw cause
    throw new Undecided(`${rev}:${WORKSPACE_FILE}: unreadable YAML - ${String(cause)}`)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Undecided(`${rev}:${WORKSPACE_FILE}: not a mapping`)
  }
  const catalogs = catalogsOf(doc as Json)
  const globs = packageGlobs(doc as Json)
  const include = globs.filter((glob) => !glob.startsWith('!')).map((glob) => globToRegExp(`${glob}/package.json`))
  const exclude = globs.filter((glob) => glob.startsWith('!')).map((glob) =>
    globToRegExp(`${glob.slice(1)}/package.json`)
  )
  const paths = (await git(['ls-tree', '-r', '--name-only', rev])).split('\n').filter((path) =>
    !path.includes('node_modules/') && include.some((re) => re.test(path)) && !exclude.some((re) => re.test(path))
  )
  const releases = new Map<string, Release>()
  for (const path of paths) {
    const manifest = parseJsonObject(await showAt(rev, path), `${rev}:${path}`)
    const { name, version } = manifest
    if (manifest['private'] === true || typeof name !== 'string' || typeof version !== 'string') continue
    releases.set(name, { name, version, packed: resolveCatalogs(manifest, catalogs, `${rev}:${path}`) })
  }
  return releases
}

const pendingReleases = async (rev: string): Promise<ReadonlySet<string>> => {
  const names = (await git(['ls-tree', '--name-only', rev, '--', '.changeset/'])).split('\n')
    .filter((path) => path.endsWith('.md') && !path.endsWith('/README.md'))
  const released = new Set<string>()
  for (const path of names) for (const name of releasedBy(await showAt(rev, path))) released.add(name)
  return released
}

export const checkPackedManifest = async (base: string | undefined, head: string): Promise<Verdict> => {
  if (base === undefined) throw new Undecided('packed-manifest needs --base <rev>')
  const mergeBase = (await git(['merge-base', base, head])).trim()
  const [before, after, released] = await Promise.all([releasesAt(mergeBase), releasesAt(head), pendingReleases(head)])
  const unreleased = judgePackedManifests(before, after, released)
  if (unreleased.length === 0) {
    return holds(`${after.size} publishable package(s): every packed-manifest change is released by a pending intent`)
  }
  return violated(
    unreleased,
    'A packed package.json changed under an unchanged version, so the released tarball no longer matches its tag. Next: add a .changeset intent that releases each package named above (`pnpm change --bump patch <pkg>...`).',
  )
}
