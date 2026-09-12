/**
 * Checker — the Checker capability.
 *
 * Owns the checker port, its contract, the child-process edge, and the
 * Cell pipelines that drive a checker through a pure workflow. A checker
 * speaks `Mutant`; the engine schedules `MutantRunPlan` — this module bridges
 * the two and verifies the join.
 */

import { Cell } from '@systemfsoftware/effect-cell-types'
import { causeText, errorToString } from '@systemfsoftware/stryker-js'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { FileDescriptions } from '@systemfsoftware/stryker-js/Mutant'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'

import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import {
  admitCheckerAnswer,
  CheckerAnsweredUnrequested,
  CheckerCommand,
  type CheckerContractBroken,
  type CheckerDecision,
  CheckerSkippedRequested,
  type CheckGroupDecision,
  type CheckResultDecision,
} from './admit-checker-answer.workflow.js'
import { encodeWorkerOptions } from './worker-options.js'
import type { IdGeneratorShape } from './Worker.js'
import { ChildProcessCrashedError } from './Worker.schema.js'
import type {
  ChildProcessCrashedError as ChildProcessCrashedErrorType,
  OutOfMemoryError,
  WorkerFrameTooLargeError,
} from './Worker.schema.js'
import { connectRetry, WorkerEntries, WorkerLauncher } from './WorkerLauncher.js'
import { CheckerRpcs } from './WorkerProtocol.js'

export type CheckerCrash = ChildProcessCrashedErrorType | OutOfMemoryError | WorkerFrameTooLargeError

/**
 * A checker held by the pool.
 *
 * The pool must be able to interrupt a checker mid-call when the run is
 * cancelled, so the port uses Effect, which can be interrupted, where a Promise
 * cannot. The error channel names both crash variants rather than `unknown`,
 * which lets the retry combinator prove it handles every one of them.
 */
export interface CheckerResourceService {
  readonly check: (
    checkerName: string,
    mutants: readonly Mutant[],
  ) => Effect.Effect<Record<string, CheckResult>, CheckerCrash>

  /**
   * Partition mutants into groups that can be checked together.
   *
   * A checker with no grouping opinion returns one group per mutant — the
   * identity partition — rather than leaving the member off, which is what
   * every call site used to synthesise for itself.
   */
  readonly group: (
    checkerName: string,
    mutants: readonly Mutant[],
  ) => Effect.Effect<readonly (readonly string[])[], CheckerCrash>
}

// ---------------------------------------------------------------------------
// Pure contract joins (over MutantRunPlan — the engine's scheduling type)
// ---------------------------------------------------------------------------

/**
 * Pair a checker's answers back to the run plans they were asked about.
 *
 * A checker's port speaks `Mutant`; the engine schedules `MutantRunPlan`. Going
 * one way is a projection, but coming back is a join that can fail two ways —
 * the checker answered about something it was not asked about, or it did not
 * answer about something it was. Both are the plugin breaking its contract, and
 * each carries its own tag, so a caller matches on the failure rather than
 * parsing ids out of a message.
 *
 * Pure: the pairing is a decision over two lists, so it runs without a checker,
 * a process or a clock — which is the point, because this is the part worth
 * testing.
 */
export const pairCheckResults = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  answers: Readonly<Record<string, CheckResult>>,
): Result.Result<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> =>
  Match.value(partitionAnswers(plansById(plans), answers)).pipe(
    Match.when(
      (partition: AnswerPartition) => partition.unrequested.length > 0,
      (partition) =>
        Result.fail(
          new CheckerAnsweredUnrequested({
            checkerName,
            phase: 'check',
            unrequestedIds: [...partition.unrequested],
            requestedIds: plans.map((plan) => plan.mutant.id),
          }),
        ),
    ),
    Match.orElse((partition) => admitAnsweredPlans(checkerName, plans, partition.paired)),
  )

/**
 * Resolve a checker's id groups back to run plans.
 *
 * Same join as `pairCheckResults` and the same two failures, over groups rather
 * than single answers. A mutant absent from every group is as much a dropped
 * mutant as one absent from the check results — it would go on to be scheduled
 * as though the checker had approved it.
 */
