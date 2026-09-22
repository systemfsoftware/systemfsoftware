import {
  ConsoleMessageId,
  ConsoleMessageWriter,
  makeMessageRouter,
  MessageWriter,
} from '@systemfsoftware/api-extractor'
import { Differential, Metamorphic } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import * as Ts from 'typescript'
import {
  type CompilerTargetPair,
  compilerTargetPairs,
  nonEmptyIdentifiers,
} from './__fixtures__/vendor-pins-arbitraries.js'

interface TsCompilationOutput {
  readonly version: string
  readonly parsedFileCount: number
  readonly diagnosticCount: number
  readonly hasExportSymbol: boolean
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

  const libDirectory = Ts.sys.getExecutingFilePath().replace(/[/\\][^/\\]+$/, '')

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
      const content = host.readFile(fileName) ?? Ts.sys.readFile(fileName)
      return content === undefined ? undefined : Ts.createSourceFile(fileName, content, languageVersion, true)
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
  reference: pinnedTsReference,
  candidate: liveTsCandidate,
})
  .on(compilerTargetPairs, { runBudget: 10, interruptAfterTimeLimit: 30_000 })
  .assert((pinned, live) =>
    pinned.version === live.version &&
    pinned.parsedFileCount === live.parsedFileCount &&
    pinned.diagnosticCount === live.diagnosticCount &&
    pinned.hasExportSymbol === live.hasExportSymbol
  )

interface WriterRunOutput {
  readonly didThrow: boolean
  readonly captured: string
}

const runRouterWithConsoleWriter = (message: string): Effect.Effect<WriterRunOutput> =>
  Effect.sync(() => {
    let captured = ''
    const originalStdoutWrite = process.stdout.write.bind(process.stdout)

    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }

    let didThrow = false
    try {
      const router = Effect.runSync(
        makeMessageRouter({ cliFlags: { verbose: true } }).pipe(
          Effect.provideService(
            MessageWriter,
            ConsoleMessageWriter,
          ),
        ),
      )

      Effect.runSync(router.logInfo(ConsoleMessageId.Preamble, message))
    } catch {
      didThrow = true
    } finally {
      process.stdout.write = originalStdoutWrite
    }

    return { didThrow, captured }
  })

Metamorphic.on(runRouterWithConsoleWriter)
  .relation({
    transformInput: (msg) => `transformed_${msg}`,
    assertOutput: (baseline, transformed) =>
      !baseline.didThrow &&
      !transformed.didThrow &&
      baseline.captured.includes('\n') &&
      transformed.captured.includes('transformed_'),
  })
  .on(nonEmptyIdentifiers, { runBudget: 15, interruptAfterTimeLimit: 30_000 })
