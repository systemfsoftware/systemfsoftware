import { Match } from 'effect'
import {
  isArrowFunction,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isPropertyAssignment,
  isPropertyDeclaration,
  isTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from 'typescript/unstable/ast'
import type { Identifier, Node } from 'typescript/unstable/ast'

const childrenOf = (node: Node): readonly Node[] => {
  const children: Node[] = []
  node.forEachChild((child) => {
    children.push(child)
  })
  return children
}

export const flatten = (root: Node): readonly Node[] => [root, ...childrenOf(root).flatMap(flatten)]

const valueReferencesOf = (node: Node): readonly Identifier[] =>
  Match.value(node).pipe(
    Match.when(isTypeNode, (): readonly Identifier[] => []),
    Match.when(isIdentifier, (identifier): readonly Identifier[] => [identifier]),
    Match.orElse(() => childrenOf(node).flatMap(valueReferencesOf)),
  )

export const valueReferences = (root: Node): readonly Identifier[] => valueReferencesOf(root)

const BODY_EXTRACTORS: Record<number, (node: Node) => Node | undefined> = {
  [SyntaxKind.VariableDeclaration]: (node) => (isVariableDeclaration(node) ? node.initializer : undefined),
  [SyntaxKind.PropertyAssignment]: (node) => (isPropertyAssignment(node) ? node.initializer : undefined),
  [SyntaxKind.PropertyDeclaration]: (node) => (isPropertyDeclaration(node) ? node.initializer : undefined),
  [SyntaxKind.FunctionDeclaration]: (node) => (isFunctionDeclaration(node) ? node.body : undefined),
  [SyntaxKind.FunctionExpression]: (node) => (isFunctionExpression(node) ? node.body : undefined),
  [SyntaxKind.ArrowFunction]: (node) => (isArrowFunction(node) ? node.body : undefined),
  [SyntaxKind.MethodDeclaration]: (node) => (isMethodDeclaration(node) ? node.body : undefined),
}

export const declarationBody = (node: Node): Node | undefined => BODY_EXTRACTORS[node.kind]?.(node)

export const bodyOf = (node: Node | undefined): Node | undefined =>
  node === undefined ? undefined : declarationBody(node)
