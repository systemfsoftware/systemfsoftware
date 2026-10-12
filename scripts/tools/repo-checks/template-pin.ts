// The consumer template is pinned to one commit of this repository on main (R9).
// A caller's ref must be its file's only raw `uses:` line, in the `<40-hex> # main`
// form Renovate's github-actions manager updates, so no decoy line can supply it.
import { join } from '@std/path'
import { parse } from '@std/yaml'
import { type CallerFile, callerJob, parseCallerYaml, templateCallerFiles } from './template-callers.ts'
import { git, gitCode, holds, parseJsonObject, Undecided, type Verdict, violated } from './verdict.ts'

const TEMPLATE = join('templates', 'consumer')
const PACKS = join(TEMPLATE, '.compound-engineering', 'config.yaml')
const LOCK = join(TEMPLATE, 'flake.lock')
const FLAKE = join(TEMPLATE, 'flake.nix')
const LOWER_SHA = /^[0-9a-f]{40}$/
const USES_LINE = /^\s*uses:\s*(\S+@([0-9a-f]{40})) # main\s*$/
const OWNER = 'systemfsoftware'
const REPO = 'systemfsoftware'
const REUSABLE_PREFIX = `${OWNER}/${REPO}/.github/workflows/reusable-`
const PACKS_SOURCE = `https://github.com/${OWNER}/${REPO}`
const FLAKE_INPUTS =
  `inputs = { systemfsoftware.url = "github:${OWNER}/${REPO}"; nixpkgs.follows = "systemfsoftware/nixpkgs"; };`

interface Site {
  readonly name: string
  readonly sha: string
}

const detail = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null

const readOrNull = async (path: string, name: string): Promise<string | null> => {
  try {
    return await Deno.readTextFile(path)
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return null
    throw new Undecided(`${name}: unreadable - ${detail(cause)}`)
  }
}

/** A caller's `uses:` ref: its parsed job ref, which must be the file's only raw `uses:` line (R9, R10). */
const readCaller = async (root: string, { name }: CallerFile): Promise<Site | string> => {
  const text = await readOrNull(join(root, name), name)
  if (text === null) return `${name}: missing`
  const lines = text.split('\n').filter((candidate) => /^\s*uses:/.test(candidate))
  if (lines.length === 0) return `${name}: no \`uses:\` line`
  if (lines.length > 1) return `${name}: ${lines.length} \`uses:\` lines, but only its job ref may carry one`
  const uses = callerJob(parseCallerYaml(text, name), name).job['uses']
  if (typeof uses !== 'string' || uses.length === 0) return `${name}: its job has no \`uses:\` ref`
  const match = USES_LINE.exec(lines[0]!)
  if (match === null) return `${name}: the \`uses:\` ref is not \`@<40 lower-hex> # main\``
  if (match[1] !== uses) return `${name}: its \`uses:\` line names ${match[1]!}, not its job's ${uses}`
  if (!uses.startsWith(REUSABLE_PREFIX)) {
    return `${name}: its \`uses:\` ref ${uses} is not a ${REUSABLE_PREFIX}* workflow`
  }
  return { name, sha: match[2]! }
}

const readPacksRefs = async (root: string): Promise<ReadonlyArray<Site | string>> => {
  const text = await readOrNull(join(root, PACKS), PACKS)
  if (text === null) return [`${PACKS}: missing`]
  let doc: unknown
  try {
    doc = parse(text)
  } catch (cause) {
    throw new Undecided(`${PACKS}: unparseable YAML - ${detail(cause)}`)
  }
  const packs = asRecord(doc)?.['packs']
  if (!Array.isArray(packs) || packs.length === 0) return [`${PACKS}: no pack entry with a \`ref\``]
  return packs.map((value, index) => {
    const name = `${PACKS} packs[${index}]`
    const entry = asRecord(value)
    const ref = entry?.['ref']
    if (typeof ref !== 'string' || !LOWER_SHA.test(ref)) return `${name}: the pack \`ref\` is not a 40 lower-hex sha`
    if (entry?.['source'] !== PACKS_SOURCE) {
      return `${name}: the pack \`source\` is ${String(entry?.['source'])}, not ${PACKS_SOURCE}`
    }
    return { name, sha: ref }
  })
}

