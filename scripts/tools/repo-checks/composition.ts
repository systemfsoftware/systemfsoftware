// The gates of the composition pack (compound-packs/composition): how the units of a workspace compose.
//
// Two kinds of rule, kept apart on purpose:
//
//  - FACT-GATED rules (unit-kinds, graph, contracts, and the internal-null and alias parts of entries and
//    imports) read objective facts from the real tools: the TypeScript compiler's import graph, the package.json
//    exports resolver, the syntax tree and the type checker (composition-facts.ts). They fail on a fact.
//  - JUDGE-GATED rules (entries-are-roles, test-only-exports, granularity, core-adapter-split) are judgement
//    calls. The facts become structured evidence for a calibrated panel of rubric judges (composition-judge.ts).
//    A violated verdict fails only when the panel agrees and the rule's calibration kappa is at least 0.7;
//    otherwise, and for every uncertain verdict, it is reported for a human.
//
// There is no pattern over source text in this file: an import inside a string, a destructured `env`, a `dist`
// target and a leaf library's root entry are each decided by the compiler or by the judge, never by a regex.
import { join } from '@std/path'
import {
  declaredDependencies,
  importedUnits,
  isBuildOutput,
  isRuntimeModule,
  type Json,
  judgedAsLibrary,
  loadWorkspace,
  sourcesOf,
  type Unit,
  type Workspace,
} from './composition-facts.ts'
import type { Judge, JudgedRule, PanelVerdict } from './composition-judge.ts'
import { exportsMapOf, resolveExports, targetsOf } from './package-exports.ts'
import { git, holds, type Verdict, violated } from './verdict.ts'

export { loadWorkspace } from './composition-facts.ts'

/** A guide the entries-are-roles judge is shown, never a limit: a library may legitimately publish more role entries. */
const ROLE_ENTRY_GUIDE = 8
const SHOWN_ENTRIES = 40
const RUNTIME_CONDITIONS = ['workerd', 'worker', 'node', 'browser', 'bun', 'deno', 'edge-light', 'react-native']

const sortedUnique = (lines: readonly string[]): readonly string[] => [...new Set(lines)].sort()

const finish = (
  name: string,
  violations: readonly string[],
  why: string,
  summary: string,
  reports: readonly string[] = [],
): Verdict => {
  const reported = reports.length === 0
    ? ''
    : `\nreported, not failing:\n${sortedUnique(reports).map((r) => `  ${r}`).join('\n')}`
  return violations.length === 0
    ? holds(reports.length === 0 ? summary : `${summary}${reported}`)
    : violated(sortedUnique(violations), `${name}: ${why}${reported}`)
}

const isPublished = (unit: Unit): boolean => unit.manifest['private'] !== true

// ---------------------------------------------------------------- the judge

export interface Candidate {
  readonly label: string
  readonly evidence: unknown
  /** Why a violated verdict for this candidate may only be reported, whatever the rule's calibration (e.g. its unit kind is not declared). */
  readonly reportOnly?: string
}

const brief = (panel: PanelVerdict): string =>
  panel.members.map((m) => `${m.model} ${m.verdict}(${m.confidence}): ${m.evidence.slice(0, 3).join('; ')}`).join(' | ')

/** Runs the panel over the candidates: what may fail is returned as violations, everything else as reports. */
const judged = async (
  judge: Judge | undefined,
  rule: JudgedRule,
  candidates: readonly Candidate[],
): Promise<{ readonly violations: readonly string[]; readonly reports: readonly string[] }> => {
  if (candidates.length === 0) return { violations: [], reports: [] }
  if (judge === undefined) {
    return {
      violations: [],
      reports: [`${rule}: ${candidates.length} candidate(s) not judged (no judge configured: set OPENROUTER_API_KEY)`],
    }
  }
  const gate = judge.gate(rule)
  const violations: string[] = []
  const reports: string[] = []
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4)
    const verdicts = await Promise.all(batch.map((c) => judge.decide(rule, c.evidence)))
    batch.forEach((candidate, j) => {
      const panel = verdicts[j]!
      if (panel.verdict === 'violated') {
        const note = candidate.reportOnly === undefined ? gate.note : `${candidate.reportOnly}: reports only`
        const line = `${candidate.label}: judged ${rule} violated by the panel (${note}) - ${brief(panel)}`
        if (gate.fails && candidate.reportOnly === undefined) violations.push(line)
        else reports.push(line)
      } else if (panel.verdict === 'uncertain') {
        reports.push(`${candidate.label}: ${rule} uncertain, for a human - ${brief(panel)}`)
      }
    })
  }
  return { violations, reports }
}

