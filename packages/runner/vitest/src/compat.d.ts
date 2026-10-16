/**
 * Ambient-only: a `declare module` inside a module is an augmentation, and an augmentation cannot
 * introduce a module TypeScript has never seen (`effect/TestClock` is not an effect v4 export), so this
 * file emits no import/export. `src/mod.ts` references it, and the build copies it beside the bundled
 * declarations so the bundled entry references it too.
 */
declare module 'effect/TestClock' {
  import type * as Duration from 'effect/Duration'
  import type * as Effect from 'effect/Effect'
  export const adjust: (duration: Duration.Input) => Effect.Effect<void>
}
