import { Verdict } from '@systemfsoftware/effect-unit-of-work/laws'
import { Context, Effect, Layer, Schema } from 'effect'
import type { SchemaError } from 'effect/Schema'
import * as esbuild from 'esbuild'
import { Miniflare } from 'miniflare'
import { fileURLToPath } from 'node:url'

const WORKER_ENTRY = fileURLToPath(new URL('./claims.worker.ts', import.meta.url))

export const ClaimOutcome = Schema.Union([
  Schema.Struct({ decision: Schema.Literals(['Granted', 'Refused']) }),
  Schema.Struct({ defect: Schema.String }),
])
export type ClaimOutcome = typeof ClaimOutcome.Type

export const Verdicts = Schema.Record(Schema.String, Verdict)
export type Verdicts = typeof Verdicts.Type

const ResetReport = Schema.Struct({ reset: Schema.Boolean })
const RowsReport = Schema.Struct({ rows: Schema.Finite })

export interface Workerd {
  readonly claim: (name: string, request: string) => Effect.Effect<ClaimOutcome, SchemaError>
  readonly reset: (name: string) => Effect.Effect<void, SchemaError>
  readonly rows: (name: string) => Effect.Effect<number, SchemaError>
  readonly verdicts: (name: string) => Effect.Effect<Verdicts, SchemaError>
}

export class WorkerdService extends Context.Service<WorkerdService, Workerd>()(
  '@systemfsoftware/effect-unit-of-work/tests/Workerd',
) {}

const urlOf = (route: string, name: string): string => `http://localhost${route}?name=${name}`

const bundleWorker = (): Effect.Effect<string> =>
  Effect.map(
    Effect.promise(() =>
      esbuild.build({
        entryPoints: [WORKER_ENTRY],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        conditions: ['@systemfsoftware/source', 'workerd', 'worker', 'browser'],
        define: { 'import.meta.vitest': 'undefined' },
        write: false,
      })
    ),
    (built) => built.outputFiles.map((file) => file.text).join(''),
  )

const startWorkerd = (contents: string): Effect.Effect<Miniflare> =>
  Effect.sync(() =>
    new Miniflare({
      workers: [
        {
          config: {
            name: 'claims',
            compatibilityDate: '2026-09-11',
            compatibilityFlags: ['nodejs_compat'],
            manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents } } },
            exports: { Claims: { type: 'durable-object', storage: 'sqlite' } },
            env: { CLAIMS: { type: 'durable-object', worker: 'claims', exportName: 'Claims' } },
          },
        },
      ],
    })
  )

export const workerdLayer: Layer.Layer<WorkerdService> = Layer.effect(
  WorkerdService,
  Effect.gen(function*() {
    const miniflare = yield* Effect.acquireRelease(
      Effect.flatMap(bundleWorker(), startWorkerd),
      (instance) => Effect.promise(() => instance.dispose()),
    )
    return {
      claim: (name, request) =>
        Effect.flatMap(
          Effect.promise(() => miniflare.dispatchFetch(urlOf('/claim', name), { method: 'POST', body: request })),
          (response) =>
            Effect.flatMap(
              Effect.promise(() => response.json()),
              (body) => Schema.decodeUnknownEffect(ClaimOutcome)(body),
            ),
        ),
      reset: (name) =>
        Effect.asVoid(
          Effect.flatMap(
            Effect.promise(() => miniflare.dispatchFetch(urlOf('/reset', name))),
            (response) =>
              Effect.flatMap(
                Effect.promise(() => response.json()),
                (body) => Schema.decodeUnknownEffect(ResetReport)(body),
              ),
          ),
        ),
      rows: (name) =>
        Effect.flatMap(
          Effect.promise(() => miniflare.dispatchFetch(urlOf('/rows', name))),
          (response) =>
            Effect.flatMap(
              Effect.promise(() => response.json()),
              (body) => Effect.map(Schema.decodeUnknownEffect(RowsReport)(body), (report) => report.rows),
            ),
        ),
      verdicts: (name) =>
        Effect.flatMap(
          Effect.promise(() => miniflare.dispatchFetch(urlOf('/laws', name))),
          (response) =>
            Effect.flatMap(
              Effect.promise(() => response.json()),
              (body) => Schema.decodeUnknownEffect(Verdicts)(body),
            ),
        ),
    }
  }),
)
