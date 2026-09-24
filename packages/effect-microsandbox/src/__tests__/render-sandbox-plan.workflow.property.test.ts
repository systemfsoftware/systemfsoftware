import { it } from '@effect/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import { GuestPort, JobSpec, MicroVMSpec, ServiceSpec } from '../MicroVMSpec.schema.js'
import { PortBinding, SandboxPlan } from '../render-sandbox-plan.schema.js'
import {
  PlanRefused,
  PlanSandbox,
  renderSandboxPlan,
  type SandboxPlanDecision,
} from '../render-sandbox-plan.workflow.js'

type Render = typeof renderSandboxPlan

const holds = (clauses: ReadonlyArray<boolean>): boolean => clauses.every((clause) => clause)

const isLoopbackHost = (host: string): boolean => [host === '127.0.0.1', host.startsWith('127.')].some(Boolean)

const decisionOf = (render: Render, command: PlanSandbox): SandboxPlanDecision => Result.getOrThrow(render(command))

const approvedOf = (render: Render, command: PlanSandbox): Option.Option<SandboxPlan> =>
  Match.value(decisionOf(render, command)).pipe(
    Match.tag('PlanApproved', ({ plan }) => Option.some(plan)),
    Match.tag('PlanRefused', () => Option.none<SandboxPlan>()),
    Match.exhaustive,
  )

const refusedOf = (render: Render, command: PlanSandbox): Option.Option<PlanRefused> =>
  Match.value(decisionOf(render, command)).pipe(
    Match.tag('PlanApproved', () => Option.none<PlanRefused>()),
    Match.tag('PlanRefused', (refused) => Option.some(refused)),
    Match.exhaustive,
  )

const planLaw = (render: Render, command: PlanSandbox, law: (plan: SandboxPlan) => boolean): boolean =>
  Option.match(approvedOf(render, command), { onNone: () => false, onSome: law })

const refusalLaw = (render: Render, command: PlanSandbox, law: (refused: PlanRefused) => boolean): boolean =>
  Option.match(refusedOf(render, command), { onNone: () => false, onSome: law })

const octet = Arbitrary.schema(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))))
const guestPortArb = Arbitrary.schema(GuestPort)
const loopbackHost = Arbitrary.map(Arbitrary.all([octet, octet, octet]), ([a, b, c]) => `127.${a}.${b}.${c}`)

const outsideOctet = Arbitrary.map(octet, (value) => (value === 127 ? 126 : value))
const outsideHost = Arbitrary.map(
  Arbitrary.all([outsideOctet, octet, octet, octet]),
  ([a, b, c, d]) => `${a}.${b}.${c}.${d}`,
)

const loopbackBinding = Arbitrary.map(
  Arbitrary.all([guestPortArb, loopbackHost, guestPortArb]),
  ([guest, host, hostPort]): PortBinding => ({ guest, host, hostPort }),
)
const outsideBinding = Arbitrary.map(
  Arbitrary.all([guestPortArb, outsideHost, guestPortArb]),
  ([guest, host, hostPort]): PortBinding => ({ guest, host, hostPort }),
)
const loopbackBindings = Arbitrary.array(loopbackBinding, { maxLength: 4 })

const successCase = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(MicroVMSpec),
    loopbackBindings,
    Arbitrary.schema(Schema.Int),
    Arbitrary.schema(Schema.String),
  ]),
  ([spec, bindings, pid, suffix]): PlanSandbox => new PlanSandbox({ spec, bindings, name: `sandbox-${pid}-${suffix}` }),
)

const refusalCase = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(MicroVMSpec),
    loopbackBindings,
    outsideBinding,
    Arbitrary.schema(Schema.Int),
    Arbitrary.schema(Schema.String),
  ]),
  ([spec, loopbacks, outside, pid, suffix]): Readonly<{ command: PlanSandbox; offender: PortBinding }> => ({
    command: new PlanSandbox({ spec, bindings: [...loopbacks, outside], name: `sandbox-${pid}-${suffix}` }),
    offender: outside,
  }),
)

const cmdEchoes = (plan: SandboxPlan, cmd: ReadonlyArray<string> | undefined): boolean =>
  Option.match(Option.fromNullishOr(cmd), {
    onNone: () => plan.cmd === undefined,
    onSome: (someCmd) =>
      Option.match(Option.fromNullishOr(plan.cmd), {
        onNone: () => false,
        onSome: (planCmd) => holds([planCmd.length === someCmd.length, planCmd.every((arg, i) => arg === someCmd[i])]),
      }),
  })

