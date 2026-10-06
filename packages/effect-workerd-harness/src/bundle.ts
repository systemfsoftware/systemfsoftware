import { Array as Arr, Effect, Option } from 'effect'
import * as esbuild from 'esbuild'
import { WorkerBundleFailed } from './bundle.schema.js'

export interface BundledWorker {
  readonly mainModule: string
  readonly modules: Readonly<Record<string, string>>
}

const fileNameOf = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

const toBundledWorker = (
  entry: string,
  output: ReadonlyArray<esbuild.OutputFile>,
): Effect.Effect<BundledWorker, WorkerBundleFailed> => {
  const modules = output.map((file) => ({ name: fileNameOf(file.path), contents: file.text }))
  return Option.match(Arr.head(modules), {
    onNone: () => Effect.fail(new WorkerBundleFailed({ entry, cause: 'esbuild produced no output modules' })),
    onSome: (main) =>
      Effect.succeed({
        mainModule: main.name,
        modules: Object.fromEntries(modules.map((module) => [module.name, module.contents])),
      }),
  })
}

export const bundle = (entry: string): Effect.Effect<BundledWorker, WorkerBundleFailed> =>
  Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        conditions: ['@systemfsoftware/source', 'workerd', 'worker', 'browser'],
        define: { 'import.meta.vitest': 'undefined' },
        write: false,
      }),
    catch: (cause) => new WorkerBundleFailed({ entry, cause }),
  }).pipe(Effect.flatMap((result) => toBundledWorker(entry, result.outputFiles)))
