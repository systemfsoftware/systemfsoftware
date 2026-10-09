// The supply-chain cutoff: pnpm refuses to resolve a version younger than
// `minimumReleaseAge` minutes, except for packages `minimumReleaseAgeExclude`
// names. The cutoff holds only if it is set, and an exclusion may cover only
// packages the workspace itself publishes: a scope (`@scope/...`) or an exact
// unscoped name read from its own non-private manifests, so the check names no
// organisation and runs unchanged in any workspace. An entry may pin versions
// (`name@1.2.3 || 2.0.0`); the package it names is what counts.
import { join } from '@std/path'
import { holds, parseJsonObject, type Verdict, violated } from './verdict.ts'
import { readWorkspace, WORKSPACE_FILE, type WorkspaceDocument, workspacePackageDirs } from './workspace.ts'

/** What the workspace publishes: the scopes of its scoped names and its unscoped names. */
export interface Published {
  readonly scopes: ReadonlySet<string>
  readonly names: ReadonlySet<string>
}

/** The `@scope` of a package name, or null for an unscoped name. */
export const scopeOf = (name: string): string | null => {
  if (!name.startsWith('@')) return null
  const slash = name.indexOf('/')
  return slash > 1 ? name.slice(0, slash) : null
}

/** The package an exclusion names, without the versions pnpm lets it pin after `@`. */
const packageOf = (entry: string): string => {
  const at = entry.indexOf('@', 1)
  return (at === -1 ? entry : entry.slice(0, at)).trim()
}

const ownedBy = (published: Published, entry: string): boolean => {
  const name = packageOf(entry)
  const scope = scopeOf(name)
  return scope === null ? published.names.has(name) : published.scopes.has(scope)
}

export const judgeReleaseAge = (doc: WorkspaceDocument, published: Published): Verdict => {
  const violations: string[] = []
  const age = doc['minimumReleaseAge']
  if (typeof age !== 'number' || !(age > 0)) {
    violations.push(
      `minimumReleaseAge is ${JSON.stringify(age ?? null)}; the cutoff needs a positive number of minutes`,
    )
  }
  const declared = doc['minimumReleaseAgeExclude'] ?? []
  const excluded: readonly unknown[] = Array.isArray(declared) ? declared : [declared]
  for (const entry of excluded) {
    if (typeof entry !== 'string' || !ownedBy(published, entry)) {
      violations.push(
        `minimumReleaseAgeExclude: ${JSON.stringify(entry)} exempts a package this workspace does not publish`,
      )
    }
  }
  const owned = [...published.scopes].sort().map((scope) => `${scope}/*`).concat([...published.names].sort())
    .join(', ') || 'none'
  return violations.length === 0
    ? holds(
      `${WORKSPACE_FILE} keeps a ${age}-minute cutoff; exclusions stay within what the workspace publishes (${owned})`,
    )
    : violated(
      violations,
      `Only packages the workspace publishes (${owned}) may skip the release-age cutoff. Pin the dependency to a version older than the cutoff, or wait for it.`,
    )
}

export const checkReleaseAge = async (root: string): Promise<Verdict> => {
  const doc = await readWorkspace(root)
  const scopes = new Set<string>()
  const names = new Set<string>()
  for (const dir of await workspacePackageDirs(root, doc)) {
    const path = join(dir, 'package.json')
    const manifest = parseJsonObject(await Deno.readTextFile(path), path)
    const name = manifest['name']
    if (manifest['private'] === true || typeof name !== 'string') continue
    const scope = scopeOf(name)
    if (scope === null) names.add(name)
    else scopes.add(scope)
  }
  return judgeReleaseAge(doc, { scopes, names })
}
