import * as tsdoc from '@microsoft/tsdoc'
import type { DocNode } from '@microsoft/tsdoc'
import { TSDocConfiguration } from '@microsoft/tsdoc'
import { MissingApi } from 'no-such-pkg'

export * from '@microsoft/tsdoc'
export { tsdoc as TsdocNamespace }
export { TSDocConfiguration as Configuration } from '@microsoft/tsdoc'
export declare const node: DocNode
export declare const missing: MissingApi