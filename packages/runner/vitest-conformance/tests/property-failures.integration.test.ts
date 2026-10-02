import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match, Option } from 'effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import type { ProvidedContext } from 'vitest'
import {
  CoverageErrorShape,
  errorOf,
  NonBooleanErrorShape,
  type RawError,
  readSeedStore,
  RefutedErrorShape,
  removeSeedStore,
  runProbes,
  VacuousErrorShape,
} from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const KINDS = 'property-failure-kinds.property.test.ts'
const IDENTITY = 'property-seed-identity.property.test.ts'
const REPLAY = 'seed-replay.property.test.ts'

const REFUTED = '∀xs_DropsTheLast_⊆Input'
const NON_BOOLEAN = '∀n_ReturnsAnObject_⊥Verdict'
const COVERED = '∀n_UnreachableCoverage_⊇Minimum'
const VACUOUS = '∀n_AlwaysOne_=One'

const FIRST = '∀n_FirstIdentity_⊥Verdict'
const SECOND = '∀n_SecondIdentity_⊥Verdict'

const REFUTED_ALWAYS = '∀n_ShiftedByOne_≠n'

const CHECK_DEFAULTS = '@systemfsoftware/vitest:property-check'

const seeded = (seed: number): Partial<ProvidedContext> => ({ [CHECK_DEFAULTS]: { seed } })

const forkedRun = (glob: string, provide?: Partial<ProvidedContext>) =>
  runProbes({ globs: [glob], pool: 'forks', ...(provide === undefined ? {} : { provide }) })

/** A forked run that keeps the seed store on, paired with the store entries it leaves beside the probe. */
const recordedRun = (seed: number) =>
  runProbes({ globs: [REPLAY], pool: 'forks', seed, record: true }).pipe(
    Effect.flatMap((run) => readSeedStore(REPLAY).pipe(Effect.map((store) => ({ run, store })))),
  )

/** Removes the probe's seed store after every scenario, so a run never inherits a previous one's entries. */
const seedStoreCleanup = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.sync(() => removeSeedStore(REPLAY))),
)

const firstVacuous = (errors: ReadonlyArray<RawError>) =>
  Option.getOrThrow(
    Option.firstSomeOf(errors.map((error) => Schema.decodeUnknownOption(VacuousErrorShape)(error))),
  )

