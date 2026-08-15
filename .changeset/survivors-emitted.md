---
'@systemfsoftware/stryker-js-cli': major
---

`survivors.workflow.ts` is now emitted from a declaration, and `AdmitSurvivorsRunInput` moved to `survivors.kernel.js` — import it from there. The emitted cell also exports a `SurvivorsAdmissionWorkflow` type. `SurvivorsAdmissionTypeId`, `SurvivorsRejectReason`, `Admitted`, `NoSurvivors`, `SurvivorsAdmission`, `SurvivorsRejection` and `admitSurvivorsRun` are unchanged.

The admission's guard chain moved into `admissionVerdict`, a kernel classifier returning `reject` / `no-survivors` / `admit`; the workflow assigns channels to those three. All 69 existing tests pass unchanged, including the six that pin each rejection's remediation prose.

Two measured findings shaped it. Emitting `Match.when({ kind: 'admit' }, …)` left a surviving mutant: `ObjectLiteral` widens the pattern to `{}`, which by elimination the last arm before `Match.exhaustive` only ever reaches with `admit` values, so the mutant is equivalent and unkillable — score 95.83 against a 100 break threshold. The emitter now picks `Match.tag` or `Match.discriminator`, whose tag is a _string_ argument with no object literal to widen; the gate is back to 100 with zero survivors.

Second, the relocation moved decisions out of the mutation surface — `mutate` is `src/survivors.workflow.ts` and `guard-mutate-scope` forbids enrolling a kernel — dropping the mutant population from 47 to 24. Exactly one new law compensates: `∀r_SurvivorsSourced_→MismatchReject`, that provenance pre-empts emptiness (KTD7). Five further laws were written and deleted after measuring that the existing suite already fails on each of their defects; hoisting the emptiness check above the provenance check is the one defect that leaves the whole pre-existing suite green.
