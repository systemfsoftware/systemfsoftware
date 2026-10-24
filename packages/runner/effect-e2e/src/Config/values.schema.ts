import * as Schema from 'effect/Schema'

import type { SecretRef } from './names.schema.js'

/** A param value that changes every run: the replay cache keys its slot, never its value (design §9.2). */
export const Unique = Schema.TaggedStruct('Unique', { value: Schema.String })
export type Unique = typeof Unique.Type

/** Marks a param value as a fresh-per-run slot. */
export const unique = (value: string): Unique => Unique.make({ value })

/** Handles to the secrets declared under `secrets`; the runner fills each value at the edge. */
export interface SecretHandles {
  readonly get: (name: string) => SecretRef
}

export const secrets: SecretHandles = { get: (name) => ({ secret: name }) }

/** A handle to a credential's password, by credential name; the value never enters the config. */
export interface CredentialPasswordRef {
  readonly credential: string
}

/** The handles of one credential declared under `credentials`. */
export interface CredentialUser {
  readonly name: string
  readonly password: CredentialPasswordRef
}

/** Handles to the credentials declared under `credentials`. */
export interface CredentialHandles {
  readonly user: (name: string) => CredentialUser
}

export const credentials: CredentialHandles = { user: (name) => ({ name, password: { credential: name } }) }
