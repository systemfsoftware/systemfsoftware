// One commit pins the consumer template: every caller's `uses:` ref, the packs
// `ref`, and the flake.lock rev all name the same commit, and that commit sits
// on origin's main. The callers are every workflow file template-callers reads.
// The caller refs must read `<40-hex> # main` (the form Renovate's
// github-actions manager updates), so the callers are read as raw text: the
// YAML parser drops the comment. A fetch failure, an unreadable remote, or a
// shallow history is undecided, never a pass.
import { join } from '@std/path'
import { parse } from '@std/yaml'
import { type CallerFile, templateCallerFiles } from './template-callers.ts'
import { git, holds, parseJsonObject, Undecided, type Verdict, violated } from './verdict.ts'

const TEMPLATE = join('templates', 'consumer')
const PACKS = join(TEMPLATE, '.compound-engineering', 'config.yaml')
const LOCK = join(TEMPLATE, 'flake.lock')
const LOWER_SHA = /^[0-9a-f]{40}$/
const USES_LINE = /^\s*uses:\s*\S+@([0-9a-f]{40}) # main\s*$/

interface Site {
  readonly name: string
  readonly sha: string
}

const decoder = new TextDecoder()

const detail = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

// verdict.ts's `run` throws on any non-zero exit; the ancestry probe needs
// git's exit code. The env filter matches `run`'s: a dev shell sets LD_*, and
// Deno refuses a scoped --allow-run spawn while they are set.
const gitRan = async (args: readonly string[]): Promise<{ readonly code: number; readonly stderr: string }> => {
  const env = Object.fromEntries(
    Object.entries(Deno.env.toObject()).filter(([key]) => !key.startsWith('LD_') && !key.startsWith('DYLD_')),
  )
  let out: Deno.CommandOutput
  try {
    out = await new Deno.Command('git', {
      args: [...args],
      clearEnv: true,
      env,
      stdout: 'piped',
      stderr: 'piped',
    }).output()
  } catch (cause) {
    throw new Undecided(`git could not start: ${detail(cause)}`)
  }
  return { code: out.code, stderr: decoder.decode(out.stderr) }
}

const tail = (text: string): string => text.trim().split('\n').slice(-8).join('\n')

const readOrNull = async (path: string, name: string): Promise<string | null> => {
  try {
    return await Deno.readTextFile(path)
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return null
    throw new Undecided(`${name}: unreadable - ${detail(cause)}`)
  }
}

/** A caller's `uses:` ref, read from the raw line so the ` # main` comment is seen (R10). */
const readCaller = async (root: string, { name }: CallerFile): Promise<Site | string> => {
  const text = await readOrNull(join(root, name), name)
  if (text === null) return `${name}: missing`
  const line = text.split('\n').find((candidate) => /^\s*uses:/.test(candidate))
  if (line === undefined) return `${name}: no \`uses:\` line`
  const match = USES_LINE.exec(line)
  if (match === null) return `${name}: the \`uses:\` ref is not \`@<40 lower-hex> # main\``
  return { name, sha: match[1]! }
}

const readPacksRef = async (root: string): Promise<Site | string> => {
  const text = await readOrNull(join(root, PACKS), PACKS)
  if (text === null) return `${PACKS}: missing`
  let doc: unknown
  try {
    doc = parse(text)
  } catch (cause) {
    throw new Undecided(`${PACKS}: unparseable YAML - ${detail(cause)}`)
  }
  const packs = asRecord(doc)?.['packs']
  const entries = Array.isArray(packs) ? packs.map(asRecord) : []
  const entry = entries.find((candidate) => candidate !== null && typeof candidate['ref'] === 'string')
  if (entry === undefined || entry === null) return `${PACKS}: no pack entry with a \`ref\``
  const ref = entry['ref']
  if (typeof ref !== 'string' || !LOWER_SHA.test(ref)) return `${PACKS}: the pack \`ref\` is not a 40 lower-hex sha`
  return { name: PACKS, sha: ref }
}

const readLockRev = async (root: string): Promise<Site | string> => {
  const text = await readOrNull(join(root, LOCK), LOCK)
  if (text === null) return `${LOCK}: missing`
  const doc = parseJsonObject(text, LOCK)
  const rev = asRecord(asRecord(doc['nodes'])?.['systemfsoftware'])?.['locked']
  const sha = asRecord(rev)?.['rev']
  if (typeof sha !== 'string' || !LOWER_SHA.test(sha)) {
    return `${LOCK}: no \`systemfsoftware\` node with a 40 lower-hex \`locked.rev\``
  }
  return { name: LOCK, sha }
}

export const checkTemplatePin = async (root: string): Promise<Verdict> => {
  const callers = await templateCallerFiles(root)
  const resolved = await Promise.all([
    ...callers.map((caller) => readCaller(root, caller)),
    readPacksRef(root),
    readLockRev(root),
  ])
  const problems = resolved.filter((site): site is string => typeof site === 'string')
  if (problems.length > 0) {
    return violated(
      problems,
      'Every pin site must name a 40-hex commit, and each caller ref must carry the `# main` comment Renovate updates (R10).',
    )
  }
  const sites = resolved.filter((site): site is Site => typeof site !== 'string')
  const shas = new Set(sites.map((site) => site.sha))
  if (shas.size !== 1) {
    return violated(
      sites.map((site) => `${site.name}: ${site.sha}`),
      `All ${sites.length} pin sites must name one commit (R9). Next: move the ${callers.length} callers, the packs \`ref\` and the flake.lock rev to the same main commit.`,
    )
  }
  const sha = sites[0]!.sha
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Undecided(
      'the history is shallow, so whether the pin is on main cannot be decided; fetch the commit graph first: git fetch --filter=tree:0 --unshallow',
    )
  }
  const fetched = await gitRan(['fetch', '--no-tags', '--filter=tree:0', 'origin', 'main'])
  if (fetched.code !== 0) {
    throw new Undecided(`git fetch origin main failed (exit ${fetched.code}):\n${tail(fetched.stderr)}`)
  }
  const reachable = await gitRan(['merge-base', '--is-ancestor', sha, 'FETCH_HEAD'])
  if (reachable.code === 0) {
    return holds(`all ${sites.length} pins name ${sha}, which is reachable from origin/main`)
  }
  return violated(
    [`${sha} is not reachable from main`],
    `The pin must name a commit on main, not a PR branch. Next: bump the ${sites.length} sites to a main commit that contains the reusable change (KTD11).`,
  )
}
