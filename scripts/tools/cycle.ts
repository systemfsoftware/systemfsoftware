// cycle.ts — the release set: workspace versions that have no git tag yet, plus
// the authored changelog each one is released with.
//
// Membership is a git fact. A `<pkg>@vX.Y.Z` tag is written by the release when
// it tags and cuts the GitHub Release for that version, so a version with no
// such tag is owed a tag + a release, and one with its tag is done. There is no
// registry: Nix flakes consumed from git refs (pinned by flake.lock rev +
// narHash, bwrap-sandboxed) are the distribution, so the tag — not a registry
// probe — is the only durable record that a version shipped. Tagging and the
// GitHub Release are idempotent (both skip a version whose tag already exists),
// so a half-finished release resumes safely on the next push to main.
//
// `ensureChangelog` is the release notes' second source. pnpm writes a
// changelog file on the version PR when `.changeset/changelogs/` is tracked; if
// that directory is missing in the publish checkout (an out-of-band delete, or
// a `.gitignore` that swallowed it), the section is rebuilt from
// `ledger.yaml` and the intent bodies it names. When not even the intent bodies
// survive, it returns nothing rather than a placeholder — an empty body fails
// the assert loudly, where a guessed "Patch Changes" would mislabel a major or
// minor release.

import { extractYaml, test } from '@std/front-matter'
import { join } from '@std/path'
import { parse } from '@std/yaml'
import { run } from './run.ts'
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

/** The tag a released version carries: `<pkg>@vX.Y.Z`. */
export const tagOf = (name: string, version: string): string => `${name}@v${version}`

/**
 * Every tag that already exists in this checkout, as a set. The release writes
 * `<pkg>@vX.Y.Z` when it tags a version, so a version whose tag is in this set
 * has already shipped. Read once; filtering is a membership test against it.
 */
const existingTags = async (): Promise<Set<string>> => {
  const listing = await run('git', ['tag', '--list'])
  return new Set(listing.split('\n').map((line) => line.trim()).filter((line) => line.length > 0))
}

/**
 * The release set: the given versions that carry no git tag yet. A tagged
 * version has already been released (tagged + GitHub Release cut), so it is
 * done; an untagged one is owed. Tag absence is the whole verdict — there is no
 * registry to probe.
 */
export const untaggedOf = async <T extends Released>(items: T[]): Promise<T[]> => {
  const tags = await existingTags()
  return items.filter(({ name, version }) => !tags.has(tagOf(name, version)))
}

export const loadWorkspaceCycle = async (): Promise<CycleEntry[]> =>
  (await untaggedOf(await publicPackages())).map(({ name, version }) => ({
    name,
    version,
    tag: tagOf(name, version),
    changelog: changelogPath(name, version),
  }))

export const loadCaptured = async (path: string): Promise<CycleEntry[]> => {
  const raw: unknown = JSON.parse(await Deno.readTextFile(path))
  if (!Array.isArray(raw)) throw new Error('captured file must be a JSON array')
  return raw as CycleEntry[]
}