export const pairGroups = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  idGroups: readonly (readonly string[])[],
): Result.Result<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> =>
  Match.value(partitionGroups(plansById(plans), idGroups)).pipe(
    Match.when(
      (partition: GroupPartition) => partition.unrequested.length > 0,
      (partition) =>
        Result.fail(
          new CheckerAnsweredUnrequested({
            checkerName,
            phase: 'group',
            unrequestedIds: [...partition.unrequested],
            requestedIds: plans.map((plan) => plan.mutant.id),
          }),
        ),
    ),
    Match.orElse((partition) => admitGroupedPlans(checkerName, plans, partition)),
  )

interface AnswerPartition {
  readonly paired: readonly (readonly [MutantRunPlan, CheckResult])[]
  readonly unrequested: readonly string[]
}

interface IdGroupPartition {
  readonly plans: readonly MutantRunPlan[]
  readonly grouped: ReadonlySet<string>
  readonly unrequested: readonly string[]
}

interface GroupPartition {
  readonly groups: readonly (readonly MutantRunPlan[])[]
  readonly grouped: ReadonlySet<string>
  readonly unrequested: readonly string[]
}

const plansById = (plans: readonly MutantRunPlan[]): ReadonlyMap<string, MutantRunPlan> =>
  new Map(plans.map((plan): readonly [string, MutantRunPlan] => [plan.mutant.id, plan]))

const missingPlanIds = (plans: readonly MutantRunPlan[], present: ReadonlySet<string>): readonly string[] =>
  plans.map((plan) => plan.mutant.id).filter((id) => !present.has(id))

const answeredPlanIds = (
  paired: readonly (readonly [MutantRunPlan, CheckResult])[],
): ReadonlySet<string> => new Set(paired.map(([plan]) => plan.mutant.id))

const partitionAnswers = (
  byId: ReadonlyMap<string, MutantRunPlan>,
  answers: Readonly<Record<string, CheckResult>>,
): AnswerPartition =>
  Object.entries(answers).reduce<AnswerPartition>(
    (acc, [id, answer]) =>
      Option.match(Option.fromUndefinedOr(byId.get(id)), {
        onNone: () => ({ paired: acc.paired, unrequested: [...acc.unrequested, id] }),
        onSome: (plan) => ({
          paired: [...acc.paired, [plan, answer] as const],
          unrequested: acc.unrequested,
        }),
      }),
    { paired: [], unrequested: [] },
  )

const admitAnsweredPlans = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  paired: readonly (readonly [MutantRunPlan, CheckResult])[],
): Result.Result<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> =>
  Match.value(missingPlanIds(plans, answeredPlanIds(paired))).pipe(
    Match.when(
      (missing: readonly string[]) => missing.length > 0,
      (missing) =>
        Result.fail(
          new CheckerSkippedRequested({ checkerName, phase: 'check', missingIds: [...missing] }),
        ),
    ),
    Match.orElse(() => Result.succeed(paired)),
  )

const withGroupedId = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set([...ids, id])

const unionIds = (left: ReadonlySet<string>, right: ReadonlySet<string>): ReadonlySet<string> =>
  new Set([...left, ...right])

const partitionGroupIds = (
  byId: ReadonlyMap<string, MutantRunPlan>,
  idGroup: readonly string[],
): IdGroupPartition =>
  idGroup.reduce<IdGroupPartition>(
    (acc, id) =>
      Option.match(Option.fromUndefinedOr(byId.get(id)), {
        onNone: () => ({
          plans: acc.plans,
          grouped: withGroupedId(acc.grouped, id),
          unrequested: [...acc.unrequested, id],
        }),
        onSome: (plan) => ({
          plans: [...acc.plans, plan],
          grouped: withGroupedId(acc.grouped, id),
          unrequested: acc.unrequested,
        }),
      }),
    { plans: [], grouped: new Set<string>(), unrequested: [] },
  )

