import { Effect } from 'effect'
import ts from 'typescript'
import type { Problem } from '../../Types.js'
import { getResolutionOption } from '../../Utils.js'
import { defineCheck } from '../DefineCheck.js'
import { type Export, getProbableExports } from '../GetProbableExports.js'
import type { CompilerHost } from '../MultiCompilerHost.js'

const bindOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.Latest,
  allowJs: true,
  checkJs: true,
}

export default defineCheck({
  name: 'ExportDefaultDisagreement',
  dependencies: ({ entrypoints, subpath, resolutionKind, programInfo }) => {
    const entrypoint = entrypoints[subpath].resolutions[resolutionKind]
    const typesFileName = entrypoint.resolution?.fileName
    const implementationFileName = entrypoint.implementationResolution?.fileName
    if (
      (typesFileName &&
        programInfo[getResolutionOption(resolutionKind)].moduleKinds?.[typesFileName]?.detectedKind ===
          ts.ModuleKind.ESNext) ||
      (implementationFileName &&
        programInfo[getResolutionOption(resolutionKind)].moduleKinds?.[implementationFileName]?.detectedKind ===
          ts.ModuleKind.ESNext)
    ) {
      return []
    }
    return [typesFileName, implementationFileName]
  },
  gather: ([typesFileName, implementationFileName], context) =>
    Effect.gen(function*() {
      if (!typesFileName || !implementationFileName || !ts.hasTSFileExtension(typesFileName)) {
        return undefined
      }
      const host: CompilerHost | undefined = context.hosts.findHostForFiles([typesFileName])
      if (!host) {
        return undefined
      }
      const typesSourceFile = host.getSourceFile(typesFileName)
      if (!typesSourceFile) {
        return undefined
      }
      const implementationSourceFile = host.getSourceFile(implementationFileName)
      if (!implementationSourceFile) {
        return undefined
      }
      ts.bindSourceFile(typesSourceFile, bindOptions)
      ts.bindSourceFile(implementationSourceFile, bindOptions)
      if (!typesSourceFile.symbol?.exports || !implementationSourceFile.symbol?.exports) {
        return undefined
      }
      if (implementationSourceFile.externalModuleIndicator) {
        return undefined
      }

      // Both checkers are built eagerly after the cheap guards; the per-host
      // capacity-2 Cache holds the impl+types pair for the current matrix cell.
      const implChecker = (yield* host.createAuxiliaryProgram([implementationFileName])).getTypeChecker()
      const typesChecker = (yield* host.createAuxiliaryProgram([typesFileName])).getTypeChecker()

      return {
        typesFileName,
        implementationFileName,
        typesSourceFile,
        implementationSourceFile,
        typesExports: typesSourceFile.symbol.exports,
        implementationExports: implementationSourceFile.symbol.exports,
        implChecker,
        typesChecker,
      }
    }),
  execute: ([_typesFileName, _implementationFileName], _context, gathered) => {
    if (!gathered) {
      return
    }
    return analyzeExportDefaultDisagreement(gathered)
  },
})

interface DisagreementAnalysis {
  typesFileName: string
  implementationFileName: string
  typesSourceFile: ts.SourceFile
  implementationSourceFile: ts.SourceFile
  typesExports: ts.SymbolTable
  implementationExports: ts.SymbolTable
  implChecker: ts.TypeChecker
  typesChecker: ts.TypeChecker
}

interface AnalysisMemo {
  implProbableExports?: Export[]
  implHasDefault?: boolean
  implTypeOfModuleExports?: ts.Type
  implExportEqualsIsExportDefault?: boolean
  typesDefaultSymbol?: ts.Symbol
  typesTypeOfDefault?: ts.Type
}

