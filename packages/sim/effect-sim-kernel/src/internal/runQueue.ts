/** @internal */
export type ReleaseRun = () => void

let tail: Promise<void> = Promise.resolve()

/** @internal */
export const acquireRun = (): Promise<ReleaseRun> => {
  const previous = tail
  const turn = Promise.withResolvers<void>()
  tail = turn.promise
  return previous.then(() => turn.resolve)
}
