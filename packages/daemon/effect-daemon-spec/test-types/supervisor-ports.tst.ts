import { Effect, Layer, Scope } from 'effect'
import { describe, expect, it } from 'tstyche'
import { Supervisor } from '../src/mod.js'

type Task = Effect.Effect<void, never, Scope.Scope>

const TaskPort = Supervisor.Medium.MediumPort<Task, never, Scope.Scope>('TaskPort')

declare const task: Task
declare const notATask: { readonly nope: true }

const fiberTree = Supervisor.make('fiber-tree').pipe(
  Supervisor.children([Supervisor.ChildSpecs.make('worker', Supervisor.readyOnStart(Effect.never))]),
)

const portTree = Supervisor.make('port-tree').pipe(
  Supervisor.children([Supervisor.ChildSpecs.on(TaskPort)('document', task)]),
)

const mixedTree = Supervisor.make('mixed-tree').pipe(
  Supervisor.children([
    Supervisor.ChildSpecs.on(TaskPort)('document', task),
    Supervisor.ChildSpecs.make('worker', Supervisor.readyOnStart(Effect.never)),
  ]),
)

const innerPortTree = Supervisor.make('inner-port-tree').pipe(
  Supervisor.children([Supervisor.ChildSpecs.on(TaskPort)('document', task)]),
)

const nestedTree = Supervisor.make('nested-tree').pipe(
  Supervisor.children([Supervisor.ChildSpecs.make('inner', innerPortTree)]),
)

describe('the environment a supervision tree requires', () => {
  it('Should_RequireNothing_When_EveryChildRunsOnTheFiberMedium', () => {
    expect(fiberTree.layer).type.toBe<Layer.Layer<never, never, never>>()
    expect(fiberTree.scoped).type.toBe<Effect.Effect<Supervisor.RunningSupervisor, never, Scope.Scope>>()
  })

  it('Should_RequireThePort_When_AChildIsBoundThroughIt', () => {
    expect(portTree.layer).type.toBe<
      Layer.Layer<never, never, Supervisor.Medium.MediumPortShape<Task, never, Scope.Scope>>
    >()
    expect(portTree.scoped).type.toBe<
      Effect.Effect<
        Supervisor.RunningSupervisor,
        never,
        Scope.Scope | Supervisor.Medium.MediumPortShape<Task, never, Scope.Scope>
      >
    >()
  })

  it('Should_RequireOnlyThePort_When_A_PortChildSitsBesideAFiberChild', () => {
    expect(mixedTree.layer).type.toBe<
      Layer.Layer<never, never, Supervisor.Medium.MediumPortShape<Task, never, Scope.Scope>>
    >()
  })

  it('Should_RequireTheNestedTreesPorts_When_ASpecIsUsedAsAChild', () => {
    expect(nestedTree.layer).type.toBe<
      Layer.Layer<never, never, Supervisor.Medium.MediumPortShape<Task, never, Scope.Scope>>
    >()
  })
})

describe('the children a medium port accepts', () => {
  const declare = Supervisor.ChildSpecs.on(TaskPort)

  it('Should_AcceptAProgramOfThePortsType', () => {
    expect(declare).type.toBeCallableWith('document', task)
  })

  it('Should_RefuseAProgramThePortDoesNotInterpret', () => {
    expect(declare).type.not.toBeCallableWith('document', notATask)
  })
})
