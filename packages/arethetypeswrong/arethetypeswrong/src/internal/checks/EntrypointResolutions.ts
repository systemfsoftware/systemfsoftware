import ts from 'typescript'
import type { Problem } from '../../Types.js'
import { resolvedThroughFallback } from '../../Utils.js'
import { defineCheck } from '../DefineCheck.js'

/** @internal */
export default defineCheck({
  name: 'EntrypointResolutions',
  dependencies: ({ subpath, resolutionKind }) => [subpath, resolutionKind],
  execute: ([subpath, resolutionKind], context) => {
    const problems: Problem[] = []
    const entrypoint = context.entrypoints[subpath].resolutions[resolutionKind]
    if (entrypoint.isWildcard) {
      return
    }

    if (!entrypoint.resolution) {
      problems.push({
        kind: 'NoResolution',
        entrypoint: subpath,
        resolutionKind,
      })
    } else if (!entrypoint.resolution.isTypeScript && !entrypoint.resolution.isJson) {
      problems.push({
        kind: 'UntypedResolution',
        entrypoint: subpath,
        resolutionKind,
      })
    }

    const moduleKinds = context.programInfo['node16'].moduleKinds
    if (
      resolutionKind === 'node16-cjs' &&
      ((!entrypoint.implementationResolution &&
        entrypoint.resolution &&
        moduleKinds?.[entrypoint.resolution.fileName]?.detectedKind === ts.ModuleKind.ESNext) ||
        (entrypoint.implementationResolution &&
          moduleKinds?.[entrypoint.implementationResolution.fileName]?.detectedKind === ts.ModuleKind.ESNext))
    ) {
      problems.push({
        kind: 'CJSResolvesToESM',
        entrypoint: subpath,
        resolutionKind,
      })
    }

    if (entrypoint.resolution && resolvedThroughFallback(entrypoint.resolution.trace)) {
      problems.push({
        kind: 'FallbackCondition',
        entrypoint: subpath,
        resolutionKind,
      })
    }

    return problems
  },
})