function analyzeExportDefaultDisagreement(input: DisagreementAnalysis): Problem | undefined {
  const memo: AnalysisMemo = {}
  const typesHaveSyntacticDefault = input.typesExports.has(ts.InternalSymbolName.Default)

  if (typesHaveSyntacticDefault && !getImplHasDefault(input, memo) && implIsAnalyzable(input, memo)) {
    return {
      kind: 'FalseExportDefault',
      typesFileName: input.typesFileName,
      implementationFileName: input.implementationFileName,
    }
  }

  if (!getImplHasDefault(input, memo) || !implIsAnalyzable(input, memo)) {
    return
  }

  if (
    !input.typesExports.has(ts.InternalSymbolName.ExportEquals) &&
    input.implementationExports.has(ts.InternalSymbolName.ExportEquals) &&
    getTypesDefaultSymbol(input, memo) &&
    ((getImplExportEqualsIsExportDefault(input, memo) &&
      input.typesChecker.typeHasCallOrConstructSignatures(getTypesTypeOfDefault(input, memo))) ||
      input.implChecker.typeHasCallOrConstructSignatures(getImplTypeOfModuleExports(input, memo)))
  ) {
    return {
      kind: 'MissingExportEquals',
      typesFileName: input.typesFileName,
      implementationFileName: input.implementationFileName,
    }
  }

  const typesHaveNonDefaultValueExport = Array.from(input.typesExports.values()).some((s) => {
    if (s.escapedName === 'default') {
      return false
    }
    if (s.flags & ts.SymbolFlags.Value) {
      return true
    }
    while (s.flags & ts.SymbolFlags.Alias) {
      s = input.typesChecker.getAliasedSymbol(s)
      if (s.flags & ts.SymbolFlags.Value) {
        return true
      }
    }
    return false
  })

  if (
    !typesHaveNonDefaultValueExport &&
    typeIsObjecty(getTypesTypeOfDefault(input, memo), input.typesChecker) &&
    (Array.from(input.implementationExports.keys()).some((name) =>
      isNotDefaultOrEsModule(ts.unescapeLeadingUnderscores(name))
    ) ||
      getImplProbableExports(input, memo).some(({ name }) => isNotDefaultOrEsModule(name))) &&
    getTypesDefaultSymbol(input, memo)
  ) {
    return {
      kind: 'MissingExportEquals',
      typesFileName: input.typesFileName,
      implementationFileName: input.implementationFileName,
    }
  }
}

function getImplProbableExports(input: DisagreementAnalysis, memo: AnalysisMemo): Export[] {
  if (memo.implProbableExports === undefined) {
    memo.implProbableExports = getProbableExports(input.implementationSourceFile)
  }
  return memo.implProbableExports
}

function getImplHasDefault(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  if (memo.implHasDefault === undefined) {
    memo.implHasDefault = input.implementationExports.has(ts.InternalSymbolName.Default) === true ||
      getImplProbableExports(input, memo).some((s) => s.name === 'default') ||
      (!!input.implementationExports.size &&
        input.implChecker
          .getExportsAndPropertiesOfModule(input.implementationSourceFile.symbol)
          .some((s) => s.name === 'default'))
  }
  return memo.implHasDefault
}

function implIsAnalyzable(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  const exportEquals = input.implementationExports.get(ts.InternalSymbolName.ExportEquals)
  if (exportEquals?.declarations?.length && exportEquals.declarations.length > 1) {
    let commonContainer
    for (const decl of exportEquals.declarations) {
      const container = ts.findAncestor(decl, (node) => isFunctionBlock(node) || ts.isSourceFile(node))
      if (commonContainer === undefined) {
        commonContainer = container
      } else if (commonContainer !== container) {
        return false
      }
    }
  }
  return !!(input.implementationExports.size || getImplProbableExports(input, memo).length)
}

