/**
 * Teardown decision — the ordered, idempotent teardown plan (R5, F2,
 * KTD6). Scope close, explicit `stop()`, interrupt-mid-launch partial
 * cleanup, and a re-resume after a mid-teardown failure all drive the
 * same decision: the composing executor records which steps of the fixed
 * order have already completed, plus the facts that decide a step's
 * applicability, in a closed `TeardownCommand`, and this workflow emits
 * the ordered list of steps still to run.
 *
 * The fixed order (R5): stop → remove → network-remove → sync-unregister →
 * untrack → release-ports.
 *
 * Applicability (a step is planned only when its recorded fact says the
 * step is meaningful):
 * - `stop`/`remove` only when a backend handle was created (a launch that
 *   failed before create has nothing to stop or remove);
 * - `network-remove` only when the container joined a library-created
 *   network AND is its last member (R5: "when the container's network was
 *   library-created and last-member");
 * - `sync-unregister` only when the sync-exit registry holds the
 *   container;
 * - `untrack` only when the on-disk ledger tracks it;
 * - `release-ports` only when host ports are still issued.
 *
 * Idempotency. The decision is a pure function of the recorded facts: a
 * second call with every applicable step marked completed yields
 * `TeardownCompleted` — the no-op second run. `keepAlive` and
 * reuse-adopted containers are exempt outright (`TeardownSkipped`): their
 * whole point is to outlive this process (R5), and an adopted container's
 * ports are owned by the running sandbox, never released here.
 *
 * The command is one teardown session's snapshot: the executor records the
 * starting facts and the `completed` steps together, and the steps it
 * reports are always the initial segment of the applicable order (steps
 * run strictly in the fixed order — the resume-after-interruption shape).
 *
 * The error channel exists for one defect class — a command whose
 * `completed` record contradicts the snapshot (marking a step done the
 * facts say is meaningless or impossible, steps recorded for an exempt
 * container, or steps recorded out of the fixed order). That is an
 * executor bug; the workflow refuses to plan rather than paper over it.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

// ========================= steps =========================

/** The fixed teardown order (R5) — step identity doubles as its order key. */
export const TEARDOWN_STEP_ORDER = [
  'stop',
  'remove',
  'network-remove',
  'sync-unregister',
  'untrack',
  'release-ports',
] as const

/** The step schema — a closed literal union, so a decision's steps array is JSON-codecable. */
export const TeardownStepSchema = S.Literals(TEARDOWN_STEP_ORDER)

export type TeardownStep = S.Schema.Type<typeof TeardownStepSchema>

// ========================= decisions =========================

/** The container is exempt from teardown (keepAlive or reuse-adopted) — nothing to plan, ever (R5). */
export class TeardownSkipped extends S.TaggedClass<TeardownSkipped>()('Skipped', {}) {}

/** Every applicable step is already done — a full teardown's idempotent second. */
export class TeardownCompleted extends S.TaggedClass<TeardownCompleted>()('Completed', {}) {}

/** The ordered steps still to run, left to right. */
export class TeardownSteps extends S.TaggedClass<TeardownSteps>()('Steps', {
  steps: S.Array(TeardownStepSchema),
}) {}

/** The closed decision space of the teardown workflow. */
export type TeardownDecision = TeardownSkipped | TeardownCompleted | TeardownSteps

/**
 * The executor recorded a contradiction between `completed` and the
 * applicability facts — a step it claims ran that the facts say could not
 * have (or steps recorded for an exempt container). This is a caller bug,
 * surfaced as a tagged error rather than a silently wrong plan.
 */
export class TeardownFactContradictionError extends S.TaggedError<TeardownFactContradictionError>()(
  'TeardownFactContradictionError',
  { message: S.String },
) {}

// ========================= command =========================

/**
 * The recorded facts the teardown decision runs on, distilled by the
 * executor. Every field is observed data; nothing here reads a service,
 * the ledger, or the registry — the executor already did.
 */
