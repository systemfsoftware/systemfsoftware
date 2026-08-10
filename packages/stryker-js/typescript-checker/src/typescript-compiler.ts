import { readFileSync } from 'fs'
import path from 'path'

import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Either } from 'effect'
import { type SourceFile, SyntaxKind } from 'typescript/unstable/ast'
import type { FileSystem } from 'typescript/unstable/fs'
import { API, type Diagnostic, type DocumentIdentifier, type Program, type Snapshot } from 'typescript/unstable/sync'

import { TSFileNode } from './grouping/ts-file-node.js'
import * as pluginTokens from './plugin-tokens.js'
import { HybridFileSystem } from './project/index.js'
import {
  determineBuildModeEnabled,
  getSourceMappingURL,
  guardTSVersion,
  overrideOptions,
  parseTsConfig,
  retrieveReferencedProjects,
  toPosixFileName,
} from './tsconfig-helpers.js'

export interface ITypescriptCompiler {
  init(): Promise<Diagnostic[]>
  check(mutants: Mutant[]): Promise<Diagnostic[]>
}

export interface IFileRelationCreator {
  get nodes(): Map<string, TSFileNode>
}

export type SourceFiles = Map<
  string,
  {
    fileName: string
    imports: Set<string>
  }
>

export class TypescriptCompiler implements ITypescriptCompiler, IFileRelationCreator {
  public static inject = tokens(
    commonTokens.logger,
    commonTokens.options,
    pluginTokens.fs,
  )

  private readonly allTSConfigFiles: Set<string>
  private readonly tsconfigFile: string
  private api?: API
  private snapshot?: Snapshot
  private readonly sourceFiles: SourceFiles = new Map()
  private readonly _nodes = new Map<string, TSFileNode>()
  private lastMutants: Mutant[] = []
  private lastMutatedFileNames: string[] = []

  constructor(
    private readonly log: Logger,
    private readonly options: StrykerOptions,
    private readonly fs: HybridFileSystem,
  ) {
    this.tsconfigFile = toPosixFileName(
      path.resolve(toPosixFileName(this.options.tsconfigFile)),
    )
    this.allTSConfigFiles = new Set<string>([this.tsconfigFile])
  }

  public async init(): Promise<Diagnostic[]> {
    guardTSVersion()
    this.guardTSConfigFileExists()
    const buildModeEnabled = determineBuildModeEnabled(this.tsconfigFile)

    this.collectAllTSConfigFiles(buildModeEnabled)
    this.api = new API({ fs: this.fs as FileSystem })
    this.snapshot = this.api.updateSnapshot({
      openProjects: [...this.allTSConfigFiles],
    })

    const programs = this.getPrograms()
    this.buildDependencyGraph(programs)

    return this.check([])
  }

  public async check(mutants: Mutant[]): Promise<Diagnostic[]> {
    // Reset previous mutations
    for (const mutant of this.lastMutants) {
      this.fs.resetFile(mutant.fileName)
    }

    // Apply new mutations
    for (const mutant of mutants) {
      const file = this.fs.getFile(mutant.fileName)
      if (!file) {
        throw new Error(
          `Tried to check file "${mutant.fileName}" (which is part of your typescript project), but it could not be found.`,
        )
      }
      file.mutate(mutant)
    }

    const mutatedFileNames = [
      ...new Set(mutants.map((m) => toPosixFileName(m.fileName))),
    ]

    const changedFiles = [
      ...new Set([...this.lastMutatedFileNames, ...mutatedFileNames]),
    ]

    if (this.api && this.snapshot) {
      const oldSnapshot = this.snapshot
      this.snapshot = this.api.updateSnapshot({
        openProjects: [...this.allTSConfigFiles],
        fileChanges: { changed: changedFiles },
      })
      oldSnapshot.dispose()
    }

    this.lastMutants = mutants
    this.lastMutatedFileNames = mutatedFileNames

    const programs = this.getPrograms()
    return programs.flatMap((program) => [
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getProgramDiagnostics(),
    ])
  }

  public get nodes(): Map<string, TSFileNode> {
    if (!this._nodes.size) {
      // create nodes
      for (const [fileName] of this.sourceFiles) {
        const node = new TSFileNode(fileName, [], [])
        this._nodes.set(fileName, node)
      }

      // set children
      for (const [fileName, file] of this.sourceFiles) {
        const node = this._nodes.get(fileName)
        if (node == null) {
          throw new Error(
            `Node for file '${fileName}' could not be found. This should not happen.`,
          )
        }

        node.children = [...file.imports]
          .map((importName) => this._nodes.get(importName))
          .filter((n): n is TSFileNode => n != null)
      }

      // set parents
      for (const [, node] of this._nodes) {
        node.parents = []
        for (const [, n] of this._nodes) {
          if (n.children.includes(node)) {
            node.parents.push(n)
          }
        }
      }
    }

    return this._nodes
  }

  public close(): void {
    this.snapshot?.dispose()
    this.api?.close()
  }

