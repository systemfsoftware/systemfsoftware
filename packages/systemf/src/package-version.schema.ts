import { Schema } from 'effect'

export const PackageVersion = Schema.Struct({ version: Schema.String })
export type PackageVersion = typeof PackageVersion.Type
