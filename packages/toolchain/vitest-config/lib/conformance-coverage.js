/**
 * Conformance coverage: a vitest run fails when a concurrency-primitive site in
 * the package's own source never executed under a conformance check.
 *
 * Nothing is declared. The source set is the run's `coverage.include`; the
 * sites are recomputed from those bytes every run; a site is covered when it
 * executed inside a program a checker drove through `Kernel.run` or
 * `Kernel.search`. A checker cannot check itself or a package it depends on,
 * so those packages are judged by whether their own tests ran each site.
 *
 * An include that matched nothing is a misconfiguration only when the package
 * keeps source of its own: a test-only package has no `src/`, so nothing was
 * missed and it passes with an empty source set.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { glob } from 'tinyglobby'

import { scanKernelCalls, scanSites } from './conformance-scan.js'

/** @typedef {import('./conformance-scan.js').Site} Site */
/** @typedef {import('./conformance-runtime.js').Tally} Tally */
/** @typedef {import('vitest/node').Vitest} Vitest */
/** @typedef {import('vitest/node').TestModule} TestModule */
/** @typedef {import('vitest/node').Reporter} Reporter */
/** @typedef {import('vite').Plugin} Plugin */
/** @typedef {import('vitest/node').VitestPluginContext} VitestPluginContext */
/** @typedef {'consumer' | 'harness'} Role */
/**
 * @typedef {{
 *   readonly vitest: Vitest,
 *   readonly root: string,
 *   readonly name: string,
 *   readonly role: Role,
 *   readonly sources: ReadonlySet<string>,
 *   readonly sourceRoot: ReadonlyArray<string>,
 *   readonly checkerSources: ReadonlyMap<string, string>,
 * }} RunState
 */
/** @typedef {{ tally: Tally, underCheck: Set<string>, ranIn: Set<string> }} Evidence */

/** The packages whose kernel runs are checks. */
const CHECKERS = ['@systemfsoftware/conformance-spec', '@systemfsoftware/differential-spec']

const RUNTIME = fileURLToPath(new URL('./conformance-runtime.js', import.meta.url))
/** The per-test handoff `defineConfig` adds to the root and every inline project. */
export const CONFORMANCE_SETUP = fileURLToPath(new URL('./conformance-setup.js', import.meta.url))

const TEST_FILE = /(\.(test|spec|stories)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$|[\\/](__tests__|__fixtures__|tests)[\\/])/
const SOURCE_FILE = /\.[cm]?[jt]sx?$/

/**
 * @param {string} path
 * @returns {string}
 */
const posix = (path) => path.split(sep).join('/')

/**
 * @param {string} path
 * @returns {unknown}
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
const recordAt = (value, key) => {
  const field = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
  return typeof field === 'object' && field !== null ? /** @type {Record<string, unknown>} */ (field) : {}
}

/**
 * @param {unknown} value
 * @returns {string}
 */
const nameField = (value) => {
  const name = typeof value === 'object' && value !== null ? Reflect.get(value, 'name') : undefined
  return typeof name === 'string' ? name : ''
}

/**
 * @param {string} from
 * @returns {string | undefined}
 */
const workspaceRootOf = (from) => {
  let dir = from
  for (;;) {
    try {
      readFileSync(join(dir, 'pnpm-workspace.yaml'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  }
}

/**
 * The workspace's package globs, read from `pnpm-workspace.yaml`'s `packages:` list.
 * @param {string} workspaceRoot
 * @returns {ReadonlyArray<string>}
 */
const workspaceGlobs = (workspaceRoot) => {
  const lines = readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8').split('\n')
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line))
  if (start < 0) return []
  /** @type {Array<string>} */
  const globs = []
  for (const line of lines.slice(start + 1)) {
    const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line)
    if (item?.[1] !== undefined) globs.push(item[1])
    else if (/^\S/.test(line)) break
  }
  return globs
}

/**
 * The bare package a `workspace:` / `npm:` specifier names, with any version
 * suffix dropped: `workspace:@systemfsoftware/vitest@*` is
 * `@systemfsoftware/vitest`, and a bare scoped name with no `@` after the first
 * character is itself.
 * @param {string} specifier
 * @returns {string}
 */
const bareTarget = (specifier) => {
  const at = specifier.lastIndexOf('@')
  return at > 0 ? specifier.slice(0, at) : specifier
}

/**
 * The workspace package a dependency specifier aliases, or undefined when it is
 * a plain version range. A pnpm workspace reaches a sibling through
 * `workspace:<name>@…` or `npm:<name>@…`, in a manifest or in a catalog.
 * @param {unknown} value
 * @returns {string | undefined}
 */
