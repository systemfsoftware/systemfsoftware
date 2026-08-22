import { Cache, Effect, MutableHashMap, Option } from 'effect'
import ts from 'typescript'
import type { Package } from '../CreatePackage.js'
import type { ModuleKind } from '../Types.js'
import minimalLibDts from './MinimalLibDts.js'

export interface ResolveModuleNameResult {
  resolution: ts.ResolvedModuleWithFailedLookupLocations
  trace: string[]
}

export interface CompilerHost {
  readonly getCompilerOptions: () => ts.CompilerOptions
  readonly getSourceFile: (fileName: string) => ts.SourceFile | undefined
  readonly getSourceFileFromCache: (fileName: string) => ts.SourceFile | undefined
  readonly getModuleKindForFile: (fileName: string) => ModuleKind | undefined
  readonly resolveModuleName: (
    moduleName: string,
    containingFile: string,
    resolutionMode?: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS,
    noDtsResolution?: boolean,
    allowJs?: boolean,
  ) => ResolveModuleNameResult
  readonly getTrace: (
    fromFileName: string,
    moduleSpecifier: string,
    resolutionMode: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined,
  ) => string[] | undefined
  readonly getResolvedModule: (
    sourceFile: ts.SourceFile,
    moduleName: string,
    resolutionMode: ts.ResolutionMode,
  ) => ts.ResolvedModuleWithFailedLookupLocations | undefined
  readonly createPrimaryProgram: (rootName: string) => Effect.Effect<ts.Program>
  readonly createAuxiliaryProgram: (
    rootNames: string[],
    extraOptions?: ts.CompilerOptions,
  ) => Effect.Effect<ts.Program>
}

export interface CompilerHosts {
  readonly node10: CompilerHost
  readonly node16: CompilerHost
  readonly bundler: CompilerHost
  readonly findHostForFiles: (files: string[]) => CompilerHost | undefined
}

export const createCompilerHosts = (pkg: Package): Effect.Effect<CompilerHosts> =>
  Effect.gen(function*() {
    const node10 = yield* makeCompilerHost(pkg, ts.ModuleResolutionKind.Node10, ts.ModuleKind.CommonJS)
    const node16 = yield* makeCompilerHost(pkg, ts.ModuleResolutionKind.Node16, ts.ModuleKind.Node16)
    const bundler = yield* makeCompilerHost(pkg, ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext)

    return {
      node10,
      node16,
      bundler,
      findHostForFiles(files: string[]) {
        for (const host of [node10, node16, bundler]) {
          if (files.every((f) => host.getSourceFileFromCache(f) !== undefined)) {
            return host
          }
        }
        return undefined
      },
    }
  })

const getCanonicalFileName = ts.createGetCanonicalFileName(false)
const toPath = (fileName: string) => ts.toPath(fileName, '/', getCanonicalFileName)

