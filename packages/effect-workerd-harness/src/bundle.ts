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

export interface BundleOptions {
  readonly entry: string
  readonly alias?: Readonly<Record<string, string>> | undefined
}

const esbuildOptionsOf = (options: BundleOptions): esbuild.BuildOptions & { readonly write: false } => ({
  entryPoints: [options.entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:*'],
  conditions: ['@systemfsoftware/source', 'workerd', 'worker', 'browser'],
  define: { 'import.meta.vitest': 'undefined' },
  ...(options.alias === undefined ? {} : { alias: { ...options.alias } }),
  write: false,
})

export const bundleWith = (options: BundleOptions): Effect.Effect<BundledWorker, WorkerBundleFailed> =>
  Effect.tryPromise({
    try: () => esbuild.build(esbuildOptionsOf(options)),
    catch: (cause) => new WorkerBundleFailed({ entry: options.entry, cause }),
  }).pipe(Effect.flatMap((result) => toBundledWorker(options.entry, result.outputFiles)))

export const bundle = (entry: string): Effect.Effect<BundledWorker, WorkerBundleFailed> => bundleWith({ entry })
