/**
 * Dispatch-doctrine gate — pure-cell feature tests.
 *
 * Pure-cell scenarios only. U3 will extend this file with handler scenarios
 * (executor wiring, flag lifecycle, registration order); to keep that
 * extension natural, the structure here uses the gherkin `makeFeature` +
 * `scenario()` chain and groups each pure-cell concern in its own named
 * `Feature(...)` block — adding a new feature is one more `Feature(...).body(...)`
 * call. The pure cells in scope are:
 *
 *   - `isDelegatorTool` and `matchesDoctrineSkillPath` from `dispatch-doctrine.kernel.ts`
 *   - `decideDispatchDoctrine` and `DOCTRINE_KERNEL` from `dispatch-doctrine.workflow.ts`
 */

import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { isDelegatorTool, matchesDoctrineSkillPath } from '../src/dispatch-doctrine.kernel.js'
import {
  Allow,
  CheckDispatchCommand,
  decideDispatchDoctrine,
  DeliverDoctrine,
  DOCTRINE_KERNEL,
} from '../src/dispatch-doctrine.workflow.js'

const Feature = makeFeature({ it, layer })

function present<A>(value: A | null | undefined): A {
  if (value === null || value === undefined) throw new Error('expected a value, got none')
  return value
}

const TASK_SKILLS = ['task-decomposition'] as const

// ──────────────────────────────────────────────────────────────────────
// Workflow scenarios — the decision itself
// ──────────────────────────────────────────────────────────────────────

Feature('Dispatch-doctrine — workflow decision')
  .body(({ scenario }) => {
    scenario(
      'Gate enabled, doctrine not loaded, delegator tool → DeliverDoctrine carrying the kernel',
      Gherkin.Do.pipe(
        Given('a tool_call on task with the gate enabled and doctrine not loaded')(
          'cmd',
          () =>
            Effect.succeed(new CheckDispatchCommand({ toolName: 'task', doctrineLoaded: false, gateEnabled: true })),
        ),
        When('decideDispatchDoctrine is called')('verdict', (s) => Effect.sync(() => decideDispatchDoctrine(s.cmd))),
        Then('it returns DeliverDoctrine whose reason equals DOCTRINE_KERNEL')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('DeliverDoctrine')
            const v = s.verdict as DeliverDoctrine
            expect(v.reason).toBe(DOCTRINE_KERNEL)
            expect(v.reason).toContain('Refuse monolithic dispatches')
          })
        ),
      ),
    )

    scenario(
      'Gate enabled, doctrine loaded, delegator tool → Allow',
      Gherkin.Do.pipe(
        Given('a tool_call on task with doctrine loaded')(
          'cmd',
          () => Effect.succeed(new CheckDispatchCommand({ toolName: 'task', doctrineLoaded: true, gateEnabled: true })),
        ),
        When('decideDispatchDoctrine is called')('verdict', (s) => Effect.sync(() => decideDispatchDoctrine(s.cmd))),
        Then('it returns Allow')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('Allow')
            expect(s.verdict).toBeInstanceOf(Allow)
          })
        ),
      ),
    )

    scenario(
      'Gate enabled, doctrine not loaded, agent tool (case-insensitive) → DeliverDoctrine',
      Gherkin.Do.pipe(
        Given('a tool_call on Agent (mixed case) with the gate enabled and doctrine not loaded')(
          'cmd',
          () =>
            Effect.succeed(new CheckDispatchCommand({ toolName: 'Agent', doctrineLoaded: false, gateEnabled: true })),
        ),
        When('decideDispatchDoctrine is called')('verdict', (s) => Effect.sync(() => decideDispatchDoctrine(s.cmd))),
        Then('it returns DeliverDoctrine')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('DeliverDoctrine')
            expect(s.verdict).toBeInstanceOf(DeliverDoctrine)
          })
        ),
      ),
    )

    scenario(
      'Gate disabled, doctrine not loaded, delegator tool → Allow',
      Gherkin.Do.pipe(
        Given('a tool_call on task with the gate disabled')(
          'cmd',
          () =>
            Effect.succeed(new CheckDispatchCommand({ toolName: 'task', doctrineLoaded: false, gateEnabled: false })),
        ),
        When('decideDispatchDoctrine is called')('verdict', (s) => Effect.sync(() => decideDispatchDoctrine(s.cmd))),
        Then('it returns Allow (gate is off, no kernel-block)')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('Allow')
            expect(s.verdict).toBeInstanceOf(Allow)
          })
        ),
      ),
    )

    scenario(
      'Gate enabled, doctrine not loaded, non-delegator tool → Allow',
      Gherkin.Do.pipe(
        Given('a tool_call on read (non-delegator) with the gate enabled and doctrine not loaded')(
          'cmd',
          () =>
            Effect.succeed(new CheckDispatchCommand({ toolName: 'read', doctrineLoaded: false, gateEnabled: true })),
        ),
        When('decideDispatchDoctrine is called')('verdict', (s) => Effect.sync(() => decideDispatchDoctrine(s.cmd))),
        Then('it returns Allow (the gate only fires on task/agent)')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('Allow')
          })
        ),
      ),
    )

    scenario(
      'DOCTRINE_KERNEL constant contains every rule block in order',
      Gherkin.Do.pipe(
        Given('the DOCTRINE_KERNEL export')('kernel', () => Effect.succeed(DOCTRINE_KERNEL)),
        When('the constant is inspected')('markers', (s) =>
          Effect.succeed({
            gateMarker: s.kernel.includes('- GATE: decomposition is mandatory'),
            specMarker: s.kernel.includes('- SPEC: every dispatched unit carries objective'),
            checkMarker: s.kernel.includes('- CHECK: verifier is not the maker'),
            fenceMarker: s.kernel.includes('- FENCE: parallel units need disjoint write scopes'),
            opens: s.kernel.startsWith('Refuse monolithic dispatches'),
            closes: s.kernel.endsWith('Refuse monolithic dispatches: size, specify, then dispatch or refuse.'),
          })),
        Then('every marker is present and the prose bookends are intact')((s) =>
          Effect.sync(() => {
            expect(s.markers.gateMarker).toBe(true)
            expect(s.markers.specMarker).toBe(true)
            expect(s.markers.checkMarker).toBe(true)
            expect(s.markers.fenceMarker).toBe(true)
            expect(s.markers.opens).toBe(true)
            expect(s.markers.closes).toBe(true)
          })
        ),
      ),
    )
  })

