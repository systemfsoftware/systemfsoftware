/**
 * Compiler — capability that hosts the TypeScript language service, the
 * in-memory file system, and the file-graph used for grouping.
 *
 * All `typescript/unstable/*` interaction is confined here; callers consume
 * only the Effect-typed service surface.
 */
import { createRequire } from 'module'

import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import { Predicate, Result } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as MutableHashSet from 'effect/MutableHashSet'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'
import type { SourceFile } from 'typescript/unstable/ast'
import { SyntaxKind } from 'typescript/unstable/ast'
import type { FileSystem as TSFileSystem, FileSystemEntries } from 'typescript/unstable/fs'
import { API, type Diagnostic, DiagnosticCategory, type Program, type Snapshot } from 'typescript/unstable/sync'

import { CompilerFailed } from './Checker.schema.js'
import { HybridFileNotFoundError, UnsupportedTypeScriptVersionError } from './Compiler.schema.js'
import { determineBuildModeEnabled, overrideOptions, parseTsConfig, retrieveReferencedProjects } from './Tsconfig.js'
import { TsConfigNotFoundError } from './Tsconfig.schema.js'

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

const findSourceMapRegex = /\/\/# sourceMappingURL=(.+)$/m

function getSourceMappingURL(content: string): string | undefined {
  return findSourceMapRegex.exec(content)?.[1]
}

// ── TypeScript version guard ─────────────────────────────────────────────

let cachedTSVersion: string | undefined

export const getTSVersion = (fsService: FileSystem.FileSystem): Effect.Effect<string, unknown> =>
  Effect.gen(function*() {
    if (cachedTSVersion !== undefined) {
      return cachedTSVersion
    }
    const require = createRequire(import.meta.url)
    const pkgPath = require.resolve('typescript/package.json')
    const text = yield* fsService.readFileString(pkgPath)
    const raw: unknown = JSON.parse(text)
    let version = ''
    if (Predicate.hasProperty(raw, 'version') && typeof raw.version === 'string') {
      version = raw.version
    }
    cachedTSVersion = version
    return version
  })

/**
 * Whether a TypeScript version satisfies `>=7.0.0`. Pre-release suffixes are
 * stripped so `7.0.0-beta` compares as `7.0.0`.
 */
export function isSupportedTypescriptVersion(version: string): boolean {
  const dashBase = version.split('-')[0] ?? version
  const base = dashBase.split('+')[0] ?? dashBase
  const parts = base.split('.').map((p) => Number.parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return false
  }
  if (major !== 7) {
    return major > 7
  }
  if (minor !== 0) {
    return minor > 0
  }
  return patch >= 0
}

export const guardTSVersion = (fsService: FileSystem.FileSystem): Effect.Effect<void, unknown> =>
  Effect.gen(function*() {
    const version = yield* getTSVersion(fsService)
    if (!isSupportedTypescriptVersion(version)) {
      return yield* new UnsupportedTypeScriptVersionError({ version })
    }
  })

// ── ScriptFile ───────────────────────────────────────────────────────────

export interface ScriptFile {
  readonly fileName: string
  readonly originalContent: string
  readonly content: string
  readonly modifiedTime: Date
}

export function makeScriptFile(content: string, fileName: string, modifiedTime = new Date()): ScriptFile {
  return { content, fileName, originalContent: content, modifiedTime }
}

export function withContent(file: ScriptFile, content: string): ScriptFile {
  return { ...file, content, modifiedTime: new Date() }
}

export function mutateScriptFile(file: ScriptFile, mutant: Pick<Mutant, 'location' | 'replacement'>): ScriptFile {
  const start = getOffset(file, mutant.location.start)
  const end = getOffset(file, mutant.location.end)
  const content = `${file.originalContent.slice(0, start)}${mutant.replacement}${file.originalContent.slice(end)}`
  return { ...file, content, modifiedTime: new Date() }
}

export function resetScriptFile(file: ScriptFile): ScriptFile {
  return { ...file, content: file.originalContent, modifiedTime: new Date() }
}