// ---------------------------------------------------------------- unit kinds

export const checkCompositionUnitKinds = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  for (const unit of ws.units) {
    const declared = unit.manifest['unit']
    if (declared === undefined) {
      violations.push(`${unit.rel} (${unit.name}): no "unit" declared; expected library, application or template`)
      continue
    }
    if (unit.kind === undefined) {
      violations.push(
        `${unit.rel} (${unit.name}): "unit": ${JSON.stringify(declared)} is not library, application or template`,
      )
      continue
    }
    if (unit.kind === 'application') {
      if (unit.manifest['private'] !== true) {
        violations.push(`${unit.rel} (${unit.name}): an application must be "private": true`)
      }
      if (unit.manifest['exports'] !== undefined) {
        violations.push(`${unit.rel} (${unit.name}): an application has no "exports"`)
      }
    }
    if (unit.kind === 'library') {
      const scripts = unit.manifest['scripts']
      const deploy = typeof scripts === 'object' && scripts !== null
        ? Object.keys(scripts).filter((s) => s === 'deploy' || s.startsWith('deploy:'))
        : []
      if (deploy.length > 0) {
        violations.push(`${unit.rel} (${unit.name}): a library has no deploy script (${deploy.join(', ')})`)
      }
    }
  }
  return finish(
    'composition-unit-kinds',
    violations,
    "every workspace unit declares library, application or template, and its manifest has that kind's shape (compound-packs/composition/three-unit-kinds.md).",
    `${ws.units.length} workspace units declare their kind`,
  )
}

// --------------------------------------------------------------------- graph

const findCycles = (edges: ReadonlyMap<string, ReadonlySet<string>>): readonly (readonly string[])[] => {
  // Tarjan's strongly connected components; a component of two or more nodes is a cycle.
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []
  const visit = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) low.set(node, Math.min(low.get(node)!, index.get(next)!))
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) cycles.push(component.sort())
    }
  }
  for (const node of [...edges.keys()].sort()) if (!index.has(node)) visit(node)
  return cycles
}

export const checkCompositionGraph = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  const reports: string[] = []
  const notInstalled: string[] = []
  const edges = new Map<string, Set<string>>(ws.units.map((u) => [u.name, new Set<string>()]))
  for (const unit of ws.units) {
    const declared = declaredDependencies(unit)
    // A devDependency may feed tooling (a tsconfig to extend, a test runner), so only a runtime declaration can be unused.
    const runtimeDeclared = declaredDependencies(unit, ['dependencies', 'peerDependencies', 'optionalDependencies'])
    const imported = importedUnits(unit)
    for (const name of new Set([...declared, ...imported])) {
      const target = ws.byName.get(name)
      if (target === undefined || target === unit) continue
      edges.get(unit.name)!.add(name)
      if (target.kind === 'application') {
        violations.push(
          `${unit.name} -> ${name}: an edge into an application (${declared.has(name) ? 'declared' : 'imported'})`,
        )
      }
      if (imported.has(name) && !declared.has(name)) {
        violations.push(`${unit.name} imports ${name} without declaring it`)
      }
      if (runtimeDeclared.has(name) && !imported.has(name)) {
        // An import is the only use the compiler can see. A library that declares one it never imports has no other
        // way to use it; an application or template, or a unit that has not declared its kind, may install it as a
        // toolchain or into a container, so for those it is reported and not failed.
        const line = `${unit.name} declares ${name} but never imports it`
        if (unit.kind === 'library') violations.push(line)
        else reports.push(`${line} (${unit.kind ?? 'kind not declared'}: may be installed as a toolchain)`)
      }
    }
    if (!judgedAsLibrary(unit)) continue
    if (unit.unresolved.length > 0) notInstalled.push(`${unit.name} (${unit.unresolved.length})`)
    const core = unit.manifest['layer'] === 'core'
    for (const file of sourcesOf(unit).filter((f) => !f.isToolConfig)) {
      if (core) {
        for (const i of file.imports.filter((i) => !i.typeOnly && isRuntimeModule(i.specifier))) {
          violations.push(
            `${unit.name}: core library ${file.rel} imports the runtime or framework module ${i.specifier}`,
          )
        }
      }
      for (const env of file.env) {
        violations.push(
          `${unit.name}: library ${file.rel}:${env.line} references ${env.kind}; only applications read configuration`,
        )
      }
    }
  }
  if (notInstalled.length > 0) {
    reports.push(
      `${notInstalled.length} libraries import packages the compiler cannot resolve (dependencies not installed, so a type they declare is unknown and a Cloudflare env typed by them is not detected): ${
        notInstalled.join(', ')
      }`,
    )
  }
  for (const cycle of findCycles(edges)) violations.push(`cycle: ${cycle.join(' <-> ')}`)
  return finish(
    'composition-graph',
    violations,
    'edges point from applications to libraries, declared dependencies match imports, the graph has no cycle, core libraries import no runtime, and libraries read no environment (compound-packs/composition/dependency-direction.md, core-and-adapters.md, config-at-the-edge.md).',
    `${ws.units.length} units, ${[...edges.values()].reduce((n, e) => n + e.size, 0)} edges, no violation`,
    reports,
  )
}

