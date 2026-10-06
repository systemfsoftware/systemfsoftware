#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
import ts from 'typescript'
import { judge, type ListVerdict } from './check-upstream-test-manifest.ts'

const IMPORT_COMMIT = 'df92a9ad3f'
const FAMILY = 'packages/xstate'
const MANIFEST = 'upstream-tests.json'
const CEILING = 'scripts/guards/upstream-api-ceiling.json'
const SOURCE_CONDITION = '@systemfsoftware/source'
const ROOT = '/v/'
const SOURCE_FILE = /\/src\/.+\.tsx?$/
const TYPESCRIPT_FILE = /\.tsx?$/
const TEST_FILE = /\.test\.tsx?$/
const FORGOTTEN = /\(ae-forgotten-export\) The symbol "([^"]+)" needs to be exported/g
const ARTEFACT = /(?<![\w$])([A-Za-z_][\w$]*?(?:_base|_\d+|\$\d+))(?![\w$])/g
const DIRECTIVE = /@effect-diagnostics(?:-next-line)?\s+([\w-]+):/g

const FACADE_UNIT: Readonly<Record<string, string>> = {
  xstate: 'U6',
  'xstate-react': 'U6',
  'xstate-effect': 'U5',
  'xstate-store': 'U13',
  'xstate-store-react': 'U13',
  'xstate-test': 'U14',
}

type Forgotten = { readonly report: string; readonly symbol: string; readonly unit: string }
type Artefact = { readonly report: string; readonly symbol: string; readonly reason: string }
type Grant = {
  readonly file: string
  readonly diagnostic: string
  readonly site: string
  readonly reason: string
  readonly unit: string
}

type Manifest = {
  readonly exports?: Readonly<Record<string, readonly string[]>>
  readonly forgotten?: readonly Forgotten[]
  readonly artefacts?: readonly Artefact[]
  readonly grants?: readonly Grant[]
  readonly [key: string]: unknown
}

type Ceiling = {
  readonly forgotten: readonly string[]
  readonly artefacts: readonly string[]
  readonly grants: readonly string[]
}

type PackageJson = {
  readonly name: string
  readonly exports?: Readonly<Record<string, string | { readonly [SOURCE_CONDITION]?: string }>>
  readonly preconstruct?: { readonly entrypoints?: readonly string[] }
}

const dec = new TextDecoder()

const runGit = async (args: readonly string[], stdin?: string): Promise<Uint8Array> => {
  const child = new Deno.Command('git', {
    args: [...args],
    stdin: stdin === undefined ? 'null' : 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter()
    await writer.write(new TextEncoder().encode(stdin))
    await writer.close()
  }
  const out = await child.output()
  if (!out.success) throw new Error(`git ${args.join(' ')} failed: ${dec.decode(out.stderr)}`)
  return out.stdout
}

const lines = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0)

export const entrySubpath = (entrypoint: string): string => {
  const stem = entrypoint.replace(/\.tsx?$/, '').replace(/(^|\/)index$/, '')
  return stem === '.' || stem === '' ? '.' : stem
}

export type ModuleExports = { readonly names: readonly string[]; readonly internal: readonly string[] }