function getOffset(file: ScriptFile, pos: import('@systemfsoftware/stryker-js/Mutant').Position): number {
  const lines = file.originalContent.split('\n')
  const lineCount = Math.min(pos.line, lines.length)
  let offset = 0
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i]
    if (line === undefined) {
      break
    }
    offset += line.length + 1
  }
  offset += pos.column
  return offset
}

export interface HybridFileSystem {
  readonly fileSystem: TSFileSystem
  readonly getFile: (fileName: string) => Effect.Effect<ScriptFile | undefined, never>
  readonly writeFile: (fileName: string, data: string) => Effect.Effect<void>
  readonly mutateFile: (
    fileName: string,
    mutant: Pick<Mutant, 'location' | 'replacement'>,
  ) => Effect.Effect<void, HybridFileNotFoundError>
  readonly resetFile: (fileName: string) => Effect.Effect<void>
  readonly existsInMemory: (fileName: string) => Effect.Effect<boolean>
  readonly setTsConfigOverrides: (
    overrides: MutableHashMap.MutableHashMap<string, string>,
  ) => Effect.Effect<void>
}

const makeEmptyFilesMap = (): MutableHashMap.MutableHashMap<string, ScriptFile | undefined> => MutableHashMap.empty()
const makeEmptyOverridesMap = (): MutableHashMap.MutableHashMap<string, string> => MutableHashMap.empty()

const setInPlace = <K, V>(
  map: MutableHashMap.MutableHashMap<K, V>,
  key: K,
  value: V,
): MutableHashMap.MutableHashMap<K, V> => {
  MutableHashMap.set(map, key, value)
  return map
}
export const makeHybridFileSystem = (fsService: FileSystem.FileSystem): Effect.Effect<HybridFileSystem> =>
  Effect.gen(function*() {
    const filesRef = yield* Ref.make(makeEmptyFilesMap())
    const overridesRef = yield* Ref.make(makeEmptyOverridesMap())

    const fileNameIsBuildInfo = (fileName: string): boolean => fileName.endsWith('.tsbuildinfo')

    const fileSystem: TSFileSystem = {
      readFile: (fileName: string): string | null | undefined => {
        const normalized = normalizeFileName(fileName)
        if (fileNameIsBuildInfo(normalized)) {
          return null
        }
        const overrideOpt = MutableHashMap.get(overridesRef.ref.current, normalized)
        if (Option.isSome(overrideOpt)) {
          return overrideOpt.value
        }
        const files = filesRef.ref.current
        if (MutableHashMap.has(files, normalized)) {
          const fileOpt = MutableHashMap.get(files, normalized)
          if (Option.isSome(fileOpt)) {
            const file = fileOpt.value
            if (file !== undefined) {
              return file.content
            }
            return null
          }
        }
        return undefined
      },

      fileExists: (fileName: string): boolean | undefined => {
        const normalized = normalizeFileName(fileName)
        if (fileNameIsBuildInfo(normalized)) {
          return false
        }
        if (MutableHashMap.has(overridesRef.ref.current, normalized)) {
          return true
        }
        const files = filesRef.ref.current
        if (MutableHashMap.has(files, normalized)) {
          const opt = MutableHashMap.get(files, normalized)
          if (Option.isSome(opt)) {
            return opt.value !== undefined
          }
          return false
        }
        return undefined
      },

      directoryExists: (): boolean | undefined => undefined,
      getAccessibleEntries: (): FileSystemEntries | undefined => undefined,
      realpath: (): string | undefined => undefined,
    }

    const getFile = (fileName: string): Effect.Effect<ScriptFile | undefined, never> =>
      Effect.gen(function*() {
        const normalized = normalizeFileName(fileName)
        const files = yield* Ref.get(filesRef)
        if (MutableHashMap.has(files, normalized)) {
          const opt = MutableHashMap.get(files, normalized)
          if (Option.isSome(opt)) {
            return opt.value
          }
        }
        const content: string | undefined = yield* fsService
          .readFileString(normalized)
          .pipe(Effect.orElseSucceed(() => undefined))
        if (content === undefined) {
          yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, undefined))
          return undefined
        }
        const file = makeScriptFile(content, normalized)
        yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, file))
        return file
      })

    const writeFile = (fileName: string, data: string): Effect.Effect<void> =>
      Effect.gen(function*() {
        const normalized = normalizeFileName(fileName)
        const files = yield* Ref.get(filesRef)
        const existingOpt = MutableHashMap.get(files, normalized)
        let existing: ScriptFile | undefined = undefined
        if (Option.isSome(existingOpt)) {
          existing = existingOpt.value
        }
        if (existing !== undefined) {
          const next = withContent(existing, data)
          yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, next))
        } else {
          const file = makeScriptFile(data, normalized)
          yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, file))
        }
      })

    const mutateFile = (
      fileName: string,
      mutant: Pick<Mutant, 'location' | 'replacement'>,
    ): Effect.Effect<void, HybridFileNotFoundError> =>
      Effect.gen(function*() {
        const file = yield* getFile(fileName)
        if (file === undefined) {
          return yield* new HybridFileNotFoundError({ fileName })
        }
        const next = mutateScriptFile(file, mutant)
        const normalized = normalizeFileName(fileName)
        yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, next))
      })

    const resetFile = (fileName: string): Effect.Effect<void> =>
      Effect.gen(function*() {
        const normalized = normalizeFileName(fileName)
        const files = yield* Ref.get(filesRef)
        const opt = MutableHashMap.get(files, normalized)
        let file: ScriptFile | undefined = undefined
        if (Option.isSome(opt)) {
          file = opt.value
        }
        if (file !== undefined) {
          const next = resetScriptFile(file)
          yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, next))
        }
      })

    const existsInMemory = (fileName: string): Effect.Effect<boolean> =>
      Effect.gen(function*() {
        const files = yield* Ref.get(filesRef)
        const opt = MutableHashMap.get(files, normalizeFileName(fileName))
        let file: ScriptFile | undefined = undefined
        if (Option.isSome(opt)) {
          file = opt.value
        }
        return file !== undefined
      })

    const setTsConfigOverrides = (
      overrides: MutableHashMap.MutableHashMap<string, string>,
    ): Effect.Effect<void> => Ref.set(overridesRef, overrides)

    return { fileSystem, getFile, writeFile, mutateFile, resetFile, existsInMemory, setTsConfigOverrides }
  })

