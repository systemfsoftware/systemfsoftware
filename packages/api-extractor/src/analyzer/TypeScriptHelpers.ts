import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as ts from 'typescript'

import * as TypeScriptInternals from './TypeScriptInternals.js'

const wellKnownSymbolNameRegExp = /^__@(\w+)$/

const uniqueSymbolNameRegExp = /^__@.*@\d+$/

const isAlias = (symbol: ts.Symbol): boolean => (symbol.flags & ts.SymbolFlags.Alias) !== 0

export const followAliases = (symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Symbol =>
  Match.value(symbol).pipe(
    Match.when(isAlias, (aliased) =>
      Option.fromUndefinedOr(typeChecker.getAliasedSymbol(aliased)).pipe(
        Option.filter((alias: ts.Symbol) => alias !== aliased),
        Option.map((alias: ts.Symbol) => followAliases(alias, typeChecker)),
        Option.getOrElse(() => aliased),
      ),
    ),
    Match.orElse((unaliased: ts.Symbol) => unaliased),
  )

export const isFollowableAlias = (symbol: ts.Symbol, typeChecker: ts.TypeChecker): boolean =>
  isAlias(symbol) &&
  Option.fromUndefinedOr(typeChecker.getAliasedSymbol(symbol)).pipe(
    Option.exists((alias: ts.Symbol) => alias !== symbol),
  )

export const tryGetADeclaration = (symbol: ts.Symbol): ts.Declaration | undefined =>
  Option.fromNullishOr(symbol.declarations).pipe(
    Option.flatMap(Arr.head),
    Option.getOrUndefined,
  )

const isInsideDeclareGlobal = (declaration: ts.Declaration): boolean =>
  Option.fromUndefinedOr(findHighestParent<ts.ModuleDeclaration>(declaration, ts.SyntaxKind.ModuleDeclaration))
    .pipe(
      Option.exists((moduleDeclaration: ts.ModuleDeclaration) =>
        moduleDeclaration.name.getText().trim() === 'global'
      ),
    )

const isModuleSourceFile = (sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): boolean =>
  typeChecker.getSymbolAtLocation(sourceFile) !== undefined

export const isAmbient = (symbol: ts.Symbol, typeChecker: ts.TypeChecker): boolean => {
  const followedSymbol: ts.Symbol = followAliases(symbol, typeChecker)
  return Option.fromUndefinedOr(tryGetADeclaration(followedSymbol)).pipe(
    Option.map((firstDeclaration: ts.Declaration) =>
      Match.value(isInsideDeclareGlobal(firstDeclaration)).pipe(
        Match.when(true, () => true),
        Match.orElse(() => !isModuleSourceFile(firstDeclaration.getSourceFile(), typeChecker)),
      )
    ),
    Option.getOrElse(() => true),
  )
}

export const getSymbolForDeclaration = (
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
): ts.Symbol | undefined => TypeScriptInternals.tryGetSymbolForDeclaration(declaration, checker)

const importTypeLiteralText = (importTypeNode: ts.ImportTypeNode): string | undefined =>
  Option.some(importTypeNode.argument).pipe(
    Option.filter(ts.isLiteralTypeNode),
    Option.map((literalTypeNode: ts.LiteralTypeNode) => literalTypeNode.literal),
    Option.filter(ts.isStringLiteral),
    Option.map((stringLiteral: ts.StringLiteral) => stringLiteral.text.trim()),
    Option.getOrUndefined,
  )

const declarationModuleSpecifier = (
  declaration: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined =>
  Option.fromUndefinedOr(declaration.moduleSpecifier).pipe(
    Option.filter(ts.isStringLiteralLike),
    Option.map((moduleSpecifier: ts.StringLiteralLike) =>
      TypeScriptInternals.getTextOfIdentifierOrLiteral(moduleSpecifier)
    ),
    Option.getOrUndefined,
  )

export const getModuleSpecifier = (
  nodeWithModuleSpecifier: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
): string | undefined =>
  Match.value(nodeWithModuleSpecifier).pipe(
    Match.when(ts.isImportTypeNode, (importTypeNode) => importTypeLiteralText(importTypeNode)),
    Match.when(ts.isImportDeclaration, (declaration) => declarationModuleSpecifier(declaration)),
    Match.when(ts.isExportDeclaration, (declaration) => declarationModuleSpecifier(declaration)),
    Match.orElse(() => undefined),
  )

const parentIfKindMatches = (current: ts.Node | undefined, kind: ts.SyntaxKind): ts.Node | undefined =>
  Option.fromUndefinedOr(current).pipe(
    Option.map((node: ts.Node) => node.parent),
    Option.flatMap((parent) => Option.fromNullishOr(parent)),
    Option.filter((parent: ts.Node) => parent.kind === kind),
    Option.getOrUndefined,
  )

export function matchAncestor<T extends ts.Node>(node: ts.Node, kindsToMatch: ts.SyntaxKind[]): T | undefined
export function matchAncestor(node: ts.Node, kindsToMatch: ts.SyntaxKind[]): ts.Node | undefined {
  const reversedParentKinds: ReadonlyArray<ts.SyntaxKind> = Arr.reverse(kindsToMatch)
  return Arr.reduce<ts.SyntaxKind, ts.Node | undefined>(
    reversedParentKinds,
    undefined,
    (current, parentKind, index) =>
      Match.value(index).pipe(
        Match.when(0, () =>
          Option.getOrUndefined(
            Option.some(node).pipe(Option.filter((candidate: ts.Node) => candidate.kind === parentKind)),
          )
        ),
        Match.orElse(() => parentIfKindMatches(current, parentKind)),
      ),
  )
}

const ancestors = (node: ts.Node): ReadonlyArray<ts.Node> =>
  Option.fromNullishOr(node.parent).pipe(
    Option.map((parent): ReadonlyArray<ts.Node> => [parent, ...ancestors(parent)]),
    Option.getOrElse((): ReadonlyArray<ts.Node> => []),
  )

export function findFirstChildNode<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined
export function findFirstChildNode(node: ts.Node, kindToMatch: ts.SyntaxKind): ts.Node | undefined {
  return Arr.reduce<ts.Node, ts.Node | undefined>(
    node.getChildren(),
    undefined,
    (found, child) =>
      found ??
        Option.getOrUndefined(
          Option.some(child).pipe(
            Option.filter((candidate: ts.Node) => candidate.kind === kindToMatch),
            Option.orElse(() => Option.fromUndefinedOr(findFirstChildNode(child, kindToMatch))),
          ),
        ),
  )
}

export function findFirstParent<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined
export function findFirstParent(node: ts.Node, kindToMatch: ts.SyntaxKind): ts.Node | undefined {
  return Option.getOrUndefined(Arr.findFirst(ancestors(node), (ancestor: ts.Node) => ancestor.kind === kindToMatch))
}

export function findHighestParent<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined
export function findHighestParent(node: ts.Node, kindToMatch: ts.SyntaxKind): ts.Node | undefined {
  return Arr.reduce<ts.Node, ts.Node | undefined>(
    ancestors(node),
    undefined,
    (highest, ancestor) =>
      Option.getOrUndefined(
        Option.some(ancestor).pipe(
          Option.filter((candidate: ts.Node) => candidate.kind === kindToMatch),
          Option.orElse(() => Option.fromUndefinedOr(highest)),
        ),
      ),
  )
}

export const tryDecodeWellKnownSymbolName = (name: ts.__String): string | undefined =>
  Option.fromNullishOr(wellKnownSymbolNameRegExp.exec(String(name))).pipe(
    Option.flatMap((matched) => Option.fromUndefinedOr(matched[1])),
    Option.map((identifier: string) => `[Symbol.${identifier}]`),
    Option.getOrUndefined,
  )

export const isUniqueSymbolName = (name: ts.__String): boolean => uniqueSymbolNameRegExp.test(String(name))

export const tryGetLateBoundName = (declarationName: ts.ComputedPropertyName): string | undefined => {
  const printer: ts.Printer = ts.createPrinter(
    { removeComments: true },
    {
      onEmitNode(
        hint: ts.EmitHint,
        node: ts.Node,
        emitCallback: (hint: ts.EmitHint, node: ts.Node) => void,
      ): void {
        ts.setEmitFlags(declarationName, ts.EmitFlags.NoIndentation | ts.EmitFlags.SingleLine)
        emitCallback(hint, node)
      },
    },
  )
  const sourceFile: ts.SourceFile = declarationName.getSourceFile()
  const text: string = printer.printNode(ts.EmitHint.Unspecified, declarationName, sourceFile)
  ts.disposeEmitNodes(sourceFile)
  return text
}