const withoutCommentLines = (text: string): string => text.replaceAll(/^\s*#.*$/gm, '')

const readFlakeInputs = async (root: string): Promise<readonly string[]> => {
  const text = await readOrNull(join(root, FLAKE), FLAKE)
  if (text === null) return [`${FLAKE}: missing`]
  const code = withoutCommentLines(text)
  const definitions = code.match(/\binputs\s*[=.]/g) ?? []
  const block = /\binputs\s*=\s*\{[^}]*\};/.exec(code)?.[0].replaceAll(/\s+/g, ' ')
  if (block !== FLAKE_INPUTS) return [`${FLAKE}: its inputs block is not exactly \`${FLAKE_INPUTS}\``]
  if (definitions.length !== 1) {
    return [`${FLAKE}: it defines inputs ${definitions.length} times; only the one block may`]
  }
  return []
}

const readLockRev = async (root: string): Promise<Site | string> => {
  const text = await readOrNull(join(root, LOCK), LOCK)
  if (text === null) return `${LOCK}: missing`
  const doc = parseJsonObject(text, LOCK)
  const locked = asRecord(asRecord(asRecord(doc['nodes'])?.['systemfsoftware'])?.['locked'])
  const sha = locked?.['rev']
  if (typeof sha !== 'string' || !LOWER_SHA.test(sha)) {
    return `${LOCK}: no \`systemfsoftware\` node with a 40 lower-hex \`locked.rev\``
  }
  if (locked?.['type'] !== 'github' || locked['owner'] !== OWNER || locked['repo'] !== REPO) {
    return `${LOCK}: the \`systemfsoftware\` node is locked to ${locked?.['type']}:${locked?.['owner']}/${
      locked?.['repo']
    }, not github:${OWNER}/${REPO}`
  }
  const original = asRecord(asRecord(asRecord(doc['nodes'])?.['systemfsoftware'])?.['original'])
  const rootInputs = asRecord(asRecord(asRecord(doc['nodes'])?.['root'])?.['inputs'])
  if (
    JSON.stringify(original) !== JSON.stringify({ owner: OWNER, repo: REPO, type: 'github' }) ||
    JSON.stringify(rootInputs) !==
      JSON.stringify({ nixpkgs: ['systemfsoftware', 'nixpkgs'], systemfsoftware: 'systemfsoftware' })
  ) {
    return `${LOCK}: its root inputs or the \`systemfsoftware\` node's \`original\` differ from ${FLAKE}'s inputs`
  }
  return { name: LOCK, sha }
}

export const checkTemplatePin = async (root: string): Promise<Verdict> => {
  const callers = await templateCallerFiles(root)
  const resolved = (await Promise.all([
    ...callers.map((caller) => readCaller(root, caller)),
    readPacksRefs(root),
    readLockRev(root),
    readFlakeInputs(root),
  ])).flat()
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
      `All ${sites.length} pin sites must name one commit (R9). Next: bump them together as templates/consumer/README.md's "The pin" says, which also regenerates flake.lock and the .sfs-deps tarballs.`,
    )
  }
  const sha = sites[0]!.sha
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Undecided(
      'the history is shallow, so whether the pin is on main cannot be decided; fetch the commit graph first: git fetch --filter=tree:0 --unshallow',
    )
  }
  const fetched = await gitCode(['fetch', '--no-tags', '--filter=tree:0', 'origin', 'main'])
  if (fetched !== 0) throw new Undecided(`git fetch origin main failed (exit ${fetched})`)
  const bump =
    `Next: bump the ${sites.length} sites to a main commit that contains the reusable change (KTD11), as templates/consumer/README.md's "The pin" says.`
  const present = await gitCode(['--no-lazy-fetch', 'cat-file', '-e', sha])
  if (present === 1) return violated([`${sha} names no commit in origin/main's history`], bump)
  if (present !== 0) throw new Undecided(`git cat-file -e ${sha} failed (exit ${present})`)
  const type = (await git(['--no-lazy-fetch', 'cat-file', '-t', sha])).trim()
  if (type !== 'commit') return violated([`${sha} names a ${type}, not a commit`], bump)
  const reachable = await gitCode(['merge-base', '--is-ancestor', sha, 'FETCH_HEAD'])
  if (reachable === 0) return holds(`all ${sites.length} pins name ${sha}, which is reachable from origin/main`)
  if (reachable !== 1) throw new Undecided(`git merge-base --is-ancestor ${sha} FETCH_HEAD failed (exit ${reachable})`)
  return violated([`${sha} is not reachable from main`], `The pin must name a commit on main, not a PR branch. ${bump}`)
}