export const exportNames = (
  files: ReadonlyMap<string, string>,
  roots: readonly string[],
  paths: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, ModuleExports>> => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    noLib: true,
    types: [],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.Preserve,
    baseUrl: ROOT,
    paths: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, [...value]])),
  }
  const dirs = new Set(
    [...files.keys()].flatMap((file) => {
      const parts = file.split('/').slice(1, -1)
      return parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`)
    }),
  )
  const host: ts.CompilerHost = {
    getSourceFile: (name, language) => {
      const text = files.get(name)
      return text === undefined ? undefined : ts.createSourceFile(name, text, language)
    },
    getDefaultLibFileName: () => `${ROOT}lib.d.ts`,
    writeFile: () => undefined,
    getCurrentDirectory: () => ROOT,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => files.has(name),
    readFile: (name) => files.get(name),
    directoryExists: (name) => dirs.has(name.replace(/\/$/, '')),
    realpath: (name) => name,
  }
  const program = ts.createProgram([...roots], options, host)
  const checker = program.getTypeChecker()
  const isInternal = (symbol: ts.Symbol): boolean => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    return (target.declarations ?? []).some((declaration) =>
      ts.getJSDocTags(declaration).some((tag) => tag.tagName.text === 'internal')
    )
  }
  return Object.fromEntries(roots.map((root) => {
    const source = program.getSourceFile(root)
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)
    const exported = symbol === undefined ? [] : checker.getExportsOfModule(symbol)
    return [root, {
      names: exported.map((s) => s.name).toSorted(),
      internal: exported.filter(isInternal).map((s) => s.name).toSorted(),
    }]
  }))
}

const reportCode = (report: string): string => /```ts\n([\s\S]*?)\n```/.exec(report.replaceAll('\r\n', '\n'))?.[1] ?? ''

export const reportExports = (
  report: string,
  reportsBySpecifier: Readonly<Record<string, string>> = {},
): readonly string[] => {
  const file = `${ROOT}report.d.ts`
  const files = new Map([[file, reportCode(report)]])
  const paths: Record<string, readonly string[]> = {}
  for (const [specifier, text] of Object.entries(reportsBySpecifier)) {
    const dependency = `${ROOT}dep/${specifier.replaceAll('/', '_')}.d.ts`
    files.set(dependency, reportCode(text))
    paths[specifier] = [dependency]
  }
  return exportNames(files, [file], paths)[file]?.names ?? []
}

export const reportName = (dir: string, subpath: string): string =>
  `${dir}${subpath === '.' ? '' : `-${subpath.slice(2).replaceAll('/', '-')}`}.api.md`

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].toSorted()

export const forgottenIn = (report: string): readonly string[] =>
  unique([...report.matchAll(FORGOTTEN)].map((match) => match[1] ?? ''))

export const artefactsIn = (report: string): readonly string[] =>
  unique([...report.matchAll(ARTEFACT)].map((match) => match[1] ?? ''))

const OBSERVER_DECLARATION = /export type Observer<T> = \{([^}]*)\}/

/** The `Observer<T>` members a published report declares, as `[name, type]` in declaration order. */
export const observerMembers = (report: string): ReadonlyArray<readonly [string, string]> =>
  (OBSERVER_DECLARATION.exec(reportCode(report))?.[1] ?? '').split('\n').flatMap((line) => {
    const match = /^\s*([A-Za-z_$][\w$]*)\??:\s*(.+?);\s*$/.exec(line)
    return match === null ? [] : [[match[1] ?? '', match[2] ?? ''] as const]
  })

export type ObserverVerdict =
  | { readonly _tag: 'Held' }
  | {
    readonly _tag: 'Diverged'
    readonly member: string
    readonly spelled: ReadonlyArray<{ readonly report: string; readonly type: string }>
  }

/**
 * The same-named `Observer<T>` member must be spelled identically wherever the type is published, so a
 * package that drops core's `| undefined` widening, or diverges any other way, fails here.
 */
export const judgeObserverMembers = (
  members: ReadonlyArray<{ readonly member: string; readonly type: string; readonly report?: string }>,
): ObserverVerdict => {
  for (const member of unique(members.map((entry) => entry.member))) {
    const same = members.filter((entry) => entry.member === member)
    if (unique(same.map((entry) => entry.type)).length > 1) {
      return {
        _tag: 'Diverged',
        member,
        spelled: same.map((entry) => ({ report: entry.report ?? 'a report', type: entry.type })),
      }
    }
  }
  return { _tag: 'Held' }
}

const reportObservers = (verdict: ObserverVerdict): number => {
  if (verdict._tag === 'Held') return 0
  console.error(`✗ the Observer<T> member ${verdict.member} is spelled more than one way across the reports`)
  for (const entry of verdict.spelled) console.error(`    ${entry.report}: ${entry.type}`)
  return 1
}

export const grantsIn = (
  file: string,
  text: string,
): ReadonlyArray<{ readonly diagnostic: string; readonly site: string }> => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
  const seen = new Set<number>()
  const comments: ts.CommentRange[] = []
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
      if (!seen.has(range.pos)) {
        seen.add(range.pos)
        comments.push(range)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return comments.toSorted((a, b) => a.pos - b.pos).flatMap((range) => {
    const comment = text.slice(range.pos, range.end)
    const after = text.slice(range.end).split('\n').map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('//')) ?? ''
    return [...comment.matchAll(DIRECTIVE)].map((match) => ({ diagnostic: match[1] ?? '', site: after }))
  })
}

export type RecordVerdict =
  | { readonly _tag: 'Held' }
  | {
    readonly _tag: 'Broken'
    readonly unrecorded: readonly string[]
    readonly stale: readonly string[]
    readonly aboveCeiling: readonly string[]
  }

export const judgeRecord = (
  found: readonly string[],
  recorded: readonly string[],
  ceiling: readonly string[],
): RecordVerdict => {
  const verdict: ListVerdict = judge(recorded, found)
  const allowed = new Set(ceiling)
  const unrecorded = verdict._tag === 'Drifted' ? verdict.missing : []
  const stale = verdict._tag === 'Drifted' ? verdict.extra : []
  const aboveCeiling = unique([...found, ...recorded]).filter((key) => !allowed.has(key))
  return unrecorded.length + stale.length + aboveCeiling.length === 0
    ? { _tag: 'Held' }
    : { _tag: 'Broken', unrecorded, stale, aboveCeiling }
}

const selftest = (): number => {
  const files = new Map([
    [`${ROOT}p/src/index.ts`, "export * from './a.ts'\nexport { b as c } from './b'\nexport type { T } from 'dep'\n"],
    [`${ROOT}p/src/a.ts`, 'export const a1 = 1\n/** @internal */\nexport type A2 = 2\n'],
    [`${ROOT}p/src/b.ts`, 'export const b = 1\nexport const hidden = 2\n'],
    [`${ROOT}dep/src/index.ts`, 'export type T = 1\n'],
  ])
  const names = exportNames(files, [`${ROOT}p/src/index.ts`], { dep: [`${ROOT}dep/src/index.ts`] })[
    `${ROOT}p/src/index.ts`
  ]
  const report = [
    '// Warning: (ae-forgotten-export) The symbol "Snapshot" needs to be exported by the entry point index.d.ts',
    '// dist/a.d.ts:3:1 - (ae-forgotten-export) The symbol "Snapshot" needs to be exported by the entry point index.d.ts',
    '// Warning: (ae-forgotten-export) The symbol "Thing_base" needs to be exported by the entry point index.d.ts',
    'export class Thing extends Thing_base {}',
    'export { Selection_2 as Selection, MergeChildren$1, v2 }',
  ].join('\n')
  const grants = grantsIn(
    'g.ts',
    [
      "const s = '// @effect-diagnostics-next-line globalDate:off'",
      'class A extends Base(',
      '  // reason',
      '  // @effect-diagnostics-next-line deterministicKeys:off',
      "  'A',",
      ') {}',
    ].join('\n'),
  )
  const cases: ReadonlyArray<[string, boolean]> = [
    [
      'the checker follows star, renamed and cross-package re-exports',
      names?.names.join() === 'A2,T,a1,c' && names.internal.join() === 'A2',
    ],
    ['a root entrypoint is the package subpath', entrySubpath('./index.ts') === '.'],
    ['a directory entrypoint is its directory', entrySubpath('./actors/index.ts') === './actors'],
    ['a file entrypoint is its stem', entrySubpath('./effect-schema.ts') === './effect-schema'],
    [
      'a subpath report carries the subpath in its name',
      reportName('xstate-test', './effect-schema') === 'xstate-test-effect-schema.api.md',
    ],
    ['the root report is the package name', reportName('xstate', '.') === 'xstate.api.md'],
    [
      'a CRLF report exports its declarations, renamed and all',
      reportExports(`# api\n\n\`\`\`ts\n${report}\n\`\`\`\n`.replaceAll('\n', '\r\n')).join() ===
        'MergeChildren$1,Selection,Thing,v2',
    ],
    [
      "a report's export * from a family package resolves through that package's report",
      reportExports('```ts\nexport * from "dep";\nexport const own = 1;\n```', {
        dep: '```ts\nexport type Store = 1;\nexport const make = 2;\n```',
      }).join() === 'Store,make,own',
    ],
    ['a report names each forgotten symbol once', forgottenIn(report).join() === 'Snapshot,Thing_base'],
    [
      'a report names each emitter artefact once, and a plain name is none',
      artefactsIn(report).join() === 'MergeChildren$1,Selection_2,Thing_base',
    ],
    [
      'a directive in a comment is a grant keyed by its site, and one in a string is not',
      grants.length === 1 && grants[0]?.diagnostic === 'deterministicKeys' && grants[0]?.site === "'A',",
    ],
    ['a record equal to the tree holds', judgeRecord(['p/r:A'], ['p/r:A'], ['p/r:A'])._tag === 'Held'],
    [
      'an unrecorded finding is refused',
      judgeRecord(['p/r:A', 'p/r:B'], ['p/r:A'], ['p/r:A', 'p/r:B'])._tag === 'Broken',
    ],
    ['a stale record is refused', judgeRecord([], ['p/r:A'], ['p/r:A'])._tag === 'Broken'],
    [
      'a finding above the ceiling is refused even when recorded',
      judgeRecord(['p/r:B'], ['p/r:B'], ['p/r:A'])._tag === 'Broken',
    ],
    [
      'an Observer declaration yields its named members',
      observerMembers('```ts\nexport type Observer<T> = {\n    next?: ((value: T) => void) | undefined;\n};\n```')
        .map(([name]) => name)
        .join() === 'next',
    ],
    [
      'the same Observer member spelled one way across reports holds',
      judgeObserverMembers([{ member: 'next', type: 'a' }, { member: 'next', type: 'a' }])._tag === 'Held',
    ],
    [
      'an Observer member spelled another way is refused',
      judgeObserverMembers([
        { member: 'next', type: '(value: T) => void' },
        { member: 'next', type: '((value: T) => void) | undefined' },
      ])._tag === 'Diverged',
    ],
  ]
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = cases.filter(([, ok]) => !ok).length
  console.log(`check-upstream-api: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
  return failed === 0 ? 0 : 1
}

const readJson = async <A>(path: string): Promise<A> => JSON.parse(await Deno.readTextFile(path)) as A

const upstreamTree = async (): Promise<ReadonlyMap<string, string>> => {
  const names = lines(dec.decode(await runGit(['ls-tree', '-r', '--name-only', IMPORT_COMMIT, '--', FAMILY])))
    .filter((path) => path.endsWith('/package.json') || (SOURCE_FILE.test(path) && !TEST_FILE.test(path)))
  const raw = await runGit(['cat-file', '--batch'], `${names.map((name) => `${IMPORT_COMMIT}:${name}`).join('\n')}\n`)
  const files = new Map<string, string>()
  let at = 0
  for (const name of names) {
    const header = raw.indexOf(10, at)
    const size = Number(dec.decode(raw.subarray(at, header)).split(' ')[2])
    files.set(`${ROOT}${name}`, dec.decode(raw.subarray(header + 1, header + 1 + size)))
    at = header + 1 + size + 1
  }
  return files
}

const forkTree = async (tracked: readonly string[]): Promise<ReadonlyMap<string, string>> =>
  new Map(
    await Promise.all(
      tracked.filter((path) => SOURCE_FILE.test(path) && !TEST_FILE.test(path))
        .map(async (name) => [`${ROOT}${name}`, await Deno.readTextFile(name)] as const),
    ),
  )

type Entry = { readonly dir: string; readonly subpath: string; readonly file: string }

const upstreamEntries = (tree: ReadonlyMap<string, string>, dirs: readonly string[]): readonly Entry[] =>
  dirs.flatMap((dir) => {
    const pkg: PackageJson = JSON.parse(tree.get(`${ROOT}${FAMILY}/${dir}/package.json`) ?? '{}')
    return (pkg.preconstruct?.entrypoints ?? ['./index.ts']).map((entrypoint) => ({
      dir,
      subpath: entrySubpath(entrypoint),
      file: `${ROOT}${FAMILY}/${dir}/src/${entrypoint.slice(2)}`,
    }))
  })

const forkEntries = (packages: Readonly<Record<string, PackageJson>>): readonly Entry[] =>
  Object.entries(packages).flatMap(([dir, pkg]) =>
    Object.entries(pkg.exports ?? {}).flatMap(([subpath, conditions]) => {
      const source = typeof conditions === 'string' ? undefined : conditions[SOURCE_CONDITION]
      return source === undefined ? [] : [{ dir, subpath, file: `${ROOT}${FAMILY}/${dir}/${source.slice(2)}` }]
    })
  )

const specifierPaths = (
  entries: readonly Entry[],
  name: (dir: string) => string,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(entries.map((entry) => [`${name(entry.dir)}${entry.subpath.slice(1)}`, [entry.file]]))

const reportList = (verdict: ListVerdict, header: string): number => {
  if (verdict._tag === 'Matches') return 0
  console.error(`✗ ${header}`)
  for (const name of verdict.extra) console.error(`    exported but not upstream's: ${name}`)
  for (const name of verdict.missing) console.error(`    upstream's but not exported: ${name}`)
  return 1
}

const reportRecord = (verdict: RecordVerdict, what: string): number => {
  if (verdict._tag === 'Held') return 0
  console.error(`✗ the ${what} record does not match the tree`)
  for (const key of verdict.unrecorded) console.error(`    found, not recorded in ${MANIFEST}: ${key}`)
  for (const key of verdict.stale) console.error(`    recorded, no longer found: ${key}`)
  for (const key of verdict.aboveCeiling) console.error(`    above the ceiling in ${CEILING}: ${key}`)
  return 1
}

type Found = {
  readonly texts: Readonly<Record<string, string>>
  readonly forgotten: readonly Forgotten[]
  readonly artefacts: readonly string[]
}

const scanReports = async (dir: string, tracked: readonly string[]): Promise<Found> => {
  const reports = tracked.filter((path) => path.startsWith(`${FAMILY}/${dir}/etc/`) && path.endsWith('.api.md'))
  const texts = await Promise.all(
    reports.map(async (file) => [file.slice(file.lastIndexOf('/') + 1), await Deno.readTextFile(file)] as const),
  )
  return {
    texts: Object.fromEntries(texts),
    forgotten: texts.flatMap(([report, text]) =>
      forgottenIn(text).map((symbol) => ({ report, symbol, unit: FACADE_UNIT[dir] ?? 'unassigned' }))
    ),
    artefacts: texts.flatMap(([report, text]) => artefactsIn(text).map((symbol) => `${report}:${symbol}`)),
  }
}

const scanGrants = async (dir: string, tracked: readonly string[]): Promise<readonly string[]> => {
  const files = tracked.filter((path) => path.startsWith(`${FAMILY}/${dir}/`) && TYPESCRIPT_FILE.test(path))
  const found = await Promise.all(files.map(async (path) => {
    const file = path.slice(FAMILY.length + dir.length + 2)
    return grantsIn(file, await Deno.readTextFile(path)).map((grant) => `${file}:${grant.diagnostic}:${grant.site}`)
  }))
  return found.flat()
}

const main = async (write: boolean): Promise<number> => {
  const tracked = lines(dec.decode(await runGit(['ls-files', '--', FAMILY])))
  const manifests = tracked.filter((path) => path.endsWith(`/${MANIFEST}`) && path.split('/').length === 4)
  const dirs = manifests.map((path) => path.slice(FAMILY.length + 1, -(MANIFEST.length + 1)))
  const packages = Object.fromEntries(
    await Promise.all(
      dirs.map(async (dir) => [dir, await readJson<PackageJson>(`${FAMILY}/${dir}/package.json`)] as const),
    ),
  )
  const upTree = await upstreamTree()
  const upEntries = upstreamEntries(upTree, dirs)
  const ownEntries = forkEntries(packages)
  const upNames = exportNames(
    upTree,
    upEntries.map((entry) => entry.file),
    specifierPaths(upEntries, (dir) => dir === 'xstate' ? 'xstate' : `@xstate/${dir.slice('xstate-'.length)}`),
  )
  const ownNames = exportNames(
    await forkTree(tracked),
    ownEntries.map((entry) => entry.file),
    specifierPaths(ownEntries, (dir) => packages[dir]?.name ?? dir),
  )
  const ceiling = await readJson<Ceiling>(CEILING)
  const found = { forgotten: [] as string[], artefacts: [] as string[], grants: [] as string[] }
  const recorded = { forgotten: [] as string[], artefacts: [] as string[], grants: [] as string[] }
  let failed = 0
  const reportsBySpecifier: Record<string, string> = {}
  for (const entry of ownEntries) {
    const text = (await scanReports(entry.dir, tracked)).texts[reportName(entry.dir, entry.subpath)]
    if (text !== undefined) {
      reportsBySpecifier[`${packages[entry.dir]?.name ?? entry.dir}${entry.subpath.slice(1)}`] = text
    }
  }
  const observers: Array<{ readonly member: string; readonly type: string; readonly report: string }> = []
  for (const dir of dirs) {
    const path = `${FAMILY}/${dir}/${MANIFEST}`
    const manifest = await readJson<Manifest>(path)
    const upstreamExports = Object.fromEntries(
      upEntries.filter((entry) => entry.dir === dir).map((entry) => [entry.subpath, upNames[entry.file]]),
    )
    const upstream = Object.fromEntries(
      Object.entries(upstreamExports).map(([subpath, found]) => [subpath, found?.names ?? []]),
    )
    const own = Object.fromEntries(
      ownEntries.filter((entry) => entry.dir === dir).map((
        entry,
      ) => [entry.subpath, ownNames[entry.file]?.names ?? []]),
    )
    const reports = await scanReports(dir, tracked)
    for (const [report, text] of Object.entries(reports.texts)) {
      observers.push(...observerMembers(text).map(([member, type]) => ({ member, type, report: `${dir}/${report}` })))
    }
    if (write) {
      await Deno.writeTextFile(
        path,
        `${JSON.stringify({ ...manifest, exports: upstream, forgotten: reports.forgotten }, null, 2)}\n`,
      )
      console.log(
        `wrote ${path} (${Object.keys(upstream).length} entry points, ${reports.forgotten.length} forgotten exports)`,
      )
    }
    const exports = write ? upstream : manifest.exports ?? {}
    failed += reportList(
      judge(Object.keys(own).toSorted(), Object.keys(upstream).toSorted()),
      `${dir}: entry points differ from upstream's at ${IMPORT_COMMIT}`,
    )
    for (const subpath of Object.keys(upstream).toSorted()) {
      failed += reportList(
        judge(exports[subpath] ?? [], upstream[subpath] ?? []),
        `${path}: the recorded exports of ${subpath} differ from upstream's at ${IMPORT_COMMIT}`,
      )
      failed += reportList(
        judge(own[subpath] ?? [], exports[subpath] ?? []),
        `${dir} ${subpath}: exported names differ from upstream's`,
      )
      const report = reportName(dir, subpath)
      const published = reports.texts[report]
      if (published === undefined) {
        failed += 1
        console.error(`✗ ${dir} ${subpath}: no committed API report ${report}`)
      } else {
        const internal = new Set(upstreamExports[subpath]?.internal ?? [])
        failed += reportList(
          judge(
            reportExports(published, reportsBySpecifier),
            (exports[subpath] ?? []).filter((name) => !internal.has(name)),
          ),
          `${dir} ${subpath}: the published declarations in ${report} export other names than upstream's non-@internal ones`,
        )
      }
    }
    const forgotten = write ? reports.forgotten : manifest.forgotten ?? []
    const unexplained = [
      ...forgotten.filter((entry) => entry.unit !== FACADE_UNIT[dir]).map((entry) => `forgotten ${entry.symbol}`),
      ...(manifest.grants ?? []).filter((grant) => grant.unit !== FACADE_UNIT[dir] || grant.reason.trim() === '')
        .map((grant) => `grant ${grant.file}:${grant.diagnostic}`),
      ...(manifest.artefacts ?? []).filter((entry) => entry.reason.trim() === '').map((entry) =>
        `artefact ${entry.symbol}`
      ),
    ]
    if (unexplained.length > 0) {
      failed += 1
      console.error(`✗ ${path}: entries without a reason or naming a unit other than ${FACADE_UNIT[dir]}`)
      for (const entry of unexplained) console.error(`    ${entry}`)
    }
    found.forgotten.push(...reports.forgotten.map((entry) => `${dir}/${entry.report}:${entry.symbol}`))
    recorded.forgotten.push(...forgotten.map((entry) => `${dir}/${entry.report}:${entry.symbol}`))
    found.artefacts.push(...reports.artefacts.map((key) => `${dir}/${key}`))
    recorded.artefacts.push(...(manifest.artefacts ?? []).map((entry) => `${dir}/${entry.report}:${entry.symbol}`))
    found.grants.push(...(await scanGrants(dir, tracked)).map((key) => `${dir}/${key}`))
    recorded.grants.push(
      ...(manifest.grants ?? []).map((grant) => `${dir}/${grant.file}:${grant.diagnostic}:${grant.site}`),
    )
  }
  failed += reportRecord(
    judgeRecord(unique(found.forgotten), unique(recorded.forgotten), ceiling.forgotten),
    'forgotten-export',
  )
  failed += reportRecord(
    judgeRecord(unique(found.artefacts), unique(recorded.artefacts), ceiling.artefacts),
    'report-artefact',
  )
  failed += reportRecord(
    judgeRecord(found.grants.toSorted(), recorded.grants.toSorted(), ceiling.grants),
    'diagnostic-grant',
  )
  failed += reportObservers(judgeObserverMembers(observers))
  if (failed === 0) {
    console.log(
      `✓ ${ownEntries.length} entry points export exactly upstream's names; ${recorded.forgotten.length} forgotten exports, ${recorded.artefacts.length} report artefacts and ${recorded.grants.length} grants, each recorded and under the ceiling`,
    )
  }
  return failed === 0 ? 0 : 1
}

if (import.meta.main) {
  Deno.exit(Deno.args.includes('--selftest') ? selftest() : await main(Deno.args.includes('--write')))
}
