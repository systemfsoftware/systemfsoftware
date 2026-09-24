import { Atom } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Schema } from 'effect'

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
  })
