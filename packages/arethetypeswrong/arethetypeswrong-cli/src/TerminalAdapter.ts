import { Context, Effect, Layer } from 'effect'
import * as PlatformTerminal from 'effect/Terminal'

export interface TerminalWriteSink {
  readonly write: (text: string) => Effect.Effect<void, never>
}

export interface TerminalService {
  readonly stdout: TerminalWriteSink
  readonly stderr: TerminalWriteSink
  readonly isTty: boolean
  readonly env: NodeJS.ProcessEnv
  readonly exit: (code: number) => Effect.Effect<never, never>
}

export class Terminal extends Context.Service<Terminal, TerminalService>()(
  '@systemfsoftware/arethetypeswrong-cli/terminal.adapter/Terminal',
) {}

export const TerminalLive: Layer.Layer<Terminal, never, PlatformTerminal.Terminal> = Layer.effect(
  Terminal,
  Effect.gen(function*() {
    const terminal = yield* PlatformTerminal.Terminal
    return {
      isTty: process.stdout.isTTY === true,
      env: process.env,
      stdout: {
        write: (text: string) =>
          terminal.display(text).pipe(
            Effect.as(undefined),
            Effect.orElseSucceed(() => undefined),
          ),
      },
      stderr: {
        write: (text: string) =>
          Effect.sync(() => {
            process.stderr.write(text)
          }),
      },
      exit: (code: number) => Effect.sync(() => process.exit(code)),
    }
  }),
)
