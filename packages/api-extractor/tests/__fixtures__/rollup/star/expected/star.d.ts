declare function makePayload(): StarPayload

declare const STAR_VERSION: number;

declare const StarNs_STAR_VERSION: typeof STAR_VERSION;
declare const StarNs_makePayload: typeof makePayload;
type StarNs_StarPayload = StarPayload;

export declare namespace StarNs {
    export {
        StarNs_STAR_VERSION as STAR_VERSION,
        StarNs_makePayload as makePayload,
        StarNs_StarPayload as StarPayload
    }
}

declare interface StarPayload {
    data: string
}

export { }
