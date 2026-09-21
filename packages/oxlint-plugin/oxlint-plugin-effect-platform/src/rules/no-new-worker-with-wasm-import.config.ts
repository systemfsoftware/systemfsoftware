import { Effect, Schema as S } from 'effect'

export const Options = S.Struct({
  wasmImportPatterns: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed(
      [/^(@[^/]+\/)?[^/]+-wasm(\/.*)?$/].map((re) => re.source),
    )),
  ),
  expected: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed('Bun.spawn subprocess pool')),
  ),
  fix: S.String.pipe(
    S.withDecodingDefaultType(Effect.succeed(
      'Run each worker in its own OS process (not in a thread of the parent) so each one has its own WASM heap and concurrent init cannot race. A subprocess-per-worker pool with a per-child crash handler (re-dispatch the in-flight work and spawn a replacement) is the standard shape.',
    )),
  ),
})

export const WORKER_NAME = 'Worker' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'When a file imports a WASM module (e.g. `*-wasm`), ban new Worker(filePath). Use Bun.spawn for process isolation — WASM global state races on concurrent init across threads of the same OS process and segfaults bun.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    forbiddenNewWorkerWithWasm:
      '{{actual}} is forbidden when a WASM module is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
