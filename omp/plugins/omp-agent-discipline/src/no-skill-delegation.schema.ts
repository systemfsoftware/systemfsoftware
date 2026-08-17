/**
 * The no-skill-delegation gate's command, guard, and verdict schemas.
 *
 * Extracted from the executor so `schema-declaration-location` only sees
 * schema declarations in `*.schema.ts` files. The classes stay constructible
 * — the executor instantiates them with `new` — so they are exported as
 * values, and the unions carry the same names the executor dispatches on.
 */
import * as S from 'effect/Schema'

export const How = S.Literals(['subagent_type', 'prompt'])

const DelegationVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/DelegationVerdict')
export class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DelegationVerdictTypeId] = DelegationVerdictTypeId
}

export class Block extends S.TaggedClass<Block>()('Block', {
  reason: S.String,
  how: How,
  skill: S.String,
}) {
  readonly [DelegationVerdictTypeId] = DelegationVerdictTypeId
}

export const DelegationVerdict = S.Union([Allow, Block])
export type DelegationVerdict = S.Schema.Type<typeof DelegationVerdict>

export const CompiledGuard = S.Struct({
  protectedSkills: S.Array(S.String),
  delegationVerbs: S.Array(S.String),
  referenceVerbs: S.Array(S.String),
  mentionPatterns: S.Record(S.String, S.String),
}).pipe(
  S.annotate({
    toArbitrary: () => (fc) =>
      fc.constant({
        protectedSkills: ['ce-work'],
        delegationVerbs: [
          '\\binvoke\\s+(?:the\\s+)?[`/]?ce-work\\b',
          '\\bdispatch\\s+(?:to\\s+)?(?:the\\s+)?[`/]?ce-work\\b',
          '\\buse\\s+(?:the\\s+)?[`/]?ce-work\\b',
          '\\bspawn\\s+(?:a\\s+)?(?:task|agent|subagent|worker)\\s+(?:with|using)\\s+(?:the\\s+)?[`/]?ce-work\\b',
          '\\bcall\\s+(?:the\\s+)?[`/]?ce-work\\b',
          '\\brun\\s+(?:the\\s+)?[`/]?ce-work\\b',
        ],
        referenceVerbs: [
          '\\bsee\\s+(?:the\\s+)?[`/]?ce-work\\b',
          '\\bread\\s+(?:the\\s+)?[`/]?ce-work\\b',
        ],
        mentionPatterns: {
          'ce-work': '(?:^|[\\s/.`"])ce-work(?=$|[\\s/.`"]|\\b)',
        },
      }),
  }),
)

export type CompiledGuard = typeof CompiledGuard.Type

const MaybeCompiledGuard = S.Union([CompiledGuard, S.Null])

const CheckDelegationCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDelegationCommand',
)
export class CheckDelegationCommand extends S.TaggedClass<CheckDelegationCommand>()('CheckDelegationCommand', {
  toolName: S.String,
  subagentType: S.String,
  prompt: S.String,
  guard: MaybeCompiledGuard,
}) {
  readonly [CheckDelegationCommandTypeId] = CheckDelegationCommandTypeId
}

const ClassifiedInputTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/ClassifiedInput')
export class NoGuard extends S.TaggedClass<NoGuard>()('NoGuard', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
export class NonDelegatedTool extends S.TaggedClass<NonDelegatedTool>()('NonDelegatedTool', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
export class ProtectedSubagent extends S.TaggedClass<ProtectedSubagent>()('ProtectedSubagent', {
  skill: S.String,
}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
export class EmptyPrompt extends S.TaggedClass<EmptyPrompt>()('EmptyPrompt', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
export class Prompted extends S.TaggedClass<Prompted>()('Prompted', {
  guard: CompiledGuard,
  prompt: S.String,
}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}

export const ClassifiedInput = S.Union([NoGuard, NonDelegatedTool, ProtectedSubagent, EmptyPrompt, Prompted])
export type ClassifiedInput = S.Schema.Type<typeof ClassifiedInput>

const PromptAnalysisTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/PromptAnalysis')
export class Delegated extends S.TaggedClass<Delegated>()('Delegated', {
  skill: S.String,
  excerpt: S.String,
}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}
export class Referenced extends S.TaggedClass<Referenced>()('Referenced', {}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}
export class NoDelegation extends S.TaggedClass<NoDelegation>()('NoDelegation', {}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}

export const PromptAnalysis = S.Union([Delegated, Referenced, NoDelegation])
export type PromptAnalysis = S.Schema.Type<typeof PromptAnalysis>
