import { it } from '@systemfsoftware/vitest'
import {
  Effect,
  Equivalence,
  Match,
  Option,
  Predicate,
  Schema as S,
  SchemaAST,
  SchemaGetter,
  SchemaIssue,
} from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import { TestRunner } from 'vitest'
import { type CodecStep, decodeStep, encodeStep } from './codec-step.js'
import { LawDrawFailed, LawErred, LawRefuted } from './law-failure.schema.js'
import { instancedProp, LAW_MAX_SIZE, type LawVerdict, prop, runLaw, skipIfUninstanced } from './property.js'

/** What a full round trip of one `Type` value found. `back` is present only when the draw was an instance. */
type RoundTrip<A> =
  | { readonly holds: boolean; readonly instance: true; readonly back: A }
  | { readonly holds: boolean; readonly instance: false }

interface LawSubject<A, I> {
  readonly schema: S.Codec<A, I>
  readonly typeEq: Equivalence.Equivalence<A>
  readonly encodedEq: Equivalence.Equivalence<I>
}

const subjectOf = <A, I>(schema: S.Codec<A, I>): LawSubject<A, I> => ({
  schema,
  typeEq: S.toEquivalence(schema),
  encodedEq: S.toEquivalence(S.toEncoded(schema)),
})

const noRoundTrip = <A>(): RoundTrip<A> => ({ holds: true, instance: false })

const failedRoundTrip = <A>(): RoundTrip<A> => ({ holds: false, instance: false })

const nonValueRoundTrip = <A>(step: CodecStep<unknown>): RoundTrip<A> =>
  step._tag === 'Refused' ? noRoundTrip() : failedRoundTrip()

const allOf = (conditions: ReadonlyArray<boolean>): boolean => conditions.every((condition) => condition)

const anyOf = (conditions: ReadonlyArray<boolean>): boolean => conditions.some((condition) => condition)

const reencodedMatches = <A, I>(subject: LawSubject<A, I>, back: A, encoded: I): boolean => {
  const reencoded = encodeStep(subject.schema)(back)
  return reencoded._tag === 'Value' ? subject.encodedEq(reencoded.value, encoded) : false
}

const completedRoundTrip = <A, I>(subject: LawSubject<A, I>, value: A, encoded: I, back: A): RoundTrip<A> => ({
  holds: allOf([subject.typeEq(back, value), reencodedMatches(subject, back, encoded)]),
  instance: true,
  back,
})

const decodedRoundTrip = <A, I>(subject: LawSubject<A, I>, value: A, encoded: I): RoundTrip<A> => {
  const decoded = decodeStep(subject.schema)(encoded)
  return decoded._tag === 'Value'
    ? completedRoundTrip(subject, value, encoded, decoded.value)
    : nonValueRoundTrip(decoded)
}

/** R5: encode `value` and decode what it produced; a refusal means the value has no round trip to state. */
const roundTripOf = <A, I>(subject: LawSubject<A, I>, value: A): RoundTrip<A> => {
  const encoded = encodeStep(subject.schema)(value)
  return encoded._tag === 'Value' ? decodedRoundTrip(subject, value, encoded.value) : nonValueRoundTrip(encoded)
}

const backOption = <A>(trip: RoundTrip<A>): Option.Option<A> => trip.instance ? Option.some(trip.back) : Option.none()

const distinctnessHolds = <A, I>(
  subject: LawSubject<A, I>,
  left: RoundTrip<A>,
  right: RoundTrip<A>,
  value: A,
  twin: A,
): boolean =>
  Option.match(Option.all([backOption(left), backOption(right)]), {
    onNone: () => true,
    onSome: ([leftBack, rightBack]) => subject.typeEq(leftBack, rightBack) === subject.typeEq(value, twin),
  })

const encodeLawVerdict = <A, I>(subject: LawSubject<A, I>, refusalTitle: boolean, value: A): LawVerdict => {
  const trip = roundTripOf(subject, value)
  return { holds: trip.holds, instance: refusalTitle ? true : trip.instance }
}

