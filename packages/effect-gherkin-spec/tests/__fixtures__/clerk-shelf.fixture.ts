import { Context, Effect, Layer, Ref } from 'effect'

export interface SavedBasket {
  readonly owner: string
}

export interface ClerkShelf {
  readonly place: (basket: SavedBasket) => Effect.Effect<void>
  readonly reopen: Effect.Effect<SavedBasket>
}

export class Shelf extends Context.Service<Shelf, ClerkShelf>()(
  '@systemfsoftware/effect-gherkin-spec/tests/kernel/Shelf',
) {}

export const shelfLayer: Layer.Layer<Shelf> = Layer.effect(
  Shelf,
  Effect.map(Ref.make<ReadonlyArray<SavedBasket>>([]), (saved) => ({
    place: (basket: SavedBasket) => Ref.update(saved, (shelved) => [...shelved, basket]),
    reopen: Effect.flatMap(Ref.get(saved), (shelved) => {
      const top = shelved[shelved.length - 1]
      if (top === undefined) return Effect.die(new Error('the shelf is empty'))
      return Effect.succeed(top)
    }),
  })),
)