// ------------------------------------------------------------------- entries

interface EntryFact {
  readonly key: string
  readonly targets: readonly string[]
  readonly sourceTarget: string | undefined
  readonly buildOutputOnly: boolean
  /** The key repeats the source path after `src/`, and that path is nested in two or more folders. */
  readonly mirrorsFolderTree: boolean
  readonly sourceFolderDepth: number
}

const stripExtension = (path: string): string => {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  return dot > slash + 1 ? path.slice(0, dot) : path
}

const entryFacts = (unit: Unit): readonly EntryFact[] => {
  const map = exportsMapOf(unit.manifest)
  if (map === undefined) return []
  const conditions = new Set(unit.conditions)
  const facts: EntryFact[] = []
  for (const [key, value] of Object.entries(map)) {
    if (value === null || key === './package.json') continue
    const targets = targetsOf(value)
    const resolved = resolveExports(unit.manifest, key, conditions)?.target
    const source = (typeof resolved === 'string' && !isBuildOutput(resolved) ? resolved : undefined) ??
      targets.find((t) => !isBuildOutput(t))
    let path = source === undefined ? undefined : stripExtension(source.startsWith('./') ? source.slice(2) : source)
    if (path !== undefined && path.startsWith('src/')) path = path.slice(4)
    if (path !== undefined && path.endsWith('/index')) path = path.slice(0, -'/index'.length)
    const depth = path === undefined ? 0 : path.split('/').length - 1
    facts.push({
      key,
      targets,
      sourceTarget: source,
      buildOutputOnly: targets.length > 0 && targets.every(isBuildOutput),
      mirrorsFolderTree: path !== undefined && key !== '.' && key.slice(2) === path && depth >= 2,
      sourceFolderDepth: depth,
    })
  }
  return facts
}

/** The evidence the entries-are-roles judge receives for a library. */
export const entriesEvidence = (unit: Unit): Json => {
  const entries = entryFacts(unit)
  return {
    package: unit.name,
    published: isPublished(unit),
    entryCount: entries.length,
    roleEntryGuide: ROLE_ENTRY_GUIDE,
    entriesShown: Math.min(entries.length, SHOWN_ENTRIES),
    entriesMirroringFolderTree: entries.filter((e) => e.mirrorsFolderTree).length,
    hasInternalFolder: unit.hasInternalFolder,
    internalBlocked: exportsMapOf(unit.manifest)?.['./internal/*'] === null,
    entries: entries.slice(0, SHOWN_ENTRIES).map((e) => ({
      key: e.key,
      sourceTarget: e.sourceTarget,
      buildOutputOnly: e.buildOutputOnly,
      mirrorsFolderTree: e.mirrorsFolderTree,
      sourceFolderDepth: e.sourceFolderDepth,
    })),
  }
}