const pairLawVerdict = <A, I>(subject: LawSubject<A, I>, refusalTitle: boolean, value: A, twin: A): LawVerdict => {
  const left = roundTripOf(subject, value)
  const right = roundTripOf(subject, twin)
  return {
    holds: allOf([left.holds, right.holds, distinctnessHolds(subject, left, right, value, twin)]),
    instance: refusalTitle ? true : anyOf([left.instance, right.instance]),
  }
}

const decodedTwice = <A, I>(subject: LawSubject<A, I>, first: A, second: A): LawVerdict => {
  const accepted = roundTripOf(subject, first)
  return { holds: allOf([subject.typeEq(first, second), accepted.holds]), instance: true }
}

const sameOutcome = <A>(first: CodecStep<A>, second: CodecStep<A>): boolean => first._tag === second._tag

const decodedSecond = <A, I>(subject: LawSubject<A, I>, first: A, second: CodecStep<A>): LawVerdict =>
  second._tag === 'Value' ? decodedTwice(subject, first, second.value) : { holds: false, instance: false }

const decodeLawVerdict = <A, I>(subject: LawSubject<A, I>, input: I): LawVerdict => {
  const first = decodeStep(subject.schema)(input)
  const second = decodeStep(subject.schema)(input)
  return first._tag === 'Value'
    ? decodedSecond(subject, first.value, second)
    : { holds: sameOutcome(first, second), instance: false }
}

const encodedSecond = <A, I>(subject: LawSubject<A, I>, first: I, second: CodecStep<I>): LawVerdict =>
  second._tag === 'Value'
    ? { holds: subject.encodedEq(first, second.value), instance: true }
    : { holds: false, instance: false }

const encodeDeterminismVerdict = <A, I>(subject: LawSubject<A, I>, value: A): LawVerdict => {
  const first = encodeStep(subject.schema)(value)
  const second = encodeStep(subject.schema)(value)
  return first._tag === 'Value'
    ? encodedSecond(subject, first.value, second)
    : { holds: sameOutcome(first, second), instance: false }
}

const SAMPLE_VALUES = 3

const SAMPLE_SEED = 0

interface Observation {
  readonly encodeRefused: boolean
  readonly decodeRefused: boolean
}

const NO_REFUSAL: Observation = { encodeRefused: false, decodeRefused: false }

const sampleValuesOf = <A, I>(schema: S.Codec<A, I>): ReadonlyArray<A> => {
  const arbitrary = Arbitrary.schema(schema)
  const values: Array<A> = []
  for (let size = 0; size <= LAW_MAX_SIZE; size++) {
    values.push(...Effect.runSync(Arbitrary.sampleEffect(arbitrary, { count: SAMPLE_VALUES, seed: SAMPLE_SEED, size })))
  }
  return values
}

const decodeObservation = <A, I>(schema: S.Codec<A, I>, observed: Observation, encoded: I): Observation =>
  decodeStep(schema)(encoded)._tag === 'Refused' ? { ...observed, decodeRefused: true } : observed

const encodeObservation = (observed: Observation, refused: boolean): Observation =>
  refused ? { ...observed, encodeRefused: true } : observed

const valueObservation = <A, I>(schema: S.Codec<A, I>, observed: Observation, value: A): Observation => {
  const encoded = encodeStep(schema)(value)
  return encoded._tag === 'Value'
    ? decodeObservation(schema, observed, encoded.value)
    : encodeObservation(observed, encoded._tag === 'Refused')
}

const valuesObservation = <A, I>(schema: S.Codec<A, I>, values: ReadonlyArray<A>): Observation =>
  values.reduce<Observation>((observed, value) => valueObservation(schema, observed, value), NO_REFUSAL)

/** R8: the registration sample observes a refusal, or neither; a sample that cannot run synchronously observes neither. */
const observeOneWay = <A, I>(schema: S.Codec<A, I>): Observation => {
  try {
    return valuesObservation(schema, sampleValuesOf(schema))
  } catch {
    return NO_REFUSAL
  }
}

const refusalObserved = (observation: Observation): boolean => observation.encodeRefused || observation.decodeRefused

