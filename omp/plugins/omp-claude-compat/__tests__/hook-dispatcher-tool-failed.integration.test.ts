import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolResult } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runToolResultHooks } from '../src/internal/run-tool-result-hooks.executor.js'
import {
  makeRecorder,
  makeSettingsJson,
  makeShellHookScript,
  runFileOrEmpty,
  runInvocations,
} from './hook-dispatcher-fixture.observer.js'

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

Feature('Hooks for a tool call that failed')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const toolResult = (tool: string, isError: boolean): HookToolResult => ({
      toolName: tool,
      toolCallId: 'toolu_01ABC',
      input: { command: 'npm test' },
      content: [{ type: 'text', text: 'exit status 1' }],
      isError,
    })

    const dispatch = (dir: string, tool: string, isError: boolean) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        if (settings === null) return { ran: [] as readonly string[], warning: undefined }
        const result = yield* runToolResultHooks(settings, toolResult(tool, isError), makeCtx(dir))
        return { ran: yield* runInvocations(dir), warning: result.warning }
      })

    const bothRecorded = (dir: string) =>
      Effect.gen(function*() {
        const onSuccess = yield* makeRecorder(dir, 'success')
        const onFailure = yield* makeRecorder(dir, 'failure')
        yield* makeSettingsJson(dir, {
          PostToolUse: [{ hooks: [onSuccess] }],
          PostToolUseFailure: [{ hooks: [onFailure] }],
        })
      })

    const withBothHooks = (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        yield* bothRecorded(dir)
        return dir
      })

    scenario(
      'Should run the failure hook and leave PostToolUse untouched when a tool throws',
      Gherkin.Do.pipe(
        Given('a settings file hooking both PostToolUse and PostToolUseFailure')('dir', withBothHooks),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('only the failure hook records a run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.ran).toEqual(['failure'])
          })
        ),
      ),
    )

    scenario(
      'Should run PostToolUse and leave the failure hook untouched when a tool succeeds',
      Gherkin.Do.pipe(
        Given('a settings file hooking both PostToolUse and PostToolUseFailure')('dir', withBothHooks),
        When('a bash tool call succeeds')('outcome', (s) => dispatch(s.dir, 'bash', false)),
        Then('only the success hook records a run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.ran).toEqual(['success'])
          })
        ),
      ),
    )

    scenario(
      'Should hand the tool name and the error text to the failure hook',
      Gherkin.Do.pipe(
        Given('a failure hook that saves whatever it is sent')('dir', withBothHooks),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the saved payload names the tool, the call and the error')((s) =>
          Effect.gen(function*() {
            const payload = yield* runFileOrEmpty(`${s.dir}/failure.stdin`)
            expect(payload).toContain('"tool_name":"Bash"')
            expect(payload).toContain('"tool_use_id":"toolu_01ABC"')
            expect(payload).toContain('"error":"exit status 1"')
          })
        ),
      ),
    )

    scenario(
      'Should honour a tool_name matcher on the failure event across two tools',
      Gherkin.Do.pipe(
        Given('a failure hook scoped to Bash only')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const onFailure = yield* makeRecorder(dir, 'bash-only')
            yield* makeSettingsJson(dir, { PostToolUseFailure: [{ matcher: 'Bash', hooks: [onFailure] }] })
            return dir
          })),
        When('a bash call fails and then a read call fails')('ran', (s) =>
          Effect.gen(function*() {
            yield* dispatch(s.dir, 'bash', true)
            yield* dispatch(s.dir, 'read', true)
            return yield* runInvocations(s.dir)
          })),
        Then('only the bash failure is recorded')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bash-only'])
          })
        ),
      ),
    )

    scenario(
      'Should surface stderr as feedback without blocking when a failure hook exits 2',
      Gherkin.Do.pipe(
        Given('a failure hook that exits 2 complaining to stderr')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = yield* makeShellHookScript(dir, 'noisy', 2, 'the build was already broken')
            yield* makeSettingsJson(dir, {
              PostToolUseFailure: [{ hooks: [{ type: 'command', command: hookPath }] }],
            })
            return dir
          })),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the complaint arrives as a warning and nothing is blocked')((s) =>
          Effect.sync(() => {
            expect(s.outcome.warning).toContain('the build was already broken')
          })
        ),
      ),
    )

    scenario(
      'Should degrade to a warning when a failure hook prints malformed JSON',
      Gherkin.Do.pipe(
        Given('a failure hook that exits 0 printing malformed JSON')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = yield* makeShellHookScript(dir, 'garbled', 0, undefined, '{not json')
            yield* makeSettingsJson(dir, {
              PostToolUseFailure: [{ hooks: [{ type: 'command', command: hookPath }] }],
            })
            return dir
          })),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the malformed output becomes a warning rather than throwing')((s) =>
          Effect.sync(() => {
            expect(s.outcome.warning).toContain('invalid JSON')
          })
        ),
      ),
    )
  })
