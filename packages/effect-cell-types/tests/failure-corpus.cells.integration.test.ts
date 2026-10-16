import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { downstreamDeadlock } from './__fixtures__/failure-corpus/downstream-deadlock.js'
import { messagelessWriteHandler } from './__fixtures__/failure-corpus/messageless-write-handler.js'
import { type CorpusFixture, FIRST_LOCATION, recordOf } from './__fixtures__/failure-corpus/record.js'
import { schemaConstructorError } from './__fixtures__/failure-corpus/schema-constructor-error.js'
import { upstreamDeadlock } from './__fixtures__/failure-corpus/upstream-deadlock.js'

const Feature = makeFeature({ it })

const verdictOf = (fixture: CorpusFixture, record: string): Record<string, boolean | string | undefined> => {
  const first = FIRST_LOCATION.exec(record)?.[0]
  return {
    fixture: fixture.name,
    defectFile: fixture.defectFile,
    namesDefectFile: record.includes(fixture.defectFile),
    expectedFirstLocationFile: fixture.expectedFirstLocationFile,
    foundFirstLocationFile: first === undefined ? undefined : first.replace(/:\d+$/u, ''),
    foundFirstLocation: first,
  }
}

const reportsOf = Effect.gen(function*() {
  const downstream = yield* Effect.promise(() => recordOf(downstreamDeadlock))
  const upstream = yield* Effect.promise(() => recordOf(upstreamDeadlock))
  const writeHandler = yield* Effect.promise(() => recordOf(messagelessWriteHandler))
  const schemaConstructor = yield* Effect.promise(() => recordOf(schemaConstructorError))
  return { downstream, upstream, writeHandler, schemaConstructor }
})

Feature('The cell pipeline prints a failure record that names the defect')
  .withLayer(Layer.empty)
  .live('the corpus drives the simulation kernel itself, and a kernel run cannot happen inside another kernel run')
  .body(({ scenario }) => {
    scenario(
      'A defective cell yields a record naming its defect file and starting at the failing site',
      Gherkin.Do.pipe(
        Given('four defective cell programs whose failures the corpus renders')('reports', () => reportsOf),
        Then('each record names its defect file and starts at the failing site')((s, expect) =>
          expect({
            downstream: verdictOf(downstreamDeadlock, s.reports.downstream),
            upstream: verdictOf(upstreamDeadlock, s.reports.upstream),
            writeHandler: verdictOf(messagelessWriteHandler, s.reports.writeHandler),
            schemaConstructor: verdictOf(schemaConstructorError, s.reports.schemaConstructor),
          }).toMatchObject({
            downstream: {
              fixture: downstreamDeadlock.name,
              defectFile: downstreamDeadlock.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: downstreamDeadlock.expectedFirstLocationFile,
            },
            upstream: {
              fixture: upstreamDeadlock.name,
              defectFile: upstreamDeadlock.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: upstreamDeadlock.expectedFirstLocationFile,
            },
            writeHandler: {
              fixture: messagelessWriteHandler.name,
              defectFile: messagelessWriteHandler.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: messagelessWriteHandler.expectedFirstLocationFile,
            },
            schemaConstructor: {
              fixture: schemaConstructorError.name,
              defectFile: schemaConstructorError.defectFile,
              namesDefectFile: true,
              foundFirstLocationFile: schemaConstructorError.expectedFirstLocationFile,
            },
          })
        ),
      ),
    )
  })