function getTypesDefaultSymbol(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Symbol | undefined {
  if (memo.typesDefaultSymbol === undefined) {
    memo.typesDefaultSymbol = input.typesExports.get(ts.InternalSymbolName.Default) ??
      input.typesChecker
        .getExportsAndPropertiesOfModule(input.typesSourceFile.symbol)
        .find((s) => s.escapedName === 'default')
  }
  return memo.typesDefaultSymbol
}

function getTypesTypeOfDefault(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Type {
  if (memo.typesTypeOfDefault === undefined) {
    const symbol = getTypesDefaultSymbol(input, memo)
    memo.typesTypeOfDefault = symbol
      ? input.typesChecker.getTypeOfSymbol(symbol)
      : input.typesChecker.getAnyType()
  }
  return memo.typesTypeOfDefault
}

function getImplTypeOfModuleExports(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Type {
  if (memo.implTypeOfModuleExports === undefined) {
    const checker = input.implChecker
    const type = checker.getTypeOfSymbol(
      checker.resolveExternalModuleSymbol(input.implementationSourceFile.symbol),
    )
    if (type.flags & ts.TypeFlags.Any && getImplExportEqualsIsExportDefault(input, memo)) {
      const defaultSymbol = input.implementationExports.get(ts.InternalSymbolName.Default)
      if (defaultSymbol) {
        const defaultType = checker.getTypeOfSymbol(defaultSymbol)
        if (!(defaultType.flags & ts.TypeFlags.Any)) {
          memo.implTypeOfModuleExports = defaultType
          return memo.implTypeOfModuleExports
        }
      }
    }
    memo.implTypeOfModuleExports = type
  }
  return memo.implTypeOfModuleExports
}

function getImplExportEqualsIsExportDefault(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  if (memo.implExportEqualsIsExportDefault === undefined) {
    const exportEquals = input.implementationExports.get(ts.InternalSymbolName.ExportEquals)
    if (!exportEquals?.declarations?.[0]) {
      memo.implExportEqualsIsExportDefault = false
    } else {
      const decl = exportEquals.declarations[0]
      if (ts.isExportAssignment(decl) && decl.expression) {
        const target = decl.expression
        if (isModuleExports(target) || isExportsDefault(target)) {
          memo.implExportEqualsIsExportDefault = true
        } else {
          let found = false
          if (ts.isBinaryExpression(target)) {
            forEachAssignmentTarget(target, (t) => {
              if (isModuleExports(t) || isExportsDefault(t)) {
                found = true
                return true
              }
            })
          }
          memo.implExportEqualsIsExportDefault = found
        }
      } else {
        memo.implExportEqualsIsExportDefault = false
      }
    }
  }
  return memo.implExportEqualsIsExportDefault
}

function typeIsObjecty(type: ts.Type, checker: ts.TypeChecker): boolean {
  return !!(type.flags & ts.TypeFlags.Object) && !checker.typeHasCallOrConstructSignatures(type)
}

function isModuleExports(target: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(target) &&
    target.name.text === 'exports' &&
    ts.isIdentifier(target.expression) &&
    target.expression.text === 'module'
  )
}

function isExportsDefault(target: ts.Expression): boolean {
  return (
    (ts.isPropertyAccessExpression(target) &&
      target.name.text === 'default' &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === 'exports') ||
    (ts.isElementAccessExpression(target) &&
      target.argumentExpression &&
      ts.isStringLiteralLike(target.argumentExpression) &&
      target.argumentExpression.text === 'default' &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === 'exports')
  )
}

function isNotDefaultOrEsModule(name: string): boolean {
  return name !== 'default' && name !== '__esModule'
}

function forEachAssignmentTarget<ReturnT>(
  assignment: ts.BinaryExpression,
  cb: (target: ts.Expression) => ReturnT | undefined,
): ReturnT | undefined {
  if (!ts.isBinaryExpression(assignment) || assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return
  }
  const target = assignment.left
  const result = cb(target)
  if (result !== undefined) {
    return result
  }
  if (ts.isBinaryExpression(assignment.right) && assignment.right.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return forEachAssignmentTarget(assignment.right, cb)
  }
}
