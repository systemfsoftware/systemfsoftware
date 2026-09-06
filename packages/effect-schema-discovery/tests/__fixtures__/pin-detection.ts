/**
 * Inhabitance-pin fixture: read by `pin-inhabitance.mjs` through the public
 * entry. Shapes are detection-syntax only and deliberately import-free.
 */
export interface PinSchemaState {
  readonly tag: string
}

export const pinFirst: PinSchemaState = { tag: 'a' }

export const pinSecond: PinSchemaState | undefined = undefined

export const pinPlain = 42
