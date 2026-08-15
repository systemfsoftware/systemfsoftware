/**
 * `src/survivors.workflow.ts`, as a declaration.
 *
 * The decision is whether a mutation run's surviving mutants are admissible, and the whole of it is
 * computed by `admissionVerdict` in the kernel beside it — this cell only names which verdict becomes
 * which outcome. That is the shape the workflow role has: a total dispatch over a closed tag set, with
 * the computation somewhere it can be property-tested.
 *
 * The dispatch is bound (`verdict`) because the subject is a computed value the outcomes read fields
 * off; without the binding an arm would see only `command`.
 */
import { arrayOf, at, computed, literal, num, read, str, struct, workflow } from '../../../../scripts/tools/workflow.ts'

/** One surviving mutant, as the report carries it. */
const survivor = struct({
  id: str,
  fileName: str,
  mutatorName: str,
  replacement: str,
  location: struct({
    start: struct({ line: num, column: num }),
    end: struct({ line: num, column: num }),
  }),
})

export default workflow({
  operation: 'admitSurvivorsRun',
  typeId: { namespace: '@systemfsoftware/stryker-js-cli', name: 'SurvivorsAdmission', export: true },
  command: { type: 'AdmitSurvivorsRunInput', from: './survivors.kernel.js' },
  aliases: [{ name: 'SurvivorsRejectReason', literals: ['no-report', 'mismatch'] }],
  decision: {
    union: { name: 'SurvivorsAdmission' },
    variants: [
      { class: 'Admitted', tag: 'Admitted', fields: { survivors: arrayOf(survivor) } },
      { class: 'NoSurvivors', tag: 'NoSurvivors', fields: {} },
    ],
  },
  error: {
    variants: [
      {
        class: 'SurvivorsRejection',
        tag: 'SurvivorsRejection',
        fields: { reason: literal('no-report', 'mismatch'), remediation: str },
      },
    ],
  },
  dispatch: {
    on: computed('admissionVerdict', './survivors.kernel.js', at('command')),
    bind: 'verdict',
    arms: [
      {
        pattern: { kind: 'reject' },
        channel: 'left',
        construct: 'SurvivorsRejection',
        with: { reason: read('verdict', 'reason'), remediation: read('verdict', 'remediation') },
      },
      { pattern: { kind: 'no-survivors' }, channel: 'right', construct: 'NoSurvivors', with: {} },
      {
        pattern: { kind: 'admit' },
        channel: 'right',
        construct: 'Admitted',
        with: { survivors: read('verdict', 'survivors') },
      },
    ],
  },
})
