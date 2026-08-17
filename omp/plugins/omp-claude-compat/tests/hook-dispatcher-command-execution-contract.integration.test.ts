import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolCall } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runPreToolUseHooks } from '../src/internal/run-pre-tool-use-hooks.executor.js'
import { makeSettingsJson, makeShellHookScript } from './__fixtures__/hook-dispatcher-fixture.observer.js'
import { expectLoaded } from './__fixtures__/loaded.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeChildProcessSpawner.layer.pipe(
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

const makeToolCall = (toolName: string, input: Record<string, unknown>): HookToolCall => ({
  toolName,
  toolCallId: 'tc-test',
  input,
})

Feature('Hook dispatcher - command execution contract')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const loadFrom = (dir: string) => loadSettingsWithPaths([`${dir}/.claude/settings.json`])

    scenario(
      'Should hand args to the binary with no shell interpreting them',
      Gherkin.Do.pipe(
        Given('a hook recording its first argument')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/record.sh`
            yield* fs.writeFileString(
              hookPath,
              `#!/usr/bin/env bash\nprintf '%s' "$1" > "${dir}/arg.txt"\n`,
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{ type: 'command', command: hookPath, args: ['$(id -u)'] }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires the hook')('arg', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            yield* runPreToolUseHooks(
              expectLoaded(settings),
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
            const fs = yield* FileSystem
            return yield* fs.readFileString(`${s.dir}/arg.txt`)
          })),
        Then('the argument arrives verbatim, unexpanded')((s) =>
          Effect.sync(() => {
            expect(s.arg).toBe('$(id -u)')
          })
        ),
      ),
    )

    scenario(
      'Should not let an asyncRewake hook block the tool call',
      Gherkin.Do.pipe(
        Given('a blocking hook marked asyncRewake')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* makeShellHookScript(dir, 'rewake', 2, 'would block')
            yield* makeSettingsJson(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{ type: 'command', command: hook, asyncRewake: true }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            return yield* runPreToolUseHooks(
              expectLoaded(settings),
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
          })),
        Then('the call proceeds because a backgrounded hook cannot decide')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should run the hook under the shell it declares',
      Gherkin.Do.pipe(
        Given('a bash hook recording its interpreter')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{
                  type: 'command',
                  command: `printf '%s' "$0" > "${dir}/shell.txt"`,
                  shell: 'bash',
                }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires the hook')('shell', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            yield* runPreToolUseHooks(
              expectLoaded(settings),
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
            const fs = yield* FileSystem
            return yield* fs.readFileString(`${s.dir}/shell.txt`)
          })),
        Then('bash ran it, not sh')((s) =>
          Effect.sync(() => {
            expect(s.shell).toBe('bash')
          })
        ),
      ),
    )
  })
