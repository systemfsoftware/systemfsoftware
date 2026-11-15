# @systemfsoftware/oxlint-plugin-test-discipline@7.0.0

A test is end-to-end by what it imports, not by a role its package declares. The `e2e` role is removed, and a leftover `role: 'e2e'` setting is ignored. An `effect-e2e/runner` import no longer selects the e2e lane.

A Feature is in the e2e lane when no value it imports reaches the repository's own code, checked both in its own imports and in the modules it imports from its own `tests/`. The repository's own code is any of these:

- a relative import out of `tests/`;
- a `#` subpath import;
- the package's own name;
- an import that resolves to no package installed from a registry (a workspace link, or a name nothing installs);
- a dynamic import whose target cannot be read, or a local module that cannot be read or parsed.

Re-exports, `import()`, `require()`, an import of the `module` builtin's `createRequire` (or the whole builtin), and any mention of `createRequire` or `getBuiltinModule` all count. A module reached only through a type import counts as a type reach. Node builtins, with or without `node:`, never do. A `package.json` inside another package's `tests/` directory does not make a package. A local module is followed when it is TypeScript or JavaScript and its real path stays in `tests/`; a symlink out of `tests/` is a reach.

`test-suffix-outside-src` now asks for `<subject>.e2e.ts` on such a Feature, so a black-box test named `*.integration.test.ts` is refused. An `.e2e.ts` Feature that reaches the repository's code is asked for `.integration.test.ts`. `e2e-tier-placement` reports three cases:

- an e2e Feature in a package that ships code (a `src/` directory, a non-empty `exports`, or `main`, `module` or `bin`);
- an e2e Feature that names the repository's code even as a type;
- an `.e2e.ts` file outside `tests/` or inside `tests/__fixtures__/`, and an `.e2e.test.ts` or `.e2e.spec.ts` file under `src/`.

In the repository that builds the Gherkin harness, the harness is the repository's own code, so no Feature there is end-to-end.

To migrate, delete `role: 'e2e'` from the package's lint settings. Write each end-to-end test as a `makeFeature` Feature in `tests/<subject>.e2e.ts` of a package that ships nothing.

The oxlint configs and plugins now require oxlint ~1.93.0 and oxlint-tsgolint 7.0.2006 (and @effect/tsgo ^0.69.0 where they depend on it). The other packages only build and lint with the new tools; what they publish is unchanged.
