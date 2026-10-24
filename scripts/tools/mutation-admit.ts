// mutation-admit - run from a workspace root before the Mutation plan: refuses, with one `::error` annotation per
// refusal, every package that would mutate more than its workflow files, holds a workflow file the shared set misses,
// or carries a mutation script other than `"mutation": "stryker run"` (mutation-admission.ts decides). Exits 1 when
// any package is refused, so no Stryker run starts.

import { pooledMap } from '@std/async/pool'
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { Result } from 'effect'
import {
  admitMutation,
  annotationOf,
  keptIgnoresOf,
  type MutationFacts,
  probeFactsOf,
  sharedSetOf,
  type Swept,
  sweptFilesOf,
} from './mutation-admission.ts'

const text = new TextDecoder()

const lastLines = (bytes: Uint8Array): string => text.decode(bytes).trim().split('\n').slice(-5).join(' ')

/**
 * The file-command paths every Actions step has. A child gets its own, so a config writing to them by name does not
 * touch this step's outputs. This is not a sandbox: the child is the same user, as Stryker is in the Mutation jobs.
 */
const FILE_COMMANDS = ['GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY']

/**
 * Runs pnpm in `cwd` with this step's environment, which carries the workflow-level variables (`CI`,
 * `STRYKER_CONCURRENCY`) every Mutation job gives Stryker, and file-command paths of its own. Writes `what` to stderr as
 * it starts and again with its wall time as it ends.
 */
