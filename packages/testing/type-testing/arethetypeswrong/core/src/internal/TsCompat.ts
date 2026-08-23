import ts from 'typescript'

export function isAccessExpression(node: ts.Node): node is ts.AccessExpression {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
}

export function accessExpressionNameNode(node: ts.AccessExpression): ts.MemberName | ts.Expression {
  return ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression
}

export function skipParentheses(node: ts.Expression): ts.Expression {
  let current = node
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

export function isStringOrNumericLiteralLike(node: ts.Node): node is ts.StringLiteralLike | ts.NumericLiteral {
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)
}

export function isFunctionExpressionOrArrowFunction(
  node: ts.Node,
): node is ts.FunctionExpression | ts.ArrowFunction {
  return ts.isFunctionExpression(node) || ts.isArrowFunction(node)
}

export function isFunctionBlock(node: ts.Node): node is ts.Block {
  return ts.isBlock(node) && !!node.parent && ts.isFunctionLike(node.parent)
}

export function hasModifier(node: ts.Node, kind: ts.SyntaxKind.ExportKeyword | ts.SyntaxKind.DefaultKeyword): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
}

export function typeHasCallOrConstructSignatures(checker: ts.TypeChecker, type: ts.Type): boolean {
  return checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0
}

/** `ts.TypeFlags.Primitive` is internal; this is the same union spelled from public flags. */
export const PrimitiveTypeFlags = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void |
  ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.BigInt | ts.TypeFlags.Boolean |
  ts.TypeFlags.ESSymbol | ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BigIntLiteral | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.UniqueESSymbol |
  ts.TypeFlags.EnumLiteral | ts.TypeFlags.Enum | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping
