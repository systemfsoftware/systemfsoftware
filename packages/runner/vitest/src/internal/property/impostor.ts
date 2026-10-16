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

import { witnessOf } from '../failure-record.js'
import {
  type Frozen as FrozenValues,
  type FrozenOutput as FrozenOutputWitness,
  type NeverCalled,
  type PropertyRun,
  VacuousProperty,
  type VacuousPropertyRun,
  type VacuousSubject,
} from './error.schema.js'
import { plainReplayEntriesText } from './replay.js'

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
 * One key the impostor froze and the raw output it answered with: the subject itself, or a record member.
 *
 * @internal
 */
export interface FrozenOutput {
  readonly member: string
  readonly output: Opaque
}

/**
 * The fake of one subject: the constant stand-in, plus what the fake froze, as data the file ledger reads.
 *
 * @internal
 */
export interface Impostor<S extends Subject = Subject> {
  /** The subject with every output frozen at its first value. */
  readonly impostor: S
  /** Each frozen key with its raw first output; empty when the property never called the fake. */
  readonly frozen: () => ReadonlyArray<FrozenOutput>
}

const SUBJECT_KEY = 'the subject'

const isCallableSubject = (target: Subject): target is SubjectFunction => typeof target === 'function'

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

const frozenOutputs = (state: FrozenState): ReadonlyArray<FrozenOutput> =>
  [...state.outputs].map(([member, output]) => ({ member, output }))

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
    frozen: () => frozenOutputs(state),
  }
}

/** @internal */
export const subjectLabel = (subject: Subject): string =>
  isCallableSubject(subject)
    ? `a function of ${String(subject.length)} argument(s)`
    : `a record of ${Object.keys(subject).sort().join(', ')}`

/**
 * One property's verdict against a subject's impostor: whether the property refuted the fake, the property it
 * ran, and the raw outputs the fake froze for it.
 *
 * @internal
 */
export interface Refutation {
  /** `true` when the property falsified for the impostor, so the property does pin the subject down. */
  readonly refuted: boolean
  readonly property: PropertyRun
  /** The property's identity hash, so a vacuous verdict's replay text can name it (R9, R11). */
  readonly identity: number
  readonly frozen: ReadonlyArray<FrozenOutput>
}

/**
 * The R12 repair verdict for one subject no property in the file refuted.
 *
 * @internal
 */
export interface FileLedger {
  readonly record: (subject: Subject, verdict: Refutation) => void
  /** Records a law kind exempt from the gate, so a refusal can list it (R6). */
  readonly recordExempt: (name: string, kind: string) => void
  /** The single refusal when at least one subject is vacuous, or `undefined` when the file holds. */
  readonly finalise: () => VacuousProperty | undefined
}

interface PropertyVerdict {
  readonly property: PropertyRun
  readonly identity: number
  readonly frozen: ReadonlyArray<FrozenOutput>
}

interface Judge {
  readonly label: string
  readonly verdicts: ReadonlyArray<PropertyVerdict>
  readonly refuters: ReadonlyArray<string>
}

interface ExemptLaw {
  readonly name: string
  readonly kind: string
}

interface LedgerState {
  readonly judges: Map<Subject, Judge>
  readonly exempts: Array<ExemptLaw>
}

const judgeFor = (subject: Subject): Judge => ({ label: subjectLabel(subject), verdicts: [], refuters: [] })

const addName = (names: ReadonlyArray<string>, name: string): ReadonlyArray<string> =>
  names.includes(name) ? names : [...names, name]

const trackVerdict = (judge: Judge, verdict: Refutation): Judge => {
  const named = { ...judge, refuters: addName(judge.refuters, verdict.property.name) }
  return verdict.refuted ? named : {
    ...judge,
    verdicts: [...judge.verdicts, { property: verdict.property, identity: verdict.identity, frozen: verdict.frozen }],
  }
}

const recordJudge = (state: LedgerState, subject: Subject, verdict: Refutation): void => {
  const prior = state.judges.get(subject) ?? judgeFor(subject)
  state.judges.set(subject, trackVerdict(prior, verdict))
}

const isVacuous = (judge: Judge): boolean => judge.refuters.length === 0

const frozenOf = (frozen: ReadonlyArray<FrozenOutput>): FrozenValues | NeverCalled =>
  frozen.length === 0
    ? { _tag: 'NeverCalled' }
    : {
      _tag: 'Frozen',
      outputs: frozen.map(({ member, output }): FrozenOutputWitness => ({ member, output: witnessOf(output) })),
    }

const propertyRunOf = (verdict: PropertyVerdict): VacuousPropertyRun => ({
  property: verdict.property,
  frozen: frozenOf(verdict.frozen),
})

const subjectOf = (judge: Judge): VacuousSubject => ({
  label: judge.label,
  properties: judge.verdicts.map(propertyRunOf),
})

const vacuousReplayTextOf = (judges: ReadonlyArray<Judge>): string =>
  plainReplayEntriesText(
    judges.flatMap((judge) =>
      judge.verdicts.map((verdict) => ({
        property: verdict.identity,
        seed: verdict.property.seed,
        runs: verdict.property.runs,
      }))
    ),
  )

const refuseVacuous = (judges: ReadonlyArray<Judge>, exempt: ReadonlyArray<ExemptLaw>): VacuousProperty | undefined => {
  const vacuous = judges.filter(isVacuous)
  return vacuous.length === 0 ? undefined : new VacuousProperty({
    subjects: vacuous.map(subjectOf),
    exempt: [...exempt],
    replay: vacuousReplayTextOf(vacuous),
  })
}

const finaliseJudges = (state: LedgerState): VacuousProperty | undefined =>
  refuseVacuous([...state.judges.values()], state.exempts)

const ledgerOf = (state: LedgerState): FileLedger => ({
  record: (subject, verdict): void => recordJudge(state, subject, verdict),
  recordExempt: (name, kind): void => {
    if (state.exempts.some((exempt) => exempt.name === name)) return
    state.exempts.push({ name, kind })
  },
  finalise: (): VacuousProperty | undefined => finaliseJudges(state),
})

/**
 * Collects the impostor verdicts of every property in the file and decides, at file end, which subjects
 * nothing refuted.
 *
 * @internal
 */
export const makeFileLedger = (): FileLedger => ledgerOf({ judges: new Map<Subject, Judge>(), exempts: [] })