  public getLineAndCharacterOfPosition(
    fileName: string,
    position: number,
  ): { line: number; character: number } | undefined {
    for (const program of this.getPrograms()) {
      const sourceFile = program.getSourceFile(fileName as DocumentIdentifier)
      if (sourceFile) {
        return sourceFile.getLineAndCharacterOfPosition(position)
      }
    }
    return undefined
  }

  private getPrograms(): Program[] {
    if (!this.snapshot) {
      throw new Error('TypescriptCompiler not initialized')
    }
    const projects = this.snapshot.getProjects()
    if (projects.length === 0) {
      throw new Error(`No projects found for ${this.tsconfigFile}`)
    }
    return projects.map((project) => project.program)
  }

  private collectAllTSConfigFiles(buildModeEnabled: boolean): void {
    const tsConfigOverrides = new Map<string, string>()
    const toProcess = [this.tsconfigFile]
    const processed = new Set<string>()

    while (toProcess.length > 0) {
      const current = toProcess.pop()
      if (!current || processed.has(current)) {
        continue
      }
      processed.add(current)

      const content = readFileSync(current, 'utf-8')
      const parsed = parseTsConfig(current, content)
      if (Either.isLeft(parsed)) {
        this.log.warn(
          `Could not parse tsconfig file "%s": %s. Compiler-option overrides and project-reference walking were skipped for this file, so mutants may be misreported as compile errors.`,
          current,
          parsed.left.reason,
        )
        tsConfigOverrides.set(current, content)
        continue
      }
      tsConfigOverrides.set(current, overrideOptions(parsed.right, buildModeEnabled))

      for (
        const referenced of retrieveReferencedProjects(
          parsed.right,
          path.dirname(current),
        )
      ) {
        this.allTSConfigFiles.add(referenced)
        toProcess.push(referenced)
      }
    }

    this.fs.tsConfigOverrides = tsConfigOverrides
  }

  private buildDependencyGraph(programs: Program[]): void {
    for (const program of programs) {
      for (const fileName of program.getSourceFileNames()) {
        if (
          fileName.endsWith('.d.ts') ||
          fileName.includes('node_modules')
        ) {
          continue
        }
        const normalized = toPosixFileName(fileName)
        this.sourceFiles.set(normalized, {
          fileName: normalized,
          imports: new Set(),
        })
      }
    }

    for (const [fileName] of this.sourceFiles) {
      const sourceFile = programs
        .map((p) => p.getSourceFile(fileName as DocumentIdentifier))
        .find((sf) => sf != null)
      if (!sourceFile) {
        continue
      }
      const imports = this.extractImports(sourceFile)
      for (const specifier of imports) {
        const resolved = this.resolveModuleSpecifier(fileName, specifier)
        if (resolved) {
          const sourceFileName = this.resolveTSInputFile(resolved)
          if (this.sourceFiles.has(sourceFileName)) {
            this.sourceFiles.get(fileName)?.imports.add(sourceFileName)
          }
        }
      }
    }
  }

  private extractImports(sourceFile: SourceFile): string[] {
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

  private resolveModuleSpecifier(
    sourceFileName: string,
    specifier: string,
  ): string | undefined {
    const cleaned = specifier.replace(/^['"]|['"]$/g, '')
    if (!cleaned.startsWith('./') && !cleaned.startsWith('../')) {
      return undefined
    }
    const baseDir = path.dirname(sourceFileName)
    const resolved = toPosixFileName(path.resolve(baseDir, cleaned))

    const candidates = this.getResolutionCandidates(resolved)
    for (const candidate of candidates) {
      if (this.sourceFiles.has(candidate)) {
        return candidate
      }
    }

    return undefined
  }

  private getResolutionCandidates(resolved: string): string[] {
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

  private resolveTSInputFile(dependencyFileName: string): string {
    if (!dependencyFileName.endsWith('.d.ts')) {
      return dependencyFileName
    }

    const file = this.fs.getFile(dependencyFileName)
    if (!file) {
      return dependencyFileName
    }

    const sourceMappingURL = getSourceMappingURL(file.content)
    if (!sourceMappingURL) {
      return dependencyFileName
    }

    const sourceMapFileName = toPosixFileName(
      path.resolve(path.dirname(dependencyFileName), sourceMappingURL),
    )
    const sourceMap = this.fs.getFile(sourceMapFileName)
    if (!sourceMap) {
      this.log.warn(`Could not find sourcemap ${sourceMapFileName}`)
      return dependencyFileName
    }

    const sourceMapParsed = JSON.parse(sourceMap.content) as {
      sources?: string[]
    }
    const sources = sourceMapParsed.sources

    if (sources?.length === 1) {
      const [sourcePath] = sources
      return toPosixFileName(
        path.resolve(path.dirname(sourceMapFileName), sourcePath!),
      )
    }

    return dependencyFileName
  }

  private guardTSConfigFileExists(): void {
    try {
      readFileSync(this.tsconfigFile, 'utf-8')
    } catch {
      throw new Error(
        `The tsconfig file does not exist at: "${this.tsconfigFile}". Please configure the tsconfig file in your stryker.conf file using "tsconfigFile"`,
      )
    }
  }
}
