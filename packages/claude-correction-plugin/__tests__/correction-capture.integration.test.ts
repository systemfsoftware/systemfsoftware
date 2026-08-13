import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'
import { expect } from 'vitest'
import { captureCorrection, CaptureCorrectionExecutorDeps } from '../src/capture-correction.executor.js'

const Feature = makeFeature({ it, layer })

interface PromptTerminal {
  readonly says: (prompt: string) => Effect.Effect<void>
  readonly sendsRaw: (payload: string) => Effect.Effect<void>
  readonly losesTheInputStream: Effect.Effect<void>
  readonly noticesSeenByTheAgent: Effect.Effect<string>
}

class Terminal extends Context.Tag(
  '@systemfsoftware/claude-correction-plugin/__tests__/correction-capture.integration.test/Terminal',
)<Terminal, PromptTerminal>() {}

const FakeTerminal = Layer.unwrapEffect(
  Effect.gen(function*() {
    const pending = yield* Ref.make('')
    const streamLost = yield* Ref.make(false)
    const shown = yield* Ref.make('')

    return Layer.merge(
      Layer.succeed(
        Terminal,
        Terminal.of({
          says: (prompt) =>
            Ref.set(pending, JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt, cwd: '/repo' })),
          sendsRaw: (payload) => Ref.set(pending, payload),
          losesTheInputStream: Ref.set(streamLost, true),
          noticesSeenByTheAgent: Ref.get(shown),
        }),
      ),
      Layer.succeed(
        CaptureCorrectionExecutorDeps,
        CaptureCorrectionExecutorDeps.of({
          readSubmission: Effect.if(Ref.get(streamLost), {
            onTrue: () => Effect.succeed(''),
            onFalse: () => Ref.get(pending),
          }),
          emit: (notice) => Ref.update(shown, (prior) => prior + notice),
        }),
      ),
    )
  }),
)

const theAgentTakesItsNextTurn = () => captureCorrection()

const noticesSeenByTheAgent = Effect.flatMap(Terminal, (terminal) => terminal.noticesSeenByTheAgent)

const CORRECTIVE_REMARKS = [
  { remark: 'f- fail' },
  { remark: 'do that instead of this' },
  { remark: 'you need to rewrite the parser' },
  { remark: 'redo it properly' },
  { remark: 'it should never throw' },
  { remark: "you don't need to add a cache" },
  { remark: 'another failure' },
  { remark: 'the implementation is garbage' },
  { remark: 'did you even read the file' },
] as const

const ORDINARY_REQUESTS = [
  { request: 'add a test for the parser' },
  { request: 'i need to redo my notes' },
  { request: 'the instead operator is fine' },
  { request: 'what does this module do' },
] as const

Feature('Correcting the agent so the same mistake does not recur')
  .withScenarioLayer(FakeTerminal)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A user who says the work is wrong sends the agent to its memory before it replies',
      Gherkin.Do.pipe(
        Given('the user has told the agent that its code is wrong and must be fixed')(() =>
          Effect.flatMap(Terminal, (terminal) => terminal.says('your code is wrong, fix it'))
        ),
        When('the agent takes its next turn')(theAgentTakesItsNextTurn),
        Then('the agent is told to extract the durable rule and persist it before acting')(() =>
          Effect.map(noticesSeenByTheAgent, (notices) => {
            expect(notices).toBe(`<correction-capture>
The user just corrected you. A correction is the highest-signal data in the session — capture it
so the mistake is never repeated, then act on it.

REQUIRED:
1. Extract the DURABLE rule, not the one-off: what was wrong, the correct approach, and why.
2. Persist it to memory now (the project memory tools / MEMORY.md) as a feedback entry.
3. Then apply the correction.

Skip only if this is not actually a correction (a fresh request, not a fix to your behaviour).
</correction-capture>`)
          })
        ),
      ),
    )

    scenarioOutline(
      'The agent is pulled up when the user says "<remark>"',
      CORRECTIVE_REMARKS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has corrected the agent')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.remark))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is told to record the correction')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toContain('<correction-capture>')
            })
          ),
        ),
    )

    scenarioOutline(
      'An ordinary request to "<request>" reaches the agent untouched',
      ORDINARY_REQUESTS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has asked for new work rather than fixing old work')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.request))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is told nothing')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toBe('')
            })
          ),
        ),
    )

    scenario(
      'A correction that arrives garbled still lets the turn run',
      Gherkin.Do.pipe(
        Given('the user has corrected the agent but the message arrived truncated')(() =>
          Effect.flatMap(Terminal, (terminal) => terminal.sendsRaw('{"prompt": "your code is wrong'))
        ),
        When('the agent takes its next turn')(theAgentTakesItsNextTurn),
        Then('the turn continues and the agent is told nothing')(() =>
          Effect.map(noticesSeenByTheAgent, (notices) => {
            expect(notices).toBe('')
          })
        ),
      ),
    )

    scenario(
      'A turn whose input never arrives still runs to completion',
      Gherkin.Do.pipe(
        Given('the channel carrying the user message has gone silent')(() =>
          Effect.flatMap(Terminal, (terminal) => terminal.losesTheInputStream)
        ),
        When('the agent takes its next turn')(theAgentTakesItsNextTurn),
        Then('the turn continues and the agent is told nothing')(() =>
          Effect.map(noticesSeenByTheAgent, (notices) => {
            expect(notices).toBe('')
          })
        ),
      ),
    )
  })
