import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'

import { failReportOf, passReportOf } from './__fixtures__/checkReports.js'
import {
  CollectionCommand,
  collectionModel,
  collectionOracle,
  RemoveCommand,
  removeOnlyModel,
} from './__fixtures__/collection.model.js'
import {
  type Collections,
  correctCollection,
  endIndexDroppingCollection,
  runCollectionCommand,
} from './__fixtures__/Stores.js'

const Feature = makeFeature({ it })

const sequenceRunsOf = (sequences: number, operations: number, seed: number) => ({ sequences, operations, seed })

const collectionCheck = (
  implementation: Layer.Layer<Collections>,
  sequences: number,
  operations: number,
  seed = 0,
) =>
  Conformance.sequential(implementation, {
    commands: CollectionCommand,
    model: collectionModel,
    run: runCollectionCommand,
    ...sequenceRunsOf(sequences, operations, seed),
  })

const removeOnlyCheck = (implementation: Layer.Layer<Collections>, sequences: number, operations: number) =>
  Conformance.sequential(implementation, {
    commands: RemoveCommand,
    model: removeOnlyModel,
    run: runCollectionCommand,
    ...sequenceRunsOf(sequences, operations, 0),
  })

Feature('Keeping a run of commands in step with a pure model')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'An insertion at the end that loses the element fails the sequence at that insertion',
      Gherkin.Do.pipe(
        Given('a collection that loses an element inserted at the end')(
          'collection',
          () => Effect.succeed(endIndexDroppingCollection),
        ),
        When('the check runs eight sequences of twenty commands from seed 42')(
          'checked',
          (s) => collectionCheck(s.collection, 8, 20, 42),
        ),
        Then('the run is rejected at the first step the model no longer explains')((s) => {
          const failed = failReportOf(s.checked)
          expect(failed.failure.judgement.problem).toBe('model-diverged')
          expect(failed.failure.judgement.step).toBe(collectionOracle.firstDivergence(failed.failure.operations))
        }),
        And('the rejected step is the insertion at the end that lost the element')((s) => {
          const failed = failReportOf(s.checked)
          expect(collectionOracle.endIndexInsertion(failed.failure.operations, failed.failure.judgement.step)).toBe(
            true,
          )
        }),
        And('the report names the step where the model diverged')((s) => {
          const failed = failReportOf(s.checked)
          expect(Conformance.render(s.checked)).toContain(
            `the model diverged at step ${failed.failure.judgement.step}`,
          )
        }),
      ),
    )

    scenario(
      'A faithful collection keeps a thousand sequences in step with the model',
      Gherkin.Do.pipe(
        Given('a collection that keeps every element it is given')(
          'collection',
          () => Effect.succeed(correctCollection),
        ),
        When('the check runs a thousand sequences of ten commands')(
          'checked',
          (s) => collectionCheck(s.collection, 1000, 10),
        ),
        Then('every sequence is explained by the model')((s) => {
          expect(passReportOf(s.checked).histories).toBe(1000)
        }),
      ),
    )

    scenario(
      'A failing sequence of forty commands shrinks to the shortest sequence that still diverges',
      Gherkin.Do.pipe(
        Given('a collection that loses an element inserted at the end')(
          'collection',
          () => Effect.succeed(endIndexDroppingCollection),
        ),
        When('the check runs a single sequence of forty commands from seed 1')(
          'checked',
          (s) => collectionCheck(s.collection, 1, 40, 1),
        ),
        Then('the reported sequence is far shorter than the forty commands that were drawn')((s) => {
          const failed = failReportOf(s.checked)
          expect(failed.failure.operations.length).toBeGreaterThan(0)
          expect(failed.failure.operations.length).toBeLessThan(40)
        }),
        And('the reported sequence still ends at the step the model diverged')((s) => {
          const failed = failReportOf(s.checked)
          expect(failed.failure.judgement.step).toBe(failed.failure.operations.length)
          expect(failed.failure.judgement.problem).toBe('model-diverged')
        }),
      ),
    )

    scenario(
      'A removal from an empty collection is passed over rather than judged a divergence',
      Gherkin.Do.pipe(
        Given('a faithful collection whose only command is a removal, starting empty')(
          'collection',
          () => Effect.succeed(correctCollection),
        ),
        When('the check runs twenty sequences of ten commands, each a removal')(
          'checked',
          (s) => removeOnlyCheck(s.collection, 20, 10),
        ),
        Then('every sequence passes because no removal may run yet')((s) => {
          expect(passReportOf(s.checked).histories).toBe(20)
        }),
      ),
    )
  })
