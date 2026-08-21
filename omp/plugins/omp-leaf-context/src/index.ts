/**
 * Entry point — OMP extension factory.
 *
 * The host awaits this factory once per session (PLG3): registration must
 * complete before the returned promise settles. The extension is dynamically
 * imported so the entry's static graph stays minimal; `runSafe` carries no
 * Effect layer and is imported statically. No runtime is constructed or
 * warmed here.
 */
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import type { LeafFs } from './internal/leaf-fs.js'
import { runSafe } from './internal/runSafe.js'

export default async function leafContextExtension(pi: ExtensionAPI, fs?: LeafFs): Promise<void> {
  const { LeafContextExtension } = await import('./LeafContextExtension.js')
  LeafContextExtension(pi, runSafe, fs)
}