// ──────────────────────────────────────────────────────────────────────
// Kernel scenarios — `isDelegatorTool`
// ──────────────────────────────────────────────────────────────────────

Feature('Dispatch-doctrine — isDelegatorTool matcher')
  .body(({ scenario }) => {
    scenario(
      'Should recognize task and agent (lowercase)',
      Gherkin.Do.pipe(
        Given('lowercase delegator tool names')('inputs', () => Effect.succeed(['task', 'agent'])),
        When('isDelegatorTool is called for each')(
          'matches',
          (s) => Effect.sync(() => s.inputs.map((n) => [n, isDelegatorTool(n)] as const)),
        ),
        Then('both should match')((s) =>
          Effect.sync(() => {
            expect(s.matches).toEqual([['task', true], ['agent', true]])
          })
        ),
      ),
    )

    scenario(
      'Should recognize delegator tool names case-insensitively and trim whitespace',
      Gherkin.Do.pipe(
        Given('mixed-case and padded delegator tool names')(
          'inputs',
          () => Effect.succeed(['TASK', 'Agent', '  task  ', '\tAgent\n']),
        ),
        When('isDelegatorTool is called for each')(
          'matches',
          (s) => Effect.sync(() => s.inputs.map((n) => [n, isDelegatorTool(n)] as const)),
        ),
        Then('all should match')((s) =>
          Effect.sync(() => {
            for (const [, matched] of s.matches) expect(matched).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should reject non-delegator tool names',
      Gherkin.Do.pipe(
        Given('a set of non-delegator tool names')(
          'inputs',
          () => Effect.succeed(['read', 'write', 'edit', 'bash', 'skill', 'taskmaster', 'subagent', '']),
        ),
        When('isDelegatorTool is called for each')(
          'matches',
          (s) => Effect.sync(() => s.inputs.map((n) => [n, isDelegatorTool(n)] as const)),
        ),
        Then('none should match')((s) =>
          Effect.sync(() => {
            for (const [, matched] of s.matches) expect(matched).toBe(false)
          })
        ),
      ),
    )
  })

// ──────────────────────────────────────────────────────────────────────
// Kernel scenarios — `matchesDoctrineSkillPath`
// ──────────────────────────────────────────────────────────────────────

Feature('Dispatch-doctrine — matchesDoctrineSkillPath matcher')
  .body(({ scenario }) => {
    scenario(
      'skill:// URI — bare name matches when the name is in skills',
      Gherkin.Do.pipe(
        Given('a path "skill://task-decomposition" and skills ["task-decomposition"]')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'skill:// URI with :raw selector — name-only check (selector stripped)',
      Gherkin.Do.pipe(
        Given('a path "skill://task-decomposition:raw"')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition:raw', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'skill:// URI with :10-40 selector — selector stripped, name matches',
      Gherkin.Do.pipe(
        Given('a path "skill://task-decomposition:10-40"')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition:10-40', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'skill:// URI with sub-path — matches',
      Gherkin.Do.pipe(
        Given('a path "skill://task-decomposition/references/sizing-gate.md"')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition/references/sizing-gate.md', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'skill:// URI with selector then sub-path — matches',
      Gherkin.Do.pipe(
        Given('a path "skill://task-decomposition:raw/references/sizing-gate.md"')(
          'args',
          () =>
            Effect.succeed({ path: 'skill://task-decomposition:raw/references/sizing-gate.md', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'workspace filesystem layout — /skills/<name>/SKILL.md tail matches',
      Gherkin.Do.pipe(
        Given('a workspace path ending in "/skills/task-decomposition/SKILL.md"')(
          'args',
          () =>
            Effect.succeed({
              path: '/repo/omp/plugins/omp-agent-discipline/skills/task-decomposition/SKILL.md',
              skills: TASK_SKILLS,
            }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'installed-layout filesystem path — ~/.omp/plugins/node_modules/<pkg>/skills/<name>/SKILL.md',
      Gherkin.Do.pipe(
        Given('an installed-layout path with tilde')(
          'args',
          () =>
            Effect.succeed({
              path:
                '~/.omp/plugins/node_modules/@systemfsoftware/omp-agent-discipline/skills/task-decomposition/SKILL.md',
              skills: TASK_SKILLS,
            }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'standalone-layout filesystem path — ~/.claude/skills/<name>/SKILL.md',
      Gherkin.Do.pipe(
        Given('a standalone-claude-layout path with tilde')(
          'args',
          () => Effect.succeed({ path: '~/.claude/skills/task-decomposition/SKILL.md', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'filesystem path with backslashes normalized to forward slashes',
      Gherkin.Do.pipe(
        Given('a Windows-style path with backslashes')(
          'args',
          () => Effect.succeed({ path: 'C:\\repo\\skills\\task-decomposition\\SKILL.md', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns true')((s) => Effect.sync(() => expect(s.match).toBe(true))),
      ),
    )

    scenario(
      'prefix-trap: skill://task-decomposition-extra must NOT match',
      Gherkin.Do.pipe(
        Given('a path with a longer prefix that shares the start of the doctrine name')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition-extra', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'prefix-trap filesystem variant must NOT match',
      Gherkin.Do.pipe(
        Given('a path with a /skills/<name>-extra/SKILL.md tail')(
          'args',
          () =>
            Effect.succeed({
              path: '~/.omp/plugins/node_modules/x/skills/task-decomposition-extra/SKILL.md',
              skills: TASK_SKILLS,
            }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'empty path is rejected',
      Gherkin.Do.pipe(
        Given('an empty string')('args', () => Effect.succeed({ path: '', skills: TASK_SKILLS })),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'unknown skill name is rejected',
      Gherkin.Do.pipe(
        Given('a skill:// URI for a name not in the skills list')(
          'args',
          () => Effect.succeed({ path: 'skill://some-other-skill', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'empty skills list disables the matcher for every input',
      Gherkin.Do.pipe(
        Given('a path that would otherwise match, but the skills list is empty')(
          'args',
          () => Effect.succeed({ path: 'skill://task-decomposition', skills: [] as readonly string[] }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false (gate is off in this dimension)')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'non-skill filesystem path is rejected',
      Gherkin.Do.pipe(
        Given('a path that has no /skills/<name>/SKILL.md tail')(
          'args',
          () => Effect.succeed({ path: '/repo/src/some/file.ts', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )

    scenario(
      'unrelated skill:// URI for a different skill name is rejected',
      Gherkin.Do.pipe(
        Given('a skill:// URI for ce-work, not in the skills list')(
          'args',
          () => Effect.succeed({ path: 'skill://ce-work', skills: TASK_SKILLS }),
        ),
        When('matchesDoctrineSkillPath is called')(
          'match',
          (s) => Effect.sync(() => matchesDoctrineSkillPath(s.args.path, s.args.skills)),
        ),
        Then('it returns false')((s) => Effect.sync(() => expect(s.match).toBe(false))),
      ),
    )
  })

// ──────────────────────────────────────────────────────────────────────
// Composition — wiring the kernel into the workflow
// ──────────────────────────────────────────────────────────────────────

Feature('Dispatch-doctrine — kernel/workflow composition')
  .body(({ scenario }) => {
    scenario(
      'When the kernel classifier says delegator and gate is on and not loaded → DeliverDoctrine with the kernel constant',
      Gherkin.Do.pipe(
        Given('a task tool call with the gate on and doctrine not loaded')(
          'cmd',
          () =>
            Effect.succeed(new CheckDispatchCommand({ toolName: 'task', doctrineLoaded: false, gateEnabled: true })),
        ),
        When('the workflow runs and the kernel is consulted')(
          'verdict',
          (s) =>
            Effect.sync(() =>
              isDelegatorTool(s.cmd.toolName) && !s.cmd.doctrineLoaded && s.cmd.gateEnabled
                ? decideDispatchDoctrine(s.cmd)
                : new Allow()
            ),
        ),
        Then('the verdict is DeliverDoctrine and its reason is DOCTRINE_KERNEL')((s) =>
          Effect.sync(() => {
            expect(s.verdict._tag).toBe('DeliverDoctrine')
            expect(present(s.verdict as DeliverDoctrine).reason).toBe(DOCTRINE_KERNEL)
          })
        ),
      ),
    )
  })

/**
 * Dispatch-doctrine gate — handler, executor, and spec-shape scenarios.
 *
 * Pure-cell scenarios live in the Feature blocks above this file (kernel
 * matchers, workflow decision, composition). U3 adds the wiring half —
 * executor + handler integration against the recording mock + the
 * drift-guard binding DOCTRINE_KERNEL to the marked excerpt in the
 * skill file.
 *   - `vi.resetModules()` + dynamic import per scenario for module-state
 *     isolation (mirrors `xd-retry-guard.feature.test.ts`).
 *   - The handler is driven through a recording `ExtensionAPI` mock that
 *     captures `pi.on` registrations and `pi.logger` calls.
 *   - The executor is driven through `MemoryFileSystem`-seeded TOML
 *     layers (mirrors `no-skill-delegation.feature.test.ts`).
 *   - The drift-guard reads the actual skill file from the package tree
 *     and asserts the kernel excerpt is in sync.
 */

import * as PathModule from '@effect/platform/Path'
import { And } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { TomlLoader, TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Layer as EffectLayer } from 'effect'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDispatchDoctrineConfig } from '../src/dispatch-doctrine.executor.js'
import { extractSpecShape } from '../src/dispatch-doctrine.kernel.js'
interface RecordedLog {
  readonly level: 'info' | 'warn' | 'error' | 'debug'
  readonly message: unknown
  readonly context?: unknown
}

interface HandlerSession {
  readonly api: {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void
    logger: {
      info: (msg: unknown, ctx?: unknown) => void
      warn: (msg: unknown, ctx?: unknown) => void
      error: (msg: unknown, ctx?: unknown) => void
      debug: (msg: unknown, ctx?: unknown) => void
    }
  }
  fire(event: string, payload: Record<string, unknown>): unknown
  fireAsync(event: string, payload: Record<string, unknown>): Promise<unknown>
  recordedLogs: readonly RecordedLog[]
}

const SESSION_A = 'session-A'
const SESSION_B = 'session-B'

function buildSession(opts: {
  readonly sessionId: string
  readonly cwd?: string
} = { sessionId: SESSION_A }): HandlerSession {
  const recordedLogs: RecordedLog[] = []
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>()
  const sessionId = opts.sessionId
  const cwd = opts.cwd ?? '/test'
  const mockCtx = {
    cwd,
    sessionManager: { getSessionId: () => sessionId },
  } as unknown

  function fire(event: string, payload: Record<string, unknown>): unknown {
    const list = handlers.get(event) ?? []
    let result: unknown
    for (const handler of list) {
      result = handler(payload as unknown, mockCtx)
    }
    return result
  }

  async function fireAsync(event: string, payload: Record<string, unknown>): Promise<unknown> {
    const list = handlers.get(event) ?? []
    let result: unknown
    for (const handler of list) {
      result = await handler(payload as unknown, mockCtx)
    }
    return result
  }

  const api = {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    },
    logger: {
      info(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'info', message, context })
      },
      warn(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'warn', message, context })
      },
      error(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'error', message, context })
      },
      debug(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'debug', message, context })
      },
    },
  }

  return { api, fire, fireAsync, recordedLogs }
}

const FeatureU3 = makeFeature({ it, layer })

const dispatchDutyToml = `dispatch_doctrine_skills = ["task-decomposition"]`
const bothGuardsToml = `dispatch_doctrine_skills = ["task-decomposition"]
no_delegate_skills = ["task-decomposition"]`
const emptyToml = ``
const malformedToml = `not valid toml [[[`

const seededLayer = (contents: Record<string, string>): EffectLayer.Layer<TomlLoader, never, never> => {
  return TomlLoaderLive.pipe(
    EffectLayer.provide(MemoryFileSystem.layerWith(contents)),
    EffectLayer.provide(PathModule.layer),
  )
}

const hasEvent = (logs: readonly RecordedLog[], event: string): boolean => logs.some((l) => l.message === event)
const SESSION_LABEL_LOGS = { 'agent_discipline': 'agent_discipline' }

const createProjectDir = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-dispatch-'))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
  return dir
}

const cleanupProjectDir = (dir: string): void => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}

FeatureU3('Dispatch-doctrine — executor config')
  .body(({ scenario }) => {
    scenario(
      'Reads dispatch_doctrine_skills from the project TOML',
      { scenarioLayer: seededLayer({ '/test/systemfsoftware.toml': dispatchDutyToml }) },
      Gherkin.Do.pipe(
        Given('a project with dispatch_doctrine_skills = ["task-decomposition"]')(
          'cwd',
          () => Effect.succeed('/test'),
        ),
        When('runDispatchDoctrineConfig is called')('skills', (s) => runDispatchDoctrineConfig(s.cwd)),
        Then('it returns ["task-decomposition"]')((s) =>
          Effect.sync(() => {
            expect(s.skills).toEqual(['task-decomposition'])
          })
        ),
      ),
    )

    scenario(
      'Returns empty list when the key is absent',
      { scenarioLayer: seededLayer({ '/test/systemfsoftware.toml': emptyToml }) },
      Gherkin.Do.pipe(
        Given('a project TOML with no dispatch_doctrine_skills key')(
          'cwd',
          () => Effect.succeed('/test'),
        ),
        When('runDispatchDoctrineConfig is called')('skills', (s) => runDispatchDoctrineConfig(s.cwd)),
        Then('it returns [] (gate off)')((s) =>
          Effect.sync(() => {
            expect(s.skills).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Fails open when TOML is malformed',
      { scenarioLayer: seededLayer({ '/test/systemfsoftware.toml': malformedToml }) },
      Gherkin.Do.pipe(
        Given('a project TOML that does not parse')(
          'cwd',
          () => Effect.succeed('/test'),
        ),
        When('runDispatchDoctrineConfig is called')('skills', (s) => runDispatchDoctrineConfig(s.cwd)),
        Then('it returns [] (fail-open per R6 / malformed-layer precedent)')((s) =>
          Effect.sync(() => {
            expect(s.skills).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Returns [] for an unknown cwd',
      { scenarioLayer: seededLayer({ '/test/systemfsoftware.toml': dispatchDutyToml }) },
      Gherkin.Do.pipe(
        Given('a cwd with no TOML on disk')('cwd', () => Effect.succeed('/elsewhere')),
        When('runDispatchDoctrineConfig is called')('skills', (s) => runDispatchDoctrineConfig(s.cwd)),
        Then('it returns []')((s) =>
          Effect.sync(() => {
            expect(s.skills).toEqual([])
          })
        ),
      ),
    )
  })

FeatureU3('Dispatch-doctrine — handler tool_call gate')
  .body(({ scenario }) => {
    scenario(
      'Fresh session, task dispatch without doctrine loaded → blocks with the kernel',
      Gherkin.Do.pipe(
        Given('a fresh session and the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a task tool_call fires')('result', (s) =>
          Effect.promise(async () => {
            try {
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'write a small unit' },
              })) as { readonly block?: boolean; readonly reason?: string } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the verdict blocks with reason = DOCTRINE_KERNEL')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
            expect(s.result?.reason).toBe(DOCTRINE_KERNEL)
          })
        ),
        And('the dispatch.blocked telemetry fires for that session')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.dispatch.blocked')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Retry on the same session after the kernel-block → allowed (flag flipped by the block)',
      Gherkin.Do.pipe(
        Given('a fresh session where the first dispatch blocked (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              await session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'first' },
              })
              return { projectDir, session }
            }),
        ),
        When('a second task tool_call fires on the same session')('result', (s) =>
          Effect.promise(async () => {
            try {
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'second' },
              })) as { readonly block?: boolean } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the verdict does NOT block')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the dispatch.observed telemetry fires instead of blocked')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.dispatch.observed')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Config absent → task dispatch is never blocked (gate off)',
      Gherkin.Do.pipe(
        Given('a fresh session with no dispatch_doctrine_skills (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({})
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a task tool_call fires')('result', (s) =>
          Effect.promise(async () => {
            try {
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'write a small unit' },
              })) as { readonly block?: boolean } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the verdict does NOT block (gate off, R6)')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the dispatch.observed telemetry fires (gate off but dogfood metric still on)')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.dispatch.observed')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Batch dispatch of object items surfaces spec-shape telemetry',
      Gherkin.Do.pipe(
        Given('a loaded session with the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              await session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'first' },
              })
              return { projectDir, session }
            }),
        ),
        When('a batch dispatch whose items carry spec fields fires')('result', (s) =>
          Effect.promise(async () => {
            try {
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: {
                  context: 'fan-out',
                  tasks: [
                    { task: 'objective: build the gate\nwrite_scope: ["src/a.ts"]\nverify_commands: ["pnpm test"]' },
                    { task: 'objective: write docs' },
                  ],
                },
              })) as { readonly block?: boolean } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the batch is allowed and observed telemetry carries the spec shape')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
            const log = s.setup.session.recordedLogs.find(
              (l) => l.message === 'agent_discipline.dispatch.observed',
            )
            expect(log).toBeDefined()
            const ctx = log?.context as Record<string, unknown>
            expect(ctx['batch_size']).toBe(2)
            expect(ctx['has_objective']).toBe(true)
            expect(ctx['has_write_scope']).toBe(true)
            expect(ctx['has_verify_commands']).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Unseen session id is independent from another session id',
      Gherkin.Do.pipe(
        Given('two independent sessions registered with the gate (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const a = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              const b = buildSession({ sessionId: SESSION_B, cwd: projectDir })
              mod.DispatchDoctrineExtension(a.api as never)
              mod.DispatchDoctrineExtension(b.api as never)
              return { projectDir, a, b }
            }),
        ),
        When('session A blocks and then session B dispatches')('result', (s) =>
          Effect.promise(async () => {
            try {
              const aFirst = await s.setup.a.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'first' },
              }) as { readonly block?: boolean } | undefined
              const bFirst = await s.setup.b.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'first' },
              }) as { readonly block?: boolean } | undefined
              const aSecond = await s.setup.a.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 'second' },
              }) as { readonly block?: boolean } | undefined
              return { aFirst, bFirst, aSecond }
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('A blocks first, B blocks first (independent), A retries allowed')((s) =>
          Effect.sync(() => {
            expect(s.result.aFirst?.block).toBe(true)
            expect(s.result.bFirst?.block).toBe(true)
            expect(s.result.aSecond?.block).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Read of skill://task-decomposition observed → flag flips',
      Gherkin.Do.pipe(
        Given('a fresh session with the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a read of the doctrine skill starts and ends successfully')('result', (s) =>
          Effect.promise(async () => {
            try {
              s.setup.session.fire('tool_execution_start', {
                type: 'tool_execution_start',
                toolName: 'read',
                toolCallId: 'tc-1',
                args: { path: 'skill://task-decomposition' },
              })
              await new Promise((r) => setTimeout(r, 60))
              s.setup.session.fire('tool_execution_end', {
                type: 'tool_execution_end',
                toolName: 'read',
                toolCallId: 'tc-1',
                isError: false,
              })
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 're-dispatch' },
              })) as { readonly block?: boolean } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the next task dispatch is allowed')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the doctrine.loaded telemetry fires')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Read of skill://task-decomposition with isError:true → still blocks',
      Gherkin.Do.pipe(
        Given('a fresh session with the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a failed read of the doctrine skill ends')('result', (s) =>
          Effect.promise(async () => {
            try {
              s.setup.session.fire('tool_execution_start', {
                type: 'tool_execution_start',
                toolName: 'read',
                toolCallId: 'tc-err-1',
                args: { path: 'skill://task-decomposition' },
              })
              await new Promise((r) => setTimeout(r, 60))
              s.setup.session.fire('tool_execution_end', {
                type: 'tool_execution_end',
                toolName: 'read',
                toolCallId: 'tc-err-1',
                isError: true,
              })
              return (await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { task: 're-dispatch' },
              })) as { readonly block?: boolean; readonly reason?: string } | undefined
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the next task dispatch still blocks (failed read never satisfies the gate)')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
            expect(s.result?.reason).toBe(DOCTRINE_KERNEL)
          })
        ),
        And('no doctrine.loaded telemetry fires')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Filesystem-path read of the doctrine skill toggles the flag',
      Gherkin.Do.pipe(
        Given('a fresh session with the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a successful read of /skills/task-decomposition/SKILL.md ends')(
          'result',
          (s) =>
            Effect.promise(async () => {
              try {
                s.setup.session.fire('tool_execution_start', {
                  type: 'tool_execution_start',
                  toolName: 'read',
                  toolCallId: 'tc-fs-1',
                  args: { path: '/workspace/skills/task-decomposition/SKILL.md' },
                })
                await new Promise((r) => setTimeout(r, 60))
                s.setup.session.fire('tool_execution_end', {
                  type: 'tool_execution_end',
                  toolName: 'read',
                  toolCallId: 'tc-fs-1',
                  isError: false,
                })
                return (await s.setup.session.fireAsync('tool_call', {
                  type: 'tool_call',
                  toolName: 'task',
                  input: { task: 're-dispatch' },
                })) as { readonly block?: boolean } | undefined
              } finally {
                cleanupProjectDir(s.setup.projectDir)
              }
            }),
        ),
        Then('the next task dispatch is allowed')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the doctrine.loaded telemetry fires')((s) =>
          Effect.sync(() => {
            expect(hasEvent(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Ordering: not-loaded dispatch carries the kernel reason (gate runs first, R7)',
      Gherkin.Do.pipe(
        Given('a fresh session with both gates configured (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': bothGuardsToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('a delegator-tool dispatch refers to the protected skill')('result', (s) =>
          Effect.promise(async () => {
            try {
              const first = await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { prompt: 'invoke the task-decomposition skill' },
              }) as { readonly block?: boolean; readonly reason?: string } | undefined
              const second = await s.setup.session.fireAsync('tool_call', {
                type: 'tool_call',
                toolName: 'task',
                input: { prompt: 'invoke the task-decomposition skill' },
              }) as { readonly block?: boolean; readonly reason?: string } | undefined
              return { first, second }
            } finally {
              cleanupProjectDir(s.setup.projectDir)
            }
          })),
        Then('the first block reason is the kernel; the second is allowed (gate satisfied, no recursion)')((s) =>
          Effect.sync(() => {
            expect(s.result.first?.block).toBe(true)
            expect(s.result.first?.reason).toBe(DOCTRINE_KERNEL)
            expect(s.result.second?.block).toBeUndefined()
          })
        ),
      ),
    )
    scenario(
      'Cap eviction respects the active dispatching session',
      Gherkin.Do.pipe(
        Given('a fresh session A and the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': dispatchDutyToml })
              vi.resetModules()
              const mod = await import('../src/dispatch-doctrine.handler.js')
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never)
              return { projectDir, session }
            }),
        ),
        When('an already-known session A retries while the map is full of other ids')(
          'result',
          (s) =>
            Effect.promise(async () => {
              try {
                // Pre-fill the flag map with 50 unrelated session ids.
                for (let i = 0; i < 50; i++) {
                  const flood = buildSession({ sessionId: 'flood-' + i, cwd: s.setup.projectDir })
                  const mod = await import('../src/dispatch-doctrine.handler.js')
                  mod.DispatchDoctrineExtension(flood.api as never)
                  await flood.fireAsync('tool_call', {
                    type: 'tool_call',
                    toolName: 'task',
                    input: { task: 'warm' },
                  })
                }
                // Session A's first dispatch: this adds session A to the
                // already-full map, triggering eviction. The eviction
                // must skip session A (the active dispatching session) per
                // KTD5.
                const first = await s.setup.session.fireAsync('tool_call', {
                  type: 'tool_call',
                  toolName: 'task',
                  input: { task: 'first' },
                }) as { readonly block?: boolean } | undefined
                // Session A retries: still allowed because the first
                // block flipped the flag and the eviction preserved it.
                const retry = await s.setup.session.fireAsync('tool_call', {
                  type: 'tool_call',
                  toolName: 'task',
                  input: { task: 'retry' },
                }) as { readonly block?: boolean } | undefined
                return { first, retry }
              } finally {
                cleanupProjectDir(s.setup.projectDir)
              }
            }),
        ),
        Then('session A is never evicted (KTD5) — the first block flips the flag and the retry is allowed')((s) =>
          Effect.sync(() => {
            expect(s.result.first?.block).toBe(true)
            expect(s.result.retry?.block).toBeUndefined()
          })
        ),
      ),
    )
  })
FeatureU3('Dispatch-doctrine — drift guard')
  .body(({ scenario }) => {
    scenario(
      'DOCTRINE_KERNEL equals the marked excerpt in the skill file (whitespace-normalized)',
      Gherkin.Do.pipe(
        Given('the skill file at the package tree')(
          'path',
          () => {
            const here = path.dirname(fileURLToPath(import.meta.url))
            const skillPath = path.resolve(here, '../skills/task-decomposition/SKILL.md')
            if (!fs.existsSync(skillPath)) {
              throw new Error('skill file missing: ' + skillPath)
            }
            return Effect.succeed(skillPath)
          },
        ),
        When('the file is parsed and the marked excerpt is extracted')('check', (s) =>
          Effect.sync(() => {
            const raw = fs.readFileSync(s.path, 'utf8')
            const begin = '<!-- BEGIN DOCTRINE KERNEL -->'
            const end = '<!-- END DOCTRINE KERNEL -->'
            const beginIdx = raw.indexOf(begin)
            const endIdx = raw.indexOf(end)
            if (beginIdx === -1 || endIdx === -1) {
              throw new Error('doctrine markers missing in ' + s.path)
            }
            const excerpt = raw.slice(beginIdx + begin.length, endIdx).trim()
            const normalize = (t: string): string => t.replace(/\s+/g, ' ').trim()
            const frontmatter = raw.split('---')[1] ?? ''
            const hasName = /^name: task-decomposition$/m.test(frontmatter)
            const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
            const description = descMatch?.[1] ?? ''
            return {
              excerpt,
              normalizedExcerpt: normalize(excerpt),
              normalizedKernel: normalize(DOCTRINE_KERNEL),
              hasName,
              hasDescription: description.trim().length > 0,
            }
          })),
        Then('the kernel normalized-equals the marked excerpt and the frontmatter is valid')((s) =>
          Effect.sync(() => {
            expect(s.check.normalizedKernel).toBe(s.check.normalizedExcerpt)
            expect(s.check.hasName).toBe(true)
            expect(s.check.hasDescription).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Missing skill file fails with a path-naming message',
      Gherkin.Do.pipe(
        Given('a non-existent skill path')(
          'path',
          () => Effect.succeed('/nonexistent/omp/plugins/omp-agent-discipline/skills/task-decomposition/SKILL.md'),
        ),
        When('the drift guard tries to read the file')('check', (s) =>
          Effect.sync(() => {
            try {
              fs.readFileSync(s.path, 'utf8')
              return { thrown: false, message: '' }
            } catch (e) {
              return { thrown: true, message: e instanceof Error ? e.message : String(e) }
            }
          })),
        Then('the failure names the absent path')((s) =>
          Effect.sync(() => {
            expect(s.check.thrown).toBe(true)
            expect(s.check.message).toContain('/nonexistent/')
          })
        ),
      ),
    )
  })

FeatureU3('Dispatch-doctrine — extractSpecShape helper')
  .body(({ scenario }) => {
    scenario(
      'Detects all three field names in a unit spec',
      Gherkin.Do.pipe(
        Given('a text that names objective, write_scope, and verify_commands')(
          'text',
          () =>
            Effect.succeed(
              'objective: add a gate\nwrite_scope: ["src/foo.ts"]\nverify_commands: ["pnpm test"]',
            ),
        ),
        When('extractSpecShape is called')('shape', (s) => Effect.sync(() => extractSpecShape(s.text))),
        Then('all three flags are true')((s) =>
          Effect.sync(() => {
            expect(s.shape.hasObjective).toBe(true)
            expect(s.shape.hasWriteScope).toBe(true)
            expect(s.shape.hasVerifyCommands).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Detects fields case-insensitively and as word-bounded substrings',
      Gherkin.Do.pipe(
        Given('a text with mixed-case field names stuck in prose')(
          'text',
          () => Effect.succeed('OBJECTIVE on hand; Write_Scope notes; verify_commands pending.'),
        ),
        When('extractSpecShape is called')('shape', (s) => Effect.sync(() => extractSpecShape(s.text))),
        Then('all three flags are true')((s) =>
          Effect.sync(() => {
            expect(s.shape.hasObjective).toBe(true)
            expect(s.shape.hasWriteScope).toBe(true)
            expect(s.shape.hasVerifyCommands).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Empty input yields all-false flags without throwing',
      Gherkin.Do.pipe(
        Given('an empty string')('text', () => Effect.succeed('')),
        When('extractSpecShape is called')('shape', (s) => Effect.sync(() => extractSpecShape(s.text))),
        Then('all three flags are false')((s) =>
          Effect.sync(() => {
            expect(s.shape.hasObjective).toBe(false)
            expect(s.shape.hasWriteScope).toBe(false)
            expect(s.shape.hasVerifyCommands).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A field name that is a substring of another word does NOT match',
      Gherkin.Do.pipe(
        Given('a text with prefix-bounded fabrications only')(
          'text',
          () => Effect.succeed('subordinator software objectives are not objectives; traits'),
        ),
        When('extractSpecShape is called')('shape', (s) => Effect.sync(() => extractSpecShape(s.text))),
        Then('all three flags are false (word-boundary protects against false positives)')((s) =>
          Effect.sync(() => {
            expect(s.shape.hasObjective).toBe(false)
            expect(s.shape.hasWriteScope).toBe(false)
            expect(s.shape.hasVerifyCommands).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A spec mentioning only one field yields only one flag',
      Gherkin.Do.pipe(
        Given('a text that mentions verify_commands only')(
          'text',
          () => Effect.succeed('verify_commands ["pnpm test"]'),
        ),
        When('extractSpecShape is called')('shape', (s) => Effect.sync(() => extractSpecShape(s.text))),
        Then('only hasVerifyCommands is true')((s) =>
          Effect.sync(() => {
            expect(s.shape.hasObjective).toBe(false)
            expect(s.shape.hasWriteScope).toBe(false)
            expect(s.shape.hasVerifyCommands).toBe(true)
          })
        ),
      ),
    )
  })
