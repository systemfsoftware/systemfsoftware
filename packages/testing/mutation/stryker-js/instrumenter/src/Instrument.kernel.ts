import { InstrumentDecision, InstrumentDecoded } from './Instrument.schema.js'

export const decideInstrument = (decoded: InstrumentDecoded): InstrumentDecision =>
  InstrumentDecision.make({
    files: decoded.files,
    mutants: decoded.mutants,
    asts: decoded.asts,
  })
