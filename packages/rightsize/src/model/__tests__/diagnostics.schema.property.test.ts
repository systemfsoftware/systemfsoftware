/**
 * Rejection properties for the diagnostics schemas — each level of the report
 * carries its own copies of the port obligation nodes, so `PortBinding`'s
 * refusals must be restated against `DiagnosticsContainer` and
 * `DiagnosticsReport` themselves for the generated law suite's coverage
 * test.
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'
import { DiagnosticsContainer, DiagnosticsReport } from '../diagnostics.schema.js'

const containerWith = (patch: object): object => ({
  name: 'rz-test-01',
  image: 'alpine:3.19',
  state: 'running',
  host: '127.0.0.1',
  ports: [],
  logTailLines: [],
  ...patch,
})

refutes(DiagnosticsContainer, {
  ZeroGuestPort: fc.constant(containerWith({ ports: [{ hostPort: 0, guestPort: 0 }] })),
  NegativeGuestPort: fc.constant(containerWith({ ports: [{ hostPort: 0, guestPort: -1 }] })),
  OverflowGuestPort: fc.constant(containerWith({ ports: [{ hostPort: 0, guestPort: 65_536 }] })),
  NegativeHostPort: fc.constant(containerWith({ ports: [{ hostPort: -1, guestPort: 8080 }] })),
  OverflowHostPort: fc.constant(containerWith({ ports: [{ hostPort: 65_536, guestPort: 8080 }] })),
})

refutes(DiagnosticsReport, {
  ZeroGuestPort: fc.constant({ containers: [containerWith({ ports: [{ hostPort: 0, guestPort: 0 }] })] }),
  NegativeGuestPort: fc.constant({ containers: [containerWith({ ports: [{ hostPort: 0, guestPort: -1 }] })] }),
  NegativeHostPort: fc.constant({ containers: [containerWith({ ports: [{ hostPort: -1, guestPort: 8080 }] })] }),
  OverflowHostPort: fc.constant({ containers: [containerWith({ ports: [{ hostPort: 65_536, guestPort: 8080 }] })] }),
})