const aliasedTarget = (value) => {
  if (typeof value !== 'string') return undefined
  const match = /^(?:workspace|npm):(.+)$/.exec(value)
  return match?.[1] === undefined ? undefined : bareTarget(match[1])
}

/**
 * name (and alias) → { name, dir, dependencies } for every workspace package.
 * Alias keys are added as well as the package's own name, so a checker that
 * depends on the fork (`@systemfsoftware/vitest`) only through an `npm:` or
 * `workspace:` alias still places the fork in its closure.
 * @param {string} workspaceRoot
 * @returns {Promise<Map<string, { name: string, dir: string, dependencies: ReadonlyArray<string> }>>}
 */
const workspacePackages = async (workspaceRoot) => {
  const manifests = await glob(
    workspaceGlobs(workspaceRoot).map((pattern) => `${pattern.replace(/\/$/, '')}/package.json`),
    { cwd: workspaceRoot, absolute: true, ignore: ['**/node_modules/**'] },
  )
  /** @type {Map<string, { name: string, dir: string, dependencies: ReadonlyArray<string> }>} */
  const out = new Map()
  /** @type {Map<string, string>} */
  const aliases = new Map()
  for (const manifest of manifests) {
    const json = readJson(manifest)
    const name = nameField(json)
    const declared = {
      ...recordAt(json, 'dependencies'),
      ...recordAt(json, 'devDependencies'),
    }
    const dependencies = Object.keys(declared)
    for (const [dependency, value] of Object.entries({ ...declared, ...recordAt(json, 'peerDependencies') })) {
      const target = aliasedTarget(value)
      if (target !== undefined) aliases.set(dependency, target)
    }
    if (name !== '') out.set(name, { name, dir: dirname(manifest), dependencies })
  }
  // The catalog holds the workspace's alias table too; read it textually so a
  // `catalog:` dependency resolves without a YAML parser.
  const workspaceManifest = readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8')
  for (const line of workspaceManifest.split('\n')) {
    const entry = /^\s+['"]?([^'":\s]+)['"]?:\s*['"]?((?:workspace|npm):[^'"\s]+)['"]?\s*(?:#.*)?$/.exec(line)
    if (entry?.[1] === undefined || entry[2] === undefined) continue
    const target = aliasedTarget(entry[2])
    if (target !== undefined) aliases.set(entry[1], target)
  }
  for (const [alias, target] of aliases) {
    const found = out.get(target)
    if (found !== undefined) out.set(alias, found)
  }
  return out
}

/**
 * The checkers and every workspace package they depend on, dev dependencies
 * included: a checker cannot check a package it is built or tested with,
 * because that package cannot take the checker as a dependency without a cycle.
 * @param {Map<string, { name: string, dir: string, dependencies: ReadonlyArray<string> }>} packages
 * @returns {Set<string>}
 */
const harnessNames = (packages) => {
  const out = new Set(CHECKERS)
  const pending = [...CHECKERS]
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    for (const dependency of packages.get(name)?.dependencies ?? []) {
      const resolved = packages.get(dependency)
      if (resolved !== undefined && !out.has(resolved.name)) {
        out.add(resolved.name)
        pending.push(resolved.name)
      }
    }
  }
  return out
}

/**
 * The run's own source set: `coverage.include` minus `coverage.exclude`, minus test files.
 * @param {Vitest} vitest
 * @returns {Promise<Set<string>>}
 */
const sourceSetOf = async (vitest) => {
  const coverage = vitest.config.coverage
  const include = coverage.include !== undefined && coverage.include.length > 0 ? coverage.include : ['src/**']
  const files = await glob([...include], {
    cwd: vitest.config.root,
    absolute: true,
    ignore: [...(coverage.exclude ?? []), '**/node_modules/**', '**/dist/**'],
  })
  return new Set(
    files.map(posix).filter((/** @type {string} */ file) => SOURCE_FILE.test(file) && !TEST_FILE.test(file)),
  )
}

/**
 * The package's own source root, `src/`, as source files minus test files. A run
 * whose `coverage.include` matched nothing is judged against this: nothing was
 * missed when the package declares no source of its own.
 * @param {Vitest} vitest
 * @returns {Promise<ReadonlyArray<string>>}
 */
const sourceRootOf = async (vitest) => {
  const files = await glob(['src/**'], {
    cwd: vitest.config.root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  })
  return files.map(posix).filter((/** @type {string} */ file) => SOURCE_FILE.test(file) && !TEST_FILE.test(file))
}

