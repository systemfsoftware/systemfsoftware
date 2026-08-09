import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type { ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import type { HookDispatchResult } from '../src/hook-dispatcher.executor.js'
import { dispatchHookEvent } from '../src/hook-dispatcher.executor.js'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession } from '../src/hook-session.shape.js'
import { makeSettingsJson, makeShellHookScript } from './hook-dispatcher-fixture.observer.js'

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

const fileWritten: ToolResultEvent = {
  type: 'tool_result',
  toolName: 'write',
  toolCallId: 'toolu_01ABC',
  input: { path: '/src/checkout.ts', content: '// tally the basket\nexport const total = 1' },
  content: [{ type: 'text', text: 'Wrote 2 lines to /src/checkout.ts' }],
  isError: false,
  details: undefined,
}

const commandFailed: ToolResultEvent = {
  type: 'tool_result',
  toolName: 'bash',
  toolCallId: 'toolu_02DEF',
  input: { command: 'npm test' },
  content: [{ type: 'text', text: '1 test failed' }],
  isError: true,
  details: undefined,
}

const textReachingAgent = (seen: HookDispatchResult): string =>
  seen !== undefined && 'content' in seen
    ? seen.content.map((block) => 'text' in block ? block.text : '').join('\n')
    : ''

const reportedAsFailure = (seen: HookDispatchResult): boolean | undefined =>
  seen !== undefined && 'isError' in seen ? seen.isError : undefined

Feature('Reviewing a change the agent already made')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const reviewerRejecting = (complaint: string) => (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const reviewer = yield* makeShellHookScript(dir, 'reviewer', 2, complaint)
        yield* makeSettingsJson(dir, {
          PostToolUse: [{ hooks: [{ type: 'command', command: reviewer }] }],
          PostToolUseFailure: [{ hooks: [{ type: 'command', command: reviewer }] }],
        })
        return dir
      })

    const theToolRuns = (event: ToolResultEvent) => (s: { readonly dir: string }) =>
      dispatchHookEvent({ _tag: 'ToolResult', event, ctx: makeCtx(s.dir) })

    scenario(
      'A reviewer objects to a file the agent has already written',
      Gherkin.Do.pipe(
        Given('a project whose reviewer rejects any comment it finds')(
          'dir',
          reviewerRejecting('remove the comment on line 1'),
        ),
        When('the agent writes a file containing a comment')('seen', theToolRuns(fileWritten)),
        Then('the objection reaches the agent alongside what the tool reported')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain('Wrote 2 lines to /src/checkout.ts')
            expect(textReachingAgent(s.seen)).toContain('remove the comment on line 1')
          })
        ),
        Then('the write is still reported as having succeeded')((s) =>
          Effect.sync(() => {
            expect(reportedAsFailure(s.seen)).not.toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A reviewer stays silent about a file it is happy with',
      Gherkin.Do.pipe(
        Given('a project whose reviewer accepts everything')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const reviewer = yield* makeShellHookScript(dir, 'quiet-reviewer', 0)
            yield* makeSettingsJson(dir, {
              PostToolUse: [{ hooks: [{ type: 'command', command: reviewer }] }],
            })
            return dir
          })),
        When('the agent writes a file the reviewer is happy with')('seen', theToolRuns(fileWritten)),
        Then('what the tool reported reaches the agent untouched')((s) =>
          Effect.sync(() => {
            expect(s.seen).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A reviewer comments on a command that had already failed',
      Gherkin.Do.pipe(
        Given('a project whose reviewer rejects any comment it finds')(
          'dir',
          reviewerRejecting('the suite is red, fix it before retrying'),
        ),
        When('a command the agent ran exits non-zero')('seen', theToolRuns(commandFailed)),
        Then('the failure is still reported as a failure')((s) =>
          Effect.sync(() => {
            expect(reportedAsFailure(s.seen)).toBe(true)
          })
        ),
        Then("the reviewer's note reaches the agent with the original error")((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain('1 test failed')
            expect(textReachingAgent(s.seen)).toContain('the suite is red, fix it before retrying')
          })
        ),
      ),
    )
  })
