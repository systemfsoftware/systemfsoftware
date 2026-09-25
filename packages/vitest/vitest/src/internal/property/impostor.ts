/**
 * @internal The constant impostor of R12: a fake of the subject under test that
 * returns the first output it ever produced, for every later call, whatever the
 * input it was given.
 *
 * A property that still holds for the impostor does not constrain the subject.
 * Whether that is fatal is a per-file question — a subject's impostor must be
 * refuted by some property in its file — so this module builds the fake and
 * collects the verdicts; the engine decides them once, when the file finishes
 * (KTD10).
 */

/**
 * A value the fork hands over without inspecting: an argument to the subject, or one of its outputs.
 *
 * @internal
 */
export type Opaque<A = unknown> = A

/**
 * A function under test: any argument, any output.
 *
 * @internal
 */
export type SubjectFunction = (...values: ReadonlyArray<never>) => Opaque

/**
 * A record of functions under test; every member is replaced by a constant.
 *
 * @internal
 */
export type MemberRecord = { readonly [key: string]: SubjectFunction }

/**
 * The function under test, or a record of them.
 *
 * @internal
 */
export type Subject = SubjectFunction | MemberRecord

/**
 * The fake of one subject: the constant stand-in, plus what the fake froze, for the repair message.
 *
 * @internal
 */
export interface Impostor<S extends Subject = Subject> {
  /** The subject with every output frozen at its first value. */
  readonly impostor: S
  /** Renders what the fake returned, for the repair message. */
  readonly frozen: () => string
}

const SUBJECT_KEY = 'the subject'
const NO_VALUE = ''

const isCallable = (value: Opaque): boolean => typeof value === 'function'

const isCallableSubject = (target: Subject): target is SubjectFunction => typeof target === 'function'

const describeValue = (value: Opaque): string => isCallable(value) ? 'a function' : String(value)

const describeEntry = (key: string, value: Opaque): string => `${key} always returned ${describeValue(value)}`

interface FrozenState {
  /** The first output of the whole-subject call, and of every frozen member, by name. */
  readonly outputs: Map<string, Opaque>
}

const emptyState = (): FrozenState => ({ outputs: new Map<string, Opaque>() })

const frozenAt = (state: FrozenState, key: string, compute: () => Opaque): Opaque =>
  state.outputs.has(key) ? state.outputs.get(key) : remember(state, key, compute())

const remember = (state: FrozenState, key: string, value: Opaque): Opaque => {
  state.outputs.set(key, value)
  return value
}

const callOutput = (state: FrozenState, fn: SubjectFunction, thisArg: Opaque, args: ReadonlyArray<Opaque>): Opaque =>
  frozenAt(state, SUBJECT_KEY, () => Reflect.apply(fn, thisArg, args))

const memberWrapper =
  (state: FrozenState, key: string, fn: SubjectFunction): SubjectFunction => (...values: ReadonlyArray<Opaque>) =>
    frozenAt(state, key, () => Reflect.apply(fn, undefined, values))

const memberWrapperOf = (
  state: FrozenState,
  fn: SubjectFunction | undefined,
  key: string,
): SubjectFunction | undefined => fn === undefined ? undefined : memberWrapper(state, key, fn)

const appliedImpostor = (state: FrozenState, target: Subject, thisArg: Opaque, args: ReadonlyArray<Opaque>): Opaque =>
  isCallableSubject(target) ? callOutput(state, target, thisArg, args) : undefined

const memberImpostor = (state: FrozenState, target: MemberRecord, key: string): Opaque =>
  memberWrapperOf(state, target[key], key)

const readImpostor = (state: FrozenState, target: Subject, property: string | symbol): Opaque =>
  isCallableSubject(target) ? Reflect.get(target, property, target) : memberRead(state, target, property)

const memberRead = (state: FrozenState, target: MemberRecord, property: string | symbol): Opaque =>
  typeof property === 'string' ? memberImpostor(state, target, property) : undefined

const impostorHandler = <S extends Subject>(state: FrozenState): ProxyHandler<S> => ({
  apply: (target, thisArg, args) => appliedImpostor(state, target, thisArg, args),
  get: (target, property) => readImpostor(state, target, property),
})