// ── TSFileNode graph ─────────────────────────────────────────────────────

export interface TSFileNode {
  readonly fileName: string
  readonly parents: readonly TSFileNode[]
  readonly children: readonly TSFileNode[]
}

export function makeTSFileNode(fileName: string): TSFileNode {
  return { fileName, parents: [], children: [] }
}

export function getAllParentReferencesIncludingSelf(
  node: TSFileNode,
  allParentReferences: MutableHashSet.MutableHashSet<TSFileNode> = MutableHashSet.empty<TSFileNode>(),
): MutableHashSet.MutableHashSet<TSFileNode> {
  MutableHashSet.add(allParentReferences, node)
  for (const parent of node.parents) {
    if (!MutableHashSet.has(allParentReferences, parent)) {
      getAllParentReferencesIncludingSelf(parent, allParentReferences)
    }
  }
  return allParentReferences
}

export function getAllChildReferencesIncludingSelf(
  node: TSFileNode,
  allChildReferences: MutableHashSet.MutableHashSet<TSFileNode> = MutableHashSet.empty<TSFileNode>(),
): MutableHashSet.MutableHashSet<TSFileNode> {
  MutableHashSet.add(allChildReferences, node)
  for (const child of node.children) {
    if (!MutableHashSet.has(allChildReferences, child)) {
      getAllChildReferencesIncludingSelf(child, allChildReferences)
    }
  }
  return allChildReferences
}

export function getMutantsWithReferenceToChildrenOrSelf(
  node: TSFileNode,
  mutants: Mutant[],
  nodesChecked: string[] = [],
): Mutant[] {
  if (nodesChecked.includes(node.fileName)) {
    return []
  }
  nodesChecked.push(node.fileName)
  const relatedMutants = mutants.filter((m) => normalizeFileName(m.fileName) === node.fileName)
  const childResult = node.children.flatMap((c) => getMutantsWithReferenceToChildrenOrSelf(c, mutants, nodesChecked))
  return [...relatedMutants, ...childResult]
}

