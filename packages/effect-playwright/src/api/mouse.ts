/**
 * Effect service wrapper for Playwright mouse input.
 */

import { Context, type Effect } from 'effect'
import type { Mouse as CoreMouse } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { useHelper } from './utils.js'

/** */
export interface Mouse {
  /**
   * Shortcut for mouse.move, mouse.down, mouse.up.
   *
   * @see {@link CoreMouse.click}
   */
  readonly click: (
    x: Parameters<CoreMouse['click']>[0],
    y: Parameters<CoreMouse['click']>[1],
    options?: Parameters<CoreMouse['click']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Shortcut for mouse.move, mouse.down, mouse.up, mouse.down and mouse.up.
   *
   * @see {@link CoreMouse.dblclick}
   */
  readonly dblclick: (
    x: Parameters<CoreMouse['dblclick']>[0],
    y: Parameters<CoreMouse['dblclick']>[1],
    options?: Parameters<CoreMouse['dblclick']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `mousedown` event.
   *
   * @see {@link CoreMouse.down}
   */
  readonly down: (
    options?: Parameters<CoreMouse['down']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `mousemove` event.
   *
   * @see {@link CoreMouse.move}
   */
  readonly move: (
    x: Parameters<CoreMouse['move']>[0],
    y: Parameters<CoreMouse['move']>[1],
    options?: Parameters<CoreMouse['move']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `mouseup` event.
   *
   * @see {@link CoreMouse.up}
   */
  readonly up: (
    options?: Parameters<CoreMouse['up']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `wheel` event.
   *
   * @see {@link CoreMouse.wheel}
   */
  readonly wheel: (
    deltaX: Parameters<CoreMouse['wheel']>[0],
    deltaY: Parameters<CoreMouse['wheel']>[1],
  ) => Effect.Effect<void, PlaywrightError>
}

/** */
export const Mouse = Context.Service<Mouse>('effect-playwright/mouse/Mouse')

/**
 * Creates a `Mouse` from a Playwright `Mouse` instance.
 *
 * @param mouse - The Playwright `Mouse` instance to wrap.
 */
export const makeMouse = (mouse: CoreMouse): Mouse => {
  const use = useHelper(mouse)

  return Mouse.of({
    click: (x, y, options) => use((m) => m.click(x, y, options)),
    dblclick: (x, y, options) => use((m) => m.dblclick(x, y, options)),
    down: (options) => use((m) => m.down(options)),
    move: (x, y, options) => use((m) => m.move(x, y, options)),
    up: (options) => use((m) => m.up(options)),
    wheel: (deltaX, deltaY) => use((m) => m.wheel(deltaX, deltaY)),
  })
}
