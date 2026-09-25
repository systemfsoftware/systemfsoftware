---
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Plan: Author Compound Pack for effect-schema-law and effect-schema-vite

## Goal Capsule

- **Objective**: Author a new production compound pack `compound-packs/schema-laws/` codifying architectural laws, property-testing standards, constructive generation rules, and test-placement requirements derived from `@systemfsoftware/effect-schema-law` and `@systemfsoftware/effect-schema-vite`. Register the pack in `.compound-engineering/config.yaml` and update repository documentation (`AGENTS.md`, `CONCEPTS.md`) to establish these standards across the workspace.
- **Means**: Create modular, prescriptive rule documents conforming to the Compound Pack specification (`title`, `applies_when`, situational tagging, code examples, clear harm and check mechanisms), wire it into the CE packs configuration, and verify via repository gates (`pnpm check:local`).
- **Authority**: System principles in `CONSTITUTION.md` (Article I & III), `packages/schema/effect-schema-law`, `packages/schema/effect-schema-vite`, and `oxlint-plugin-effect-schema`.
- **Stop Conditions**: A gate failure in `pnpm check:local`, invalid pack frontmatter, or git conflicts.

## Product Contract

### Requirements

- **R1: Pack Structure & Discovery**: Establish `compound-packs/schema-laws/` with a descriptive `README.md` and top-level `.md` rule files containing valid YAML frontmatter (`title` and `applies_when`).
- **R2: Core Schema Laws (Round-trip & Encode Stability)**: Document the dual codec law (`RuleOfSchemas`), requiring exported domain schemas to preserve round-trip identity (`decode(encode(x)) === x`) and encode stability.
- **R3: Automated Law Injection with Vite**: Prescribe automated suite generation via `@systemfsoftware/effect-schema-vite` (`inlineSchemaTests()`), scanning exported schemas and writing `schema-laws.test.ts`.
- **R4: Recursive Schema Ceilings & Budgets**: Mandate explicit `recursionBudget` annotations or derivations for recursive schema trees (`Schema.suspend`), preventing superlinear generation explosions and verifying bounded depth.
- **R5: Rejection & Refusal Testing Beside Laws**: Prescribe that generated acceptance laws alone do not prove rejection; refined schemas must pair with explicit refusal/negative test suites (`*.refusal.test.ts` or `*.property.test.ts`).
- **R6: Constructive Generation over Discard Traps**: Enforce constructive arbitrary derivations (`arbitraryConstraint`, bounded primitives) for filtered schemas, preventing fast-check exhaustion (`Too many pre-condition failures`).
- **R7: Schema Export & Declaration Hygiene**: Prescribe schema placement in `*.schema.ts` or `*.workflow.ts`, banning raw codec constants (`S.encodeSync`, `S.decodeSync`) and re-exports from schema modules.
- **R8: Pack Registration & Governance**: Register `compound-packs/schema-laws` in `.compound-engineering/config.yaml`, update `AGENTS.md` and `CONCEPTS.md` with links and governance rules.

## Planning Contract

### Key Technical Decisions (KTDs)

- **KTD 1: Pack Identifier**: Name the pack `schema-laws` (`compound-packs/schema-laws/`). Matches domain precision beside `cell-architecture` and `boundary-testing`.
- **KTD 2: Separation of Concerns Across Rule Files**:
  1. `README.md`: Pack overview and taxonomy.
  2. `dual-codec-roundtrip-laws.md`: Round-trip identity & encode stability laws (`RuleOfSchemas`).
  3. `vite-automated-law-injection.md`: Automating schema property tests using `inlineSchemaTests()` in `vitest.config.ts`.
  4. `recursive-schema-budgets.md`: Handling recursive structures with `Schema.suspend` and `recursionBudget` derivation hooks.
  5. `refusals-beside-codec-laws.md`: Why generated laws are tautological for rejection and why negative tests are required.
  6. `constructive-arbitrary-derivation.md`: Avoiding fast-check rejection traps on filtered schemas.
  7. `schema-declaration-and-export-hygiene.md`: Pure schema declarations in `*.schema.ts`, no runtime codec side-effects.
- **KTD 3: Configuration Update**: Add `- source: compound-packs/schema-laws` to `.compound-engineering/config.yaml`.
- **KTD 4: Doctrine Alignment**: Add references to `compound-packs/schema-laws` in `AGENTS.md` Directory Map and `CONCEPTS.md`.

## Implementation Units

### U1: Create `compound-packs/schema-laws/README.md`

Author the pack entry point explaining the laws governing Effect Schema definitions and verification.

### U2: Author Pack Rule Files

Author the 6 focused, prescriptive rule files with valid `title`, `applies_when`, code blocks (`WRONG` vs `RIGHT`), and gate citations.

### U3: Wire Pack into `.compound-engineering/config.yaml`

Add `- source: compound-packs/schema-laws` to the repository configuration.

### U4: Update Repo Doctrine (`AGENTS.md` and `CONCEPTS.md`)

Record the pack in the directory map of `AGENTS.md` and document the schema law concepts in `CONCEPTS.md`.

### U5: Local Verification & Linting

Run `pnpm check:local` across the monorepo to ensure zero regressions, clean formatting, and valid exports.

## Verification Contract

- `git status` confirms new rule files and config updates.
- `pnpm check:local` exits 0 (clean lint, types, build, formatting).
- Rule files verified to have valid frontmatter (`title` and `applies_when`).

## Definition of Done

- All 6 rule files created in `compound-packs/schema-laws/` with valid YAML frontmatter.
- `.compound-engineering/config.yaml` updated and valid.
- `AGENTS.md` and `CONCEPTS.md` updated.
- `pnpm check:local` passes cleanly.
