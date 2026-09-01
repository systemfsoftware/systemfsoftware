/**
 * Checker — the Checker capability.
 *
 * Owns the checker port, its contract, the child-process edge, and the
 * Cell pipelines that drive a checker through a pure workflow. A checker
 * speaks `Mutant`; the engine schedules `MutantRunPlan` — this module bridges
 * the two and verifies the join.
 */

import { Cell } from '@systemfsoftware/effect-cell-types'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { FileDescriptions } from '@systemfsoftware/stryker-js/Mutant'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { RunPlan as MutantRunPlan } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Scope from 'effect/Scope'

import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import {
  CheckerAnsweredUnrequested,
  CheckerCommand,
  type CheckerContractBroken,
  type CheckerDecision,
  CheckerSkippedRequested,
  checkerWorkflow,
} from './Checker.workflow.js'
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
): Result.Result<readonly (readonly [MutantRunPlan, CheckResult])[], CheckerContractBroken> => {
  const byId = new Map(plans.map((plan) => [plan.mutant.id, plan]))
  const paired: (readonly [MutantRunPlan, CheckResult])[] = []
  const unrequested: string[] = []

  for (const [id, answer] of Object.entries(answers)) {
    const plan = byId.get(id)
    if (plan === undefined) {
      unrequested.push(id)
      continue
    }
    paired.push([plan, answer] as const)
  }

  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName,
        phase: 'check',
        unrequestedIds: unrequested,
        requestedIds: plans.map((plan) => plan.mutant.id),
      }),
    )
  }

  const answered = new Set(paired.map(([plan]) => plan.mutant.id))
  const missing = plans.map((plan) => plan.mutant.id).filter((id) => !answered.has(id))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({ checkerName, phase: 'check', missingIds: missing }),
    )
  }

  return Result.succeed(paired)
}

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
): Result.Result<readonly (readonly MutantRunPlan[])[], CheckerContractBroken> => {
  const byId = new Map(plans.map((plan) => [plan.mutant.id, plan]))
  const grouped = new Set<string>()
  const unrequested: string[] = []
  const groups: (readonly MutantRunPlan[])[] = []

  for (const idGroup of idGroups) {
    const group: MutantRunPlan[] = []
    for (const id of idGroup) {
      grouped.add(id)
      const plan = byId.get(id)
      if (plan === undefined) {
        unrequested.push(id)
        continue
      }
      group.push(plan)
    }
    groups.push(group)
  }

  if (unrequested.length > 0) {
    return Result.fail(
      new CheckerAnsweredUnrequested({
        checkerName,
        phase: 'group',
        unrequestedIds: unrequested,
        requestedIds: plans.map((plan) => plan.mutant.id),
      }),
    )
  }

  const missing = plans.map((plan) => plan.mutant.id).filter((id) => !grouped.has(id))
  if (missing.length > 0) {
    return Result.fail(
      new CheckerSkippedRequested({ checkerName, phase: 'group', missingIds: missing }),
    )
  }

  return Result.succeed(groups)
}

// ---------------------------------------------------------------------------
// Child-process edge
// ---------------------------------------------------------------------------

export const makeCheckerChildProcess = (params: {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly pluginModulePaths: readonly string[]
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
          Effect.mapError((error) => crashed(error.message)),
        ),
      group: (checkerName: string, mutants: readonly Mutant[]) =>
        client.group({ checkerName, mutants: [...mutants] }).pipe(
          Effect.mapError((error) => crashed(error.message)),
        ),
    }
  })

export const createCheckerFactory = (
  options: StrykerOptions,
  fileDescriptions: FileDescriptions,
  pluginModulePaths: readonly string[],
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
    pluginModulePaths,
    workingDirectory,
    execArgv: [...options.checkerNodeArgs],
    idGenerator,
  })
// ---------------------------------------------------------------------------
interface CheckPhases extends Cell.Phases {
  readonly command: {
    readonly checker: CheckerResourceService
    readonly checkerName: string
    readonly plans: readonly MutantRunPlan[]
  }
  readonly raw: {
    readonly checkerName: string
    readonly requestedIds: readonly string[]
    readonly answers: Readonly<Record<string, CheckResult>>
  }
  readonly decoded: CheckerCommand
  readonly decision: CheckerDecision
  readonly decisionError: CheckerContractBroken
  readonly output: Result.Result<CheckerDecision, CheckerContractBroken>
  readonly response: readonly (readonly [MutantRunPlan, CheckResult])[]
  readonly decodeError: CheckerContractBroken
  readonly readError: CheckerCrash
  readonly writeError: CheckerContractBroken
}

