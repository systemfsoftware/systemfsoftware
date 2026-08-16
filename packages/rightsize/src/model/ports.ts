/**
 * Port schemas — the shared port contract every payload that names a TCP port
 * defers to (`PortBinding`, `ForHttp.port`, …). A single refinement node shared
 * by every member keeps the port-range rule in one place: one `refutes(Port)`
 * discharges the obligation wherever the node is reached.
 *
 * Each port schema carries exactly ONE refinement check on an otherwise
 * unchecked `Number` base. Stacking the range guard onto `S.Int` would put two
 * checks on one AST node, and the law kernel weakens per node with the first
 * witness found — a node-bound weakened form that still rejects zero, which
 * makes the refusal-discrimination property undischargeable. One combined
 * guard (`isInteger` + range) keeps the semantics identical and the weakening
 * total: every refusal drawn is explained by the check that was dropped.
 *
 * `HostPort`'s lower bound is 0, not 1: the launch workflow pre-allocates host
 * ports before boot (R7), so a spec built by combinators carries
 * `hostPort: 0` as the «not yet allocated» marker; a backend only ever sees a
 * binding whose host port was replaced with a real allocation (1–65535).
 */
import { Schema as S } from 'effect'

// The base admits NaN/Infinity only so the refinement below can have a single
// check on one AST node; the guard rejects every non-finite value (isInteger &&
// range), so no non-finite value ever decodes. One check keeps the law kernel's
// weakening total — two checks on one node would make zero's refusal
// undischargeable. @effect-diagnostics-next-line schemaNumber:off
const PortBase = S.Number.pipe(
  S.annotate({ identifier: 'Port', title: 'Port', description: 'A TCP port number in 1–65535.' }),
)

/**
 * A guest port a workload listens on inside the container — a real TCP port,
 * 1–65535. `0` is refused: it means «no port» and every port-using member of
 * the domain has no use for it.
 */
export const Port = S.refine<typeof PortBase, number>(
  (value: number): value is number => Number.isInteger(value) && value >= 1 && value <= 65535,
  {
    arbitrary: {
      candidate: { make: (fc) => fc.integer({ min: 1, max: 65535 }) },
    },
  },
)(PortBase)

export type Port = S.Schema.Type<typeof Port>

// Same single-check rationale as Port: the base Number is refined, and the
// combined guard rejects NaN/Infinity along with non-port values, sothe codec
// never admits a non-finite host-port value. @effect-diagnostics-next-line schemaNumber:off
const HostPortBase = S.Number.pipe(
  S.annotate({ identifier: 'HostPort', title: 'Host Port', description: 'A host TCP port, 0 while unallocated.' }),
)

/**
 * A host-side port binding — 0 marks «not yet allocated by the launch
 * workflow's free-port allocator»; 1–65535 is a real, already-chosen host
 * port (R7: backends bind what they are given, they never allocate).
 */
export const HostPort = S.refine<typeof HostPortBase, number>(
  (value: number): value is number => Number.isInteger(value) && value >= 0 && value <= 65535,
  {
    arbitrary: {
      candidate: { make: (fc) => fc.integer({ min: 0, max: 65535 }) },
    },
  },
)(HostPortBase)

export type HostPort = S.Schema.Type<typeof HostPort>

/**
 * A published container port: a host port already chosen (or still `0` while
 * unallocated), mapped to the port the workload listens on inside the guest.
 * Mirrors upstream `PortBinding` exactly (model.ts at the fork point).
 */
export const PortBinding = S.Struct({
  hostPort: HostPort,
  guestPort: Port,
}).pipe(
  S.annotate({
    identifier: 'PortBinding',
    title: 'PortBinding',
    description: 'A host port bound to a guest port inside the container.',
  }),
)

export type PortBinding = S.Schema.Type<typeof PortBinding>