/**
 * @param {string} root
 * @returns {string}
 */
const packageNameAt = (root) => {
  try {
    return nameField(readJson(join(root, 'package.json')))
  } catch {
    return root
  }
}

/**
 * The name and include globs of an inline project entry, or undefined for an entry the config
 * names by path or builds with a function, whose contents this run cannot read.
 * @param {unknown} entry
 * @returns {{ name: string, include: ReadonlyArray<string> } | undefined}
 */
const inlineProjectOf = (entry) => {
  const test = recordAt(entry, 'test')
  const name = Reflect.get(test, 'name')
  const label = typeof name === 'string' ? name : Reflect.get(recordAt(test, 'name'), 'label')
  if (typeof label !== 'string') return undefined
  const include = Reflect.get(test, 'include')
  return { name: label, include: Array.isArray(include) ? include.filter((glob) => typeof glob === 'string') : [] }
}

/**
 * The declared projects a run left out that the package's verdict needs. A contract lane — a
 * project whose every include is a `*.contract.test.ts` glob — runs real systems no checker drives,
 * so a run may leave it out and still be judged. Any other left-out project, or a declared entry
 * whose name cannot be read, makes the run partial.
 * @param {ReadonlyArray<unknown>} declared the config's `test.projects`
 * @param {ReadonlySet<string>} ran the names of the projects the run started
 * @returns {ReadonlyArray<string>}
 */
export const leftOutProjectsOf = (declared, ran) =>
  declared.flatMap((entry) => {
    const project = inlineProjectOf(entry)
    if (project === undefined) return ['a project declared by path or function']
    if (ran.has(project.name)) return []
    const contractLane = project.include.length > 0 &&
      project.include.every((glob) => glob.endsWith('.contract.test.ts'))
    return contractLane ? [] : [project.name]
  })

/**
 * The run judges only when it ran every test file the projects hold, unfiltered by name, and left
 * out no declared project but a contract lane.
 * @param {Vitest} vitest
 * @param {ReadonlyArray<TestModule>} testModules
 * @returns {Promise<string | undefined>} why the run is partial, or undefined when whole
 */
const partialReason = async (vitest, testModules) => {
  if (vitest.config.testNamePattern !== undefined) return `the run was filtered by test name`
  if (vitest.config.project.length > 0) {
    const leftOut = leftOutProjectsOf(
      vitest.config.projects ?? [],
      new Set(vitest.projects.map((project) => project.name)),
    )
    if (leftOut.length > 0) return `the run left out ${leftOut.join(', ')}`
  }
  const ran = new Set(testModules.map((module) => module.moduleId))
  const all = await vitest.globTestSpecifications()
  const missing = all.filter((spec) => !ran.has(spec.moduleId))
  if (missing.length === 0) return undefined
  return `${missing.length} of ${all.length} test files did not run`
}

/**
 * @param {Map<string, Evidence>} evidence
 * @param {string} where
 * @param {Record<string, Tally>} tallies
 */
const collect = (evidence, where, tallies) => {
  for (const [id, tally] of Object.entries(tallies)) {
    const found = evidence.get(id) ?? { tally: { ran: 0, checks: {} }, underCheck: new Set(), ranIn: new Set() }
    found.tally.ran += tally.ran
    for (const [check, count] of Object.entries(tally.checks)) {
      found.tally.checks[check] = (found.tally.checks[check] ?? 0) + count
    }
    if (Object.keys(tally.checks).length > 0) found.underCheck.add(where)
    else found.ranIn.add(where)
    evidence.set(id, found)
  }
}

/**
 * @param {unknown} meta
 * @returns {Record<string, Tally>}
 */
const talliesOf = (meta) => /** @type {Record<string, Tally>} */ (recordAt(meta, 'conformance'))

/**
 * @param {ReadonlyArray<TestModule>} testModules
 * @returns {Map<string, Evidence>}
 */
const evidenceOf = (testModules) => {
  /** @type {Map<string, Evidence>} */
  const evidence = new Map()
  for (const module of testModules) {
    for (const test of module.children.allTests()) {
      collect(evidence, `${module.relativeModuleId} › ${test.name}`, talliesOf(test.meta()))
    }
  }
  return evidence
}

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' }

/**
 * @param {Set<string>} names
 * @returns {string}
 */
const firstOf = (names) => {
  const [head] = names
  return names.size > 1 ? `${head} (+${names.size - 1} more)` : (head ?? '')
}