export function createGroups(mutants: Mutant[], nodes: MutableHashMap.MutableHashMap<string, TSFileNode>): string[][] {
  const groups: string[][] = []
  const mutantsToGroup = MutableHashSet.fromIterable(mutants)
  while (MutableHashSet.size(mutantsToGroup) > 0) {
    const group: string[] = []
    const groupNodes = MutableHashSet.empty<TSFileNode>()
    const nodesToIgnore = MutableHashSet.empty<TSFileNode>()
    for (const currentMutant of mutantsToGroup) {
      const currentNode = findNode(currentMutant.fileName, nodes)
      if (!MutableHashSet.has(nodesToIgnore, currentNode) && !parentsHaveOverlapWith(currentNode, groupNodes)) {
        group.push(currentMutant.id)
        MutableHashSet.add(groupNodes, currentNode)
        MutableHashSet.remove(mutantsToGroup, currentMutant)
        addRangeOfNodesToSet(nodesToIgnore, getAllParentReferencesIncludingSelf(currentNode))
      }
    }
    groups.push(group)
  }
  return groups
}

function addRangeOfNodesToSet(
  nodes: MutableHashSet.MutableHashSet<TSFileNode>,
  nodesToAdd: Iterable<TSFileNode>,
) {
  for (const parent of nodesToAdd) {
    MutableHashSet.add(nodes, parent)
  }
}

function findNode(fileName: string, nodes: MutableHashMap.MutableHashMap<string, TSFileNode>) {
  const nodeOption = MutableHashMap.get(nodes, normalizeFileName(fileName))
  if (Option.isSome(nodeOption)) {
    return nodeOption.value
  }
  const fallbackOption = MutableHashMap.get(nodes, fileName)
  if (Option.isSome(fallbackOption)) {
    return fallbackOption.value
  }
  throw new Error(`Node not in graph: ${fileName}`)
}

function parentsHaveOverlapWith(
  currentNode: TSFileNode,
  groupNodes: MutableHashSet.MutableHashSet<TSFileNode>,
) {
  for (const parentNode of getAllParentReferencesIncludingSelf(currentNode)) {
    if (MutableHashSet.has(groupNodes, parentNode)) {
      return true
    }
  }
  return false
}
// ── TypeScriptCompiler service ───────────────────────────────────────────

export type SourceFiles = MutableHashMap.MutableHashMap<
  string,
  { fileName: string; imports: MutableHashSet.MutableHashSet<string> }
>

interface CompilerState {
  api: API | undefined
  snapshot: Snapshot | undefined
  sourceFiles: SourceFiles
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>
  lastMutants: Mutant[]
  lastMutatedFileNames: string[]
  allTSConfigFiles: MutableHashSet.MutableHashSet<string>
  tsconfigFile: string
}

export class TypeScriptCompiler extends Context.Service<TypeScriptCompiler, {
  readonly init: Effect.Effect<readonly Diagnostic[], unknown>
  readonly check: (mutants: readonly Mutant[]) => Effect.Effect<readonly Diagnostic[], unknown>
  readonly nodes: Effect.Effect<MutableHashMap.MutableHashMap<string, TSFileNode>, unknown>
  readonly close: Effect.Effect<void, unknown>
  readonly getLineAndCharacterOfPosition: (
    fileName: string,
    position: number,
  ) => Effect.Effect<{ line: number; character: number } | undefined, unknown>
}>()('@systemfsoftware/stryker-js-typescript-checker/TypeScriptCompiler') {}

