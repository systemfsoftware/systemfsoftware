export const TestEchoWorker = {
  echo(n) {
    return n * 2
  },
  throws() {
    throw new Error('oops from worker')
  },
  async delayedEcho(n, delayMs) {
    const d = typeof delayMs === 'number' ? delayMs : 0
    await new Promise((r) => setTimeout(r, d))
    return n * 2
  },
}

/**
 * A prototype-shaped export, which is the trap this fixture exists to pin.
 *
 * The worker resolves a method off the named export with `Reflect.get`. When the
 * methods live on `prototype` rather than on the exported value itself,
 * `Reflect.get(subject, 'echo')` is `undefined` and there is nothing to invoke.
 * Every worker in this engine was a `class` once and silently exposed no methods
 * at all for exactly this reason; a constructor function reproduces it without
 * tripping the rule that banned those classes.
 */
export function TestEchoWorkerPrototype() {}
Object.defineProperty(TestEchoWorkerPrototype.prototype, 'echo', {
  value: (n) => n * 2,
})
