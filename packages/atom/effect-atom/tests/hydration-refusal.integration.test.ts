import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Option, Schema } from 'effect'

const Feature = makeFeature({ it })

type DamagedRow = {
  readonly damage: string
  readonly noted: string
  readonly entry: Atom.Hydration.HydrationEntry
  readonly noteKey: string | undefined
  readonly issueMentions: string
}

const damagedEntries: ReadonlyArray<DamagedRow> = [
  {
    damage: 'without its name',
    noted: 'no name',
    entry: { '~effect/reactivity/DehydratedAtom': true, value: 9, dehydratedAt: 1 },
    noteKey: undefined,
    issueMentions: 'at ["key"]',
  },
  {
    damage: 'with a name that is a number',
    noted: 'no name',
    entry: { '~effect/reactivity/DehydratedAtom': true, key: 7, value: 9, dehydratedAt: 1 },
    noteKey: undefined,
    issueMentions: 'at ["key"]',
  },
  {
    damage: 'without the saved-state mark',
    noted: 'no name',
    entry: { key: 'count', value: 9, dehydratedAt: 1 },
    noteKey: undefined,
    issueMentions: 'at ["~effect/reactivity/DehydratedAtom"]',
  },
  {
    damage: 'with a save time before time began',
    noted: 'no name',
    entry: { '~effect/reactivity/DehydratedAtom': true, key: 'count', value: 9, dehydratedAt: -1 },
    noteKey: undefined,
    issueMentions: 'at ["dehydratedAt"]',
  },
  {
    damage: 'with a save time beyond any clock',
    noted: 'no name',
    entry: {
      '~effect/reactivity/DehydratedAtom': true,
      key: 'count',
      value: 9,
      dehydratedAt: Number.POSITIVE_INFINITY,
    },
    noteKey: undefined,
    issueMentions: 'at ["dehydratedAt"]',
  },
  {
    damage: 'with a save time that is not a number',
    noted: 'no name',
    entry: { '~effect/reactivity/DehydratedAtom': true, key: 'count', value: 9, dehydratedAt: Number.NaN },
    noteKey: undefined,
    issueMentions: 'at ["dehydratedAt"]',
  },
  {
    damage: 'carrying a word where the page keeps a number',
    noted: 'the saved count',
    entry: { '~effect/reactivity/DehydratedAtom': true, key: 'count', value: 'twelve', dehydratedAt: 1 },
    noteKey: 'count',
    issueMentions: 'Expected number',
  },
  {
    damage: 'carrying a number that breaks the page rule',
    noted: 'the saved count',
    entry: { '~effect/reactivity/DehydratedAtom': true, key: 'count', value: -5, dehydratedAt: 1 },
    noteKey: 'count',
    issueMentions: 'greater than',
  },
]

type ResultRow = {
  readonly arrival: string
  readonly entry: Atom.Hydration.HydrationEntry
  readonly kept: string
  readonly error: string | null
  readonly noted: ReadonlyArray<string>
}

const resultEntries: ReadonlyArray<ResultRow> = [
  {
    arrival: 'a finished value the page cannot hold',
    entry: {
      '~effect/reactivity/DehydratedAtom': true,
      key: 'result',
      value: { _tag: 'Success', value: 1, waiting: false, timestamp: 0 },
      dehydratedAt: 1,
    },
    kept: 'Initial',
    error: null,
    noted: ['result'],
  },
  {
    arrival: 'a failure that still remembers a finished value the page cannot hold',
    entry: {
      '~effect/reactivity/DehydratedAtom': true,
      key: 'result',
      value: {
        _tag: 'Failure',
        cause: [{ _tag: 'Fail', error: 'boom' }],
        previousSuccess: { _tag: 'Some', value: { _tag: 'Success', value: 7, waiting: false, timestamp: 0 } },
        waiting: false,
      },
      dehydratedAt: 1,
    },
    kept: 'Initial',
    error: null,
    noted: ['result'],
  },
  {
    arrival: 'a failure with no remembered value',
    entry: {
      '~effect/reactivity/DehydratedAtom': true,
      key: 'result',
      value: {
        _tag: 'Failure',
        cause: [{ _tag: 'Fail', error: 'boom' }],
        previousSuccess: { _tag: 'None' },
        waiting: false,
      },
      dehydratedAt: 1,
    },
    kept: 'Failure',
    error: 'boom',
    noted: [],
  },
]

Feature("Reloading a page's saved values without letting damaged entries through")
  .withLayer(Layer.empty)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A saved entry that arrives <damage> is turned away, noted under <noted>, and the page keeps its own number',
      damagedEntries,
      (row: DamagedRow) =>
        Gherkin.Do.pipe(
          Given('a page whose saved count must stay a number above zero')('ctx', () =>
            Effect.sync(() => {
              const count = Atom.make(7).pipe(
                Atom.serializable({
                  key: 'count',
                  schema: Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0))),
                }),
              )
              const page = Atom.Registry.make()
              return { page, count }
            })),
          When('the damaged entry arrives')('result', (s) =>
            Effect.sync(() => {
              Atom.Hydration.hydrate(s.ctx.page, [row.entry])
              return {
                reading: Atom.Registry.get(s.ctx.page, s.ctx.count),
                notes: Atom.Registry.refusals(s.ctx.page),
              }
            })),
          Then('the page shows its own number and exactly one note records the refusal')(
            (s, expect) =>
              expect({
                reading: s.result.reading,
                notes: s.result.notes.map((note) => ({ key: note.key, issue: note.issue })),
              }).toEqual({
                reading: 7,
                notes: [{ key: row.noteKey, issue: expect.stringContaining(row.issueMentions) }],
              }),
          ),
        ),
    )
    scenarioOutline(
      'A saved result that arrives <arrival> is turned away, noted under its key, and the page keeps its own result',
      resultEntries,
      (row: ResultRow) =>
        Gherkin.Do.pipe(
          Given('a page whose saved result keeps no finished value')('ctx', () =>
            Effect.sync(() => {
              const result = Atom.make(Atom.AsyncResult.initial<number, string>()).pipe(
                Atom.serializable({
                  key: 'result',
                  schema: Atom.AsyncResult.Schema({ error: Schema.String }),
                }),
              )
              const page = Atom.Registry.make()
              return { page, result }
            })),
          When('the saved result arrives and the page is read')('result', (s) =>
            Effect.sync(() => {
              Atom.Hydration.hydrate(s.ctx.page, [row.entry])
              const reading = Atom.Registry.get(s.ctx.page, s.ctx.result)
              return {
                kept: reading._tag,
                error: Option.match(Atom.AsyncResult.error(reading), {
                  onNone: () => null,
                  onSome: (value) => value,
                }),
                noted: Atom.Registry.refusals(s.ctx.page).map((note) => note.key),
              }
            })),
          Then('the page keeps its own result and notes only the value-less boundary')(
            (s, expect) => expect(s.result).toEqual({ kept: row.kept, error: row.error, noted: row.noted }),
          ),
        ),
    )
  })
