---
title: A template builds, tests and deploys after being copied out alone, with published dependencies and no monorepo tooling
applies_when:
  - creating or changing a project template, starter or scaffold
  - adding a devDependency, lint preset or config to a template
  - a template references a workspace package
tags: [composition, template, isolation, scaffold]
---

A template is what someone receives as their own repository, so it must work with nothing around it:

- every dependency is a published version, never `workspace:*`, a path, or a catalog reference;
- no monorepo tooling: no shared lint preset, tsconfig base, test harness or hook package that exists only for the workspace; standard configs inline;
- one obvious `dev`, `build` and `deploy` script;
- the UI and SDK it depends on are published packages.

younna-ai's app template depended on the monorepo's oxlint preset, tsconfig, vitest and gherkin packages and had only `typecheck` and `lint` scripts. It could not be deployed by anyone who received it.

Gate: CI job `template-isolation`. It copies the template into an empty directory outside the workspace, installs from the registry, then runs build, test and a preview deploy. Any workspace reference fails the install.
