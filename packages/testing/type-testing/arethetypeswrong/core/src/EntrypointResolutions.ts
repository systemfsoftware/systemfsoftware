import { resolvedThroughFallback } from './Fallback.js'
import { ESNextModuleKind } from './ModuleKind.js'
import { type EntrypointResolutionAnalysis, type ModuleKind, type Problem } from './Problem.schema.js'

export interface EntrypointResolutionsInput {
  readonly subpath: string
  readonly entrypoint: EntrypointResolutionAnalysis
  readonly node16ModuleKinds: Record<string, ModuleKind> | undefined
}

export const detectEntrypointResolutions = (
  input: EntrypointResolutionsInput,
): readonly Problem[] => {
  const { subpath, entrypoint, node16ModuleKinds } = input
  const problems: Problem[] = []
  if (entrypoint.isWildcard) {
    return problems
  }

  if (!entrypoint.resolution) {
    problems.push({
      kind: 'NoResolution',
      entrypoint: subpath,
      resolutionKind: entrypoint.resolutionKind,
    })
  } else if (!entrypoint.resolution.isTypeScript && !entrypoint.resolution.isJson) {
    problems.push({
      kind: 'UntypedResolution',
      entrypoint: subpath,
      resolutionKind: entrypoint.resolutionKind,
    })
  }

  if (entrypoint.resolutionKind === 'node16-cjs') {
    const typesModuleKind = entrypoint.resolution && node16ModuleKinds
      ? node16ModuleKinds[entrypoint.resolution.fileName]
      : undefined
    const implModuleKind = entrypoint.implementationResolution && node16ModuleKinds
      ? node16ModuleKinds[entrypoint.implementationResolution.fileName]
      : undefined
    const isTypesESM = typesModuleKind?.detectedKind === ESNextModuleKind
    const isImplESM = implModuleKind?.detectedKind === ESNextModuleKind
    if (isTypesESM || isImplESM) {
      problems.push({
        kind: 'CJSResolvesToESM',
        entrypoint: subpath,
        resolutionKind: entrypoint.resolutionKind,
      })
    }
  }

  if (entrypoint.resolution && resolvedThroughFallback(entrypoint.resolution.trace)) {
    problems.push({
      kind: 'FallbackCondition',
      entrypoint: subpath,
      resolutionKind: entrypoint.resolutionKind,
    })
  }

  return problems
}
