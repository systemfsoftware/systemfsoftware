// cycle.ts — the release set: workspace versions the registry does not yet
// serve, plus the authored changelog each one is released with.
//
// Membership is a registry fact, not a version-control fact. A package leaves
// the release set when its version is published, never when a branch advances
// or a tag is written — tags are written downstream of the publish that would
// prove them, so a detector reading tag absence cannot make its own
// precondition true.
//
// `ensureChangelog` is the release notes' second source. pnpm writes a
// changelog file on the version PR when `.changeset/changelogs/` is tracked; if
// that directory is missing in the publish checkout (an out-of-band delete, or
// a `.gitignore` that swallowed it), the section is rebuilt from
// `ledger.yaml` and the intent bodies it names. When not even the intent bodies
// survive, it returns nothing rather than a placeholder — an empty body fails
// the assert loudly, where a guessed "Patch Changes" would mislabel a major or
// minor release.

import { pooledMap } from '@std/async/pool'
import { extractYaml, test } from '@std/front-matter'
import { join } from '@std/path'
import { parse } from '@std/yaml'
import { REGISTRY_CONCURRENCY } from './npm-query.ts'
import { rawWorkspacePackages } from './workspace.ts'

export type CycleEntry = {
  name: string
  version: string
  tag: string
  changelog: string
}

export const changelogPath = (name: string, version: string): string =>
  join('.changeset', 'changelogs', `${name.replace('/', '!')}@${version}.md`)

export const ensureChangelog = async (name: string, version: string): Promise<string> => {
  const p = changelogPath(name, version)
  try {
    const existing = await Deno.readTextFile(p)
    if (existing.trim().length > 0) return existing
  } catch {
    // absent or unreadable
  }

  let ledger: Record<string, { dir: string; intents: string[] }> = {}
  try {
    const raw = parse(await Deno.readTextFile('.changeset/ledger.yaml'))
    if (raw && typeof raw === 'object') ledger = raw as Record<string, { dir: string; intents: string[] }>
  } catch {
    return ''
  }

  const key = `${name}@${version}`
  const val = ledger[key]
  if (!val || !Array.isArray(val.intents)) return ''

  const titleMap: Record<string, string> = {
    major: 'Major Changes',
    minor: 'Minor Changes',
    patch: 'Patch Changes',
  }

  const entriesByBump: Record<string, string[]> = {
    major: [],
    minor: [],
    patch: [],
  }

  for (const intentStem of val.intents) {
    const intentPath = `.changeset/${intentStem}.md`
    let raw = ''
    try {
      raw = await Deno.readTextFile(intentPath)
    } catch {
      continue
    }
    if (!test(raw)) continue
    const { attrs, body } = extractYaml<Record<string, string>>(raw)
    const bump = attrs[name]
    if (!bump || !entriesByBump[bump]) continue
    const summary = body.trim()
    if (!summary) continue

    const lines = summary.split('\n')
    let item = `- ${lines[0]}`
    for (let i = 1; i < lines.length; i++) {
      item += '\n' + (lines[i] ? `  ${lines[i]}` : '')
    }
    entriesByBump[bump].push(item)
  }

  const parts = [`## ${version}`]
  for (const bump of ['major', 'minor', 'patch']) {
    if (entriesByBump[bump].length > 0) {
      parts.push(`### ${titleMap[bump]}`)
      parts.push(entriesByBump[bump].join('\n\n'))
    }
  }

  if (parts.length === 1) return ''

  const content = parts.join('\n\n') + '\n'
  try {
    await Deno.mkdir('.changeset/changelogs', { recursive: true })
    await Deno.writeTextFile(p, content)
  } catch {
    // best effort write
  }
  return content
}

type Released = { name: string; version: string }

const publicPackages = async (): Promise<Released[]> =>
  (await rawWorkspacePackages()).map(({ name, version }) => ({ name, version }))

/**
 * A failed probe is a third outcome, never a "no": false only on an explicit
 * 404, a throw on any other non-OK response or a stuck request. Folding
 * cannot-tell into "unpublished" reclassifies a published package as owed a
 * release.
 */
const isPublished = async (name: string, version: string): Promise<boolean> => {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`)
  await res.body?.cancel()
  if (res.status === 404) return false
  if (!res.ok) throw new Error(`registry returned ${res.status} for ${name}@${version}`)
  return true
}

/** Bounded fan-out: an unbounded map over every member is an fd and rate-limit hazard. */
export const unpublishedOf = async <T extends Released>(items: T[]): Promise<T[]> => {
  const published = await Array.fromAsync(
    pooledMap(REGISTRY_CONCURRENCY, items, ({ name, version }) => isPublished(name, version)),
  )
  return items.filter((_, i) => !published[i])
}

export const loadWorkspaceCycle = async (): Promise<CycleEntry[]> =>
  (await unpublishedOf(await publicPackages())).map(({ name, version }) => ({
    name,
    version,
    tag: `${name}@v${version}`,
    changelog: changelogPath(name, version),
  }))

export const loadCaptured = async (path: string): Promise<CycleEntry[]> => {
  const raw: unknown = JSON.parse(await Deno.readTextFile(path))
  if (!Array.isArray(raw)) throw new Error('captured file must be a JSON array')
  return raw as CycleEntry[]
}
