/**
 * Dispatch-doctrine — handler tool_call gate integration test.
 *
 * Real filesystem (tmp dirs) and the recording `ExtensionAPI` harness (see
 * `dispatch-doctrine-fixture.observer.ts`). The recording harness stands in
 * for the host because there is no real Claude Code runtime in the test
 * process; it is an interface boundary, not a substitute for real I/O.
 */

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { bootstrapPluginRuntime } from '@systemfsoftware/omp-runtime'
import { Effect } from 'effect'
import { Layer } from 'effect'
import * as PathModule from 'effect/Path'
import { NoDelegateSkillsLive } from '../../src/delegation/config.js'
import { DispatchDoctrineSkillsLive } from '../../src/doctrine/config.js'
import { DOCTRINE_KERNEL } from '../../src/doctrine/mod.js'
import type { DispatchDoctrineExtension as _DispatchDoctrineExtension } from '../../src/doctrine/mod.js'
import {
  BOTH_GUARDS_TOML,
  buildSession,
  createProjectDir,
  DISPATCH_DUTY_TOML,
  eventHas,
  resetProjectDir,
  SESSION_A,
  SESSION_B,
} from './__fixtures__/DispatchDoctrineFixture.js'

const Feature = makeFeature({ it, layer })

Feature('Dispatch-doctrine — handler tool_call gate')
  .body(({ scenario }) => {
    scenario(
      'Fresh session, task dispatch without doctrine loaded → blocks with the kernel',
      Gherkin.Do.pipe(
        Given('a fresh session and the gate enabled (real tmp dir)')(
          'setup',
          () =>
            Effect.promise(async () => {
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
              resetProjectDir(s.setup.projectDir)
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
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.dispatch.blocked')).toBe(true)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
              resetProjectDir(s.setup.projectDir)
            }
          })),
        Then('the verdict does NOT block')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the dispatch.observed telemetry fires instead of blocked')((s) =>
          Effect.sync(() => {
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.dispatch.observed')).toBe(true)
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
              // Isolate the user layer: without this, the operator's real
              // user-level config would arm the gate and void 'config absent'.
              process.env['HARNESS_POLICY_HOME'] = projectDir
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
              delete process.env['HARNESS_POLICY_HOME']
              resetProjectDir(s.setup.projectDir)
            }
          })),
        Then('the verdict does NOT block (gate off, R6)')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the dispatch.observed telemetry fires (gate off but dogfood metric still on)')((s) =>
          Effect.sync(() => {
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.dispatch.observed')).toBe(true)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
              resetProjectDir(s.setup.projectDir)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const appLayer = Layer.mergeAll(
                nodeLayer,
                Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive),
              )
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const a = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              const b = buildSession({ sessionId: SESSION_B, cwd: projectDir })
              mod.DispatchDoctrineExtension(a.api as never, runSafe)
              mod.DispatchDoctrineExtension(b.api as never, runSafe)
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
              resetProjectDir(s.setup.projectDir)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
              return { projectDir, session }
            }),
        ),
        When('a read of the doctrine skill starts and ends successfully')('result', (s) =>
          Effect.promise(async () => {
            try {
              await s.setup.session.fireAsync('tool_execution_start', {
                type: 'tool_execution_start',
                toolName: 'read',
                toolCallId: 'tc-1',
                args: { path: 'skill://task-decomposition' },
              })
              await s.setup.session.fireAsync('tool_execution_end', {
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
              resetProjectDir(s.setup.projectDir)
            }
          })),
        Then('the next task dispatch is allowed')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBeUndefined()
          })
        ),
        And('the doctrine.loaded telemetry fires')((s) =>
          Effect.sync(() => {
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(true)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
              return { projectDir, session }
            }),
        ),
        When('a failed read of the doctrine skill ends')('result', (s) =>
          Effect.promise(async () => {
            try {
              await s.setup.session.fireAsync('tool_execution_start', {
                type: 'tool_execution_start',
                toolName: 'read',
                toolCallId: 'tc-err-1',
                args: { path: 'skill://task-decomposition' },
              })
              await s.setup.session.fireAsync('tool_execution_end', {
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
              resetProjectDir(s.setup.projectDir)
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
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(false)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
              return { projectDir, session }
            }),
        ),
        When('a successful read of /skills/task-decomposition/SKILL.md ends')(
          'result',
          (s) =>
            Effect.promise(async () => {
              try {
                await s.setup.session.fireAsync('tool_execution_start', {
                  type: 'tool_execution_start',
                  toolName: 'read',
                  toolCallId: 'tc-fs-1',
                  args: { path: '/workspace/skills/task-decomposition/SKILL.md' },
                })
                await s.setup.session.fireAsync('tool_execution_end', {
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
                resetProjectDir(s.setup.projectDir)
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
            expect(eventHas(s.setup.session.recordedLogs, 'agent_discipline.doctrine.loaded')).toBe(true)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': BOTH_GUARDS_TOML })
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
              resetProjectDir(s.setup.projectDir)
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
              const projectDir = createProjectDir({ 'systemfsoftware.toml': DISPATCH_DUTY_TOML })
              vi.resetModules()
              const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
              const policyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
              const appLayer = Layer.mergeAll(nodeLayer, policyLive)
              const { runSafe } = bootstrapPluginRuntime(appLayer)
              const { warmHarnessPolicy } = await import('../../src/runtime.js')
              await runSafe(warmHarnessPolicy(projectDir))
              const mod = await import('../../src/doctrine/mod.js')
              mod.__resetDoctrineStateForTesting()
              const session = buildSession({ sessionId: SESSION_A, cwd: projectDir })
              mod.DispatchDoctrineExtension(session.api as never, runSafe)
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
                  const _floodNodeLayer = Layer.mergeAll(NodeFileSystem.layer, PathModule.layer)
                  const _floodPolicyLive = Layer.mergeAll(DispatchDoctrineSkillsLive, NoDelegateSkillsLive)
                  const _floodAppLayer = Layer.mergeAll(_floodNodeLayer, _floodPolicyLive)
                  const { runSafe } = bootstrapPluginRuntime(_floodAppLayer)
                  const { warmHarnessPolicy: _floodWarm } = await import('../../src/runtime.js')
                  await runSafe(_floodWarm(s.setup.projectDir))
                  const mod = await import('../../src/doctrine/mod.js')
                  mod.DispatchDoctrineExtension(flood.api as never, runSafe)
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
                resetProjectDir(s.setup.projectDir)
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