/**
 * @param {Role} role
 * @param {Evidence | undefined} found
 * @returns {boolean}
 */
const isCovered = (role, found) =>
  found !== undefined && (role === 'harness' ? found.tally.ran > 0 : found.underCheck.size > 0)

/**
 * @param {Evidence | undefined} found
 * @returns {string}
 */
const whyUncovered = (found) =>
  found === undefined || found.tally.ran === 0
    ? 'never ran in any test'
    : `ran ×${found.tally.ran}, never inside a conformance check — ${firstOf(found.ranIn)}`

/**
 * @param {RunState} run
 * @param {ReadonlyArray<Site>} sites
 * @param {ReadonlyArray<string>} unreadable
 * @param {Map<string, Evidence>} evidence
 * @returns {{ text: string, failed: boolean }}
 */
const verdict = (run, sites, unreadable, evidence) => {
  const harness = run.role === 'harness'
  const lines = [
    '',
    `${C.bold}Conformance coverage${C.off} ${run.name}${
      harness ? `  ${C.dim}(runs the checks: any test counts)${C.off}` : ''
    }`,
  ]
  /** @type {Map<string, Array<Site>>} */
  const byFile = new Map()
  for (const site of sites) byFile.set(site.file, [...(byFile.get(site.file) ?? []), site])
  let uncovered = 0
  for (const [file, fileSites] of byFile) {
    const missing = fileSites.filter((site) => !isCovered(run.role, evidence.get(site.id)))
    uncovered += missing.length
    const mark = missing.length === 0 ? `${C.green}✓${C.off}` : `${C.red}✗${C.off}`
    lines.push(`  ${mark} ${file}  ${C.dim}${fileSites.length - missing.length}/${fileSites.length} sites${C.off}`)
    for (const site of missing) {
      const at = `${site.file}:${site.line}:${site.column}`
      lines.push(
        `      ${C.red}${at}${C.off}  ${site.token} (${site.primitive})  ${whyUncovered(evidence.get(site.id))}`,
      )
    }
  }
  for (const file of unreadable) {
    lines.push(`  ${C.red}✗ ${file}  could not be parsed, so its sites are unknown${C.off}`)
  }
  const missedSourceRoot = run.sources.size === 0 ? run.sourceRoot : []
  if (missedSourceRoot.length > 0) lines.push(`  ${C.red}✗ coverage.include matched no source file${C.off}`)
  const failed = uncovered > 0 || unreadable.length > 0 || missedSourceRoot.length > 0
  const summary = sites.length === 0
    ? `${C.dim}no concurrency primitive in ${run.sources.size} source files${C.off}`
    : uncovered === 0
    ? `${C.green}${sites.length}/${sites.length} primitive sites ${
      harness ? 'ran' : 'exercised under a conformance check'
    }${C.off}`
    : `${C.red}${uncovered}/${sites.length} primitive sites ${
      harness ? 'never ran' : 'never exercised under a conformance check'
    }${C.off}\n` +
      `  ${C.dim}drive each listed site from Conformance.linearizable / .sequential / .released or a Differential check, or delete it${C.off}`
  lines.push('', `  ${summary}`)
  return { text: lines.join('\n'), failed }
}

/**
 * A merged run stands for the whole package, so a merge missing test files
 * fails; a single shard or a filtered run is partial by design and is judged
 * where it is merged or run whole.
 * @param {RunState} run
 * @param {string} partial
 */
const reportPartial = (run, partial) => {
  if (run.vitest.config.mergeReports !== undefined) {
    run.vitest.logger.log(
      `\n${C.red}Conformance coverage ${run.name}: the merged shards are incomplete, ${partial}${C.off}`,
    )
    process.exitCode = 1
    return
  }
  const where = run.vitest.config.shard === undefined ? '' : ', judged when the shards merge'
  run.vitest.logger.log(`\n${C.dim}Conformance coverage ${run.name}: not judged, ${partial}${where}${C.off}`)
}

/**
 * @param {RunState} run
 * @returns {Reporter}
 */
const reporterFor = (run) => ({
  async onTestRunEnd(testModules, _errors, reason) {
    if (reason === 'interrupted') return
    const partial = await partialReason(run.vitest, testModules)
    if (partial !== undefined) {
      reportPartial(run, partial)
      return
    }
    /** @type {Array<Site>} */
    const sites = []
    /** @type {Array<string>} */
    const unreadable = []
    for (const file of [...run.sources].sort()) {
      const path = posix(relative(run.root, file))
      try {
        sites.push(...scanSites(parseSync, path, readFileSync(file, 'utf8')))
      } catch {
        unreadable.push(path)
      }
    }
    const result = verdict(run, sites, unreadable, evidenceOf(testModules))
    run.vitest.logger.log(result.text)
    if (result.failed) process.exitCode = 1
  },
})

