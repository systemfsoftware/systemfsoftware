import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { recordAsyncHookContext } from '../src/async-hook-output.state.js'
import type { HookPrompt, HookSession, HookToolCall } from '../src/hook-dispatcher.executor.js'
import { loadSettingsWithPaths, runPreToolUseHooks, runUserPromptSubmitHooks } from '../src/hook-dispatcher.executor.js'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { expectLoaded } from './loaded.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeCommandExecutor.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

const makeCtx = (cwd: string): HookSession => ({
  cwd,
  sessionManager: { getSessionId: () => 'test-session' },
  ui: { notify: () => {} },
})

const promptEvent: HookPrompt = { text: 'what changed?', source: 'interactive' }

const toolCall: HookToolCall = { toolName: 'write', toolCallId: 'tc-1', input: { file_path: '/t.txt' } }

const emptySettings = (dir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(`${dir}/.claude/settings.json`, JSON.stringify({ hooks: {} }))
    return yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
  })

const tick = (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 10)
  return promise
}

Feature('Async hook delivery', { timeout: 30_000 })
  .withLayer(testLayer)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Buffered notes survive until the next prompt arrives with no prompt hooks',
      Gherkin.Do.pipe(
        When('the in-memory buffer has a note ready and the next prompt runs with empty settings')(
          'delivered',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  recordAsyncHookContext('background scan finished')
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  const settings = yield* emptySettings(dir)
                  return yield* runUserPromptSubmitHooks(
                    expectLoaded(settings),
                    promptEvent,
                    makeCtx(dir),
                  )
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then('the next prompt carries the buffered note above its own text')((s) =>
          Effect.sync(() => {
            expect(s.delivered?.text).toBe('background scan finished\n\nwhat changed?')
          })
        ),
      ),
    )

    scenario(
      'An async PreToolUse hook eventually surfaces in the next prompt',
      Gherkin.Do.pipe(
        When('a PreToolUse async hook is fired and the prompt waits for delivery')(
          'delivered',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  const hookPath = `${dir}/announce.sh`
                  yield* fs.writeFileString(
                    hookPath,
                    `#!/usr/bin/env bash\nprintf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"async hook spoke"}}'\n`,
                  )
                  yield* fs.chmod(hookPath, 0o755)
                  yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
                  yield* fs.writeFileString(
                    `${dir}/.claude/settings.json`,
                    JSON.stringify({
                      hooks: {
                        PreToolUse: [{
                          matcher: 'Write',
                          hooks: [{ type: 'command', command: hookPath, async: true }],
                        }],
                      },
                    }),
                  )

                  const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
                  const ctx = makeCtx(dir)
                  yield* runPreToolUseHooks(expectLoaded(settings), toolCall, ctx)

                  let result
                  for (let attempt = 0; attempt < 200 && result === undefined; attempt++) {
                    yield* Effect.promise(tick)
                    result = yield* runUserPromptSubmitHooks(
                      expectLoaded(settings),
                      promptEvent,
                      ctx,
                    )
                  }
                  return result
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then("the next prompt carries both the async hook and the user's own text")((s) =>
          Effect.sync(() => {
            expect(s.delivered?.text).toContain('async hook spoke')
            expect(s.delivered?.text).toContain('what changed?')
          })
        ),
      ),
    )

    scenario(
      'An async hook that prints non-JSON prose is dropped instead of appended',
      Gherkin.Do.pipe(
        When('an async hook prints a status string and the next prompt runs')(
          'outcome',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  const hookPath = `${dir}/chatty.sh`
                  const sentinel = `${dir}/ran`
                  yield* fs.writeFileString(
                    hookPath,
                    `#!/usr/bin/env bash\nprintf 'Done in 2s using pnpm v11.9.0'\ntouch ${sentinel}\n`,
                  )
                  yield* fs.chmod(hookPath, 0o755)
                  yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
                  yield* fs.writeFileString(
                    `${dir}/.claude/settings.json`,
                    JSON.stringify({
                      hooks: {
                        PreToolUse: [{
                          matcher: 'Write',
                          hooks: [{ type: 'command', command: hookPath, async: true }],
                        }],
                      },
                    }),
                  )

                  const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
                  const ctx = makeCtx(dir)
                  yield* runPreToolUseHooks(expectLoaded(settings), toolCall, ctx)

                  let ran = false
                  for (let attempt = 0; attempt < 200 && !ran; attempt++) {
                    yield* Effect.promise(tick)
                    ran = yield* fs.exists(sentinel)
                  }
                  for (let settle = 0; settle < 10; settle++) yield* Effect.promise(tick)

                  const delivered = yield* runUserPromptSubmitHooks(
                    expectLoaded(settings),
                    promptEvent,
                    ctx,
                  )
                  return { ran, text: delivered?.text }
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then('the hook ran but its raw output never reached the prompt')((s) =>
          Effect.sync(() => {
            expect(s.outcome.ran).toBe(true)
            expect(s.outcome.text ?? promptEvent.text).toBe(promptEvent.text)
          })
        ),
      ),
    )

    scenario(
      'Whitespace-only notes contribute nothing before a speaking hook',
      Gherkin.Do.pipe(
        When('the buffer holds only whitespace then a speaking note, and the next prompt runs')(
          'delivered',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  recordAsyncHookContext('   \n  ')
                  recordAsyncHookContext('the other hook spoke')
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  const settings = yield* emptySettings(dir)
                  return yield* runUserPromptSubmitHooks(
                    expectLoaded(settings),
                    promptEvent,
                    makeCtx(dir),
                  )
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then("the prompt carries only the speaking hook's note")((s) =>
          Effect.sync(() => {
            expect(s.delivered?.text).toBe('the other hook spoke\n\nwhat changed?')
          })
        ),
      ),
    )

    scenario(
      'A runaway stream of notes drops the oldest to keep the buffer current',
      Gherkin.Do.pipe(
        When('the buffer has been fed seventy notes and the next prompt runs')(
          'delivered',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  const settings = yield* emptySettings(dir)
                  for (let note = 0; note < 70; note++) recordAsyncHookContext(`note-${note}`)
                  return yield* runUserPromptSubmitHooks(
                    expectLoaded(settings),
                    promptEvent,
                    makeCtx(dir),
                  )
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then('the delivered prompt shows the latest notes and drops the earliest')((s) =>
          Effect.sync(() => {
            expect(s.delivered?.text).toContain('note-69')
            expect(s.delivered?.text).not.toContain('note-5\n')
            expect(s.delivered?.text?.startsWith('note-6\n')).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A fork that cannot spawn is reported as a failure to the user',
      Gherkin.Do.pipe(
        When('an async hook pointing at a missing binary forks ahead of the next prompt')(
          'notices',
          () =>
            Effect.tryPromise(() =>
              Effect.runPromise(
                Effect.gen(function*() {
                  const fs = yield* FileSystem
                  const dir = yield* fs.makeTempDirectoryScoped()
                  yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
                  yield* fs.writeFileString(
                    `${dir}/.claude/settings.json`,
                    JSON.stringify({
                      hooks: {
                        PreToolUse: [{
                          hooks: [{ type: 'command', command: `${dir}/missing-binary`, args: ['x'], async: true }],
                        }],
                      },
                    }),
                  )

                  const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
                  const notices: string[] = []
                  yield* runPreToolUseHooks(expectLoaded(settings), toolCall, {
                    cwd: dir,
                    sessionManager: { getSessionId: () => 'test-session' },
                    ui: {
                      notify: (message, type) => {
                        notices.push(`${type ?? 'info'}: ${message}`)
                      },
                    },
                  })

                  for (let attempt = 0; attempt < 200 && notices.length === 0; attempt++) {
                    yield* Effect.promise(tick)
                  }
                  return notices
                }).pipe(Effect.scoped, Effect.provide(testLayer)),
              )
            ),
        ),
        Then('the user-facing notification names the failure')((s) =>
          Effect.sync(() => {
            expect(s.notices.join('\n')).toContain('Background hook failed')
          })
        ),
      ),
    )
  })
