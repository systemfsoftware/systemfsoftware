/**
 * Entry point — OMP extension factory.
 *
 * The host awaits this factory once per session (PLG3): registration must
 * complete before the returned promise settles. The handler cell is
 * dynamically imported so the entry's static graph stays minimal (the
 * sibling's eager-entry budget); `runSafe` carries no Effect layer and is
 * imported statically. No runtime is constructed or warmed here.
 */
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { runSafe } from './run-safe.js'

export default async function leafContextExtension(pi: ExtensionAPI): Promise<void> {
  const { LeafContextExtension } = await import('./leaf-context.handler.js')
  LeafContextExtension(pi, runSafe)
}
