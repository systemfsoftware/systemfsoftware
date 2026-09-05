import { Context, Effect, Layer } from 'effect'
import * as PlatformTerminal from 'effect/Terminal'

export interface StdinService {
  readonly confirm: (question: string) => Effect.Effect<boolean, never>
}

export class Stdin extends Context.Service<Stdin, StdinService>()(
  '@systemfsoftware/arethetypeswrong-cli/stdin.adapter/Stdin',
) {}

const fromTerminal = (terminal: PlatformTerminal.Terminal): StdinService => ({
  confirm: (question) =>
    Effect.gen(function*() {
      yield* terminal.display(question).pipe(Effect.orElseSucceed(() => undefined))
      const answer = (yield* terminal.readLine.pipe(Effect.orElseSucceed(() => ''))).trim()
      return answer === '' || answer.toLowerCase().startsWith('y')
    }),
})

export const StdinLive: Layer.Layer<Stdin, never, PlatformTerminal.Terminal> = Layer.effect(
  Stdin,
  Effect.gen(function*() {
    const terminal = yield* PlatformTerminal.Terminal
    return fromTerminal(terminal)
  }),
)
