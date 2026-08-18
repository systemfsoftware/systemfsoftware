import ts from 'typescript'
import type { Problem } from '../../Types.js'
import { getResolutionOption } from '../../Utils.js'
import { defineCheck } from '../DefineCheck.js'
import { type Export, getProbableExports } from '../GetProbableExports.js'
import { type CompilerHostWrapper } from '../MultiCompilerHost.js'

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
  execute: ([typesFileName, implementationFileName], context) => {
    // Technically, much of this implementation should go in `dependencies`, since
    // different resolution modes can result in different program graphs, resulting
    // in different types, which are queried heavily here. However, it would be much
    // more expensive to run this type-heavy code in `dependencies`, where it would
    // reevaluate for every entrypoint/resolution matrix cell, when chances are
    // extremely high that a given pair of types/implementation files are intended
    // to act the same under all resolution modes.
    if (!typesFileName || !implementationFileName || !ts.hasTSFileExtension(typesFileName)) {
      return
    }
    const host = context.hosts.findHostForFiles([typesFileName])
    if (!host) {
      return
    }
    const typesSourceFile = host.getSourceFile(typesFileName)
    if (!typesSourceFile) {
      return
    }
    const implementationSourceFile = host.getSourceFile(implementationFileName)
    if (!implementationSourceFile) {
      return
    }
    ts.bindSourceFile(typesSourceFile, bindOptions)
    ts.bindSourceFile(implementationSourceFile, bindOptions)
    if (!typesSourceFile.symbol?.exports || !implementationSourceFile.symbol?.exports) {
      return
    }
    if (implementationSourceFile.externalModuleIndicator) {
      return
    }
    return analyzeExportDefaultDisagreement({
      host,
      typesFileName,
      implementationFileName,
      typesSourceFile,
      implementationSourceFile,
      typesExports: typesSourceFile.symbol.exports,
      implementationExports: implementationSourceFile.symbol.exports,
    })
  },
})

interface DisagreementAnalysis {
  host: CompilerHostWrapper
  typesFileName: string
  implementationFileName: string
  typesSourceFile: ts.SourceFile
  implementationSourceFile: ts.SourceFile
  typesExports: ts.SymbolTable
  implementationExports: ts.SymbolTable
}

interface AnalysisMemo {
  implProbableExports?: Export[]
  implChecker?: ts.TypeChecker
  implHasDefault?: boolean
  implTypeOfModuleExports?: ts.Type
  implExportEqualsIsExportDefault?: boolean
  typesChecker?: ts.TypeChecker
  typesDefaultSymbol?: ts.Symbol
  typesTypeOfDefault?: ts.Type
}

