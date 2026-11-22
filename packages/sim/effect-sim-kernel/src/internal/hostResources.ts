import * as Context from 'effect/Context'

/** @internal */
export interface HostResourceWatch {
  readonly names: () => ReadonlyArray<string>
  readonly end: () => void
}

/** @internal */
export interface HostResources {
  readonly begin: () => HostResourceWatch
}

/** @internal */
export class HostResourcesService extends Context.Service<HostResourcesService, HostResources>()(
  '@systemfsoftware/effect-sim-kernel/internal/hostResources/HostResourcesService',
) {}

type Field<A = unknown> = A

interface HostProcess {
  readonly getActiveResourcesInfo: () => ReadonlyArray<string>
}

const NO_RESOURCES: ReadonlyArray<string> = []

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object' && candidate !== null

const listsActiveResources = (candidate: object): candidate is HostProcess =>
  typeof Reflect.get(candidate, 'getActiveResourcesInfo') === 'function'

const isHostProcess = (candidate: Field): candidate is HostProcess =>
  isHostObject(candidate) && listsActiveResources(candidate)

const activeResourceNames = (): ReadonlyArray<string> => {
  const host: Field = Reflect.get(globalThis, 'process')
  return isHostProcess(host) ? host.getActiveResourcesInfo() : NO_RESOURCES
}

const endNothing = (): void => undefined

/** @internal */
export const processResources: HostResources = {
  begin: () => ({ names: activeResourceNames, end: endNothing }),
}

interface HookCallbacks {
  readonly init: (asyncId: number, type: string) => void
  readonly before: (asyncId: number) => void
  readonly destroy: (asyncId: number) => void
}

interface Hook {
  readonly enable: () => void
  readonly disable: () => void
}

/** @internal */
export type CreateHook = (callbacks: HookCallbacks) => Hook

const FILE_REQUEST_KINDS: ReadonlyArray<string> = ['FSREQCALLBACK', 'FSREQPROMISE']

const LISTED_FILE_REQUEST = /^FSReq/u

const isListedFileRequest = (name: string): boolean => LISTED_FILE_REQUEST.test(name)

const listedWithoutFileRequests = (): ReadonlyArray<string> =>
  activeResourceNames().filter((name) => !isListedFileRequest(name))

const watchFileRequests = (createHook: CreateHook): HostResourceWatch => {
  const pending = new Map<number, string>()
  const settle = (asyncId: number): void => {
    pending.delete(asyncId)
  }
  const hook = createHook({
    init: (asyncId, type) => {
      if (FILE_REQUEST_KINDS.includes(type)) pending.set(asyncId, type)
    },
    before: settle,
    destroy: settle,
  })
  hook.enable()
  return {
    names: () => [...listedWithoutFileRequests(), ...pending.values()],
    end: () => {
      hook.disable()
      pending.clear()
    },
  }
}

/** @internal */
export const fileRequestHooks = (createHook: CreateHook): HostResources => ({
  begin: () => watchFileRequests(createHook),
})
