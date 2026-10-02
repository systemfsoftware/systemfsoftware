export * from './a'
export { valued } from './b'
export { Foo } from './barrel'
export { DocNode } from './deep'
export type External = import('@microsoft/tsdoc').DocNode

/** @public */
export type Local = typeof import('./foo').Foo

/** @public */
export type Aliased = typeof import('./barrel').Foo
