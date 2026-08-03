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
import { runUserPromptSubmitHooks } from '../src/internal/run-user-prompt-submit-hooks.executor.js'
import { makeSettingsJson, makeShellHookScript } from './hook-dispatcher-fixture.observer.js'
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

const makeToolCall = (toolName: string, input: Record<string, unknown>): HookToolCall => ({
  toolName,
  toolCallId: 'tc-test',
  input,
})

Feature('Hook dispatcher - if condition')
  .withLayer(testLayer)
  .body(({ scenario, scenarioOutline }) => {
    const guardedBy = (rule: string) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hook = yield* makeShellHookScript(dir, 'guard', 2, 'refused')
        yield* makeSettingsJson(dir, {
          PreToolUse: [{ hooks: [{ type: 'command', command: hook, if: rule }] }],
        })
        return dir
      })

    const refused = (dir: string, toolName: string, input: Record<string, unknown>) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        const result = yield* runPreToolUseHooks(expectLoaded(settings), makeToolCall(toolName, input), makeCtx(dir))
        return result?.block === true
      })

    scenarioOutline(
      'Should <verdict> the guard when <rule> meets <command>',
      [
        { rule: 'Bash(git *)', command: 'FOO=bar git push', verdict: 'run', blocks: true },
        { rule: 'Bash(git *)', command: 'npm test && git push', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'echo $(rm -rf /)', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'echo $(date)', verdict: 'skip', blocks: false },
        { rule: 'Bash(git push *)', command: 'echo $(date)', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'npm test', verdict: 'skip', blocks: false },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a PreToolUse guard conditioned on a permission rule')('dir', (_s) => guardedBy(row.rule)),
          When('Claude runs the shell command')(
            'blocked',
            (s) => refused(s.dir, 'bash', { command: row.command }),
          ),
          Then('the guard refuses the call only when its rule matches')((s) =>
            Effect.sync(() => {
              expect(s.blocked).toBe(row.blocks)
            })
          ),
        ),
    )

    scenarioOutline(
      'Should <verdict> the guard when <rule> meets the edited file <file>',
      [
        { rule: 'Edit(*.ts)', file: 'a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit(*.ts)', file: 'a.js', verdict: 'skip', blocks: false },
        { rule: 'Edit(src/**)', file: 'src/a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit(src/**)', file: 'src', verdict: 'run', blocks: true },
        { rule: 'Edit(src/**)', file: 'lib/src/a.ts', verdict: 'skip', blocks: false },
        { rule: 'Edit(**/src/**)', file: 'lib/src/a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit', file: 'anything.md', verdict: 'run', blocks: true },
        { rule: 'Write(*.ts)', file: 'a.ts', verdict: 'skip', blocks: false },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a PreToolUse guard conditioned on a path rule')('dir', (_s) => guardedBy(row.rule)),
          When('Claude edits the file')(
            'blocked',
            (s) => refused(s.dir, 'edit', { file_path: `${s.dir}/${row.file}` }),
          ),
          Then('the guard refuses the edit only when its rule matches the path')((s) =>
            Effect.sync(() => {
              expect(s.blocked).toBe(row.blocks)
            })
          ),
        ),
    )

    scenario(
      'Should never run a hook carrying an if condition on a non-tool event',
      Gherkin.Do.pipe(
        Given('a prompt hook carrying an if condition')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* makeShellHookScript(dir, 'reject', 2, 'prompt refused')
            yield* makeSettingsJson(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook, if: 'Bash(git *)' }] }],
            })
            return { dir }
          })),
        When('a prompt is submitted')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            return yield* runUserPromptSubmitHooks(
              expectLoaded(settings),
              { text: 'hello', source: 'interactive' },
              makeCtx(s.dir.dir),
            )
          })),
        Then('the hook is skipped rather than blocking the prompt')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })
