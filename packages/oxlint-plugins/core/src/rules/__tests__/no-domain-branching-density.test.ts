import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { DEFAULT_MAX_COMPLEXITY } from '../no-domain-branching-density.config.js'
import { noDomainBranchingDensity } from '../no-domain-branching-density.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const FIX =
  `Extract the domain branching into functions of one concern each until every function fits the ceiling; branching outside Workflow.make bodies has no legal home, and code that defends nothing gets deleted, not rehoused.`

const expectedMaxError = (name: string, complexity: number, max: number) => ({
  messageId: 'maxComplexity' as const,
  data: {
    name: `Function '${name}'`,
    expected: `a cyclomatic complexity of at most ${max}`,
    actual: `a cyclomatic complexity of ${complexity}`,
    fix: FIX,
  },
})

const WITH_WORKFLOW_IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'\n`

ruleTester.run('no-domain-branching-density', noDomainBranchingDensity, {
  valid: [
    {
      name: 'Should_Allow_Function_When_Empty',
      code: `
        function noop() {}
        const empty = () => {}
      `,
    },
    {
      name: 'Should_Allow_Function_When_Complexity_Below_Ceiling',
      code: `
        function decide(a: boolean, b: boolean) {
          if (a) return 1
          if (b) return 2
          return 3
        }
      `,
      options: [{ max: 4 }],
    },
    {
      name: 'Should_Allow_Function_When_Complexity_At_Ceiling',
      code: `
        function decide(a: boolean, b: boolean, c: boolean) {
          if (a) return 1
          if (b) return 2
          if (c) return 3
          return 4
        }
      `,
      options: [{ max: 4 }],
    },
    {
      name: 'Should_Allow_Function_When_Complexity_At_Default_Ceiling',
      code: `
        function big(a: boolean, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean) {
          if (a) return 1
          if (b) return 2
          if (c) return 3
          if (d) return 4
          if (e) return 5
          if (f) return 6
          return 7
        }
      `,
    },
    {
      name: 'Should_Count_Case_Clauses_As_Decisions',
      code: `
        function grade(n: number) {
          switch (n) {
            case 1: return 'one'
            case 2: return 'two'
            default: return 'many'
          }
        }
      `,
      options: [{ max: 4 }],
    },
    {
      name: 'Should_Count_Logical_And_As_Decision',
      code: `
        const pick = (a: boolean, b: boolean) => a && b
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Count_Logical_Or_As_Decision',
      code: `
        const pick = (a: boolean, b: boolean) => a || b
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Count_Ternary_As_Decision',
      code: `
        const pick = (a: boolean) => (a ? 1 : 2)
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Count_For_As_Decision',
      code: `
        const sum = (xs: number[]) => {
          let total = 0
          for (const x of xs) {
            if (x > 0) total += x
          }
          return total
        }
      `,
      options: [{ max: 3 }],
    },
    {
      name: 'Should_Count_While_As_Decision',
      code: `
        const busy = (n: number) => {
          while (n > 0) {
            n -= 1
          }
          return n
        }
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Count_DoWhile_As_Decision',
      code: `
        const busy = (n: number) => {
          do {
            n -= 1
          } while (n > 0)
          return n
        }
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Count_Catch_As_Decision',
      code: `
        const attempt = (fn: () => number) => {
          try {
            return fn()
          } catch {
            return 0
          }
        }
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Not_Count_Nested_Function_Decisions_Into_Enclosing',
      code: `
        const outer = (a: boolean) => {
          if (a) return 0
          const inner = (b: boolean) => {
            if (b) return 1
            return 2
          }
          return inner(a)
        }
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Exempt_Function_When_Inside_Inline_Make_Body',
      code: `
        ${WITH_WORKFLOW_IMPORT}
        const cell = Workflow.make((input: number) => {
          if (input > 1) return input + 1
          if (input > 2) return input + 2
          if (input > 3) return input + 3
          if (input > 4) return input + 4
          if (input > 5) return input + 5
          if (input > 6) return input + 6
          if (input > 7) return input + 7
          if (input > 8) return input + 8
          if (input > 9) return input + 9
          if (input > 10) return input + 10
          if (input > 11) return input + 11
          return input
        })
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Exempt_Named_Module_Function_Passed_To_Make',
      code: `
        ${WITH_WORKFLOW_IMPORT}
        function decide(input: number): number {
          if (input > 1) return input + 1
          if (input > 2) return input + 2
          if (input > 3) return input + 3
          if (input > 4) return input + 4
          if (input > 5) return input + 5
          if (input > 6) return input + 6
          if (input > 7) return input + 7
          if (input > 8) return input + 8
          if (input > 9) return input + 9
          if (input > 10) return input + 10
          if (input > 11) return input + 11
          return input
        }
        const cell = Workflow.make(decide)
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Exempt_Nested_Function_Inside_Make_Body',
      code: `
        ${WITH_WORKFLOW_IMPORT}
        const cell = Workflow.make((input: number) => {
          const helper = (n: number) => {
            if (n > 1) return 1
            if (n > 2) return 2
            if (n > 3) return 3
            if (n > 4) return 4
            if (n > 5) return 5
            if (n > 6) return 6
            if (n > 7) return 7
            if (n > 8) return 8
            if (n > 9) return 9
            if (n > 10) return 10
            if (n > 11) return 11
            return n
          }
          return helper(input)
        })
      `,
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Exempt_Test_File_When_Filename_Matches',
      code: `
        function exercise(a: boolean, b: boolean, c: boolean) {
          if (a) return 1
          if (b) return 2
          if (c) return 3
          if (a && b) return 4
          if (a || b) return 5
          if (c) return 6
          for (let i = 0; i < 3; i += 1) {
            if (i === a) return i
          }
          return 0
        }
      `,
      filename: 'src/decide.test.ts',
      options: [{ max: 2 }],
    },
    {
      name: 'Should_Exempt_Spec_File_When_Filename_Matches',
      code: `
        export const run = () => {
          if (true) return 1
          if (true) return 2
          if (true) return 3
          return 4
        }
      `,
      filename: 'decide.spec.tsx',
      options: [{ max: 2 }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Function_When_Over_Ceiling',
      code: `
        function decide(a: boolean, b: boolean, c: boolean) {
          if (a) return 1
          if (b) return 2
          if (c) return 3
          return 4
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('decide', 4, 3)],
    },
    {
      name: 'Should_Report_Arrow_Function_By_Binding_Name',
      code: `
        const pick = (a: boolean, b: boolean, c: boolean) => {
          if (a) return 1
          if (b) return 2
          if (c) return 3
          return 4
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('pick', 4, 3)],
    },
    {
      name: 'Should_Report_Anonymous_Callback_As_Anonymous',
      code: `
        const run = (fn: (n: number) => number) => fn(1)
        run((n: number) => {
          if (n > 1) return 1
          if (n > 2) return 2
          if (n > 3) return 3
          return 4
        })
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('<anonymous>', 4, 3)],
    },
    {
      name: 'Should_Report_Class_Method_By_Name',
      code: `
        class Calculator {
          run(a: boolean, b: boolean, c: boolean) {
            if (a) return 1
            if (b) return 2
            if (c) return 3
            return 4
          }
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('run', 4, 3)],
    },
    {
      name: 'Should_Report_Object_Method_By_Key',
      code: `
        const service = {
          dispatch(a: boolean, b: boolean, c: boolean) {
            if (a) return 1
            if (b) return 2
            if (c) return 3
            return 4
          },
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('dispatch', 4, 3)],
    },
    {
      name: 'Should_Report_Nested_Function_Separately_From_Enclosing',
      code: `
        const outer = (a: boolean) => {
          const inner = (b: boolean, c: boolean, d: boolean) => {
            if (b) return 1
            if (c) return 2
            if (d) return 3
            return 4
          }
          return inner(a)
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('inner', 4, 3)],
    },
    {
      name: 'Should_Report_When_Case_Clauses_Exceed_Ceiling',
      code: `
        function grade(n: number) {
          switch (n) {
            case 1: return 'one'
            case 2: return 'two'
            default: return 'many'
          }
        }
      `,
      options: [{ max: 3 }],
      errors: [expectedMaxError('grade', 4, 3)],
    },
    {
      name: 'Should_Report_When_Logical_Chain_Exceeds_Ceiling',
      code: `
        const pick = (a: boolean, b: boolean, c: boolean) => a && b || c
      `,
      options: [{ max: 2 }],
      errors: [expectedMaxError('pick', 3, 2)],
    },
    {
      name: 'Should_Report_Ternary_Chain_Exceeds_Ceiling',
      code: `
        const pick = (a: boolean, b: boolean) => (a ? (b ? 1 : 2) : 3)
      `,
      options: [{ max: 2 }],
      errors: [expectedMaxError('pick', 3, 2)],
    },
    {
      name: 'Should_Report_When_Catch_Adds_Decision',
      code: `
        function attempt(fn: () => number) {
          try {
            if (fn()) return 1
            return 2
          } catch {
            return 0
          }
        }
      `,
      options: [{ max: 2 }],
      errors: [expectedMaxError('attempt', 3, 2)],
    },
    {
      name: 'Should_Report_When_Make_Callee_Is_Not_The_Workflow_Import',
      code: `
        const Workflow = { make: (fn: (n: number) => number) => fn }
        const cell = Workflow.make((input: number) => {
          if (input > 1) return input + 1
          if (input > 2) return input + 2
          if (input > 3) return input + 3
          return input
        })
      `,
      options: [{ max: 2 }],
      errors: [expectedMaxError('<anonymous>', 4, 2)],
    },
    {
      name: 'Should_Report_Function_Over_Default_Ceiling',
      code: (() => {
        const params = Array.from({ length: DEFAULT_MAX_COMPLEXITY + 1 }, (_, i) => `a${i}: boolean`).join(', ')
        const branches = Array.from(
          { length: DEFAULT_MAX_COMPLEXITY },
          (_, i) => `          if (a${i}) return ${i}`,
        ).join('\n')
        return `
        function big(${params}) {
${branches}
          return ${DEFAULT_MAX_COMPLEXITY + 1}
        }
      `
      })(),
      errors: [expectedMaxError('big', DEFAULT_MAX_COMPLEXITY + 1, DEFAULT_MAX_COMPLEXITY)],
    },
  ],
})