export const checkCompositionEntries = async (root: string, judge?: Judge): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  const candidates: Candidate[] = []
  const reports: string[] = []
  let libraries = 0
  for (const unit of ws.units.filter(judgedAsLibrary)) {
    libraries++
    const map = exportsMapOf(unit.manifest)
    if (map === undefined) continue
    const keys = Object.keys(map)
    const roleEntries = entryFacts(unit).length
    if (roleEntries > ROLE_ENTRY_GUIDE) {
      reports.push(
        `${unit.rel} (${unit.name}): ${roleEntries} role entries, over the guide of ${ROLE_ENTRY_GUIDE}; judged as roles or a folder mirror, not counted as a failure`,
      )
    }
    if (unit.hasInternalFolder && map['./internal/*'] !== null) {
      violations.push(`${unit.rel} (${unit.name}): has an internal folder but no "./internal/*": null`)
    }
    if (!isPublished(unit)) {
      const byFile = new Map<string, string[]>()
      for (const key of keys) {
        for (const leaf of new Set(targetsOf(map[key]).map((t) => (t.startsWith('./') ? t.slice(2) : t)))) {
          byFile.set(leaf, [...(byFile.get(leaf) ?? []), key])
        }
      }
      for (const [file, specifiers] of byFile) {
        if (specifiers.length > 1) {
          violations.push(
            `${unit.rel} (${unit.name}): ${
              specifiers.join(' and ')
            } both resolve to ${file}; a private library keeps no alias`,
          )
        }
      }
    }
    if (entryFacts(unit).length >= 2) {
      candidates.push({ label: `${unit.rel} (${unit.name})`, evidence: entriesEvidence(unit) })
    }
  }
  const verdict = await judged(judge, 'entries-are-roles', candidates)
  return finish(
    'composition-entries',
    [...violations, ...verdict.violations],
    'a library blocks ./internal/* and a private one keeps no alias; whether its entries are roles and not a mirror of the source tree is judged (compound-packs/composition/role-entries-only.md, unpublished-surfaces-are-free.md).',
    `${libraries} libraries keep their entries to roles`,
    [...reports, ...verdict.reports],
  )
}

// ------------------------------------------------------------------- imports

const noExt = (path: string): string => stripExtension(path)

interface Usage {
  readonly source: Set<string>
  readonly test: Set<string>
}

/** Which files of which units import each export entry, from the compiler's resolution of every import. */
export const entryUsage = (ws: Workspace): ReadonlyMap<string, Usage> => {
  const used = new Map<string, Usage>()
  const usage = (unit: string, key: string): Usage => {
    const id = `${unit}\u0000${key}`
    if (!used.has(id)) used.set(id, { source: new Set(), test: new Set() })
    return used.get(id)!
  }
  const targetFiles = new Map<string, { unit: Unit; keys: string[] }>()
  for (const unit of ws.units) {
    const map = exportsMapOf(unit.manifest)
    if (map === undefined) continue
    for (const [key, value] of Object.entries(map)) {
      for (const leaf of targetsOf(value)) {
        const file = noExt(join(unit.dir, leaf))
        const hit = targetFiles.get(file) ?? { unit, keys: [] }
        hit.keys.push(key)
        targetFiles.set(file, hit)
      }
    }
  }
  for (const unit of ws.units) {
    for (const file of unit.files) {
      for (const i of file.imports) {
        const who = `${unit.name}:${file.rel}`
        const side = file.isTest ? 'test' : 'source'
        if (i.workspace?.key !== undefined) usage(i.workspace.unit, i.workspace.key)[side].add(who)
        else if (i.resolvedFile !== undefined) {
          const hit = targetFiles.get(noExt(i.resolvedFile))
          if (hit !== undefined) { for (const key of hit.keys) usage(hit.unit.name, key)[side].add(who) }
        }
      }
    }
  }
  return used
}

const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot)
}

