import * as Effect from 'effect/Effect'
import * as Path from 'effect/Path'
import * as Struct from 'effect/Struct'
import type * as Ts from 'typescript'

import { TsConfigReadError } from '../errors/index.js'

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

/**
 * Resolves TypeScript from the package under analysis, mirroring upstream: the
 * engine must analyze with the consumer's own compiler (whose standard library —
 * and therefore global-name set — matches the one that generated the package's
 * committed reports), not with whatever copy the engine itself shipped with.
 */
const isTypeScriptModule = (u: unknown): u is typeof Ts =>
  typeof u === 'object' && u !== null && 'readConfigFile' in u && typeof u.readConfigFile === 'function'

const loadTypeScript = (
  consumerPackageJsonPath: string,
): Effect.Effect<typeof Ts, TsConfigReadError> => {
  const moduleBuiltin = process.getBuiltinModule('module')
  const requireFromConsumer = moduleBuiltin.createRequire(consumerPackageJsonPath)
  const candidates: readonly string[] = ['typescript/lib/typescript.js', 'typescript']
  for (const candidate of candidates) {
    let entry: string | undefined
    try {
      entry = requireFromConsumer.resolve(candidate)
    } catch {
      continue
    }
    try {
      const mod = requireFromConsumer(entry)
      if (isTypeScriptModule(mod)) {
        return Effect.succeed(mod)
      }
    } catch {
      continue
    }
  }
  return Effect.tryPromise({
    try: () => import('typescript'),
    catch: (cause) =>
      new TsConfigReadError({
        filePath: 'typescript',
        cause,
      }),
  })
}

const readTsConfig = (
  typescript: typeof Ts,
  path: Path.Path,
  tsconfigFilePath: string,
): Effect.Effect<Ts.ParsedCommandLine, TsConfigReadError> =>
  Effect.gen(function*() {
    const configFile = yield* Effect.try({
      try: () => typescript.readConfigFile(tsconfigFilePath, (p) => typescript.sys.readFile(p)),
      catch: (cause) =>
        new TsConfigReadError({
          filePath: tsconfigFilePath,
          cause,
        }),
    })
    if (configFile.error !== undefined) {
      const message = typescript.flattenDiagnosticMessageText(configFile.error.messageText, '\n')
      return yield* new TsConfigReadError({
        filePath: tsconfigFilePath,
        cause: new Error(message),
      })
    }
    const basePath = path.resolve(path.dirname(tsconfigFilePath))
    const parsed = yield* Effect.try({
      try: () =>
        typescript.parseJsonConfigFileContent(
          configFile.config,
          typescript.sys,
          basePath,
        ),
      catch: (cause) =>
        new TsConfigReadError({
          filePath: tsconfigFilePath,
          cause,
        }),
    })
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0]
      const messageText = firstError === undefined ? '' : firstError.messageText
      const message = typescript.flattenDiagnosticMessageText(messageText, '\n')
      return yield* new TsConfigReadError({
        filePath: tsconfigFilePath,
        cause: new Error(message),
      })
    }
    return parsed
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
  compilerOptions: Ts.CompilerOptions,
  typescriptCompilerFolder?: string,
): Ts.CompilerHost => {
  const compilerHost = typescript.createCompilerHost(compilerOptions)
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

export const loadCompilerState = (
  options: CompilerStateOptions,
): Effect.Effect<CompilerState, TsConfigReadError, Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const typescript = yield* loadTypeScript(path.join(options.projectFolder, 'package.json'))
    const commandLine = yield* readTsConfig(typescript, path, options.tsconfigFilePath)

    const cleanedOptions: Ts.CompilerOptions = Struct.omit(commandLine.options, ['outDir', 'declarationDir'])
    const compilerOptions: Ts.CompilerOptions = cleanedOptions.skipLibCheck !== true && options.skipLibCheck === true
      ? { ...cleanedOptions, skipLibCheck: true }
      : cleanedOptions

    const inputFiles = [
      ...commandLine.fileNames,
      options.mainEntryPointFilePath,
      ...(options.additionalEntryPoints ?? []),
    ]
    const analysisFiles = collectAnalysisFiles(inputFiles)
    const host = createCompilerHost(typescript, path, compilerOptions, options.typescriptCompilerFolder)
    const program = typescript.createProgram(analysisFiles, compilerOptions, host)

    return {
      compiler: typescript,
      program,
      typeChecker: program.getTypeChecker(),
      entryPoints: analysisFiles,
    }
  })
