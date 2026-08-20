import { type Disposable } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { injectionTokens } from './plugins/index.js'

export type ExitHandler = () => void

/**
 * Runs registered cleanup handlers when the process exits. Signal handling
 * was deliberately removed: SIGINT/SIGTERM are owned by the runMain bootstrap
 * (fiber interruption + `128 + n` at teardown), and a synchronous
 * `process.exit` in a signal handler raced the runtime and killed finalizers.
 * The `exit` event still fires for both `process.exit` and a drained loop.
 */
export class UnexpectedExitHandler implements Disposable {
  private readonly unexpectedExitHandlers: ExitHandler[] = []

  public static readonly inject = [injectionTokens.process] as const
  constructor(
    private readonly process: Pick<NodeJS.Process, 'off' | 'on'>,
  ) {
    process.on('exit', this.handleExit)
  }

  private readonly handleExit = () => {
    this.unexpectedExitHandlers.forEach((handler) => handler())
  }

  public registerHandler(handler: ExitHandler): void {
    this.unexpectedExitHandlers.push(handler)
  }

  public dispose(): void {
    this.process.off('exit', this.handleExit)
  }
}
