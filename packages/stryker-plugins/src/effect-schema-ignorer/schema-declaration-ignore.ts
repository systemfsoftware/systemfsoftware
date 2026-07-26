import { Schema as S } from 'effect'
import {
  ArrowFunctionExpression,
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  StringLiteral,
} from './ast-node.schema.js'

export const SYMBOL_DESCRIPTION_IGNORED = 'Symbol.for() brand description is identity-only data, not behaviour' as const
export const TAGGED_TAG_IGNORED = 'TaggedClass/TaggedError _tag is a declaration discriminant, not behaviour' as const
export const TAGGED_FIELDS_IGNORED = 'TaggedClass/TaggedError field schema is a declaration, not behaviour' as const
export const OPTIONAL_DEFAULT_IGNORED = 'optionalWith default value is config, not behaviour' as const

const TAGGED_FACTORIES: ReadonlyArray<string> = ['TaggedClass', 'TaggedError']

const isIdentifier = S.is(Identifier)
const isStringLiteral = S.is(StringLiteral)
const isObjectExpression = S.is(ObjectExpression)
const isArrowFunctionExpression = S.is(ArrowFunctionExpression)
const isMemberExpression = S.is(MemberExpression)
const isCallExpression = S.is(CallExpression)

const isNamedMember = (node: unknown, object: string, property: string): boolean =>
  isMemberExpression(node) &&
  isIdentifier(node.object) && node.object.name === object &&
  isIdentifier(node.property) && node.property.name === property

const isSymbolForCallee = (callee: unknown): boolean => isNamedMember(callee, 'Symbol', 'for')

const isTaggedFactoryReference = (reference: unknown): boolean =>
  isMemberExpression(reference) &&
  isIdentifier(reference.property) &&
  TAGGED_FACTORIES.includes(reference.property.name)

const isTaggedFactoryCallee = (callee: unknown): boolean =>
  isCallExpression(callee) && isTaggedFactoryReference(callee.callee)

const isArgumentOf = (
  node: unknown,
  parent: unknown,
  index: number,
  calleeMatches: (callee: unknown) => boolean,
): boolean =>
  isCallExpression(parent) &&
  calleeMatches(parent.callee) &&
  parent.arguments[index] === node

interface IgnoreRule {
  readonly is: (node: unknown) => boolean
  readonly argumentIndex: number
  readonly calleeMatches: (callee: unknown) => boolean
  readonly reason: string
}

const isOptionalWithCallee = (callee: unknown): boolean => isNamedMember(callee, 'S', 'optionalWith')

const RULES: ReadonlyArray<IgnoreRule> = [
  { is: isStringLiteral, argumentIndex: 0, calleeMatches: isSymbolForCallee, reason: SYMBOL_DESCRIPTION_IGNORED },
  { is: isStringLiteral, argumentIndex: 0, calleeMatches: isTaggedFactoryCallee, reason: TAGGED_TAG_IGNORED },
  { is: isObjectExpression, argumentIndex: 1, calleeMatches: isTaggedFactoryCallee, reason: TAGGED_FIELDS_IGNORED },
  {
    is: isArrowFunctionExpression,
    argumentIndex: 1,
    calleeMatches: isOptionalWithCallee,
    reason: OPTIONAL_DEFAULT_IGNORED,
  },
]

export const decideSchemaDeclarationIgnore = (node: unknown, parent: unknown): string | undefined =>
  RULES.find((rule) => rule.is(node) && isArgumentOf(node, parent, rule.argumentIndex, rule.calleeMatches))?.reason