/**
 * @param {MagicString} s
 * @param {Site} site
 */
const wrapSite = (s, site) => {
  const id = JSON.stringify(site.id)
  const mode = JSON.stringify(site.mode)
  s.prependLeft(site.start, `${site.shorthand ? `${site.token}: ` : ''}__ccAt(${id}, ${mode}, `)
  s.appendRight(site.end, ')')
}

/**
 * @param {RunState} run
 * @param {string} id
 * @returns {string | undefined} the check kind when `id` is a checker's source
 */
const checkerKindOf = (run, id) => {
  for (const [dir, name] of run.checkerSources) {
    if (id.startsWith(`${dir}/src/`)) {
      return `${name.replace('@systemfsoftware/', '')}/${id.slice(id.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')}`
    }
  }
  return undefined
}

/**
 * @param {RunState} run
 * @param {string} code
 * @param {string} id
 * @returns {{ code: string, map: ReturnType<MagicString['generateMap']> } | null}
 */
const instrument = (run, code, id) => {
  const sites = run.sources.has(id) ? scanSites(parseSync, posix(relative(run.root, id)), code) : []
  const kind = checkerKindOf(run, id)
  const kernelCalls = kind === undefined ? [] : scanKernelCalls(parseSync, id, code)
  if (sites.length === 0 && kernelCalls.length === 0) return null
  const s = new MagicString(code)
  for (const site of sites) wrapSite(s, site)
  for (const call of kernelCalls) {
    s.prependLeft(call.start, `__ccDuring(${JSON.stringify(kind)}, ${call.object}, () => `)
    s.appendRight(call.end, ')')
  }
  s.prepend(`import { at as __ccAt, during as __ccDuring } from ${JSON.stringify(RUNTIME)};\n`)
  return { code: s.toString(), map: s.generateMap({ hires: true, source: id }) }
}

/**
 * @param {Vitest} vitest
 * @returns {Promise<RunState>}
 */
const runStateOf = async (vitest) => {
  const root = posix(vitest.config.root)
  const name = packageNameAt(root)
  const workspaceRoot = workspaceRootOf(root)
  const packages = workspaceRoot === undefined ? new Map() : await workspacePackages(workspaceRoot)
  const harness = harnessNames(packages)
  /** @type {Map<string, string>} */
  const checkerSources = new Map()
  for (const checker of CHECKERS) {
    const found = packages.get(checker)
    if (found !== undefined) checkerSources.set(posix(found.dir), checker)
  }
  return {
    vitest,
    root,
    name,
    role: harness.has(name) ? 'harness' : 'consumer',
    sources: await sourceSetOf(vitest),
    sourceRoot: await sourceRootOf(vitest),
    checkerSources,
  }
}

/**
 * A vitest a test starts runs inside a test worker; it is that test's subject,
 * not the package's run, so it is neither instrumented nor judged.
 * @returns {boolean}
 */
const isStartedByATest = () => process.env['VITEST_WORKER_ID'] !== undefined

/**
 * One judged run per vitest process: vitest bundles a config once per project,
 * so every project carries its own plugin instance.
 * @type {WeakMap<Vitest, Promise<RunState>>}
 */
const runs = new WeakMap()

/**
 * @param {Vitest} vitest
 * @returns {Promise<RunState>}
 */
const judgedRun = (vitest) => {
  const found = runs.get(vitest)
  if (found !== undefined) return found
  const started = runStateOf(vitest).then((state) => {
    vitest.config.reporters.push(reporterFor(state))
    return state
  })
  runs.set(vitest, started)
  return started
}

/**
 * The conformance coverage gate. `defineConfig` from this package adds it to
 * every config, so a package does not opt in.
 * @returns {Plugin}
 */
export const conformanceCoverage = () => {
  /** @type {RunState | undefined} */
  let run
  return {
    name: '@systemfsoftware/conformance-coverage',
    enforce: 'pre',
    /** @param {VitestPluginContext} context */
    async configureVitest(context) {
      if (isStartedByATest()) return
      run = await judgedRun(context.vitest)
    },
    transform(code, rawId) {
      const id = posix(rawId.split('?')[0] ?? rawId)
      if (run === undefined || id.includes('/node_modules/') || id.startsWith('\0')) return null
      return instrument(run, code, id)
    },
  }
}