export type TeardownCommand = {
  readonly _tag: 'TearDown'
  /** `true` when the spec was built keepAlive — exempt from scope teardown (R5). */
  readonly keepAlive: boolean
  /** `true` when this handle was adopted from a running reuse container, not created by this launch — exempt (R5). */
  readonly adopted: boolean
  /** `true` when a backend handle was created for this launch — only then do stop/remove apply. */
  readonly created: boolean
  /** The steps already performed — always the initial segment of the applicable order, since steps run in the fixed order. */
  readonly completed: ReadonlyArray<TeardownStep>
  /** The library-created network this container joined, if any — only then does `network-remove` apply. */
  readonly networkId: string | undefined
  /** Whether this container is the last member of that network (R5's last-member condition). */
  readonly isLastNetworkMember: boolean
  /** Whether the sync-exit registry holds this container. */
  readonly syncCleanupRegistered: boolean
  /** Whether the on-disk ledger tracks this container. */
  readonly ledgerTracked: boolean
  /** Whether host ports are still issued and must be released. */
  readonly portsIssued: boolean
}

// ========================= kernels =========================

/** Whether a step is applicable at all, from the recorded facts alone. */
const isApplicable = (
  step: TeardownStep,
  command: Extract<TeardownCommand, { readonly _tag: 'TearDown' }>,
): boolean => {
  switch (step) {
    case 'stop':
    case 'remove':
      return command.created
    case 'network-remove':
      return command.networkId !== undefined && command.isLastNetworkMember
    case 'sync-unregister':
      return command.syncCleanupRegistered
    case 'untrack':
      return command.ledgerTracked
    case 'release-ports':
      return command.portsIssued
  }
}

/** Every applicable step in the fixed order — the planned sequence the executor runs in order. */
const applicableOrder = (
  command: Extract<TeardownCommand, { readonly _tag: 'TearDown' }>,
): ReadonlyArray<TeardownStep> => TEARDOWN_STEP_ORDER.filter((step) => isApplicable(step, command))

/** The first completed step the recorded facts contradict, if any. */
const contradictionFor = (
  command: Extract<TeardownCommand, { readonly _tag: 'TearDown' }>,
): TeardownFactContradictionError | undefined => {
  if ((command.keepAlive || command.adopted) && command.completed.length > 0) {
    return TeardownFactContradictionError.make({
      message: `teardown recorded completed steps on an exempt container (keepAlive: ${command.keepAlive}, ` +
        `adopted: ${command.adopted}) — an exempt container is never torn down`,
    })
  }
  const applicable = applicableOrder(command)
  const isInitialSegment = command.completed.every((step, index) => applicable[index] === step)
  if (!isInitialSegment) {
    return TeardownFactContradictionError.make({
      message: `completed steps must be the initial segment of the fixed teardown order — got ` +
        `[${command.completed.join(' → ')}] against planned [${applicable.join(' → ')}]`,
    })
  }
  return undefined
}

/** The ordered plan: the applicable steps that remain after the completed initial segment. */
const planRemaining = (command: Extract<TeardownCommand, { readonly _tag: 'TearDown' }>): ReadonlyArray<TeardownStep> =>
  applicableOrder(command).slice(command.completed.length)

/** The base dispatch — pure, in-file; the workflow body is this single exhaustive call. */
const dispatchTeardown = (command: TeardownCommand): Result.Result<TeardownDecision, TeardownFactContradictionError> =>
  Match.exhaustive(
    Match.value(command).pipe(
      Match.tag('TearDown', (c) => {
        const contradiction = contradictionFor(c)
        if (contradiction !== undefined) {
          return Result.fail(contradiction)
        }
        if (c.keepAlive || c.adopted) {
          return Result.succeed(TeardownSkipped.make())
        }
        const remaining = planRemaining(c)
        return remaining.length === 0
          ? Result.succeed(TeardownCompleted.make())
          : Result.succeed(TeardownSteps.make({ steps: [...remaining] }))
      }),
    ),
  )

/**
 * The teardown decision, authored at the `Workflow.make` boundary (KTD3).
 * The body is a single dispatch over the closed command union; the
 * workflow performs zero I/O — an ordered plan decision from recorded
 * facts, pure at every point (R5, R6).
 */
export const decideTeardown = Workflow.make(
  (command: TeardownCommand): Result.Result<TeardownDecision, TeardownFactContradictionError> =>
    dispatchTeardown(command),
)
