/**
 * @beta
 */
export declare class BetaFeature {
  run(): Promise<void>;
}

/**
 * @public
 */
export declare function computeValue(input: string): number;

/**
 * @internal
 */
export declare function internalHelper(): void;

/**
 * @public
 */
export type SimpleId = string;

/**
 * @public
 */
export declare namespace SimpleNamespace {
  export function helper(x: number): number;
}

/**
 * @public
 */
export interface SimpleOptions {
  timeout?: number;
}

/**
 * @public
 */
export declare class SimpleService {
  readonly id: SimpleId;
  start(): void;
}