interface GroupPhases extends Cell.Phases {
  readonly command: {
    readonly checker: CheckerResourceService
    readonly checkerName: string
    readonly plans: readonly MutantRunPlan[]
  }
  readonly raw: {
    readonly checkerName: string
    readonly requestedIds: readonly string[]
    readonly idGroups: readonly (readonly string[])[]
  }
  readonly decoded: CheckerCommand
  readonly decision: CheckerDecision
  readonly decisionError: CheckerContractBroken
  readonly output: Result.Result<CheckerDecision, CheckerContractBroken>
  readonly response: readonly (readonly MutantRunPlan[])[]
  readonly decodeError: CheckerContractBroken
  readonly readError: CheckerCrash
  readonly writeError: CheckerContractBroken
}

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
    read: (command: CheckPhases['command']) =>
      command.checker
        .check(command.checkerName, command.plans.map((plan) => plan.mutant))
        .pipe(
          Effect.map((answers) => ({
            checkerName: command.checkerName,
            requestedIds: command.plans.map((plan) => plan.mutant.id),
            answers,
          })),
        ),
    decode: (raw: CheckPhases['raw']): Result.Result<CheckerCommand, CheckerContractBroken> =>
      Result.succeed(
        new CheckerCommand({
          checkerName: raw.checkerName,
          requestedIds: [...raw.requestedIds],
          phase: 'check',
          answers: { ...raw.answers },
        }),
      ),
    decide: checkerWorkflow,
    encode: (outcome) => outcome,
    write: (outcome, raw) =>
      Result.match(outcome, {
        onFailure: (error) => Effect.fail(error),
        onSuccess: (decision) =>
          Match.value(decision).pipe(
            Match.tag('CheckResultDecision', (d) => {
              const byId = MutableHashMap.empty<string, MutantRunPlan>()
              for (const plan of plans) {
                MutableHashMap.set(byId, plan.mutant.id, plan)
              }
              const paired: (readonly [MutantRunPlan, CheckResult])[] = []
              for (const entry of d.pairs) {
                const maybe = MutableHashMap.get(byId, entry.id)
                if (Option.isNone(maybe)) {
                  return Effect.fail(
                    new CheckerSkippedRequested({
                      checkerName: raw.checkerName,
                      phase: 'check',
                      missingIds: [entry.id],
                    }),
                  )
                }
                const pair: readonly [MutantRunPlan, CheckResult] = [maybe.value, entry.result]
                paired.push(pair)
              }
              return Effect.succeed(paired)
            }),
            Match.tag('CheckGroupDecision', () =>
              Effect.fail(
                new CheckerSkippedRequested({
                  checkerName: raw.checkerName,
                  phase: 'check',
                  missingIds: [],
                }),
              )),
            Match.exhaustive,
          ),
      }),
  })
  return Cell.apply(description, { checker, checkerName, plans })
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
    read: (command: GroupPhases['command']) =>
      command.checker
        .group(command.checkerName, command.plans.map((plan) => plan.mutant))
        .pipe(
          Effect.map((idGroups) => ({
            checkerName: command.checkerName,
            requestedIds: command.plans.map((plan) => plan.mutant.id),
            idGroups,
          })),
        ),
    decode: (raw: GroupPhases['raw']): Result.Result<CheckerCommand, CheckerContractBroken> =>
      Result.succeed(
        new CheckerCommand({
          checkerName: raw.checkerName,
          requestedIds: [...raw.requestedIds],
          phase: 'group',
          idGroups: raw.idGroups.map((group) => [...group]),
        }),
      ),
    decide: checkerWorkflow,
    encode: (outcome) => outcome,
    write: (outcome, raw) =>
      Result.match(outcome, {
        onFailure: (error) => Effect.fail(error),
        onSuccess: (decision) =>
          Match.value(decision).pipe(
            Match.tag('CheckGroupDecision', (d) => {
              const byId = MutableHashMap.empty<string, MutantRunPlan>()
              for (const plan of plans) {
                MutableHashMap.set(byId, plan.mutant.id, plan)
              }
              const groups: (readonly MutantRunPlan[])[] = []
              for (const idGroup of d.groups) {
                const group: MutantRunPlan[] = []
                for (const id of idGroup) {
                  const maybe = MutableHashMap.get(byId, id)
                  if (Option.isNone(maybe)) {
                    return Effect.fail(
                      new CheckerSkippedRequested({
                        checkerName: raw.checkerName,
                        phase: 'group',
                        missingIds: [id],
                      }),
                    )
                  }
                  group.push(maybe.value)
                }
                groups.push(group)
              }
              return Effect.succeed(groups)
            }),
            Match.tag('CheckResultDecision', () =>
              Effect.fail(
                new CheckerSkippedRequested({
                  checkerName: raw.checkerName,
                  phase: 'group',
                  missingIds: [],
                }),
              )),
            Match.exhaustive,
          ),
      }),
  })
  return Cell.apply(description, { checker, checkerName, plans })
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
    const pairs: (readonly [MutantRunPlan, CheckResult])[] = []
    for (const group of groups) {
      const checked = yield* checkPlans(checker, checkerName, group)
      for (const pair of checked) {
        pairs.push(pair)
      }
    }
    return pairs
  })
