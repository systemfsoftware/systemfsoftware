import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, pipe, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { decodeRecord, readString } from '../record.js'
import { NoDelegateSkills } from './config.js'
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

export type DisciplineContext = NoDelegateSkills | FileSystem.FileSystem

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

function loadGuard(cwd: string): Effect.Effect<CompiledGuard | null, never, NoDelegateSkills | FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const svc = yield* NoDelegateSkills
    const names = yield* svc.load(cwd)
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
  readonly readError: never
  readonly writeError: never
}
export function runNoSkillDelegation(
  cwd: string,
  toolName: string,
  subagentType: string,
  prompt: string,
): Effect.Effect<NoSkillDelegationResult, never, NoDelegateSkills | FileSystem.FileSystem> {
  return Effect.flatMap(
    Effect.context<DisciplineContext>(),
    (services) =>
      Cell.apply(
        pipe(
          Cell.read<DelegationPhases>(({ cwd: dir }) => Effect.provideContext(loadGuard(dir), services)),
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
      ),
  )
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