function analyzeExportDefaultDisagreement(input: DisagreementAnalysis): Problem | undefined {
  const memo: AnalysisMemo = {}
  const typesHaveSyntacticDefault = input.typesExports.has(ts.InternalSymbolName.Default)

  // FalseExportDefault: types have a default, JS doesn't.
  // For this check, we're going to require the types to have a top-level
  // default export, which means we might miss something like:
  //
  // declare namespace foo {
  //   const _default: string;
  //   export { _default as default };
  // }
  // export = foo;
  //
  // But that's not a mistake people really make. If we don't need to
  // recognize that pattern, we can avoid creating a program and checker
  // for this error.
  if (typesHaveSyntacticDefault && !getImplHasDefault(input, memo) && implIsAnalyzable(input, memo)) {
    return {
      kind: 'FalseExportDefault',
      typesFileName: input.typesFileName,
      implementationFileName: input.implementationFileName,
    }
  }

  if (!getImplHasDefault(input, memo) || !implIsAnalyzable(input, memo)) {
    // The implementation not having a default doesn't necessarily mean the
    // following checks are irrelevant, but this rule is designed primarily
    // to catch cases where type definition authors correctly notice that
    // their implementation has a `module.exports.default`, but don't realize
    // that the same object is exposed as `module.exports`. We bail early
    // here primarily because these checks are expensive.
    return
  }

  // MissingExportEquals: types and JS have a default, but JS also has a
  // module.exports = not reflected in the types.
  if (
    !input.typesExports.has(ts.InternalSymbolName.ExportEquals) &&
    input.implementationExports.has(ts.InternalSymbolName.ExportEquals) &&
    getTypesDefaultSymbol(input, memo) &&
    ((getImplExportEqualsIsExportDefault(input, memo) &&
      getTypesChecker(input, memo).typeHasCallOrConstructSignatures(getTypesTypeOfDefault(input, memo))) ||
      getImplChecker(input, memo).typeHasCallOrConstructSignatures(getImplTypeOfModuleExports(input, memo)))
  ) {
    return {
      kind: 'MissingExportEquals',
      typesFileName: input.typesFileName,
      implementationFileName: input.implementationFileName,
    }
  }

  // TODO: does not account for export *
  const typesHaveNonDefaultValueExport = Array.from(input.typesExports.values()).some((s) => {
    if (s.escapedName === 'default') {
      return false
    }
    if (s.flags & ts.SymbolFlags.Value) {
      return true
    }
    while (s.flags & ts.SymbolFlags.Alias) {
      s = getTypesChecker(input, memo).getAliasedSymbol(s)
      if (s.flags & ts.SymbolFlags.Value) {
        return true
      }
    }
  })

  if (
    !typesHaveNonDefaultValueExport &&
    typeIsObjecty(getTypesTypeOfDefault(input, memo), getTypesChecker(input, memo)) &&
    (Array.from(input.implementationExports.keys()).some((name) =>
      isNotDefaultOrEsModule(ts.unescapeLeadingUnderscores(name))
    ) ||
      getImplProbableExports(input, memo).some(({ name }) => isNotDefaultOrEsModule(name))) &&
    getTypesDefaultSymbol(input, memo)
  ) {
    // Here, the types have a lone default export of a non-callable object,
    // and the implementation has multiple named exports along with `default`,
    // with the types' default intended as the object shape of `module.exports`.
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

function getImplChecker(input: DisagreementAnalysis, memo: AnalysisMemo): ts.TypeChecker {
  if (memo.implChecker === undefined) {
    memo.implChecker = input.host.createAuxiliaryProgram([input.implementationFileName]).getTypeChecker()
  }
  return memo.implChecker
}

function getImplHasDefault(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  if (memo.implHasDefault === undefined) {
    memo.implHasDefault = input.implementationExports.has(ts.InternalSymbolName.Default) === true ||
      getImplProbableExports(input, memo).some((s) => s.name === 'default') ||
      (!!input.implementationExports.size &&
        getImplChecker(input, memo)
          .getExportsAndPropertiesOfModule(input.implementationSourceFile.symbol)
          .some((s) => s.name === 'default'))
  }
  return memo.implHasDefault
}

function implIsAnalyzable(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  const exportEquals = input.implementationExports.get(ts.InternalSymbolName.ExportEquals)
  if (exportEquals?.declarations?.length && exportEquals.declarations.length > 1) {
    // Multiple assignments in different function bodies is probably a bundle we can't analyze.
    // Multiple assignments in the same function body might just be an environment-conditional
    // module.exports inside an IIFE.
    let commonContainer
    for (const decl of exportEquals.declarations) {
      const container = ts.findAncestor(decl, (node) => ts.isFunctionBlock(node) || ts.isSourceFile(node))
      if (commonContainer === undefined) {
        commonContainer = container
      } else if (commonContainer !== container) {
        return false
      }
    }
  }
  return !!(input.implementationExports.size || getImplProbableExports(input, memo).length)
}

function getTypesChecker(input: DisagreementAnalysis, memo: AnalysisMemo): ts.TypeChecker {
  if (memo.typesChecker === undefined) {
    memo.typesChecker = input.host.createAuxiliaryProgram([input.typesFileName]).getTypeChecker()
  }
  return memo.typesChecker
}

function getTypesDefaultSymbol(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Symbol | undefined {
  if (memo.typesDefaultSymbol === undefined) {
    memo.typesDefaultSymbol = input.typesExports.get(ts.InternalSymbolName.Default) ??
      getTypesChecker(input, memo)
        .getExportsAndPropertiesOfModule(input.typesSourceFile.symbol)
        .find((s) => s.escapedName === 'default')
  }
  return memo.typesDefaultSymbol
}

function getTypesTypeOfDefault(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Type {
  if (memo.typesTypeOfDefault === undefined) {
    const symbol = getTypesDefaultSymbol(input, memo)
    memo.typesTypeOfDefault = symbol
      ? getTypesChecker(input, memo).getTypeOfSymbol(symbol)
      : getTypesChecker(input, memo).getAnyType()
  }
  return memo.typesTypeOfDefault
}

function getImplTypeOfModuleExports(input: DisagreementAnalysis, memo: AnalysisMemo): ts.Type {
  if (memo.implTypeOfModuleExports === undefined) {
    const checker = getImplChecker(input, memo)
    const type = checker.getTypeOfSymbol(
      checker.resolveExternalModuleSymbol(input.implementationSourceFile.symbol),
    )
    if (type.flags & ts.TypeFlags.Any && getImplExportEqualsIsExportDefault(input, memo)) {
      const defaultSymbol = input.implementationExports.get(ts.InternalSymbolName.Default)
      if (defaultSymbol) {
        memo.implTypeOfModuleExports = checker.getTypeOfSymbol(defaultSymbol)
      }
    }
    if (memo.implTypeOfModuleExports === undefined) {
      memo.implTypeOfModuleExports = type
    }
  }
  return memo.implTypeOfModuleExports
}

function getImplExportEqualsIsExportDefault(input: DisagreementAnalysis, memo: AnalysisMemo): boolean {
  // TypeScript has a circularity error on `module.exports = exports.default`, so
  // detect that pattern syntactically.
  if (memo.implExportEqualsIsExportDefault !== undefined) {
    return memo.implExportEqualsIsExportDefault
  }
  const exportEquals = input.implementationExports.get(ts.InternalSymbolName.ExportEquals)
  if (!exportEquals) {
    memo.implExportEqualsIsExportDefault = false
    return false
  }
  const exportDefault = input.implementationExports.get(ts.InternalSymbolName.Default)
  if (!exportDefault) {
    memo.implExportEqualsIsExportDefault = false
    return false
  }
  for (
    const assignment of [
      exportEquals.valueDeclaration,
      ts.findAncestor(exportDefault.declarations?.[0], ts.isBinaryExpression),
    ]
  ) {
    let seenModuleExports = false,
      seenExportsDefault = false
    if (
      assignment &&
      ts.isBinaryExpression(assignment) &&
      assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const res = !!forEachAssignmentTarget(assignment, (target) => {
        if (!seenExportsDefault && isExportsDefault(target)) {
          seenExportsDefault = true
        } else if (!seenModuleExports && isModuleExports(target)) {
          seenModuleExports = true
        }
        return seenExportsDefault && seenModuleExports
      })
      if (res) {
        memo.implExportEqualsIsExportDefault = true
        return true
      }
    }
  }
  memo.implExportEqualsIsExportDefault = false
  return false
}

function typeIsObjecty(type: ts.Type, checker: ts.TypeChecker) {
  return (
    type.flags & ts.TypeFlags.Object &&
    !(type.flags & ts.TypeFlags.Primitive) &&
    !checker.typeHasCallOrConstructSignatures(type)
  )
}

function isModuleExports(target: ts.Expression) {
  return (
    (ts.isAccessExpression(target) &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === 'module' &&
      getNameOfAccessExpression(target) === 'exports') ||
    (ts.isIdentifier(target) && target.text === 'exports')
  )
}

function isExportsDefault(target: ts.Expression) {
  return (
    (ts.isAccessExpression(target) &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === 'exports' &&
      getNameOfAccessExpression(target) === 'default') ||
    (ts.isAccessExpression(target) &&
      ts.isAccessExpression(target.expression) &&
      ts.isIdentifier(target.expression.expression) &&
      target.expression.expression.text === 'module' &&
      getNameOfAccessExpression(target.expression) === 'exports' &&
      getNameOfAccessExpression(target) === 'default')
  )
}

function isNotDefaultOrEsModule(name: string) {
  return name !== 'default' && name !== '__esModule'
}

function forEachAssignmentTarget<ReturnT>(
  assignment: ts.BinaryExpression,
  cb: (target: ts.Expression) => ReturnT | undefined,
): ReturnT | undefined {
  // For `module.exports = exports = exports.default`, fires `cb` once for
  // `exports.default`, once for `exports`, and once for `module.exports`.
  const target = ts.skipParentheses(assignment.right)
  if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const res = forEachAssignmentTarget(target, cb)
    if (res) {
      return res
    }
  } else {
    const res = cb(target)
    if (res) {
      return res
    }
  }
  return cb(ts.skipParentheses(assignment.left))
}

function getNameOfAccessExpression(accessExpression: ts.AccessExpression): string | undefined {
  const node = ts.getNameOfAccessExpression(accessExpression)
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
    return node.text
  }
}
