import * as Schema from 'effect/Schema'

/** A key a config names something by: a target, an agent, a secret, a credential. */
export const ConfigName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u, {
    message: 'a config name starts with a letter and holds at most 64 letters, digits, "_" or "-"',
  }),
)

/** The name of an environment variable the suite edge reads. */
export const EnvVarName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u, {
    message: 'an environment variable name is letters, digits and "_", not starting with a digit',
  }),
)

/** A reference to a secret declared under `secrets`, by name; the value is filled at the edge. */
export const SecretRef = Schema.Struct({ secret: ConfigName })
export type SecretRef = typeof SecretRef.Type
