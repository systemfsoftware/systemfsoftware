import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolCall } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runPreToolUseHooks } from '../src/internal/run-pre-tool-use-hooks.executor.js'
import { makeGuardedSettingsJson, makePathGuardScript, makeSettingsJson } from './hook-dispatcher-fixture.observer.js'

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

const makeToolCall = (toolName: string, input: Record<string, unknown>): HookToolCall => ({
  toolName,
  toolCallId: 'tc-test',
  input,
})

const guardedDir = (name: string, forbidden: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hook = yield* makePathGuardScript(dir, name, forbidden)
    yield* makeGuardedSettingsJson(dir, hook)
    return { dir, hook }
  })

const dispatchEdit = (dir: string, patch: string) =>
  Effect.gen(function*() {
    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    if (settings === null) throw new Error('expected settings to load, got null')
    return yield* runPreToolUseHooks(
      settings,
      makeToolCall('edit', { i: 'x', input: patch }),
      makeCtx(dir),
    )
  })

Feature('Hook dispatcher — patch grammar reaches the guard')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should block an apply-patch hunk that updates a protected file',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an apply-patch updates an innocent then a vendored file')('result', (s) =>
          dispatchEdit(
            s.dir.dir,
            '*** Begin Patch\n*** Update File: docs/ok.md\n*** Update File: repos/vendored/x.rs\n*** End Patch\n',
          )),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block an apply-patch hunk that moves a file into a protected path',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an apply-patch renames into the vendored tree')('result', (s) =>
          dispatchEdit(
            s.dir.dir,
            '*** Begin Patch\n*** Update File: docs/ok.md\n*** Move to: repos/vendored/x.rs\n*** End Patch\n',
          )),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should recover the exact target path when the payload is CRLF encoded with a BOM',
      Gherkin.Do.pipe(
        Given('a hook recording every file_path it receives')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/recorder.sh`
            yield* fs.writeFileString(
              hookPath,
              [
                '#!/usr/bin/env bash',
                'payload=$(cat)',
                `printf '%s' "$payload" | grep -o '"file_path":"[^"]*"' | sed 's/.*:"//; s/"$//' >> ${dir}/paths.log`,
                'exit 0',
              ].join('\n'),
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: hookPath }] }],
            })
            return { dir }
          })),
        When('an edit arrives CRLF encoded')('log', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            yield* dispatchEdit(s.dir.dir, '\uFEFF[repos/vendored/x.rs#A1B2]\r\nDEL 1\r\n')
            return yield* fs.readFileString(`${s.dir.dir}/paths.log`)
          })),
        Then('the guard should see the path with no stray carriage return or bracket')((s) =>
          Effect.sync(() => {
            expect(s.log.split('\n').filter(Boolean)).toEqual(['repos/vendored/x.rs'])
          })
        ),
      ),
    )

    scenario(
      'Should allow an edit whose body row merely begins with the MV keyword',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an edit inserts a literal line starting with MV')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nINS.POST 1:\n+MV repos/vendored/x.rs\n'),
        ),
        Then('the dispatcher should not treat the body row as a rename')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })
