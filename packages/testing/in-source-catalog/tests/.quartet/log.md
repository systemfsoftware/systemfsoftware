## 2026-09-03T19:38:07.093Z — sabotage quartet

Harness: `src/internal/decide-registry-slot.workflow.ts`. Each direction mutates a scratch copy under `src/.quartet-scratch/` (removed after the run) and runs `pnpm --filter @systemfsoftware/in-source-catalog exec vitest run <scratch-entry>`; the scratch copy is collected because the package includes in-source tests from `src/**/*.ts`.

### 1. refuse-arm deletion — RED

- Mutation: Match.when refuse arm returning SlotRefused for '.env' slots (present); refuse arm deleted, reserved env-file inputs fall through to tier branches (absent).
- Failing law: `∀decideRegistrySlot_refuses_reserved`
- Result: RED (expected failure)

```
 FAIL  src/.quartet-scratch/quartet-refuse-arm.workflow.ts > ∀decideRegistrySlot_refuses_reserved
Error: Property failed after 1 tests
{ seed: -436967349, path: "0:0:0", endOnFailure: true }
Counterexample: [DecideRegistrySlotCommand({"_tag":"DecideRegistrySlotCommand","tenant":"widgets","tier":"primary","slot":" /secrets.env"})]
Shrunk 2 time(s)
Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
 ❯ buildError ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2462:16
 ❯ throwIfFailed ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2469:8
 ❯ reportRunDetails ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2485:14
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2542:7
Caused by: Error: Property failed by returning false
 ❯ Property.run ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:1323:66
 ❯ runIt ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2505:24
 ❯ check ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2537:204
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2540:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 2. production literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the production (primary tier) branch; table expectation left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registr', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/lib/registr",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 3. published table literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the published table expectation; production branch left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registry', …(1) } to strictly equal { root: '/var/lib/registr', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registr",
+   "root": "/var/lib/registry",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 4. inverse tier swap — RED

- Mutation: inverse lookup '===' (result maps back to its own tier input); inverse lookup '!==' (primary/secondary tiers invert).
- Failing law: `decideRegistrySlot_round_trips_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/opt/registry', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/opt/registry",
  }
 ❯ src/laws.ts:57:41
     55|         const again = run(roundTrip(result))
     56|         expect(refused(again)).toBe(false)
     57|         expect(testCase.project(again)).toStrictEqual(testCase.project…
       |                                         ^
     58|       })
     59|     }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 5. restoration (unmutated harness) — GREEN

- GREEN (restoration passes): Tests 5 passed (5)
- Laws observed passing: `∀decideRegistrySlot_refuses_reserved`, `decideRegistrySlot_publishes_primary`, `decideRegistrySlot_publishes_secondary`, `decideRegistrySlot_round_trips_primary`, `decideRegistrySlot_round_trips_secondary`

```
RUN  v4.1.10 /home/ryan/Documents/projects/God/systemfsoftware.worktrees/delete-to-tautologies/packages/testing/in-source-catalog
✓ src/internal/decide-registry-slot.workflow.ts > ∀decideRegistrySlot_refuses_reserved 4ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_primary 1ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_secondary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_primary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_secondary 0ms
Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  19:38:06
  Duration  320ms (transform 39ms, setup 148ms, import 78ms, tests 6ms, environment 0ms)
```

## 2026-09-03T19:38:37.636Z — sabotage quartet

Harness: `src/internal/decide-registry-slot.workflow.ts`. Each direction mutates a scratch copy under `src/.quartet-scratch/` (removed after the run) and runs `pnpm --filter @systemfsoftware/in-source-catalog exec vitest run <scratch-entry>`; the scratch copy is collected because the package includes in-source tests from `src/**/*.ts`.

### 1. refuse-arm deletion — RED

- Mutation: Match.when refuse arm returning SlotRefused for '.env' slots (present); refuse arm deleted, reserved env-file inputs fall through to tier branches (absent).
- Failing law: `∀decideRegistrySlot_refuses_reserved`
- Result: RED (expected failure)

```
 FAIL  src/.quartet-scratch/quartet-refuse-arm.workflow.ts > ∀decideRegistrySlot_refuses_reserved
Error: Property failed after 1 tests
{ seed: -1498367227, path: "0:0:0", endOnFailure: true }
Counterexample: [DecideRegistrySlotCommand({"_tag":"DecideRegistrySlotCommand","tenant":"widgets","tier":"primary","slot":" /secrets.env"})]
Shrunk 2 time(s)
Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
 ❯ buildError ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2462:16
 ❯ throwIfFailed ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2469:8
 ❯ reportRunDetails ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2485:14
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2542:7
Caused by: Error: Property failed by returning false
 ❯ Property.run ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:1323:66
 ❯ runIt ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2505:24
 ❯ check ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2537:204
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2540:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 2. production literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the production (primary tier) branch; table expectation left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registr', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/lib/registr",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 3. published table literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the published table expectation; production branch left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registry', …(1) } to strictly equal { root: '/var/lib/registr', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registr",
+   "root": "/var/lib/registry",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 4. inverse tier swap — RED

- Mutation: inverse lookup '===' (result maps back to its own tier input); inverse lookup '!==' (primary/secondary tiers invert).
- Failing law: `decideRegistrySlot_round_trips_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/opt/registry', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/opt/registry",
  }
 ❯ src/laws.ts:57:41
     55|         const again = run(roundTrip(result))
     56|         expect(refused(again)).toBe(false)
     57|         expect(testCase.project(again)).toStrictEqual(testCase.project…
       |                                         ^
     58|       })
     59|     }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 5. restoration (unmutated harness) — GREEN

- GREEN (restoration passes): Tests 5 passed (5)
- Laws observed passing: `∀decideRegistrySlot_refuses_reserved`, `decideRegistrySlot_publishes_primary`, `decideRegistrySlot_publishes_secondary`, `decideRegistrySlot_round_trips_primary`, `decideRegistrySlot_round_trips_secondary`

```
RUN  v4.1.10 /home/ryan/Documents/projects/God/systemfsoftware.worktrees/delete-to-tautologies/packages/testing/in-source-catalog
✓ src/internal/decide-registry-slot.workflow.ts > ∀decideRegistrySlot_refuses_reserved 4ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_primary 1ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_secondary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_primary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_secondary 0ms
Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  19:38:37
  Duration  327ms (transform 40ms, setup 158ms, import 78ms, tests 7ms, environment 0ms)
```

## 2026-09-03T19:59:11.871Z — sabotage quartet

Harness: `src/internal/decide-registry-slot.workflow.ts`. Each direction mutates a scratch copy under `src/.quartet-scratch/` (removed after the run) and runs `pnpm --filter @systemfsoftware/in-source-catalog exec vitest run <scratch-entry>`; the scratch copy is collected because the package includes in-source tests from `src/**/*.ts`.

### 1. refuse-arm deletion — RED

- Mutation: Match.when refuse arm returning SlotRefused for '.env' slots (present); refuse arm deleted, reserved env-file inputs fall through to tier branches (absent).
- Failing law: `∀decideRegistrySlot_refuses_reserved`
- Result: RED (expected failure)

```
 FAIL  src/.quartet-scratch/quartet-refuse-arm.workflow.ts > ∀decideRegistrySlot_refuses_reserved
Error: Property failed after 1 tests
{ seed: -2100967279, path: "0:0:0", endOnFailure: true }
Counterexample: [DecideRegistrySlotCommand({"_tag":"DecideRegistrySlotCommand","tenant":"widgets","tier":"primary","slot":" /secrets.env"})]
Shrunk 2 time(s)
Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
 ❯ buildError ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2462:16
 ❯ throwIfFailed ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2469:8
 ❯ reportRunDetails ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2485:14
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2542:7
Caused by: Error: Property failed by returning false
 ❯ Property.run ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:1323:66
 ❯ runIt ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2505:24
 ❯ check ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2537:204
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2540:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 2. production literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the production (primary tier) branch; table expectation left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registr', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/lib/registr",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 3. published table literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the published table expectation; production branch left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registry', …(1) } to strictly equal { root: '/var/lib/registr', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registr",
+   "root": "/var/lib/registry",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 4. inverse tier swap — RED

- Mutation: inverse lookup '===' (result maps back to its own tier input); inverse lookup '!==' (primary/secondary tiers invert).
- Failing law: `decideRegistrySlot_round_trips_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/opt/registry', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/opt/registry",
  }
 ❯ src/laws.ts:57:41
     55|         const again = run(roundTrip(result))
     56|         expect(refused(again)).toBe(false)
     57|         expect(testCase.project(again)).toStrictEqual(testCase.project…
       |                                         ^
     58|       })
     59|     }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 5. restoration (unmutated harness) — GREEN

- GREEN (restoration passes): Tests 5 passed (5)
- Laws observed passing: `∀decideRegistrySlot_refuses_reserved`, `decideRegistrySlot_publishes_primary`, `decideRegistrySlot_publishes_secondary`, `decideRegistrySlot_round_trips_primary`, `decideRegistrySlot_round_trips_secondary`

