import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

const How = S.Literal('subagent_type', 'prompt')

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

const DelegationVerdict = S.Union(Allow, Block)
export type DelegationVerdict = S.Schema.Type<typeof DelegationVerdict>

const CompiledGuard = S.Struct({
  protectedSkills: S.Array(S.String),
  delegationVerbs: S.Array(S.String),
  referenceVerbs: S.Array(S.String),
  mentionPatterns: S.Record({ key: S.String, value: S.String }),
}).pipe(
  S.annotations({
    arbitrary: () => (fc) =>
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

const MaybeCompiledGuard = S.Union(CompiledGuard, S.Literal(null))

export const CheckDelegation = S.Struct({
  toolName: S.String,
  subagentType: S.String,
  prompt: S.String,
  guard: MaybeCompiledGuard,
})

export type CheckDelegation = typeof CheckDelegation.Type

const ClassifiedInputTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/ClassifiedInput')
class NoGuard extends S.TaggedClass<NoGuard>()('NoGuard', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
class NonDelegatedTool extends S.TaggedClass<NonDelegatedTool>()('NonDelegatedTool', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
class ProtectedSubagent extends S.TaggedClass<ProtectedSubagent>()('ProtectedSubagent', {
  skill: S.String,
}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
class EmptyPrompt extends S.TaggedClass<EmptyPrompt>()('EmptyPrompt', {}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}
class Prompted extends S.TaggedClass<Prompted>()('Prompted', {
  guard: CompiledGuard,
  prompt: S.String,
}) {
  readonly [ClassifiedInputTypeId] = ClassifiedInputTypeId
}

const ClassifiedInput = S.Union(NoGuard, NonDelegatedTool, ProtectedSubagent, EmptyPrompt, Prompted)
type ClassifiedInput = S.Schema.Type<typeof ClassifiedInput>

const PromptAnalysisTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/PromptAnalysis')
class Delegated extends S.TaggedClass<Delegated>()('Delegated', {
  skill: S.String,
  excerpt: S.String,
}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}
class Referenced extends S.TaggedClass<Referenced>()('Referenced', {}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}
class NoDelegation extends S.TaggedClass<NoDelegation>()('NoDelegation', {}) {
  readonly [PromptAnalysisTypeId] = PromptAnalysisTypeId
}

const PromptAnalysis = S.Union(Delegated, Referenced, NoDelegation)
type PromptAnalysis = S.Schema.Type<typeof PromptAnalysis>

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

function firstMatch(patterns: ReadonlyArray<string>, prompt: string): RegExpExecArray | null {
  return patterns
    .map((pattern) => new RegExp(pattern, 'i').exec(prompt))
    .find((match): match is RegExpExecArray => match !== null) ?? null
}

const classifySubagent = (cmd: CheckDelegation, guard: CompiledGuard): ClassifiedInput => {
  return Match.value(cmd.subagentType).pipe(
    Match.when(
      (sub): sub is string => sub !== '' && guard.protectedSkills.includes(sub),
      (skill) => new ProtectedSubagent({ skill }),
    ),
    Match.orElse(() =>
      Match.value(cmd.prompt).pipe(
        Match.when('', () => new EmptyPrompt()),
        Match.orElse((prompt) => new Prompted({ guard, prompt })),
      )
    ),
  )
}

const classifyInput = (cmd: CheckDelegation): ClassifiedInput => {
  return Match.value(cmd.guard).pipe(
    Match.when(null, () => new NoGuard()),
    Match.orElse((guard) =>
      Match.value(cmd.toolName.toLowerCase()).pipe(
        Match.when('task', () => classifySubagent(cmd, guard)),
        Match.when('agent', () => classifySubagent(cmd, guard)),
        Match.orElse(() => new NonDelegatedTool()),
      )
    ),
  )
}

const analyzePrompt = (guard: CompiledGuard, prompt: string): PromptAnalysis => {
  const mentioned = Object.entries(guard.mentionPatterns)
    .filter(([, pattern]) => matchesPattern(pattern, prompt))
    .map(([name]) => name)

  return Match.value(mentioned).pipe(
    Match.when(
      (xs): xs is [string, ...string[]] => xs.length > 0,
      ([skill]) => {
        const hasReference = guard.referenceVerbs.some((pattern) => matchesPattern(pattern, prompt))
        const hasDelegation = guard.delegationVerbs.some((pattern) => matchesPattern(pattern, prompt))
        return Match.value({ hasReference, hasDelegation }).pipe(
          Match.when({ hasReference: true }, () => new Referenced()),
          Match.when({ hasDelegation: false }, () => new NoDelegation()),
          Match.orElse(() => {
            const match = firstMatch(guard.delegationVerbs, prompt)
            const excerpt = match !== null ? match[0] : prompt.slice(0, 120)
            return new Delegated({ skill, excerpt })
          }),
        )
      },
    ),
    Match.orElse(() => new NoDelegation()),
  )
}

export const decideNoSkillDelegation = (cmd: CheckDelegation): DelegationVerdict => {
  return Match.value(classifyInput(cmd)).pipe(
    Match.tag('NoGuard', () => new Allow()),
    Match.tag('NonDelegatedTool', () => new Allow()),
    Match.tag(
      'ProtectedSubagent',
      ({ skill }) => new Block({ reason: denyMessage(skill, 'subagent_type', skill), how: 'subagent_type', skill }),
    ),
    Match.tag('EmptyPrompt', () => new Allow()),
    Match.tag('Prompted', ({ guard, prompt }) =>
      Match.value(analyzePrompt(guard, prompt)).pipe(
        Match.tag('Delegated', ({ skill, excerpt }) =>
          new Block({ reason: denyMessage(skill, 'prompt', excerpt), how: 'prompt', skill })),
        Match.tag('Referenced', () =>
          new Allow()),
        Match.tag('NoDelegation', () => new Allow()),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}
