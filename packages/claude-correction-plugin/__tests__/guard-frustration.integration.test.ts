import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'
import { expect } from 'vitest'
import { guardFrustration, GuardFrustrationExecutorDeps } from '../src/guard-frustration.executor.js'

const Feature = makeFeature({ it, layer })

interface PromptTerminal {
  readonly says: (prompt: string) => Effect.Effect<void>
  readonly sendsRaw: (payload: string) => Effect.Effect<void>
  readonly losesTheInputStream: Effect.Effect<void>
  readonly noticesSeenByTheAgent: Effect.Effect<string>
}

class Terminal extends Context.Tag('PromptTerminal')<Terminal, PromptTerminal>() {}

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
        GuardFrustrationExecutorDeps,
        GuardFrustrationExecutorDeps.of({
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

const theAgentTakesItsNextTurn = () => guardFrustration()

const noticesSeenByTheAgent = Effect.flatMap(Terminal, (terminal) => terminal.noticesSeenByTheAgent)

const OUTBURSTS = [
  { outburst: 'this is not what I asked' },
  { outburst: 'that is incorrect' },
  { outburst: 'i need more guidance on this' },
  { outburst: 'never mind' },
  { outburst: 'wait, really?' },
  { outburst: 'total failure' },
  { outburst: 'nobody asked' },
  { outburst: 'i already told you' },
  { outburst: 'you are an idiot' },
] as const

const PASSING_GRUMBLES = [
  { grumble: 'this is useless' },
  { grumble: 'seriously?' },
  { grumble: 'ugh' },
  { grumble: 'wow really' },
  { grumble: 'that is terrible' },
] as const

const DOUBLED_GRUMBLES = [
  { doubled: 'this is useless, thanks for nothing' },
  { doubled: 'ugh, that is terrible' },
] as const

const QUOTED_OUTBURSTS = [
  { quoted: '"you are wrong" is the string the test asserts' },
  { quoted: 'the fixture prints `never mind` on exit' },
  { quoted: 'note <-- i already told you' },
  { quoted: "the error banner still reads 'you are wrong' after the retry" },
  { quoted: '```\nyou are wrong\n```' },
] as const

const CALM_REQUESTS = [
  { request: 'add a test for the parser' },
  { request: 'please rerun the gate' },
] as const

Feature('Pulling the agent up when the user loses patience with it')
  .withScenarioLayer(FakeTerminal)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A user who says the agent is wrong stops it and sends it back over the last few messages',
      Gherkin.Do.pipe(
        Given('the user has told the agent outright that it is wrong')(() =>
          Effect.flatMap(Terminal, (terminal) => terminal.says('you are wrong'))
        ),
        When('the agent takes its next turn')(theAgentTakesItsNextTurn),
        Then('the agent is ordered to stop, re-read the recent messages, and prove it saved the correction')(() =>
          Effect.map(noticesSeenByTheAgent, (notices) => {
            expect(notices).toBe(`*** SYSTEM INTERVENTION ***
STATUS: CRITICAL
ACTION REQUIRED: IMMEDIATE COMPLIANCE

1. CEASE generating. Do NOT continue your current approach.
2. Re-read the user's last 3-5 messages. You MUST identify where you diverged.
3. Acknowledge the specific mistake. FORBIDDEN: deflecting, excusing, or restating what you already said.
4. You MUST search existing memories FIRST using whatever persistence tools are available in this session.
   - If a relevant memory EXISTS: UPDATE it with the correction. Do NOT create a duplicate.
   - If NO relevant memory exists: ONLY THEN create a new one.
   FORBIDDEN: append-only memory slop. FORBIDDEN: claiming you saved without an actual tool invocation. The user WILL verify.
5. Show the tool call result or file path as proof. No exceptions.

Non-compliance is NOT ACCEPTABLE.
*** END INTERVENTION ***
`)
          })
        ),
      ),
    )

    scenarioOutline(
      'Saying "<outburst>" on its own is enough to stop the agent',
      OUTBURSTS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has lost patience in a single unmistakable sentence')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.outburst))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is ordered to stop and account for itself')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toContain('SYSTEM INTERVENTION')
            })
          ),
        ),
    )

    scenarioOutline(
      'A passing grumble of "<grumble>" is not treated as an intervention',
      PASSING_GRUMBLES,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has grumbled once without otherwise signalling frustration')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.grumble))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is told nothing')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toBe('')
            })
          ),
        ),
    )

    scenarioOutline(
      'A grumble shouted as "<grumble> NOW" is treated as an intervention',
      PASSING_GRUMBLES,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has grumbled once and shouted a word of it')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(`${row.grumble} NOW`))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is ordered to stop and account for itself')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toContain('SYSTEM INTERVENTION')
            })
          ),
        ),
    )

    scenarioOutline(
      'Two grumbles in one message — "<doubled>" — are treated as an intervention',
      DOUBLED_GRUMBLES,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has grumbled twice in the same message')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.doubled))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is ordered to stop and account for itself')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toContain('SYSTEM INTERVENTION')
            })
          ),
        ),
    )

    scenarioOutline(
      'An outburst only being quoted — "<quoted>" — leaves the agent alone',
      QUOTED_OUTBURSTS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has quoted an angry phrase rather than saying it')(() =>
            Effect.flatMap(Terminal, (terminal) => terminal.says(row.quoted))
          ),
          When('the agent takes its next turn')(theAgentTakesItsNextTurn),
          Then('the agent is told nothing')(() =>
            Effect.map(noticesSeenByTheAgent, (notices) => {
              expect(notices).toBe('')
            })
          ),
        ),
    )

    scenarioOutline(
      'A calm request to "<request>" reaches the agent untouched',
      CALM_REQUESTS,
      (row) =>
        Gherkin.Do.pipe(
          Given('the user has asked for work in a level tone')(() =>
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
      'An angry message that arrives garbled still lets the turn run',
      Gherkin.Do.pipe(
        Given('the user has lost patience but the message arrived truncated')(() =>
          Effect.flatMap(Terminal, (terminal) => terminal.sendsRaw('{"prompt": "you are wrong'))
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
