import { Schema as S } from 'effect'
import {
  ArrowFunctionExpression,
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  StringLiteral,
} from './ast-node.kernel.js'

export const SYMBOL_DESCRIPTION_IGNORED = 'Symbol.for() brand description is identity-only data, not behaviour' as const
export const TAGGED_TAG_IGNORED = 'TaggedClass/TaggedError _tag is a declaration discriminant, not behaviour' as const
export const TAGGED_FIELDS_IGNORED = 'TaggedClass/TaggedError field schema is a declaration, not behaviour' as const
export const CLASS_ID_IGNORED = 'Schema.Class identifier is a declaration name, not behaviour' as const
export const CLASS_FIELDS_IGNORED = 'Schema.Class field schema is a declaration, not behaviour' as const
export const BRAND_NAME_IGNORED = 'Schema.brand name is identity-only data, not behaviour' as const
export const OPTIONAL_DEFAULT_IGNORED = 'optionalWith default value is config, not behaviour' as const
export const ANNOTATION_OBJECT_IGNORED =
  'annotations object holding only documentation is a declaration, not behaviour' as const
export const ANNOTATION_TEXT_IGNORED = 'annotation documentation value is declaration data, not behaviour' as const

/**
 * The Effect `Schema` annotations that describe a schema without changing what
 * it does. `arbitrary`, `pretty`, `equivalence`, `message`, `jsonSchema` and
 * `parseIssueTitle` are absent by design: each one alters observable behaviour,
 * so a surviving mutant of one is a test gap to close, never an equivalent
 * mutant to ignore.
 */
const DocumentationKey = S.Literal('identifier', 'description', 'title', 'documentation', 'examples')

const DocumentationProperty = S.Struct({
  type: S.Literal('ObjectProperty'),
  computed: S.Literal(false),
  key: S.Union(
    S.Struct({ type: S.Literal('Identifier'), name: DocumentationKey }),
    S.Struct({ type: S.Literal('StringLiteral'), value: DocumentationKey }),
  ),
  value: S.Unknown,
})

/**
 * An object literal whose every entry documents. One behaviour-bearing entry -
 * an `arbitrary` beside a `title` - fails the schema, so the object keeps its
 * mutants: emptying it would delete a generator, which a test can observe.
 */
const DocumentationObject = S.Struct({
  type: S.Literal('ObjectExpression'),
  properties: S.NonEmptyArray(DocumentationProperty),
})

const TAGGED_FACTORIES: ReadonlyArray<string> = ['TaggedClass', 'TaggedError']

/**
 * `Schema.Class` is curried the other way round from `Schema.TaggedClass`.
 *
 * `S.TaggedClass<A>()('tag', fields)` puts both the discriminant and the fields on the outer
 * call, so one callee predicate reaches both. `S.Class<A>('Id')(fields)` puts the identifier on
 * the *inner* call and the fields on the outer one, so the same declaration data needs two
 * predicates. Missing that shape is why a class-shaped schema kept fourteen mutants a
 * tag-shaped one never had.
 */
const CLASS_FACTORY = 'Class'

const isIdentifier = S.is(Identifier)
const isStringLiteral = S.is(StringLiteral)
const isObjectExpression = S.is(ObjectExpression)
const isArrowFunctionExpression = S.is(ArrowFunctionExpression)
const isMemberExpression = S.is(MemberExpression)
const isCallExpression = S.is(CallExpression)
const isDocumentationProperty = S.is(DocumentationProperty)
const isDocumentationObject = S.is(DocumentationObject)

const isNamedMember = (node: unknown, object: string, property: string): boolean =>
  isMemberExpression(node) &&
  isIdentifier(node.object) && node.object.name === object &&
  isIdentifier(node.property) && node.property.name === property

const isSymbolForCallee = (callee: unknown): boolean => isNamedMember(callee, 'Symbol', 'for')