Feature('A property failure crosses a real Vitest worker boundary')
  .live('each scenario starts real forked Vitest runs over the probe fixtures beside this suite')
  .withLayer(Layer.empty)
  .withScenarioLayer(seedStoreCleanup)
  .body(({ scenario }) => {
    scenario(
      'Every failure kind arrives with its tagged fields',
      Gherkin.Do.pipe(
        Given('a forked run raising each of the four kinds')('run', () => forkedRun(KINDS)),
        Then('each error carries its tag and every field the contract names')((s, expect) => {
          const refuted = Option.getOrThrow(
            Schema.decodeUnknownOption(RefutedErrorShape)(errorOf(s.run, REFUTED).raw),
          )
          const nonBoolean = Option.getOrThrow(
            Schema.decodeUnknownOption(NonBooleanErrorShape)(errorOf(s.run, NON_BOOLEAN).raw),
          )
          const coverage = Option.getOrThrow(
            Schema.decodeUnknownOption(CoverageErrorShape)(errorOf(s.run, COVERED).raw),
          )
          const vacuous = firstVacuous(s.run.moduleErrors)
          return expect({
            refuted: {
              tag: refuted._tag,
              name: refuted.property.name,
              siteIsTextOrNull: refuted.property.site === null || typeof refuted.property.site === 'string',
              seedWhole: Number.isInteger(refuted.property.seed),
              runsWhole: Number.isInteger(refuted.property.runs),
              witnessRendered: refuted.counterexample.rendered.length > 0,
              shrinksWhole: Number.isInteger(refuted.shrinks),
              replay: refuted.replay.length > 0,
            },
            nonBoolean: {
              tag: nonBoolean._tag,
              name: nonBoolean.property.name,
              drawnRendered: nonBoolean.drawn.rendered.length > 0,
              returned: nonBoolean.returned,
              replay: nonBoolean.replay.length > 0,
            },
            coverage: {
              tag: coverage._tag,
              name: coverage.property.name,
              labels: coverage.classes.map((entry) => entry.label),
              hits: coverage.classes.map((entry) => entry.hits),
              runsWhole: coverage.classes.map((entry) => Number.isInteger(entry.runs)),
              minima: coverage.classes.map((entry) => entry.minimum),
              replay: coverage.replay.length > 0,
            },
            vacuous: {
              tag: vacuous._tag,
              labels: vacuous.subjects.map((subject) => subject.label),
              names: vacuous.subjects.flatMap((subject) => subject.properties.map((run) => run.property.name)),
              frozen: vacuous.subjects.flatMap((subject) =>
                subject.properties.map((run) =>
                  Match.value(run.frozen).pipe(
                    Match.tag('Frozen', (frozen) => ({
                      tag: 'Frozen',
                      members: frozen.outputs.map((entry) => entry.member),
                      rendered: frozen.outputs.map((entry) => entry.output.rendered),
                      values: frozen.outputs.map((entry) => entry.output.value),
                    })),
                    Match.tag('NeverCalled', () => ({ tag: 'NeverCalled' })),
                    Match.exhaustive,
                  )
                )
              ),
              exempt: vacuous.exempt,
              replay: vacuous.replay.length > 0,
            },
          }).toEqual({
            refuted: {
              tag: 'PropertyRefuted',
              name: REFUTED,
              siteIsTextOrNull: true,
              seedWhole: true,
              runsWhole: true,
              witnessRendered: true,
              shrinksWhole: true,
              replay: true,
            },
            nonBoolean: {
              tag: 'NonBooleanVerdict',
              name: NON_BOOLEAN,
              drawnRendered: true,
              returned: ['object'],
              replay: true,
            },
            coverage: {
              tag: 'CoverageBelowMinimum',
              name: COVERED,
              labels: ['unreachable'],
              hits: [0],
              runsWhole: [true],
              minima: [0.5],
              replay: true,
            },
            vacuous: {
              tag: 'VacuousProperty',
              labels: ['a function of 1 argument(s)'],
              names: [VACUOUS],
              frozen: [{ tag: 'Frozen', members: ['the subject'], rendered: ['1'], values: [1] }],
              exempt: [],
              replay: true,
            },
          })
        }),
      ),
    )

    scenario(
      'A provided seed keeps one property stable across processes while two names differ',
      Gherkin.Do.pipe(
        Given('a forked run over the identity probe with seed 1')(
          'first',
          () => forkedRun(IDENTITY, seeded(1)),
        ),
        When('the same probe runs again in a second process')(
          'second',
          () => forkedRun(IDENTITY, seeded(1)),
        ),
        Then('the first property matches itself and differs from the second')((s, expect) => {
          const firstHere = Option.getOrThrow(
            Schema.decodeUnknownOption(NonBooleanErrorShape)(errorOf(s.first, FIRST).raw),
          )
          const firstThere = Option.getOrThrow(
            Schema.decodeUnknownOption(NonBooleanErrorShape)(errorOf(s.second, FIRST).raw),
          )
          const second = Option.getOrThrow(
            Schema.decodeUnknownOption(NonBooleanErrorShape)(errorOf(s.first, SECOND).raw),
          )
          return expect({
            sameSeed: firstHere.property.seed === firstThere.property.seed,
            sameDrawn: firstHere.drawn.rendered === firstThere.drawn.rendered,
            differentSeeds: firstHere.property.seed !== second.property.seed,
            differentDrawn: firstHere.drawn.rendered !== second.drawn.rendered,
          }).toEqual({ sameSeed: true, sameDrawn: true, differentSeeds: true, differentDrawn: true })
        }),
      ),
    )

    scenario(
      'A recorded failing seed replays before novel draws in a second process',
      Gherkin.Do.pipe(
        Given('a forked run with recording on and seed 1 that writes the failing seed')(
          'first',
          () => Effect.andThen(Effect.sync(() => removeSeedStore(REPLAY)), recordedRun(1)),
        ),
        When('the same probe runs in a second process with recording on and seed 2')(
          'second',
          () => recordedRun(2),
        ),
        Then('the second run replays the first seed and the store gains no duplicate')((s, expect) => {
          const first = Option.getOrThrow(
            Schema.decodeUnknownOption(RefutedErrorShape)(errorOf(s.first.run, REFUTED_ALWAYS).raw),
          )
          const second = Option.getOrThrow(
            Schema.decodeUnknownOption(RefutedErrorShape)(errorOf(s.second.run, REFUTED_ALWAYS).raw),
          )
          return expect({
            stored: s.first.store.map((entry) => entry.property),
            storedSeedIsFirstSeed: s.first.store[0]?.seed === first.property.seed,
            firstTag: first._tag,
            secondTag: second._tag,
            replayedSeed: second.property.seed === first.property.seed,
            replayedCounterexample: second.counterexample.rendered === first.counterexample.rendered,
            storeAfterSecond: s.second.store.length,
          }).toEqual({
            stored: [REFUTED_ALWAYS],
            storedSeedIsFirstSeed: true,
            firstTag: 'PropertyRefuted',
            secondTag: 'PropertyRefuted',
            replayedSeed: true,
            replayedCounterexample: true,
            storeAfterSecond: 1,
          })
        }),
      ),
    )
  })
