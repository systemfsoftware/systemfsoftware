import { Effect } from 'effect'

export interface Disk {
  readonly read: (key: string) => Effect.Effect<string | undefined>
  readonly write: (key: string, value: string) => Effect.Effect<void>
  readonly remove: (key: string) => Effect.Effect<void>
  readonly list: (prefix: string) => Effect.Effect<ReadonlyArray<string>>
}

export interface DiskState {
  readonly data: Map<string, string>
}

export const freshDisk = (): DiskState => ({ data: new Map() })

const io = <A>(apply: () => A): Effect.Effect<A> =>
  Effect.flatMap(Effect.sync(apply), (answered) => Effect.as(Effect.sleep('1 millis'), answered))

export const diskOver = (state: DiskState): Disk => ({
  read: (key) => io(() => state.data.get(key)),
  write: (key, value) => Effect.asVoid(io(() => state.data.set(key, value))),
  remove: (key) => Effect.asVoid(io(() => state.data.delete(key))),
  list: (prefix) => io(() => [...state.data.keys()].filter((key) => key.startsWith(prefix))),
})
