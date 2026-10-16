import { Schema } from 'effect'

export const PropertyValue = Schema.Natural

export const identity = (value: number): number => value

export const refutedProperty = {
  name: '∀value_Identity_=EveryValueIsItsOwnIdentity',
  spec: { of: [PropertyValue], subject: identity, runs: 1, arbitrary: { seed: 1 } },
  holds: () => false,
}