const partitionGroups = (
  byId: ReadonlyMap<string, MutantRunPlan>,
  idGroups: readonly (readonly string[])[],
): GroupPartition =>
  idGroups.reduce<GroupPartition>(
    (acc, idGroup) => {
      const part = partitionGroupIds(byId, idGroup)
      return {
        groups: [...acc.groups, part.plans],
        grouped: unionIds(acc.grouped, part.grouped),
        unrequested: [...acc.unrequested, ...part.unrequested],
      }
    },
    { groups: [], grouped: new Set<string>(), unrequested: [] },
  )

const admitGroupedPlans = (
  checkerName: string,
  plans: readonly MutantRunPlan[],
  partition: GroupPartition,
): Result.Result<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> =>
  Match.value(missingPlanIds(plans, partition.grouped)).pipe(
    Match.when(
      (missing: readonly string[]) => missing.length > 0,
      (missing) =>
        Result.fail(
          new CheckerSkippedRequested({ checkerName, phase: 'group', missingIds: [...missing] }),
        ),
    ),
    Match.orElse(() => Result.succeed(partition.groups)),
  )

// ---------------------------------------------------------------------------
// Child-process edge
// ---------------------------------------------------------------------------

export const makeCheckerChildProcess = (params: {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly workingDirectory: string
  readonly execArgv: readonly string[]
  readonly idGenerator: IdGeneratorShape
}): Effect.Effect<
  CheckerResourceService,
  CheckerCrash,
  Scope.Scope | WorkerLauncher | WorkerEntries
> =>
  Effect.gen(function*() {
    const crashed = (cause: string): ChildProcessCrashedError =>
      new ChildProcessCrashedError({ pid: 0, exit: { _tag: 'Code', code: 1 }, cause })

    const optionsJson = yield* encodeWorkerOptions(params.options)
    const launcher = yield* WorkerLauncher
    const entries = yield* WorkerEntries
    const worker = yield* launcher.spawn({
      entryUrl: entries.checkerWorkerUrl,
      workingDirectory: params.workingDirectory,
      execArgv: [...params.execArgv],
      optionsJson,
      tempDirPrefix: 'stryker-checker-',
    })

    const workerContext = yield* Layer.build(worker.clientLayer).pipe(
      Effect.retry(connectRetry),
      Effect.raceFirst(worker.exited),
      Effect.catch((error) => {
        if (error instanceof ChildProcessCrashedError) {
          return Effect.fail(error)
        }
        return Effect.fail(crashed(`Checker worker failed to start: ${error.message}`))
      }),
    )
    const client = yield* RpcClient.make(CheckerRpcs).pipe(Effect.provideContext(workerContext))

    return {
      check: (checkerName: string, mutants: readonly Mutant[]) =>
        client.check({ checkerName, mutants: [...mutants] }).pipe(
          Effect.mapError((error) => crashed(causeText(error, 0) ?? errorToString(error))),
        ),
      group: (checkerName: string, mutants: readonly Mutant[]) =>
        client.group({ checkerName, mutants: [...mutants] }).pipe(
          Effect.mapError((error) => crashed(causeText(error, 0) ?? errorToString(error))),
        ),
    }
  })

export const createCheckerFactory = (
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  idGenerator: IdGeneratorShape,
  workingDirectory: string,
): Effect.Effect<
  CheckerResourceService,
  unknown,
  Scope.Scope | WorkerLauncher | WorkerEntries
> =>
  makeCheckerChildProcess({
    options,
    fileDescriptions,
    workingDirectory,
    execArgv: [...options.checkerNodeArgs],
    idGenerator,
  })

// ---------------------------------------------------------------------------
// Cell write joins (checker decision ↔ run plans)
// ---------------------------------------------------------------------------

type DecidedAnswer = CheckResultDecision['pairs'][number]

interface AnswerPairing {
  readonly paired: readonly (readonly [MutantRunPlan, CheckResult])[]
  readonly missing: readonly string[]
}

interface GroupPairing {
  readonly groups: readonly (readonly MutantRunPlan[])[]
  readonly missing: readonly string[]
}

