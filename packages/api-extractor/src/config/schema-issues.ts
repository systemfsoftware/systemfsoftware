import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type * as SchemaAST from 'effect/SchemaAST'
import type * as SchemaIssue from 'effect/SchemaIssue'

import { SchemaAstView, SchemaViolation } from './schema-violation.schema.js'

const enumMessage = 'must be equal to one of the allowed values'

const viewOf = (ast: SchemaAST.AST): Option.Option<SchemaAstView> => Schema.decodeOption(SchemaAstView)(ast)

const jsonTypeOf = (view: SchemaAstView): Option.Option<string> =>
  Match.value(view).pipe(
    Match.tag('String', () => Option.some('string')),
    Match.tag('Boolean', () => Option.some('boolean')),
    Match.tag('Objects', () => Option.some('object')),
    Match.tag('Arrays', () => Option.some('array')),
    Match.tag('Number', () => Option.some('number')),
    Match.orElse(() => Option.none()),
  )

const typedMessage = (type: Option.Option<string>): string =>
  Option.match(type, {
    onNone: () => enumMessage,
    onSome: (found) => `must be ${found}`,
  })

const isUndefinedMember = (member: SchemaAstView): boolean =>
  Match.value(member).pipe(
    Match.tag('Undefined', () => true),
    Match.orElse(() => false),
  )

const isLiteralMember = (member: SchemaAstView): boolean =>
  Match.value(member).pipe(
    Match.tag('Literal', () => true),
    Match.orElse(() => false),
  )

const messageForUnion = (view: SchemaAstView): string => {
  const typed = Arr.filter(view.types ?? [view], (member) => !isUndefinedMember(member))
  return Match.value({ empty: typed.length === 0, literals: Arr.every(typed, isLiteralMember) }).pipe(
    Match.when({ empty: true }, () => enumMessage),
    Match.when({ literals: true }, () => enumMessage),
    Match.when({}, () => typedMessage(Option.flatMap(Arr.head(typed), (member) => jsonTypeOf(member)))),
    Match.exhaustive,
  )
}

const messageForAst = (ast: SchemaAST.AST): string =>
  Option.match(viewOf(ast), {
    onNone: () => enumMessage,
    onSome: (view) =>
      Match.value(view).pipe(
        Match.tag('Union', () => messageForUnion(view)),
        Match.orElse((other) => typedMessage(jsonTypeOf(other))),
      ),
  })

const ajvInstancePath = (segments: ReadonlyArray<string>): string =>
  Match.value(segments.length === 0).pipe(
    Match.when(true, () => ''),
    Match.when(false, () => `/${segments.join('/')}`),
    Match.exhaustive,
  )

const segmentOf = (key: PropertyKey): string => String(key)

const requiredPropertyMessage = (key: Option.Option<string>): string =>
  Option.match(key, {
    onNone: () => 'must have required property',
    onSome: (name) => `must have required property '${name}'`,
  })

const exceededPropertyMessage = (key: Option.Option<string>): string =>
  Option.match(key, {
    onNone: () => 'must NOT have additional properties',
    onSome: (name) => `must NOT have additional properties: ${name}`,
  })

type IssuePath = ReadonlyArray<string>

interface LocatedIssue {
  readonly path: IssuePath
  readonly issue: SchemaIssue.Issue
}

type LocatedViolation =
  | { readonly kind: 'UnexpectedKey'; readonly path: IssuePath }
  | { readonly kind: 'MissingKey'; readonly path: IssuePath }
  | { readonly kind: 'InvalidType'; readonly path: IssuePath; readonly ast: SchemaAST.AST }
  | { readonly kind: 'AnyOf'; readonly path: IssuePath; readonly ast: SchemaAST.AST }

const firstLeaf = (
  issues: ReadonlyArray<SchemaIssue.Issue>,
  path: IssuePath,
  fallback: LocatedIssue,
): LocatedIssue =>
  Option.getOrElse(
    Option.map(Arr.head(issues), (first) => deepestLeaf(first, path)),
    () => fallback,
  )

const deepestLeaf = (issue: SchemaIssue.Issue, path: IssuePath): LocatedIssue =>
  Match.value(issue).pipe(
    Match.tag('Pointer', (pointer) => deepestLeaf(pointer.issue, [...path, ...Arr.map(pointer.path, segmentOf)])),
    Match.tag('Composite', (composite) => firstLeaf(composite.issues, path, { path, issue })),
    Match.tag('AnyOf', (anyOf) =>
      Match.value(anyOf.issues.length === 0).pipe(
        Match.when(true, (): LocatedIssue => ({ path, issue: anyOf })),
        Match.when(false, () => firstLeaf(anyOf.issues, path, { path, issue: anyOf })),
        Match.exhaustive,
      )),
    Match.orElse((): LocatedIssue => ({ path, issue })),
  )

const leafViolationOf = (located: LocatedIssue): Option.Option<LocatedViolation> =>
  Match.value(located.issue).pipe(
    Match.tag('UnexpectedKey', (): Option.Option<LocatedViolation> =>
      Option.some({ kind: 'UnexpectedKey', path: located.path })),
    Match.tag('MissingKey', (): Option.Option<LocatedViolation> =>
      Option.some({ kind: 'MissingKey', path: located.path })),
    Match.tag('InvalidType', (invalid): Option.Option<LocatedViolation> =>
      Option.some({ kind: 'InvalidType', path: located.path, ast: invalid.ast })),
    Match.tag('AnyOf', (anyOf): Option.Option<LocatedViolation> =>
      Option.some({ kind: 'AnyOf', path: located.path, ast: anyOf.ast })),
    Match.orElse((): Option.Option<LocatedViolation> =>
      Option.none()
    ),
  )

const violationAt = (
  path: IssuePath,
  message: string,
  atContainer: boolean,
): SchemaViolation => ({
  instancePath: ajvInstancePath(atContainer ? Arr.dropRight(path, 1) : path),
  message,
})

const renderViolation = (leaf: LocatedViolation): SchemaViolation =>
  Match.value(leaf).pipe(
    Match.when({ kind: 'UnexpectedKey' }, (found) =>
      violationAt(found.path, exceededPropertyMessage(Arr.last(found.path)), true)),
    Match.when({ kind: 'MissingKey' }, (found) =>
      violationAt(found.path, requiredPropertyMessage(Arr.last(found.path)), true)),
    Match.when({ kind: 'InvalidType' }, (found) =>
      violationAt(found.path, messageForAst(found.ast), false)),
    Match.when({ kind: 'AnyOf' }, (found) =>
      violationAt(found.path, messageForAst(found.ast), false)),
    Match.exhaustive,
  )

export const violationOf = (issue: SchemaIssue.Issue): Option.Option<SchemaViolation> =>
  Option.map(leafViolationOf(deepestLeaf(issue, [])), renderViolation)
