/**
 * The terminating signal, observed once at the process edge.
 *
 * Two readers need this one fact and they read it at different times. The run
 * needs it while it is still running, to put the classed code in the terminal
 * event it emits on the way out; the teardown needs it after the run's fiber
 * is gone, to hand the shell the status a signal leaves behind. The second
 * reader is why the observation cannot live inside the run: a signal
 * interrupts the run's fiber, and an interrupted fiber's exit is a failure no
 * matter what its finalizer computed, so a code resolved in there reaches the
 * terminal event and never the process. Reported `130` while exiting `1`.
 *
 * One observer, two readers, and the readers agree by construction rather
 * than by two handlers happening to decode the same signal the same way.
 */
export type SignalObserver = () => number | null

const SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = Object.freeze({
  SIGINT: 2,
  SIGTERM: 15,
})

/**
 * Installs the listeners and returns the reader.
 *
 * The listener records and returns: interrupting the run is the runtime's job,
 * and doing it from here would race the run's own finalizer for the stream.
 * `once` per signal, because a second delivery of the same signal cannot
 * change the answer.
 */
export function observeTerminatingSignal(): SignalObserver {
  let observed: number | null = null
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      observed = SIGNAL_NUMBERS[signal] ?? null
    })
  }
  return () => observed
}
