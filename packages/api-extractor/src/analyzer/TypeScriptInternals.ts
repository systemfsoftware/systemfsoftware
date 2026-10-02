import * as Brand from 'effect/Brand'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as ts from 'typescript'

export interface IGlobalVariableAnalyzer {
  hasGlobalName(name: string): boolean
}

export type SymbolId = number & Brand.Brand<'SymbolId'>
export const SymbolId = Brand.nominal<SymbolId>()

export type NodeId = number & Brand.Brand<'NodeId'>
export const NodeId = Brand.nominal<NodeId>()

export const getSymbolId = (symbol: ts.Symbol): SymbolId => SymbolId(ts.getSymbolId(symbol))

export const getNodeId = (node: ts.Node): NodeId => NodeId(ts.getNodeId(node))

export const getImmediateAliasedSymbol = dual<
  (typeChecker: ts.TypeChecker) => (symbol: ts.Symbol) => ts.Symbol | undefined,
  (symbol: ts.Symbol, typeChecker: ts.TypeChecker) => ts.Symbol | undefined
>(2, (
  symbol: ts.Symbol,
  typeChecker: ts.TypeChecker,
): ts.Symbol | undefined => typeChecker.getImmediateAliasedSymbol(symbol))

const symbolAtNameOfDeclaration = (
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
): Option.Option<ts.Symbol> =>
  Option.fromUndefinedOr(ts.getNameOfDeclaration(declaration)).pipe(
    Option.flatMap((name) => Option.fromUndefinedOr(checker.getSymbolAtLocation(name))),
  )

export const tryGetSymbolForDeclaration = dual<
  (checker: ts.TypeChecker) => (declaration: ts.Declaration) => ts.Symbol | undefined,
  (declaration: ts.Declaration, checker: ts.TypeChecker) => ts.Symbol | undefined
>(2, (
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
): ts.Symbol | undefined =>
  Option.fromUndefinedOr(declaration.symbol).pipe(
    Option.flatMap((symbol) =>
      Match.value(symbol.escapedName === ts.InternalSymbolName.Computed).pipe(
        Match.when(
          true,
          () => Option.orElse(symbolAtNameOfDeclaration(declaration, checker), () => Option.some(symbol)),
        ),
        Match.when(false, () => Option.some(symbol)),
        Match.exhaustive,
      )
    ),
    Option.getOrUndefined,
  ))

export const isLateBoundSymbol = (symbol: ts.Symbol): boolean =>
  (symbol.flags & ts.SymbolFlags.Transient) !== 0 && ts.getCheckFlags(symbol) === ts.CheckFlags.Late

export const getJSDocCommentRanges = dual<
  (text: string) => (node: ts.Node) => ts.CommentRange[] | undefined,
  (node: ts.Node, text: string) => ts.CommentRange[] | undefined
>(2, (node: ts.Node, text: string): ts.CommentRange[] | undefined => ts.getJSDocCommentRanges(node, text))

export const getTextOfIdentifierOrLiteral = (
  node: ts.Identifier | ts.StringLiteralLike | ts.NumericLiteral,
): string => ts.getTextOfIdentifierOrLiteral(node)

export const getResolvedModule = dual<
  (
    sourceFile: ts.SourceFile,
    moduleNameText: string,
    mode: ts.ResolutionMode,
  ) => (program: ts.Program) => ts.ResolvedModuleFull | undefined,
  (
    program: ts.Program,
    sourceFile: ts.SourceFile,
    moduleNameText: string,
    mode: ts.ResolutionMode,
  ) => ts.ResolvedModuleFull | undefined
>(4, (
  program: ts.Program,
  sourceFile: ts.SourceFile,
  moduleNameText: string,
  mode: ts.ResolutionMode,
): ts.ResolvedModuleFull | undefined => program.getResolvedModule(sourceFile, moduleNameText, mode)?.resolvedModule)

export const getModeForUsageLocation = dual<
  (usage: ts.StringLiteralLike, compilerOptions: ts.CompilerOptions) => (file: ts.SourceFile) => ts.ResolutionMode,
  (file: ts.SourceFile, usage: ts.StringLiteralLike, compilerOptions: ts.CompilerOptions) => ts.ResolutionMode
>(3, (
  file: ts.SourceFile,
  usage: ts.StringLiteralLike,
  compilerOptions: ts.CompilerOptions,
): ts.ResolutionMode => ts.getModeForUsageLocation(file, usage, compilerOptions))

export const getSymbolParent = (symbol: ts.Symbol): ts.Symbol | undefined => symbol.parent

export const tryGetLocalSymbol = (declaration: ts.Declaration): ts.Symbol | undefined => declaration.localSymbol

export const getGlobalVariableAnalyzer = (program: ts.Program): IGlobalVariableAnalyzer =>
  program.getTypeChecker().getEmitResolver()

export const isVarConst = (node: ts.VariableDeclaration | ts.VariableDeclarationList): boolean => ts.isVarConst(node)
