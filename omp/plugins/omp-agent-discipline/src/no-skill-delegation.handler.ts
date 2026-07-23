import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from '@oh-my-pi/pi-coding-agent'
import { createTelemetry, loadToml } from '@systemfsoftware/omp-utils'
import type { TelemetryEmitter, TomlConfig } from '@systemfsoftware/omp-utils'
import { Effect } from 'effect'
import type { AppRuntime } from './runtime.js'

interface CompiledGuard {
  readonly protectedSkills: ReadonlySet<string>
  readonly delegationVerbs: readonly RegExp[]
  readonly referenceVerbs: readonly RegExp[]
  readonly mentionPatterns: ReadonlyMap<string, RegExp>
}

let tel: TelemetryEmitter = () => {}
const compiledCache = new Map<string, CompiledGuard>()

export function resetGuardCache(): void {
  compiledCache.clear()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileGuard(names: readonly string[]): CompiledGuard | null {
  if (names.length === 0) return null

  const nameGroup = '(?:' + names.map(escapeRegex).join('|') + ')'

  return {
    protectedSkills: new Set(names),
    delegationVerbs: [
      new RegExp('\\binvoke\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bdispatch\\s+(?:to\\s+)?(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bwrap\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\s+in\\s+(?:a\\s+)?(?:task|agent|subagent)\\b', 'i'),
      new RegExp('\\bdelegate\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp(
        '\\brun\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\s+(?:via|in)\\s+(?:a\\s+)?(?:subagent|task|agent)\\b',
        'i',
      ),
      new RegExp('\\b(?:run|execute|launch)\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bskill:\\s*[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bskill:\\/\\/' + nameGroup + '\\b', 'i'),
      new RegExp('(?:^|\\W)/' + nameGroup + '(?=$|\\b|\\W)', 'i'),
      new RegExp('\\buse\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bload\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp(
        '\\bspawn\\s+(?:a\\s+)?(?:task|agent|subagent|worker)\\s+(?:with|using)\\s+(?:the\\s+)?[`/]?' +
          nameGroup + '\\b',
        'i',
      ),
      new RegExp('\\bcall\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bsend\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp(
        '\\bcreate\\s+(?:a\\s+)?(?:task|agent|subagent)\\s+(?:with|using)\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b',
        'i',
      ),
      new RegExp('\\bstart\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
    ],
    referenceVerbs: [
      new RegExp('\\bsee\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bper\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\bread\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
      new RegExp('\\baccording\\s+to\\s+(?:the\\s+)?[`/]?' + nameGroup + '\\b', 'i'),
    ],
    mentionPatterns: new Map(
      names.map((name) => [
        name,
        new RegExp('(?:^|[\\s/.`"])' + escapeRegex(name) + '(?=$|[\\s/.`"]|\\b)', 'i'),
      ]),
    ),
  }
}

export const loadGuard = Effect.fn('loadGuard')(function*(cwd: string) {
  const cached = compiledCache.get(cwd)
  if (cached !== undefined) return cached
  const config: TomlConfig = yield* loadToml(cwd)
  const names = config['no_delegate_skills'] ?? []
  const compiled = compileGuard(names)
  if (compiled !== null) {
    compiledCache.set(cwd, compiled)
  }
  return compiled
})

function readString(input: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function denyMessage(skill: string, how: 'subagent_type' | 'prompt', excerpt: string): string {
  return [
    `⛔ BLOCKED: "${skill}" must not be delegated to a subagent.`,
    `Detected in ${how}: ${excerpt}`,
    '',
    `REQUIRED: invoke ${skill} directly in THIS session via the host Skill / Tool call,`,
    'then pass its return envelope to the next step. Do NOT wrap it in a task / Agent dispatch.',
    '',
    'WHY: a subagent reproduces the shape but loses the skill protocol — plan-path gate,',
    'headless review contract, and pipeline-vs-chat mode. The contract does not survive the hop.',
    '',
    'RULE: root AGENTS.md §"Skill invocations" (SK1/SK2).',
  ].join('\n')
}

/** Decode tool_call input as a record. Returns empty record for non-objects. */
function decodeRecord(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}

export default function noSkillDelegationExtension(pi: ExtensionAPI, runtime: AppRuntime): void {
  tel = createTelemetry('agent_discipline', pi.logger)

  pi.on('tool_call', (event: ToolCallEvent, ctx: ExtensionContext) => {
    const guard = runtime.runSync(loadGuard(ctx.cwd))
    if (guard === null) return undefined

    const toolName = event.toolName.toLowerCase()
    if (toolName !== 'task' && toolName !== 'agent') return undefined

    const input = decodeRecord(event.input)

    const subagentType = readString(input, 'subagent_type', 'agent')
    if (subagentType !== '' && guard.protectedSkills.has(subagentType)) {
      tel('delegation.blocked', { skill: subagentType, how: 'subagent_type' })
      return { block: true, reason: denyMessage(subagentType, 'subagent_type', subagentType) }
    }

    const prompt = readString(input, 'prompt', 'task', 'description')
    if (prompt !== '') {
      const mentioned = [...guard.mentionPatterns.entries()]
        .filter(([, pattern]) => pattern.test(prompt))
        .map(([name]) => name)
      if (
        mentioned.length > 0 &&
        guard.referenceVerbs.every((re) => !re.test(prompt)) &&
        guard.delegationVerbs.some((re) => re.test(prompt))
      ) {
        const skill = mentioned[0]!
        const matched = guard.delegationVerbs
          .map((re) => re.exec(prompt))
          .find((m): m is RegExpExecArray => m !== null)
        const excerpt = matched !== undefined ? matched[0] : prompt.slice(0, 120)
        tel('delegation.blocked', { skill, how: 'prompt' })
        return { block: true, reason: denyMessage(skill, 'prompt', excerpt) }
      }
    }

    return undefined
  })
}