/** The export entries imported by test files and by no non-test file, with the evidence the test-only-exports judge receives for each. */
export const testOnlyCandidates = (ws: Workspace): readonly Candidate[] => {
  const used = entryUsage(ws)
  const candidates: Candidate[] = []
  for (const unit of ws.units) {
    const map = exportsMapOf(unit.manifest)
    if (map === undefined) continue
    const dependents = ws.units.filter((u) =>
      u !== unit && u.files.some((f) => !f.isTest && f.imports.some((i) => i.workspace?.unit === unit.name))
    )
    for (const key of Object.keys(map)) {
      if (key === './package.json' || map[key] === null) continue
      const seen = used.get(`${unit.name}\u0000${key}`)
      if (seen === undefined || seen.test.size === 0 || seen.source.size > 0) continue
      candidates.push({
        label: `${unit.rel} (${unit.name}) export ${key}`,
        evidence: {
          package: unit.name,
          kind: unit.kind ?? 'undeclared',
          published: isPublished(unit),
          entryKey: key,
          isRoot: key === '.',
          entryCount: Object.keys(map).length,
          targets: targetsOf(map[key]),
          targetExtensions: [...new Set(targetsOf(map[key]).filter((t) => !isBuildOutput(t)).map(extensionOf))].sort(),
          workspaceSourceImporters: 0,
          workspaceTestImporters: [...seen.test].sort().slice(0, 5),
          workspaceDependents: dependents.map((d) => d.name).sort(),
          otherEntriesUsedBySource: Object.keys(map).filter((k) =>
            k !== key && (used.get(`${unit.name}\u0000${k}`)?.source.size ?? 0) > 0
          ),
        },
      })
    }
  }
  return candidates
}

export const checkCompositionImports = async (root: string, judge?: Judge): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  for (const unit of ws.units) {
    for (const file of unit.files) {
      for (const i of file.imports) {
        if (i.workspace !== undefined && !i.workspace.exported) {
          violations.push(`${unit.name} ${file.rel}: imports ${i.specifier}, which ${i.workspace.unit} does not export`)
        }
        if (i.intoUnit !== undefined) {
          violations.push(`${unit.name} ${file.rel}: imports ${i.specifier}, a path into ${i.intoUnit}'s source`)
        }
      }
    }
    for (const alias of unit.pathAliases) {
      const other = ws.units.find((u) => u !== unit && (alias.target === u.dir || alias.target.startsWith(u.dir + '/')))
      if (other !== undefined) {
        violations.push(`${unit.rel}: tsconfig paths ${alias.alias} points into ${other.name}'s source`)
      }
    }
    for (const alias of unit.bundlerAliases) {
      const other = ws.units.find((u) => u !== unit && (alias.target === u.dir || alias.target.startsWith(u.dir + '/')))
      if (other !== undefined) {
        violations.push(`${unit.rel}: bundler alias points into ${other.name}'s source (${alias.target})`)
        continue
      }
      const named = ws.units.find((u) => alias.target.startsWith(u.name + '/src'))
      if (named !== undefined && named !== unit) {
        violations.push(`${unit.rel}: bundler alias points into ${named.name}'s source (${alias.target})`)
      }
    }
  }
  const candidates = testOnlyCandidates(ws)
  const verdict = await judged(judge, 'test-only-exports', candidates)
  return finish(
    'composition-imports',
    [...violations, ...verdict.violations],
    'packages import each other only through exported specifiers (never a path into another package, a tsconfig path or a bundler alias into source), and nothing is exported only so a test can reach it (compound-packs/composition/tests-stay-home.md, source-condition-resolution.md).',
    `${ws.units.length} units import each other through public specifiers only`,
    verdict.reports,
  )
}

// ----------------------------------------------------------------- contracts

export const checkCompositionContracts = async (root: string): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const violations: string[] = []
  const contracts = ws.units.filter((u) => u.manifest['role'] === 'contracts')
  for (const unit of contracts) {
    for (const file of sourcesOf(unit)) {
      for (const i of file.imports) {
        const target = i.workspace === undefined ? undefined : ws.byName.get(i.workspace.unit)
        if (target !== undefined && target.manifest['role'] !== 'contracts') {
          violations.push(
            `${unit.name} ${file.rel}: a contracts package imports ${target.name}, which is not contracts`,
          )
        }
      }
      for (const layer of file.layers) {
        violations.push(
          `${unit.name} ${file.rel}:${layer.line}: a contracts package defines a Layer (Layer.${layer.member})`,
        )
      }
    }
  }
  return finish(
    'composition-contracts',
    violations,
    'a contracts package imports only contracts packages and binds no Layer (compound-packs/composition/contracts-between-applications.md).',
    `${contracts.length} contracts packages import only contracts and define no Layer`,
  )
}

