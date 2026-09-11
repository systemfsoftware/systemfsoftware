/**
 * Compiler — capability that hosts the TypeScript language service, the
 * in-memory file system, and the file-graph used for grouping.
 *
 * All `typescript/unstable/*` interaction is confined here; callers consume
 * only the Effect-typed service surface.
 */

import type { Mutant, Position } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
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
import type { SourceFile } from 'typescript/unstable/ast'
import { SyntaxKind } from 'typescript/unstable/ast'
import type { FileSystem as TSFileSystem, FileSystemEntries } from 'typescript/unstable/fs'
import { API, type Diagnostic, DiagnosticCategory, type Program, type Snapshot } from 'typescript/unstable/sync'

import { CompilerFailed } from './Checker.schema.js'
import { HybridFileNotFoundError, UnsupportedTypeScriptVersionError } from './Compiler.schema.js'
import { determineBuildModeEnabled, overrideOptions, parseTsConfig, retrieveReferencedProjects } from './Tsconfig.js'
import { type TsConfig, TsConfigNotFoundError, type TsConfigParseError } from './Tsconfig.schema.js'

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

const findSourceMapRegex = /\/\/# sourceMappingURL=(.+)$/m

/** A specifier that resolves relative to the importing file. */
const relativeSpecifierPattern = /^\.\.?\//

/** A file that never belongs to the dependency graph: declarations and dependencies. */
const ignoredGraphFileNamePattern = /\.d\.ts$|node_modules/

function getSourceMappingURL(content: string): string | undefined {
  return findSourceMapRegex.exec(content)?.[1]
}

// ── TypeScript version guard ─────────────────────────────────────────────

let cachedTSVersion: string | undefined

const isString = (value: unknown): value is string => typeof value === 'string'

const isNonEmptyString = (value: string | undefined): value is string => value !== undefined && value !== ''

const versionFieldOf = (raw: unknown): Option.Option<unknown> => {
  if (Predicate.hasProperty(raw, 'version')) {
    return Option.some(raw.version)
  }
  return Option.none()
}

const readTypescriptPackageVersion = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
): Effect.Effect<string, unknown> =>
  Effect.gen(function*() {
    const urlString = import.meta.resolve('typescript/package.json')
    const pkgPath = yield* pathService.fromFileUrl(new URL(urlString))
    const text = yield* fsService.readFileString(pkgPath)
    const raw: unknown = JSON.parse(text)
    return Option.getOrElse(
      Option.flatMap(versionFieldOf(raw), (version) => Option.liftPredicate(version, isString)),
      () => '',
    )
  })

export const getTSVersion = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
): Effect.Effect<string, unknown> =>
  Effect.gen(function*() {
    if (cachedTSVersion !== undefined) {
      return cachedTSVersion
    }
    const version = yield* readTypescriptPackageVersion(fsService, pathService)
    cachedTSVersion = version
    return version
  })

interface TypeScriptVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

const minimumSupportedTypeScriptVersion: TypeScriptVersion = { major: 7, minor: 0, patch: 0 }

const versionComponent = (parts: readonly string[], index: number): number => {
  const part = parts[index]
  if (part === undefined) {
    return 0
  }
  return Number.parseInt(part, 10)
}

/** Drops any pre-release (`-`) or build (`+`) suffix, keeping the numeric base. */
const parseTypeScriptVersion = (version: string): TypeScriptVersion => {
  const parts = version.replace(/[-+][\s\S]*$/, '').split('.')
  return {
    major: versionComponent(parts, 0),
    minor: versionComponent(parts, 1),
    patch: versionComponent(parts, 2),
  }
}

const compareVersionNumbers = (left: TypeScriptVersion, right: TypeScriptVersion): number => {
  const differences = [left.major - right.major, left.minor - right.minor, left.patch - right.patch]
  return differences.find((difference) => difference !== 0) ?? 0
}

/**
 * Whether a TypeScript version satisfies `>=7.0.0`. Pre-release suffixes are
 * stripped so `7.0.0-beta` compares as `7.0.0`.
 */
export function isSupportedTypescriptVersion(version: string): boolean {
  const parsed = parseTypeScriptVersion(version)
  const numeric = [parsed.major, parsed.minor, parsed.patch].every((part) => !Number.isNaN(part))
  if (!numeric) {
    return false
  }
  return compareVersionNumbers(parsed, minimumSupportedTypeScriptVersion) >= 0
}

