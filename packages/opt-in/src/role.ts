import type { Role } from './OptIn.schema.js'

export const roleAppliesTo = (role: Role) => (grantRole: Role | undefined): boolean =>
  grantRole === undefined || grantRole === role