// --------------------------------------------------------------- core and adapters

/** The evidence the core-adapter-split judge receives for a library, or undefined when it imports no runtime module. */
export const coreAdapterEvidence = (ws: Workspace, unit: Unit): Json | undefined => {
  const sources = sourcesOf(unit).filter((f) => !f.isToolConfig)
  const byModule = new Map<string, Set<string>>()
  for (const file of sources) {
    for (const i of file.imports) {
      if (i.typeOnly || !isRuntimeModule(i.specifier)) continue
      byModule.set(i.specifier, (byModule.get(i.specifier) ?? new Set()).add(file.rel))
    }
  }
  if (byModule.size === 0) return undefined
  const conditions = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    for (const [key, inner] of Object.entries(value)) {
      if (!key.startsWith('.')) conditions.add(key)
      collect(inner)
    }
  }
  collect(unit.manifest['exports'])
  return {
    package: unit.name,
    layer: unit.manifest['layer'] ?? null,
    published: isPublished(unit),
    sourceFileCount: sources.length,
    filesWithRuntimeImports: new Set([...byModule.values()].flatMap((s) => [...s])).size,
    runtimeImports: [...byModule].map(([module, files]) => ({ module, files: files.size })).sort((a, b) =>
      b.files - a.files
    ),
    runtimeExportConditions: [...conditions].filter((c) => RUNTIME_CONDITIONS.includes(c)).sort(),
    entryKeys: Object.keys(exportsMapOf(unit.manifest) ?? {}).filter((k) => k !== './package.json').slice(0, 20),
    dependents: ws.units.filter((u) => u !== unit && importedUnits(u).has(unit.name)).map((u) => ({
      name: u.name,
      kind: u.kind ?? 'undeclared',
    })),
  }
}

export const checkCompositionCoreAdapters = async (root: string, judge?: Judge): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const candidates: Candidate[] = []
  for (const unit of ws.units.filter(judgedAsLibrary).filter((u) => u.manifest['layer'] !== 'core')) {
    const evidence = coreAdapterEvidence(ws, unit)
    if (evidence !== undefined) candidates.push({ label: `${unit.rel} (${unit.name})`, evidence })
  }
  const verdict = await judged(judge, 'core-adapter-split', candidates)
  return finish(
    'composition-core-adapters',
    verdict.violations,
    'runtime- and framework-neutral code lives in a core library and each runtime gets an adapter (compound-packs/composition/core-and-adapters.md).',
    `${candidates.length} non-core libraries import runtime modules; none judged to need a split`,
    verdict.reports,
  )
}

// --------------------------------------------------------------- granularity

export interface CoChange {
  readonly a: string
  readonly b: string
  readonly together: number
  readonly of: number
}

const WINDOW = 50
const MIN_WINDOW = 10
const CO_CHANGE_RATIO = 0.8

/** Pairs changed together in more than 80% of the last 50 commits touching either (at least 10 touching commits). */
export const coChanged = (commits: readonly ReadonlySet<string>[]): readonly CoChange[] => {
  const names = [...new Set(commits.flatMap((c) => [...c]))].sort()
  const found: CoChange[] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!
      const b = names[j]!
      let of = 0
      let together = 0
      for (const touched of commits) { // newest first
        const hasA = touched.has(a)
        const hasB = touched.has(b)
        if (!hasA && !hasB) continue
        of++
        if (hasA && hasB) together++
        if (of === WINDOW) break
      }
      if (of >= MIN_WINDOW && together / of > CO_CHANGE_RATIO) found.push({ a, b, together, of })
    }
  }
  return found
}

export const commitsTouching = async (
  ws: Workspace,
  libraries: readonly Unit[],
): Promise<readonly ReadonlySet<string>[]> => {
  const out = await git([
    '-C',
    ws.root,
    'log',
    '--name-only',
    '--no-renames',
    '-n',
    '2000',
    '--format=%x1e',
    '--',
    ...libraries.map((u) => u.rel),
  ])
  return out.split('\x1e').slice(1).map((block) => {
    const touched = new Set<string>()
    for (const line of block.split('\n')) {
      const path = join(ws.root, line.trim())
      const owner = line.trim() === '' ? undefined : libraries.find((u) => path.startsWith(u.dir + '/'))
      if (owner !== undefined) touched.add(owner.name)
    }
    return touched
  })
}

