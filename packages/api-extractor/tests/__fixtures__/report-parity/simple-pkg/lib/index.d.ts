/**
 * @beta
 */
export class BetaFeature {
  run(): Promise<void>
}

export function computeValue(input: string): number

/**
 * @internal
 */
export function internalHelper(): void

export type SimpleId = string

export namespace SimpleNamespace {
  export function helper(x: number): number
}

export interface SimpleOptions {
  timeout?: number
}

export class SimpleService {
  readonly id: SimpleId
  start(): void
}