export const guardTSVersion = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
): Effect.Effect<void, unknown> =>
  Effect.gen(function*() {
    const version = yield* getTSVersion(fsService, pathService)
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

function getOffset(file: ScriptFile, pos: Position): number {
  const lines = file.originalContent.split('\n')
  const lineCount = Math.min(pos.line, lines.length)
  let offset = pos.column
  lines.forEach((line, index) => {
    if (index < lineCount) {
      offset += line.length + 1
    }
  })
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

    const memoryContent = (file: ScriptFile | undefined): string | null => {
      if (file === undefined) {
        return null
      }
      return file.content
    }

    const readFromSources = (
      files: MutableHashMap.MutableHashMap<string, ScriptFile | undefined>,
      overrides: MutableHashMap.MutableHashMap<string, string>,
      fileName: string,
    ): string | null | undefined => {
      const override = MutableHashMap.get(overrides, fileName)
      if (Option.isSome(override)) {
        return override.value
      }
      return Option.match(MutableHashMap.get(files, fileName), {
        onNone: () => undefined,
        onSome: memoryContent,
      })
    }

    const existsInSources = (
      files: MutableHashMap.MutableHashMap<string, ScriptFile | undefined>,
      overrides: MutableHashMap.MutableHashMap<string, string>,
      fileName: string,
    ): boolean | undefined => {
      const override = MutableHashMap.get(overrides, fileName)
      if (Option.isSome(override)) {
        return true
      }
      return Option.match(MutableHashMap.get(files, fileName), {
        onNone: () => undefined,
        onSome: (file) => file !== undefined,
      })
    }

    const fileSystem: TSFileSystem = {
      readFile: (fileName: string): string | null | undefined => {
        const normalized = normalizeFileName(fileName)
        if (normalized.endsWith('.tsbuildinfo')) {
          return null
        }
        return readFromSources(filesRef.ref.current, overridesRef.ref.current, normalized)
      },

      fileExists: (fileName: string): boolean | undefined => {
        const normalized = normalizeFileName(fileName)
        if (normalized.endsWith('.tsbuildinfo')) {
          return false
        }
        return existsInSources(filesRef.ref.current, overridesRef.ref.current, normalized)
      },

      directoryExists: (): boolean | undefined => undefined,
      getAccessibleEntries: (): FileSystemEntries | undefined => undefined,
      realpath: (): string | undefined => undefined,
    }

    const readFileFromDisk = (fileName: string): Effect.Effect<ScriptFile | undefined, never> =>
      Effect.gen(function*() {
        const content: string | undefined = yield* fsService
          .readFileString(fileName)
          .pipe(Effect.orElseSucceed(() => undefined))
        const file = Option.getOrUndefined(
          Option.map(Option.fromUndefinedOr(content), (text) => makeScriptFile(text, fileName)),
        )
        yield* Ref.update(filesRef, (m) => setInPlace(m, fileName, file))
        return file
      })

    const getFile = (fileName: string): Effect.Effect<ScriptFile | undefined, never> =>
      Effect.gen(function*() {
        const normalized = normalizeFileName(fileName)
        const files = yield* Ref.get(filesRef)
        const cached = MutableHashMap.get(files, normalized)
        if (Option.isSome(cached)) {
          return cached.value
        }
        return yield* readFileFromDisk(normalized)
      })

    const fileForWrite = (existing: ScriptFile | undefined, data: string, fileName: string): ScriptFile => {
      if (existing === undefined) {
        return makeScriptFile(data, fileName)
      }
      return withContent(existing, data)
    }

    const writeFile = (fileName: string, data: string): Effect.Effect<void> =>
      Effect.gen(function*() {
        const normalized = normalizeFileName(fileName)
        const files = yield* Ref.get(filesRef)
        const existing = Option.getOrUndefined(MutableHashMap.get(files, normalized))
        yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, fileForWrite(existing, data, normalized)))
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
        const file = Option.getOrUndefined(MutableHashMap.get(files, normalized))
        if (file === undefined) {
          return
        }
        yield* Ref.update(filesRef, (m) => setInPlace(m, normalized, resetScriptFile(file)))
      })

    const existsInMemory = (fileName: string): Effect.Effect<boolean> =>
      Effect.gen(function*() {
        const files = yield* Ref.get(filesRef)
        return Option.getOrUndefined(MutableHashMap.get(files, normalizeFileName(fileName))) !== undefined
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
  node.parents.forEach((parent) => collectParentReference(parent, allParentReferences))
  return allParentReferences
}

function collectParentReference(
  parent: TSFileNode,
  allParentReferences: MutableHashSet.MutableHashSet<TSFileNode>,
): void {
  if (MutableHashSet.has(allParentReferences, parent)) {
    return
  }
  getAllParentReferencesIncludingSelf(parent, allParentReferences)
}

export function getAllChildReferencesIncludingSelf(
  node: TSFileNode,
  allChildReferences: MutableHashSet.MutableHashSet<TSFileNode> = MutableHashSet.empty<TSFileNode>(),
): MutableHashSet.MutableHashSet<TSFileNode> {
  MutableHashSet.add(allChildReferences, node)
  node.children.forEach((child) => collectChildReference(child, allChildReferences))
  return allChildReferences
}

function collectChildReference(
  child: TSFileNode,
  allChildReferences: MutableHashSet.MutableHashSet<TSFileNode>,
): void {
  if (MutableHashSet.has(allChildReferences, child)) {
    return
  }
  getAllChildReferencesIncludingSelf(child, allChildReferences)
}

/**
 * Every mutant of `node` and its descendants, each node visited once.
 * The defaulted parameter is published API, so the recursion it seeds lives in
 * `collectRelatedMutants`.
 */
export function getMutantsWithReferenceToChildrenOrSelf(
  node: TSFileNode,
  mutants: Mutant[],
  nodesChecked: string[] = [],
): Mutant[] {
  return collectRelatedMutants(node, mutants, nodesChecked)
}

function collectRelatedMutants(node: TSFileNode, mutants: Mutant[], nodesChecked: string[]): Mutant[] {
  if (nodesChecked.includes(node.fileName)) {
    return []
  }
  nodesChecked.push(node.fileName)
  const relatedMutants = mutants.filter((mutant) => normalizeFileName(mutant.fileName) === node.fileName)
  const childResult = node.children.flatMap((child) => collectRelatedMutants(child, mutants, nodesChecked))
  return [...relatedMutants, ...childResult]
}

interface MutantGroup {
  readonly mutantIds: string[]
  readonly nodes: MutableHashSet.MutableHashSet<TSFileNode>
  readonly ignoredNodes: MutableHashSet.MutableHashSet<TSFileNode>
}

function addRangeOfNodesToSet(
  nodes: MutableHashSet.MutableHashSet<TSFileNode>,
  nodesToAdd: Iterable<TSFileNode>,
): void {
  for (const node of nodesToAdd) {
    MutableHashSet.add(nodes, node)
  }
}

function findNode(fileName: string, nodes: MutableHashMap.MutableHashMap<string, TSFileNode>): TSFileNode {
  const node = Option.firstSomeOf([
    MutableHashMap.get(nodes, normalizeFileName(fileName)),
    MutableHashMap.get(nodes, fileName),
  ])
  if (Option.isNone(node)) {
    throw new Error(`Node not in graph: ${fileName}`)
  }
  return node.value
}

function parentsHaveOverlapWith(
  currentNode: TSFileNode,
  groupNodes: MutableHashSet.MutableHashSet<TSFileNode>,
): boolean {
  return Array.from(getAllParentReferencesIncludingSelf(currentNode))
    .some((parentNode) => MutableHashSet.has(groupNodes, parentNode))
}

function mutantCanJoinGroup(currentNode: TSFileNode, group: MutantGroup): boolean {
  if (MutableHashSet.has(group.ignoredNodes, currentNode)) {
    return false
  }
  return !parentsHaveOverlapWith(currentNode, group.nodes)
}

function addMutantToGroup(
  currentMutant: Mutant,
  mutantsToGroup: MutableHashSet.MutableHashSet<Mutant>,
  group: MutantGroup,
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
): void {
  const currentNode = findNode(currentMutant.fileName, nodes)
  if (!mutantCanJoinGroup(currentNode, group)) {
    return
  }
  group.mutantIds.push(currentMutant.id)
  MutableHashSet.add(group.nodes, currentNode)
  MutableHashSet.remove(mutantsToGroup, currentMutant)
  addRangeOfNodesToSet(group.ignoredNodes, getAllParentReferencesIncludingSelf(currentNode))
}

function takeGroup(
  mutantsToGroup: MutableHashSet.MutableHashSet<Mutant>,
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
): string[] {
  const group: MutantGroup = {
    mutantIds: [],
    nodes: MutableHashSet.empty<TSFileNode>(),
    ignoredNodes: MutableHashSet.empty<TSFileNode>(),
  }
  for (const currentMutant of mutantsToGroup) {
    addMutantToGroup(currentMutant, mutantsToGroup, group, nodes)
  }
  return group.mutantIds
}

export function createGroups(mutants: Mutant[], nodes: MutableHashMap.MutableHashMap<string, TSFileNode>): string[][] {
  const groups: string[][] = []
  const mutantsToGroup = MutableHashSet.fromIterable(mutants)
  while (MutableHashSet.size(mutantsToGroup) > 0) {
    groups.push(takeGroup(mutantsToGroup, nodes))
  }
  return groups
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
  strykerOptions: StrykerOptions,
  fs: HybridFileSystem,
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
): TypeScriptCompiler['Service'] {
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

  const snapshotOf = (state: CompilerState): Effect.Effect<Snapshot, unknown> => {
    if (state.snapshot === undefined) {
      return Effect.fail(new CompilerFailed({ reason: 'not-initialized' }))
    }
    return Effect.succeed(state.snapshot)
  }

  const programsOf = (snapshot: Snapshot, tsconfigFile: string): Effect.Effect<Program[], unknown> => {
    const projects = snapshot.getProjects()
    if (projects.length === 0) {
      return Effect.fail(new CompilerFailed({ reason: 'no-projects', subject: tsconfigFile }))
    }
    return Effect.succeed(projects.map((project) => project.program))
  }

  const getProgramsEffect = (): Effect.Effect<Program[], unknown> =>
    Effect.gen(function*() {
      const state = yield* Ref.get(stateRef)
      const snapshot = yield* snapshotOf(state)
      return yield* programsOf(snapshot, state.tsconfigFile)
    })

  const guardTSConfigFileExistsEffect: Effect.Effect<void, unknown> = Effect.gen(function*() {
    const s = yield* Ref.get(stateRef)
    yield* fsService.readFileString(s.tsconfigFile).pipe(
      Effect.mapError(() => new TsConfigNotFoundError({ file: s.tsconfigFile })),
    )
  })

  interface TsConfigTraversal {
    readonly overrides: MutableHashMap.MutableHashMap<string, string>
    readonly pending: string[]
    readonly processed: MutableHashSet.MutableHashSet<string>
    readonly allTsConfigFiles: MutableHashSet.MutableHashSet<string>
    readonly buildModeEnabled: boolean
  }

  const isBlankTsConfigPath = (current: string | undefined): current is undefined | '' =>
    current === undefined || current === ''

  const isUnprocessedTsConfigPath = (
    current: string | undefined,
    processed: MutableHashSet.MutableHashSet<string>,
  ): current is string => !isBlankTsConfigPath(current) && !MutableHashSet.has(processed, current)

  const recordParsedTsConfig = (current: string, config: TsConfig, traversal: TsConfigTraversal): void => {
    MutableHashMap.set(traversal.overrides, current, overrideOptions(config, traversal.buildModeEnabled))
    for (const referenced of retrieveReferencedProjects(config, pathService.dirname(current), pathService)) {
      MutableHashSet.add(traversal.allTsConfigFiles, normalizeFileName(referenced))
      traversal.pending.push(referenced)
    }
  }

  const recordTsConfig = (
    current: string,
    content: string,
    parsed: Result.Result<TsConfig, TsConfigParseError>,
    traversal: TsConfigTraversal,
  ): void => {
    if (Result.isFailure(parsed)) {
      MutableHashMap.set(traversal.overrides, current, content)
      return
    }
    recordParsedTsConfig(current, parsed.success, traversal)
  }

  const processNextTsConfig = (traversal: TsConfigTraversal): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const current = traversal.pending.pop()
      if (!isUnprocessedTsConfigPath(current, traversal.processed)) {
        return
      }
      MutableHashSet.add(traversal.processed, current)
      const content = yield* fsService.readFileString(current)
      recordTsConfig(current, content, parseTsConfig(current, content), traversal)
    })

  const collectAllTSConfigFiles = (buildModeEnabled: boolean): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const state = yield* Ref.get(stateRef)
      const traversal: TsConfigTraversal = {
        overrides: MutableHashMap.empty<string, string>(),
        pending: [state.tsconfigFile],
        processed: MutableHashSet.empty<string>(),
        allTsConfigFiles: state.allTSConfigFiles,
        buildModeEnabled,
      }
      while (traversal.pending.length > 0) {
        yield* processNextTsConfig(traversal)
      }
      yield* fs.setTsConfigOverrides(traversal.overrides)
      yield* Ref.update(stateRef, (prev) => ({
        ...prev,
        allTSConfigFiles: MutableHashSet.fromIterable(traversal.allTsConfigFiles),
      }))
    })

  type SourceStatement = SourceFile['statements'][number]

  const importDeclarationSpecifierOf = (
    statement: SourceStatement,
    sourceFile: SourceFile,
  ): Option.Option<string> => {
    if (statement.kind !== SyntaxKind.ImportDeclaration) {
      return Option.none()
    }
    let specifier: SourceFile['imports'][number] | undefined
    statement.forEachChild((child) => {
      if (child.kind === SyntaxKind.StringLiteral) {
        specifier = child
      }
    })
    return Option.map(Option.fromUndefinedOr(specifier), (found) => found.getText(sourceFile))
  }

  const collectImportEqualsSpecifiers = (statement: SourceStatement, sourceFile: SourceFile, into: string[]): void => {
    if (statement.kind !== SyntaxKind.ImportEqualsDeclaration) {
      return
    }
    statement.forEachChild((child) => {
      if (child.kind === SyntaxKind.ExternalModuleReference) {
        child.forEachChild((refChild) => {
          if (refChild.kind === SyntaxKind.StringLiteral) {
            into.push(refChild.getText(sourceFile))
          }
        })
      }
    })
  }

  const extractImports = (sourceFile: SourceFile): string[] => {
    const result: string[] = []
    sourceFile.statements.forEach((statement) => {
      const specifier = importDeclarationSpecifierOf(statement, sourceFile)
      if (Option.isSome(specifier)) {
        result.push(specifier.value)
      }
      collectImportEqualsSpecifiers(statement, sourceFile, result)
    })
    sourceFile.referencedFiles.forEach((ref) => result.push(ref.fileName))
    sourceFile.typeReferenceDirectives.forEach((ref) => result.push(ref.fileName))
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
    if (!relativeSpecifierPattern.test(cleaned)) {
      return undefined
    }
    const baseDir = pathService.dirname(sourceFileName)
    const resolved = normalizeFileName(pathService.resolve(baseDir, cleaned))
    return getResolutionCandidates(resolved, pathService)
      .find((candidate) => MutableHashMap.has(sourceFiles, candidate))
  }

  const readFileText = (fileName: string): Option.Option<string> =>
    Option.liftPredicate(fs.fileSystem.readFile?.(fileName), isString)

  const sourcesFieldOf = (rawMap: unknown): Option.Option<readonly unknown[]> => {
    if (!Predicate.hasProperty(rawMap, 'sources')) {
      return Option.none()
    }
    return Option.liftPredicate(rawMap.sources, Array.isArray)
  }

  const onlySourceOf = (sources: readonly unknown[]): Option.Option<string> => {
    const names = sources.filter(isString)
    if (names.length !== 1) {
      return Option.none()
    }
    return Option.fromUndefinedOr(names[0])
  }

  const sourcePathFromMap = (
    declarationFileName: string,
    reference: string,
    pathService: Path.Path,
  ): Option.Option<string> => {
    const sourceMapFileName = normalizeFileName(
      pathService.resolve(pathService.dirname(declarationFileName), reference),
    )
    return Option.flatMap(
      Option.flatMap(
        readFileText(sourceMapFileName),
        (content) => Option.flatMap(sourcesFieldOf(JSON.parse(content)), onlySourceOf),
      ),
      (source) => Option.some(normalizeFileName(pathService.resolve(pathService.dirname(sourceMapFileName), source))),
    )
  }

  const sourceMappedFileName = (
    declarationFileName: string,
    pathService: Path.Path,
  ): Option.Option<string> =>
    Option.flatMap(
      Option.flatMap(readFileText(declarationFileName), (content) =>
        Option.liftPredicate(getSourceMappingURL(content), isNonEmptyString)),
      (reference) =>
        sourcePathFromMap(declarationFileName, reference, pathService),
    )

  const resolveTSInputFile = (dependencyFileName: string, pathService: Path.Path): string => {
    if (!dependencyFileName.endsWith('.d.ts')) {
      return dependencyFileName
    }
    return Option.getOrElse(sourceMappedFileName(dependencyFileName, pathService), () => dependencyFileName)
  }

  const registerGraphFile = (fileName: string, sourceFiles: SourceFiles): void => {
    if (ignoredGraphFileNamePattern.test(fileName)) {
      return
    }
    const normalized = normalizeFileName(fileName)
    MutableHashMap.set(sourceFiles, normalized, {
      fileName: normalized,
      imports: MutableHashSet.empty<string>(),
    })
  }

  const registerSourceFiles = (programs: readonly Program[], sourceFiles: SourceFiles): void => {
    for (const program of programs) {
      program.getSourceFileNames().forEach((fileName) => registerGraphFile(fileName, sourceFiles))
    }
  }

  const isUsableResolution = (resolved: string | undefined): resolved is string =>
    resolved !== undefined && resolved !== ''

  const addImportEdge = (fileName: string, importedFileName: string, sourceFiles: SourceFiles): void => {
    if (!MutableHashMap.has(sourceFiles, importedFileName)) {
      return
    }
    Option.match(MutableHashMap.get(sourceFiles, fileName), {
      onNone: () => undefined,
      onSome: (entry) => MutableHashSet.add(entry.imports, importedFileName),
    })
  }

  const linkImport = (fileName: string, specifier: string, sourceFiles: SourceFiles): void => {
    const resolved = resolveModuleSpecifier(fileName, specifier, sourceFiles, pathService)
    if (!isUsableResolution(resolved)) {
      return
    }
    addImportEdge(fileName, resolveTSInputFile(resolved, pathService), sourceFiles)
  }

  const linkFileImports = (fileName: string, programs: readonly Program[], sourceFiles: SourceFiles): void => {
    const sourceFile = programs
      .map((program) => program.getSourceFile(fileName))
      .find((candidate) => candidate != null)
    if (sourceFile === undefined) {
      return
    }
    extractImports(sourceFile).forEach((specifier) => linkImport(fileName, specifier, sourceFiles))
  }

  const buildDependencyGraph = (programs: Program[]): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const state = yield* Ref.get(stateRef)
      registerSourceFiles(programs, state.sourceFiles)
      for (const [fileName] of state.sourceFiles) {
        linkFileImports(fileName, programs, state.sourceFiles)
      }
      yield* Ref.update(stateRef, (prev) => ({
        ...prev,
        sourceFiles: MutableHashMap.fromIterable(state.sourceFiles),
      }))
    })

  const createEmptyNodes = (state: CompilerState): void => {
    for (const [fileName] of state.sourceFiles) {
      MutableHashMap.set(state.nodes, fileName, makeTSFileNode(fileName))
    }
  }

  const childNodeOf = (
    state: CompilerState,
    fileName: string,
    imports: MutableHashSet.MutableHashSet<string>,
  ): Effect.Effect<TSFileNode, unknown> =>
    Effect.gen(function*() {
      const node = MutableHashMap.get(state.nodes, fileName)
      if (Option.isNone(node)) {
        return yield* new CompilerFailed({ reason: 'unknown-file-node', subject: fileName })
      }
      const children = Array.from(imports)
        .map((importName) => Option.getOrUndefined(MutableHashMap.get(state.nodes, importName)))
        .filter((child): child is TSFileNode => child !== undefined)
      return { ...node.value, children, parents: [] }
    })

  const collectChildNodes = (
    state: CompilerState,
    withChildren: MutableHashMap.MutableHashMap<string, TSFileNode>,
  ): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      for (const [fileName, file] of state.sourceFiles) {
        const node = yield* childNodeOf(state, fileName, file.imports)
        MutableHashMap.set(withChildren, fileName, node)
      }
    })

  const replaceMapContents = <K, V>(
    target: MutableHashMap.MutableHashMap<K, V>,
    source: MutableHashMap.MutableHashMap<K, V>,
  ): void => {
    MutableHashMap.clear(target)
    for (const [key, value] of source) {
      MutableHashMap.set(target, key, value)
    }
  }

  const parentNodesOf = (
    node: TSFileNode,
    nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
  ): TSFileNode[] => {
    const parents: TSFileNode[] = []
    MutableHashMap.forEach(nodes, (candidate) => {
      if (candidate.children.includes(node)) {
        parents.push(candidate)
      }
    })
    return parents
  }

  const linkParentReferences = (state: CompilerState): void => {
    const withParents = MutableHashMap.empty<string, TSFileNode>()
    for (const [fileName, node] of state.nodes) {
      MutableHashMap.set(withParents, fileName, { ...node, parents: parentNodesOf(node, state.nodes) })
    }
    replaceMapContents(state.nodes, withParents)
  }

  const buildFileNodes = (state: CompilerState): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      createEmptyNodes(state)
      const withChildren = MutableHashMap.empty<string, TSFileNode>()
      yield* collectChildNodes(state, withChildren)
      replaceMapContents(state.nodes, withChildren)
      linkParentReferences(state)
      yield* Ref.update(stateRef, (prev) => ({ ...prev, nodes: MutableHashMap.fromIterable(state.nodes) }))
    })

  const getNodesEffect: Effect.Effect<MutableHashMap.MutableHashMap<string, TSFileNode>, unknown> = Effect.gen(
    function*() {
      const state = yield* Ref.get(stateRef)
      if (MutableHashMap.size(state.nodes) > 0) {
        return state.nodes
      }
      yield* buildFileNodes(state)
      return state.nodes
    },
  )

  const resetMutatedFiles = (mutants: readonly Mutant[]): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      for (const mutant of mutants) {
        yield* fs.resetFile(mutant.fileName)
      }
    })

  const applyMutant = (mutant: Mutant): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const file = yield* fs.getFile(mutant.fileName)
      if (file === undefined) {
        return yield* new CompilerFailed({ reason: 'file-not-in-project', subject: mutant.fileName })
      }
      yield* fs.mutateFile(mutant.fileName, mutant)
    })

  const applyMutants = (mutants: readonly Mutant[]): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      for (const mutant of mutants) {
        yield* applyMutant(mutant)
      }
    })

  interface InitializedCompilerState extends CompilerState {
    readonly api: API
    readonly snapshot: Snapshot
  }

  const hasOpenSnapshot = (state: CompilerState): state is InitializedCompilerState =>
    state.api !== undefined && state.snapshot !== undefined

  const updateSnapshot = (state: InitializedCompilerState, changedFiles: string[]): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const previous = state.snapshot
      const next = state.api.updateSnapshot({
        openProjects: Array.from(state.allTSConfigFiles),
        fileChanges: { changed: changedFiles },
      })
      yield* Effect.sync(() => previous.dispose())
      yield* Ref.update(stateRef, (prev) => ({ ...prev, snapshot: next }))
    })

  const check: (mutants: readonly Mutant[]) => Effect.Effect<readonly Diagnostic[], unknown> = (mutants) =>
    Effect.gen(function*() {
      const state = yield* Ref.get(stateRef)
      yield* resetMutatedFiles(state.lastMutants)
      yield* applyMutants(mutants)
      const mutatedFileNames = Array.from(
        MutableHashSet.fromIterable(mutants.map((mutant) => normalizeFileName(mutant.fileName))),
      )
      const changedFiles = Array.from(MutableHashSet.fromIterable([...state.lastMutatedFileNames, ...mutatedFileNames]))
      const current = yield* Ref.get(stateRef)
      if (hasOpenSnapshot(current)) {
        yield* updateSnapshot(current, changedFiles)
      }
      yield* Ref.update(
        stateRef,
        (prev) => ({
          ...prev,
          lastMutants: [...mutants] satisfies readonly Mutant[],
          lastMutatedFileNames: mutatedFileNames,
        }),
      )
      return (yield* getProgramsEffect())
        .flatMap((program) => [
          ...program.getConfigFileParsingDiagnostics(),
          ...program.getSemanticDiagnostics(),
          ...program.getProgramDiagnostics(),
        ])
        .filter((diagnostic) => diagnostic.category === DiagnosticCategory.Error)
    })

  const init: Effect.Effect<readonly Diagnostic[], unknown> = Effect.gen(function*() {
    yield* guardTSVersion(fsService, pathService)
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
      return programs
        .map((program) => program.getSourceFile(fileName))
        .find((sourceFile) => sourceFile !== undefined)
        ?.getLineAndCharacterOfPosition(position)
    })

  const nodes: Effect.Effect<MutableHashMap.MutableHashMap<string, TSFileNode>, unknown> = getNodesEffect

  return { init, check, nodes, close, getLineAndCharacterOfPosition }
}
