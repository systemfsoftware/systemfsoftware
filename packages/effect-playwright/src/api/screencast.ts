/**
 * Effect service wrapper for Playwright screencast recording and overlays.
 */

import { Context, type Effect } from 'effect'
import type { Screencast as CoreScreencast } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { useHelper } from './utils.js'

/** */
export interface Screencast {
  /**
   * Starts recording the screencast.
   *
   * @see {@link CoreScreencast.start}
   */
  readonly start: (
    options?: Parameters<CoreScreencast['start']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Stops recording the screencast.
   *
   * @see {@link CoreScreencast.stop}
   */
  readonly stop: Effect.Effect<void, PlaywrightError>

  /**
   * Shows action annotations.
   *
   * @see {@link CoreScreencast.showActions}
   */
  readonly showActions: (
    options?: Parameters<CoreScreencast['showActions']>[0],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Hides action annotations.
   *
   * @see {@link CoreScreencast.hideActions}
   */
  readonly hideActions: Effect.Effect<void, PlaywrightError>

  /**
   * Shows a chapter title.
   *
   * @see {@link CoreScreencast.showChapter}
   */
  readonly showChapter: (
    title: string,
    options?: Parameters<CoreScreencast['showChapter']>[1],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Shows a custom HTML overlay.
   *
   * @see {@link CoreScreencast.showOverlay}
   */
  readonly showOverlay: (
    html: string,
    options?: Parameters<CoreScreencast['showOverlay']>[1],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Shows all overlays.
   *
   * @see {@link CoreScreencast.showOverlays}
   */
  readonly showOverlays: Effect.Effect<void, PlaywrightError>

  /**
   * Hides all overlays.
   *
   * @see {@link CoreScreencast.hideOverlays}
   */
  readonly hideOverlays: Effect.Effect<void, PlaywrightError>
}

/** */
export const Screencast = Context.Service<Screencast>(
  'effect-playwright/screencast/Screencast',
)

/**
 * Creates a `Screencast` from a Playwright `Screencast` instance.
 *
 * @param screencast - The Playwright `Screencast` instance to wrap.
 */
export const makeScreencast = (screencast: CoreScreencast): Screencast => {
  const use = useHelper(screencast)
  return Screencast.of({
    start: (options) => use((s) => s.start(options).then(() => {})),
    stop: use((s) => s.stop()),
    showActions: (options) => use((s) => s.showActions(options).then(() => {})),
    hideActions: use((s) => s.hideActions()),
    showChapter: (title, options) => use((s) => s.showChapter(title, options)),
    showOverlay: (html, options) => use((s) => s.showOverlay(html, options).then(() => {})),
    showOverlays: use((s) => s.showOverlays()),
    hideOverlays: use((s) => s.hideOverlays()),
  })
}
