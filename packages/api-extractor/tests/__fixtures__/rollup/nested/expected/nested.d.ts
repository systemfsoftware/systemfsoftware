type Inner_LeafItem = LeafItem;
declare const Inner_LEAF_DEFAULT: typeof LEAF_DEFAULT;

export declare namespace Inner {
    export {
        Inner_LeafItem as LeafItem,
        Inner_LEAF_DEFAULT as LEAF_DEFAULT
    }
}

declare const LEAF_DEFAULT: LeafItem;

declare interface LeafItem {
    value: number
}

import Root_Inner = Inner;
declare const Root_ROOT_NAME: typeof ROOT_NAME;

export declare namespace Root {
    export {
        Root_Inner as Inner,
        Root_ROOT_NAME as ROOT_NAME
    }
}

declare const ROOT_NAME: string;

export { }
