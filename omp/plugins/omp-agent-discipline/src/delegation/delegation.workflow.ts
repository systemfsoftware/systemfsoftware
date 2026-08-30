import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'
import * as Option from 'effect/Option'

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
})

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

export type ClassifiedInput = NoGuard | NonDelegatedTool | ProtectedSubagent | EmptyPrompt | Prompted

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

export type PromptAnalysis = Delegated | Referenced | NoDelegation

export class DelegationImpossible extends S.TaggedError<DelegationImpossible>()('DelegationImpossible', {
  reason: S.String,
}) {}

function denyMessage(skill: string, how: 'subagent_type' | 'prompt', excerpt: string): string {
  return [
    '\u26D4 BLOCKED: "' + skill + '" must not be delegated to a subagent.',
    'Detected in ' + how + ': ' + excerpt,
    '',
    'REQUIRED: invoke ' + skill + ' directly in THIS session via the host Skill / Tool call,',
    'then pass its return envelope to the next step. Do NOT wrap it in a task / Agent dispatch.',
    '',
    'WHY: a subagent reproduces the shape but loses the skill protocol — plan-path gate,',
    'headless review contract, and pipeline-vs-chat mode. The contract does not survive the hop.',
    '',
    'RULE: root AGENTS.md \u00A7"Skill invocations" (SK1/SK2).',
  ].join('\n')
}

function matchesPattern(pattern: string, prompt: string): boolean {
  return new RegExp(pattern, 'i').test(prompt)
}

function firstMatch(patterns: readonly string[], prompt: string): RegExpExecArray | null {
  return patterns
    .map((pattern) => new RegExp(pattern, 'i').exec(prompt))
    .find((match): match is RegExpExecArray => match !== null) ?? null
}

const matchedNonEmptyPrompt = (prompt: string): Option.Option<string> =>
  Option.liftPredicate((p: string): p is string => p !== '')(prompt)

const classifyByPrompt = (cmd: CheckDelegationCommand, guard: CompiledGuard): ClassifiedInput =>
  Match.value(matchedNonEmptyPrompt(cmd.prompt)).pipe(
    Match.tag('Some', ({ value: prompt }) => Prompted.make({ guard, prompt })),
    Match.tag('None', () => EmptyPrompt.make()),
    Match.exhaustive,
  )

const matchedProtectedSkill = (cmd: CheckDelegationCommand, guard: CompiledGuard): Option.Option<string> =>
  Option.liftPredicate(
    (sub: string): sub is string => sub !== '' && guard.protectedSkills.includes(sub),
  )(cmd.subagentType)

const classifySubagent = (cmd: CheckDelegationCommand, guard: CompiledGuard): ClassifiedInput =>
  Match.value(matchedProtectedSkill(cmd, guard)).pipe(
    Match.tag('Some', ({ value: skill }) => ProtectedSubagent.make({ skill })),
    Match.tag('None', () => classifyByPrompt(cmd, guard)),
    Match.exhaustive,
  )

const matchedGuard = (cmd: CheckDelegationCommand): Option.Option<CompiledGuard> => Option.fromNullishOr(cmd.guard)

const matchedDelegatorTool = (cmd: CheckDelegationCommand, guard: CompiledGuard): Option.Option<ClassifiedInput> =>
  Option.liftPredicate(
    (name: string): name is 'task' | 'agent' => name === 'task' || name === 'agent',
  )(cmd.toolName.toLowerCase()).pipe(Option.map(() => classifySubagent(cmd, guard)))

const classifyInput = (cmd: CheckDelegationCommand): ClassifiedInput =>
  Match.value(matchedGuard(cmd)).pipe(
    Match.tag('None', () => NoGuard.make()),
    Match.tag('Some', ({ value: guard }) =>
      Match.value(matchedDelegatorTool(cmd, guard)).pipe(
        Match.tag('None', () => NonDelegatedTool.make()),
        Match.tag('Some', ({ value }) => value),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const matchedMentionedSkills = (guard: CompiledGuard, prompt: string): Option.Option<[string, ...string[]]> => {
  const mentioned = Object.entries(guard.mentionPatterns)
    .filter(([, pattern]) => matchesPattern(pattern, prompt))
    .map(([name]) => name)
  return Option.liftPredicate(
    (xs: readonly string[]): xs is [string, ...string[]] => xs.length > 0,
  )(mentioned)
}

const analyzePrompt = (guard: CompiledGuard, prompt: string): PromptAnalysis =>
  Match.value(matchedMentionedSkills(guard, prompt)).pipe(
    Match.tag('None', () => NoDelegation.make()),
    Match.tag('Some', ({ value: mentioned }) => {
      const skill = mentioned[0]
      const hasReference = guard.referenceVerbs.some((pattern) => matchesPattern(pattern, prompt))
      const hasDelegation = guard.delegationVerbs.some((pattern) => matchesPattern(pattern, prompt))
      return Match.value({ hasReference, hasDelegation }).pipe(
        Match.when({ hasReference: true }, () => Referenced.make()),
        Match.when({ hasDelegation: false }, () => NoDelegation.make()),
        Match.orElse(() => {
          const match = firstMatch(guard.delegationVerbs, prompt)
          const excerpt = match !== null ? match[0] : prompt.slice(0, 120)
          return Delegated.make({ skill, excerpt })
        }),
      )
    }),
    Match.exhaustive,
  )

const decideNoSkillDelegation = (cmd: CheckDelegationCommand): DelegationVerdict =>
  Match.value(classifyInput(cmd)).pipe(
    Match.tag('NoGuard', () => Allow.make()),
    Match.tag('NonDelegatedTool', () => Allow.make()),
    Match.tag(
      'ProtectedSubagent',
      ({ skill }) => Block.make({ reason: denyMessage(skill, 'subagent_type', skill), how: 'subagent_type', skill }),
    ),
    Match.tag('EmptyPrompt', () => Allow.make()),
    Match.tag('Prompted', ({ guard, prompt }) =>
      Match.value(analyzePrompt(guard, prompt)).pipe(
        Match.tag('Delegated', ({ skill, excerpt }) =>
          Block.make({ reason: denyMessage(skill, 'prompt', excerpt), how: 'prompt', skill })),
        Match.tag('Referenced', () =>
          Allow.make()),
        Match.tag('NoDelegation', () => Allow.make()),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const checkNoSkillDelegation = Workflow.make(
  CheckDelegationCommand,
  (command): Result.Result<DelegationVerdict, DelegationImpossible> => Result.succeed(decideNoSkillDelegation(command)),
)
