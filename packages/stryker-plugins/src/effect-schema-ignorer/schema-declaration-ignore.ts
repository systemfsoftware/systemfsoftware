import { Schema as S } from 'effect'
import {
  ArrowFunctionExpression,
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  RegExpLiteral,
  StringLiteral,
} from './ast-node.schema.js'

export const SYMBOL_DESCRIPTION_IGNORED = 'Symbol.for() brand description is identity-only data, not behaviour' as const
export const TAGGED_TAG_IGNORED = 'TaggedClass/TaggedError _tag is a declaration discriminant, not behaviour' as const
export const TAGGED_FIELDS_IGNORED = 'TaggedClass/TaggedError field schema is a declaration, not behaviour' as const
export const OPTIONAL_DEFAULT_IGNORED = 'optionalWith default value is config, not behaviour' as const
export const ANNOTATION_OBJECT_IGNORED =
  'annotations object holding only documentation is a declaration, not behaviour' as const
export const ANNOTATION_TEXT_IGNORED = 'annotation documentation value is declaration data, not behaviour' as const
export const TEMPLATE_HEAD_IGNORED =
  'TemplateLiteral head re-stated by an anchored pattern filter is a declaration of the encoded type, not behaviour' as const

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

const isIdentifier = S.is(Identifier)
const isStringLiteral = S.is(StringLiteral)
const isObjectExpression = S.is(ObjectExpression)
const isArrowFunctionExpression = S.is(ArrowFunctionExpression)
const isMemberExpression = S.is(MemberExpression)
const isCallExpression = S.is(CallExpression)
const isDocumentationProperty = S.is(DocumentationProperty)
const isDocumentationObject = S.is(DocumentationObject)
const isRegExpLiteral = S.is(RegExpLiteral)

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
  readonly matches: (node: unknown, parent: unknown, grandparent: unknown, ancestor: unknown) => boolean
  readonly reason: string
}

const isOptionalWithCallee = (callee: unknown): boolean => isNamedMember(callee, 'S', 'optionalWith')

const isAnnotationsCallee = (callee: unknown): boolean =>
  isMemberExpression(callee) && isIdentifier(callee.property) && callee.property.name === 'annotations'

/**
 * A head whose every character stands for itself inside a regex. `a.b` is
 * excluded because `^a.b` would also admit `axb`, which the head refuses.
 */
const REGEX_INERT_HEAD = /^[A-Za-z0-9_]+$/

/** `?`, `*` and `{` make the character before them optional, so `^usr?` never forces the `r`. */
const OPTIONAL_QUANTIFIERS: ReadonlyArray<string> = ['?', '*', '{']

const isNamedMethodCallee = (callee: unknown, method: string): boolean =>
  isMemberExpression(callee) && isIdentifier(callee.property) && callee.property.name === method

/**
 * Whether an unflagged, `^`-anchored regex admits only strings opening with
 * `head`. Flags are refused outright: `i` would admit another casing and `m`
 * would let `^` match a line start, and the head rejects both — so it decides.
 */
const forcesPrefix = (regex: unknown, head: string): boolean =>
  isRegExpLiteral(regex) &&
  regex.flags === '' &&
  regex.pattern.startsWith(`^${head}`) &&
  !OPTIONAL_QUANTIFIERS.includes(regex.pattern.charAt(head.length + 1))

const patternForcesPrefix = (argument: unknown, head: string): boolean =>
  isCallExpression(argument) &&
  isNamedMethodCallee(argument.callee, 'pattern') &&
  argument.arguments.some((regex) => forcesPrefix(regex, head))

/**
 * The head of a `TemplateLiteral` piped straight into a `pattern` that already
 * forces that same prefix. Effect rejects refinements as spans, so a prefixed
 * wire format can only earn its `` `${head}${string}` `` type this way, and the
 * prefix ends up stated twice by construction. Emptying the head then changes
 * nothing observable: the filter still refuses every input the head would have
 * refused, and Effect derives the arbitrary from the filter's regex rather than
 * the head. Only the encoded *type* moves, which no test can see.
 *
 * Restricted to argument 0: a trailing span sits past the anchor, so an
 * anchored prefix proves nothing about it and its mutants stay.
 */
const templateHeadRule: IgnoreRule = {
  matches: (node, parent, grandparent, ancestor) =>
    isStringLiteral(node) &&
    REGEX_INERT_HEAD.test(node.value) &&
    isArgumentOf(node, parent, 0, (callee) => isNamedMethodCallee(callee, 'TemplateLiteral')) &&
    isMemberExpression(grandparent) &&
    grandparent.object === parent &&
    isIdentifier(grandparent.property) &&
    grandparent.property.name === 'pipe' &&
    isCallExpression(ancestor) &&
    ancestor.callee === grandparent &&
    ancestor.arguments.some((argument) => patternForcesPrefix(argument, node.value)),
  reason: TEMPLATE_HEAD_IGNORED,
}

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
  argumentRule(isArrowFunctionExpression, 1, isOptionalWithCallee, OPTIONAL_DEFAULT_IGNORED),
  argumentRule(isDocumentationObject, 0, isAnnotationsCallee, ANNOTATION_OBJECT_IGNORED),
  documentationValueRule,
  templateHeadRule,
]

export const decideSchemaDeclarationIgnore = (
  node: unknown,
  parent: unknown,
  grandparent?: unknown,
  ancestor?: unknown,
): string | undefined => RULES.find((rule) => rule.matches(node, parent, grandparent, ancestor))?.reason