const makeDummy = Effect.gen(function*() {
  const stateRef = yield* Ref.make<CompilerState>({
    api: undefined,
    snapshot: undefined,
    sourceFiles: MutableHashMap.empty(),
    nodes: MutableHashMap.empty(),
    lastMutants: [],
    lastMutatedFileNames: [],
    allTSConfigFiles: MutableHashSet.fromIterable(['tsconfig.json']),
    tsconfigFile: 'tsconfig.json',
  })
  yield* Effect.addFinalizer(() =>
    Effect.gen(function*() {
      const s = yield* Ref.get(stateRef)
      yield* Effect.sync(() => s.snapshot?.dispose())
      yield* Effect.sync(() => s.api?.close())
    })
  )
  return {
    init: Effect.succeed([] satisfies readonly Diagnostic[]),
    check: () => Effect.succeed([] satisfies readonly Diagnostic[]),
    nodes: Ref.get(stateRef).pipe(Effect.map((s) => s.nodes)),
    close: Effect.gen(function*() {
      const s = yield* Ref.get(stateRef)
      yield* Effect.sync(() => s.snapshot?.dispose())
      yield* Effect.sync(() => s.api?.close())
      yield* Ref.update(stateRef, (prev) => ({ ...prev, snapshot: undefined, api: undefined }))
    }),
    getLineAndCharacterOfPosition: () => Effect.succeed(undefined),
  } satisfies TypeScriptCompiler['Service']
})

export const layer = Layer.effect(TypeScriptCompiler)(makeDummy)

export type ITypescriptCompiler = Pick<TypeScriptCompiler['Service'], 'init' | 'check'>
export type IFileRelationCreator = Pick<TypeScriptCompiler['Service'], 'nodes'>

