import { Differential } from '@systemfsoftware/differential-spec'
import * as Effect from 'effect/Effect'
import * as Ts from 'typescript'
import { type CompilerTargetPair, compilerTargetPairs } from './__fixtures__/vendor-pins-arbitraries.js'

interface TsCompilationOutput {
  readonly version: string
  readonly parsedFileCount: number
  readonly diagnosticCount: number
  readonly hasExportSymbol: boolean
}

const libDirectory = Ts.sys.getExecutingFilePath().replace(/[/\\][^/\\]+$/, '')

const libSourceFiles = new Map<string, Ts.SourceFile>()

const libSourceFileOf = (
  fileName: string,
  languageVersion: Ts.ScriptTarget | Ts.CreateSourceFileOptions,
): Ts.SourceFile | undefined => {
  const key = `${JSON.stringify(languageVersion)}\0${fileName}`
  const cached = libSourceFiles.get(key)
  if (cached !== undefined) return cached
  const content = Ts.sys.readFile(fileName) ?? Ts.sys.readFile(`${libDirectory}/${fileName}`)
  if (content === undefined) return undefined
  const sourceFile = Ts.createSourceFile(fileName, content, languageVersion, true)
  libSourceFiles.set(key, sourceFile)
  return sourceFile
}

const compileTsVirtual = (
  pair: CompilerTargetPair,
  identifierName: string,
): TsCompilationOutput => {
  const tsconfigContent = JSON.stringify({
    compilerOptions: {
      target: pair.target,
      module: pair.module,
      declaration: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ['index.ts'],
  })
  const indexContent =
    `export const ${identifierName} = 42\nexport type ${identifierName}Type = typeof ${identifierName}\n`

  const files: Readonly<Record<string, string>> = {
    '/virtual/tsconfig.json': tsconfigContent,
    '/virtual/index.ts': indexContent,
  }

  const host: Ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    readDirectory: () => ['/virtual/index.ts'],
    fileExists: (fileName) => fileName in files || Ts.sys.fileExists(`${libDirectory}/${fileName}`),
    readFile: (fileName) => files[fileName] ?? Ts.sys.readFile(`${libDirectory}/${fileName}`),
  }

  const readResult = Ts.readConfigFile('/virtual/tsconfig.json', (fileName) => host.readFile(fileName))
  const parsedConfig = Ts.parseJsonConfigFileContent(
    readResult.config,
    host,
    '/virtual',
    undefined,
    '/virtual/tsconfig.json',
  )

  const compilerHost: Ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const content = files[fileName]
      return content === undefined
        ? libSourceFileOf(fileName, languageVersion)
        : Ts.createSourceFile(fileName, content, languageVersion, true)
    },
    getDefaultLibFileName: (options) => Ts.getDefaultLibFileName(options),
    getDefaultLibLocation: () => libDirectory,
    writeFile: () => {},
    getCurrentDirectory: () => '/virtual',
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (fileName) => fileName in files || Ts.sys.fileExists(fileName),
    readFile: (fileName) => files[fileName] ?? Ts.sys.readFile(fileName),
  }

  const program = Ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    host: compilerHost,
    configFileParsingDiagnostics: parsedConfig.errors,
  })

  const diagnostics = Ts.getPreEmitDiagnostics(program)
  const sourceFile = program.getSourceFile('/virtual/index.ts')

  return {
    version: Ts.version,
    parsedFileCount: parsedConfig.fileNames.length,
    diagnosticCount: diagnostics.length,
    hasExportSymbol: sourceFile !== undefined && sourceFile.text.includes(identifierName),
  }
}

const pinnedTsReference = (_pair: CompilerTargetPair): Effect.Effect<TsCompilationOutput> =>
  Effect.succeed({
    version: '5.9.3',
    parsedFileCount: 1,
    diagnosticCount: 0,
    hasExportSymbol: true,
  })

const liveTsCandidate = (pair: CompilerTargetPair): Effect.Effect<TsCompilationOutput> =>
  Effect.sync(() => compileTsVirtual(pair, 'pinItem'))

Differential.compare({
  name: 'the pinned TypeScript compiler and the installed one agree on a virtual project',
  reference: pinnedTsReference,
  candidate: liveTsCandidate,
})
  .on(compilerTargetPairs, {
    runBudget: 10,
    hostBound: {
      timeout: 30_000,
      reason: 'the live side compiles a virtual project with the installed TypeScript compiler',
    },
  })
  .assert((pinned, live) =>
    pinned.version === live.version &&
    pinned.parsedFileCount === live.parsedFileCount &&
    pinned.diagnosticCount === live.diagnosticCount &&
    pinned.hasExportSymbol === live.hasExportSymbol
  )