const scriptNames = (unit: Unit): readonly string[] => {
  const scripts = unit.manifest['scripts']
  return typeof scripts === 'object' && scripts !== null ? Object.keys(scripts).sort() : []
}

const binNames = (unit: Unit): readonly string[] => {
  const bin = unit.manifest['bin']
  if (typeof bin === 'string') return [unit.name]
  return typeof bin === 'object' && bin !== null ? Object.keys(bin).sort() : []
}

/** The evidence the granularity judge receives for a library. */
export const granularityEvidence = (ws: Workspace, library: Unit, coChanges: readonly CoChange[]): Json => {
  const used = entryUsage(ws)
  const map = exportsMapOf(library.manifest)
  const entries = map === undefined ? [] : Object.keys(map).filter((k) => k !== './package.json' && map[k] !== null)
  const dependents = ws.units.filter((u) =>
    u !== library && (declaredDependencies(u).has(library.name) || importedUnits(u).has(library.name))
  )
  return {
    package: library.name,
    role: library.manifest['role'] ?? null,
    published: isPublished(library),
    bin: binNames(library),
    deployConfigs: library.deployConfigs,
    hasExportsMap: exportsMapOf(library.manifest) !== undefined,
    scriptNames: scriptNames(library),
    entryCount: entries.length,
    sourceFileCount: sourcesOf(library).length,
    dependents: dependents.map((d) => ({
      name: d.name,
      kind: d.kind ?? 'undeclared',
      importsIt: importedUnits(d).has(library.name),
      entriesUsed: entries.filter((k) =>
        [...(used.get(`${library.name}\u0000${k}`)?.source ?? [])].some((who) => who.startsWith(`${d.name}:`))
      ),
    })),
    coChangedWith: coChanges
      .filter((c) => c.a === library.name || c.b === library.name)
      .map((c) => ({ package: c.a === library.name ? c.b : c.a, commitsTogether: c.together, commitsCompared: c.of })),
  }
}

const disjointConsumers = (evidence: Json): boolean => {
  const dependents = evidence['dependents'] as readonly { entriesUsed: readonly string[] }[]
  if ((evidence['entryCount'] as number) < 2 || dependents.length < 2) return false
  return dependents.some((a, i) =>
    dependents.slice(i + 1).some((b) =>
      a.entriesUsed.length > 0 && b.entriesUsed.length > 0 && !a.entriesUsed.some((k) => b.entriesUsed.includes(k))
    )
  )
}

export const checkCompositionGranularity = async (root: string, strict: boolean, judge?: Judge): Promise<Verdict> => {
  const ws = await loadWorkspace(root)
  const libraries = ws.units.filter(judgedAsLibrary)
  const coChanges = libraries.length > 1 ? coChanged(await commitsTouching(ws, libraries)) : []
  const candidates: Candidate[] = []
  for (const library of libraries) {
    const evidence = granularityEvidence(ws, library, coChanges)
    const dependents = (evidence['dependents'] as readonly unknown[]).length
    if (
      dependents <= 1 || (evidence['coChangedWith'] as readonly unknown[]).length > 0 || disjointConsumers(evidence)
    ) {
      candidates.push({
        label: `${library.rel} (${library.name})`,
        evidence,
        // Whether a unit is a library to merge, or a tool that is run and an application that is deployed, is its declared kind.
        ...(library.kind === undefined ? { reportOnly: 'unit kind not declared' } : {}),
      })
    }
  }
  const verdict = await judged(judge, 'granularity', candidates)
  const findings = [...verdict.violations, ...verdict.reports]
  if (findings.length === 0) return holds(`${candidates.length} candidate(s) judged; no library to split or merge`)
  const sorted = sortedUnique(findings)
  if (strict && verdict.violations.length > 0) {
    return violated(
      sortedUnique(verdict.violations),
      'composition-granularity --strict: split a library by consumer and merge by co-change (compound-packs/composition/split-by-consumer-merge-by-co-change.md).',
    )
  }
  return holds(
    `${sorted.length} finding(s) reported; --strict fails on a calibrated violation\n${
      sorted.map((f) => `  ${f}`).join('\n')
    }`,
  )
}