it.prop(
  '∀outside_Render_=Refused',
  { of: [refusalCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [{ command, offender }]) =>
    refusalLaw(subject, command, (refused) =>
      holds([
        refused.sandboxName === command.name,
        refused.host === offender.host,
        refused.guestPort === offender.guest,
      ])),
)

it.prop(
  '∀loopback_Render_=Approved',
  { of: [successCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) => {
      const allLoopback = plan.portBindings.every((b) => isLoopbackHost(b.host))
      const roleCorrect = Match.value(command.spec).pipe(
        Match.tag('Service', () =>
          holds([
            plan.portBindings.length === command.bindings.length,
            plan.cmd === undefined,
            plan.workdir === undefined,
          ])),
        Match.tag('Job', (job) =>
          holds([
            plan.portBindings.length === 0,
            cmdEchoes(plan, job.cmd),
            plan.workdir === job.workdir,
          ])),
        Match.exhaustive,
      )
      return holds([allLoopback, roleCorrect])
    }),
)

it.prop(
  '∀plan_Configuration_=Conserved',
  { of: [successCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) => {
      const envKeys = Object.keys(command.spec.env)
      return holds([
        plan.name === command.name,
        plan.image === command.spec.image,
        plan.cpus === command.spec.vCPUs,
        plan.memoryMiB === command.spec.memoryMb,
        plan.mounts.length === command.spec.mounts.length,
        envKeys.length === Object.keys(plan.envs).length,
        envKeys.every((k) => plan.envs[k] === command.spec.env[k]),
      ])
    }),
)

const jobFields = (
  job: JobSpec,
  overrides: { readonly hostAccess: boolean | undefined; readonly workdir: string | undefined },
): JobSpec =>
  new JobSpec({
    image: job.image,
    env: job.env,
    mounts: job.mounts,
    memoryMb: job.memoryMb,
    vCPUs: job.vCPUs,
    cmd: job.cmd,
    workdir: overrides.workdir,
    hostAccess: overrides.hostAccess,
  })

const jobCase = (hostAccess: boolean | undefined, workdir: Arbitrary.Arbitrary<string | undefined>) =>
  Arbitrary.map(
    Arbitrary.all([
      Arbitrary.schema(JobSpec),
      workdir,
      Arbitrary.schema(Schema.Int),
      Arbitrary.schema(Schema.String),
    ]),
    ([job, workdir, pid, suffix]): PlanSandbox =>
      new PlanSandbox({
        spec: jobFields(job, { hostAccess, workdir }),
        bindings: [],
        name: `sandbox-${pid}-${suffix}`,
      }),
  )

const absentWorkdir: Arbitrary.Arbitrary<string | undefined> = Arbitrary.schema(Schema.Undefined)
const anyWorkdir: Arbitrary.Arbitrary<string | undefined> = Arbitrary.schema(Schema.String)

const noOptInCase = jobCase(undefined, absentWorkdir)
const hostAccessTrueCase = jobCase(true, anyWorkdir)
const hostAccessFalseCase = jobCase(false, anyWorkdir)
const workdirCase = jobCase(undefined, anyWorkdir)

const serviceCase = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.schema(ServiceSpec),
    loopbackBindings,
    Arbitrary.schema(Schema.Int),
    Arbitrary.schema(Schema.String),
  ]),
  ([service, bindings, pid, suffix]): PlanSandbox =>
    new PlanSandbox({ spec: service, bindings, name: `sandbox-${pid}-${suffix}` }),
)

const preChangeServiceArm = (
  name: string,
  service: ServiceSpec,
  bindings: ReadonlyArray<PortBinding>,
): SandboxPlan => ({
  name,
  image: service.image,
  envs: { ...service.env },
  cpus: service.vCPUs,
  memoryMiB: service.memoryMb,
  workdir: undefined,
  cmd: undefined,
  mounts: service.mounts.map((mount) => ({ guest: mount.guest, host: mount.host })),
  portBindings: bindings.map((binding) => ({ ...binding })),
})

it.prop(
  '∀noOptIn_Render_=NoProfiles',
  { of: [noOptInCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) => holds([plan.networkProfiles === undefined, plan.workdir === undefined])),
)

it.prop(
  '∀hostAccessTrue_Render_=HostAndPublicProfiles',
  { of: [hostAccessTrueCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) =>
      Option.match(Option.fromNullishOr(plan.networkProfiles), {
        onNone: () => false,
        onSome: (profiles) => holds([profiles.includes('public'), profiles.includes('host')]),
      })),
)

it.prop(
  '∀hostAccessFalse_Render_=NoProfiles',
  { of: [hostAccessFalseCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) => planLaw(subject, command, (plan) => plan.networkProfiles === undefined),
)

it.prop(
  '∀workdir_Render_=Workdir',
  { of: [workdirCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) =>
      Match.value(command.spec).pipe(
        Match.tag('Job', (job) => plan.workdir === job.workdir),
        Match.tag('Service', () => false),
        Match.exhaustive,
      )),
)

it.prop(
  '∀serviceSpec_Render_=PreChangeServiceArm',
  { of: [serviceCase], subject: renderSandboxPlan, runs: 100 },
  (subject, [command]) =>
    planLaw(subject, command, (plan) =>
      Match.value(command.spec).pipe(
        Match.tag('Service', (service) =>
          holds([
            Schema.toEquivalence(SandboxPlan)(plan, preChangeServiceArm(command.name, service, command.bindings)),
            !('networkProfiles' in plan),
          ])),
        Match.tag('Job', () => false),
        Match.exhaustive,
      )),
)
