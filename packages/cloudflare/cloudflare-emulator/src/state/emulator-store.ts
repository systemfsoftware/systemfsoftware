import { Context, Layer, SynchronizedRef } from 'effect'
import { emptyState } from './emulator-state.js'
import type { EmulatorState } from './emulator-state.js'

export class EmulatorStore extends Context.Service<EmulatorStore, SynchronizedRef.SynchronizedRef<EmulatorState>>()(
  '@systemfsoftware/cloudflare-emulator/EmulatorStore',
) {}

export const layer = Layer.effect(EmulatorStore, SynchronizedRef.make(emptyState))