const makeCompilerHost = (
  pkg: Package,
  moduleResolution: ts.ModuleResolutionKind,
  moduleKind: ts.ModuleKind,
): Effect.Effect<CompilerHost> =>
  Effect.gen(function*() {
    const compilerOptions: ts.CompilerOptions = {
      moduleResolution,
      module: moduleKind,
      moduleDetection: ts.ModuleDetectionKind.Legacy,
      target: ts.ScriptTarget.Latest,
      resolveJsonModule: true,
      traceResolution: true,
    }

    const normalModuleResolutionCache = ts.createModuleResolutionCache('/', getCanonicalFileName, compilerOptions)
    const noDtsResolutionModuleResolutionCache = ts.createModuleResolutionCache(
      '/',
      getCanonicalFileName,
      compilerOptions,
    )

    const moduleResolutionCache: Record<
      string,
      Record<string, { resolution: ts.ResolvedModuleWithFailedLookupLocations; trace: string[] }>
    > = {}
    const sourceFileCache = MutableHashMap.empty<ts.Path, ts.SourceFile>()
    const resolvedModules: MutableHashMap.MutableHashMap<
      ts.Path,
      ts.ModeAwareCache<ts.ResolvedModuleWithFailedLookupLocations>
    > = MutableHashMap.empty()
    const languageVersion = ts.ScriptTarget.Latest

    const traces: string[] = []
    const trace = (message: string): void => {
      traces.push(message)
    }
    const readTraces = (): string[] => {
      const result = traces.slice()
      traces.length = 0
      return result
    }
    const clearTraces = (): void => {
      traces.length = 0
    }

    let compilerHost!: ts.CompilerHost

    const getModuleKey = (
      moduleSpecifier: string,
      resolutionMode: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined,
      noDtsResolution: boolean | undefined,
      allowJs: boolean | undefined,
    ): string => `${resolutionMode ?? 1}:${+!!noDtsResolution}:${+!!allowJs}:${moduleSpecifier}`

    const getImpliedNodeFormatForFile = (
      fileName: string,
    ): ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined =>
      ts.getImpliedNodeFormatForFile(
        toPath(fileName),
        normalModuleResolutionCache.getPackageJsonInfoCache(),
        compilerHost,
        compilerOptions,
      )

    const getPackageScopeForPath = (fileName: string): ts.PackageJsonInfo | undefined =>
      ts.getPackageScopeForPath(
        fileName,
        ts.getTemporaryModuleResolutionState(
          normalModuleResolutionCache.getPackageJsonInfoCache(),
          compilerHost,
          compilerOptions,
        ),
      )

    const resolveModuleName = (
      moduleName: string,
      containingFile: string,
      resolutionMode?: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS,
      noDtsResolution?: boolean,
      allowJs?: boolean,
    ): ResolveModuleNameResult => {
      const moduleKey = getModuleKey(moduleName, resolutionMode, noDtsResolution, allowJs)
      if (moduleResolutionCache[containingFile]?.[moduleKey]) {
        const { resolution, trace: cachedTrace } = moduleResolutionCache[containingFile][moduleKey]
        return {
          resolution,
          trace: cachedTrace,
        }
      }
      clearTraces()
      const resolution = ts.resolveModuleName(
        moduleName,
        containingFile,
        noDtsResolution ? { ...compilerOptions, noDtsResolution, allowJs } : compilerOptions,
        compilerHost,
        noDtsResolution ? noDtsResolutionModuleResolutionCache : normalModuleResolutionCache,
        undefined,
        resolutionMode,
      )
      const traceResult = readTraces()
      if (!moduleResolutionCache[containingFile]?.[moduleKey]) {
        ;(moduleResolutionCache[containingFile] ??= {})[moduleKey] = { resolution, trace: traceResult }
      }
      return {
        resolution,
        trace: traceResult,
      }
    }

    const createCompilerHostObject = (): ts.CompilerHost => ({
      fileExists: pkg.fileExists.bind(pkg),
      readFile: pkg.readFile.bind(pkg),
      directoryExists: pkg.directoryExists.bind(pkg),
      getSourceFile: (fileName) => {
        const path = toPath(fileName)
        const cachedOption = MutableHashMap.get(sourceFileCache, path)
        if (Option.isSome(cachedOption)) {
          return cachedOption.value
        }
        const content = fileName === '/node_modules/typescript/lib/lib.d.ts' ? minimalLibDts : pkg.tryReadFile(fileName)
        if (content === undefined) {
          return undefined
        }

        const sourceFile = ts.createSourceFile(
          fileName,
          content,
          {
            languageVersion,
            impliedNodeFormat: getImpliedNodeFormatForFile(fileName),
          },
          true,
        )
        MutableHashMap.set(sourceFileCache, path, sourceFile)
        return sourceFile
      },
      getDefaultLibFileName: () => '/node_modules/typescript/lib/lib.d.ts',
      getCurrentDirectory: () => '/',
      writeFile: () => {
        throw new Error('Not implemented')
      },
      getCanonicalFileName,
      useCaseSensitiveFileNames: () => false,
      getNewLine: () => '\n',
      trace,
      resolveModuleNameLiterals: (
        moduleLiterals,
        containingFile,
        _redirectedReference,
        options,
        containingSourceFile,
      ) =>
        moduleLiterals.map(
          (literal) =>
            resolveModuleName(
              literal.text,
              containingFile,
              ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions),
              options.noDtsResolution,
            ).resolution,
        ),
    })

    compilerHost = createCompilerHostObject()

    const programKeyMap = MutableHashMap.empty<string, [readonly string[], ts.CompilerOptions]>()
    const programCache = yield* Cache.make<string, ts.Program>({
      capacity: 2,
      lookup: (key) =>
        Effect.gen(function*() {
          const entry = MutableHashMap.get(programKeyMap, key)
          if (Option.isNone(entry)) {
            return yield* Effect.die(new Error(`Missing program key: ${key}`))
          }
          const [rootNames, options] = entry.value
          return ts.createProgram({
            rootNames: [...rootNames],
            options,
            host: compilerHost,
          })
        }),
    })

    const getProgram = (rootNames: readonly string[], options: ts.CompilerOptions): Effect.Effect<ts.Program> => {
      const key = programKey(rootNames, options)
      MutableHashMap.set(programKeyMap, key, [rootNames, options])
      return Cache.get(programCache, key)
    }
    const getCompilerOptions = (): ts.CompilerOptions => compilerOptions

    const getSourceFile = (fileName: string): ts.SourceFile | undefined =>
      compilerHost.getSourceFile(fileName, languageVersion)

    const getSourceFileFromCache = (fileName: string): ts.SourceFile | undefined =>
      Option.getOrUndefined(MutableHashMap.get(sourceFileCache, toPath(fileName)))

    const getModuleKindForFile = (fileName: string): ModuleKind | undefined => {
      const kind = getImpliedNodeFormatForFile(fileName)
      if (kind) {
        const extension = ts.getAnyExtensionFromPath(fileName)
        const isExtension = extension === ts.Extension.Cjs ||
          extension === ts.Extension.Cts ||
          extension === ts.Extension.Dcts ||
          extension === ts.Extension.Mjs ||
          extension === ts.Extension.Mts ||
          extension === ts.Extension.Dmts
        const reasonPackageJsonInfo = isExtension ? undefined : getPackageScopeForPath(fileName)
        const reasonFileName = isExtension
          ? fileName
          : reasonPackageJsonInfo
          ? reasonPackageJsonInfo.packageDirectory + '/package.json'
          : fileName
        const reasonPackageJsonType = reasonPackageJsonInfo?.contents?.packageJsonContent.type
        return {
          detectedKind: kind,
          detectedReason: isExtension ? 'extension' : reasonPackageJsonType ? 'type' : 'no:type',
          reasonFileName,
        }
      }
      return undefined
    }

    const getTrace = (
      fromFileName: string,
      moduleSpecifier: string,
      resolutionMode: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS | undefined,
    ): string[] | undefined =>
      moduleResolutionCache[fromFileName]?.[
        getModuleKey(moduleSpecifier, resolutionMode, undefined, undefined)
      ]?.trace

    const getResolvedModule = (
      sourceFile: ts.SourceFile,
      moduleName: string,
      resolutionMode: ts.ResolutionMode,
    ): ts.ResolvedModuleWithFailedLookupLocations | undefined => {
      const cacheOption = MutableHashMap.get(resolvedModules, sourceFile.path)
      if (Option.isNone(cacheOption)) {
        return undefined
      }
      return cacheOption.value.get(moduleName, resolutionMode)
    }

    const createPrimaryProgram = (rootName: string): Effect.Effect<ts.Program> =>
      Effect.gen(function*() {
        const program = yield* getProgram([rootName], compilerOptions)

        program.resolvedModules?.forEach((cache, path) => {
          const ownCacheOption = MutableHashMap.get(resolvedModules, path)
          const ownCache = Option.isSome(ownCacheOption) ? ownCacheOption.value : ts.createModeAwareCache()
          if (Option.isNone(ownCacheOption)) {
            MutableHashMap.set(resolvedModules, path, ownCache)
          }
          cache.forEach((resolution, key, mode) => {
            ownCache.set(key, mode, resolution)
          })
        })

        return program
      })

    const createAuxiliaryProgram = (
      rootNames: string[],
      extraOptions?: ts.CompilerOptions,
    ): Effect.Effect<ts.Program> =>
      Effect.gen(function*() {
        if (
          extraOptions &&
          ts.changesAffectModuleResolution(
            {
              ...compilerOptions,
              allowJs: extraOptions.allowJs,
              checkJs: extraOptions.checkJs,
              noDtsResolution: extraOptions.noDtsResolution,
            },
            { ...compilerOptions, ...extraOptions },
          )
        ) {
          return yield* Effect.die(
            new Error('Cannot override resolution-affecting options for host due to potential cache pollution'),
          )
        }
        const options = extraOptions ? { ...compilerOptions, ...extraOptions } : compilerOptions
        return yield* getProgram(rootNames, options)
      })
    return {
      getCompilerOptions,
      getSourceFile,
      getSourceFileFromCache,
      getModuleKindForFile,
      resolveModuleName,
      getTrace,
      getResolvedModule,
      createPrimaryProgram,
      createAuxiliaryProgram,
    }
  })

function programKey(rootNames: readonly string[], options: ts.CompilerOptions): string {
  return JSON.stringify([rootNames, Object.entries(options).sort(([k1], [k2]) => k1.localeCompare(k2))])
}
