import 'typescript'

declare module 'typescript' {
  function getSymbolId(symbol: Symbol): number
  function getNodeId(node: Node): number

  function getCheckFlags(symbol: Symbol): number
  namespace CheckFlags {
    const Late: number
  }

  function getJSDocCommentRanges(node: Node, text: string): CommentRange[] | undefined
  function getTextOfIdentifierOrLiteral(node: Identifier | StringLiteralLike | NumericLiteral): string
  function isVarConst(node: VariableDeclaration | VariableDeclarationList): boolean

  interface Program {
    getResolvedModule(
      sourceFile: SourceFile,
      moduleNameText: string,
      mode: ResolutionMode,
    ): ResolvedModuleWithFailedLookupLocations | undefined
  }
  interface TypeChecker {
    getEmitResolver(): EmitResolver
  }
  interface EmitResolver {
    hasGlobalName(name: string): boolean
  }

  interface Symbol {
    parent?: Symbol
  }
  interface Declaration {
    symbol?: Symbol
    localSymbol?: Symbol
  }
}