```
RUN  v4.1.10 /home/ryan/Documents/projects/God/systemfsoftware.worktrees/delete-to-tautologies/packages/testing/in-source-catalog
✓ src/internal/decide-registry-slot.workflow.ts > ∀decideRegistrySlot_refuses_reserved 5ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_primary 1ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_secondary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_primary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_secondary 0ms
Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  19:59:11
  Duration  399ms (transform 91ms, setup 181ms, import 123ms, tests 7ms, environment 0ms)
```

## 2026-09-03T20:00:17.680Z — sabotage quartet

Harness: `src/internal/decide-registry-slot.workflow.ts`. Each direction mutates a scratch copy under `src/.quartet-scratch/` (removed after the run) and runs `pnpm --filter @systemfsoftware/in-source-catalog exec vitest run <scratch-entry>`; the scratch copy is collected because the package includes in-source tests from `src/**/*.ts`.

### 1. refuse-arm deletion — RED

- Mutation: Match.when refuse arm returning SlotRefused for '.env' slots (present); refuse arm deleted, reserved env-file inputs fall through to tier branches (absent).
- Failing law: `∀decideRegistrySlot_refuses_reserved`
- Result: RED (expected failure)

```
 FAIL  src/.quartet-scratch/quartet-refuse-arm.workflow.ts > ∀decideRegistrySlot_refuses_reserved
Error: Property failed after 1 tests
{ seed: 1963512301, path: "0:0:0", endOnFailure: true }
Counterexample: [DecideRegistrySlotCommand({"_tag":"DecideRegistrySlotCommand","tenant":"widgets","tier":"primary","slot":" /secrets.env"})]
Shrunk 2 time(s)
Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
 ❯ buildError ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2462:16
 ❯ throwIfFailed ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2469:8
 ❯ reportRunDetails ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2485:14
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2542:7
Caused by: Error: Property failed by returning false
 ❯ Property.run ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:1323:66
 ❯ runIt ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2505:24
 ❯ check ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2537:204
 ❯ Module.assert ../../../node_modules/.pnpm/fast-check@4.9.0/node_modules/fast-check/lib/fast-check.js:2540:14
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 2. production literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the production (primary tier) branch; table expectation left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registr', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/lib/registr",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 3. published table literal typo — RED

- Mutation: '/var/lib/registry' -> '/var/lib/registr' in the published table expectation; production branch left at '/var/lib/registry'.
- Failing law: `decideRegistrySlot_publishes_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/lib/registry', …(1) } to strictly equal { root: '/var/lib/registr', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registr",
+   "root": "/var/lib/registry",
  }
 ❯ src/laws.ts:46:40
     44|       const result = run(testCase.input)
     45|       expect(refused(result)).toBe(false)
     46|       expect(testCase.project(result)).toStrictEqual(testCase.expect)
       |                                        ^
     47|     })
     48|   }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 4. inverse tier swap — RED

- Mutation: inverse lookup '===' (result maps back to its own tier input); inverse lookup '!==' (primary/secondary tiers invert).
- Failing law: `decideRegistrySlot_round_trips_primary`
- Result: RED (expected failure)

```
AssertionError: expected { root: '/var/opt/registry', …(1) } to strictly equal { root: '/var/lib/registry', …(1) }
- Expected
+ Received
  {
    "readOnly": true,
-   "root": "/var/lib/registry",
+   "root": "/var/opt/registry",
  }
 ❯ src/laws.ts:57:41
     55|         const again = run(roundTrip(result))
     56|         expect(refused(again)).toBe(false)
     57|         expect(testCase.project(again)).toStrictEqual(testCase.project…
       |                                         ^
     58|       })
     59|     }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

### 5. restoration (unmutated harness) — GREEN

- GREEN (restoration passes): Tests 5 passed (5)
- Laws observed passing: `∀decideRegistrySlot_refuses_reserved`, `decideRegistrySlot_publishes_primary`, `decideRegistrySlot_publishes_secondary`, `decideRegistrySlot_round_trips_primary`, `decideRegistrySlot_round_trips_secondary`

```
RUN  v4.1.10 /home/ryan/Documents/projects/God/systemfsoftware.worktrees/delete-to-tautologies/packages/testing/in-source-catalog
✓ src/internal/decide-registry-slot.workflow.ts > ∀decideRegistrySlot_refuses_reserved 5ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_primary 1ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_publishes_secondary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_primary 0ms
✓ src/internal/decide-registry-slot.workflow.ts > decideRegistrySlot_round_trips_secondary 0ms
Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  20:00:17
  Duration  392ms (transform 94ms, setup 155ms, import 137ms, tests 7ms, environment 0ms)
```
