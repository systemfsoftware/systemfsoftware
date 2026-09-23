#!/usr/bin/env -S deno run --allow-read --allow-run --allow-write=/tmp --allow-env
import { dirname, join, relative, resolve } from '@std/path'
import { parse } from '@std/yaml'

const WS = 'pnpm-workspace.yaml'
const TS_CONFIG = 'tsconfig.json'
const TSC = join(Deno.cwd(), 'node_modules/.bin/tsc')

const dec = new TextDecoder()

const SOURCE_SUFFIX = /\.(?:ts|tsx|mts|cts)$/
const DECLARATION_SUFFIX = /\.d\.(?:ts|mts|cts)$/
const UNDER_DIST = /(^|\/)dist\//

type Project = {
  readonly label: string
  readonly files: readonly string[]
}

type ProjectRef = {
  readonly configPath: string
  readonly dir: string
}

const git = async (args: readonly string[]): Promise<readonly string[]> => {
  const out = await new Deno.Command('git', { args: [...args], stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args[0]} failed: ${dec.decode(out.stderr).trim()}`)
  return dec.decode(out.stdout).split('\n').filter((line) => line.length > 0)
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

const workspaceGlobs = async (wsPath: string): Promise<readonly string[]> => {
  let doc: unknown
  try {
    doc = parse(await Deno.readTextFile(wsPath))
  } catch (cause) {
    throw new Error(`${wsPath}: unparseable YAML — cannot name what the guard would miss`, { cause })
  }
  const declared = (doc as { packages?: unknown } | null)?.packages
  if (!Array.isArray(declared)) throw new Error(`${wsPath}: no \`packages:\` sequence`)
  if (declared.length === 0) throw new Error(`${wsPath}: \`packages:\` block is empty`)
  return declared.map((entry, i) => {
    if (typeof entry !== 'string') throw new Error(`${wsPath}: entry #${i + 1} is not a string glob`)
    if (!entry.endsWith('/*')) throw new Error(`${wsPath}: only \`<dir>/*\` globs are understood; got: ${entry}`)
    return entry
  })
}

const packagesWithTsconfig = async (root: string): Promise<readonly string[]> => {
  const dirs = new Set<string>()
  for (const glob of await workspaceGlobs(join(root, WS))) {
    const prefix = join(root, glob.slice(0, -2))
    if (!(await exists(prefix))) continue
    for await (const entry of Deno.readDir(prefix)) {
      if (!entry.isDirectory) continue
      const dir = join(prefix, entry.name)
      if (await exists(join(dir, TS_CONFIG))) dirs.add(dir)
    }
  }
  return [...dirs].sort()
}

const isSource = (path: string): boolean =>
  SOURCE_SUFFIX.test(path) && !DECLARATION_SUFFIX.test(path) && !UNDER_DIST.test(path)

const trackedSources = async (root: string, dir: string): Promise<readonly string[]> => {
  const tracked = await git(['ls-files', '--', relative(root, dir)])
  return tracked.filter(isSource).map((path) => resolve(root, path)).sort()
}

