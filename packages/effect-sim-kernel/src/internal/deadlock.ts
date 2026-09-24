/**
 * Quiescence classification (R36). When no task is pending and no microtask can
 * wake one, the run names what it waits on — a real timer, a file, a socket, or
 * nothing (a deadlock) — and a deadlock report lists every suspended fiber with
 * the frames it is suspended in.
 */
import type { Fiber } from 'effect'

/** A value read from code this package does not own, narrowed by predicates. */
type Field<A = unknown> = A

/** The process resources that can call back into the program from outside. */
/** @internal */
export type WaitKind = 'RealTimer' | 'File' | 'Socket' | 'Other'

/** @internal */
export interface SuspendedFiber {
  readonly id: number
  readonly frames: ReadonlyArray<string>
}

// Effect numbers fibers; this alias keeps those reads nameable.
/** @internal */
export type AnyFiber<A = unknown, E = unknown> = Fiber.Fiber<A, E>

interface HostProcess {
  readonly getActiveResourcesInfo: () => ReadonlyArray<string>
}

// The innermost frames are the ones that name the wait.
const FRAME_DEPTH = 6
const NO_FRAMES: ReadonlyArray<string> = []
const NO_RESOURCES: ReadonlyArray<string> = []

const isHostObject = (candidate: Field): candidate is object => typeof candidate === 'object'
const isFrameList = (candidate: Field): candidate is ReadonlyArray<Field> => Array.isArray(candidate)
const isHostProcess = (candidate: Field): candidate is HostProcess => isHostObject(candidate)

const hostProcess = (): Field => Reflect.get(globalThis, 'process')

const resourceNames = (): ReadonlyArray<string> => {
  const host: Field = hostProcess()
  return isHostProcess(host) ? host.getActiveResourcesInfo() : NO_RESOURCES
}

const bump = (counts: Map<string, number>, resource: string): void => {
  counts.set(resource, (counts.get(resource) ?? 0) + 1)
}

/** A snapshot of the process resources alive right now, by resource kind. */
/** @internal */
export const resourceCounts = (): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const resource of resourceNames()) bump(counts, resource)
  return counts
}

const extraOf = (before: ReadonlyMap<string, number>, entry: readonly [string, number]): number =>
  entry[1] - (before.get(entry[0]) ?? 0)

const appendExtra = (
  appeared: Array<string>,
  before: ReadonlyMap<string, number>,
  entry: readonly [string, number],
): void => {
  const extra = extraOf(before, entry)
  if (extra > 0) appeared.push(`${entry[0]} x${extra}`)
}

/** Resource kinds that appeared since `before`, as `"<kind> x<count>"` entries. */
/** @internal */
export const newResources = (before: ReadonlyMap<string, number>): ReadonlyArray<string> => {
  const appeared: Array<string> = []
  for (const entry of resourceCounts()) appendExtra(appeared, before, entry)
  return appeared
}

const SOCKET = /Socket|TCP|UDP|Pipe|GetAddrInfo/u
const FILE = /FS|File/u
const TIMER = /Timeout|Immediate/u

const FAMILY_PATTERNS: ReadonlyArray<readonly [RegExp, WaitKind]> = [
  [SOCKET, 'Socket'],
  [FILE, 'File'],
  [TIMER, 'RealTimer'],
]

const matchedFamily = (resource: string): WaitKind | undefined => {
  const matched = FAMILY_PATTERNS.find(([pattern]) => pattern.test(resource))
  return matched?.[1]
}

const familyOf = (resource: string): WaitKind => matchedFamily(resource) ?? 'Other'

const isNamed = (family: WaitKind): boolean => family !== 'Other'

/**
 * What a set of newly appeared resources can wake. Files and sockets name
 * themselves first; a leftover kind is still named, through `resources`.
 */
/** @internal */
export const waitKindOf = (resources: ReadonlyArray<string>): WaitKind => {
  const named = resources.map(familyOf).find(isNamed)
  return named ?? 'Other'
}

const stringOn = (described: object, key: string): string | undefined => {
  const value: Field = Reflect.get(described, key)
  return typeof value === 'string' ? value : undefined
}

const stringFieldOf = (described: Field, key: string): string | undefined => {
  if (!isHostObject(described)) return undefined
  return stringOn(described, key)
}

const argsNameOn = (described: object): string | undefined => {
  const args: Field = Reflect.get(described, 'args')
  return typeof args === 'function' ? args.name : undefined
}

const nameOf = (described: Field): string | undefined => {
  if (!isHostObject(described)) return undefined
  return argsNameOn(described)
}

const applyToJson = (frame: object): Field => {
  const toJson: Field = Reflect.get(frame, 'toJSON')
  return typeof toJson === 'function' ? Reflect.apply(toJson, frame, []) : undefined
}

const describeFrame = (frame: Field): Field => {
  if (!isHostObject(frame)) return undefined
  return applyToJson(frame)
}

const namedOp = (op: string, described: Field): string => {
  const name = nameOf(described)
  return name === undefined ? op : `${op}(${name})`
}

const renderFrame = (frame: Field): string => {
  const described = describeFrame(frame)
  const op = stringFieldOf(described, 'op') ?? '?'
  return namedOp(op, described)
}

const renderedFrames = (stack: ReadonlyArray<Field>): ReadonlyArray<string> =>
  stack.slice(-FRAME_DEPTH).reverse().map(renderFrame)

const framesOf = (fiber: AnyFiber): ReadonlyArray<string> => {
  const stack: Field = Reflect.get(fiber, '_stack')
  return isFrameList(stack) ? renderedFrames(stack) : NO_FRAMES
}

const isUnfinished = (fiber: AnyFiber): boolean => fiber.pollUnsafe() === undefined

const collectSuspended = (suspended: Array<SuspendedFiber>, fiber: AnyFiber): void => {
  if (isUnfinished(fiber)) suspended.push({ id: fiber.id, frames: framesOf(fiber) })
}

/**
 * Every unfinished fiber the kernel ran, innermost frame first. Fibers that
 * already exited are not suspended, so they are left out.
 */
/** @internal */
export const describeSuspended = (fibers: Iterable<AnyFiber>): ReadonlyArray<SuspendedFiber> => {
  const suspended: Array<SuspendedFiber> = []
  for (const fiber of fibers) collectSuspended(suspended, fiber)
  return suspended
}
