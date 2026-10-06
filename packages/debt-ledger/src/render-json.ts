import type { Ledger } from './Ledger.schema.js'

export const renderJson = (ledger: Ledger): string => `${JSON.stringify(ledger, null, 2)}\n`
