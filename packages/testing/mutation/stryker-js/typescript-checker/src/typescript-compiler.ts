import { readFileSync } from 'fs'
import path from 'path'

import {
  type Mutant,
  normalizeFileName,
  type StrykerOptions,
  StrykerOptionsSchema,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import { type SourceFile, SyntaxKind } from 'typescript/unstable/ast'
import {
  API,
  type Diagnostic,
  DiagnosticCategory,
  type DocumentIdentifier,
  type Program,
  type Snapshot,
} from 'typescript/unstable/sync'
import { getSourceMappingURL } from './declaration-source-mapping.js'
import { makeTSFileNode, type TSFileNode } from './grouping/ts-file-node.js'
import type { HybridFileSystem } from './project/hybrid-file-system.js'
import { determineBuildModeEnabled, overrideOptions, parseTsConfig, retrieveReferencedProjects } from './tsconfig.js'
import { guardTSVersion } from './typescript-version.js'

export interface TypescriptCompiler {
  init(): Promise<Diagnostic[]>
  check(mutants: Mutant[]): Promise<Diagnostic[]>
  readonly nodes: ReadonlyMap<string, TSFileNode>
  close(): void
  getLineAndCharacterOfPosition(
    fileName: string,
    position: number,
  ): { line: number; character: number } | undefined
}

export type ITypescriptCompiler = Pick<TypescriptCompiler, 'init' | 'check'>
export type IFileRelationCreator = Pick<TypescriptCompiler, 'nodes'>

export type SourceFiles = Map<
  string,
  {
    fileName: string
    imports: Set<string>
  }
>

export function makeTypescriptCompiler(
  options: unknown,
  fs: HybridFileSystem,
): TypescriptCompiler {
  if (!S.is(StrykerOptionsSchema)(options)) {
    throw new Error('Invalid StrykerOptions')
  }
  const strykerOptions: StrykerOptions = options
  const tsconfigFile = normalizeFileName(
    path.resolve(normalizeFileName(strykerOptions.tsconfigFile)),
  )
  const allTSConfigFiles = new Set<string>([tsconfigFile])
  let api: API | undefined
  let snapshot: Snapshot | undefined
  const sourceFiles: SourceFiles = new Map()
  const _nodes = new Map<string, TSFileNode>()
  let lastMutants: Mutant[] = []
  let lastMutatedFileNames: string[] = []

  const getPrograms = (): Program[] => {
    if (!snapshot) {
      throw new Error('TypescriptCompiler not initialized')
    }
    const projects = snapshot.getProjects()
    if (projects.length === 0) {
      throw new Error(`No projects found for ${tsconfigFile}`)
    }
    return projects.map((project) => project.program)
  }

  const guardTSConfigFileExists = () => {
    try {
      readFileSync(tsconfigFile, 'utf-8')
    } catch {
      throw new Error(
        `The tsconfig file does not exist at: "${tsconfigFile}". Please configure the tsconfig file in your stryker.conf file using "tsconfigFile"`,
      )
    }
  }

  const collectAllTSConfigFiles = (buildModeEnabled: boolean) => {
    const tsConfigOverrides = new Map<string, string>()
    const toProcess = [tsconfigFile]
    const processed = new Set<string>()

    while (toProcess.length > 0) {
      const current = toProcess.pop()
      if (!current || processed.has(current)) {
        continue
      }
      processed.add(current)

      const content = readFileSync(current, 'utf-8')
      const parsed = parseTsConfig(current, content)
      if (Result.isFailure(parsed)) {
        tsConfigOverrides.set(current, content)
        continue
      }
      tsConfigOverrides.set(current, overrideOptions(parsed.success, buildModeEnabled))

      for (
        const referenced of retrieveReferencedProjects(
          parsed.success,
          path.dirname(current),
        )
      ) {
        allTSConfigFiles.add(referenced)
        toProcess.push(referenced)
      }
    }

    // Persist overrides via the Ref-backed filesystem
    Effect.runSync(fs.setTsConfigOverrides(tsConfigOverrides))
  }

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

  const getResolutionCandidates = (resolved: string): string[] => {
    const extension = path.extname(resolved)
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
  ): string | undefined => {
    const cleaned = specifier.replace(/^['"]|['"]$/g, '')
    if (!cleaned.startsWith('./') && !cleaned.startsWith('../')) {
      return undefined
    }
    const baseDir = path.dirname(sourceFileName)
    const resolved = normalizeFileName(path.resolve(baseDir, cleaned))

    const candidates = getResolutionCandidates(resolved)
    for (const candidate of candidates) {
      if (sourceFiles.has(candidate)) {
        return candidate
      }
    }

    return undefined
  }

  const resolveTSInputFile = (dependencyFileName: string): string => {
    if (!dependencyFileName.endsWith('.d.ts')) {
      return dependencyFileName
    }

    // Use the synchronous fileSystem view for graph construction.
    const content = fs.fileSystem.readFile?.(dependencyFileName)
    if (typeof content !== 'string') {
      return dependencyFileName
    }

    const sourceMappingURL = getSourceMappingURL(content)
    if (!sourceMappingURL) {
      return dependencyFileName
    }

    const sourceMapFileName = normalizeFileName(
      path.resolve(path.dirname(dependencyFileName), sourceMappingURL),
    )
    const sourceMapContent = fs.fileSystem.readFile?.(sourceMapFileName)
    if (typeof sourceMapContent !== 'string') {
      return dependencyFileName
    }

    const rawMap: unknown = JSON.parse(sourceMapContent)
    let sources: readonly string[] | undefined
    if (
      Predicate.hasProperty(rawMap, 'sources') &&
      Array.isArray(rawMap.sources)
    ) {
      const filtered = rawMap.sources.filter((s): s is string => typeof s === 'string')
      sources = filtered
    }

    if (sources?.length === 1) {
      const sourcePath = sources[0]
      if (sourcePath === undefined) {
        return dependencyFileName
      }
      return normalizeFileName(
        path.resolve(path.dirname(sourceMapFileName), sourcePath),
      )
    }

    return dependencyFileName
  }

  const buildDependencyGraph = (programs: Program[]) => {
    for (const program of programs) {
      for (const fileName of program.getSourceFileNames()) {
        if (
          fileName.endsWith('.d.ts') ||
          fileName.includes('node_modules')
        ) {
          continue
        }
        const normalized = normalizeFileName(fileName)
        sourceFiles.set(normalized, {
          fileName: normalized,
          imports: new Set(),
        })
      }
    }

    for (const [fileName] of sourceFiles) {
      const sourceFile = programs
        .map((p) => p.getSourceFile(fileName as DocumentIdentifier))
        .find((sf) => sf != null)
      if (!sourceFile) {
        continue
      }
      const imports = extractImports(sourceFile)
      for (const specifier of imports) {
        const resolved = resolveModuleSpecifier(fileName, specifier)
        if (resolved) {
          const sourceFileName = resolveTSInputFile(resolved)
          if (sourceFiles.has(sourceFileName)) {
            sourceFiles.get(fileName)?.imports.add(sourceFileName)
          }
        }
      }
    }
  }

  const getNodes = (): ReadonlyMap<string, TSFileNode> => {
    if (!_nodes.size) {
      for (const [fileName] of sourceFiles) {
        const node = makeTSFileNode(fileName)
        _nodes.set(fileName, node)
      }

      const withChildren = new Map<string, TSFileNode>()
      for (const [fileName, file] of sourceFiles) {
        const node = _nodes.get(fileName)
        if (node == null) {
          throw new Error(
            `Node for file '${fileName}' could not be found. This should not happen.`,
          )
        }
        const children = [...file.imports]
          .map((importName) => _nodes.get(importName))
          .filter((n): n is TSFileNode => n !== undefined)
        withChildren.set(fileName, { ...node, children, parents: [] })
      }
      _nodes.clear()
      for (const [k, v] of withChildren) {
        _nodes.set(k, v)
      }

      const withParents = new Map<string, TSFileNode>()
      for (const [fileName, node] of _nodes) {
        const parents: TSFileNode[] = []
        for (const [, n] of _nodes) {
          if (n.children.includes(node)) {
            parents.push(n)
          }
        }
        withParents.set(fileName, { ...node, parents })
      }
      _nodes.clear()
      for (const [k, v] of withParents) {
        _nodes.set(k, v)
      }
    }

    return _nodes
  }

  const check = async (mutants: Mutant[]): Promise<Diagnostic[]> => {
    for (const mutant of lastMutants) {
      await Effect.runPromise(fs.resetFile(mutant.fileName))
    }

    for (const mutant of mutants) {
      const file = await Effect.runPromise(fs.getFile(mutant.fileName))
      if (!file) {
        throw new Error(
          `Tried to check file "${mutant.fileName}" (which is part of your typescript project), but it could not be found.`,
        )
      }
      await Effect.runPromise(fs.mutateFile(mutant.fileName, mutant))
    }

    const mutatedFileNames = [
      ...new Set(mutants.map((m) => normalizeFileName(m.fileName))),
    ]

    const changedFiles = [
      ...new Set([...lastMutatedFileNames, ...mutatedFileNames]),
    ]

    if (api && snapshot) {
      const oldSnapshot = snapshot
      snapshot = api.updateSnapshot({
        openProjects: [...allTSConfigFiles],
        fileChanges: { changed: changedFiles },
      })
      oldSnapshot.dispose()
    }

    lastMutants = mutants
    lastMutatedFileNames = mutatedFileNames

    const programsWithDiagnostics = getPrograms()
    return programsWithDiagnostics.flatMap((program) => [
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getProgramDiagnostics(),
    ]).filter((diagnostic) => diagnostic.category === DiagnosticCategory.Error)
  }

  return {
    get nodes(): ReadonlyMap<string, TSFileNode> {
      return getNodes()
    },

    async init(): Promise<Diagnostic[]> {
      guardTSVersion()
      guardTSConfigFileExists()
      const buildModeEnabled = determineBuildModeEnabled(tsconfigFile)

      collectAllTSConfigFiles(buildModeEnabled)
      api = new API({ fs: fs.fileSystem })
      snapshot = api.updateSnapshot({
        openProjects: [...allTSConfigFiles],
      })

      const programs = getPrograms()
      buildDependencyGraph(programs)

      return check([])
    },

    check,

    close() {
      snapshot?.dispose()
      api?.close()
    },

    getLineAndCharacterOfPosition(
      fileName: string,
      position: number,
    ): { line: number; character: number } | undefined {
      for (const program of getPrograms()) {
        const sourceFile = program.getSourceFile(fileName)
        if (sourceFile) {
          return sourceFile.getLineAndCharacterOfPosition(position)
        }
      }
      return undefined
    },
  }
}
