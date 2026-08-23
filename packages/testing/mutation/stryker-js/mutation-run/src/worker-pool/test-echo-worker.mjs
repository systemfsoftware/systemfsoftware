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