export function makeTypescriptCompiler(
  options: unknown,
  fs: HybridFileSystem,
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
): TypeScriptCompiler['Service'] {
  if (!S.is(StrykerOptionsSchema)(options)) {
    throw new Error('Invalid StrykerOptions')
  }
  const strykerOptions: StrykerOptions = options
  const rawTsconfigFile = normalizeFileName(strykerOptions.tsconfigFile)
  const initialState: CompilerState = {
    api: undefined,
    snapshot: undefined,
    sourceFiles: MutableHashMap.empty(),
    nodes: MutableHashMap.empty(),
    lastMutants: [],
    lastMutatedFileNames: [],
    allTSConfigFiles: MutableHashSet.fromIterable([rawTsconfigFile]),
    tsconfigFile: rawTsconfigFile,
  }
  const stateRef = Ref.makeUnsafe(initialState)

  const getProgramsEffect = (): Effect.Effect<Program[], unknown> =>
    Effect.gen(function*() {
      const s = yield* Ref.get(stateRef)
      if (!s.snapshot) {
        return yield* new CompilerFailed({ reason: 'not-initialized' })
      }
      const projects = s.snapshot.getProjects()
      if (projects.length === 0) {
        return yield* new CompilerFailed({ reason: 'no-projects', subject: s.tsconfigFile })
      }
      return projects.map((project) => project.program)
    })

  const guardTSConfigFileExistsEffect: Effect.Effect<void, unknown> = Effect.gen(function*() {
    const s = yield* Ref.get(stateRef)
    yield* fsService.readFileString(s.tsconfigFile).pipe(
      Effect.mapError(() => new TsConfigNotFoundError({ file: s.tsconfigFile })),
    )
  })

  const collectAllTSConfigFiles = (buildModeEnabled: boolean): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const s = yield* Ref.get(stateRef)
      const tsConfigOverrides = MutableHashMap.empty<string, string>()
      const toProcess = [s.tsconfigFile]
      const processed = MutableHashSet.empty<string>()
      while (toProcess.length > 0) {
        const current = toProcess.pop()
        if (current === undefined || current === '' || MutableHashSet.has(processed, current)) {
          continue
        }
        MutableHashSet.add(processed, current)
        const content = yield* fsService.readFileString(current)
        const parsed = parseTsConfig(current, content)
        if (Result.isFailure(parsed)) {
          MutableHashMap.set(tsConfigOverrides, current, content)
          continue
        }
        MutableHashMap.set(tsConfigOverrides, current, overrideOptions(parsed.success, buildModeEnabled))
        for (
          const referenced of retrieveReferencedProjects(parsed.success, pathService.dirname(current), pathService)
        ) {
          const normalized = normalizeFileName(referenced)
          MutableHashSet.add(s.allTSConfigFiles, normalized)
          toProcess.push(referenced)
        }
      }
      yield* fs.setTsConfigOverrides(tsConfigOverrides)
      yield* Ref.update(
        stateRef,
        (prev) => ({ ...prev, allTSConfigFiles: MutableHashSet.fromIterable(s.allTSConfigFiles) }),
      )
    })

  const extractImports = (sourceFile: SourceFile): string[] => {
    const result: string[] = []
    for (const statement of sourceFile.statements) {
      if (statement.kind === SyntaxKind.ImportDeclaration) {
        let spec: SourceFile['imports'][number] | undefined
        statement.forEachChild((child) => {
          if (child.kind === SyntaxKind.StringLiteral) {
            spec = child
          }
        })
        if (spec) {
          result.push(spec.getText(sourceFile))
        }
      } else if (statement.kind === SyntaxKind.ImportEqualsDeclaration) {
        statement.forEachChild((child) => {
          if (child.kind === SyntaxKind.ExternalModuleReference) {
            child.forEachChild((refChild) => {
              if (refChild.kind === SyntaxKind.StringLiteral) {
                result.push(refChild.getText(sourceFile))
              }
            })
          }
        })
      }
    }
    for (const ref of sourceFile.referencedFiles) {
      result.push(ref.fileName)
    }
    for (const ref of sourceFile.typeReferenceDirectives) {
      result.push(ref.fileName)
    }
    return result
  }

  const getResolutionCandidates = (resolved: string, pathService: Path.Path): string[] => {
    const extension = pathService.extname(resolved)
    if (extension) {
      const withoutExt = resolved.slice(0, -extension.length)
      return [
        resolved,
        `${withoutExt}.ts`,
        `${withoutExt}.tsx`,
        `${withoutExt}.d.ts`,
        `${withoutExt}.js`,
        `${withoutExt}.jsx`,
        `${withoutExt}.mjs`,
        `${withoutExt}.cjs`,
      ]
    }
    return [
      resolved,
      `${resolved}.ts`,
      `${resolved}.tsx`,
      `${resolved}.d.ts`,
      `${resolved}/index.ts`,
      `${resolved}/index.tsx`,
      `${resolved}/index.d.ts`,
      `${resolved}.js`,
      `${resolved}.jsx`,
      `${resolved}.mjs`,
      `${resolved}.cjs`,
      `${resolved}/index.js`,
      `${resolved}/index.jsx`,
      `${resolved}/index.mjs`,
      `${resolved}/index.cjs`,
    ]
  }

  const resolveModuleSpecifier = (
    sourceFileName: string,
    specifier: string,
    sourceFiles: SourceFiles,
    pathService: Path.Path,
  ): string | undefined => {
    const cleaned = specifier.replace(/^['"]|['"]$/g, '')
    if (!cleaned.startsWith('./') && !cleaned.startsWith('../')) {
      return undefined
    }
    const baseDir = pathService.dirname(sourceFileName)
    const resolved = normalizeFileName(pathService.resolve(baseDir, cleaned))
    const candidates = getResolutionCandidates(resolved, pathService)
    for (const candidate of candidates) {
      if (MutableHashMap.has(sourceFiles, candidate)) {
        return candidate
      }
    }
    return undefined
  }

  const resolveTSInputFile = (dependencyFileName: string, pathService: Path.Path): string => {
    if (!dependencyFileName.endsWith('.d.ts')) {
      return dependencyFileName
    }
    const content = fs.fileSystem.readFile?.(dependencyFileName)
    if (typeof content !== 'string') {
      return dependencyFileName
    }
    const sourceMappingURL = getSourceMappingURL(content)
    if (sourceMappingURL === undefined || sourceMappingURL === '') {
      return dependencyFileName
    }
    const sourceMapFileName = normalizeFileName(
      pathService.resolve(pathService.dirname(dependencyFileName), sourceMappingURL),
    )
    const sourceMapContent = fs.fileSystem.readFile?.(sourceMapFileName)
    if (typeof sourceMapContent !== 'string') {
      return dependencyFileName
    }
    const rawMap: unknown = JSON.parse(sourceMapContent)
    let sources: readonly string[] | undefined
    if (Predicate.hasProperty(rawMap, 'sources') && Array.isArray(rawMap.sources)) {
      sources = rawMap.sources.filter((s): s is string => typeof s === 'string')
    }
    if (sources?.length === 1) {
      const sourcePath = sources[0]
      if (sourcePath === undefined) {
        return dependencyFileName
      }
      return normalizeFileName(pathService.resolve(pathService.dirname(sourceMapFileName), sourcePath))
    }
    return dependencyFileName
  }

  const buildDependencyGraph = (programs: Program[]): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const s = yield* Ref.get(stateRef)
      for (const program of programs) {
        for (const fileName of program.getSourceFileNames()) {
          if (fileName.endsWith('.d.ts') || fileName.includes('node_modules')) {
            continue
          }
          const normalized = normalizeFileName(fileName)
          MutableHashMap.set(s.sourceFiles, normalized, {
            fileName: normalized,
            imports: MutableHashSet.empty<string>(),
          })
        }
      }
      for (const [fileName] of s.sourceFiles) {
        const sourceFile = programs.map((p) => p.getSourceFile(fileName)).find((sf) => sf != null)
        if (!sourceFile) {
          continue
        }
        const imports = extractImports(sourceFile)
        for (const specifier of imports) {
          const resolved = resolveModuleSpecifier(fileName, specifier, s.sourceFiles, pathService)
          if (resolved !== undefined && resolved !== '') {
            const sourceFileName = resolveTSInputFile(resolved, pathService)
            if (MutableHashMap.has(s.sourceFiles, sourceFileName)) {
              const entryOpt = MutableHashMap.get(s.sourceFiles, fileName)
              if (Option.isSome(entryOpt)) {
                MutableHashSet.add(entryOpt.value.imports, sourceFileName)
              }
            }
          }
        }
      }
      yield* Ref.update(stateRef, (prev) => ({ ...prev, sourceFiles: MutableHashMap.fromIterable(s.sourceFiles) }))
    })

  const getNodesEffect: Effect.Effect<MutableHashMap.MutableHashMap<string, TSFileNode>, unknown> = Effect.gen(
    function*() {
      const s = yield* Ref.get(stateRef)
      if (MutableHashMap.size(s.nodes) > 0) {
        return s.nodes
      }
      for (const [fileName] of s.sourceFiles) {
        const node = makeTSFileNode(fileName)
        MutableHashMap.set(s.nodes, fileName, node)
      }
      const withChildren = MutableHashMap.empty<string, TSFileNode>()
      for (const [fileName, file] of s.sourceFiles) {
        const nodeOpt = MutableHashMap.get(s.nodes, fileName)
        if (Option.isNone(nodeOpt)) {
          return yield* new CompilerFailed({ reason: 'unknown-file-node', subject: fileName })
        }
        const node = nodeOpt.value
        const children = Array.from(file.imports)
          .map((importName) => Option.getOrUndefined(MutableHashMap.get(s.nodes, importName)))
          .filter((n): n is TSFileNode => n !== undefined)
        MutableHashMap.set(withChildren, fileName, { ...node, children, parents: [] })
      }
      MutableHashMap.clear(s.nodes)
      for (const [k, v] of withChildren) {
        MutableHashMap.set(s.nodes, k, v)
      }
      const withParents = MutableHashMap.empty<string, TSFileNode>()
      for (const [fileName, node] of s.nodes) {
        const parents: TSFileNode[] = []
        for (const [, n] of s.nodes) {
          if (n.children.includes(node)) {
            parents.push(n)
          }
        }
        MutableHashMap.set(withParents, fileName, { ...node, parents })
      }
      MutableHashMap.clear(s.nodes)
      for (const [k, v] of withParents) {
        MutableHashMap.set(s.nodes, k, v)
      }
      yield* Ref.update(stateRef, (prev) => ({ ...prev, nodes: MutableHashMap.fromIterable(s.nodes) }))
      return s.nodes
    },
  )

  const check: (mutants: readonly Mutant[]) => Effect.Effect<readonly Diagnostic[], unknown> = (mutants) =>
    Effect.gen(function*() {
      const state = yield* Ref.get(stateRef)
      for (const mutant of state.lastMutants) {
        yield* fs.resetFile(mutant.fileName)
      }
      for (const mutant of mutants) {
        const file = yield* fs.getFile(mutant.fileName)
        if (!file) {
          return yield* new CompilerFailed({ reason: 'file-not-in-project', subject: mutant.fileName })
        }
        yield* fs.mutateFile(mutant.fileName, mutant)
      }
      const mutatedFileNames = Array.from(
        MutableHashSet.fromIterable(mutants.map((m) => normalizeFileName(m.fileName))),
      )
      const changedFiles = Array.from(MutableHashSet.fromIterable([...state.lastMutatedFileNames, ...mutatedFileNames]))
      const current = yield* Ref.get(stateRef)
      if (current.api && current.snapshot) {
        const oldSnapshot = current.snapshot
        const nextSnapshot = current.api.updateSnapshot({
          openProjects: Array.from(current.allTSConfigFiles),
          fileChanges: { changed: changedFiles },
        })
        yield* Effect.sync(() => oldSnapshot.dispose())
        yield* Ref.update(stateRef, (prev) => ({ ...prev, snapshot: nextSnapshot }))
      }
      yield* Ref.update(
        stateRef,
        (prev) => ({
          ...prev,
          lastMutants: [...mutants] satisfies readonly Mutant[],
          lastMutatedFileNames: mutatedFileNames,
        }),
      )
      const programsWithDiagnostics = yield* getProgramsEffect()
      return programsWithDiagnostics
        .flatMap((
          program,
        ) => [
          ...program.getConfigFileParsingDiagnostics(),
          ...program.getSemanticDiagnostics(),
          ...program.getProgramDiagnostics(),
        ])
        .filter((diagnostic) => diagnostic.category === DiagnosticCategory.Error)
    })

  const init: Effect.Effect<readonly Diagnostic[], unknown> = Effect.gen(function*() {
    yield* guardTSVersion(fsService)
    const absoluteTsconfigFile = normalizeFileName(pathService.resolve(rawTsconfigFile))
    yield* Ref.update(
      stateRef,
      (prev) => ({
        ...prev,
        tsconfigFile: absoluteTsconfigFile,
        allTSConfigFiles: MutableHashSet.fromIterable([absoluteTsconfigFile]),
      }),
    )
    yield* guardTSConfigFileExistsEffect
    const buildModeEnabled = yield* determineBuildModeEnabled(absoluteTsconfigFile, fsService)
    yield* collectAllTSConfigFiles(buildModeEnabled)
    const s = yield* Ref.get(stateRef)
    const api = new API({ fs: fs.fileSystem })
    const snapshot = api.updateSnapshot({ openProjects: Array.from(s.allTSConfigFiles) })
    yield* Ref.update(stateRef, (prev) => ({ ...prev, api, snapshot }))
    const programs = yield* getProgramsEffect()
    yield* buildDependencyGraph(programs)
    return yield* check([])
  })

  const close: Effect.Effect<void, unknown> = Effect.gen(function*() {
    const s = yield* Ref.get(stateRef)
    yield* Effect.sync(() => s.snapshot?.dispose())
    yield* Effect.sync(() => s.api?.close())
    yield* Ref.update(stateRef, (prev) => ({ ...prev, snapshot: undefined, api: undefined }))
  })

  const getLineAndCharacterOfPosition = (
    fileName: string,
    position: number,
  ): Effect.Effect<{ line: number; character: number } | undefined, unknown> =>
    Effect.gen(function*() {
      const programs = yield* getProgramsEffect()
      for (const program of programs) {
        const sourceFile = program.getSourceFile(fileName)
        if (sourceFile) {
          return sourceFile.getLineAndCharacterOfPosition(position)
        }
      }
      return undefined
    })

  const nodes: Effect.Effect<MutableHashMap.MutableHashMap<string, TSFileNode>, unknown> = getNodesEffect

  return { init, check, nodes, close, getLineAndCharacterOfPosition }
}
