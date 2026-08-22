import { init as initCjsLexer } from 'cjs-module-lexer'
import { Effect, MutableHashMap, Option } from 'effect'
import type { Package } from './CreatePackage.js'
import checks from './internal/checks/index.js'
import type { AnyCheck, CheckDependenciesContext } from './internal/DefineCheck.js'
import { getBuildTools, getEntrypointInfo, getModuleKinds } from './internal/GetEntrypointInfo.js'
import { createCompilerHosts } from './internal/MultiCompilerHost.js'
import type {
  AnalysisTypes,
  CheckResult,
  EntrypointResolutionAnalysis,
  Problem,
  ProgramInfo,
  ResolutionOption,
} from './Types.js'
import { getResolutionOption, visitResolutions } from './Utils.js'

export interface CheckPackageOptions {
  entrypoints?: string[]
  includeEntrypoints?: string[]
  excludeEntrypoints?: (string | RegExp)[]
  entrypointsLegacy?: boolean
}

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((entry) => typeof entry === 'string')
}

function getHomepage(pkg: Package, packageName: string): string | undefined {
  const packageJson: unknown = JSON.parse(pkg.readFile(`/node_modules/${packageName}/package.json`))
  if (typeof packageJson !== 'object' || packageJson === null || !('homepage' in packageJson)) {
    return undefined
  }
  return typeof packageJson.homepage === 'string' ? packageJson.homepage : undefined
}

function getDevDependencies(pkg: Package, packageName: string): { devDependencies?: Record<string, string> } {
  const packageJson: unknown = JSON.parse(pkg.readFile(`/node_modules/${packageName}/package.json`))
  if (typeof packageJson !== 'object' || packageJson === null || !('devDependencies' in packageJson)) {
    return {}
  }
  return isStringRecord(packageJson.devDependencies) ? { devDependencies: packageJson.devDependencies } : {}
}

export const checkPackage = (pkg: Package, options?: CheckPackageOptions): Effect.Effect<CheckResult, Error> =>
  Effect.gen(function*() {
    const types: AnalysisTypes | false = pkg.typesPackage
      ? {
        kind: '@types',
        ...pkg.typesPackage,
        definitelyTypedUrl: getHomepage(pkg, pkg.typesPackage.packageName),
      }
      : pkg.containsTypes()
      ? { kind: 'included' }
      : false
    const { packageName, packageVersion } = pkg
    if (!types) {
      return { packageName, packageVersion, types }
    }

    const hosts = yield* createCompilerHosts(pkg)
    const entrypointResolutions = yield* getEntrypointInfo(packageName, pkg, hosts, options)
    const programInfo: Record<ResolutionOption, ProgramInfo> = {
      node10: {},
      node16: { moduleKinds: getModuleKinds(entrypointResolutions, 'node16', hosts) },
      bundler: {},
    }

    yield* Effect.tryPromise({
      try: () => initCjsLexer(),
      catch: (cause) => new Error('Analysis failed', { cause }),
    })

    const problems: Problem[] = []
    const problemIdsToIndices = MutableHashMap.empty<string, number[]>()

    // Collect cells first because visitResolutions is pure and synchronous;
    // we need an array to drive Effect.forEach over.
    const cells: { analysis: EntrypointResolutionAnalysis; info: { subpath: string } }[] = []
    visitResolutions(entrypointResolutions, (analysis, info) => {
      cells.push({ analysis, info })
    })

    yield* Effect.forEach(cells, ({ analysis, info }) =>
      Effect.gen(function*() {
        for (const check of checks) {
          const context = {
            pkg,
            hosts,
            entrypoints: entrypointResolutions,
            programInfo,
            subpath: info.subpath,
            resolutionKind: analysis.resolutionKind,
            resolutionOption: getResolutionOption(analysis.resolutionKind),
            fileName: undefined,
          }
          if (check.enumerateFiles) {
            for (const fileName of analysis.files ?? []) {
              yield* runCheck(check, { ...context, fileName }, analysis)
            }
            if (analysis.implementationResolution) {
              yield* runCheck(check, { ...context, fileName: analysis.implementationResolution.fileName }, analysis)
            }
          } else {
            yield* runCheck(check, context, analysis)
          }
        }
      }), { discard: true })

    return {
      packageName,
      packageVersion,
      types,
      buildTools: getBuildTools(getDevDependencies(pkg, packageName)),
      entrypoints: entrypointResolutions,
      programInfo,
      problems,
    }

    function runCheck(
      check: AnyCheck,
      context: CheckDependenciesContext<boolean>,
      analysis: EntrypointResolutionAnalysis,
    ): Effect.Effect<void> {
      return Effect.gen(function*() {
        const dependencies = check.dependencies(context)
        const id = check.name +
          JSON.stringify(dependencies, (_, value: unknown) => {
            if (typeof value === 'function') {
              throw new Error('Encountered unexpected function in check dependencies')
            }
            return value
          })
        const existing = MutableHashMap.get(problemIdsToIndices, id)
        if (Option.isSome(existing)) {
          ;(analysis.visibleProblems ??= []).push(...existing.value)
          return
        }
        const indices: number[] = []
        const gathered = check.gather ? yield* check.gather(dependencies, context) : undefined
        const checkProblems = check.execute(dependencies, context, gathered)
        for (const problem of Array.isArray(checkProblems) ? checkProblems : checkProblems ? [checkProblems] : []) {
          indices.push(problems.length)
          problems.push(problem)
        }
        MutableHashMap.set(problemIdsToIndices, id, indices)
        ;(analysis.visibleProblems ??= []).push(...indices)
      })
    }
  })
