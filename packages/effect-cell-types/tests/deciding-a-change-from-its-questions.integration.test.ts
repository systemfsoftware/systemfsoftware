import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'

import { concat, matcher, orElse, when } from './__fixtures__/matcher.blueprint.js'
import { above, ask, is, isQuestion, labels, numbers } from './__fixtures__/question.blueprint.js'

const Feature = makeFeature({ it })

interface Change {
  readonly title: string
}

const breakingChange: Change = { title: 'drop the v1 API' }
const riskyChange: Change = { title: 'rewrite billing' }
const quietChange: Change = { title: 'typo' }

const impact = labels<Change>()(
  'impact',
  ['breaking', 'minor'],
  (change) => change.title.startsWith('drop') ? 'breaking' : 'minor',
)
const risk = labels<Change>()('risk', ['high', 'low'], (change) => change.title.includes('billing') ? 'high' : 'low')
const unanswerable = labels<Change>()('owner', ['team-a'], () => 'nobody')
const size = numbers<Change>()('size', (change) => change.title.length)

Feature('Deciding what to do with a change from the questions asked about it')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A decision built step by step or through a pipe treats every change the same way',
      Gherkin.Do.pipe(
        Given('a decision that blocks breaking changes, scores risky ones 42, and otherwise approves')(
          'decisions',
          () =>
            Effect.succeed([
              matcher<Change>().when(impact.is('breaking'), () => 'block').when(risk.is('high'), () => 42).orElse(
                () => 'approve',
              ),
              pipe(
                matcher<Change>(),
                when(is(impact, 'breaking'), () => 'block'),
                when(pipe(risk, is('high')), () => 42),
                orElse(() => 'approve'),
              ),
              orElse(
                when(when(matcher<Change>(), impact.is('breaking'), () => 'block'), risk.is('high'), () => 42),
                () => 'approve',
              ),
            ]),
        ),
        When('a breaking, a risky, and a quiet change are decided')('outcomes', (s) =>
          Effect.succeed(
            s.decisions.map((
              decide,
            ) => [decide(breakingChange), decide(riskyChange), decide(quietChange), decide.cases]),
          )),
        Then('every decision blocks, scores, and approves them in turn after weighing two cases')((s) => {
          expect(s.outcomes).toEqual([
            ['block', 42, 'approve', 2],
            ['block', 42, 'approve', 2],
            ['block', 42, 'approve', 2],
          ])
        }),
      ),
    )

    scenario(
      'Two lists of cases joined together are weighed in the order they were joined',
      Gherkin.Do.pipe(
        Given('one list that blocks breaking changes and one that blocks nothing but flags risky ones')(
          'lists',
          () =>
            Effect.succeed({
              blocking: matcher<Change>().when(impact.is('breaking'), () => 'block'),
              flagging: matcher<Change>().when(risk.is('high'), () => 'flag'),
            }),
        ),
        When('the lists are joined by step, by pipe, and directly, and a risky change is decided')(
          'outcomes',
          (s) =>
            Effect.succeed([
              s.lists.blocking.concat(s.lists.flagging),
              pipe(s.lists.blocking, concat(s.lists.flagging)),
              concat(s.lists.flagging, s.lists.blocking),
            ].map((joined) => [joined.orElse(() => 'approve')(riskyChange), joined.spec.cases.length])),
        ),
        Then('each joined list flags the risky change after weighing both cases')((s) => {
          expect(s.outcomes).toEqual([['flag', 2], ['flag', 2], ['flag', 2]])
        }),
      ),
    )

    scenario(
      'A question that cannot answer is either refused or settled by the fallback given',
      Gherkin.Do.pipe(
        Given('a question about ownership that no label answers')('question', () => Effect.succeed(unanswerable)),
        When('it is asked with no fallback, with a fallback, and through a pipe')('outcomes', (s) =>
          Effect.all([
            Effect.flip(s.question.ask(quietChange)),
            ask(s.question, quietChange, { onUnsure: () => 'escalate' }),
            pipe(impact, ask(breakingChange)),
          ])),
        Then('the bare question is refused and the others settle')((s) => {
          expect([s.outcomes[0]._tag, s.outcomes[0].question, s.outcomes[1], s.outcomes[2]]).toEqual([
            'Unsure',
            'owner',
            'escalate',
            'breaking',
          ])
        }),
      ),
    )

    scenario(
      'A size question checks a threshold, and every question lists what it can answer',
      Gherkin.Do.pipe(
        Given('a question about the size of a change')('question', () => Effect.succeed(size)),
        When('a long and a short change are checked against five characters')('verdicts', (s) =>
          Effect.succeed({
            long: s.question.above(5).holds(riskyChange),
            short: pipe(s.question, above(5)).holds(quietChange),
            named: [s.question.above(5).id, impact.labels, isQuestion(impact), isQuestion(breakingChange)],
          })),
        Then('only the long change passes, and the impact question names its two labels')((s) => {
          expect(s.verdicts).toEqual({
            long: true,
            short: false,
            named: ['size above 5', ['breaking', 'minor'], true, false],
          })
        }),
      ),
    )
  })