const describeFrozen = (state: FrozenState): string =>
  [...state.outputs].map(([key, value]) => describeEntry(key, value)).join('; ')

/**
 * A constant impostor of `subject`: a function returns its first output forever, and so does each member
 * of a record.
 *
 * @internal
 */
export const impostorOf = <S extends Subject>(subject: S): Impostor<S> => {
  const state = emptyState()
  return {
    impostor: new Proxy(subject, impostorHandler<S>(state)),
    frozen: () => describeFrozen(state),
  }
}

/** @internal */
export const subjectLabel = (subject: Subject): string =>
  isCallableSubject(subject)
    ? `a function of ${String(subject.length)} argument(s)`
    : `a record of ${Object.keys(subject).sort().join(', ')}`

/**
 * One property's verdict against a subject's impostor.
 *
 * @internal
 */
export interface Refutation {
  /** `true` when the property falsified for the impostor, so the property does pin the subject down. */
  readonly refuted: boolean
  readonly frozen: string
  readonly runs: number
}

interface Judge {
  readonly label: string
  readonly properties: Array<string>
  readonly refuters: Array<string>
  readonly frozen: string
  readonly runs: number
}

/**
 * The R12 repair message for one subject no property in the file refuted.
 *
 * @internal
 */
export interface FileLedger {
  readonly record: (subject: Subject, property: string, verdict: Refutation) => void
  readonly finalise: () => void
}

interface LedgerState {
  readonly judges: Map<Subject, Judge>
}

type FileProblems = (message: string) => Error

const judgeFor = (subject: Subject): Judge => ({
  label: subjectLabel(subject),
  properties: [],
  refuters: [],
  frozen: NO_VALUE,
  runs: 0,
})

const trackProperty = (judge: Judge, property: string): Judge =>
  judge.properties.includes(property) ? judge : { ...judge, properties: [...judge.properties, property] }

const trackRefuter = (judge: Judge, property: string): Judge =>
  judge.refuters.includes(property) ? judge : { ...judge, refuters: [...judge.refuters, property] }

const trackVerdict = (judge: Judge, property: string, verdict: Refutation): Judge => {
  const named = trackProperty(judge, property)
  return verdict.refuted
    ? trackRefuter(named, property)
    : { ...named, frozen: verdict.frozen, runs: verdict.runs }
}

const recordJudge = (state: LedgerState, subject: Subject, property: string, verdict: Refutation): void => {
  const prior = state.judges.get(subject) ?? judgeFor(subject)
  state.judges.set(subject, trackVerdict(prior, property, verdict))
}

const isVacuous = (judge: Judge): boolean => judge.refuters.length === 0

const describeVacuous = (judge: Judge): string =>
  `${judge.properties.join(', ')}: no property in this file refuted the constant impostor of this subject ` +
  `(${judge.label}), so nothing here pins it down. It held for ${judge.runs} run(s) against a fake that ` +
  `${judge.frozen === NO_VALUE ? 'was never called' : judge.frozen}, whatever the input. ` +
  `Laws that only relate outputs to each other (additivity, idempotence, commutativity, round trips through ` +
  `the subject) hold for such constants. Pin the output to the input: compare against an independent model ` +
  `(\`subject(x)\` equals a straightforward reimplementation), or conjoin a base case (\`subject([one])\` ` +
  `equals its known value). Also check that the body calls the \`subject\` it was given, not the imported ` +
  `implementation.`

const finaliseJudges = (state: LedgerState, onProblems: FileProblems): void => {
  const vacuous = [...state.judges.values()].filter(isVacuous).map(describeVacuous)
  if (vacuous.length === 0) return
  throw onProblems(vacuous.join('\n\n'))
}

const ledgerOf = (state: LedgerState, onProblems: FileProblems): FileLedger => ({
  record: (subject, property, verdict): void => recordJudge(state, subject, property, verdict),
  finalise: (): void => finaliseJudges(state, onProblems),
})

/**
 * Collects the impostor verdicts of every property in the file and decides, at file end, which subjects
 * nothing refuted.
 *
 * @internal
 */
export const makeFileLedger = (onProblems: FileProblems): FileLedger =>
  ledgerOf({ judges: new Map<Subject, Judge>() }, onProblems)
