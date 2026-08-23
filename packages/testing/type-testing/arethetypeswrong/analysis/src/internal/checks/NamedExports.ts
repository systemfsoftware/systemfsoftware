import { Effect } from 'effect'
import ts from 'typescript'
import { getResolutionOption } from '../../Utils.js'
import { defineCheck } from '../DefineCheck.js'
import { getEsmModuleNamespace } from '../esm/EsmNamespace.js'

/** @internal */
export default defineCheck({
  name: 'NamedExports',
  dependencies: ({ entrypoints, subpath, resolutionKind, programInfo }) => {
    const entrypoint = entrypoints[subpath].resolutions[resolutionKind]
    const typesFileName = entrypoint.resolution?.isTypeScript && entrypoint.resolution.fileName
    const resolutionOption = getResolutionOption(resolutionKind)
    const typesModuleKind = typesFileName ? programInfo[resolutionOption].moduleKinds?.[typesFileName] : undefined
    const implementationFileName = entrypoint.implementationResolution?.fileName
    const implementationModuleKind = implementationFileName
      ? programInfo[resolutionOption].moduleKinds?.[implementationFileName]
      : undefined
    return [implementationFileName, implementationModuleKind, typesFileName, typesModuleKind, resolutionKind]
  },
  gather: (
    [implementationFileName, implementationModuleKind, typesFileName, typesModuleKind, resolutionKind],
    context,
  ) =>
    Effect.gen(function*() {
      if (
        !implementationFileName ||
        !typesFileName ||
        resolutionKind !== 'node16-esm' ||
        typesModuleKind?.detectedKind !== ts.ModuleKind.CommonJS ||
        implementationModuleKind?.detectedKind !== ts.ModuleKind.CommonJS
      ) {
        return undefined
      }

      const host = context.hosts.findHostForFiles([typesFileName])
      if (!host) {
        return undefined
      }
      const typesSourceFile = host.getSourceFile(typesFileName)
      if (!typesSourceFile || typesSourceFile.scriptKind === ts.ScriptKind.JSON || !typesSourceFile.symbol) {
        return undefined
      }

      const program = yield* host.createAuxiliaryProgram([typesFileName])
      const typeChecker = program.getTypeChecker()
      return { typesSourceFile, typeChecker, typesFileName, implementationFileName }
    }),
  execute: (_deps, context, gathered) => {
    if (!gathered) {
      return
    }
    const { typesSourceFile, typeChecker, typesFileName, implementationFileName } = gathered

    const moduleType = typeChecker.getTypeOfSymbol(typeChecker.resolveExternalModuleSymbol(typesSourceFile.symbol))
    if (typeChecker.isArrayLikeType(moduleType) || typeChecker.getPropertyOfType(moduleType, '0')) {
      return
    }
    const expectedNames = Array.from(
      new Set(
        typeChecker
          .getExportsAndPropertiesOfModule(typesSourceFile.symbol)
          .filter((symbol) => {
            return (
              symbol.name !== 'prototype' &&
              // @ts-expect-error `getSymbolFlags` extra arguments are not declared on TypeChecker
              typeChecker.getSymbolFlags(symbol, true) & ts.SymbolFlags.Value
            )
          })
          .map((symbol) => symbol.name),
      ),
    )

    let exports: readonly string[] | undefined
    try {
      exports = getEsmModuleNamespace(context.pkg, implementationFileName)
    } catch {
      return
    }

    if (!exports) {
      return
    }
    const missing = expectedNames.filter((name) => !exports.includes(name))
    if (missing.length > 0) {
      const lengthWithoutDefault = (names: readonly string[]) => names.length - (names.includes('default') ? 1 : 0)
      return {
        kind: 'NamedExports',
        implementationFileName,
        typesFileName,
        isMissingAllNamed: lengthWithoutDefault(missing) === lengthWithoutDefault(expectedNames),
        missing,
      }
    }
  },
})