const SINGLE_ATOMS: ReadonlyArray<(ast: SchemaAST.AST) => boolean> = [
  SchemaAST.isLiteral,
  SchemaAST.isVoid,
  SchemaAST.isUndefined,
  SchemaAST.isNull,
  SchemaAST.isUniqueSymbol,
]

const isAtomicSingle = (ast: SchemaAST.AST): boolean => SINGLE_ATOMS.some((isAtom) => isAtom(ast))

const singleValueStep = (ast: SchemaAST.AST, path: Set<SchemaAST.AST>): boolean =>
  Match.value(ast).pipe(
    Match.when(SchemaAST.isSuspend, (suspend) => singleValueWithin(suspend.thunk(), path)),
    Match.when(SchemaAST.isUnion, (union) => singleUnionMember(union, path)),
    Match.when(SchemaAST.isObjects, (objects) => singleObject(objects, path)),
    Match.when(SchemaAST.isDeclaration, (declaration) => singleDeclaration(declaration, path)),
    Match.orElse(isAtomicSingle),
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

const encodingLinkOf = (ast: SchemaAST.Declaration): SchemaAST.Link | undefined => ast.encoding?.[0]

const encodesTo = (ast: SchemaAST.Declaration, parameter: SchemaAST.AST): boolean =>
  encodingLinkOf(ast)?.to === parameter

const wrapsItsParameter = (ast: SchemaAST.Declaration): boolean => {
  const [parameter] = ast.typeParameters
  return parameter !== undefined && encodesTo(ast, parameter)
}

const singleDeclaration = (ast: SchemaAST.Declaration, path: Set<SchemaAST.AST>): boolean =>
  wrapsItsParameter(ast) && everyParameterSingle(ast, path)

const isSingleInhabitant = (ast: SchemaAST.AST): boolean => singleValueWithin(ast, new Set<SchemaAST.AST>())

/** A codec law pair's property budget; `runs` overrides the configured default for both laws. */
export interface RuleOfSchemasOptions {
  readonly runs?: number | undefined
}

const SINGLE_INHABITANT_REASON = 'single-inhabitant schema: a constant codec is correct'

const NO_ROUND_TRIP_REASON =
  'no drawn value completed a round trip: every value the generator drew was refused by the codec'

const NO_DECODE_REASON =
  'no drawn Encoded value decoded: declare the wire format on the Encoded side so the generator can draw it, or write the transformation over the parsed value; until then only examples or contract cases exercise the decoder'

const NO_ENCODE_REASON = 'no drawn value encoded: every value the Type side generated was refused by the encoder'

const budgetOf = (options: RuleOfSchemasOptions | undefined): number | undefined =>
  options === undefined ? undefined : options.runs

const encodeTitleOf = (name: string, refusalTitle: boolean): string =>
  refusalTitle ? `∀x_${name}Enc_→Forbidden|=x` : `∀x_${name}Enc_=x`

const pairTitleOf = (name: string, refusalTitle: boolean): string =>
  refusalTitle ? `∀x_${name}_→Forbidden|=x` : `∀x_${name}_=x`

const registerTypeLaws = <A, I>(
  name: string,
  subject: LawSubject<A, I>,
  refusalTitle: boolean,
  runs: number | undefined,
): void => {
  instancedProp(
    encodeTitleOf(name, refusalTitle),
    { of: [subject.schema], subject, runs },
    (lawSubject, [value]) => encodeLawVerdict(lawSubject, refusalTitle, value),
    NO_ROUND_TRIP_REASON,
  )
  instancedProp(
    pairTitleOf(name, refusalTitle),
    { of: [subject.schema, subject.schema], subject, runs },
    (lawSubject, [value, twin]) => pairLawVerdict(lawSubject, refusalTitle, value, twin),
    NO_ROUND_TRIP_REASON,
  )
}

const registerDecodeLaw = <A, I>(name: string, subject: LawSubject<A, I>, runs: number | undefined): void => {
  instancedProp(
    `∀i_${name}Dec_→Deterministic`,
    { of: [S.toEncoded(subject.schema)], subject, runs },
    (lawSubject, [input]) => decodeLawVerdict(lawSubject, input),
    NO_DECODE_REASON,
  )
}

const registerEncodeLaw = <A, I>(name: string, subject: LawSubject<A, I>, runs: number | undefined): void => {
  instancedProp(
    `∀x_${name}Enc_→Deterministic`,
    { of: [subject.schema], subject, runs },
    (lawSubject, [value]) => encodeDeterminismVerdict(lawSubject, value),
    NO_ENCODE_REASON,
  )
}

const registerDecodeLawIfRefused = <A, I>(
  name: string,
  subject: LawSubject<A, I>,
  refused: boolean,
  runs: number | undefined,
): void => {
  if (refused) registerDecodeLaw(name, subject, runs)
}

const registerEncodeLawIfRefused = <A, I>(
  name: string,
  subject: LawSubject<A, I>,
  refused: boolean,
  runs: number | undefined,
): void => {
  if (refused) registerEncodeLaw(name, subject, runs)
}

const registerSurvivingLaws = <A, I>(
  name: string,
  subject: LawSubject<A, I>,
  observation: Observation,
  runs: number | undefined,
): void => {
  registerDecodeLawIfRefused(name, subject, observation.encodeRefused, runs)
  registerEncodeLawIfRefused(name, subject, observation.decodeRefused, runs)
}

const singleInhabitantVerdict = <A, I>(subject: LawSubject<A, I>, value: A): LawVerdict => {
  const trip = roundTripOf(subject, value)
  return { holds: trip.holds, instance: trip.instance }
}

const registerSingleInhabitant = <A, I>(name: string, subject: LawSubject<A, I>): void => {
  instancedProp(
    `∀x_${name}_=x (${SINGLE_INHABITANT_REASON})`,
    { of: [subject.schema], subject },
    (lawSubject, [value]) => singleInhabitantVerdict(lawSubject, value),
    NO_ROUND_TRIP_REASON,
  )
}

const lawsOf = <A, I>(name: string, schema: S.Codec<A, I>, options?: RuleOfSchemasOptions): void => {
  const subject = subjectOf(schema)
  const observation = observeOneWay(schema)
  const shortcut = allOf([isSingleInhabitant(schema.ast), !refusalObserved(observation)])
  if (shortcut) return registerSingleInhabitant(name, subject)
  const runs = budgetOf(options)
  registerTypeLaws(name, subject, refusalObserved(observation), runs)
  registerSurvivingLaws(name, subject, observation, runs)
}

export function ruleOfSchemas(name: string): <A, I>(schema: S.Codec<A, I>, options?: RuleOfSchemasOptions) => void
export function ruleOfSchemas<A, I>(
  name: string,
  schema: S.Codec<A, I>,
  options?: RuleOfSchemasOptions,
): void
export function ruleOfSchemas<A, I>(
  name: string,
  schema?: S.Codec<A, I>,
  options?: RuleOfSchemasOptions,
): void | ((curried: S.Codec<A, I>, curriedOptions?: RuleOfSchemasOptions) => void) {
  if (schema === undefined) {
    return (curried: S.Codec<A, I>, curriedOptions?: RuleOfSchemasOptions): void =>
      lawsOf(name, curried, curriedOptions)
  }
  return lawsOf(name, schema, options)
}

if (import.meta.vitest !== void 0) {
  const Lit = S.Literal(1)

  class WrappedLiteral extends S.Class<WrappedLiteral>('WrappedLiteral')({ a: Lit }) {}
  class WrappedEmpty extends S.TaggedClass<WrappedEmpty>()('WrappedEmpty', {}) {}
  class WrappedWide extends S.Class<WrappedWide>('WrappedWide')({ n: S.Int }) {}

  interface VariableBox {
    readonly contents: number
  }

  const isVariableBox = (input: unknown): input is VariableBox =>
    Predicate.hasProperty(input, 'contents') && Predicate.isNumber(input.contents)

  const VariableBox = S.declare(isVariableBox)

  const ArbitraryVariableBox = S.declare(isVariableBox, {
    toCodecArbitrary: () =>
      S.link<VariableBox>()(S.Int, {
        decode: SchemaGetter.transform((contents: number): VariableBox => ({ contents })),
        encode: SchemaGetter.transform((box: VariableBox): number => box.contents),
      }),
  })

  const DECLARED_INHABITANCE: ReadonlyArray<{ readonly ast: SchemaAST.AST; readonly single: boolean }> = [
    { ast: VariableBox.ast, single: false },
    { ast: ArbitraryVariableBox.ast, single: false },
    { ast: S.instanceOf(URL).ast, single: false },
    { ast: S.Option(Lit).ast, single: false },
    { ast: S.Chunk(Lit).ast, single: false },
    { ast: S.ReadonlySet(Lit).ast, single: false },
    { ast: S.ReadonlyMap(S.Literal('a'), Lit).ast, single: false },
    { ast: S.Result(Lit, S.Literal(2)).ast, single: false },
    { ast: WrappedLiteral.ast, single: true },
    { ast: WrappedEmpty.ast, single: true },
    { ast: WrappedWide.ast, single: false },
  ]

  const DeclarationIndex = S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: DECLARED_INHABITANCE.length - 1 })))

  prop(
    '∀s_DeclarationInhabitance_=Declared',
    { of: [DeclarationIndex], subject: { isSingleInhabitant } },
    (subject, [index]) => {
      const declared = DECLARED_INHABITANCE[index]
      if (declared === undefined) return false
      return subject.isSingleInhabitant(declared.ast) === declared.single
    },
  )

  const registeredTaskCount = (): number => TestRunner.getCurrentSuite().tasks.length

  const lawsRegisteredBy = (register: () => void): number => {
    const before = registeredTaskCount()
    register()
    return registeredTaskCount() - before
  }

  const titlesOf = (register: () => void): ReadonlyArray<string> => {
    const before = registeredTaskCount()
    register()
    return TestRunner.getCurrentSuite().tasks.slice(before).map((task) => task.name)
  }

  const titlesLaw = (name: string, titles: ReadonlyArray<string>, expected: ReadonlyArray<string>): void =>
    prop(
      name,
      { of: [S.Literal(0)], subject: titles },
      (registered) => registered.join('\n') === expected.join('\n'),
    )

  const firstOf = <A>(values: ReadonlyArray<A>, fallback: A): A => values[0] ?? fallback

  const digestOf = (content: string): string => content.split('').map((char) => char.charCodeAt(0)).join('')

  const ContentDigest = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform(digestOf),
      encode: SchemaGetter.forbidden<string, string>(() => 'a digest cannot be turned back into its content'),
    }),
  )

  const DIGEST_TITLES = titlesOf(() => ruleOfSchemas('ContentDigest', ContentDigest))

  titlesLaw('∀t_ContentDigestLaws_→RefusalTitles', DIGEST_TITLES, [
    '∀x_ContentDigestEnc_→Forbidden|=x',
    '∀x_ContentDigest_→Forbidden|=x',
    '∀i_ContentDigestDec_→Deterministic',
  ])

  const Email = S.String.pipe(S.brand('Email'))

  const NumberFromString = S.String.pipe(
    S.decodeTo(S.Number, {
      decode: SchemaGetter.transform((text: string) => Number(text)),
      encode: SchemaGetter.transform((value: number) => String(value)),
    }),
  )

  const TWO_WAY_TITLES = titlesOf(() => {
    ruleOfSchemas('Email', Email)
    ruleOfSchemas('NumberFromString', NumberFromString)
  })

  titlesLaw('∀t_TwoWayLaws_=RoundTripTitles', TWO_WAY_TITLES, [
    '∀x_EmailEnc_=x',
    '∀x_Email_=x',
    '∀x_NumberFromStringEnc_=x',
    '∀x_NumberFromString_=x',
  ])

  const DigestArray = S.Array(ContentDigest)

  const HYBRID_TITLES = titlesOf(() => ruleOfSchemas('DigestArray', DigestArray))

  titlesLaw('∀t_HybridLaws_→ForbiddenTitles', HYBRID_TITLES, [
    '∀x_DigestArrayEnc_→Forbidden|=x',
    '∀x_DigestArray_→Forbidden|=x',
    '∀i_DigestArrayDec_→Deterministic',
  ])

  prop(
    '∀a_EmptyDigestArray_→RoundTrip',
    { of: [S.Literal(0)], subject: subjectOf(DigestArray) },
    (subject) => roundTripOf(subject, []).holds,
  )

  const SingleForbidden = S.Literal(1).pipe(
    S.decodeTo(S.Literal(1), {
      decode: SchemaGetter.transform((): 1 => 1),
      encode: SchemaGetter.forbidden<1, 1>(() => 'a constant is not written back'),
    }),
  )

  titlesLaw(
    '∀t_SingleForbiddenLaws_→ForbiddenTitles',
    titlesOf(() => ruleOfSchemas('SingleForbidden', SingleForbidden)),
    [
      '∀x_SingleForbiddenEnc_→Forbidden|=x',
      '∀x_SingleForbidden_→Forbidden|=x',
      '∀i_SingleForbiddenDec_→Deterministic',
    ],
  )

  const RARELY_REFUSED = 'the-one-value-the-encoder-refuses'

  const RarelyRefused = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: string) => value),
      encode: SchemaGetter.transformEffect<string, string>((value) =>
        value === RARELY_REFUSED
          ? Effect.fail(new SchemaIssue.Forbidden({ message: 'refused' }))
          : Effect.succeed(value)
      ),
    }),
  )

  titlesLaw('∀t_RarelyRefusedLaws_=RoundTripTitles', titlesOf(() => ruleOfSchemas('RarelyRefused', RarelyRefused)), [
    '∀x_RarelyRefusedEnc_=x',
    '∀x_RarelyRefused_=x',
  ])

  prop(
    '∀x_RarelyRefusedDraw_→Held',
    {
      of: [S.Literal(RARELY_REFUSED)],
      subject: {
        observation: observeOneWay(RarelyRefused),
        holds: (value: string) => roundTripOf(subjectOf(RarelyRefused), value).holds,
      },
    },
    (subject, [value]) => subject.observation.encodeRefused === false && subject.holds(value),
  )

  const JsonDigest = S.fromJsonString(ContentDigest)

  titlesOf(() => ruleOfSchemas('JsonDigest', JsonDigest))

  const EncodeOnly = S.flip(ContentDigest)

  titlesLaw('∀t_EncodeOnlyLaws_→RefusalAndEncodeTitles', titlesOf(() => ruleOfSchemas('EncodeOnly', EncodeOnly)), [
    '∀x_EncodeOnlyEnc_→Forbidden|=x',
    '∀x_EncodeOnly_→Forbidden|=x',
    '∀x_EncodeOnlyEnc_→Deterministic',
  ])

  const REGISTERED_LAWS: ReadonlyArray<{ readonly registered: number; readonly expected: number }> = [
    { registered: lawsRegisteredBy(() => ruleOfSchemas('VariableBox', ArbitraryVariableBox)), expected: 2 },
    {
      registered: lawsRegisteredBy(() => ruleOfSchemas('WrappedLiteral', WrappedLiteral)),
      expected: 1,
    },
    { registered: lawsRegisteredBy(() => ruleOfSchemas('WrappedWide', WrappedWide)), expected: 2 },
  ]

  const RegistrationIndex = S.Int.pipe(S.check(S.isBetween({ minimum: 0, maximum: REGISTERED_LAWS.length - 1 })))

  prop(
    '∀s_RuleOfSchemasLawCount_=Declared',
    { of: [RegistrationIndex], subject: REGISTERED_LAWS },
    (registrations, [index]) => {
      const registration = registrations[index]
      if (registration === undefined) return false
      return registration.registered === registration.expected
    },
  )

  prop(
    '∀b_ConstantCodecDistinctness_→Refuted',
    {
      of: [ArbitraryVariableBox, ArbitraryVariableBox],
      subject: subjectOf(ArbitraryVariableBox),
    },
    (subject, [value, twin]) =>
      subject.typeEq(value, twin) ||
      !distinctnessHolds(
        subject,
        { holds: true, instance: true, back: value },
        { holds: true, instance: true, back: value },
        value,
        twin,
      ),
  )

  const InvalidEncode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: string) => value),
      encode: SchemaGetter.transformEffect<string, string>(() =>
        Effect.fail(new SchemaIssue.InvalidValue({ message: 'encode is broken' }))
      ),
    }),
  )

  const isWireLiteral = (value: string): value is 'a' | 'b' => value.length > 0

  const rejectedWireLiteral = (): 'a' | 'b' => {
    const text: string = 'c'
    if (isWireLiteral(text)) return text
    return 'a'
  }

  const EncodedSideRejected = S.Union([S.Literal('a'), S.Literal('b')]).pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: 'a' | 'b') => value),
      encode: SchemaGetter.transform((_value: string) => rejectedWireLiteral()),
    }),
  )

  const MixedEncode = S.Struct({ digest: ContentDigest, broken: InvalidEncode })

  const WrongInverse = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: string) => value),
      encode: SchemaGetter.transform((value: string) => `${value}!`),
    }),
  )

  const OneWayUnion = S.Union([ContentDigest, WrongInverse])

  let decodeCount = 0

  const CountingDecode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform(() => {
        decodeCount += 1
        return `decode-${String(decodeCount)}`
      }),
      encode: SchemaGetter.transform((value: string) => value),
    }),
  )

  const ThrowingDecode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((): string => {
        throw new Error('decode is broken')
      }),
      encode: SchemaGetter.transform((value: string) => value),
    }),
  )

  const LyingDecode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((): string => ''),
      encode: SchemaGetter.checkEffect<string>((value) =>
        Effect.succeed(value.length === 0 ? 'must be non-empty' : undefined)
      ),
    }),
  )

  const ThrowingEncode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: string) => value),
      encode: SchemaGetter.transform((): string => {
        throw new Error('encode is broken')
      }),
    }),
  )

  const AsyncEncode = S.String.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((value: string) => value),
      encode: SchemaGetter.transformEffect<string, string>((value) => Effect.sleep('1 millis').pipe(Effect.as(value))),
    }),
  )

  interface Opaque {
    readonly raw: string
  }

  const isOpaque = (input: unknown): input is Opaque =>
    Predicate.hasProperty(input, 'raw') && Predicate.isString(input.raw)

  const OpaqueWire = S.declare(isOpaque)

  const OpaqueOneWay = OpaqueWire.pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.transform((wire: Opaque) => wire.raw),
      encode: SchemaGetter.forbidden<Opaque, string>(() => 'the wire shape is not written back'),
    }),
  )

  it('Should_PassTheDecodeLawWithInstances_When_TheDocumentationContentDigestIsLawTested', function*({ expect }) {
    const subject = subjectOf(ContentDigest)
    const instanced = yield* Effect.promise(() =>
      runLaw(
        '∀i_ContentDigestDec_→Deterministic',
        [S.String],
        (values) => Effect.sync(() => decodeLawVerdict(subject, firstOf(values, ''))),
        20,
      )
    )
    yield* expect(instanced ? 'instance' : 'none').toEqual('instance')
  })

  it('Should_RefuteTheEncodeLaw_When_TheEncodeFailsWithANonForbiddenIssue', function*({ expect }) {
    const subject = subjectOf(InvalidEncode)
    yield* expect(encodeStep(subject.schema)('value')._tag).toEqual('Failed')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_InvalidEncodeEnc_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_RefuteTheEncodeLaw_When_TheEncodedSideRejectsItsOwnEncoderOutput', function*({ expect }) {
    const subject = subjectOf(EncodedSideRejected)
    yield* expect(encodeStep(subject.schema)('value')._tag).toEqual('Failed')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_EncodedSideRejectedEnc_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_RefuteTheEncodeLaw_When_AForbiddenFieldSitsBesideAFailingField', function*({ expect }) {
    const subject = subjectOf(MixedEncode)
    yield* expect(encodeStep(subject.schema)({ digest: 'abc', broken: 'value' })._tag).toEqual('Failed')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_MixedEncodeEnc_=x',
        [S.Literal(0)],
        () => Effect.sync(() => encodeLawVerdict(subject, false, { digest: 'abc', broken: 'value' })),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_ReportLawErred_When_TheEncodeThrows', function*({ expect }) {
    const subject = subjectOf(ThrowingEncode)
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_ThrowingEncodeEnc_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawErred, 'the law reports the defect')
  })

  it('Should_RefuteTheRoundTrip_When_TheInverseIsWrongOnTheValuesThatEncode', function*({ expect }) {
    const subject = subjectOf(WrongInverse)
    yield* expect(roundTripOf(subject, 'value').holds ? 'held' : 'broke').toEqual('broke')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_WrongInverse_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_RefuteTheRoundTrip_When_AUnionHoldsAForbiddenMemberAndABrokenTwoWayMember', function*({ expect }) {
    const subject = subjectOf(OneWayUnion)
    yield* expect(roundTripOf(subject, 'value').holds ? 'held' : 'broke').toEqual('broke')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_OneWayUnion_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_RefuteTheDecodeLaw_When_TheDecoderReadsACounter', function*({ expect }) {
    const subject = subjectOf(CountingDecode)
    decodeCount = 0
    yield* expect(decodeLawVerdict(subject, 'wire').holds ? 'held' : 'broke').toEqual('broke')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀i_CountingDecodeDec_→Deterministic',
        [S.Literal('wire')],
        (values) => Effect.sync(() => decodeLawVerdict(subject, firstOf(values, 'wire'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_ReportLawErred_When_TheDecoderThrowsOnAnAdmittedInput', function*({ expect }) {
    const subject = subjectOf(ThrowingDecode)
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀i_ThrowingDecodeDec_→Deterministic',
        [S.Literal('wire')],
        (values) => Effect.sync(() => decodeLawVerdict(subject, firstOf(values, 'wire'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawErred, 'the law reports the defect')
  })

  it('Should_RefuteTheDecodeLaw_When_TheDecoderOutputItsOwnTypeRejects', function*({ expect }) {
    const subject = subjectOf(LyingDecode)
    yield* expect(decodeLawVerdict(subject, 'wire').holds ? 'held' : 'broke').toEqual('broke')
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀i_LyingDecodeDec_→Deterministic',
        [S.Literal('wire')],
        (values) => Effect.sync(() => decodeLawVerdict(subject, firstOf(values, 'wire'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawRefuted, 'the law refutes the draw')
  })

  it('Should_ReportLawErred_When_TheGetterIsAsynchronous', function*({ expect }) {
    const subject = subjectOf(AsyncEncode)
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀x_AsyncEncodeEnc_=x',
        [S.Literal('value')],
        (values) => Effect.sync(() => encodeLawVerdict(subject, false, firstOf(values, 'value'))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawErred, 'the law reports the defect')
  })

  it('Should_FailWithLawDrawFailed_When_TheEncodedSideHasNoDerivableArbitrary', function*({ expect }) {
    const subject = subjectOf(OpaqueOneWay)
    const rejection = yield* Effect.promise(() =>
      runLaw(
        '∀i_OpaqueOneWayDec_→Deterministic',
        [S.toEncoded(subject.schema)],
        (values) => Effect.sync(() => decodeLawVerdict(subject, firstOf(values, { raw: '' }))),
        5,
      ).then(() => undefined, (error: unknown) => error)
    )
    yield* expect(rejection).toSatisfy((error) => error instanceof LawDrawFailed, 'the law reports the failed draw')
  })

  it('Should_SkipWithItsReason_When_TheLawEvaluatedNoInstance', function*({ expect }) {
    const skipped: Array<string | undefined> = []
    skipIfUninstanced({ skip: (note) => skipped.push(note) }, false, NO_DECODE_REASON)
    yield* expect(skipped).toEqual([NO_DECODE_REASON])
  })
}
