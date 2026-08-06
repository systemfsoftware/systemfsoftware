import { Context, Effect, Layer } from 'effect'
import { text } from 'node:stream/consumers'

export interface PromptStdioService {
  readonly readSubmission: Effect.Effect<string>
  readonly emit: (notice: string) => Effect.Effect<void>
}

export class PromptStdio extends Context.Tag(
  '@systemfsoftware/claude-correction-plugin/process-stdio.adapter/PromptStdio',
)<PromptStdio, PromptStdioService>() {}

export const ProcessStdio: Layer.Layer<PromptStdio> = Layer.succeed(
  PromptStdio,
  PromptStdio.of({
    readSubmission: Effect.orElseSucceed(Effect.tryPromise(() => text(process.stdin)), () => ''),
    emit: (notice) =>
      Effect.sync(() => {
        process.stdout.write(notice)
      }),
  }),
)
