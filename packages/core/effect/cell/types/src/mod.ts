import * as CellImpl from './Cell.js'
import * as PolicyImpl from './Policy.js'
import * as WireImpl from './Wire.js'
import * as WorkflowImpl from './Workflow.js'
/** @public */
export namespace Cell {
  export type Phases = CellImpl.Phases
  export type ReadPhase<P extends Phases> = CellImpl.ReadPhase<P>
  export type DecodePhase<P extends Phases> = CellImpl.DecodePhase<P>
  export type DecidePhase<P extends Phases> = CellImpl.DecidePhase<P>
  export type EncodePhase<P extends Phases> = CellImpl.EncodePhase<P>
  export type WritePhase<P extends Phases> = CellImpl.WritePhase<P>
  export type Convention = CellImpl.Convention
  export type ReadNode<P extends Phases> = CellImpl.ReadNode<P>
  export type DecodeNode<P extends Phases> = CellImpl.DecodeNode<P>
  export type DecideNode<P extends Phases> = CellImpl.DecideNode<P>
  export type EncodeNode<P extends Phases> = CellImpl.EncodeNode<P>
  export type WriteNode<P extends Phases> = CellImpl.WriteNode<P>
  export type Phase<P extends Phases> = CellImpl.Phase<P>
  export type Layer<P extends Phases> = CellImpl.Layer<P>
  export type IoCellClassification = CellImpl.IoCellClassification
  export type Description<P extends Phases> = CellImpl.Description<P>
  export type ReadDone<P extends Phases> = CellImpl.ReadDone<P>
  export type DecodeDone<P extends Phases> = CellImpl.DecodeDone<P>
  export type DecideDone<P extends Phases> = CellImpl.DecideDone<P>
  export type EncodeDone<P extends Phases> = CellImpl.EncodeDone<P>
  export type WriteDone<P extends Phases> = CellImpl.WriteDone<P>
  export type PhaseFact = CellImpl.PhaseFact
  export type Vocabulary = CellImpl.Vocabulary
  export const DESCRIPTION_MODULE: typeof CellImpl.DESCRIPTION_MODULE = CellImpl.DESCRIPTION_MODULE
  export const IO_CELLS: typeof CellImpl.IO_CELLS = CellImpl.IO_CELLS
  export const read: typeof CellImpl.read = CellImpl.read
  export const decode: typeof CellImpl.decode = CellImpl.decode
  export const decide: typeof CellImpl.decide = CellImpl.decide
  export const encode: typeof CellImpl.encode = CellImpl.encode
  export const write: typeof CellImpl.write = CellImpl.write
  export const apply: typeof CellImpl.apply = CellImpl.apply
  export const canonical: typeof CellImpl.canonical = CellImpl.canonical
  export const vocabulary: typeof CellImpl.vocabulary = CellImpl.vocabulary
}
/** @public */
export namespace Policy {
  export type Policy<A, E, R> = PolicyImpl.Policy<A, E, R>
}
/** @public */
export namespace Wire {
  export type Mark = WireImpl.Mark
  export type Minted<A, I = A> = WireImpl.Minted<A, I>
  export type AnyMinted = WireImpl.AnyMinted
  export type MintedField = WireImpl.MintedField
  export type Fields = WireImpl.Fields
  export const mint: typeof WireImpl.mint = WireImpl.mint
  export const wire: typeof WireImpl.wire = WireImpl.wire
}
/** @public */
export namespace Workflow {
  export type WorkflowBrand = WorkflowImpl.WorkflowBrand
  export type UninhabitedDecision = WorkflowImpl.UninhabitedDecision
  export type UninhabitedError = WorkflowImpl.UninhabitedError
  export type UntaggedError = WorkflowImpl.UntaggedError
  export type Workflow<Command, Decision, DecisionError> = WorkflowImpl.Workflow<Command, Decision, DecisionError>
  export type Inhabited<Decision, DecisionError> = WorkflowImpl.Inhabited<Decision, DecisionError>
  export const make: typeof WorkflowImpl.make = WorkflowImpl.make
}
