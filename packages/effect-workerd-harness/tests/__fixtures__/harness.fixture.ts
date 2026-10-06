import { bundle, type BundledWorker } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Schema } from 'effect'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const entryPath = (name: string): string => fileURLToPath(new URL(name, import.meta.url))

export const echoBundle: BundledWorker = await Effect.runPromise(Effect.orDie(bundle(entryPath('echo.worker.ts'))))
export const loaderBundle: BundledWorker = await Effect.runPromise(Effect.orDie(bundle(entryPath('loader.worker.ts'))))

export const LoaderReport = Schema.Struct({ message: Schema.String })
export const FacetReport = Schema.Struct({ rows: Schema.Array(Schema.String) })

const childPids = (): ReadonlyArray<number> =>
  readdirSync('/proc/self/task').flatMap((taskId) => {
    try {
      const raw = readFileSync(`/proc/self/task/${taskId}/children`, 'utf8').trim()
      return raw === '' ? [] : raw.split(' ').map((pid) => Number(pid))
    } catch {
      return []
    }
  })

export const workerdChildren = (): ReadonlyArray<number> =>
  childPids().filter((pid) => {
    try {
      return readFileSync(`/proc/${pid}/comm`, 'utf8').trim().startsWith('workerd')
    } catch {
      return false
    }
  })
