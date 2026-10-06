import { Array as Arr, Option, Schema } from 'effect'
import { type CallExpression, type Comment, parseSync, type Program, Visitor } from 'oxc-parser'
import { decodeMarkerTag } from './classify.js'
import {
  type Entry,
  InlineDirective,
  type InlineDirectiveFamily,
  Marker,
  SkippedTest,
  type SkippedTestKind,
} from './Entry.schema.js'
import { asRecord, type Raw, type RawObject } from './raw.js'
import { lineAt } from './text.js'

interface DirectiveMatcher {
  readonly family: InlineDirectiveFamily
  readonly test: (value: string) => boolean
}

// The lexer (oxc-parser) hands us comment text only, so a directive spelled
// inside a string literal never reaches these tests.
const DIRECTIVES: ReadonlyArray<DirectiveMatcher> = [
  { family: 'oxlint-disable', test: (value) => value.startsWith('oxlint-disable') },
  { family: 'eslint-disable', test: (value) => value.startsWith('eslint-disable') },
  { family: 'effect-diagnostics', test: (value) => /@effect-diagnostics/.test(value) },
  { family: 'ts-nocheck', test: (value) => /@ts-nocheck\b/.test(value) },
  { family: 'ts-expect-error', test: (value) => /@ts-expect-error\b/.test(value) },
  { family: 'ts-ignore', test: (value) => /@ts-ignore\b/.test(value) },
  { family: 'stryker-disable', test: (value) => /stryker\s+disable/i.test(value) },
  { family: 'coverage-ignore', test: (value) => /(?:c8|istanbul|v8)\s+ignore\b/i.test(value) },
  { family: 'dprint-ignore', test: (value) => /dprint-ignore/.test(value) },
]

const directiveOf = (
  file: string,
  source: string,
  comment: Comment,
  matcher: DirectiveMatcher,
): ReadonlyArray<Entry> => {
  const text = comment.value.trim()
  return matcher.test(text)
    ? [InlineDirective.make({ file, line: lineAt(source, comment.start), family: matcher.family, text })]
    : []
}

const directiveEntries = (
  file: string,
  source: string,
  comments: ReadonlyArray<Comment>,
): ReadonlyArray<Entry> =>
  Arr.flatMap(comments, (comment) => Arr.flatMap(DIRECTIVES, (matcher) => directiveOf(file, source, comment, matcher)))

const markerEntries = (file: string, source: string, comments: ReadonlyArray<Comment>): ReadonlyArray<Entry> =>
  Arr.flatMap(
    comments,
    (comment) =>
      Option.match(decodeMarkerTag(comment.value), {
        onNone: () => [],
        onSome: (tag) => [Marker.make({ file, line: lineAt(source, comment.start), tag, text: comment.value.trim() })],
      }),
  )

const SKIP_KINDS: Readonly<Record<string, SkippedTestKind>> = {
  'it.skip': 'skip',
  'test.skip': 'skip',
  'describe.skip': 'skip',
  'suite.skip': 'skip',
  'it.only': 'only',
  'test.only': 'only',
  'describe.only': 'only',
  'suite.only': 'only',
  'it.todo': 'todo',
  'test.todo': 'todo',
  'xit': 'xit',
  'xdescribe': 'xdescribe',
}
// `skipIf`/`runIf` register through the curried call `it.skipIf(cond)(name,
// body)`, whose callee is itself a CallExpression and so cannot be a
// `SKIP_KINDS` path. The bare factory `it.skipIf(cond)` is not a skipped test
// and a definition (`it.skipIf = …`, `const skipIf = …`) is not a call, so only
// a `skipIf`/`runIf` member rooted at a registrar registers.

// `Object.hasOwn`, not `SKIP_KINDS[path]`: a call named `toString`/`constructor`/
// `valueOf` would otherwise reach Object.prototype and fail SkippedTest decoding.
const skipKindOf = (path: string): SkippedTestKind | undefined =>
  Object.hasOwn(SKIP_KINDS, path) ? SKIP_KINDS[path] : undefined

