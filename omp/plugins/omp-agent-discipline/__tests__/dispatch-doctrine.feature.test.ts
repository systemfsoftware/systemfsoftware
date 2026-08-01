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
