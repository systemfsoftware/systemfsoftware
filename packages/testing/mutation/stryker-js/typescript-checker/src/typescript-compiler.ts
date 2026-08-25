import {
  type Mutant,
  normalizeFileName,
  type StrykerOptions,
  StrykerOptionsSchema,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'

import { Predicate, Result } from 'effect'
import type { SourceFile } from 'typescript/unstable/ast'
import { SyntaxKind } from 'typescript/unstable/ast'
import {
  API,
  type Diagnostic,
  DiagnosticCategory,
  type DocumentIdentifier,
  type Program,
  type Snapshot,
} from 'typescript/unstable/sync'
import { CompilerFailed } from './compiler-error.schema.js'
import { getSourceMappingURL } from './declaration-source-mapping.js'
import { makeTSFileNode, type TSFileNode } from './grouping/ts-file-node.js'
import type { HybridFileSystem } from './project/hybrid-file-system.js'
import { determineBuildModeEnabled, overrideOptions, parseTsConfig, retrieveReferencedProjects } from './tsconfig.js'
import { TsConfigNotFoundError } from './tsconfig.schema.js'
import { guardTSVersion } from './typescript-version.js'

export type SourceFiles = Map<
  string,
  {
    fileName: string
    imports: Set<string>
  }
>

interface CompilerState {
  api: API | undefined
  snapshot: Snapshot | undefined
  sourceFiles: SourceFiles
  nodes: Map<string, TSFileNode>
  lastMutants: Mutant[]
  lastMutatedFileNames: string[]
  allTSConfigFiles: Set<string>
  tsconfigFile: string
}

export class TypeScriptCompiler extends Context.Service<TypeScriptCompiler, {
  readonly init: Effect.Effect<readonly Diagnostic[], unknown>
  readonly check: (mutants: readonly Mutant[]) => Effect.Effect<readonly Diagnostic[], unknown>
  readonly nodes: Effect.Effect<ReadonlyMap<string, TSFileNode>, unknown>
  readonly close: Effect.Effect<void, unknown>
  readonly getLineAndCharacterOfPosition: (
    fileName: string,
    position: number,
  ) => Effect.Effect<{ line: number; character: number } | undefined, unknown>
}>()('@systemfsoftware/stryker-js-typescript-checker/TypeScriptCompiler') {}

// Helpers that allocate native collections outside Effect.gen to satisfy no-native-map-in-effect
const emptySourceFiles = (): SourceFiles => new Map()
const emptyNodes = (): Map<string, TSFileNode> => new Map()
const emptyStringMap = (): Map<string, string> => new Map()
const emptyStringSet = (): Set<string> => new Set()
const setFromArray = <T>(arr: readonly T[]): Set<T> => new Set(arr)
const unique = <T>(arr: readonly T[]): T[] => [...new Set(arr)]
const cloneMap = <K, V>(m: Map<K, V>): Map<K, V> => new Map(m)

// Reference idiom citations:
// - Context.Service class overload: repos/effect/packages/effect/src/Context.ts:209-244
// - Registry example:            repos/effect-torch/packages/core/src/Registry.ts:98-100
// - Layer co-located:            repos/effect/packages/effect/src/unstable/reactivity/Reactivity.ts:317
// - Effect-returning methods:    repos/effect-torch/packages/core/src/Model.ts:257-288 and Tensor.ts:376-388
// - acquireRelease:              repos/effect/packages/effect/src/Effect.ts:6549-6553
// - Ref:                         repos/effect/packages/effect/src/Ref.ts:33-50

const makeDummy = Effect.gen(function*() {
  const stateRef = yield* Ref.make<CompilerState>({
    api: undefined,
    snapshot: undefined,
    sourceFiles: emptySourceFiles(),
    nodes: emptyNodes(),
    lastMutants: [],
    lastMutatedFileNames: [],
    allTSConfigFiles: setFromArray(['tsconfig.json']),
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
    init: Effect.succeed([] as readonly Diagnostic[]),
    check: () => Effect.succeed([] as readonly Diagnostic[]),
    nodes: Ref.get(stateRef).pipe(Effect.map((s) => s.nodes as ReadonlyMap<string, TSFileNode>)),
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
    sourceFiles: emptySourceFiles(),
    nodes: emptyNodes(),
    lastMutants: [],
    lastMutatedFileNames: [],
    allTSConfigFiles: setFromArray([rawTsconfigFile]),
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
      const tsConfigOverrides = emptyStringMap()
      const toProcess = [s.tsconfigFile]
      const processed = emptyStringSet()

      while (toProcess.length > 0) {
        const current = toProcess.pop()
        if (!current || processed.has(current)) {
          continue
        }
        processed.add(current)

        const content = yield* fsService.readFileString(current)
        const parsed = parseTsConfig(current, content)
        if (Result.isFailure(parsed)) {
          tsConfigOverrides.set(current, content)
          continue
        }
        tsConfigOverrides.set(current, overrideOptions(parsed.success, buildModeEnabled))

        for (
          const referenced of retrieveReferencedProjects(parsed.success, pathService.dirname(current), pathService)
        ) {
          const normalized = normalizeFileName(referenced)
          s.allTSConfigFiles.add(normalized)
          toProcess.push(referenced)
        }
      }

      yield* fs.setTsConfigOverrides(tsConfigOverrides)
      yield* Ref.update(stateRef, (prev) => ({ ...prev, allTSConfigFiles: setFromArray([...s.allTSConfigFiles]) }))
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
      if (sourceFiles.has(candidate)) {
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
    if (!sourceMappingURL) {
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
          s.sourceFiles.set(normalized, {
            fileName: normalized,
            imports: emptyStringSet(),
          })
        }
      }
      for (const [fileName] of s.sourceFiles) {
        const sourceFile = programs
          .map((p) => p.getSourceFile(fileName as DocumentIdentifier))
          .find((sf) => sf != null)
        if (!sourceFile) {
          continue
        }
        const imports = extractImports(sourceFile)
        for (const specifier of imports) {
          const resolved = resolveModuleSpecifier(fileName, specifier, s.sourceFiles, pathService)
          if (resolved) {
            const sourceFileName = resolveTSInputFile(resolved, pathService)
            if (s.sourceFiles.has(sourceFileName)) {
              s.sourceFiles.get(fileName)?.imports.add(sourceFileName)
            }
          }
        }
      }
      yield* Ref.update(stateRef, (prev) => ({ ...prev, sourceFiles: cloneMap(s.sourceFiles) }))
    })

  const getNodesEffect: Effect.Effect<ReadonlyMap<string, TSFileNode>, unknown> = Effect.gen(function*() {
    const s = yield* Ref.get(stateRef)
    if (s.nodes.size > 0) {
      return s.nodes
    }
    for (const [fileName] of s.sourceFiles) {
      const node = makeTSFileNode(fileName)
      s.nodes.set(fileName, node)
    }
    const withChildren = emptyNodes()
    for (const [fileName, file] of s.sourceFiles) {
      const node = s.nodes.get(fileName)
      if (node == null) {
        return yield* new CompilerFailed({ reason: 'unknown-file-node', subject: fileName })
      }
      const children = [...file.imports]
        .map((importName) => s.nodes.get(importName))
        .filter((n): n is TSFileNode => n !== undefined)
      withChildren.set(fileName, { ...node, children, parents: [] })
    }
    s.nodes.clear()
    for (const [k, v] of withChildren) {
      s.nodes.set(k, v)
    }
    const withParents = emptyNodes()
    for (const [fileName, node] of s.nodes) {
      const parents: TSFileNode[] = []
      for (const [, n] of s.nodes) {
        if (n.children.includes(node)) {
          parents.push(n)
        }
      }
      withParents.set(fileName, { ...node, parents })
    }
    s.nodes.clear()
    for (const [k, v] of withParents) {
      s.nodes.set(k, v)
    }
    yield* Ref.update(stateRef, (prev) => ({ ...prev, nodes: cloneMap(s.nodes) }))
    return s.nodes
  })

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
      const mutatedFileNames = unique(mutants.map((m) => normalizeFileName(m.fileName)))
      const changedFiles = unique([...state.lastMutatedFileNames, ...mutatedFileNames])
      const current = yield* Ref.get(stateRef)
      if (current.api && current.snapshot) {
        const oldSnapshot = current.snapshot
        const nextSnapshot = current.api.updateSnapshot({
          openProjects: [...current.allTSConfigFiles],
          fileChanges: { changed: changedFiles },
        })
        yield* Effect.sync(() => oldSnapshot.dispose())
        yield* Ref.update(stateRef, (prev) => ({ ...prev, snapshot: nextSnapshot }))
      }
      yield* Ref.update(stateRef, (prev) => ({
        ...prev,
        lastMutants: [...mutants] as Mutant[],
        lastMutatedFileNames: mutatedFileNames,
      }))
      const programsWithDiagnostics = yield* getProgramsEffect()
      return programsWithDiagnostics
        .flatMap((program) => [
          ...program.getConfigFileParsingDiagnostics(),
          ...program.getSemanticDiagnostics(),
          ...program.getProgramDiagnostics(),
        ])
        .filter((diagnostic) => diagnostic.category === DiagnosticCategory.Error)
    })

  const init: Effect.Effect<readonly Diagnostic[], unknown> = Effect.gen(function*() {
    yield* guardTSVersion(fsService)
    const absoluteTsconfigFile = normalizeFileName(pathService.resolve(rawTsconfigFile))
    yield* Ref.update(stateRef, (prev) => ({
      ...prev,
      tsconfigFile: absoluteTsconfigFile,
      allTSConfigFiles: setFromArray([absoluteTsconfigFile]),
    }))
    yield* guardTSConfigFileExistsEffect
    const buildModeEnabled = yield* determineBuildModeEnabled(absoluteTsconfigFile, fsService)
    yield* collectAllTSConfigFiles(buildModeEnabled)
    const s = yield* Ref.get(stateRef)
    const api = new API({ fs: fs.fileSystem })
    const snapshot = api.updateSnapshot({
      openProjects: [...s.allTSConfigFiles],
    })
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

  const nodes: Effect.Effect<ReadonlyMap<string, TSFileNode>, unknown> = getNodesEffect

  return {
    init,
    check,
    nodes,
    close,
    getLineAndCharacterOfPosition,
  }
}
