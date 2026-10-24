import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { PlanScaffold, planScaffold, type ScaffoldPlan, type SuiteWrite } from '../plan-scaffold.workflow.js'

type Plan = typeof planScaffold

const planOf = (plan: Plan, command: PlanScaffold): ScaffoldPlan =>
  Result.match(plan(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const writesOf = (decision: ScaffoldPlan): Option.Option<ReadonlyArray<SuiteWrite>> =>
  Match.valueTags(decision, {
    ScaffoldPlanned: ({ writes }) => Option.some(writes),
    ScaffoldRefused: () => Option.none(),
    ManifestUnreadable: () => Option.none(),
  })

const conflictsOf = (decision: ScaffoldPlan): Option.Option<ReadonlyArray<string>> =>
  Match.valueTags(decision, {
    ScaffoldPlanned: () => Option.none(),
    ScaffoldRefused: ({ conflicts }) => Option.some(conflicts),
    ManifestUnreadable: () => Option.none(),
  })

const withRoot = (
  command: PlanScaffold,
  root: { readonly force: boolean; readonly manifest: Option.Option<string> },
): PlanScaffold =>
  new PlanScaffold({
    force: root.force,
    files: command.files,
    manifest: root.manifest,
    ignore: command.ignore,
    name: command.name,
    script: command.script,
    devDependencies: command.devDependencies,
    ignoredOutput: command.ignoredOutput,
  })

const writtenAt = (writes: ReadonlyArray<SuiteWrite>, path: string): Option.Option<string> =>
  Option.map(Arr.findLast(writes, (write) => write.path === path), (write) => write.content)

const presentPaths = (command: PlanScaffold): ReadonlyArray<string> =>
  command.files.filter((file) => file.present).map((file) => file.path)

const sameList = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((item, at) => item === right[at])

it.prop(
  '∀c_PlanScaffold_≡RefusalNamesExactlyTheExistingFilesWhenUnforced',
  { of: [PlanScaffold], subject: planScaffold, arbitrary: { seed: 512_001 } },
  (subject, [command]) =>
    Option.match(conflictsOf(planOf(subject, withRoot(command, { force: false, manifest: Option.none() }))), {
      onNone: () => presentPaths(command).length === 0,
      onSome: (conflicts) => sameList(conflicts, presentPaths(command)),
    }),
)

it.prop(
  '∀c_PlanScaffold_⊇EveryGeneratedFileWithItsContentWhenForced',
  { of: [PlanScaffold], subject: planScaffold, arbitrary: { seed: 512_002 } },
  (subject, [command]) =>
    Option.exists(
      writesOf(planOf(subject, withRoot(command, { force: true, manifest: Option.none() }))),
      (writes) =>
        command.files.every((file) =>
          writes.some((write) => write.path === file.path && write.content === file.content)
        ),
    ),
)

it.prop(
  '∀c,s,d_PlanScaffold_⊇EveryExistingManifestEntryAndEveryMissingDependency',
  {
    of: [PlanScaffold, Schema.Record(Schema.String, Schema.String), Schema.Record(Schema.String, Schema.String)],
    subject: planScaffold,
    arbitrary: { seed: 512_003 },
  },
  (subject, [command, scripts, drawn]) => {
    const devDependencies = { ...drawn, ...Record.map(command.devDependencies, (range) => `existing:${range}`) }
    const existing = JSON.stringify({ scripts, devDependencies })
    const decision = planOf(subject, withRoot(command, { force: true, manifest: Option.some(existing) }))
    const merged = Option.flatMap(
      Option.flatMap(writesOf(decision), (writes) => writtenAt(writes, 'package.json')),
      Schema.decodeOption(
        Schema.fromJsonString(
          Schema.Struct({
            scripts: Schema.Record(Schema.String, Schema.String),
            devDependencies: Schema.Record(Schema.String, Schema.String),
          }),
        ),
      ),
    )
    return Option.exists(
      merged,
      (manifest) =>
        Record.every(devDependencies, (range, name) => manifest.devDependencies[name] === range) &&
        Record.every(command.devDependencies, (_range, name) => Record.has(manifest.devDependencies, name)) &&
        Record.every(scripts, (script, name) => name === 'test:e2e' || manifest.scripts[name] === script) &&
        manifest.scripts['test:e2e'] === command.script,
    )
  },
)
