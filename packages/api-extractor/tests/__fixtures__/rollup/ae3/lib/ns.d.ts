/**
 * @public
 */
export interface Registry {
  id: string
}

/**
 * @public
 */
export declare const DEFAULT_REGISTRY: Registry

/**
 * @public
 */
export declare function createRegistry(): Registry

/**
 * @public
 */
export declare class AtomContainer {
  public readonly registry: Registry
  public constructor(registry: Registry)
}
