/**
 * Prompt destination — host-bound vs model-bound classification.
 *
 * Claude Code hands `UserPromptSubmit` stdout to the model in a separate
 * `additionalContext` field. OMP's `InputEventResult` has none, so the bridge
 * prepends hook stdout to the prompt text — but only when the prompt is
 * model-bound. A host-bound prompt (`/compact`, `!ls`, `$$ ...`) is a command
 * the host parses itself; the bridge must not prefix it, or the host loses
 * the command. The classification is `isHostBound`, consumed inside
 * `runUserPromptSubmitHooks`.
 *
 * These scenarios drive `runUserPromptSubmitHooks` end-to-end with a hook that
 * prints a fixed context string. The bridge's observable behaviour is the
 * `InputEventResult` it returns: `undefined` for host-bound prompts (the host
 * receives the original text unchanged), and a prefixed `text` field for
 * model-bound prompts.
 */
import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'

import { HookScopeLive } from '../src/hook-runtime.state.js'
import { type HookSession } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
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

const HOST_SIGILS = [
  '/',
  '!',
  '->',
  '=>',
  '$ ',
  '$\t',
  '$\n',
  '$\r',
  '$$ ',
  '$$\t',
  '$$\n',
  '$$\r',
] as const

const BARE_SIGILS = ['$', '$$'] as const

const LEADING_GAPS = [' ', '\t', '\n', '\r', '  \t\n'] as const

const CONTEXT = 'repo is mid-rebase'

Feature('Prompt destination — host-bound vs model-bound classification')
  .withLayer(testLayer)
  .body(({ scenario, scenarioOutline }) => {
    const withHook = Effect.fn('withHook')(function*() {
      const fs = yield* FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const hook = yield* makeShellHookScript(dir, 'note', 0, undefined, CONTEXT)
      yield* makeSettingsJson(dir, {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
      })
      return dir
    })

    const dispatch = (dir: string, text: string) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        return yield* runUserPromptSubmitHooks(
          expectLoaded(settings),
          { text, source: 'interactive' },
          makeCtx(dir),
        )
      })

    scenarioOutline(
      'A prompt whose opening sigil is a host command reaches the host unchanged',
      HOST_SIGILS.map((sigil) => ({ sigil, prompt: `${sigil}compact now` })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt opens with a host command sigil')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge returns nothing so the host sees the original prompt')((s) =>
            Effect.sync(() => {
              expect(s.result).toBeUndefined()
            })
          ),
        ),
    )

    scenarioOutline(
      'A prompt that is just a sigil on its own still reaches the host',
      HOST_SIGILS.map((sigil) => ({ sigil, prompt: sigil })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt is a single sigil')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge returns nothing so the host dispatches the sigil as-is')((s) =>
            Effect.sync(() => {
              expect(s.result).toBeUndefined()
            })
          ),
        ),
    )

    scenarioOutline(
      'A prompt whose sigil sits behind leading whitespace still reaches the host',
      LEADING_GAPS.map((gap) => ({ gap, prompt: `${gap}/compact` })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt opens with whitespace before a sigil')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge returns nothing so the host dispatches the command')((s) =>
            Effect.sync(() => {
              expect(s.result).toBeUndefined()
            })
          ),
        ),
    )

    scenarioOutline(
      'A bare sigil with no following text still reaches the host',
      BARE_SIGILS.map((sigil) => ({ sigil, prompt: sigil })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt is just a bare sigil')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge returns nothing so the host dispatches the sigil')((s) =>
            Effect.sync(() => {
              expect(s.result).toBeUndefined()
            })
          ),
        ),
    )

    scenarioOutline(
      'A sigil embedded in the middle of a prose prompt is treated as model-bound',
      HOST_SIGILS.map((sigil) => ({ sigil, prompt: `explain x${sigil}y please` })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the sigil is interior to the prose')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge prefixes the hook output onto the prompt for the model')((s) =>
            Effect.sync(() => {
              expect(s.result?.text).toBe(`${CONTEXT}\n\n${row.prompt}`)
            })
          ),
        ),
    )

    scenarioOutline(
      'A bare sigil followed by an identifier is treated as a shell variable, not a command',
      BARE_SIGILS.map((sigil) => ({ sigil, prompt: `${sigil}HOME` })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt opens with a bare sigil and an identifier')('result', (s) => dispatch(s.dir, row.prompt)),
          Then('the bridge prefixes the hook output onto the prompt for the model')((s) =>
            Effect.sync(() => {
              expect(s.result?.text).toBe(`${CONTEXT}\n\n${row.prompt}`)
            })
          ),
        ),
    )

    scenarioOutline(
      'A bare sigil followed by a braced expression is treated as model-bound',
      BARE_SIGILS.map((sigil) => ({ sigil, prompt: `${sigil}{HOME}` })),
      (row) =>
        Gherkin.Do.pipe(
          Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
          When('the prompt opens with a bare sigil and a braced expression')('result', (s) =>
            dispatch(s.dir, row.prompt)),
          Then('the bridge prefixes the hook output onto the prompt for the model')((s) =>
            Effect.sync(() => {
              expect(s.result?.text).toBe(`${CONTEXT}\n\n${row.prompt}`)
            })
          ),
        ),
    )

    scenario(
      'A pure prose prompt receives the hook output as additional context for the model',
      Gherkin.Do.pipe(
        Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
        When('the prompt is plain prose')('result', (s) => dispatch(s.dir, 'please summarise the changes')),
        Then('the bridge returns the prompt with the hook output prepended')((s) =>
          Effect.sync(() => {
            expect(s.result?.text).toBe(`${CONTEXT}\n\nplease summarise the changes`)
          })
        ),
      ),
    )

    scenario(
      'An empty prompt still receives the hook output as additional context for the model',
      Gherkin.Do.pipe(
        Given('a UserPromptSubmit hook that prints context')('dir', () => withHook()),
        When('the prompt is the empty string')('result', (s) => dispatch(s.dir, '')),
        Then('the bridge returns the prompt with the hook output prepended')((s) =>
          Effect.sync(() => {
            expect(s.result?.text).toBe(`${CONTEXT}\n\n`)
          })
        ),
      ),
    )
  })
