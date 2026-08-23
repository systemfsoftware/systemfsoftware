import type { NodePath as BabelNodePath, types } from '@babel/core'

import type { Ignorer } from '@systemfsoftware/stryker-js-plugin-api/ignore'

declare module '@systemfsoftware/stryker-js-plugin-api/ignore' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NodePath extends BabelNodePath {}
}

/**
 * Responsible for keeping track of the active ignore message and node using the configured ignore-plugins.
 */
export class IgnorerBookkeeper {
  private readonly ignorers
  private activeIgnored?: { node: types.Node; message: string } | undefined

  public get currentIgnoreMessage(): string | undefined {
    return this.activeIgnored?.message
  }

  constructor(ignorers: Ignorer[]) {
    this.ignorers = ignorers
  }

  public enterNode(path: BabelNodePath): void {
    if (!this.activeIgnored) {
      this.ignorers.forEach((ignorer) => {
        const message = ignorer.shouldIgnore(path)
        if (message) {
          this.activeIgnored = { node: path.node, message }
        }
      })
    }
  }

  public leaveNode(path: BabelNodePath): void {
    if (this.activeIgnored?.node === path.node) {
      this.activeIgnored = undefined
    }
  }
}
