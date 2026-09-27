/**
 * Control symbols an `AtomResultFn` write accepts beside function arguments.
 *
 * They live outside the atom blueprint because that module exports its own
 * `TypeId` symbol and declares no other symbol.
 *
 * @since 4.0.0
 */
export const Reset = Symbol.for('effect/reactivity/atom/Atom/Reset')

export type Reset = typeof Reset

export const Interrupt = Symbol.for('effect/reactivity/atom/Atom/Interrupt')

export type Interrupt = typeof Interrupt
