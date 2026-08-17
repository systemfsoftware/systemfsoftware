/** Type surface for the plain-.mjs gate scripts (asserted by src/__tests__/parity-gates.test.ts). */
export interface MappingRow {
  readonly status: 'present' | 'superseded-by'
  readonly rs: string
  readonly note: string
}
export declare const MAPPING: Record<string, MappingRow>
/** Every `row-key: ref` pair whose backticked `src/…` span names no file on disk. */
export declare const staleMappingPathsFor: (
  mapping: Record<string, { readonly rs?: string | undefined; readonly note?: string | undefined }>,
) => readonly string[]
