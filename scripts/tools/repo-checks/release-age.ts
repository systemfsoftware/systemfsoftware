// The supply-chain cutoff: pnpm refuses to resolve a version younger than
// `minimumReleaseAge` minutes, except for packages `minimumReleaseAgeExclude`
// names. The cutoff holds only if it is set, and an exclusion may cover only
// packages the workspace itself publishes: scopes read from its own non-private
// manifests, so the check names no organisation and runs unchanged in any
// workspace.
import { join } from '@std/path'
import { holds, type Verdict, violated } from './verdict.ts'
import { readWorkspace, WORKSPACE_FILE, type WorkspaceDocument, workspacePackageDirs } from './workspace.ts'

/** The `@scope` of a package name, or null for an unscoped name. */
export const scopeOf = (name: string): string | null => {
  if (!name.startsWith('@')) return null
  const slash = name.indexOf('/')
  return slash > 1 ? name.slice(0, slash) : null
}

export const judgeReleaseAge = (doc: WorkspaceDocument, ownScopes: ReadonlySet<string>): Verdict => {
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
    const scope = typeof entry === 'string' ? scopeOf(entry) : null
    if (scope === null || !ownScopes.has(scope)) {
      violations.push(
        `minimumReleaseAgeExclude: ${JSON.stringify(entry)} exempts a package this workspace does not publish`,
      )
    }
  }
  const owned = [...ownScopes].sort().join(', ') || 'none'
  return violations.length === 0
    ? holds(
      `${WORKSPACE_FILE} keeps a ${age}-minute cutoff; exclusions stay within the workspace's own scopes (${owned})`,
    )
    : violated(
      violations,
      `Only packages under the workspace's own scopes (${owned}) may skip the release-age cutoff. Pin the dependency to a version older than the cutoff, or wait for it.`,
    )
}

export const checkReleaseAge = async (root: string): Promise<Verdict> => {
  const doc = await readWorkspace(root)
  const scopes = new Set<string>()
  for (const dir of await workspacePackageDirs(root, doc)) {
    const manifest = JSON.parse(await Deno.readTextFile(join(dir, 'package.json'))) as {
      name?: unknown
      private?: unknown
    }
    if (manifest.private === true) continue
    const scope = typeof manifest.name === 'string' ? scopeOf(manifest.name) : null
    if (scope !== null) scopes.add(scope)
  }
  return judgeReleaseAge(doc, scopes)
}
