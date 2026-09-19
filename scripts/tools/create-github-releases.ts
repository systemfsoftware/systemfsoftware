#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run=git --allow-net=api.github.com --allow-env=GH_TOKEN,GITHUB_TOKEN,GITHUB_REPOSITORY
// create-github-releases.ts — fail-closed GitHub Releases from pnpm changelogs.
//
// The release set comes from `./cycle.ts` (registry truth, or a captured
// file). For each member the body is `./cycle.ts#ensureChangelog`, which
// prefers the pnpm-written changelog file and synthesizes the section from
// `ledger.yaml` + intent bodies when it is missing. An empty body is an
// `::error::` + exit 1: a release with no notes certifies nothing.
//
// `--assert` runs the body check for every member without touching GitHub, and
// is what the version and publish jobs use to fail before any release exists.
// `--dry-run` lists the plan.

import { parseArgs } from '@std/cli/parse-args'
import { type CycleEntry, ensureChangelog, loadCaptured, loadWorkspaceCycle } from './cycle.ts'
import { expectedSlug } from './oidc.ts'

const flags = parseArgs(Deno.args, {
  boolean: ['dry-run', 'assert'],
  string: ['captured'],
})

const cycle: CycleEntry[] = flags.captured ? await loadCaptured(flags.captured) : await loadWorkspaceCycle()

if (cycle.length === 0) {
  console.log('no this-cycle releases — empty captured set')
  Deno.exit(0)
}

const pending: { entry: CycleEntry; body: string }[] = []
for (const entry of cycle) {
  const { name, version, changelog } = entry
  const raw = await ensureChangelog(name, version)
  if (raw.trim().length === 0) {
    console.error(
      `::error::Missing or empty changelog for ${name}@${version}: expected ${changelog} — body must be the pnpm-generated changelog.`,
    )
    Deno.exit(1)
  }
  pending.push({ entry, body: raw.trim() })
}

if (flags.assert) {
  console.log(`assert ok: ${cycle.length} changelog(s) present`)
  Deno.exit(0)
}

if (flags['dry-run']) {
  for (const { entry } of pending) {
    console.log(`would create release ${entry.tag} from ${entry.changelog}`)
  }
  console.log(`dry run: ${pending.length} release(s)`)
  Deno.exit(0)
}

const GITHUB = 'https://api.github.com'
const token = Deno.env.get('GITHUB_TOKEN') ?? Deno.env.get('GH_TOKEN')
if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required to create releases')

const slug = await expectedSlug()
const [owner, repo] = slug.split('/')

const api = async (path: string, init?: RequestInit): Promise<Response> =>
  await fetch(`${GITHUB}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

const releaseExists = async (tag: string): Promise<boolean> => {
  const res = await api(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  if (res.status === 404) {
    await res.body?.cancel()
    return false
  }
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`looking up ${tag} in ${owner}/${repo} failed: ${res.status}`)
  }
  await res.body?.cancel()
  return true
}

const created: { tag: string; id: number }[] = []
let loopError: Error | null = null
for (const { entry, body } of pending) {
  const { tag } = entry
  try {
    if (await releaseExists(tag)) {
      console.log(`skip ${tag} — release exists`)
      continue
    }
    const res = await api(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, body, prerelease: false, make_latest: 'false' }),
    })
    if (res.status === 409 || res.status === 422) {
      await res.body?.cancel()
      console.log(`skip ${tag} — release exists`)
      continue
    }
    if (!res.ok) {
      await res.body?.cancel()
      loopError = new Error(`creating release ${tag} failed: ${res.status}`)
      break
    }
    const data = (await res.json()) as { id: number }
    console.log(`created release ${tag}`)
    created.push({ tag, id: data.id })
  } catch (error) {
    loopError = new Error(
      `releasing ${tag} failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    break
  }
}

// One successful release is marked latest. Best-effort: a failure here is
// reported but never rolls back the releases already created.
if (created.length > 0 && !loopError) {
  const [first] = created
  try {
    const res = await api(`/repos/${owner}/${repo}/releases/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ make_latest: 'true' }),
    })
    await res.body?.cancel()
    if (!res.ok) {
      console.error(`::warning::reconciling make_latest for ${first.tag} failed: ${res.status}`)
    } else {
      console.log(`reconciled make_latest true on ${first.tag}`)
    }
  } catch (error) {
    console.error(
      `::warning::reconciling make_latest for ${first.tag} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

if (loopError) {
  console.error(`::error::${loopError.message}`)
  Deno.exit(1)
}
console.log(`created ${created.length} release(s), skipped ${cycle.length - created.length}`)