const pairDecidedAnswers = (
  plans: readonly MutantRunPlan[],
  answers: readonly DecidedAnswer[],
): AnswerPairing => {
  const byId = plansById(plans)
  return answers.reduce<AnswerPairing>(
    (acc, answer) =>
      Option.match(Option.fromUndefinedOr(byId.get(answer.id)), {
        onNone: () => ({ paired: acc.paired, missing: [...acc.missing, answer.id] }),
        onSome: (plan) => ({
          paired: [...acc.paired, [plan, answer.result] as const],
          missing: acc.missing,
        }),
      }),
    { paired: [], missing: [] },
  )
}

const writeDecidedAnswers = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  answers: readonly DecidedAnswer[],
): Effect.Effect<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> =>
  Match.value(pairDecidedAnswers(plans, answers)).pipe(
    Match.when(
      (pairing: AnswerPairing) => pairing.missing.length > 0,
      (pairing) =>
        Effect.fail(
          new CheckerSkippedRequested({
            checkerName,
            phase: 'check',
            missingIds: pairing.missing.slice(0, 1),
          }),
        ),
    ),
    Match.orElse((pairing) => Effect.succeed(pairing.paired)),
  )

const pairDecidedGroups = (
  plans: readonly MutantRunPlan[],
  idGroups: readonly (readonly string[])[],
): GroupPairing => {
  const byId = plansById(plans)
  return idGroups.reduce<GroupPairing>(
    (acc, idGroup) => {
      const part = partitionGroupIds(byId, idGroup)
      return {
        groups: [...acc.groups, part.plans],
        missing: [...acc.missing, ...part.unrequested],
      }
    },
    { groups: [], missing: [] },
  )
}

const writeDecidedGroups = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  idGroups: readonly (readonly string[])[],
): Effect.Effect<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> =>
  Match.value(pairDecidedGroups(plans, idGroups)).pipe(
    Match.when(
      (pairing: GroupPairing) => pairing.missing.length > 0,
      (pairing) =>
        Effect.fail(
          new CheckerSkippedRequested({
            checkerName,
            phase: 'group',
            missingIds: pairing.missing.slice(0, 1),
          }),
        ),
    ),
    Match.orElse((pairing) => Effect.succeed(pairing.groups)),
  )

const writeCheckerDecision = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  decision: CheckerDecision,
): Effect.Effect<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> =>
  Match.value(decision).pipe(
    Match.tag('CheckResultDecision', (d: CheckResultDecision) => writeDecidedAnswers(plans, checkerName, d.pairs)),
    Match.tag(
      'CheckGroupDecision',
      () => Effect.fail(new CheckerSkippedRequested({ checkerName, phase: 'check', missingIds: [] })),
    ),
    Match.exhaustive,
  )

const writeCheckerOutcome = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  outcome: Result.Result<CheckerDecision, CheckerContractBroken>,
): Effect.Effect<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> =>
  Result.match(outcome, {
    onFailure: (error) => Effect.fail(error),
    onSuccess: (decision) => writeCheckerDecision(plans, checkerName, decision),
  })

const writeGroupDecision = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  decision: CheckerDecision,
): Effect.Effect<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> =>
  Match.value(decision).pipe(
    Match.tag('CheckGroupDecision', (d: CheckGroupDecision) => writeDecidedGroups(plans, checkerName, d.groups)),
    Match.tag('CheckResultDecision', () =>
      Effect.fail(new CheckerSkippedRequested({ checkerName, phase: 'group', missingIds: [] }))),
    Match.exhaustive,
  )

const writeGroupOutcome = (
  plans: readonly MutantRunPlan[],
  checkerName: string,
  outcome: Result.Result<CheckerDecision, CheckerContractBroken>,
): Effect.Effect<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> =>
  Result.match(outcome, {
    onFailure: (error) => Effect.fail(error),
    onSuccess: (decision) => writeGroupDecision(plans, checkerName, decision),
  })

