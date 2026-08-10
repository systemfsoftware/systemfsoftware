import { refutes } from '@systemfsoftware/effect-schema-law'
import { Arbitrary, Schema } from 'effect'
import { MAX_CHILDREN_CEILING } from '../daemon-spec/brands.kernel.js'
import { MaxChildren } from '../daemon-spec/daemon-policy.schema.js'

const CapOutsideSpan = Schema.Int.pipe(
  Schema.filter((children) => children < 1 || children > MAX_CHILDREN_CEILING),
)

const FractionalCap = Schema.Number.pipe(
  Schema.between(1, MAX_CHILDREN_CEILING),
  Schema.filter((children) => !Number.isInteger(children)),
)

refutes(MaxChildren, {
  CapOutsideSpan: Arbitrary.make(CapOutsideSpan),
  FractionalCap: Arbitrary.make(FractionalCap),
})
