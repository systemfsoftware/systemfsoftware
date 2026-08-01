import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

export const EXTENSION_HANDLER_BUDGET_MS = 30_000
export const BUDGET_STEP_MS = 2_000
export const HANDLER_CEILING_MS = EXTENSION_HANDLER_BUDGET_MS - BUDGET_STEP_MS
export const AGGREGATE_CEILING_MS = HANDLER_CEILING_MS - BUDGET_STEP_MS
export const HOOK_CEILING_MS = AGGREGATE_CEILING_MS - BUDGET_STEP_MS
export const KILL_GRACE_MS = 2_000

const CLAUDE_EVENT_DEFAULT_SECONDS: Readonly<Record<string, number>> = {
  UserPromptSubmit: 30,
}

const CLAUDE_FALLBACK_SECONDS = 600

const ResolveHookBudgetCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/ResolveHookBudgetCommand',
)
export class ResolveHookBudgetCommand extends S.TaggedClass<ResolveHookBudgetCommand>()(
  'ResolveHookBudgetCommand',
  {
    configuredSeconds: S.UndefinedOr(S.Number),
    event: S.String,
    callerIsWaiting: S.Boolean,
  },
) {
  readonly [ResolveHookBudgetCommandTypeId] = ResolveHookBudgetCommandTypeId
}

const HookBudgetTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/HookBudget')

export class BudgetHonoured extends S.TaggedClass<BudgetHonoured>()('BudgetHonoured', {
  timeoutMs: S.Number,
}) {
  readonly [HookBudgetTypeId] = HookBudgetTypeId
}

export class BudgetCapped extends S.TaggedClass<BudgetCapped>()('BudgetCapped', {
  timeoutMs: S.Number,
  requestedMs: S.Number,
}) {
  readonly [HookBudgetTypeId] = HookBudgetTypeId
}

const HookBudget = S.Union(BudgetHonoured, BudgetCapped)
export type HookBudget = S.Schema.Type<typeof HookBudget>

const requestedMs = (cmd: ResolveHookBudgetCommand): number =>
  (cmd.configuredSeconds ?? CLAUDE_EVENT_DEFAULT_SECONDS[cmd.event] ?? CLAUDE_FALLBACK_SECONDS) * 1000

export const resolveHookBudget = (cmd: ResolveHookBudgetCommand): HookBudget =>
  Match.value(cmd.callerIsWaiting && requestedMs(cmd) > HOOK_CEILING_MS).pipe(
    Match.when(true, () => new BudgetCapped({ timeoutMs: HOOK_CEILING_MS, requestedMs: requestedMs(cmd) })),
    Match.when(false, () => new BudgetHonoured({ timeoutMs: requestedMs(cmd) })),
    Match.exhaustive,
  )
