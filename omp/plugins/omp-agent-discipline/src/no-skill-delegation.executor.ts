import type { PlatformError } from '@effect/platform/Error'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import type { TomlConfig } from '@systemfsoftware/omp-utils'
import { Effect, Either } from 'effect'
import {
  Allow,
  Block,
  CheckDelegationCommand,
  type CompiledGuard,
  decideNoSkillDelegation,
} from './no-skill-delegation.workflow.js'

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

function blockResult(verdict: Either.Either<Allow, Block>): BlockResult | undefined {
  return Either.match(verdict, {
    onLeft: (v) => ({ block: true as const, reason: v.reason, how: v.how, skill: v.skill }),
    onRight: () => undefined,
  })
}

export function loadGuard(cwd: string): Effect.Effect<CompiledGuard | null, PlatformError, TomlLoader> {
  return Effect.gen(function*() {
    const loader = yield* TomlLoader
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
): Effect.Effect<NoSkillDelegationResult, PlatformError, TomlLoader> {
  return Effect.gen(function*() {
    const guard = yield* loadGuard(cwd)
    const cmd = new CheckDelegationCommand({ toolName, subagentType, prompt, guard })
    const verdict = decideNoSkillDelegation(cmd)
    return blockResult(verdict)
  })
}