// ---------------------------------------------------------------------------
/**
 * Ask a checker about run plans and get run plans back.
 *
 * The port speaks `Mutant` because that is all a checker needs; the engine
 * schedules `MutantRunPlan`. This is the two-line shell around that translation:
 * project the plans down, call the checker, and hand the answers to the pure decision
 * that joins them back. The join is where the work is, and it is pure.
 */
export const checkPlans = (
  checker: CheckerResourceService,
  checkerName: string,
  plans: readonly MutantRunPlan[],
): Effect.Effect<
  readonly (readonly [MutantRunPlan, CheckResult])[],
  CheckerCrash | CheckerContractBroken
> => {
  const description = Cell.layer({
    read: (
      command: {
        readonly checker: CheckerResourceService
        readonly checkerName: string
        readonly plans: readonly MutantRunPlan[]
      },
    ) =>
      // raw: { checkerName, requestedIds, answers } from checker
      command.checker
        .check(command.checkerName, command.plans.map((plan) => plan.mutant))
        .pipe(
          Effect.map((answers) => ({
            checkerName: command.checkerName,
            requestedIds: command.plans.map((plan) => plan.mutant.id),
            answers,
          })),
        ),
    decode: (
      raw: {
        readonly checkerName: string
        readonly requestedIds: readonly string[]
        readonly answers: Readonly<Record<string, CheckResult>>
      },
    ): Result.Result<CheckerCommand, CheckerContractBroken> =>
      Result.succeed(
        new CheckerCommand({
          checkerName: raw.checkerName,
          requestedIds: [...raw.requestedIds],
          phase: 'check',
          answers: { ...raw.answers },
        }),
      ),
    decide: admitCheckerAnswer,
    encode: (outcome) => outcome,
    write: (outcome, raw) => writeCheckerOutcome(plans, raw.checkerName, outcome),
  })
  return Cell.run(description, { checker, checkerName, plans })
}

/**
 * Ask a checker how to group run plans, and get groups of run plans back.
 */
export const groupPlans = (
  checker: CheckerResourceService,
  checkerName: string,
  plans: readonly MutantRunPlan[],
): Effect.Effect<
  readonly (readonly MutantRunPlan[])[],
  CheckerCrash | CheckerContractBroken
> => {
  const description = Cell.layer({
    read: (
      command: {
        readonly checker: CheckerResourceService
        readonly checkerName: string
        readonly plans: readonly MutantRunPlan[]
      },
    ) =>
      // raw: { checkerName, requestedIds, idGroups } from checker
      command.checker
        .group(command.checkerName, command.plans.map((plan) => plan.mutant))
        .pipe(
          Effect.map((idGroups) => ({
            checkerName: command.checkerName,
            requestedIds: command.plans.map((plan) => plan.mutant.id),
            idGroups,
          })),
        ),
    decode: (
      raw: {
        readonly checkerName: string
        readonly requestedIds: readonly string[]
        readonly idGroups: readonly (readonly string[])[]
      },
    ): Result.Result<CheckerCommand, CheckerContractBroken> =>
      Result.succeed(
        new CheckerCommand({
          checkerName: raw.checkerName,
          requestedIds: [...raw.requestedIds],
          phase: 'group',
          idGroups: raw.idGroups.map((group) => [...group]),
        }),
      ),
    decide: admitCheckerAnswer,
    encode: (outcome) => outcome,
    write: (outcome, raw) => writeGroupOutcome(plans, raw.checkerName, outcome),
  })
  return Cell.run(description, { checker, checkerName, plans })
}

export const checkGroupedPlans = (
  checker: CheckerResourceService,
  checkerName: string,
  plans: readonly MutantRunPlan[],
): Effect.Effect<
  readonly (readonly [MutantRunPlan, CheckResult])[],
  CheckerCrash | CheckerContractBroken
> =>
  Effect.gen(function*() {
    const groups = yield* groupPlans(checker, checkerName, plans)
    const checked = yield* Effect.forEach(
      groups,
      (group: readonly MutantRunPlan[]) => checkPlans(checker, checkerName, group),
      { concurrency: 1 },
    )
    return checked.flat()
  })
