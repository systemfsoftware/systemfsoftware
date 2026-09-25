import { Data, HashSet, Option } from 'effect'
import * as ts from 'typescript'

import type { NodeId, SymbolId } from '../TypeScriptInternals.js'

export interface AstDeclarationFields {
  readonly declarationId: NodeId
  readonly astSymbolId: SymbolId
  readonly rootAstSymbolId: SymbolId
  readonly parentDeclarationId: Option.Option<NodeId>
  readonly modifierFlags: number
}

export class AstDeclaration extends Data.TaggedClass('AstDeclaration')<AstDeclarationFields> {}

const supportedSyntaxKinds: HashSet.HashSet<ts.SyntaxKind> = HashSet.make(
  ts.SyntaxKind.CallSignature,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ConstructSignature,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.IndexSignature,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.VariableDeclaration,
)

export const isSupportedSyntaxKind = (kind: ts.SyntaxKind): boolean => HashSet.has(supportedSyntaxKinds, kind)

export const modifierFlagsOf = (declaration: ts.Declaration): number =>
  Option.fromUndefinedOr(ts.getNameOfDeclaration(declaration)).pipe(
    Option.filter(ts.isPrivateIdentifier),
    Option.map(() => ts.getCombinedModifierFlags(declaration) | ts.ModifierFlags.Private),
    Option.getOrElse(() => ts.getCombinedModifierFlags(declaration)),
  )
