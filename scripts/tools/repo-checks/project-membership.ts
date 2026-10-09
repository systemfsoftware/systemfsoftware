// Every tracked TypeScript source in a workspace package belongs to exactly one
// compiler project: a file in none is never typechecked, a file in two answers
// to two option sets at once. Membership is the compiler's own answer
// (`tsc --showConfig` per project the package's tsconfig.json names), read
// with the workspace's installed compiler. Files under a directory holding a
// deno.json(c) belong to Deno, not tsc, and are exempt; `.d.ts` files and
// anything under `dist/` are not sources.
import { basename, dirname, extname, join, relative, resolve } from '@std/path'
import { exists, git, holds, run, Undecided, type Verdict, violated } from './verdict.ts'
import { readWorkspace, workspacePackageDirs } from './workspace.ts'

const TS_CONFIG = 'tsconfig.json'
const SOURCE_EXTENSIONS: Readonly<Record<string, true>> = { '.ts': true, '.tsx': true, '.mts': true, '.cts': true }

interface Project {
  readonly label: string
  readonly files: readonly string[]
}

interface ProjectRef {
  readonly configPath: string
  readonly dir: string
}

export const isSource = (path: string): boolean =>
  SOURCE_EXTENSIONS[extname(path)] === true &&
  extname(basename(path, extname(path))) !== '.d' &&
  !path.split('/').includes('dist')

/** Each owning file maps to every project label that claims it. */
export const membershipViolations = (
  label: string,
  tracked: readonly string[],
  projects: readonly Project[],
  shown: (file: string) => string,
): readonly string[] => {
  const owners = new Map<string, Set<string>>()
  for (const { label: config, files } of projects) {
    for (const file of files) owners.set(file, (owners.get(file) ?? new Set()).add(config))
  }
  return [...tracked].sort().flatMap((file) => {
    const claimed = [...(owners.get(file) ?? [])].sort()
    if (claimed.length === 1) return []
    return [`${label}: ${shown(file)} in ${claimed.length === 0 ? 'no project' : claimed.join(', ')}`]
  })
}

const parseJson = (text: string, label: string): Record<string, unknown> => {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch (cause) {
    throw new Undecided(`${label}: unparseable JSON - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

const projectRefs = (pkgDir: string, tsconfigText: string): readonly ProjectRef[] => {
  const config = parseJson(tsconfigText, join(pkgDir, TS_CONFIG))
  const files = Array.isArray(config['files']) ? config['files'] : null
  const references = Array.isArray(config['references'])
    ? config['references'].flatMap((ref) => {
      const path = (ref as { path?: unknown } | null)?.path
      return typeof path === 'string' && path.length > 0 ? [path] : []
    })
    : []
  const projects: ProjectRef[] = files === null || files.length > 0
    ? [{ dir: pkgDir, configPath: join(pkgDir, TS_CONFIG) }]
    : []
  for (const path of references) {
    const target = resolve(pkgDir, path)
    projects.push(
      extname(path) === '.json'
        ? { dir: dirname(target), configPath: target }
        : { dir: target, configPath: join(target, TS_CONFIG) },
    )
  }
  return projects
}

const compilerFiles = async (tsc: string, project: ProjectRef): Promise<readonly string[]> => {
  const config = parseJson(
    await run(tsc, ['--showConfig', '-p', project.configPath]),
    `tsc --showConfig -p ${project.configPath}`,
  )
  const files = Array.isArray(config['files']) ? config['files'] : []
  return files.flatMap((file) => (typeof file === 'string' ? [resolve(project.dir, file)] : []))
}

const denoOwned = async (pkgDir: string, file: string, cache: Map<string, boolean>): Promise<boolean> => {
  for (let dir = dirname(file); dir.startsWith(pkgDir); dir = dirname(dir)) {
    let found = cache.get(dir)
    if (found === undefined) {
      found = (await exists(join(dir, 'deno.json'))) || (await exists(join(dir, 'deno.jsonc')))
      cache.set(dir, found)
    }
    if (found) return true
    if (dir === pkgDir) break
  }
  return false
}

export const checkProjectMembership = async (root: string): Promise<Verdict> => {
  const tsc = join(root, 'node_modules/.bin/tsc')
  if (!(await exists(tsc))) {
    throw new Undecided(`no compiler at ${tsc}; install the workspace first (pnpm install --frozen-lockfile)`)
  }
  const dirs = await workspacePackageDirs(root, await readWorkspace(root))
  const shown = (file: string) => relative(root, file)
  const violations: string[] = []
  let checked = 0
  let exempt = 0
  for (const dir of dirs) {
    const label = relative(root, dir)
    const denoCache = new Map<string, boolean>()
    const tracked: string[] = []
    for (const path of (await git(['ls-files', '--', label])).split('\n').filter(isSource)) {
      const file = resolve(root, path)
      if (await denoOwned(dir, file, denoCache)) exempt++
      else tracked.push(file)
    }
    checked += tracked.length
    if (!(await exists(join(dir, TS_CONFIG)))) {
      violations.push(
        ...tracked.map((file) => `${label}: ${shown(file)} in no project (the package has no ${TS_CONFIG})`),
      )
      continue
    }
    const projects: Project[] = []
    for (const ref of projectRefs(dir, await Deno.readTextFile(join(dir, TS_CONFIG)))) {
      projects.push({ label: relative(root, ref.configPath), files: await compilerFiles(tsc, ref) })
    }
    violations.push(...membershipViolations(label, tracked, projects, shown))
  }
  return violations.length === 0
    ? holds(
      `${checked} tracked TypeScript file(s) across ${dirs.length} package(s) each belong to exactly one project (${exempt} Deno-owned file(s) exempt)`,
    )
    : violated(
      violations,
      'Every tracked TypeScript source outside dist/ and the .d.ts class belongs to exactly one project: add it to one tsconfig, or remove it from all but one.',
    )
}
