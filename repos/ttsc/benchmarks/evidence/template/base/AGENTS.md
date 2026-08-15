# AGENTS.md

`{{name}}` is a TypeScript monorepo that implements a documented requirement set as a NestJS backend, a generated SDK, and a React frontend. The requirement documents under `docs/analysis/` are the specification; everything under `packages/` exists to realize them.

## Attitude

Follow the literal request; it is the contract, not a hint at what the user "really" wants.

- **Scope is the user's to widen.** Reinterpret the goal, weigh alternatives, or expand the task only on an explicit hand-off. Take a confident, specific ask as given.
- **Fidelity binds the goal, not the effort.** Within that goal, act with full initiative: do the substeps it needs, verify your work, surface what you notice. Literal scope is no excuse for passive execution.
- **Choose the principled course.** Decide from verified facts, correctness, and the durable consequence. Time and difficulty are reasons to investigate more carefully, never reasons to settle for a shortcut or a weaker standard.
- **The documents are the specification.** A requirement stated under `docs/analysis/` binds whether or not any code refers to it. When code and a document disagree, the document is right until the user says otherwise.
- **The measurement boundary is frozen.** Do not edit agent instructions or add policy overrides, package names or scripts, existing dependency specifiers, package-manager or engine resolution controls, workspace routing, shared lint or compiler configuration, or fixed gate runners. Run the named gates exactly as provided.
- **Never claim what you have not verified.** A build or test claim means the command ran and you read its output. Those commands are layer gates, not proof that every requirement is realized.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.

## Skills

Durable project conventions live under `.agents/skills/`. Read the linked skill when its topic applies; each skill indexes its own topic documents.

### Project Outline

Workspace layout, package boundaries, generated artifacts, build order, and canonical commands, `.agents/skills/project/SKILL.md`. Read when orienting in the repository or choosing a build, lint, or test command.

### Requirements

What the documents under `docs/analysis/` contain, how they are organized, and how to read a requirement so nothing in it is missed, `.agents/skills/requirements/SKILL.md`. Read before implementing anything and again when checking whether the specification is realized.

### Backend

The schema, the public API contract, the business logic, and the tests, `.agents/skills/backend/SKILL.md`. Its own index links the topic document for each layer. Read the index before any backend work, then the topic for the layer you are touching.

### Frontend

The stack, how the generated SDK is consumed, screen structure, required interface states, and the review a screen must pass, `.agents/skills/frontend/SKILL.md`. Read before writing or changing a page or a component.

### API Contract And SDK

Which paths under `packages/api` are authored contract sources, which are generated SDK output, who owns regeneration, and how consumers use it, `.agents/skills/api/SKILL.md`. Read before editing or importing from the package or tracing where a contract comes from.
