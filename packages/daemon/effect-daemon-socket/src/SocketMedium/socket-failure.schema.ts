/// <reference types="vitest/importMeta" />
import { Match, Option, Schema as S, SchemaTransformation } from 'effect'

/**
 * The Node `ErrnoException` a refused dial, a reset connection or a failed read or
 * write raises: the symbolic name the OS reports under `code` and the number it
 * reports under `errno`, either of which a given raise may omit. Node owns that
 * shape, so it stays the encoded side byte for byte; the decoded side is the cases
 * the socket's termination report distinguishes.
 */

/** The OS both named the error and numbered it (`{ code: 'ECONNREFUSED', errno: -111 }`). */
export const SocketOsErrnoAndCode = S.TaggedStruct('SocketOsErrnoAndCode', { errno: S.Int, code: S.String })
export type SocketOsErrnoAndCode = typeof SocketOsErrnoAndCode.Type

/** The OS numbered the error, but the cause carries no symbolic name for it. */
export const SocketOsErrnoOnly = S.TaggedStruct('SocketOsErrnoOnly', { errno: S.Int })
export type SocketOsErrnoOnly = typeof SocketOsErrnoOnly.Type

/** The cause names the error, but carries no OS number for it. */
export const SocketOsCodeOnly = S.TaggedStruct('SocketOsCodeOnly', { code: S.String })
export type SocketOsCodeOnly = typeof SocketOsCodeOnly.Type

/** Neither field: the cause is not a Node OS error, so a report has nothing to name. */
export const SocketOsUnrecognized = S.TaggedStruct('SocketOsUnrecognized', {})
export type SocketOsUnrecognized = typeof SocketOsUnrecognized.Type

/** The cases a Node OS error decodes into: the fields the raise actually carried. */
export const SocketOsErrorCase = S.Union([
  SocketOsErrnoAndCode,
  SocketOsErrnoOnly,
  SocketOsCodeOnly,
  SocketOsUnrecognized,
])
export type SocketOsErrorCase = typeof SocketOsErrorCase.Type

/** Node's own `ErrnoException` shape, the encoded side of every case. */
type NodeOsErrorShape = {
  readonly code?: string | undefined
  readonly errno?: number | undefined
}

const osErrorCaseOf = (shape: NodeOsErrorShape): SocketOsErrorCase =>
  Option.match(Option.fromNullishOr(shape.errno), {
    onNone: () =>
      Option.match(Option.fromNullishOr(shape.code), {
        onNone: () => SocketOsUnrecognized.make({}),
        onSome: (code) => SocketOsCodeOnly.make({ code }),
      }),
    onSome: (errno) =>
      Option.match(Option.fromNullishOr(shape.code), {
        onNone: () => SocketOsErrnoOnly.make({ errno }),
        onSome: (code) => SocketOsErrnoAndCode.make({ errno, code }),
      }),
  })

const nodeShapeOf = (osError: SocketOsErrorCase): NodeOsErrorShape =>
  Match.value(osError).pipe(
    Match.tag('SocketOsErrnoAndCode', (both) => ({ code: both.code, errno: both.errno })),
    Match.tag('SocketOsErrnoOnly', (numbered) => ({ errno: numbered.errno })),
    Match.tag('SocketOsCodeOnly', (named) => ({ code: named.code })),
    Match.tag('SocketOsUnrecognized', () => ({})),
    Match.exhaustive,
  )

/** Every Node shape a raise can take, paired with the label the round-trip property draws it by. */
const NodeShapeByLabel: ReadonlyArray<readonly [string, NodeOsErrorShape]> = [
  ['both', { code: 'ECONNREFUSED', errno: -111 }],
  ['errno-only', { errno: -111 }],
  ['code-only', { code: 'ECONNREFUSED' }],
  ['neither', {}],
]

export const SocketOsError = S.Struct({
  code: S.optional(S.String),
  errno: S.optional(S.Int),
}).pipe(
  S.decodeTo(SocketOsErrorCase, SchemaTransformation.transform({ decode: osErrorCaseOf, encode: nodeShapeOf })),
)
export type SocketOsError = typeof SocketOsError.Type

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and a static import would enter the published
  // module graph.
  const { it } = await import('@systemfsoftware/vitest')

  const decodeOsError = S.decodeUnknownOption(SocketOsError)
  const encodeOsError = S.encodeUnknownOption(SocketOsError)

  const shapeOfLabel = (label: string): NodeOsErrorShape =>
    Option.getOrElse(
      Option.map(
        Option.fromNullishOr(NodeShapeByLabel.find(([candidate]) => candidate === label)),
        (entry) => entry[1],
      ),
      () => ({}),
    )

  /** The case the union declares for this shape, and no other case. */
  const decodesToItsCase = (decoded: SocketOsError, label: string): boolean =>
    Match.value(label).pipe(
      Match.when('both', () => S.is(SocketOsErrnoAndCode)(decoded)),
      Match.when('errno-only', () => S.is(SocketOsErrnoOnly)(decoded)),
      Match.when('code-only', () => S.is(SocketOsCodeOnly)(decoded)),
      Match.when('neither', () => S.is(SocketOsUnrecognized)(decoded)),
      Match.orElse(() => false),
    )

  /** The encoded side Node would have raised: the same fields, and no others. */
  const encodesTo = (encoded: NodeOsErrorShape, shape: NodeOsErrorShape): boolean =>
    [
      Object.keys(encoded).length === Object.keys(shape).length,
      encoded.code === shape.code,
      encoded.errno === shape.errno,
    ].every((clause) => clause)

  const roundTrips = (subject: typeof decodeOsError, label: string): boolean => {
    const shape = shapeOfLabel(label)
    return Option.match(subject(shape), {
      onNone: () => false,
      onSome: (decoded) =>
        [
          decodesToItsCase(decoded, label),
          Option.match(encodeOsError(decoded), {
            onNone: () => false,
            onSome: (encoded) => encodesTo(encoded, shape),
          }),
        ].every((clause) => clause),
    })
  }

  it.prop(
    '∀n_NodeShape_≡OsErrorCase',
    { of: [S.Literals(NodeShapeByLabel.map(([label]) => label))], subject: decodeOsError },
    (subject, [label]) => roundTrips(subject, label),
  )
}
