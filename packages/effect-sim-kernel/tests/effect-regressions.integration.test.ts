import { expect } from '@effect/vitest'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Queue } from 'effect'
import { sweepLostWakeups } from './__fixtures__/queueFixtures.js'
import type { Take } from './__fixtures__/queueFixtures.js'

const Feature = makeFeature({ it })

const waits: ReadonlyArray<{ readonly wait: string; readonly take: Take }> = [
  { wait: 'takes one message', take: (queue) => Effect.ignore(Queue.take(queue)) },
  { wait: 'takes a fixed number of messages', take: (queue) => Effect.ignore(Queue.takeN(queue, 1)) },
  { wait: 'takes every waiting message', take: (queue) => Effect.ignore(Queue.takeAll(queue)) },
  { wait: 'takes between one and five messages', take: (queue) => Effect.ignore(Queue.takeBetween(queue, 1, 5)) },
  { wait: 'looks at the next message', take: (queue) => Effect.ignore(Queue.peek(queue)) },
]

Feature('A waiting reader receives a message offered to its queue')
  .live("reproduces the defect on Effect's own scheduler, which the kernel would replace")
  .withLayer(Layer.empty)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A reader that <wait> gets a message offered while it was pausing to wait',
      waits,
      (row) =>
        Gherkin.Do.pipe(
          Given(`a reader that ${row.wait}, paused just before it starts waiting`)(
            'take',
            () => Effect.succeed(row.take),
          ),
          When('a message is offered during the pause, at every point the pause can fall')(
            'stranded',
            (s) => Effect.promise(() => sweepLostWakeups(s.take)),
          ),
          Then('no reader is left waiting beside a message already in its queue')((s) => {
            expect(s.stranded).toEqual([])
          }),
        ),
    )
  })