const isNamedFactoryReference = (reference: unknown, names: ReadonlyArray<string>): boolean =>
  isMemberExpression(reference) &&
  isIdentifier(reference.property) &&
  names.includes(reference.property.name)

const isTaggedFactoryReference = (reference: unknown): boolean => isNamedFactoryReference(reference, TAGGED_FACTORIES)

/** The inner `S.Class<A>('Id')` call, which carries the identifier. */
const isClassFactoryReference = (reference: unknown): boolean => isNamedFactoryReference(reference, [CLASS_FACTORY])

/**
 * There is deliberately no rule for a `Schema.Class` *fields* object, and the reason is measured.
 *
 * Stryker's ignorer suppresses a node's whole subtree, so ignoring the fields object also ignores
 * every literal inside it - and a field's accepted value set is behaviour: emptying
 * `Schema.Literal('permanent', 'transient')` changes what decodes. Adding that rule turned
 * fourteen survivors green in one run while hiding the accepted-set decisions the survivors were
 * pointing at. Those belong to a decode test, not to an ignorer.
 */

/** `S.brand('Name')` - the brand name is identity data, like a `Symbol.for` description. */
const isBrandCallee = (callee: unknown): boolean =>
  isMemberExpression(callee) && isIdentifier(callee.property) && callee.property.name === 'brand'

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
  readonly matches: (node: unknown, parent: unknown, grandparent: unknown, ancestor: unknown) => boolean
  readonly reason: string
}

const isOptionalWithCallee = (callee: unknown): boolean => isNamedMember(callee, 'S', 'optionalWith')

const isAnnotationsCallee = (callee: unknown): boolean =>
  isMemberExpression(callee) && isIdentifier(callee.property) && callee.property.name === 'annotations'

const argumentRule = (
  is: (node: unknown) => boolean,
  argumentIndex: number,
  calleeMatches: (callee: unknown) => boolean,
  reason: string,
): IgnoreRule => ({
  matches: (node, parent) => is(node) && isArgumentOf(node, parent, argumentIndex, calleeMatches),
  reason,
})

/**
 * A documentation-keyed entry of an `annotations` call. Unlike the object rule
 * this does not care what sits beside it: `title` is documentation whether or
 * not an `arbitrary` shares the object, because replacing the title cannot
 * change what the schema does. Emptying the whole object could, which is why
 * that rule is the stricter of the two.
 */
const documentationValueRule: IgnoreRule = {
  matches: (node, parent, grandparent, ancestor) =>
    isDocumentationProperty(parent) &&
    parent.value === node &&
    isArgumentOf(grandparent, ancestor, 0, isAnnotationsCallee),
  reason: ANNOTATION_TEXT_IGNORED,
}

const RULES: ReadonlyArray<IgnoreRule> = [
  argumentRule(isStringLiteral, 0, isSymbolForCallee, SYMBOL_DESCRIPTION_IGNORED),
  argumentRule(isStringLiteral, 0, isTaggedFactoryCallee, TAGGED_TAG_IGNORED),
  argumentRule(isObjectExpression, 1, isTaggedFactoryCallee, TAGGED_FIELDS_IGNORED),
  argumentRule(isStringLiteral, 0, isClassFactoryReference, CLASS_ID_IGNORED),
  argumentRule(isStringLiteral, 0, isBrandCallee, BRAND_NAME_IGNORED),
  argumentRule(isArrowFunctionExpression, 1, isOptionalWithCallee, OPTIONAL_DEFAULT_IGNORED),
  argumentRule(isDocumentationObject, 0, isAnnotationsCallee, ANNOTATION_OBJECT_IGNORED),
  documentationValueRule,
]

export const decideSchemaDeclarationIgnore = (
  node: unknown,
  parent: unknown,
  grandparent?: unknown,
  ancestor?: unknown,
): string | undefined => RULES.find((rule) => rule.matches(node, parent, grandparent, ancestor))?.reason