const pnpm = async (cwd: string, args: readonly string[], what: string): Promise<Deno.CommandOutput> => {
  const scratch = await Deno.makeTempDir({ prefix: 'pnpm-env-' })
  try {
    for (const name of FILE_COMMANDS) await Deno.writeTextFile(join(scratch, name), '')
    const started = performance.now()
    console.error(`${what}: started`)
    const out = await new Deno.Command('pnpm', {
      args: [...args],
      cwd,
      clearEnv: true,
      env: {
        ...Deno.env.toObject(),
        ...Object.fromEntries(FILE_COMMANDS.map((name) => [name, join(scratch, name)])),
        npm_config_manage_package_manager_versions: 'false',
      },
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    console.error(`${what}: exited ${out.code} after ${((performance.now() - started) / 1000).toFixed(1)} s`)
    return out
  } finally {
    await Deno.remove(scratch, { recursive: true })
  }
}

/** The workspace members, listed by a pnpm that gets only what it needs to run: no CI variable or token reaches it. */
const workspaceDirs = async (root: string): Promise<string[]> => {
  const passed = ['PATH', 'HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'COREPACK_HOME']
    .flatMap((name) => Deno.env.get(name) === undefined ? [] : [[name, Deno.env.get(name)!] as const])
  const out = await new Deno.Command('pnpm', {
    args: ['ls', '--recursive', '--depth', '-1', '--json'],
    cwd: root,
    clearEnv: true,
    env: { ...Object.fromEntries(passed), npm_config_manage_package_manager_versions: 'false' },
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  if (!out.success) throw new Error(`pnpm ls failed in ${root}: ${text.decode(out.stderr)}`)
  const members = JSON.parse(text.decode(out.stdout)) as { path: string }[]
  const own = await Deno.realPath(root)
  return members.map((member) => relative(own, member.path)).filter((dir) => dir !== '').sort()
}

type Member = {
  readonly name: string
  readonly named: boolean
  readonly dir: string
  readonly scripts: Readonly<Record<string, string>>
}

/** Every workspace member: its name (its directory when it has none) and its scripts. */
const membersOf = async (root: string): Promise<Member[]> =>
  await Array.fromAsync(await workspaceDirs(root), async (dir) => {
    const json = JSON.parse(await Deno.readTextFile(join(root, dir, 'package.json'))) as {
      name?: string
      scripts?: Record<string, string>
    }
    return { name: json.name ?? dir, named: json.name !== undefined, dir, scripts: json.scripts ?? {} }
  })

/**
 * A member is enrolled when it is named and carries `mutation` or any `mutation:*` script, so `mutation:full` alone
 * still enrolls it and its script is judged.
 */
const isEnrolled = (member: Member): boolean =>
  member.named && Object.keys(member.scripts).some((script) => script === 'mutation' || script.startsWith('mutation:'))

const MUTATION_PROBE = join(dirname(fromFileUrl(import.meta.url)), 'mutation-probe.mjs')

/** Packages probed at a time: each is a node process loading a config. */
const PROBE_POOL = 4

/**
 * For each directory: the shared set expanded exactly as `mutation-probe.mjs`'s `expand` does (Node's `globSync`, run
 * from the package directory: it follows symlinks and skips hidden paths), and every file under a hidden path that
 * Stryker's crawl of that package reaches (not a directory, and under no directory the crawl drops: an always-ignored
 * name, the default temp directory, or a bare name the package's own ignore patterns keep, in any case, or a
 * `*.tsbuildinfo` name) and that the shared include patterns match once each hidden segment is made visible with a
 * leading `_`, which keeps its own characters.
 */
const EXPAND = [
  "import { globSync, readdirSync, statSync } from 'node:fs'",
  "import { matchesGlob } from 'node:path'",
  'const { dirs, patterns } = JSON.parse(process.argv[1])',
  "const include = patterns.filter((pattern) => !pattern.startsWith('!'))",
  "const exclude = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))",
  "const ALWAYS = ['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.stryker-tmp']",
  'const droppedBy = (ignorePatterns) => {',
  '  const ignored = new Set([...ALWAYS, ...ignorePatterns].map((name) => name.toLowerCase()))',
  "  return (segment) => ignored.has(segment.toLowerCase()) || segment.toLowerCase().endsWith('.tsbuildinfo')",
  '}',
  "const tops = [...new Set(include.map((pattern) => pattern.split('/')[0]))]",
  "const walked = tops.some((top) => /[*?{[]/.test(top)) ? ['.'] : tops",
  'const isFile = (path) => {',
  '  try {',
  '    return statSync(path).isFile()',
  '  } catch {',
  '    return false',
  '  }',
  '}',
  'const listed = (top) => {',
  '  try {',
  "    return readdirSync(top, { recursive: true }).map((file) => (top === '.' ? file : `${top}/${file}`))",
  '  } catch {',
  '    return []',
  '  }',
  '}',
  'const hiddenOf = (dropped) =>',
  '  walked.flatMap(listed).filter((file) => {',
  "    const segments = file.split('/')",
  "    if (!segments.some((segment) => segment.startsWith('.'))) return false",
  '    if (segments.slice(0, -1).some(dropped) || !isFile(file)) return false',
  "    const visible = segments.map((segment) => (segment.startsWith('.') ? `_${segment}` : segment)).join('/')",
  '    return include.some((pattern) => matchesGlob(visible, pattern))',
  '  }).sort()',
  'const root = process.cwd()',
  'const facts = Object.fromEntries(dirs.map(({ dir, ignorePatterns }) => {',
  '  process.chdir(`${root}/${dir}`)',
  '  return [dir, { files: globSync(include, { exclude }).sort(), hidden: hiddenOf(droppedBy(ignorePatterns)) }]',
  '}))',
  'console.log(JSON.stringify(facts))',
].join('\n')

/**
 * Every workspace member, whether the plan enrols it, and what `EXPAND` finds in it for the shared mutated set
 * (`patterns`, as the installed `@systemfsoftware/stryker-config` declares them). Stryker's crawl of a package drops
 * what that package's own config ignores, so each enrolled package is swept with the ignore patterns its config keeps
 * (`ignoredBy`). Any other member is swept with none: no Mutation job runs it, so its config is never loaded, and once
 * it enrols, a config the plan admits may clear the shared ignore patterns but cannot move the temp directory, so only
 * the always-dropped names are sure to be dropped. The workspace root is not a package the plan can enrol, so it is not
 * judged; a member with no name can never be enrolled, so it is named by its directory.
 */
const sweptOf = async (
  root: string,
  members: readonly Member[],
  patterns: readonly string[],
  ignoredBy: ReadonlyMap<string, readonly string[]>,
): Promise<Swept[]> => {
  if (members.length === 0) return []
  const dirs = members.map((pkg) => ({ dir: pkg.dir, ignorePatterns: ignoredBy.get(pkg.dir) ?? [] }))
  const out = await pnpm(
    root,
    ['exec', 'node', '--input-type=module', '-e', EXPAND, JSON.stringify({ dirs, patterns })],
    `${dirs.length} workspace packages: the shared mutated set and hidden workflow files`,
  )
  if (!out.success) throw new Error(`expanding the shared mutated set failed: ${lastLines(out.stderr)}`)
  const facts = Result.getOrThrowWith(
    sweptFilesOf(text.decode(out.stdout), members.map((pkg) => pkg.dir)),
    (reason) => new Error(`expanding the shared mutated set failed: ${reason}: ${lastLines(out.stderr)}`),
  )
  return members.map((pkg) => ({ name: pkg.name, enrolled: isEnrolled(pkg), ...facts.get(pkg.dir)! }))
}

const main = async (): Promise<void> => {
  const root = Deno.cwd()
  const members = await membersOf(root)
  const enrolled = members.filter(isEnrolled).sort((a, b) => a.name.localeCompare(b.name))
  if (enrolled.length === 0) throw new Error(`no workspace package in ${root} has a mutation script`)
  const probe = await Deno.readTextFile(MUTATION_PROBE)
  const facts: MutationFacts[] = await Array.fromAsync(pooledMap(PROBE_POOL, enrolled, async (pkg) => {
    const out = await pnpm(
      join(root, pkg.dir),
      ['exec', 'node', '--input-type=module', '-e', probe],
      `${pkg.name}: the config probe`,
    )
    const probed = probeFactsOf(text.decode(out.stdout), lastLines(out.stderr))
    return { name: pkg.name, dir: pkg.dir, scripts: pkg.scripts, probe: probed }
  }))
  facts.sort((a, b) => a.name.localeCompare(b.name))
  const shared = facts.map((pkg) => sharedSetOf(pkg.probe)).find((set) => set !== null)
  const swept = shared === undefined ? [] : await sweptOf(root, members, shared.patterns, keptIgnoresOf(facts))
  const refusals = admitMutation(facts, swept)
  for (const refusal of refusals) console.log(annotationOf(refusal))
  const refused = new Set(refusals.map((refusal) => refusal.package))
  if (refused.size > 0) {
    console.error(`${refused.size} packages refused for mutation; no Stryker run is planned`)
    Deno.exit(1)
  }
  console.error(`${facts.length} packages admitted for mutation: ${facts.map((pkg) => pkg.name).join(', ')}`)
}

if (import.meta.main) await main()
