/**
 * Effect service wrapper for Playwright keyboard input.
 */

import { Context, type Effect } from 'effect'
import type { Keyboard as CoreKeyboard } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { useHelper } from './utils.js'

/** */
export interface Keyboard {
  /**
   * Dispatches a `keydown` event.
   *
   * @see {@link CoreKeyboard.down}
   */
  readonly down: (
    key: Parameters<CoreKeyboard['down']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches only `input` event, does not emit the `keydown`, `keyup` or `keypress` events.
   *
   * @see {@link CoreKeyboard.insertText}
   */
  readonly insertText: (
    text: Parameters<CoreKeyboard['insertText']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `keydown` and `keyup` event.
   *
   * @see {@link CoreKeyboard.press}
   */
  readonly press: (
    key: Parameters<CoreKeyboard['press']>[0],
    options?: Parameters<CoreKeyboard['press']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the text.
   *
   * @see {@link CoreKeyboard."type"}
   */
  readonly type: (
    text: Parameters<CoreKeyboard['type']>[0],
    options?: Parameters<CoreKeyboard['type']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches a `keyup` event.
   *
   * @see {@link CoreKeyboard.up}
   */
  readonly up: (
    key: Parameters<CoreKeyboard['up']>[0],
  ) => Effect.Effect<void, PlaywrightError>
}

/** */
export const Keyboard = Context.Service<Keyboard>(
  'effect-playwright/keyboard/Keyboard',
)

/**
 * Creates a `Keyboard` from a Playwright `Keyboard` instance.
 *
 * @param keyboard - The Playwright `Keyboard` instance to wrap.
 */
export const makeKeyboard = (keyboard: CoreKeyboard): Keyboard => {
  const use = useHelper(keyboard)

  return Keyboard.of({
    down: (key) => use((k) => k.down(key)),
    insertText: (text) => use((k) => k.insertText(text)),
    press: (key, options) => use((k) => k.press(key, options)),
    type: (text, options) => use((k) => k.type(text, options)),
    up: (key) => use((k) => k.up(key)),
  })
}