const REGISTRAR_ROOTS: Readonly<Record<string, true>> = { it: true, test: true, describe: true, suite: true }

const CURRIED_KINDS: Readonly<Record<string, SkippedTestKind>> = { skipIf: 'skipIf', runIf: 'runIf' }

const curriedKindOfMethod = (method: string): SkippedTestKind | undefined =>
  Object.hasOwn(CURRIED_KINDS, method) ? CURRIED_KINDS[method] : undefined

const curriedKindOfMember = (member: RawObject): Option.Option<SkippedTestKind> =>
  Option.flatMap(nameOf(member['property']), (method) => Option.fromNullishOr(curriedKindOfMethod(method)))

// The root-most identifier of a member chain: `it.effect.skipIf` -> `it`.
const rootName = (node: Raw): Option.Option<string> =>
  Option.match(nameOf(node), {
    onSome: (name) => Option.some(name),
    onNone: () => Option.flatMap(asRecord(node), (record) => rootName(record['object'])),
  })

const isRegistrarRoot = (root: string): boolean => Object.hasOwn(REGISTRAR_ROOTS, root)

const innerMemberOf = (callee: Raw): Option.Option<RawObject> =>
  Option.flatMap(
    asRecord(callee),
    (record) => record['type'] === 'CallExpression' ? asRecord(record['callee']) : Option.none(),
  )

const curriedKindOf = (callee: Raw): Option.Option<SkippedTestKind> =>
  Option.flatMap(
    innerMemberOf(callee),
    (member) =>
      Option.flatMap(rootName(member['object']), (root) =>
        isRegistrarRoot(root) ? curriedKindOfMember(member) : Option.none()),
  )

const nameOf = (node: Raw): Option.Option<string> =>
  Option.flatMap(asRecord(node), (record) => Schema.decodeUnknownOption(Schema.String)(record['name']))

const qualified = (record: RawObject): Option.Option<string> =>
  Option.map(
    nameOf(record['object']),
    (object) => `${object}.${Option.getOrElse(nameOf(record['property']), () => '')}`,
  )

const calleePath = (callee: Raw): Option.Option<string> =>
  Option.flatMap(asRecord(callee), qualified).pipe(Option.orElse(() => nameOf(callee)))

const literalString = (node: Raw): Option.Option<string> =>
  Option.flatMap(
    asRecord(node),
    (record) =>
      record['type'] === 'Literal' ? Schema.decodeUnknownOption(Schema.String)(record['value']) : Option.none(),
  )

const firstArgument = (node: CallExpression): Option.Option<string> =>
  Option.flatMap(Arr.head(node.arguments), literalString)

const kindOfCall = (node: CallExpression): Option.Option<SkippedTestKind> =>
  Option.match(calleePath(node.callee), {
    onNone: () => curriedKindOf(node.callee),
    onSome: (path) => Option.fromNullishOr(skipKindOf(path)),
  })

const skippedOf = (file: string, source: string, node: CallExpression): ReadonlyArray<Entry> =>
  Option.match(kindOfCall(node), {
    onNone: () => [],
    onSome: (kind) => [
      SkippedTest.make({
        file,
        line: lineAt(source, node.start),
        kind,
        name: Option.getOrElse(firstArgument(node), () => ''),
      }),
    ],
  })

const callEntries = (file: string, source: string, program: Program): ReadonlyArray<Entry> => {
  const out: Array<Entry> = []
  new Visitor({
    CallExpression: (node) => {
      Arr.forEach(skippedOf(file, source, node), (entry) => out.push(entry))
    },
  }).visit(program)
  return out
}

export interface SourceFile {
  readonly file: string
  readonly source: string
}

export const scanTsFile = (input: SourceFile): ReadonlyArray<Entry> => {
  const parsed = parseSync(input.file, input.source)
  return [
    ...directiveEntries(input.file, input.source, parsed.comments),
    ...markerEntries(input.file, input.source, parsed.comments),
    ...callEntries(input.file, input.source, parsed.program),
  ]
}
