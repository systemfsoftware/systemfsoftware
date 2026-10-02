export { Foo } from './foo'

/** @public */
export type V = typeof import('./foo').someVar
