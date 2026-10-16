import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Schema } from 'effect'

import { failReportOf } from './__fixtures__/checkReports.js'
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

const thousandSequences = 1000
const twentySequences = 20
const fortyOperations = 40

const divergedAtEndInsertion = (step: number | undefined) =>
  Schema.makeFilter((operations) =>
    Array.isArray(operations) && collectionOracle.endIndexInsertion(operations, step)
      ? undefined
      : 'the divergent step is the insertion at the end that lost the element'
  )

const shrunkBelow = (drawn: number) =>
  Schema.makeFilter((operations) =>
    Array.isArray(operations) && operations.length > 0 && operations.length < drawn
      ? undefined
      : `the reported sequence is empty or not shorter than the ${drawn} commands drawn`
  )

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

Feature('Keeping a run of commands in step with a pure model', { timeout: 0 })
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
        Then(
          'the run is rejected at the first step the model no longer explains, the insertion at the end that lost the element',
        )(
          (s, expect) => {
            const failure = failReportOf(s.checked).failure
            const step = failure.judgement.step
            return expect(
              {
                report: s.checked,
                operations: failure.operations,
                rendered: Conformance.render(s.checked),
              },
              Conformance.render(s.checked),
            ).toMatchObject({
              report: {
                _tag: 'Fail',
                failure: {
                  judgement: {
                    problem: 'model-diverged',
                    step: collectionOracle.firstDivergence(failure.operations),
                  },
                },
              },
              operations: expect.schemaMatching(Schema.Unknown.pipe(Schema.check(divergedAtEndInsertion(step)))),
              rendered: expect.stringContaining(`the model diverged at step ${step}`),
            })
          },
        ),
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
          (s) => collectionCheck(s.collection, thousandSequences, 10),
        ),
        Then('every sequence is explained by the model')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({
            _tag: 'Pass',
            histories: thousandSequences,
          })
        ),
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
          (s) => collectionCheck(s.collection, 1, fortyOperations, 1),
        ),
        Then(
          'the reported sequence is far shorter than the forty commands that were drawn and still ends at the divergence',
        )(
          (s, expect) => {
            const failure = failReportOf(s.checked).failure
            const count = failure.operations.length
            return expect({
              report: s.checked,
              operations: failure.operations,
            }).toMatchObject({
              report: {
                _tag: 'Fail',
                failure: { judgement: { problem: 'model-diverged', step: count } },
              },
              operations: expect.schemaMatching(Schema.Unknown.pipe(Schema.check(shrunkBelow(fortyOperations)))),
            })
          },
        ),
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
          (s) => removeOnlyCheck(s.collection, twentySequences, 10),
        ),
        Then('every sequence passes because no removal may run yet')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({
            _tag: 'Pass',
            histories: twentySequences,
          })
        ),
      ),
    )
  })
