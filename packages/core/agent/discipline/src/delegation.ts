import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { HarnessPolicy } from '@systemfsoftware/effect-harness-policy'
import type { Policy } from '@systemfsoftware/effect-harness-policy'
import { Effect, Match, pipe, Result } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import {
  CheckDelegationCommand,
  checkNoSkillDelegation,
  type CompiledGuard,
  type DelegationImpossible,
  type DelegationVerdict,
} from './delegation.workflow.js'

export type BlockResult = {
  readonly block: true
  readonly reason: string
  readonly how: 'subagent_type' | 'prompt'
  readonly skill: string
}

export type NoSkillDelegationResult = BlockResult | undefined

export type DisciplineContext = HarnessPolicy

export type RunSafe<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>

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

function loadGuard(cwd: string): Effect.Effect<CompiledGuard | null, PlatformError, HarnessPolicy> {
  return Effect.gen(function*() {
    const loader = yield* HarnessPolicy
    const config: Policy = yield* loader.load(cwd)
    const names = config['no_delegate_skills'] ?? []
    return compileGuard(names)
  })
}

interface DelegationPhases extends Cell.Phases {
  readonly command: {
    readonly cwd: string
    readonly toolName: string
    readonly subagentType: string
    readonly prompt: string
  }
  readonly raw: CompiledGuard | null
  readonly decoded: CheckDelegationCommand
  readonly decision: DelegationVerdict
  readonly decisionError: DelegationImpossible
  readonly output: NoSkillDelegationResult
  readonly response: NoSkillDelegationResult
  readonly decodeError: never
  readonly readError: PlatformError
  readonly writeError: never
  readonly readContext: HarnessPolicy
  readonly writeContext: never
}

export function runNoSkillDelegation(
  cwd: string,
  toolName: string,
  subagentType: string,
  prompt: string,
): Effect.Effect<NoSkillDelegationResult, PlatformError, HarnessPolicy> {
  return Cell.apply(
    pipe(
      Cell.read<DelegationPhases>(({ cwd: dir }) => loadGuard(dir)),
      Cell.decode<DelegationPhases>((guard) =>
        Result.succeed(CheckDelegationCommand.make({ toolName, subagentType, prompt, guard }))
      ),
      Cell.decide<DelegationPhases>(checkNoSkillDelegation),
      Cell.encode<DelegationPhases>((outcome) =>
        Result.match(outcome, {
          onFailure: () => undefined,
          onSuccess: blockResult,
        })
      ),
      Cell.write<DelegationPhases>((result) => Effect.succeed(result)),
    ),
    { cwd, toolName, subagentType, prompt },
  )
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

const decodeRecord = (input: unknown): Record<string, unknown> => (isRecord(input) ? input : {})

function readString(input: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

export const NoSkillDelegationExtension = (pi: ExtensionAPI, runSafe: RunSafe<DisciplineContext>): void => {
  pi.on(
    'tool_call',
    async (event, ctx) => {
      const input = decodeRecord(event.input)
      const subagentType = readString(input, 'subagent_type', 'agent')
      const prompt = readString(input, 'prompt', 'task', 'description')
      const result = await runSafe(
        Effect.result(runNoSkillDelegation(ctx.cwd, event.toolName, subagentType, prompt)),
      )
      if (Result.isFailure(result)) throw result.failure
      return result.success
    },
  )
}
