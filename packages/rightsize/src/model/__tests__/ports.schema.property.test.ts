/**
 * Rejection properties for the port refinements — `Port` (guest ports:
 * 1–65535) and `HostPort` (host ports: 0–65535, 0 = the «not yet allocated»
 * marker the combinators write). Generators are derived from the domain
 * contract, not from the refinement predicate's own literals: the refusal
 * class is the TCP range's complement — zero (guest side), negatives, the
 * 16-bit overflow, fractions.
 *
 * These `refutes` calls also discharge the shared port-refinement
 * obligation nodes for every schema that embeds them (PortBinding,
 * ContainerSpec, ForHttp, …), keeping the generated law suite's obligation
 * test green.
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'
import { HostPort, Port, PortBinding } from '../ports.schema.js'

/** A guest port is a real TCP port — 0 means «no port» and no member of the domain uses one. */
refutes(Port, {
  ZeroPort: fc.constant(0),
  NegativePort: fc.integer({ min: -1_000, max: -1 }),
  OverflowPort: fc.integer({ min: 65_536, max: 70_000 }),
  FractionalPort: fc.double({ min: 1, max: 65_535 }).filter((n) => !Number.isInteger(n)),
})

/** Host ports allow 0 — the unallocated marker — so zero is NOT a refusal here. */
refutes(HostPort, {
  NegativePort: fc.integer({ min: -1_000, max: -1 }),
  OverflowPort: fc.integer({ min: 65_536, max: 70_000 }),
  FractionalPort: fc.double({ min: 1, max: 65_535 }).filter((v) => !Number.isInteger(v)),
})

/**
 * `PortBinding` carries its own copies of the port obligation nodes, so the
 * refusal must be stated against the binding itself for the generated law
 * suite's coverage test.
 */
refutes(PortBinding, {
  ZeroGuestPort: fc.constant({ hostPort: 0, guestPort: 0 }),
  NegativeGuestPort: fc.constant({ hostPort: 0, guestPort: -1 }),
  OverflowGuestPort: fc.constant({ hostPort: 0, guestPort: 65_536 }),
  FractionalGuestPort: fc.constant({ hostPort: 0, guestPort: 1.5 }),
  NegativeHostPort: fc.constant({ hostPort: -1, guestPort: 8080 }),
  OverflowHostPort: fc.constant({ hostPort: 65_536, guestPort: 8080 }),
})
