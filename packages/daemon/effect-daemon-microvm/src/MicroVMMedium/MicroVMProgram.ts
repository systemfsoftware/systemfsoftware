import type { Stream } from 'effect'
import type { MicroVMWorkload } from './MicroVMProgram.schema.js'

export interface MicroVMProgram {
  readonly workload: MicroVMWorkload
  readonly stdin?: Stream.Stream<Uint8Array>
}
