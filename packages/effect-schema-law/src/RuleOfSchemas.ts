import { it } from '@effect/vitest'
import { Equivalence, Function, Option, Schema, Schema as S, SchemaAST } from 'effect'

type CodecPair<A, I> = {
  readonly decode: (value: I) => Option.Option<A>
  readonly encode: (value: A) => Option.Option<I>
}

const encodeStableOf = <A, I>(
  codec: CodecPair<A, I>,
  encodedEq: Equivalence.Equivalence<I>,
): (value: A) => boolean =>
(value: A): boolean =>
  codec.encode(value).pipe(
    Option.flatMap(codec.decode),
    Option.flatMap(codec.encode),
    Option.match({
      onNone: () => false,
      onSome: (enc) =>
        codec.encode(value).pipe(
          Option.match({
            onNone: () => false,
            onSome: (orig) => encodedEq(enc, orig),
          }),
        ),
    }),
  )

const roundTripOf = <A, I>(codec: CodecPair<A, I>): (value: A) => Option.Option<A> => (value: A): Option.Option<A> =>
  codec.encode(value).pipe(Option.flatMap(codec.decode))

const identitiesHold = <A>(
  typeEq: Equivalence.Equivalence<A>,
  value: A,
  twin: A,
  back: A,
  backTwin: A,
): boolean => typeEq(back, value) && typeEq(backTwin, twin)

const distinctnessHolds = <A>(
  typeEq: Equivalence.Equivalence<A>,
  value: A,
  twin: A,
  back: A,
  backTwin: A,
): boolean => typeEq(back, backTwin) === typeEq(value, twin)

const apartVerdict = <A>(
  typeEq: Equivalence.Equivalence<A>,
  value: A,
  twin: A,
  back: A,
  backTwin: A,
): boolean =>
  identitiesHold(typeEq, value, twin, back, backTwin) && distinctnessHolds(typeEq, value, twin, back, backTwin)

const roundTripBack = <A, I>(
  codec: CodecPair<A, I>,
  value: A,
  verify: (back: A) => boolean,
): boolean =>
  Option.match(roundTripOf(codec)(value), {
    onNone: () => false,
    onSome: verify,
  })

const roundTripPair = <A, I>(
  codec: CodecPair<A, I>,
  typeEq: Equivalence.Equivalence<A>,
  value: A,
  twin: A,
): boolean =>
  roundTripBack(
    codec,
    value,
    (back) => roundTripBack(codec, twin, (backTwin) => apartVerdict(typeEq, value, twin, back, backTwin)),
  )

const roundTripsOf = <A, I>(
  codec: CodecPair<A, I>,
  typeEq: Equivalence.Equivalence<A>,
): (value: A, twin: A) => boolean =>
(value: A, twin: A): boolean => roundTripPair(codec, typeEq, value, twin)

const SINGLE_ATOMS: ReadonlyArray<(ast: SchemaAST.AST) => boolean> = [
  SchemaAST.isLiteral,
  SchemaAST.isVoid,
  SchemaAST.isUndefined,
  SchemaAST.isNull,
  SchemaAST.isUniqueSymbol,
]

const isAtomicSingle = (ast: SchemaAST.AST): boolean => SINGLE_ATOMS.some((isAtom) => isAtom(ast))

const singleValueIfAtom = (ast: SchemaAST.AST): boolean | undefined => isAtomicSingle(ast) ? true : undefined

const singleValueIfSuspend = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean | undefined =>
  SchemaAST.isSuspend(ast) ? singleValueWithin(ast.thunk(), path) : undefined

const singleValueIfUnion = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean | undefined =>
  SchemaAST.isUnion(ast) ? singleUnionMember(ast, path) : undefined

const singleValueIfObjects = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean | undefined =>
  SchemaAST.isObjects(ast) ? singleObject(ast, path) : undefined

const singleValueIfDeclaration = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean | undefined =>
  SchemaAST.isDeclaration(ast) ? singleDeclaration(ast, path) : undefined

const orElse = <A>(value: A | undefined, fallback: A): A => value !== undefined ? value : fallback

const singleValueStep = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean =>
  orElse(
    orElse(singleValueIfAtom(ast), singleValueIfSuspend(ast, path)),
    orElse(
      orElse(singleValueIfUnion(ast, path), singleValueIfObjects(ast, path)),
      orElse(singleValueIfDeclaration(ast, path), false),
    ),
  )

const singleValueWithin = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean => {
  if (path.has(ast)) return false
  path.add(ast)
  const verdict = singleValueStep(ast, path)
  path.delete(ast)
  return verdict
}

const onlyMember = (types: ReadonlyArray<SchemaAST.AST>): SchemaAST.AST | undefined => {
  const [only, ...rest] = types
  return rest.length === 0 ? only : undefined
}

const singleUnionMember = (ast: SchemaAST.Union, path: Set<SchemaAST.AST>): boolean => {
  const only = onlyMember(ast.types)
  return only === undefined ? false : singleValueWithin(only, path)
}

const everyFieldSingle = (ast: SchemaAST.Objects, path: Set<SchemaAST.AST>): boolean =>
  ast.propertySignatures.every((signature) => singleValueWithin(signature.type, path))

const singleObject = (ast: SchemaAST.Objects, path: Set<SchemaAST.AST>): boolean =>
  ast.indexSignatures.length === 0 && everyFieldSingle(ast, path)

const everyParameterSingle = (ast: SchemaAST.Declaration, path: Set<SchemaAST.AST>): boolean =>
  ast.typeParameters.every((parameter) => singleValueWithin(parameter, path))

const singleDeclaration = (ast: SchemaAST.Declaration, path: Set<SchemaAST.AST>): boolean =>
  ast.typeParameters.length > 0 && everyParameterSingle(ast, path)

const isSingleInhabitant = (ast: SchemaAST.AST): boolean => singleValueWithin(ast, new Set<SchemaAST.AST>())

const RUNS = 100

const SINGLE_INHABITANT_REASON = 'single-inhabitant schema: a constant codec is correct'

export const ruleOfSchemas: {
  (name: string): <A, I>(schema: S.Codec<A, I>) => void
  <A, I>(name: string, schema: S.Codec<A, I>): void
} = Function.dual(
  2,
  <A, I>(
    name: string,
    schema: S.Codec<A, I>,
  ): void => {
    const typeEq = S.toEquivalence(schema)
    const encodedEq = S.toEquivalence(S.toEncoded(schema))
    const subject: CodecPair<A, I> = {
      decode: Schema.decodeOption(schema),
      encode: Schema.encodeOption(schema),
    }

    if (isSingleInhabitant(schema.ast)) {
      it.law.deterministic(
        `∀x_${name}_=x (${SINGLE_INHABITANT_REASON})`,
        { of: [schema], subject: roundTripOf(subject), runs: RUNS },
      )
      return
    }

    it.prop(
      `∀x_${name}Enc_=x`,
      { of: [schema], subject, runs: RUNS },
      (codec, [value]) => encodeStableOf(codec, encodedEq)(value),
    )

    it.prop(
      `∀x_${name}_=x`,
      { of: [schema, schema], subject, runs: RUNS },
      (codec, [value, twin]) => roundTripsOf(codec, typeEq)(value, twin),
    )
  },
)
