import type { PlatformError } from '@effect/platform/Error'
import { TomlLoader } from '@systemfsoftware/omp-utils/toml-loader'
import type { TomlConfig } from '@systemfsoftware/omp-utils/toml-loader'
import { Context, Effect, Match } from 'effect'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

// ═══════════════════════════════════════════════════════════
// 0. DEPENDENCIES — consumer-owned tag
// ═══════════════════════════════════════════════════════════

export class NoSkillDelegationExecutorDeps extends Context.Tag('NoSkillDelegationExecutorDeps')<
  NoSkillDelegationExecutorDeps,
  Context.Tag.Service<TomlLoader>
>() {}

const How = S.Literal('subagent_type', 'prompt')

const DelegationVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-agent-discipline/DelegationVerdict')
class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DelegationVerdictTypeId] = DelegationVerdictTypeId
}

class Block extends S.TaggedClass<Block>()('Block', {
  reason: S.String,
  how: How,
  skill: S.String,
}) {
  readonly [DelegationVerdictTypeId] = DelegationVerdictTypeId
}

const DelegationVerdict = S.Union(Allow, Block)
type DelegationVerdict = S.Schema.Type<typeof DelegationVerdict>

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

const CheckDelegationCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDelegationCommand',
)
class CheckDelegationCommand extends S.TaggedClass<CheckDelegationCommand>()('CheckDelegationCommand', {
  toolName: S.String,
  subagentType: S.String,
  prompt: S.String,
  guard: MaybeCompiledGuard,
}) {
  readonly [CheckDelegationCommandTypeId] = CheckDelegationCommandTypeId
}

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

const matchedNonEmptyPrompt = (prompt: string): Option.Option<string> =>
  Option.liftPredicate((p: string): p is string => p !== '')(prompt)

const classifyByPrompt = (cmd: CheckDelegationCommand, guard: CompiledGuard): ClassifiedInput =>
  Match.value(matchedNonEmptyPrompt(cmd.prompt)).pipe(
    Match.tag('Some', ({ value: prompt }) => new Prompted({ guard, prompt })),
    Match.tag('None', () => new EmptyPrompt()),
    Match.exhaustive,
  )

const matchedProtectedSkill = (cmd: CheckDelegationCommand, guard: CompiledGuard): Option.Option<string> =>
  Option.liftPredicate(
    (sub: string): sub is string => sub !== '' && guard.protectedSkills.includes(sub),
  )(cmd.subagentType)

const classifySubagent = (cmd: CheckDelegationCommand, guard: CompiledGuard): ClassifiedInput =>
  Match.value(matchedProtectedSkill(cmd, guard)).pipe(
    Match.tag('Some', ({ value: skill }) => new ProtectedSubagent({ skill })),
    Match.tag('None', () => classifyByPrompt(cmd, guard)),
    Match.exhaustive,
  )

const matchedGuard = (cmd: CheckDelegationCommand): Option.Option<CompiledGuard> => Option.fromNullable(cmd.guard)

const matchedDelegatorTool = (cmd: CheckDelegationCommand, guard: CompiledGuard): Option.Option<ClassifiedInput> =>
  Option.liftPredicate(
    (name: string): name is 'task' | 'agent' => name === 'task' || name === 'agent',
  )(cmd.toolName.toLowerCase()).pipe(Option.map(() => classifySubagent(cmd, guard)))

const classifyInput = (cmd: CheckDelegationCommand): ClassifiedInput =>
  Match.value(matchedGuard(cmd)).pipe(
    Match.tag('None', () => new NoGuard()),
    Match.tag('Some', ({ value: guard }) =>
      Match.value(matchedDelegatorTool(cmd, guard)).pipe(
        Match.tag('None', () => new NonDelegatedTool()),
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
    (xs: ReadonlyArray<string>): xs is [string, ...string[]] => xs.length > 0,
  )(mentioned)
}
const analyzePrompt = (guard: CompiledGuard, prompt: string): PromptAnalysis =>
  Match.value(matchedMentionedSkills(guard, prompt)).pipe(
    Match.tag('None', () => new NoDelegation()),
    Match.tag('Some', ({ value: mentioned }) => {
      const skill = mentioned[0]
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
    }),
    Match.exhaustive,
  )

const decideNoSkillDelegation = (cmd: CheckDelegationCommand): DelegationVerdict =>
  Match.value(classifyInput(cmd)).pipe(
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

export type BlockResult = {
  readonly block: true
  readonly reason: string
  readonly how: 'subagent_type' | 'prompt'
  readonly skill: string
}

export type NoSkillDelegationResult = BlockResult | undefined

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileGuard(names: readonly string[]): CompiledGuard | null {
  if (names.length === 0) return null

  const nameGroup = '(?:' + names.map(escapeRegex).join('|') + ')'

  return {
    protectedSkills: names.slice(),
    delegationVerbs: [
      '\\binvoke\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bdispatch\\s+(?:to\\s+)?(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bwrap\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\s+in\\s+(?:a\\s+)?(?:task|agent|subagent)\\b',
      '\\bdelegate\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\brun\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\s+(?:via|in)\\s+(?:a\\s+)?(?:subagent|task|agent)\\b',
      '\\b(?:run|execute|launch)\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bskill:\\s*[`/]?' + nameGroup + '\\b',
      '\\bskill:\\/\\/' + nameGroup + '\\b',
      '(?:^|\\W)/' + nameGroup + '(?=$|\\b|\\W)',
      '\\buse\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bload\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bspawn\\s+(?:a\\s+)?(?:task|agent|subagent|worker)\\s+(?:with|using)\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bcall\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bsend\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bcreate\\s+(?:a\\s+)?(?:task|agent|subagent)\\s+(?:with|using)\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bstart\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
    ],
    referenceVerbs: [
      '\\bsee\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bper\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\bread\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
      '\\baccording\\s+to\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
    ],
    mentionPatterns: Object.fromEntries(
      names.map((name) => [name, '(?:^|[\\s/.`"])' + escapeRegex(name) + '(?=$|[\\s/.`"]|\\b)']),
    ),
  }
}

function blockResult(verdict: DelegationVerdict): BlockResult | undefined {
  return Match.value(verdict).pipe(
    Match.tag('Block', (v) => ({ block: true as const, reason: v.reason, how: v.how, skill: v.skill })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )
}

function loadGuard(cwd: string): Effect.Effect<CompiledGuard | null, PlatformError, NoSkillDelegationExecutorDeps> {
  return Effect.gen(function*() {
    const loader = yield* NoSkillDelegationExecutorDeps
    const config: TomlConfig = yield* loader.load(cwd)
    const names = config['no_delegate_skills'] ?? []
    return compileGuard(names)
  })
}

export function runNoSkillDelegation(
  cwd: string,
  toolName: string,
  subagentType: string,
  prompt: string,
): Effect.Effect<NoSkillDelegationResult, PlatformError, NoSkillDelegationExecutorDeps> {
  return Effect.gen(function*() {
    const guard = yield* loadGuard(cwd)
    const cmd = new CheckDelegationCommand({ toolName, subagentType, prompt, guard })
    const verdict = decideNoSkillDelegation(cmd)
    return blockResult(verdict)
  })
}
