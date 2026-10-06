import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { decodeTransitionDiagram, renderDiagram } from '@systemfsoftware/transition-diagram'
import { Effect, Option, Result } from 'effect'
import { turnstileToDiagram } from './__fixtures__/turnstile-table.fixture.js'

const Feature = makeFeature({ it })

const DANGLING_TARGET = {
  id: 'dangling',
  title: 'dangling',
  states: [{ id: 'start', label: 'Start', kind: 'initial' }],
  transitions: [{ from: 'start', to: 'nowhere', event: 'Go', kind: 'normal' }],
} as const

const DUPLICATED_STATE = {
  id: 'duplicated',
  title: 'duplicated',
  states: [
    { id: 'start', label: 'Start', kind: 'initial' },
    { id: 'start', label: 'Again', kind: 'outcome' },
  ],
  transitions: [],
} as const

const NO_ENTRY_STATE = {
  id: 'unstarted',
  title: 'unstarted',
  states: [{ id: 'idle', label: 'Idle', kind: 'outcome' }],
  transitions: [],
} as const

const refusalsOf = <A>(outcome: Result.Result<A, ReadonlyArray<object>>): ReadonlyArray<object> =>
  Result.match(outcome, { onFailure: (defects) => [...defects], onSuccess: () => [] })

const acceptedOf = <A>(outcome: Result.Result<A, ReadonlyArray<object>>): boolean => Result.isSuccess(outcome)

Feature('Rendering a decoded transition diagram')
  .live('the diagram renderer over a decoded diagram')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A turnstile table becomes a diagram and renders to mermaid, SVG and text',
      Gherkin.Do.pipe(
        Given('a table of turnstile transitions')('diagram', () => Effect.succeed(turnstileToDiagram())),
        When('the diagram is rendered')('rendered', (state) =>
          Effect.gen(function*() {
            const diagram = Option.getOrThrow(Result.getSuccess(state.diagram))
            return yield* renderDiagram(diagram)
          })),
        Then('the guard is named on the coin edge and the SVG and text are filled')((state, expect) =>
          expect({
            accepted: acceptedOf(state.diagram),
            mermaid: state.rendered.mermaid,
            svg: state.rendered.svg.startsWith('<svg'),
            text: state.rendered.text.length > 0,
          }).toMatchObject({
            accepted: true,
            mermaid:
              'flowchart LR\n  locked["Locked"]\n  admit{"Admit"}\n  locked -->|"Coin [hasFare]"| admit\n  admit -->|"Allow"| unlocked["Unlocked"]\n  admit -.->|"Deny"| alarm["Alarm"]\n  unlocked -->|"Push"| locked\n  alarm -->|"Reset"| closed(["Closed"])\n',
            svg: true,
            text: true,
          })
        ),
      ),
    )

    scenario(
      'A transition to a state the diagram never declares is refused',
      Gherkin.Do.pipe(
        Given('a diagram whose transition leaves for an undeclared state')(
          'raw',
          () => Effect.succeed(DANGLING_TARGET),
        ),
        When('the diagram is decoded')('outcome', (state) => Effect.succeed(decodeTransitionDiagram(state.raw))),
        Then('the refusal names the undeclared target')((state, expect) =>
          expect(refusalsOf(state.outcome)).toMatchObject([{ _tag: 'DanglingTransitionTarget', to: 'nowhere' }])
        ),
      ),
    )

    scenario(
      'Two states claiming one identifier are refused',
      Gherkin.Do.pipe(
        Given('a diagram whose two states share an identifier')('raw', () => Effect.succeed(DUPLICATED_STATE)),
        When('the diagram is decoded')('outcome', (state) => Effect.succeed(decodeTransitionDiagram(state.raw))),
        Then('the refusal names the duplicated identifier')((state, expect) =>
          expect(refusalsOf(state.outcome)).toMatchObject([{ _tag: 'DuplicateStateId', id: 'start' }])
        ),
      ),
    )

    scenario(
      'A diagram with no entry state is refused',
      Gherkin.Do.pipe(
        Given('a diagram whose states hold no entry point')('raw', () => Effect.succeed(NO_ENTRY_STATE)),
        When('the diagram is decoded')('outcome', (state) => Effect.succeed(decodeTransitionDiagram(state.raw))),
        Then('the refusal names the missing entry state')((state, expect) =>
          expect(refusalsOf(state.outcome)).toMatchObject([{ _tag: 'MissingInitialState' }])
        ),
      ),
    )
  })
