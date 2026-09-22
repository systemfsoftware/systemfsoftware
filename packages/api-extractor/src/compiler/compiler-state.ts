import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import type * as Ts from 'typescript'

import { TsConfigReadError, TypeScriptDiagnosticError } from '../errors/index.js'

export interface CompilerStateOptions {
  readonly projectFolder: string
  readonly tsconfigFilePath: string
  readonly mainEntryPointFilePath: string
  readonly additionalEntryPoints?: readonly string[]
  readonly typescriptCompilerFolder?: string
  readonly skipLibCheck?: boolean
}

export interface CompilerState {
  readonly compiler: typeof Ts
  readonly program: Ts.Program
  readonly typeChecker: Ts.TypeChecker
  readonly entryPoints: readonly string[]
}

const loadTypeScript = (): Effect.Effect<typeof Ts, TsConfigReadError> =>
  Effect.tryPromise({
    try: () => import('typescript'),
    catch: (cause) =>
      new TsConfigReadError({
        filePath: 'typescript',
        cause,
      }),
  })

const readTsConfig = (
  typescript: typeof Ts,
  path: Path.Path,
  tsconfigFilePath: string,
): Effect.Effect<Ts.ParsedCommandLine, TsConfigReadError> =>
  Effect.try({
    try: () => {
      const configFile = typescript.readConfigFile(tsconfigFilePath, (p) => typescript.sys.readFile(p))
      if (configFile.error !== undefined) {
        const message = typescript.flattenDiagnosticMessageText(configFile.error.messageText, '\n')
        throw new Error(message)
      }
      const basePath = path.resolve(path.dirname(tsconfigFilePath))
      const parsed = typescript.parseJsonConfigFileContent(
        configFile.config,
        typescript.sys,
        basePath,
      )
      if (parsed.errors.length > 0) {
        const firstError = parsed.errors[0]
        const messageText = firstError === undefined ? '' : firstError.messageText
        const message = typescript.flattenDiagnosticMessageText(messageText, '\n')
        throw new Error(message)
      }
      return parsed
    },
    catch: (cause) =>
      new TsConfigReadError({
        filePath: tsconfigFilePath,
        cause,
      }),
  })

const declarationFilePattern = /\.d(\.[^./\\]+)?\.(c|m)?ts$/i

const hasDtsExtension = (filePath: string): boolean => declarationFilePattern.test(filePath)

const collectAnalysisFiles = (filePaths: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const filePath of filePaths) {
    const key = filePath.toUpperCase()
    if (!seen.has(key)) {
      seen.add(key)
      if (hasDtsExtension(filePath)) {
        result.push(filePath)
      }
    }
  }
  return result
}

const sourceExtensionPattern = /^(.+)(\.[a-z0-9_]+)$/i
const sourceExtensions: Readonly<Record<string, true>> = {
  '.ts': true,
  '.tsx': true,
  '.js': true,
  '.jsx': true,
}

const createCompilerHost = (
  typescript: typeof Ts,
  path: Path.Path,
  commandLine: Ts.ParsedCommandLine,
  typescriptCompilerFolder?: string,
): Ts.CompilerHost => {
  const compilerHost = typescript.createCompilerHost(commandLine.options)
  const defaultCompilerHost = { ...compilerHost }

  if (typescriptCompilerFolder !== undefined) {
    const libFolder = path.join(typescriptCompilerFolder, 'lib')
    compilerHost.getDefaultLibLocation = () => libFolder
  }

  const dtsExistsCache = new Map<string, boolean>()

  compilerHost.fileExists = (fileName: string): boolean => {
    if (!hasDtsExtension(fileName)) {
      const match = sourceExtensionPattern.exec(fileName)
      if (match !== null) {
        const pathWithoutExtension = match[1] ?? ''
        const ext = (match[2] ?? '').toLowerCase()
        if (sourceExtensions[ext] === true) {
          const dtsFileName = `${pathWithoutExtension}.d.ts`
          let dtsFileExists = dtsExistsCache.get(dtsFileName)
          if (dtsFileExists === undefined) {
            dtsFileExists = defaultCompilerHost.fileExists(dtsFileName)
            dtsExistsCache.set(dtsFileName, dtsFileExists)
          }
          if (dtsFileExists) {
            return false
          }
        }
      }
    }
    return defaultCompilerHost.fileExists(fileName)
  }

  return compilerHost
}

const mapDiagnostic = (
  typescript: typeof Ts,
  d: Ts.Diagnostic,
): { readonly file?: string; readonly line?: number; readonly message: string } => {
  const message = typescript.flattenDiagnosticMessageText(d.messageText, '\n')
  if (d.file === undefined || d.start === undefined) {
    return { message }
  }
  const { line } = d.file.getLineAndCharacterOfPosition(d.start)
  return {
    file: d.file.fileName,
    line: line + 1,
    message,
  }
}

const collectDiagnostics = (
  typescript: typeof Ts,
  program: Ts.Program,
): Effect.Effect<void, TypeScriptDiagnosticError> => {
  const optionsDiags = program.getOptionsDiagnostics()
  const globalDiags = program.getGlobalDiagnostics()
  const allDiags = [...optionsDiags, ...globalDiags]
  const errorDiags = allDiags.filter((d) => d.category === typescript.DiagnosticCategory.Error)

  if (errorDiags.length === 0) {
    return Effect.void
  }

  return Effect.fail(
    new TypeScriptDiagnosticError({
      diagnostics: errorDiags.map((d) => mapDiagnostic(typescript, d)),
    }),
  )
}

export const loadCompilerState = (
  options: CompilerStateOptions,
): Effect.Effect<CompilerState, TsConfigReadError | TypeScriptDiagnosticError, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const typescript = yield* loadTypeScript()
    const commandLine = yield* readTsConfig(typescript, path, options.tsconfigFilePath)

    delete commandLine.options.outDir
    delete commandLine.options.declarationDir

    if (commandLine.options.skipLibCheck !== true && options.skipLibCheck === true) {
      commandLine.options.skipLibCheck = true
    }

    const inputFiles = [
      ...commandLine.fileNames,
      options.mainEntryPointFilePath,
      ...(options.additionalEntryPoints ?? []),
    ]
    const analysisFiles = collectAnalysisFiles(inputFiles)
    const host = createCompilerHost(typescript, path, commandLine, options.typescriptCompilerFolder)
    const program = typescript.createProgram(analysisFiles, commandLine.options, host)

    yield* collectDiagnostics(typescript, program)

    return {
      compiler: typescript,
      program,
      typeChecker: program.getTypeChecker(),
      entryPoints: analysisFiles,
    }
  })
