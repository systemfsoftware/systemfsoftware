/**
 * @public
 */
declare class AtomContainer {
    public readonly registry: Registry
    public constructor(registry: Registry)
}

/**
 * @public
 */
declare function createRegistry(): Registry

/**
 * @public
 */
declare const DEFAULT_REGISTRY: Registry;

/**
 * @public
 */
export declare function getActiveId(reg: Registry): string

declare const Ns_createRegistry: typeof createRegistry;
type Ns_Registry = Registry;
declare const Ns_DEFAULT_REGISTRY: typeof DEFAULT_REGISTRY;
type Ns_AtomContainer = AtomContainer;
declare const Ns_AtomContainer: typeof AtomContainer;

export declare namespace Ns {
    export {
        Ns_createRegistry as createRegistry,
        Ns_Registry as Registry,
        Ns_DEFAULT_REGISTRY as DEFAULT_REGISTRY,
        Ns_AtomContainer as AtomContainer
    }
}

/**
 * @public
 */
declare interface Registry {
    id: string
}

export { }
