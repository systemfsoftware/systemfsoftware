import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type { InputEventResult } from '@oh-my-pi/pi-coding-agent'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { recordAsyncHookOutput } from '../src/async-hook-output.state.js'
import type { HookPrompt, HookSession, HookToolCall } from '../src/hook-dispatcher.executor.js'
import { loadSettingsWithPaths, runPreToolUseHooks, runUserPromptSubmitHooks } from '../src/hook-dispatcher.executor.js'
import { loaded } from './loaded.observer.js'

const testLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
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

it('Should_CarryBufferedOutput_When_TheNextPromptArrivesWithNoPromptHooks', async () => {
  const delivered = await Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const settings = yield* emptySettings(dir)
    recordAsyncHookOutput('background scan finished')

    return yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, makeCtx(dir))
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(delivered?.text).toBe('background scan finished\n\nwhat changed?')
})

/**
 * Real elapsed time, under the timer rule's integration exception: what this
 * awaits is a detached OS process exiting. Fake timers cannot advance another
 * process, and the dispatcher forks it as a daemon so no fiber handle is
 * exposed to await instead. Polls the delivery path rather than sleeping a
 * guessed duration, so it finishes as soon as the hook does.
 */
const tick = (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 10)
  return promise
}

it('Should_DeliverAsyncHookOutput_When_TheHookFinishesInTheBackground', async () => {
  const delivered = await Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/announce.sh`
    yield* fs.writeFileString(hookPath, '#!/usr/bin/env bash\nprintf "async hook spoke"\n')
    yield* fs.chmod(hookPath, 0o755)
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hookPath, async: true }] }] },
      }),
    )

    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    const ctx = makeCtx(dir)
    yield* runPreToolUseHooks(loaded(settings), toolCall, ctx)

    let result: InputEventResult | undefined
    for (let attempt = 0; attempt < 200 && result === undefined; attempt++) {
      yield* Effect.promise(tick)
      result = yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, ctx)
    }
    return result
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(delivered?.text).toContain('async hook spoke')
  expect(delivered?.text).toContain('what changed?')
}, 25_000)

it('Should_ContributeNothing_When_SilentHookPrecedesSpeakingHook', async () => {
  const delivered = await Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const settings = yield* emptySettings(dir)
    recordAsyncHookOutput('   \n  ')
    recordAsyncHookOutput('the other hook spoke')

    return yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, makeCtx(dir))
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(delivered?.text).toBe('the other hook spoke\n\nwhat changed?')
})

it('Should_DropTheOldestNotes_When_RunawayHookOverfillsBuffer', async () => {
  const delivered = await Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const settings = yield* emptySettings(dir)
    for (let note = 0; note < 70; note++) recordAsyncHookOutput(`note-${note}`)

    return yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, makeCtx(dir))
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(delivered?.text).toContain('note-69')
  expect(delivered?.text).not.toContain('note-5\n')
  expect(delivered?.text?.startsWith('note-6\n')).toBe(true)
})

const makeRecordingCtx = (cwd: string, notices: string[]): HookSession => ({
  cwd,
  sessionManager: { getSessionId: () => 'test-session' },
  ui: {
    notify: (message, type) => {
      notices.push(`${type ?? 'info'}: ${message}`)
    },
  },
})

it('Should_ReportTheFailure_When_ForkedHookCannotSpawn', async () => {
  const notices: string[] = []

  await Effect.gen(function*() {
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
    yield* runPreToolUseHooks(loaded(settings), toolCall, makeRecordingCtx(dir, notices))

    for (let attempt = 0; attempt < 200 && notices.length === 0; attempt++) {
      yield* Effect.promise(tick)
    }
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(notices.join('\n')).toContain('Background hook failed')
}, 25_000)
