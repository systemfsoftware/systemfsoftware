import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type * as Ts from 'typescript'

import type { CompilerHostOptions, CompilerLoadOptions } from '../compiler/typescript-compiler.service.js'
import { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import { shadowingDeclaration } from '../compiler/typescript-program.js'
import { TsCompilerLoadError, TsConfigReadError } from '../errors/index.js'

type MemberKind = 'function' | 'object' | 'string'

const moduleProbes: readonly (readonly [member: string, kind: MemberKind])[] = [
  ['readConfigFile', 'function'],
  ['parseJsonConfigFileContent', 'function'],
  ['createCompilerHost', 'function'],
  ['createProgram', 'function'],
  ['flattenDiagnosticMessageText', 'function'],
  ['sys', 'object'],
  ['version', 'string'],
]

const memberHolds = (candidate: object, member: string, kind: MemberKind): boolean =>
  member in candidate && typeof Reflect.get(candidate, member) === kind

const isObjectCandidate = (candidate: unknown): candidate is object =>
  Match.value({ object: typeof candidate === 'object', nonNull: candidate !== null }).pipe(
    Match.when({ object: true, nonNull: true }, () => true),
    Match.orElse(() => false),
  )

const holdsProbes = (candidate: object): boolean =>
  Arr.every(moduleProbes, (probe) => memberHolds(candidate, probe[0], probe[1]))

export const isTypeScriptModule = (candidate: unknown): candidate is typeof Ts =>
  isObjectCandidate(candidate) && holdsProbes(candidate)

interface RequireFrom {
  (specifier: string): object
  resolve: (specifier: string) => string
}

/**
 * Resolves TypeScript from the package under analysis, mirroring upstream: the engine must
 * analyze with the consumer's own compiler (whose standard library — and therefore
 * global-name set — matches the one that generated the package's committed reports), not with
 * whatever copy the engine itself shipped with.
 */
const consumerEntryCandidates = ['typescript/lib/typescript.js', 'typescript'] as const

const folderEntryCandidates = ['.'] as const

const requireFrom = (packageJsonPath: string): RequireFrom =>
  process.getBuiltinModule('module').createRequire(packageJsonPath)

const requireCandidate = Option.liftThrowable((loader: RequireFrom, candidate: string): object =>
  loader(loader.resolve(candidate)))

const loadCandidate = (loader: RequireFrom, candidate: string): Option.Option<typeof Ts> =>
  Option.flatMap(requireCandidate(loader, candidate), (loaded) =>
    Option.filter(Option.some(loaded), isTypeScriptModule))

const noneCompiler: Option.Option<typeof Ts> = Option.none()

const firstCompiler = (loader: RequireFrom, candidates: readonly string[]): Option.Option<typeof Ts> =>
  Arr.reduce<string, Option.Option<typeof Ts>>(candidates, noneCompiler, (found, candidate) =>
    Option.match(found, {
      onSome: Option.some,
      onNone: () => loadCandidate(loader, candidate),
    }))

const compilerOf = (
  found: Option.Option<typeof Ts>,
  refusal: (modulePath: string) => TsCompilerLoadError,
  modulePath: string,
): Effect.Effect<typeof Ts, TsCompilerLoadError> => Effect.fromOption(found, () => refusal(modulePath))

const loadCompilerFromFolder = (folderPackageJsonPath: string): Effect.Effect<typeof Ts, TsCompilerLoadError> =>
  Effect.flatMap(
    Effect.sync(() => firstCompiler(requireFrom(folderPackageJsonPath), folderEntryCandidates)),
    (found) =>
      compilerOf(found, (modulePath) => {
        return new TsCompilerLoadError({
          modulePath,
          message: 'No usable TypeScript compiler package found in this folder',
        })
      }, folderPackageJsonPath),
  )

const loadEngineBundledFallback = (): Effect.Effect<typeof Ts, TsCompilerLoadError> =>
  Effect.flatMap(
    Effect.tryPromise({
      // The compiler loads lazily so importing this driver stays free of it until a run needs it.
      try: () => import('typescript'),
      catch: (cause) =>
        new TsCompilerLoadError({
          modulePath: 'typescript',
          message: 'Unable to load the TypeScript compiler',
          cause,
        }),
    }),
    (mod) =>
      Effect.fromOption(
        Option.filter(Option.some(mod), isTypeScriptModule),
        () =>
          new TsCompilerLoadError({
            modulePath: 'typescript',
            message: 'The loaded module does not expose the TypeScript compiler API',
          }),
      ),
  )

const bundledCompilerRefusal = (): TsCompilerLoadError =>
  new TsCompilerLoadError({
    modulePath: 'typescript',
    message: 'Unable to load the TypeScript compiler',
  })

const loadCompilerFromConsumer = (consumerPackageJsonPath: string): Effect.Effect<typeof Ts, TsCompilerLoadError> =>
  Effect.flatMap(
    Effect.sync(() => firstCompiler(requireFrom(consumerPackageJsonPath), consumerEntryCandidates)),
    (found) =>
      Effect.matchEffect(Effect.fromOption(found, bundledCompilerRefusal), {
        onFailure: () => loadEngineBundledFallback(),
        onSuccess: Effect.succeed,
      }),
  )

const diagnosticText = (typescript: typeof Ts, diagnostic: Ts.Diagnostic): string =>
  typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

interface ConfigFileRead {
  readonly config?: object
  readonly error?: Ts.Diagnostic
}

const configFileOf = (
  typescript: typeof Ts,
  tsconfigFilePath: string,
): Effect.Effect<ConfigFileRead, TsConfigReadError> =>
  Effect.flatMap(
    Effect.try({
      try: () => typescript.readConfigFile(tsconfigFilePath, (p) => typescript.sys.readFile(p)),
      catch: (cause) => new TsConfigReadError({ filePath: tsconfigFilePath, cause }),
    }),
    (configFile) =>
      Option.match(Option.fromNullishOr(configFile.error), {
        onNone: () => Effect.succeed(configFile),
        onSome: (error) =>
          Effect.fail(
            new TsConfigReadError({
              filePath: tsconfigFilePath,
              cause: new Error(diagnosticText(typescript, error)),
            }),
          ),
      }),
  )

const parsedOf = (
  typescript: typeof Ts,
  tsconfigFilePath: string,
  configFile: ConfigFileRead,
  path: Path.Path,
): Effect.Effect<Ts.ParsedCommandLine, TsConfigReadError> =>
  Effect.flatMap(
    Effect.try({
      try: () =>
        typescript.parseJsonConfigFileContent(configFile.config, typescript.sys, path.resolve(path.dirname(tsconfigFilePath))),
      catch: (cause) => new TsConfigReadError({ filePath: tsconfigFilePath, cause }),
    }),
    (parsed) =>
      Option.match(Arr.head(parsed.errors), {
        onNone: () => Effect.succeed(parsed),
        onSome: (firstError) =>
          Effect.fail(
            new TsConfigReadError({
              filePath: tsconfigFilePath,
              cause: new Error(diagnosticText(typescript, firstError)),
            }),
          ),
      }),
  )

const fileExistsProbe = (defaultHost: Ts.CompilerHost, fileName: string): boolean =>
  Option.match(shadowingDeclaration(fileName), {
    onNone: () => defaultHost.fileExists(fileName),
    onSome: (declaration) => defaultHost.fileExists(declaration) ? false : defaultHost.fileExists(fileName),
  })

const createProgram = (
  typescript: typeof Ts,
  files: readonly string[],
  compilerOptions: Ts.CompilerOptions,
  host: Ts.CompilerHost,
): Ts.Program => typescript.createProgram(files, compilerOptions, host)

export const layer: Layer.Layer<TypeScriptCompiler> = Layer.provide(
  Layer.effect(
    TypeScriptCompiler,
    Effect.gen(function*() {
    const path = yield* Path.Path
    const loadCompiler = (options: CompilerLoadOptions): Effect.Effect<typeof Ts, TsCompilerLoadError> =>
      Option.match(Option.fromNullishOr(options.typescriptCompilerFolder), {
        onNone: () => loadCompilerFromConsumer(path.join(options.projectFolder, 'package.json')),
        onSome: (folder) => loadCompilerFromFolder(path.join(folder, 'package.json')),
      })
    const readTsconfig = (
      typescript: typeof Ts,
      tsconfigFilePath: string,
    ): Effect.Effect<Ts.ParsedCommandLine, TsConfigReadError> =>
      Effect.flatMap(configFileOf(typescript, tsconfigFilePath), (configFile) =>
        parsedOf(typescript, tsconfigFilePath, configFile, path))
    const makeHost = (typescript: typeof Ts, options: CompilerHostOptions): Effect.Effect<Ts.CompilerHost> =>
      Effect.sync(() => {
        const host = typescript.createCompilerHost(options.compilerOptions)
        const defaultHost = { ...host }
        const withProbe: Ts.CompilerHost = {
          ...host,
          fileExists: (fileName: string) => fileExistsProbe(defaultHost, fileName),
        }
        return Option.match(Option.fromNullishOr(options.typescriptCompilerFolder), {
          onNone: () => withProbe,
          onSome: (folder) => ({ ...withProbe, getDefaultLibLocation: () => path.join(folder, 'lib') }),
        })
      })
    return { loadCompiler, readTsconfig, makeHost, createProgram }
    }),
  ),
  NodeServices.layer,
)