const parseConfig = (text: string, label: string): { files?: unknown; references?: unknown } => {
  try {
    return JSON.parse(text) as { files?: unknown; references?: unknown }
  } catch (cause) {
    throw new Error(`${label}: unparsable JSON — ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

const projectRefs = (pkgDir: string, tsconfigText: string): readonly ProjectRef[] => {
  const config = parseConfig(tsconfigText, `${pkgDir}/${TS_CONFIG}`)
  const files = Array.isArray(config.files) ? config.files : null
  const references = Array.isArray(config.references)
    ? config.references.flatMap((ref) => {
      const path = (ref as { path?: unknown } | null)?.path
      return typeof path === 'string' && path.length > 0 ? [path] : []
    })
    : []
  const projects: ProjectRef[] = []
  if (files === null || files.length > 0) {
    projects.push({ dir: pkgDir, configPath: join(pkgDir, TS_CONFIG) })
  }
  for (const path of references) {
    const target = resolve(pkgDir, path)
    projects.push(
      path.endsWith('.json')
        ? { dir: dirname(target), configPath: target }
        : { dir: target, configPath: join(target, TS_CONFIG) },
    )
  }
  return projects
}

const compilerFiles = (stdout: string, projectDir: string): readonly string[] => {
  let config: { files?: unknown }
  try {
    config = JSON.parse(stdout) as typeof config
  } catch {
    throw new Error(`tsc --showConfig in ${projectDir}: output is not JSON`)
  }
  const files = Array.isArray(config.files) ? config.files : []
  return files.flatMap((file) => (typeof file === 'string' ? [resolve(projectDir, file)] : []))
}

const showConfig = async (project: ProjectRef): Promise<readonly string[]> => {
  let out: Deno.CommandOutput
  try {
    out = await new Deno.Command(TSC, {
      args: ['--showConfig', '-p', project.configPath],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
  } catch {
    throw new Error(`tsc not present at ${TSC} — run 'pnpm install --frozen-lockfile'`)
  }
  if (!out.success) {
    const tail = dec.decode(out.stderr).trim().split('\n').slice(-8).join('\n')
    throw new Error(`tsc --showConfig -p ${project.configPath} failed (exit ${out.code}):\n${tail}`)
  }
  return compilerFiles(dec.decode(out.stdout), project.dir)
}

const readProjects = async (root: string, pkgDir: string): Promise<readonly Project[]> => {
  const refs = projectRefs(pkgDir, await Deno.readTextFile(join(pkgDir, TS_CONFIG)))
  const projects: Project[] = []
  for (const ref of refs) {
    projects.push({ label: relative(root, ref.configPath), files: await showConfig(ref) })
  }
  return projects
}

const membershipViolations = (
  root: string,
  label: string,
  tracked: readonly string[],
  projects: readonly Project[],
): readonly string[] => {
  const owners = new Map<string, Set<string>>()
  for (const { label: config, files } of projects) {
    for (const file of files) {
      const claimed = owners.get(file)
      if (claimed === undefined) owners.set(file, new Set([config]))
      else claimed.add(config)
    }
  }
  const violations: string[] = []
  for (const file of [...tracked].sort()) {
    const claimed = owners.get(file)
    const shown = relative(root, file)
    if (claimed === undefined || claimed.size === 0) violations.push(`${label}: ${shown} in no project`)
    else if (claimed.size > 1) violations.push(`${label}: ${shown} in ${[...claimed].sort().join(', ')}`)
  }
  return violations
}

const main = async (): Promise<number> => {
  const root = Deno.cwd()
  const dirs = await packagesWithTsconfig(root)
  if (dirs.length === 0) throw new Error('no workspace package carries a tsconfig.json — refusing the empty verdict')

  const violations: string[] = []
  let tracked = 0
  for (const dir of dirs) {
    const files = await trackedSources(root, dir)
    tracked += files.length
    violations.push(...membershipViolations(root, relative(root, dir), files, await readProjects(root, dir)))
  }

  if (violations.length > 0) {
    console.error(
      `project membership: ${violations.length} TypeScript file(s) are not in exactly one project, across ${dirs.length} package(s):`,
    )
    console.error('')
    for (const violation of violations) console.error(violation)
    console.error('')
    console.error(
      'Every tracked TypeScript file outside a `dist/` directory and outside the `.d.ts` class belongs to exactly one',
    )
    console.error(
      'project: a file in none is never typechecked, a file in two answers to two option sets at once (R3).',
    )
    return 1
  }

  console.log(
    `project membership: ${tracked} tracked TypeScript file(s) across ${dirs.length} package(s) each belong to exactly one project`,
  )
  return 0
}

const plant = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await Deno.mkdir(dirname(target), { recursive: true })
    await Deno.writeTextFile(target, content)
  }
}

const walkSources = async (dir: string): Promise<readonly string[]> => {
  const found: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) found.push(...await walkSources(path))
    else if (isSource(path)) found.push(path)
  }
  return found.sort()
}

const TS = 'export const x = 1\n'

const CLEAN = {
  'pkgs/clean/tsconfig.json': '{"include": ["src"]}\n',
  'pkgs/clean/src/index.ts': TS,
}
const UNCLAIMED = {
  'pkgs/unclaimed/tsconfig.json': '{"include": ["src"]}\n',
  'pkgs/unclaimed/src/index.ts': TS,
  'pkgs/unclaimed/tests/a.test.ts': TS,
}
const CLAIMED_TWICE = {
  'pkgs/claimed-twice/tsconfig.json':
    '{"files": [], "references": [{"path": "./tsconfig.a.json"}, {"path": "./tsconfig.b.json"}]}\n',
  'pkgs/claimed-twice/tsconfig.a.json': '{"include": ["src", "shared"]}\n',
  'pkgs/claimed-twice/tsconfig.b.json': '{"include": ["shared"]}\n',
  'pkgs/claimed-twice/src/index.ts': TS,
  'pkgs/claimed-twice/shared/x.ts': TS,
}
const HARNESS_CLAIMED = {
  'pkgs/harness-claimed/tsconfig.json': '{"include": ["src"], "references": [{"path": "./tsconfig.node.json"}]}\n',
  'pkgs/harness-claimed/tsconfig.node.json': '{"files": ["vitest.config.ts"]}\n',
  'pkgs/harness-claimed/src/index.ts': TS,
  'pkgs/harness-claimed/vitest.config.ts': TS,
}
const HARNESS_LOOSE = {
  'pkgs/harness-loose/tsconfig.json': '{"include": ["src"], "references": [{"path": "./tsconfig.node.json"}]}\n',
  'pkgs/harness-loose/tsconfig.node.json': '{"files": ["scripts/other.ts"]}\n',
  'pkgs/harness-loose/src/index.ts': TS,
  'pkgs/harness-loose/vitest.config.ts': TS,
  'pkgs/harness-loose/scripts/other.ts': TS,
}

const selftest = async (): Promise<number> => {
  const failures: string[] = []
  const wsRoot = await Deno.makeTempDir({ prefix: 'project-membership-' })

  try {
    await plant(wsRoot, {
      'pnpm-workspace.yaml': "packages:\n  - 'pkgs/*'\n",
      'pkgs/no-tsconfig/package.json': '{"name": "no-tsconfig"}\n',
      ...CLEAN,
      ...UNCLAIMED,
      ...CLAIMED_TWICE,
      ...HARNESS_CLAIMED,
      ...HARNESS_LOOSE,
    })

    const fixturePackages = [
      {
        label: 'member enumeration matches the globs and the tsconfig presence',
        dir: null,
        expect: ['pkgs/claimed-twice', 'pkgs/clean', 'pkgs/harness-claimed', 'pkgs/harness-loose', 'pkgs/unclaimed']
          .map((dir) => join(wsRoot, dir)),
      },
      { label: 'a clean fixture passes', dir: 'pkgs/clean', expect: [] },
      {
        label: 'a tests/ file in no project is named',
        dir: 'pkgs/unclaimed',
        expect: ['pkgs/unclaimed: pkgs/unclaimed/tests/a.test.ts in no project'],
      },
      {
        label: 'a file in two projects names both',
        dir: 'pkgs/claimed-twice',
        expect: [
          'pkgs/claimed-twice: pkgs/claimed-twice/shared/x.ts in pkgs/claimed-twice/tsconfig.a.json, pkgs/claimed-twice/tsconfig.b.json',
        ],
      },
      {
        label: 'a harness file claimed by a referenced node project passes',
        dir: 'pkgs/harness-claimed',
        expect: [],
      },
      {
        label: 'a harness file no referenced project claims is named',
        dir: 'pkgs/harness-loose',
        expect: ['pkgs/harness-loose: pkgs/harness-loose/vitest.config.ts in no project'],
      },
    ] as const
    for (const { label, dir, expect } of fixturePackages) {
      if (dir === null) {
        const got = await packagesWithTsconfig(wsRoot)
        if (JSON.stringify(got) !== JSON.stringify(expect)) {
          failures.push(`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`)
        }
        continue
      }
      const pkgDir = join(wsRoot, dir)
      const got = membershipViolations(wsRoot, dir, await walkSources(pkgDir), await readProjects(wsRoot, pkgDir))
      if (JSON.stringify(got) !== JSON.stringify(expect)) {
        failures.push(`  ${label}:\n    expected ${JSON.stringify(expect)}\n    got      ${JSON.stringify(got)}`)
      }
    }

    const pkg = join(wsRoot, 'pkgs/clean')
    const configOf = (text: string): readonly string[] => projectRefs(pkg, text).map((ref) => ref.configPath)
    const throwsOnUnparsable = (): boolean => {
      try {
        projectRefs(pkg, '{ nope')
        return false
      } catch {
        return true
      }
    }
    const checks: readonly [string, boolean][] = [
      ['a tracked source is a source', isSource('pkgs/clean/src/index.ts')],
      ['tsx, mts and cts are sources', isSource('a/b.tsx') && isSource('a/b.mts') && isSource('a/b.cts')],
      ['a declaration is not a tracked source', !isSource('pkgs/clean/src/index.d.ts')],
      ['build output is not a tracked source', !isSource('pkgs/clean/dist/index.ts')],
      ['a JavaScript file is not a tracked source', !isSource('pkgs/clean/src/index.js')],
      [
        'a reference-only root names its references as the projects',
        JSON.stringify(configOf('{"files": [], "references": [{"path": "./tsconfig.a.json"}]}')) ===
          JSON.stringify([join(pkg, 'tsconfig.a.json')]),
      ],
      [
        'a files:[] root with no references claims nothing',
        JSON.stringify(configOf('{"files": []}')) === JSON.stringify([]),
      ],
      [
        'an include-based root joins its references with itself',
        JSON.stringify(configOf('{"include": ["src"], "references": [{"path": "./tsconfig.node.json"}]}')) ===
          JSON.stringify([join(pkg, TS_CONFIG), join(pkg, 'tsconfig.node.json')]),
      ],
      [
        'a directory reference resolves to the config inside it',
        JSON.stringify(
          projectRefs(pkg, '{"files": [], "references": [{"path": "./nested"}]}').map((ref) => ref.dir),
        ) ===
          JSON.stringify([join(pkg, 'nested')]),
      ],
      ['an unparsable config fails closed', throwsOnUnparsable()],
    ]
    for (const [label, ok] of checks) {
      if (!ok) failures.push(`  ${label}`)
    }

    if (failures.length > 0) {
      console.error(
        `check-project-membership: selftest FAILED (${failures.length}/${fixturePackages.length + checks.length})\n`,
      )
      for (const failure of failures) console.error(failure)
      return 1
    }
    console.log(
      `check-project-membership: selftest ok (${fixturePackages.length} fixture rows + ${checks.length} mechanism rows)`,
    )
    return 0
  } finally {
    await Deno.remove(wsRoot, { recursive: true }).catch(() =>
      console.error(`warning: could not remove the fixture ${wsRoot}`)
    )
  }
}

try {
  Deno.exitCode = Deno.args.includes('--selftest') ? await selftest() : await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
